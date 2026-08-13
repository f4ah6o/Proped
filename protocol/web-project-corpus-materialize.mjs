import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { corpusHasExternalTargets, corpusProjectPaths } from "./web-project-corpus.mjs";

function fail(message, details = {}) {
  const error = new Error(`Web project corpus materialization: ${message}`);
  error.code = details.code ?? "corpus_materialization_failed";
  Object.assign(error, details);
  throw error;
}

function gitEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.startsWith("GIT_CONFIG_")) delete environment[key];
  }
  for (const key of [
    "GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_SSH", "GIT_SSH_COMMAND", "GIT_ASKPASS", "SSH_ASKPASS", "GIT_EXEC_PATH",
  ]) delete environment[key];
  environment.GIT_TERMINAL_PROMPT = "0";
  environment.GIT_CONFIG_NOSYSTEM = "1";
  environment.GIT_CONFIG_GLOBAL = os.devNull;
  environment.GCM_INTERACTIVE = "Never";
  return environment;
}

function git(args, { cwd = null, allowFailure = false } = {}) {
  const result = spawnSync("git", [
    "-c", "core.hooksPath=/dev/null",
    "-c", "core.fsmonitor=false",
    "-c", "credential.helper=",
    "-c", `core.attributesFile=${os.devNull}`,
    "-c", "submodule.recurse=false",
    "-c", "fetch.recurseSubmodules=false",
    ...args,
  ], {
    cwd: cwd ?? undefined,
    encoding: "utf8",
    shell: false,
    env: gitEnvironment(),
  });
  if (result.error) fail(`git ${args[0]} failed: ${result.error.message}`, { code: "git_unavailable" });
  if (!allowFailure && result.status !== 0) {
    fail(`git ${args[0]} failed with exit ${result.status}: ${(result.stderr || result.stdout).trim()}`, {
      code: "git_command_failed",
      exitCode: result.status,
    });
  }
  return result;
}

function safeCheckoutPath(checkoutRoot, checkoutKey) {
  const root = path.resolve(checkoutRoot);
  const checkout = path.resolve(root, checkoutKey);
  const relative = path.relative(root, checkout);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(`checkout key escapes checkout root: ${checkoutKey}`, { code: "unsafe_checkout_path" });
  }
  return { root, checkout };
}

function gitGroups(corpus) {
  const groups = new Map();
  for (const target of corpus.targets) {
    if (target.source?.kind !== "git") continue;
    const key = target.source.checkout;
    const nestedSources = target.source.nestedSources ?? [];
    const nestedKey = JSON.stringify(nestedSources);
    const existing = groups.get(key);
    if (existing) {
      if (existing.url !== target.source.url || existing.revision !== target.revision || existing.nestedKey !== nestedKey) {
        fail(`checkout ${key} is assigned conflicting git identities`, { code: "checkout_identity_conflict" });
      }
      existing.targetIds.push(target.id);
      existing.targetProjects.push({ id: target.id, project: target.project });
      continue;
    }
    groups.set(key, {
      checkoutKey: key,
      url: target.source.url,
      repository: target.repository,
      revision: target.revision,
      targetIds: [target.id],
      targetProjects: [{ id: target.id, project: target.project }],
      nestedSources,
      nestedKey,
    });
  }
  return [...groups.values()].sort((a, b) => a.checkoutKey.localeCompare(b.checkoutKey));
}

function checkoutState(group, checkoutRoot) {
  const { root, checkout } = safeCheckoutPath(checkoutRoot, group.checkoutKey);
  if (!fs.existsSync(checkout)) {
    return { root, checkout, exists: false, git: false, origin: null, head: null, dirty: null };
  }
  if (!fs.existsSync(path.join(checkout, ".git"))) {
    return { root, checkout, exists: true, git: false, origin: null, head: null, dirty: null };
  }
  const originResult = git(["remote", "get-url", "origin"], { cwd: checkout, allowFailure: true });
  const headResult = git(["rev-parse", "HEAD"], { cwd: checkout, allowFailure: true });
  const statusResult = git(["status", "--porcelain", "--ignore-submodules=all"], { cwd: checkout, allowFailure: true });
  return {
    root,
    checkout,
    exists: true,
    git: true,
    origin: originResult.status === 0 ? originResult.stdout.trim() : null,
    head: headResult.status === 0 ? headResult.stdout.trim() : null,
    dirty: statusResult.status === 0 ? statusResult.stdout.trim().length > 0 : null,
  };
}

function ignoredWorkingTreePaths(checkout) {
  const result = git([
    "status", "--porcelain=v1", "-z", "--ignored=matching", "--untracked-files=normal", "--ignore-submodules=all",
  ], { cwd: checkout, allowFailure: true });
  if (result.status !== 0) fail("ignored working-tree inventory failed", { code: "ignored_inventory_failed" });
  return result.stdout.split("\0")
    .filter((record) => record.startsWith("!! "))
    .map((record) => record.slice(3).replace(/[\\/]+$/, ""))
    .filter(Boolean)
    .sort();
}

function safeGeneratedPath(checkout, relative) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]+/).some((part) => part === ".." || part === ".git")) {
    fail(`unsafe generated path: ${relative}`, { code: "unsafe_generated_path" });
  }
  const absolute = path.resolve(checkout, relative);
  const containment = path.relative(checkout, absolute);
  if (!containment || containment.startsWith("..") || path.isAbsolute(containment)) {
    fail(`generated path escapes checkout: ${relative}`, { code: "unsafe_generated_path" });
  }
  return absolute;
}

function safeNestedCheckoutPath(checkout, relative) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]+/).some((part) => !part || part === "." || part === ".." || part === ".git")) {
    fail(`unsafe nested source path: ${relative}`, { code: "unsafe_nested_source_path" });
  }
  const absolute = path.resolve(checkout, relative);
  const containment = path.relative(checkout, absolute);
  if (!containment || containment.startsWith("..") || path.isAbsolute(containment)) {
    fail(`nested source path escapes checkout: ${relative}`, { code: "unsafe_nested_source_path" });
  }
  let cursor = checkout;
  for (const part of relative.split(/[\\/]+/)) {
    cursor = path.join(cursor, part);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) {
      fail(`nested source path crosses a symlink: ${relative}`, { code: "unsafe_nested_source_symlink" });
    }
  }
  return absolute;
}

function parseGitmodules(text) {
  const entries = [];
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const section = rawLine.match(/^\s*\[submodule\s+"([^"]+)"\]\s*$/);
    if (section) {
      current = { name: section[1], path: null, url: null };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const setting = rawLine.match(/^\s*([A-Za-z0-9._-]+)\s*=\s*(.*?)\s*$/);
    if (!setting) continue;
    if (setting[1] === "path") current.path = setting[2];
    if (setting[1] === "url") current.url = setting[2];
  }
  return entries;
}

function nestedPathDepth(relative) {
  return relative.split("/").length;
}

function orderedNestedSources(group) {
  return [...(group.nestedSources ?? [])].sort((a, b) =>
    nestedPathDepth(a.path) - nestedPathDepth(b.path) || a.path.localeCompare(b.path));
}

function declaredNestedParent(group, nested) {
  return orderedNestedSources(group)
    .filter((candidate) => candidate.path !== nested.path && nested.path.startsWith(`${candidate.path}/`))
    .sort((a, b) => nestedPathDepth(b.path) - nestedPathDepth(a.path) || b.path.localeCompare(a.path))[0] ?? null;
}

function nestedDeclarationContext(parentCheckout, group, nested) {
  const parent = declaredNestedParent(group, nested);
  if (!parent) {
    return { checkout: parentCheckout, revision: group.revision, relativePath: nested.path, label: group.checkoutKey };
  }
  const state = nestedCheckoutState(parentCheckout, parent);
  if (!state.exists || !state.git || state.origin !== parent.url || state.head !== parent.revision || state.dirty !== false) {
    fail(`${group.checkoutKey} nested source ${nested.path} requires verified declared parent ${parent.path}`, {
      code: "nested_parent_unavailable",
      parentPath: parent.path,
    });
  }
  return {
    checkout: state.checkout,
    revision: parent.revision,
    relativePath: nested.path.slice(parent.path.length + 1),
    label: `${group.checkoutKey}:${parent.path}`,
  };
}

function assertNestedSourceDeclaration(parentCheckout, group, nested) {
  const context = nestedDeclarationContext(parentCheckout, group, nested);
  const modules = git(["show", `${context.revision}:.gitmodules`], { cwd: context.checkout, allowFailure: true });
  if (modules.status !== 0) {
    fail(`${context.label} declares nested source ${nested.path} but has no readable .gitmodules`, { code: "nested_gitmodules_missing" });
  }
  const declarations = parseGitmodules(modules.stdout);
  const tree = git(["ls-tree", context.revision, "--", context.relativePath], { cwd: context.checkout, allowFailure: true });
  const match = tree.status === 0 ? tree.stdout.trim().match(/^160000\s+commit\s+([0-9a-f]{40})\t(.+)$/) : null;
  if (!match || match[2] !== context.relativePath) {
    fail(`${context.label} nested source ${nested.path} is not a gitlink at the declaring revision`, { code: "nested_gitlink_missing" });
  }
  if (match[1] !== nested.revision) {
    fail(`${context.label} nested source ${nested.path} revision mismatch`, {
      code: "nested_gitlink_revision_mismatch",
      expected: nested.revision,
      observed: match[1],
    });
  }
  const declared = declarations.find((entry) => entry.path === context.relativePath);
  if (!declared) fail(`${context.label} nested source ${nested.path} is absent from .gitmodules`, { code: "nested_gitmodules_path_missing" });
  if (declared.url !== nested.url) {
    fail(`${context.label} nested source ${nested.path} URL mismatch`, {
      code: "nested_gitmodules_url_mismatch",
      expected: nested.url,
      observed: declared.url,
    });
  }
  return { path: nested.path, url: nested.url, revision: nested.revision };
}

function assertNestedSourceDeclarations(checkout, group) {
  return orderedNestedSources(group).map((nested) => assertNestedSourceDeclaration(checkout, group, nested));
}

function nestedCheckoutState(parentCheckout, nested) {
  const checkout = safeNestedCheckoutPath(parentCheckout, nested.path);
  if (!fs.existsSync(checkout) || !fs.statSync(checkout).isDirectory()) {
    return { checkout, exists: false, git: false, origin: null, head: null, dirty: null };
  }
  const top = git(["rev-parse", "--show-toplevel"], { cwd: checkout, allowFailure: true });
  if (top.status !== 0) return { checkout, exists: true, git: false, origin: null, head: null, dirty: null };
  let realTop;
  let realCheckout;
  try {
    realTop = fs.realpathSync(top.stdout.trim());
    realCheckout = fs.realpathSync(checkout);
  } catch {
    return { checkout, exists: true, git: false, origin: null, head: null, dirty: null };
  }
  if (realTop !== realCheckout) return { checkout, exists: true, git: false, origin: null, head: null, dirty: null };
  const origin = git(["remote", "get-url", "origin"], { cwd: checkout, allowFailure: true });
  const head = git(["rev-parse", "HEAD"], { cwd: checkout, allowFailure: true });
  const status = git(["status", "--porcelain", "--ignore-submodules=all"], { cwd: checkout, allowFailure: true });
  return {
    checkout,
    exists: true,
    git: true,
    origin: origin.status === 0 ? origin.stdout.trim() : null,
    head: head.status === 0 ? head.stdout.trim() : null,
    dirty: status.status === 0 ? status.stdout.trim().length > 0 : null,
  };
}

function verifyNestedSource(parentCheckout, nested, checkoutKey) {
  const state = nestedCheckoutState(parentCheckout, nested);
  const errors = [];
  if (!state.exists) errors.push("nested-checkout-missing");
  else if (!state.git) errors.push("nested-checkout-not-git");
  else {
    if (state.origin !== nested.url) errors.push("nested-origin-mismatch");
    if (state.head !== nested.revision) errors.push("nested-revision-mismatch");
    if (state.dirty === null) errors.push("nested-cleanliness-unavailable");
    else if (state.dirty) errors.push("nested-dirty-checkout");
    if (state.head === nested.revision) {
      try {
        assertNoCheckoutFilters(state.checkout, nested.revision, `${checkoutKey}:${nested.path}`);
      } catch (error) {
        errors.push(error.code === "checkout_filter_unsupported" ? "nested-checkout-filter-unsupported" : "nested-filter-check-failed");
      }
    }
  }
  return {
    path: nested.path,
    url: nested.url,
    revision: nested.revision,
    checkout: state.checkout,
    origin: state.origin,
    head: state.head,
    dirty: state.dirty,
    ok: errors.length === 0,
    errors,
  };
}

export function captureMaterializedWebProjectCorpusState(corpus, { checkoutRoot } = {}) {
  if (!corpusHasExternalTargets(corpus)) {
    return { runtime: "web-project-corpus-state", corpus: corpus.id, checkoutCount: 0, checkouts: [] };
  }
  if (!checkoutRoot) fail("external corpus state capture requires --checkout-root", { code: "checkout_root_required" });
  const root = path.resolve(checkoutRoot);
  const checkouts = gitGroups(corpus).map((group) => {
    const state = checkoutState(group, root);
    if (!state.exists || !state.git || state.origin !== group.url || state.head !== group.revision || state.dirty !== false) {
      fail(`${group.checkoutKey} is not in a verified state for capture`, { code: "state_capture_requires_verified_checkout" });
    }
    const nestedSources = (group.nestedSources ?? []).map((nested) => {
      const nestedState = nestedCheckoutState(state.checkout, nested);
      if (!nestedState.exists || !nestedState.git || nestedState.origin !== nested.url || nestedState.head !== nested.revision || nestedState.dirty !== false) {
        fail(`${group.checkoutKey}:${nested.path} is not in a verified state for capture`, { code: "nested_state_capture_requires_verified_checkout" });
      }
      return {
        path: nested.path,
        ignoredPaths: ignoredWorkingTreePaths(nestedState.checkout),
      };
    });
    return {
      checkoutKey: group.checkoutKey,
      ignoredPaths: ignoredWorkingTreePaths(state.checkout),
      nestedSources,
    };
  });
  return { runtime: "web-project-corpus-state", corpus: corpus.id, checkoutCount: checkouts.length, checkouts };
}

function removeNewIgnoredPaths(checkout, baselinePaths) {
  const before = new Set(baselinePaths ?? []);
  const added = ignoredWorkingTreePaths(checkout).filter((relative) => !before.has(relative));
  added.sort((a, b) => b.split(/[\\/]+/).length - a.split(/[\\/]+/).length || b.length - a.length);
  for (const relative of added) fs.rmSync(safeGeneratedPath(checkout, relative), { recursive: true, force: true });
  return added.sort();
}

function assertTargetsOutsideGitlinks(checkout, group) {
  const result = git(["ls-files", "--stage"], { cwd: checkout, allowFailure: true });
  if (result.status !== 0) fail(`${group.checkoutKey} gitlink inventory failed`, { code: "gitlink_inventory_failed" });
  const gitlinks = result.stdout.split(/\r?\n/)
    .filter((line) => line.startsWith("160000 "))
    .map((line) => line.split("\t", 2)[1])
    .filter(Boolean);
  for (const target of group.targetProjects) {
    const normalized = target.project.replace(/\\/g, "/").replace(/^\.\/?$/, ".");
    if (normalized === ".") continue;
    const gitlink = gitlinks.find((candidate) => normalized === candidate || normalized.startsWith(`${candidate}/`));
    if (gitlink) fail(`${target.id} is inside Git submodule path ${gitlink}`, { code: "target_inside_gitlink" });
  }
}

function verifyGroup(group, checkoutRoot) {
  const state = checkoutState(group, checkoutRoot);
  const errors = [];
  let nestedSources = [];
  if (!state.exists) errors.push("checkout-missing");
  else if (!state.git) errors.push("checkout-not-git");
  else {
    if (state.origin !== group.url) errors.push("origin-mismatch");
    if (state.head !== group.revision) errors.push("revision-mismatch");
    if (state.dirty === null) errors.push("cleanliness-unavailable");
    else if (state.dirty === true) errors.push("dirty-checkout");
    if (state.head === group.revision) {
      try {
        assertNoCheckoutFilters(state.checkout, group.revision, group.checkoutKey);
        assertTargetsOutsideGitlinks(state.checkout, group);
        assertNestedSourceDeclarations(state.checkout, group);
      } catch (error) {
        if (error.code === "checkout_filter_unsupported") errors.push("checkout-filter-unsupported");
        else if (error.code === "target_inside_gitlink") errors.push("target-inside-gitlink");
        else if (error.code === "gitlink_inventory_failed") errors.push("gitlink-inventory-failed");
        else if (error.code?.startsWith("nested_")) errors.push(error.code.replaceAll("_", "-"));
        else errors.push("checkout-filter-check-failed");
      }
      nestedSources = (group.nestedSources ?? []).map((nested) => verifyNestedSource(state.checkout, nested, group.checkoutKey));
      if (nestedSources.some((nested) => !nested.ok)) errors.push("nested-source-invalid");
    }
  }
  return {
    checkoutKey: group.checkoutKey,
    repository: group.repository,
    revision: group.revision,
    targetIds: [...group.targetIds].sort(),
    path: state.checkout,
    origin: state.origin,
    head: state.head,
    dirty: state.dirty,
    nestedSources,
    ok: errors.length === 0,
    errors,
  };
}

export function verifyMaterializedWebProjectCorpus(corpus, { checkoutRoot } = {}) {
  if (!corpusHasExternalTargets(corpus)) {
    return {
      ok: true,
      runtime: "web-project-corpus-verify",
      corpus: corpus.id,
      checkoutRoot: checkoutRoot ? path.resolve(checkoutRoot) : null,
      checkoutCount: 0,
      targetCount: corpus.targets.length,
      checkouts: [],
      projects: corpusProjectPaths(corpus).map((projectPath, index) => ({
        id: corpus.targets[index].id,
        path: projectPath,
        exists: fs.existsSync(projectPath),
      })),
    };
  }
  if (!checkoutRoot) fail("external corpus verification requires --checkout-root", { code: "checkout_root_required" });
  const checkouts = gitGroups(corpus).map((group) => verifyGroup(group, checkoutRoot));
  const projectPaths = corpusProjectPaths(corpus, { checkoutRoot });
  const projects = corpus.targets.map((target, index) => {
    const projectPath = projectPaths[index];
    let exists = fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory();
    let contained = true;
    if (exists && target.source?.kind === "git") {
      const checkoutPath = safeCheckoutPath(checkoutRoot, target.source.checkout).checkout;
      try {
        const realCheckout = fs.realpathSync(checkoutPath);
        const realProject = fs.realpathSync(projectPath);
        const relative = path.relative(realCheckout, realProject);
        contained = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
      } catch {
        contained = false;
      }
      if (!contained) exists = false;
    }
    return { id: target.id, checkoutKey: target.source?.checkout ?? null, path: projectPath, exists, contained };
  });
  const ok = checkouts.every((entry) => entry.ok) && projects.every((entry) => entry.exists);
  return {
    ok,
    runtime: "web-project-corpus-verify",
    corpus: corpus.id,
    checkoutRoot: path.resolve(checkoutRoot),
    checkoutCount: checkouts.length,
    targetCount: projects.length,
    checkouts,
    projects,
  };
}


function assertAttributeTextHasNoCheckoutFilters(text, checkoutKey, attributeFile) {
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const content = line.replace(/\s*#.*$/, "").trim();
    if (!content) continue;
    if (/(?:^|\s)filter(?:=|\s|$)/.test(content) && !/(?:^|\s)-filter(?:\s|$)/.test(content)) {
      fail(`${checkoutKey} uses an unsupported checkout filter in ${attributeFile}:${index + 1}`, {
        code: "checkout_filter_unsupported",
        attributeFile,
        line: index + 1,
      });
    }
  }
}

function assertNoCheckoutFilters(checkout, revision, checkoutKey) {
  const list = git(["ls-tree", "-r", "--name-only", revision], { cwd: checkout });
  const attributeFiles = list.stdout.split(/\r?\n/).filter((name) => name === ".gitattributes" || name.endsWith("/.gitattributes"));
  for (const attributeFile of attributeFiles) {
    const shown = git(["show", `${revision}:${attributeFile}`], { cwd: checkout });
    assertAttributeTextHasNoCheckoutFilters(shown.stdout, checkoutKey, attributeFile);
  }
  const infoAttributes = path.join(checkout, ".git", "info", "attributes");
  if (fs.existsSync(infoAttributes)) {
    assertAttributeTextHasNoCheckoutFilters(fs.readFileSync(infoAttributes, "utf8"), checkoutKey, ".git/info/attributes");
  }
}

function materializeNestedSource(parentCheckout, nested, group, { fetch = true } = {}) {
  const checkoutKey = group.checkoutKey;
  assertNestedSourceDeclaration(parentCheckout, group, nested);
  const checkout = safeNestedCheckoutPath(parentCheckout, nested.path);
  let state = nestedCheckoutState(parentCheckout, nested);
  if (state.exists && !state.git) {
    const emptyDirectory = fs.statSync(checkout).isDirectory() && fs.readdirSync(checkout).length === 0;
    if (!emptyDirectory) fail(`${checkoutKey}:${nested.path} exists but is not an independent Git checkout`, { code: "nested_checkout_not_git" });
  }
  if (state.git) {
    if (state.origin !== nested.url) fail(`${checkoutKey}:${nested.path} origin mismatch`, { code: "nested_origin_mismatch", expected: nested.url, observed: state.origin });
    if (state.dirty === null) fail(`${checkoutKey}:${nested.path} cleanliness could not be verified`, { code: "nested_cleanliness_unavailable" });
    if (state.dirty) fail(`${checkoutKey}:${nested.path} has local changes`, { code: "nested_dirty_checkout" });
  } else {
    git(["clone", "--no-checkout", "--no-recurse-submodules", nested.url, checkout]);
    state = nestedCheckoutState(parentCheckout, nested);
    if (!state.git || state.origin !== nested.url) fail(`${checkoutKey}:${nested.path} clone identity could not be verified`, { code: "nested_origin_mismatch" });
  }
  const hasRevision = git(["cat-file", "-e", `${nested.revision}^{commit}`], { cwd: checkout, allowFailure: true }).status === 0;
  if (fetch || !hasRevision) git(["fetch", "--depth=1", nested.url, nested.revision], { cwd: checkout });
  assertNoCheckoutFilters(checkout, nested.revision, `${checkoutKey}:${nested.path}`);
  git(["checkout", "--detach", nested.revision], { cwd: checkout });
  const verified = verifyNestedSource(parentCheckout, nested, checkoutKey);
  if (!verified.ok) fail(`${checkoutKey}:${nested.path} failed post-materialization verification: ${verified.errors.join(",")}`, { code: "nested_materialization_verification_failed" });
  return verified;
}

function restoreNestedSource(parentCheckout, nested, checkoutKey, baseline = null) {
  const state = nestedCheckoutState(parentCheckout, nested);
  if (!state.exists || !state.git) return { path: nested.path, ok: false, errors: [state.exists ? "nested-checkout-not-git" : "nested-checkout-missing"] };
  if (state.origin !== nested.url) return { path: nested.path, ok: false, errors: ["nested-origin-mismatch"] };
  try {
    assertNoCheckoutFilters(state.checkout, nested.revision, `${checkoutKey}:${nested.path}`);
    git(["checkout", "--detach", nested.revision], { cwd: state.checkout });
    git(["reset", "--hard", nested.revision], { cwd: state.checkout });
    git(["clean", "-fd"], { cwd: state.checkout });
    const removedIgnoredPaths = baseline ? removeNewIgnoredPaths(state.checkout, baseline.ignoredPaths ?? []) : [];
    const verified = verifyNestedSource(parentCheckout, nested, checkoutKey);
    return { ...verified, removedIgnoredPaths };
  } catch (error) {
    return { path: nested.path, ok: false, errors: [error.code ?? "nested-restore-failed"] };
  }
}

export function restoreMaterializedWebProjectCorpus(corpus, { checkoutRoot, baselineState = null } = {}) {
  if (!corpusHasExternalTargets(corpus)) {
    return { ok: true, runtime: "web-project-corpus-restore", corpus: corpus.id, checkoutCount: 0, checkouts: [] };
  }
  if (!checkoutRoot) fail("external corpus restore requires --checkout-root", { code: "checkout_root_required" });
  const root = path.resolve(checkoutRoot);
  const baselineByCheckout = new Map((baselineState?.checkouts ?? []).map((entry) => [entry.checkoutKey, entry]));
  const restored = [];
  for (const group of gitGroups(corpus)) {
    const state = checkoutState(group, root);
    if (!state.exists || !state.git) {
      restored.push({ checkoutKey: group.checkoutKey, ok: false, errors: [state.exists ? "checkout-not-git" : "checkout-missing"] });
      continue;
    }
    if (state.origin !== group.url) {
      restored.push({ checkoutKey: group.checkoutKey, ok: false, errors: ["origin-mismatch"] });
      continue;
    }
    try {
      assertNoCheckoutFilters(state.checkout, group.revision, group.checkoutKey);
      assertNestedSourceDeclarations(state.checkout, group);
      const baseline = baselineByCheckout.get(group.checkoutKey) ?? null;
      const nestedBaseline = new Map((baseline?.nestedSources ?? []).map((entry) => [entry.path, entry]));
      const nestedSources = [...orderedNestedSources(group)].reverse().map((nested) => restoreNestedSource(
        state.checkout, nested, group.checkoutKey, nestedBaseline.get(nested.path) ?? null,
      )).sort((a, b) => a.path.localeCompare(b.path));
      git(["checkout", "--detach", group.revision], { cwd: state.checkout });
      git(["reset", "--hard", group.revision], { cwd: state.checkout });
      git(["clean", "-fd"], { cwd: state.checkout });
      const removedIgnoredPaths = baselineState ? removeNewIgnoredPaths(state.checkout, baseline?.ignoredPaths ?? []) : [];
      const verified = verifyGroup(group, root);
      const nestedOk = nestedSources.every((nested) => nested.ok);
      restored.push({
        checkoutKey: group.checkoutKey,
        repository: group.repository,
        revision: group.revision,
        ok: verified.ok && nestedOk,
        errors: [...verified.errors, ...nestedSources.flatMap((nested) => nested.ok ? [] : nested.errors.map((error) => `${nested.path}:${error}`))],
        head: verified.head,
        dirty: verified.dirty,
        nestedSources,
        removedIgnoredPaths,
      });
    } catch (error) {
      restored.push({ checkoutKey: group.checkoutKey, ok: false, errors: [error.code ?? "restore-failed"] });
    }
  }
  return {
    ok: restored.every((entry) => entry.ok),
    runtime: "web-project-corpus-restore",
    corpus: corpus.id,
    checkoutCount: restored.length,
    checkouts: restored,
  };
}

export function materializeWebProjectCorpus(corpus, { checkoutRoot, fetch = true } = {}) {
  if (!corpusHasExternalTargets(corpus)) {
    return verifyMaterializedWebProjectCorpus(corpus, { checkoutRoot });
  }
  if (!checkoutRoot) fail("external corpus materialization requires --checkout-root", { code: "checkout_root_required" });
  const root = path.resolve(checkoutRoot);
  fs.mkdirSync(root, { recursive: true });

  const materialized = [];
  const materializedNestedSources = [];
  for (const group of gitGroups(corpus)) {
    let state = checkoutState(group, root);
    if (state.exists && !state.git) fail(`${group.checkoutKey} exists but is not a Git checkout`, { code: "checkout_not_git" });
    if (state.git) {
      if (state.origin !== group.url) fail(`${group.checkoutKey} origin mismatch`, { code: "origin_mismatch", expected: group.url, observed: state.origin });
      if (state.dirty === null) fail(`${group.checkoutKey} cleanliness could not be verified`, { code: "cleanliness_unavailable" });
      if (state.dirty) fail(`${group.checkoutKey} has local changes`, { code: "dirty_checkout" });
    } else {
      const { checkout } = safeCheckoutPath(root, group.checkoutKey);
      git(["clone", "--no-checkout", "--no-recurse-submodules", group.url, checkout]);
      state = checkoutState(group, root);
      if (!state.git || state.origin !== group.url) fail(`${group.checkoutKey} clone identity could not be verified`, { code: "origin_mismatch" });
    }

    const hasRevision = git(["cat-file", "-e", `${group.revision}^{commit}`], { cwd: state.checkout, allowFailure: true }).status === 0;
    if (fetch || !hasRevision) {
      git(["fetch", "--depth=1", group.url, group.revision], { cwd: state.checkout });
    }
    assertNoCheckoutFilters(state.checkout, group.revision, group.checkoutKey);
    git(["checkout", "--detach", group.revision], { cwd: state.checkout });
    for (const nested of orderedNestedSources(group)) {
      const nestedVerified = materializeNestedSource(state.checkout, nested, group, { fetch });
      materializedNestedSources.push({ checkoutKey: group.checkoutKey, ...nestedVerified });
    }
    const verified = verifyGroup(group, root);
    if (!verified.ok) fail(`${group.checkoutKey} failed post-materialization verification: ${verified.errors.join(",")}`, { code: "materialization_verification_failed" });
    materialized.push(verified);
  }

  const verification = verifyMaterializedWebProjectCorpus(corpus, { checkoutRoot: root });
  return {
    ...verification,
    runtime: "web-project-corpus-materialize",
    materializedCheckouts: materialized.map((entry) => entry.checkoutKey),
    materializedNestedSources: materializedNestedSources.map((entry) => ({
      checkoutKey: entry.checkoutKey,
      path: entry.path,
      revision: entry.revision,
    })),
    targetCodeExecuted: false,
    upstreamWritesPerformed: false,
  };
}
