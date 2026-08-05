#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { discoverAccessibleActions } from "../protocol/accessible-action-discovery.mjs";

const fixture = [
  { role:"form", name:"Profile" },
  { role:"textbox", name:"Email", within:["form:Profile"] },
  { role:"checkbox", name:"Subscribe", within:["form:Profile"], checked:false },
  { role:"combobox", name:"Country", within:["form:Profile"], options:["Japan","France"] },
  { role:"button", name:"Save", within:["form:Profile"] },
  { role:"button", name:"Save" },
  { role:"button", name:"Delete", within:["dialog:Confirm"] },
  { role:"button", name:"Delete", within:["dialog:Confirm"] },
  { role:"button", name:"Hidden", hidden:true },
  { role:"button", name:"Disabled", disabled:true },
];
const first = discoverAccessibleActions(fixture, { inputCorpus:["", "invalid", "valid@example.com"] });
const second = discoverAccessibleActions([...fixture].reverse(), { inputCorpus:["", "invalid", "valid@example.com"] });
assert.deepEqual(first, second);
assert.equal(first.diagnostics.length, 1);
assert.equal(first.diagnostics[0].kind, "ambiguous_action");
assert.equal(first.actions.some((a)=>a.id==='click|button|Save|within=form:Profile'), true);
assert.equal(first.actions.some((a)=>a.id.includes('Hidden')), false);
assert.equal(first.actions.filter((a)=>a.kind==='type').length, 3);
assert.equal(first.actions.some((a)=>a.id==='select|combobox|Country|within=form:Profile|input="Japan"'), true);
const result = { ok:true, actionCount:first.actions.length, diagnosticCount:first.diagnostics.length, semanticHash:first.semanticHash, exampleActionIds:first.actions.slice(0,8).map((a)=>a.id), diagnostic:first.diagnostics[0] };
fs.writeFileSync(new URL('../protocol/fixtures/accessible-action-discovery-result.json', import.meta.url), JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
