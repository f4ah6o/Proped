import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_SELECTOR_SURVIVAL_VERSION = "1";

function targetKey(target) {
  return JSON.stringify({
    role: target.role,
    name: target.name,
    within: target.within ?? [],
    testIdentity: target.testIdentity ?? null,
  });
}

export function selectorContractFromInventory(inventory) {
  const targets = new Map();
  for (const action of inventory?.actions ?? []) {
    const key = targetKey(action.target);
    const current = targets.get(key) ?? {
      key,
      target: action.target,
      locatorStrategy: action.locator?.strategy ?? null,
      locatorConfidence: action.locator?.confidence ?? 0,
      actionKinds: [],
    };
    if (!current.actionKinds.includes(action.kind)) current.actionKinds.push(action.kind);
    current.actionKinds.sort();
    current.locatorConfidence = Math.max(current.locatorConfidence, action.locator?.confidence ?? 0);
    targets.set(key, current);
  }
  const values = [...targets.values()].sort((a, b) => a.key.localeCompare(b.key));
  return {
    version: WEB_SELECTOR_SURVIVAL_VERSION,
    targetCount: values.length,
    targets: values,
    semanticHash: semanticHash(values.map(({ target, locatorStrategy, actionKinds }) => ({ target, locatorStrategy, actionKinds }))),
  };
}

export function benchmarkSelectorSurvival(baseline, candidates) {
  if (!baseline?.targets) throw new Error("selector survival baseline contract is required");
  if (!Array.isArray(candidates) || candidates.length === 0) throw new Error("selector survival requires at least one candidate contract");
  const baselineByKey = new Map(baseline.targets.map((target) => [target.key, target]));
  const results = candidates.map((candidate, index) => {
    const currentByKey = new Map(candidate.contract.targets.map((target) => [target.key, target]));
    const survived = [];
    const missing = [];
    for (const [key, target] of baselineByKey) {
      const current = currentByKey.get(key);
      if (current) {
        survived.push({
          key,
          target: target.target,
          baselineStrategy: target.locatorStrategy,
          currentStrategy: current.locatorStrategy,
          currentConfidence: current.locatorConfidence,
          strategyChanged: target.locatorStrategy !== current.locatorStrategy,
        });
      } else {
        missing.push({ key, target: target.target, baselineStrategy: target.locatorStrategy });
      }
    }
    const targetCount = baseline.targets.length;
    const survivalRate = targetCount === 0 ? 1 : survived.length / targetCount;
    return {
      id: candidate.id ?? `candidate-${index + 1}`,
      targetCount,
      survivedTargetCount: survived.length,
      missingTargetCount: missing.length,
      survivalRate,
      strategyChangeCount: survived.filter((entry) => entry.strategyChanged).length,
      survived,
      missing,
    };
  });
  const report = {
    ok: true,
    runtime: "web-selector-survival-benchmark",
    version: WEB_SELECTOR_SURVIVAL_VERSION,
    baselineTargetCount: baseline.targets.length,
    candidateCount: results.length,
    minimumSurvivalRate: Math.min(...results.map((result) => result.survivalRate)),
    meanSurvivalRate: results.reduce((sum, result) => sum + result.survivalRate, 0) / results.length,
    results,
  };
  report.semanticHash = semanticHash({
    version: report.version,
    baselineTargetCount: report.baselineTargetCount,
    results: results.map(({ id, targetCount, survivedTargetCount, missingTargetCount, survivalRate, strategyChangeCount, missing }) => ({
      id, targetCount, survivedTargetCount, missingTargetCount, survivalRate, strategyChangeCount,
      missing: missing.map(({ target, baselineStrategy }) => ({ target, baselineStrategy })),
    })),
  });
  return report;
}
