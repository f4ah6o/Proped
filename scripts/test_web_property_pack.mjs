#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPropertyFailure, evaluateWebProperties, propertyPackSemanticHash } from "../protocol/web-property-pack.mjs";

const base={fingerprint:"before",pending:[{kind:"submit",id:1}],applicationState:{generation:2,selectedEntityId:2,entityIds:[1,2]},console:[]};
const after={fingerprint:"after",pending:[{kind:"submit",id:1},{kind:"submit",id:2}],applicationState:{generation:2,selectedEntityId:3,entityIds:[1,2]},console:[{kind:"hydration",message:"Hydration mismatch"},{kind:"unhandledrejection",message:"boom"}],focus:{disabled:true},disposed:true};
const action={id:"submit|form|Profile",kind:"submit",input:{generation:1}};
const violations=evaluateWebProperties({before:base,action,after,replay:{firstHash:"a",secondHash:"b"}});
const codes=violations.map(x=>x.code).sort();
assert.deepEqual(codes,["deterministic_replay","duplicate_submit","entity_consistency","focus_integrity","hydration_warning","pending_effect_leak","unhandled_exception"]);
const stale=evaluateWebProperties({before:base,action:{id:"deliver:1",kind:"inject",input:{generation:1}},after:{...base,fingerprint:"changed"}});
assert.equal(stale[0].code,"stale_response");
const failure=buildPropertyFailure({fixture:"generic-web",trace:[action],snapshot:after,violation:violations[0],seed:7});
const result={ok:true,violationCount:violations.length+stale.length,codes:[...codes,"stale_response"].sort(),failure,semanticHash:propertyPackSemanticHash({codes,failure})};
fs.mkdirSync("protocol/fixtures",{recursive:true}); fs.writeFileSync("protocol/fixtures/web-property-pack-result.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result));
