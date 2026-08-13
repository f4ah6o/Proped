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
    const existing = groups.get(key);
    if (existing) {
      if (existing.url !== target.source.url || existing.revision !== target.revision) {
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
    return {
      checkoutKey: group.checkoutKey,
      ignoredPaths: ignoredWorkingTreePaths(state.checkout),
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
      } catch (error) {
        if (error.code === "checkout_filter_unsupported") errors.push("checkout-filter-unsupported");
        else if (error.code === "target_inside_gitlink") errors.push("target-inside-gitlink");
        else if (error.code === "gitlink_inventory_failed") errors.push("gitlink-inventory-failed");
        else errors.push("checkout-filter-check-failed");
      }
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

export function restoreMaterializedWebProjectCorpus(corpus, { checkoutRoot, baselineState = null } = {}) {
  if (!corpusHasExternalTargets(corpus)) {
    return { ok: true, runtime: "web-project-corpus-restore", corpus: corpus.id, checkoutCount: 0, checkouts: [] };
  }
  if (!checkoutRoot) fail("external corpus restore requires --checkout-root", { code: "checkout_root_required" });
  const root = path.resolve(checkoutRoot);
  const baselineByCheckout = new Map((baselineState?.checkouts ?? []).map((entry) => [entry.checkoutKey, entry.ignoredPaths ?? []]));
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
      git(["checkout", "--detach", group.revision], { cwd: state.checkout });
      git(["reset", "--hard", group.revision], { cwd: state.checkout });
      git(["clean", "-fd"], { cwd: state.checkout });
      const removedIgnoredPaths = baselineState ? removeNewIgnoredPaths(state.checkout, baselineByCheckout.get(group.checkoutKey) ?? []) : [];
      const verified = verifyGroup(group, root);
      restored.push({
        checkoutKey: group.checkoutKey,
        repository: group.repository,
        revision: group.revision,
        ok: verified.ok,
        errors: verified.errors,
        head: verified.head,
        dirty: verified.dirty,
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
    const verified = verifyGroup(group, root);
    if (!verified.ok) fail(`${group.checkoutKey} failed post-materialization verification: ${verified.errors.join(",")}`, { code: "materialization_verification_failed" });
    materialized.push(verified);
  }

  const verification = verifyMaterializedWebProjectCorpus(corpus, { checkoutRoot: root });
  return {
    ...verification,
    runtime: "web-project-corpus-materialize",
    materializedCheckouts: materialized.map((entry) => entry.checkoutKey),
    targetCodeExecuted: false,
    upstreamWritesPerformed: false,
  };
}
