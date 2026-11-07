// Isolated Chromium host; no real Tavern, Registry or external Extension.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {installNativeWindowAcceptance} from '../fixtures/native-window-extension.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const pkg=JSON.parse(await readFile(new URL('../../package.json',import.meta.url)));
const bytes=await readFile(new URL('../../build/MieMie-Hub-'+pkg.version+'.json',import.meta.url));
const artifact=JSON.parse(bytes),out=new URL('../../test-results/native-browser/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),results=[],errors=[];let context;
async function check(name,fn){await fn();results.push({name,passed:true});console.log('PASS '+name);}
try{
 context=await browser.newContext({viewport:{width:1200,height:900},reducedMotion:'reduce'});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:'<!doctype html><body><input id="outside"><div id="host-content">Isolated host</div></body>'}):route.abort());
 await page.goto('https://native-fixture.invalid');await page.evaluate(()=>{window.SillyTavern={getContext:()=>({characters:[],chat:[],eventTypes:{}})};});
 const frame=await page.evaluateHandle(async()=>{const f=document.createElement('iframe');f.id='fixture-frame';f.style.display='none';f.srcdoc='<!doctype html>';document.body.append(f);await new Promise(r=>f.onload=r);return f;});
 const scope=await frame.asElement().contentFrame();await scope.evaluate(content=>{window.getCharWorldbookNames=()=>({primary:'',additional:[]});window.getVariables=()=>({});window.replaceVariables=()=>{};window.eventOn=()=>({stop(){}});window.fetch=async()=>({ok:true,json:async()=>({items:[]})});eval(content);},artifact.content);
 await page.evaluate(()=>__MieMieHub.ready);await page.evaluate(source=>{window.installNative=eval('('+source+')');installNative(document.querySelector('#fixture-frame').contentWindow);},installNativeWindowAcceptance.toString());
 await page.waitForFunction(()=>__MieMieNativeAcceptance.stats.active===1);
 const id='test.miemie.native-window-parity',panel=page.locator('[data-native-parity-panel]');
 async function preference(value){await page.evaluate(()=>__meemeCombinedUI.open());await page.locator('[data-hub-app="extension-center"]').click();await page.locator('[data-center-tab="installed"]').click();await page.locator('[data-shortcut="'+id+'"]').setChecked(value);await page.evaluate(()=>__meemeCombinedUI.toggle());}
 await preference(true);
 await check('native toggle, draft and real pointer capture drag/resize',async()=>{
  await page.locator('[data-native-parity-orb]').click();await panel.locator('textarea').fill('BROWSER DRAFT');const box=await panel.locator('[data-native-drag]').boundingBox();
  await page.mouse.move(box.x+15,box.y+10);await page.mouse.down();assert.equal(await panel.locator('[data-native-drag]').evaluate(n=>n.hasPointerCapture(1)),true);await page.mouse.move(box.x+100,box.y+65);await page.mouse.up();
  assert.equal(await page.evaluate(()=>__MieMieNativeAcceptance.snapshot().business.rect.x),205);
  const resize=await panel.locator('[data-native-resize]').boundingBox();await page.mouse.move(resize.x+5,resize.y+5);await page.mouse.down();await page.mouse.move(resize.x+65,resize.y+45);await page.mouse.up();assert.equal(await page.evaluate(()=>__MieMieNativeAcceptance.snapshot().business.rect.w),420);
 });
 await check('native dialog top layer, internal views and Escape belong to provider',async()=>{
  await panel.locator('[data-open-dialog]').click();assert.equal(await panel.locator('dialog').evaluate(n=>n.matches(':modal')),true);await panel.locator('[data-open-dropdown]').click();await page.keyboard.press('Escape');assert.equal(await panel.locator('[data-native-dropdown]').isVisible(),false);assert.equal(await panel.locator('dialog').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await panel.locator('dialog').isVisible(),false);assert.equal(await panel.isVisible(),true);
 });
 await check('ordinary foreground obeys Hub; browser top-layer retains browser precedence',async()=>{
  await page.evaluate(()=>__MieMieHub.open());assert.equal(await panel.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+10,r.y+10));}),false);
  await page.evaluate(()=>__meemeCombinedUI.toggle());assert.equal(await panel.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+10,r.y+10));}),true);
  await panel.locator('[data-open-dialog]').click();await page.evaluate(()=>__MieMieHub.open());assert.equal(await panel.locator('dialog').evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);await page.keyboard.press('Escape');await page.evaluate(()=>__meemeCombinedUI.toggle());
 });
 await check('Portal, closed Shadow, IME and unknown native input avoid Hub capture',async()=>{
  await page.evaluate(()=>{
   const hub=__MieMieHub,id='test.browser.portal';let panel,portal,shadow,dialog,lease;
   window.portalEvents=0;const source=hub.extensions.provide({schemaVersion:1,apiVersion:2,id,name:'Portal fixture',version:'1.0.0',contributes:{launcher:{title:'Portal'}}},api=>({activate(){
    panel=document.createElement('section');panel.tabIndex=-1;panel.hidden=true;document.body.append(panel);portal=document.createElement('input');portal.id='owned-portal';document.body.append(portal);shadow=document.createElement('div');document.body.append(shadow);const root=shadow.attachShadow({mode:'closed'}),input=document.createElement('input');root.append(input);window.shadowInput=input;
    api.attachPanel(panel);api.registerNativeWindow({mount({open}){const orb=document.createElement('button');orb.id='portal-orb';orb.onclick=open;document.body.append(orb);return {getOrigin:()=>orb,dispose:()=>orb.remove()};},open(l){lease=l;panel.hidden=false;panel.inert=false;},release(){},ownsEvent:e=>e.composedPath().includes(portal)||e.composedPath().includes(shadow)});api.onCleanup(()=>{panel.remove();portal.remove();shadow.remove();});
    for(const n of [portal,input])n.addEventListener('keydown',()=>portalEvents++);
   },open:l=>api.showPanel(l)}));window.portalReady=source.ready;
  });await page.evaluate(()=>portalReady);await page.evaluate(()=>__MieMieHub.open());await page.locator('[data-hub-app="extension-center"]').click();await page.locator('[data-center-tab="installed"]').click();await page.locator('[data-shortcut="test.browser.portal"]').check();await page.evaluate(()=>document.querySelector('#portal-orb').click());await page.evaluate(()=>__MieMieHub.open());
  const result=await page.evaluate(()=>{for(const n of [document.querySelector('#owned-portal'),shadowInput]){n.focus();for(const opts of [{},{isComposing:true},{keyCode:229}]){const e=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,composed:true,cancelable:true,...opts});n.dispatchEvent(e);if(e.defaultPrevented)return false;}}return document.querySelector('#meeme-combined-menu').dataset.open==='true';});assert.equal(result,true);assert.equal(await page.evaluate(()=>portalEvents),6);await page.evaluate(()=>__MieMieHub.extensions.uninstall('test.browser.portal'));await page.evaluate(()=>__meemeCombinedUI.toggle());
 });
 await check('dual entrances preserve draft and one business hook',async()=>{
  await page.evaluate(id=>__MieMieHub.extensions.open(id),id);assert.equal(await panel.locator('textarea').inputValue(),'BROWSER DRAFT');await panel.locator('[data-native-close]').click();await page.evaluate(()=>__meemeCombinedUI.toggle());await page.locator('[data-native-parity-orb]').click();assert.equal(await panel.locator('textarea').inputValue(),'BROWSER DRAFT');assert.equal(await page.evaluate(()=>__MieMieNativeAcceptance.stats.factories),1);assert.equal(await page.evaluate(()=>__MieMieNativeAcceptance.stats.hooks),1);
 });
 await page.screenshot({path:new URL('native-parity.png',out).pathname});
 await check('normal bundled Timeline and Hub reload release all old fixture business',async()=>{
  assert.equal(await page.evaluate(()=>__MieMieHub.extensions.get('miemie.timeline').enabled),true);
  await page.evaluate(async()=>{const hub=__MieMieHub;document.querySelector('#fixture-frame').contentWindow.dispatchEvent(new Event('pagehide'));await hub.whenDisposed;});assert.equal(await page.locator('[data-native-parity-panel]').count(),0);assert.deepEqual(errors,[]);
 });
}finally{await writeFile(new URL('results.json',out),JSON.stringify({artifactSha256:createHash('sha256').update(bytes).digest('hex'),browser:browser.version(),results,errors},null,2));await context?.close();await browser.close();}
