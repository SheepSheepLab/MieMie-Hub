// Real keyboard/native-dialog browser regression against the complete local Hub
// artifact. All Tavern/Registry services are fixtures, never a user's host.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const version=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8')).version;
const artifactPath=process.env.HUB_ARTIFACT||new URL('../../build/MieMie-Hub-'+version+'.json',import.meta.url);
const bytes=await readFile(artifactPath),artifact=JSON.parse(bytes);
const output=new URL('../../test-results/back-browser/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[],errors=[];let context;
async function check(name,fn){await fn();results.push({name,passed:true});console.log('PASS '+name);}
try{
 context=await browser.newContext({reducedMotion:'reduce'});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:'<!doctype html><body><h1>Isolated Back Fixture</h1></body>'}):route.abort());
 await page.goto('https://back-fixture.invalid/');
 await page.evaluate(()=>{
  window.SillyTavern={getContext:()=>({characterId:null,characters:[],chat:[],eventTypes:Object.fromEntries(['GENERATION_STARTED','GENERATION_ENDED','MESSAGE_RECEIVED','GENERATION_STOPPED','CHAT_CHANGED'].map(x=>[x,x]))})};
  window.fixtureCalls={cancel:0,back:0};
 });
 await page.evaluate(async()=>{const f=document.createElement('iframe');f.id='hub-frame';f.style.display='none';f.srcdoc='<!doctype html>';const ready=new Promise(r=>f.onload=r);document.body.append(f);await ready;});
 const frame=page.frames().find(f=>f!==page.mainFrame());
 await frame.evaluate(source=>{
  window.getVariables=()=>({});window.replaceVariables=()=>{};window.getCharWorldbookNames=()=>({primary:'',additional:[]});window.eventOn=()=>({stop(){}});
  window.fetch=async()=>Response.json({items:[]});window.eval(source);
 },artifact.content);
 await page.evaluate(()=>window.__MieMieHub.ready);
 const fixtureSource=(await readFile(new URL('../fixtures/back-extension.js',import.meta.url),'utf8')).replace('export function','function');
 await page.evaluate(fixtureSource+'\nwindow.createBackFixture=createBackFixture;');
 async function open(id){await page.evaluate(()=>__MieMieHub.open());await page.locator('[data-hub-app="'+id+'"]').click();await page.waitForFunction(id=>document.querySelector('[data-back-fixture="'+id+'"]')?.dataset.surfaceState==='open',id);}
 await page.evaluate(async()=>{window.probe=createBackFixture(document);window.lease=__MieMieHub.extensions.provide(probe.manifest,probe.factory);await lease.ready;});
 await open('test.back.layers');
 await check('three independent trusted Escape presses each remove one internal layer',async()=>{
  for(let n=2;n>=0;n--){await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>probe.remaining),n);assert.equal(await page.evaluate(()=>probe.panel.hidden),false);}
 });
 await check('held Escape fallback closes only Surface and retains Honeycomb and instance',async()=>{
  await page.keyboard.down('Escape');await page.waitForFunction(()=>probe.panel.hidden);for(let i=0;i<4;i++)await page.keyboard.down('Escape');
  assert.equal(await page.evaluate(()=>document.querySelector('#meeme-combined-menu').hidden),false);assert.equal(await page.evaluate(()=>probe.factories),1);
  await page.keyboard.up('Escape');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('#meeme-combined-menu').hidden);
 });
 await check('body portal native modal and picker return once with no native cancel double handling',async()=>{
  await page.evaluate(async()=>{
   const id='test.native.back';window.nativeApi=null;window.nativeMode='normal';window.nativeBusy=false;
   window.nativeLease=__MieMieHub.extensions.provide({schemaVersion:1,apiVersion:1,id,name:'Native fixture',version:'1.0.0',contributes:{launcher:{title:'Native fixture'}}},api=>{
    nativeApi=api;return {activate(){
     window.nativePanel=document.createElement('section');nativePanel.tabIndex=-1;nativePanel.dataset.backFixture=id;nativePanel.textContent='Native fixture';document.body.append(nativePanel);api.attachPanel(nativePanel);api.onCleanup(()=>{nativePanel.remove();window.child?.remove();});
     api.registerBackHandler(request=>{fixtureCalls.back++;window.nativeRequest=request;if(nativeMode==='throw')throw Error('Fixture draft');if(nativeBusy)return true;if(window.picker&&!picker.hidden){picker.hidden=true;return true;}if(window.child?.open){child.close();return true;}return false;});
    },open(){return api.showPanel();}};
   });await nativeLease.ready;
  });await open('test.native.back');
  await page.evaluate(()=>{window.child=document.createElement('dialog');child.innerHTML='<button id="native-picker">Picker</button><button id="native-child-back">Dialog</button>';window.picker=child.firstChild;child.addEventListener('cancel',event=>{fixtureCalls.cancel++;event.preventDefault();child.close();});document.body.append(child);child.showModal();picker.focus();});
  await page.keyboard.down('Escape');for(let i=0;i<3;i++)await page.keyboard.down('Escape');await page.keyboard.up('Escape');
  assert.deepEqual(await page.evaluate(()=>[picker.hidden,child.open,nativePanel.hidden,fixtureCalls.cancel,fixtureCalls.back]),[true,true,false,0,1]);
  await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>[child.open,nativePanel.hidden,fixtureCalls.cancel,fixtureCalls.back]),[false,false,0,2]);
 });
 await check('independent native cancel belongs to the extension and never closes Surface',async()=>{
  await page.evaluate(()=>{child.showModal();child.requestClose();});assert.deepEqual(await page.evaluate(()=>[child.open,nativePanel.hidden,fixtureCalls.cancel]),[false,false,1]);
 });
 await check('closed Shadow DOM uses active owner without target ancestry',async()=>{
  await page.evaluate(()=>{nativeBusy=true;const host=document.createElement('div');document.body.append(host);const root=host.attachShadow({mode:'closed'}),button=document.createElement('button');button.textContent='Shadow';root.append(button);button.focus();window.shadowHost=host;});
  const before=await page.evaluate(()=>fixtureCalls.back);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>fixtureCalls.back),before+1);assert.equal(await page.evaluate(()=>nativePanel.hidden),false);await page.evaluate(()=>{nativeBusy=false;shadowHost.remove();});
 });
 await check('fault recovery remains reachable above native modal, Escape keeps draft, retry and explicit close work',async()=>{
  await page.evaluate(()=>{nativeMode='throw';child.showModal();});await page.keyboard.press('Escape');await page.locator('[data-back-recovery]').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>nativePanel.hidden),false);assert.equal(await page.evaluate(()=>document.activeElement.textContent),'保留界面');
  await page.screenshot({path:new URL('fault-recovery.png',output).pathname});
  await page.keyboard.press('Escape');assert.equal(await page.locator('[data-back-recovery]').count(),0);assert.equal(await page.evaluate(()=>child.open),true);
  await page.keyboard.press('Escape');await page.evaluate(()=>nativeMode='normal');await page.getByRole('button',{name:'重试返回',exact:true}).click();assert.equal(await page.evaluate(()=>child.open),false);assert.equal(await page.evaluate(()=>nativePanel.hidden),false);
  await page.evaluate(()=>nativeMode='throw');await page.keyboard.press('Escape');await page.getByRole('button',{name:'关闭当前界面',exact:true}).click();await page.waitForFunction(()=>nativePanel.hidden);
 });
 await check('stale asynchronous request cannot authorize work after same-session reopen',async()=>{
  await page.evaluate(async()=>{nativeMode='normal';nativeBusy=true;await nativeApi.showPanel();});await page.keyboard.press('Escape');
  await page.evaluate(async()=>{window.oldRequest=nativeRequest;await nativeApi.closePanel();await nativeApi.showPanel();});assert.equal(await page.evaluate(()=>oldRequest.isCurrent()),false);
 });
 await check('disable, re-enable, source release and Hub disposal revoke old request contexts',async()=>{
  await page.keyboard.press('Escape');await page.evaluate(async()=>{window.oldRequest=nativeRequest;await __MieMieHub.extensions.disable('test.native.back');});assert.equal(await page.evaluate(()=>oldRequest.isCurrent()),false);
  await page.evaluate(()=>__MieMieHub.extensions.enable('test.native.back'));await open('test.native.back');await page.keyboard.press('Escape');await page.evaluate(async()=>{window.oldRequest=nativeRequest;await nativeLease.release();});assert.equal(await page.evaluate(()=>oldRequest.isCurrent()),false);
  await page.evaluate(()=>document.querySelector('#hub-frame').remove());await page.waitForFunction(()=>!window.__MieMieHub);assert.equal(await page.locator('[data-back-recovery]').count(),0);
 });
 assert.deepEqual(errors,[]);
 const report={engine:browser.version(),scope:'Chromium with complete candidate Hub, mocked Tavern services; not real Tavern or Safari',sha256:createHash('sha256').update(bytes).digest('hex'),passed:results.length,failed:0,results,errors};
 await writeFile(new URL('results.json',output),JSON.stringify(report,null,2)+'\n');
}finally{await context?.close();await browser.close();}
