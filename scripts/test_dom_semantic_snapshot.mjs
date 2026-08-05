#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { createSemanticSnapshot, compareSnapshotIdentity } from "../protocol/dom-semantic-snapshot.mjs";

const base = {
  url: "/search?q=moon",
  semanticDom: { role:"main", children:[{ role:"textbox", name:"Search", attributes:{ id:":r12:", "data-reactroot":"x", value:"moon" } }, { role:"status", text:"Updated 2026-08-05T14:00:00Z" }] },
  forms:[{ identity:{role:"textbox",name:"Search"}, value:"moon" }],
  focus:{role:"textbox",name:"Search"},
  storage:{local:{theme:"dark",token:"abcdef0123456789abcdef"},session:{page:"1"}},
  pending:[{kind:"network",id:"request-123",generation:2}],
  applicationState:{query:"moon",revision:2}, effects:[], console:[],
};
const unstable = structuredClone(base);
unstable.semanticDom.children[0].attributes.id=":r99:";
unstable.semanticDom.children[0].attributes["data-reactroot"]="different";
unstable.semanticDom.children[1].text="Updated 2026-08-05T14:00:09Z";
unstable.storage.local.token="111111111111111111111111";
unstable.pending[0].id="request-999";
const first=createSemanticSnapshot(base), second=createSemanticSnapshot(unstable);
assert.equal(first.fingerprint,second.fingerprint);
assert.equal(first.semanticDomHash,second.semanticDomHash);
assert.equal(compareSnapshotIdentity(first,second),null);
const changed=structuredClone(base); changed.forms[0].value="new"; changed.semanticDom.children[0].attributes.value="new"; changed.applicationState={query:"new",revision:3};
const third=createSemanticSnapshot(changed); assert.notEqual(first.fingerprint,third.fingerprint);
const forged={...third,fingerprint:first.fingerprint}; const collision=compareSnapshotIdentity(first,forged);
assert.equal(collision.kind,"state_identity_collision"); assert.ok(collision.evidence.forms); assert.ok(collision.evidence.applicationState);
const result={ok:true,normalizerVersion:first.normalizerVersion,fingerprint:first.fingerprint,semanticDomHash:first.semanticDomHash,stableAcrossUnstableIds:true,collision};
fs.mkdirSync("protocol/fixtures",{recursive:true}); fs.writeFileSync("protocol/fixtures/dom-semantic-snapshot-result.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result));
