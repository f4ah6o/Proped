export const WEB_NODE_ENGINE_VERSION = "1";

function versionTuple(value) {
  const match = String(value ?? "").trim().replace(/^v/, "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compare(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function satisfiesComparator(version, token) {
  const match = token.match(/^(>=|<=|>|<|=)?\s*(\d+)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?$/);
  if (!match) return null;
  const op = match[1] ?? null;
  const major = Number(match[2]);
  const minorWild = match[3] === undefined || /^(x|X|\*)$/.test(match[3]);
  const patchWild = match[4] === undefined || /^(x|X|\*)$/.test(match[4]);
  const minor = minorWild ? 0 : Number(match[3]);
  const patch = patchWild ? 0 : Number(match[4]);
  const target = [major, minor, patch];
  if (!op) {
    if (minorWild) return version[0] === major;
    if (patchWild) return version[0] === major && version[1] === minor;
    return compare(version, target) === 0;
  }
  const cmp = compare(version, target);
  if (op === ">=") return cmp >= 0;
  if (op === "<=") return cmp <= 0;
  if (op === ">") return cmp > 0;
  if (op === "<") return cmp < 0;
  return cmp === 0;
}

function satisfiesToken(version, token) {
  token = token.trim();
  if (!token) return true;
  if (token.startsWith("^")) {
    const base = versionTuple(token.slice(1));
    if (!base) return null;
    const upper = base[0] > 0 ? [base[0] + 1, 0, 0] : base[1] > 0 ? [0, base[1] + 1, 0] : [0, 0, base[2] + 1];
    return compare(version, base) >= 0 && compare(version, upper) < 0;
  }
  if (token.startsWith("~")) {
    const base = versionTuple(token.slice(1));
    if (!base) return null;
    const upper = [base[0], base[1] + 1, 0];
    return compare(version, base) >= 0 && compare(version, upper) < 0;
  }
  return satisfiesComparator(version, token);
}

function clauseResult(version, clause) {
  const normalized = clause.trim();
  if (!normalized) return null;
  const tokens = normalized.match(/(?:\^|~|>=|<=|>|<|=)?\s*\d+(?:\.(?:\d+|x|X|\*)){0,2}/g);
  if (!tokens || tokens.join(" ").replace(/\s+/g, " ").trim() !== normalized.replace(/\s+/g, " ").trim()) return null;
  let unknown = false;
  for (const token of tokens) {
    const result = satisfiesToken(version, token.replace(/\s+/g, ""));
    if (result === null) unknown = true;
    else if (!result) return false;
  }
  return unknown ? null : true;
}

export function evaluateNodeEngine(requirement, currentVersion = process.version) {
  if (!requirement) return { status: "not-declared", requirement: null, currentVersion, compatible: null };
  const version = versionTuple(currentVersion);
  if (!version) return { status: "unknown", requirement, currentVersion, compatible: null, reason: "current-version-unparseable" };
  let sawUnknown = false;
  for (const clause of String(requirement).split("||")) {
    const result = clauseResult(version, clause);
    if (result === true) return { status: "compatible", requirement, currentVersion, compatible: true };
    if (result === null) sawUnknown = true;
  }
  if (sawUnknown) return { status: "unknown", requirement, currentVersion, compatible: null, reason: "unsupported-range-syntax" };
  return { status: "incompatible", requirement, currentVersion, compatible: false };
}
