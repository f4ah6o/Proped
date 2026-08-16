#!/usr/bin/env node
import assert from "node:assert/strict";
import { projectWebFindingIncidents, renderWebFindingIncidents } from "../protocol/web-finding-incident.mjs";

const actionableFinding = {
  findingGroupId: "finding@controlled",
  grouping: "strong",
  memberFailureCodes: ["unhandled_exception"],
  occurrenceCount: 2,
  provenance: {
    family: "browser-exception",
    exceptionName: "TypeError",
    messageTemplate: "controlled token=<redacted> item <number>",
    routeFamily: "/items/:id?view=:value",
    topProjectFrame: { sourcePath: "src/app.js", projectOwned: true, function: "crash", line: 12, column: 4 },
  },
  provenanceRejectionReasons: [],
  representativeReplay: {
    trace: ["click|button|Crash|token=secret-123", "navigate|https://127.0.0.1:49152/items/7?view=private"],
    originalActionCount: 3,
    minimizedActionCount: 2,
    minimality: "one-minimal",
    sameFindingReplay: true,
    deterministic: true,
  },
  deterministic: true,
  replayable: true,
  actionable: true,
  qualificationReasons: [],
};

const deterministicSingleton = {
  findingGroupId: "finding-singleton@controlled",
  grouping: "singleton",
  memberFailureCodes: ["browser_uncaught_exception"],
  occurrenceCount: 1,
  provenance: null,
  provenanceRejectionReasons: ["diagnostic-missing"],
  representativeReplay: null,
  deterministic: true,
  replayable: true,
  actionable: false,
  qualificationReasons: ["weak-provenance-singleton", "minimal-replay-unavailable"],
};

const projection = projectWebFindingIncidents([deterministicSingleton, actionableFinding]);
assert.equal(projection.version, "1");
assert.equal(projection.incidentCount, 2);
assert.equal(projection.actionableIncidentCount, 1);
assert.deepEqual(projection.incidents.map((incident) => incident.findingGroupId), ["finding-singleton@controlled", "finding@controlled"]);
const actionable = projection.incidents.find((incident) => incident.findingGroupId === actionableFinding.findingGroupId);
assert.equal(actionable.grouping, "strong");
assert.equal(actionable.minimalReplay.minimality, "one-minimal");
assert.equal(actionable.minimalReplay.originalActionCount, 3);
assert.equal(actionable.minimalReplay.minimizedActionCount, 2);
assert.match(actionable.minimalReplay.actions[0], /token=<redacted>/);
assert.equal(actionable.minimalReplay.actions[1], "navigate|<url>");
const singleton = projection.incidents.find((incident) => incident.findingGroupId === deterministicSingleton.findingGroupId);
assert.equal(singleton.actionable, false);
assert.deepEqual(singleton.provenance.rejectionReasons, ["diagnostic-missing"]);
assert.ok(singleton.actionabilityReasons.includes("weak-provenance-singleton"));

const human = renderWebFindingIncidents(projection);
assert.match(human, /Incident finding@controlled/);
assert.match(human, /3 -> 2 actions; one-minimal; deterministic=true; replayable=true/);
assert.match(human, /Incident finding-singleton@controlled/);
assert.match(human, /not actionable: minimal-replay-unavailable, weak-provenance-singleton/);
assert.match(human, /provenance rejected \(diagnostic-missing\)/);
assert.doesNotMatch(human, /secret-123|127\.0\.0\.1:49152|view=private/);

console.log(JSON.stringify({
  ok: true,
  runtime: "web-finding-incident-test",
  incidentCount: projection.incidentCount,
  actionableIncidentCount: projection.actionableIncidentCount,
  privacySafe: true,
}));
