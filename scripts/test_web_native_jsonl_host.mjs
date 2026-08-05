#!/usr/bin/env node
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import assert from 'node:assert/strict';
const child = spawn(process.execPath, ['scripts/web_native_jsonl_host.mjs'], { cwd: process.cwd(), stdio: ['pipe','pipe','inherit'] });
const rl = readline.createInterface({input: child.stdout});
const waits = new Map(); rl.on('line', l => { const r=JSON.parse(l); waits.get(r.id)?.(r); waits.delete(r.id); });
let id=0; const call=(method,params={})=>new Promise(resolve=>{const n=++id; waits.set(n,resolve); child.stdin.write(JSON.stringify({protocolVersion:'1.0',id:n,method,params})+'\n');});
assert.equal((await call('hello')).result.core,'moonbit-native');
assert.equal((await call('reset',{seed:7,fixture:'stale-search'})).result.isolated,true);
const replay=await call('replay',{trace:['type:a','type:ab','deliver:1']});
assert.equal(replay.result.failed,true); assert.equal(replay.result.property,'search results match latest query'); assert.deepEqual(replay.result.trace,['type:a','type:ab','deliver:1']);
const pass=await call('replay',{trace:['type:a','deliver:1']}); assert.equal(pass.result.failed,false);
const unsupported=await call('execute',{action:{id:'x'}}); assert.equal(unsupported.error.code,'unsupported_effect');
assert.equal((await call('dispose')).result.disposed,true);
const disposed=await call('replay',{trace:[]}); assert.equal(disposed.error.code,'disposed');
await call('shutdown'); child.stdin.end(); await new Promise(r=>child.on('close',r));
console.log(JSON.stringify({ok:true,trace:replay.result.trace,signature:replay.result.failureSignature.semanticHash}));
