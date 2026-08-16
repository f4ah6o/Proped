import { semanticHash } from "./ui-driver-v1.mjs";

export const ENVIRONMENT_CHECKPOINT_CAPABILITY = "environment-checkpoints";
export const ENVIRONMENT_CHECKPOINT_VERSION = "1";

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

export function hasEnvironmentCheckpointCapability(driver) {
  const canCheckpoint = typeof driver?.checkpoint === "function";
  const canRestore = typeof driver?.restoreCheckpoint === "function";
  if (canCheckpoint !== canRestore) {
    throw new Error("environment checkpoint capability requires both checkpoint() and restoreCheckpoint()");
  }
  return canCheckpoint && canRestore;
}

export function normalizeEnvironmentCheckpoint(value, label = "environment checkpoint") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (!nonEmptyString(value.checkpointId)) {
    throw new Error(`${label}.checkpointId must be a non-empty string`);
  }
  const environmentStateId = value.environmentStateId ?? value.checkpointId;
  if (!nonEmptyString(environmentStateId)) {
    throw new Error(`${label}.environmentStateId must be a non-empty string when supplied`);
  }
  return {
    checkpointId: value.checkpointId,
    environmentStateId,
  };
}

export async function captureEnvironmentCheckpoint(driver) {
  if (!hasEnvironmentCheckpointCapability(driver)) {
    throw new Error("driver does not support environment checkpoints");
  }
  return normalizeEnvironmentCheckpoint(await driver.checkpoint());
}

export async function restoreEnvironmentCheckpoint(driver, checkpoint) {
  if (!hasEnvironmentCheckpointCapability(driver)) {
    throw new Error("driver does not support environment checkpoints");
  }
  const normalized = normalizeEnvironmentCheckpoint(checkpoint);
  const restored = await driver.restoreCheckpoint(normalized.checkpointId);
  if (restored !== undefined && restored !== null) {
    if (!restored || typeof restored !== "object" || Array.isArray(restored)) {
      throw new Error("restoreCheckpoint() result must be an object when supplied");
    }
    if (restored.environmentStateId !== undefined
      && restored.environmentStateId !== normalized.environmentStateId) {
      throw new Error("restoreCheckpoint() reported a different environment state identity");
    }
  }
  return normalized;
}

export function extendedStateIdentity(runtimeFingerprint, environmentStateId = null) {
  if (!nonEmptyString(runtimeFingerprint)) {
    throw new Error("runtime fingerprint must be a non-empty string");
  }
  if (environmentStateId === null || environmentStateId === undefined) return runtimeFingerprint;
  if (!nonEmptyString(environmentStateId)) {
    throw new Error("environment state identity must be a non-empty string");
  }
  return semanticHash({ runtimeFingerprint, environmentStateId });
}

export function environmentEffect(beforeStateId, afterStateId) {
  return beforeStateId === afterStateId ? "unchanged" : "environment_changed";
}

export function checkpointEvidence(checkpoint) {
  const normalized = normalizeEnvironmentCheckpoint(checkpoint);
  return {
    checkpointId: normalized.checkpointId,
    environmentStateId: normalized.environmentStateId,
  };
}
