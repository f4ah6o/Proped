#!/usr/bin/env node
import readline from "node:readline";
import crypto from "node:crypto";

export class SyntheticDriver {
  constructor(){ this.reset(1,"stale-search"); }
  async reset(seed=1,fixture="stale-search"){ this.seed=seed; this.fixture=fixture; this.state={query:"",results:"",next:1,pending:[]}; return this.snapshot(); }
  async actions(){ const a=[]; for(const v of ["a","ab"]) a.push({id:`type:${v}`,kind:"type",target:{role:"searchbox",name:"Search"},input:v,label:`Type ${v}`}); for(const p of this.state.pending) a.push({id:`deliver:${p.id}`,kind:"inject",target:{role:"status",name:"Search response"},input:p.id,label:`Deliver ${p.id}`}); return a; }
  async execute(action){ if(action.id.startsWith("type:")){ const q=action.input; const id=this.state.next++; this.state.query=q; this.state.pending.push({id,query:q}); } else if(action.id.startsWith("deliver:")){ const id=Number(action.input); const p=this.state.pending.find(x=>x.id===id); if(p){ this.state.pending=this.state.pending.filter(x=>x.id!==id); this.state.results=p.query; } } return {snapshot:this.snapshot(),settle:{status:"settled",microtasks:1,timers:0,renders:1,elapsedMs:0},emittedEffects:[]}; }
  snapshot(){ const semantic={query:this.state.query,results:this.state.results,pending:this.state.pending.map(x=>x.id)}; const h=crypto.createHash("sha256").update(JSON.stringify(semantic)).digest("hex"); return {fingerprint:h,semanticDomHash:h,dom:`<input aria-label=Search value=${JSON.stringify(this.state.query)}><output>${this.state.results}</output>`,forms:[{name:"Search",value:this.state.query}],effects:[],console:[],pending:this.state.pending.map(x=>({kind:"network",id:x.id}))}; }
  async replay(trace){ await this.reset(this.seed,this.fixture); for(const action of trace) await this.execute(action); return {snapshot:this.snapshot(),property: this.state.results!=="" && this.state.results!==this.state.query ? "search results match latest query" : null}; }
  async dispose(){ this.state=null; }
}

if(import.meta.url===`file://${process.argv[1]}`){ const d=new SyntheticDriver(); const rl=readline.createInterface({input:process.stdin}); for await(const line of rl){ let r; try{ const q=JSON.parse(line); if(q.protocolVersion!=="1.0") throw new Error("unsupported protocol"); let result; if(q.method==="hello") result={protocolVersion:"1.0",capabilities:["reset","actions","execute","replay","dispose"]}; else if(q.method==="reset") result=await d.reset(q.params.seed,q.params.fixture); else if(q.method==="actions") result=await d.actions(); else if(q.method==="execute") result=await d.execute(q.params.action); else if(q.method==="replay") result=await d.replay(q.params.trace); else if(q.method==="dispose") result=await d.dispose(); else throw new Error("unknown method"); r={id:q.id,result}; }catch(e){ r={id:0,error:{message:e.message}}; } console.log(JSON.stringify(r)); } }
