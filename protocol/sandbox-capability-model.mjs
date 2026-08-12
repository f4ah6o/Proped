export const SANDBOX_CAPABILITY_AXES = Object.freeze([
  "filesystem",
  "network",
  "process",
]);

export const SANDBOX_CAPABILITY_LEVELS = Object.freeze([
  "caller_enforced",
  "constrained",
  "strict",
]);

const CAPABILITY_RANK = Object.freeze({
  caller_enforced: 0,
  constrained: 1,
  strict: 2,
});

function assertLevel(level, label) {
  if (!(level in CAPABILITY_RANK)) {
    throw new Error(`${label} must be one of ${SANDBOX_CAPABILITY_LEVELS.join(", ")}`);
  }
  return level;
}

export function sandboxCapabilitySet(levels = {}) {
  const result = {};
  for (const axis of SANDBOX_CAPABILITY_AXES) {
    result[axis] = assertLevel(levels[axis] ?? "caller_enforced", `sandbox capability ${axis}`);
  }
  return Object.freeze(result);
}

export function sandboxCapabilityRequirement(level = "strict") {
  assertLevel(level, "sandbox capability requirement");
  return sandboxCapabilitySet(Object.fromEntries(SANDBOX_CAPABILITY_AXES.map((axis) => [axis, level])));
}

export function missingSandboxCapabilities(actual, required = sandboxCapabilityRequirement("strict")) {
  const normalizedActual = sandboxCapabilitySet(actual);
  const normalizedRequired = sandboxCapabilitySet(required);
  return SANDBOX_CAPABILITY_AXES
    .filter((axis) => CAPABILITY_RANK[normalizedActual[axis]] < CAPABILITY_RANK[normalizedRequired[axis]])
    .map((axis) => ({
      axis,
      actual: normalizedActual[axis],
      required: normalizedRequired[axis],
    }));
}

export class SandboxCapabilityError extends Error {
  constructor({ actual, required = sandboxCapabilityRequirement("strict"), platform, backend = null } = {}) {
    const missing = missingSandboxCapabilities(actual, required);
    const detail = missing.map(({ axis, actual: value, required: need }) => `${axis}=${value}<${need}`).join(", ");
    super(`sandbox capability requirement not met${detail ? `: ${detail}` : ""}`);
    this.name = "SandboxCapabilityError";
    this.code = "sandbox_capability_requirement_not_met";
    this.platform = platform ?? null;
    this.backend = backend;
    this.capabilities = sandboxCapabilitySet(actual);
    this.requiredCapabilities = sandboxCapabilitySet(required);
    this.missingCapabilities = missing;
  }
}

export function assertSandboxCapabilities(actual, required = sandboxCapabilityRequirement("strict"), context = {}) {
  const missing = missingSandboxCapabilities(actual, required);
  if (missing.length > 0) {
    throw new SandboxCapabilityError({
      actual,
      required,
      platform: context.platform,
      backend: context.backend ?? null,
    });
  }
  return sandboxCapabilitySet(actual);
}
