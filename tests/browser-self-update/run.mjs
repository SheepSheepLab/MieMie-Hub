// Development Fixture: genuine Chromium CORS, real Registry HTTP handler,
// mocked GitHub upstream, isolated SQLite. No live user scripts or credentials.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const registry=resolve(process.env.MIEMIE_REGISTRY_PROJECT||'../MieMie-Registry');
const {createApp}=await import(pathToFileURL(registry+'/src/app.js'));
const {openStore}=await import(pathToFileURL(registry+'/src/store.js'));
const {loadConfig}=await import(pathToFileURL(registry+'/src/config.js'));
const {createHubReleaseRelay}=await import(pathToFileURL(registry+'/src/github-relay.js'));
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const base='https://api.github.com/repos/SheepSheepLab/MieMie-Hub', id='e85cd9a3-6352-4b23-938a-6c94d826b4d3';
const content=v=>'// MieMie-Hub-Build: '+JSON.stringify({schemaVersion:1,productId:'miemie.hub',version:v,scriptId:id})+'\n/* Inert Development Fixture */';
const script={type:'script',enabled:true,name:'Fixture Hub',id,content:content('0.5.2'),info:'',button:{enabled:false,buttons:[]},data:{},export_with:{data:false,button:false}};
const hash=b=>createHash('sha256').update(b).digest('hex'),bytes=Buffer.from(JSON.stringify(script));
const meta={schemaVersion:1,productId:'miemie.hub',version:'0.5.2',tag:'v0.5.2',format:'tavern-helper-script',scriptId:id,asset:{name:'MieMie-Hub-0.5.2.json',size:bytes.length,sha256:hash(bytes)},contentSha256:hash(script.content)};
const mb=Buffer.from(JSON.stringify(meta));
const asset=(n,name,b)=>({id:n,name,state:'uploaded',size:b.length,digest:'sha256:'+hash(b),url:base+'/releases/assets/'+n,browser_download_url:'https://github.com/SheepSheepLab/MieMie-Hub/releases/download/v0.5.2/'+name});
const release={id:20,draft:false,tag_name:'v0.5.2',assets:[asset(30,'MieMie-Hub-update.json',mb),asset(31,meta.asset.name,bytes)]};
const servers=[];let app,store,browser,blocked=0,cors=0,credentials=0,mode='valid';
async function serve(handler){const s=createServer(handler);servers.push(s);await new Promise(r=>s.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+s.address().port;}
try {
  const origin=await serve(async(req,res)=>{
    if(/^\/src\/[a-z-]+\.js$/.test(req.url)){res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('../../'+req.url.slice(1),import.meta.url)));}
    else res.end('<!doctype html><title>Hub update CORS fixture</title>');
  });
  const upstream=await serve((req,res)=>{
    if(req.url.endsWith('/releases/20')){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(release));}
    else {blocked++;res.end(mb);} // Deliberately no CORS header, native browser rejection.
  });
  const relay=createHubReleaseRelay({fetchImpl:async(url)=>{
    if(url===base)return Response.json({private:false,full_name:'SheepSheepLab/MieMie-Hub'});
    if(url.endsWith('/releases/20'))return Response.json(release);
    if(url.endsWith('/assets/30'))return new Response(mb);
    if(url.endsWith('/assets/31'))return new Response(bytes);
    throw Error('Unexpected upstream');
  }});
  store=openStore(':memory:');
  app=createApp({store,config:loadConfig({NODE_ENV:'test',SESSION_SECRET:'x'.repeat(48),CORS_ORIGINS:origin,DATABASE_PATH:':memory:'}),hubRelay:{read:async(...args)=>{
    if(mode==='slow')await new Promise(r=>setTimeout(r,150));
    if(mode==='error')throw Object.assign(Error('fixture offline'),{status:502,code:'github_unavailable'});
    const b=await relay.read(...args);return mode==='tamper'?Buffer.from('tampered'):b;
  }}});
  const gateway=await serve((req,res)=>{if(req.headers.cookie||req.headers.authorization)credentials++;return app.handler(req,res);});
  browser=await chromium.launch({headless:true});const page=await browser.newPage();page.on('console',m=>{if(/CORS|Access-Control-Allow-Origin/.test(m.text()))cors++;});
  async function run({service=gateway,timeout=5000,dispose=false}={}){
    await page.goto(origin);
    return page.evaluate(async({base,upstream,service,timeout,dispose,oldContent,newContent})=>{
      const {createHubSelfUpdater}=await import('/src/hub-self-update.js');
      const {createHubScriptHost}=await import('/src/hub-script-host.js');
      let trees=[{type:'script',id:'installed-instance',enabled:true,name:'Renamed Hub',content:oldContent,data:{keep:'original'},info:'custom'}],writes=0;
      const saved=structuredClone(trees),storage=new Map();
      const updater=createHubSelfUpdater({currentVersion:'0.5.1',host:createHubScriptHost({currentVersion:'0.5.1',getScriptId:()=> 'installed-instance',getScriptTrees:()=>structuredClone(trees),updateScriptTreesWith:fn=>{trees=fn(structuredClone(trees));writes++;}}),
        storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},backup:()=>{},getRegistryBaseURL:()=>service,
        metadataTimeoutMs:timeout,assetTimeoutMs:timeout,fetch:(url,init)=>fetch(url.startsWith(base)?upstream+new URL(url).pathname:url,init)});
      const operation=updater.start({releaseId:20,tag:'v0.5.2',version:'0.5.2'});
      if(dispose)setTimeout(()=>updater.dispose(),20);
      try {const state=await operation;return {state,writes,trees,saved,correctContent:trees[0].content===newContent};}finally{updater.dispose();}
    },{base,upstream,service,timeout,dispose,oldContent:content('0.5.1'),newContent:content('0.5.2')});
  }
  const absent=await run({service:''});assert.equal(absent.writes,0);assert.equal(absent.state.status,'failed');assert.ok(blocked>0&&cors>0);
  const good=await run();assert.equal(good.writes,1);assert.equal(good.state.status,'awaiting-reload');assert.ok(good.correctContent);assert.equal(good.trees.length,1);assert.equal(good.trees[0].id,'installed-instance');assert.deepEqual(good.trees[0].data,good.saved[0].data);
  for(const next of ['tamper','error','slow']){mode=next;const r=await run({timeout:next==='slow'?50:5000});assert.equal(r.writes,0);assert.equal(r.state.status,'failed');}
  mode='slow';const cancelled=await run({dispose:true});assert.equal(cancelled.writes,0);assert.equal(credentials,0);
  console.log('PASS 6 real Chromium Hub update CORS paths: absent service, verified fallback, tamper, HTTP failure, timeout, teardown. Instance/data retained; no credentials.');
} finally {await browser?.close();app?.close();for(const s of servers){s.closeAllConnections();await new Promise(r=>s.close(r));}store?.close();}
