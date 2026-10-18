// Real isolated Tavern persistence + real Helper execution. GitHub transport is
// a generic local fixture; this does not exercise production GitHub or Registry.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {packageFixture,packageRoutes,packageHash,PACKAGE_REPO,PACKAGE_API,PACKAGE_PRODUCT} from '../fixtures/package-v2.mjs';
import {createDriver,click,wait,settle} from './driver.mjs';
const host=process.env.TEST_HOST||'http://127.0.0.1:48190/';
assert.ok(['http://127.0.0.1:48190/','http://127.0.0.1:48193/'].includes(host));
const out=new URL('../../test-results/phase4-packages/',import.meta.url);await mkdir(out,{recursive:true});
const bytes=await readFile(new URL('../../build/MieMie-Hub-0.9.0.json',import.meta.url));
const hub={...JSON.parse(bytes),id:'99000000-0000-4000-8000-000000000001',name:'PHASE4 ISOLATED Hub',enabled:true};
const v1=packageFixture('1.0.0',2),v2=packageFixture('2.0.0',2),legacy=packageFixture('1.0.0',1),bad=packageFixture('3.0.0',1);
let routes=packageRoutes([v1]),dialogAccept=true,delayAsset=false,releaseAsset, d,versions;
const errors=[],results=[],observations={};
const card='[data-extension-id="'+PACKAGE_PRODUCT+'"]';
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.stack});throw e;}}
async function installed(){await click(d,'[data-center-tab="installed"]');await wait(d,s=>document.querySelector(s),card);await settle(d);}
const action=async key=>{await click(d,'[data-action="'+PACKAGE_PRODUCT+':'+key+'"]');};
async function disk(){return d.eval(async()=>{const r=await fetch('/api/settings/get',{method:'POST',headers:SillyTavern.getContext().getRequestHeaders(),body:'{}'});const j=await r.json();return JSON.parse(j.settings).extension_settings.tavern_helper.script.scripts;});}
async function saved(predicate){const end=Date.now()+20000;while(Date.now()<end){const tree=await disk();if(predicate(tree))return tree;await new Promise(r=>setTimeout(r,100));}throw Error('Real server persistence was not confirmed');}
const flatten=tree=>tree.flatMap(x=>x.type==='folder'?x.scripts:[x]);
async function preview(){await click(d,'[data-center-tab="discover"]');await settle(d);await d.eval(()=>document.querySelector('.mm-center-main details').open=true);await d.fill('[aria-label="GitHub Repository URL"]',PACKAGE_REPO);await click(d,'[data-action="github:preview"]');await wait(d,()=>document.querySelector('[data-package-preview]'));}
async function install(){await preview();await click(d,'[data-action="package:install"]');await wait(d,s=>document.querySelector(s),card,60000);await wait(d,id=>__MieMieHub.extensions.get(id)?.enabled,PACKAGE_PRODUCT,60000);}
try{
 d=await createDriver('chromium',errors);d.page.on('dialog',dlg=>dialogAccept?dlg.accept():dlg.dismiss());
 await d.page.route(PACKAGE_API+'**',async route=>{
   const url=route.request().url();if(delayAsset&&url===v1.release.assets[0].url)await new Promise(r=>{releaseAsset=r;});
   const value=routes[url];await route.fulfill({status:value===undefined?404:200,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:typeof value==='string'?value:JSON.stringify(value??{})}).catch(()=>{});
 });
 await d.goto(host);await wait(d,()=>!!window.TavernHelper,null,60000);await wait(d,()=>!document.querySelector('.splash-screen'));
 await d.eval(()=>TavernHelper.replaceScriptTrees([],{type:'global'}));await wait(d,()=>!window.__MieMieHub);await d.eval(()=>localStorage.clear());
 versions=await d.eval(async()=>({tavern:await TavernHelper.getTavernVersion(),helper:await TavernHelper.getTavernHelperVersion(),userAgent:navigator.userAgent}));
 await d.eval(h=>TavernHelper.replaceScriptTrees([h],{type:'global'}),hub);await wait(d,()=>window.__MieMieHub?.apiVersion===2,null,60000);await d.eval(()=>__MieMieHub.ready);
 await d.eval(()=>__MieMieHub.open());await settle(d);await click(d,'[data-hub-app="extension-center"]');await settle(d);
 await check('API2 first install through built Hub UI, actual Helper registration and server readback',async()=>{
  await install();const savedTree=await saved(t=>flatten(t).some(x=>x.content===v1.script.content));const item=flatten(savedTree).find(x=>x.content===v1.script.content);
  assert.notEqual(item.id,v1.script.id);assert.deepEqual(item.data,{});assert.equal(await d.eval(id=>__MieMieHub.extensions.get(id).manifest.version,PACKAGE_PRODUCT),'1.0.0');observations.installedInstance=item.id;await installed();assert.match(await d.eval(s=>document.querySelector(s).textContent,card),/Runtime 可用/);
 });
 await check('API2 update retains instance/custom name/data/folder/order/enabled and confirms new Runtime',async()=>{
  await d.eval(id=>TavernHelper.updateScriptTreesWith(t=>{const i=t.findIndex(x=>x.id===id),script=t.splice(i,1)[0];script.name='Phase4 用户名称';script.data={draft:'原稿',nested:{value:7}};t.push({type:'folder',id:'99000000-0000-4000-8000-000000000004',name:'Phase4 test folder',enabled:true,icon:'fa-folder',color:'#123456',scripts:[script]});return t;},{type:'global'}),observations.installedInstance);
  await saved(t=>t.at(-1).type==='folder');const before=await disk();routes=packageRoutes([v1,v2]);await installed();await action('check');await wait(d,()=>document.querySelector('[data-action="fixture.package-contract:update"]'));await action('update');
  await wait(d,()=>document.documentElement.textContent.includes('更新完成：'),null,60000);const after=await saved(t=>t.at(-1).scripts[0].content===v2.script.content);assert.equal(after.at(-1).scripts[0].name,'Phase4 用户名称 2.0.0');after.at(-1).scripts[0].content=before.at(-1).scripts[0].content;after.at(-1).scripts[0].name=before.at(-1).scripts[0].name;assert.deepEqual(after,before);
  assert.equal(await d.eval(id=>__MieMieHub.extensions.get(id).manifest.version,PACKAGE_PRODUCT),'2.0.0');assert.equal(await d.eval(()=>!!document.querySelector('[data-action="fixture.package-contract:update"]')),false);observations.preservedFields=true;
 });
 await check('uninstall cancellation retains script/data; confirmed physical removal reaches server',async()=>{
  dialogAccept=false;await action('uninstall');await wait(d,()=>document.documentElement.textContent.includes('已取消卸载'));assert.ok(flatten(await disk()).some(x=>x.id===observations.installedInstance));
  dialogAccept=true;await action('uninstall');await wait(d,id=>!__MieMieHub.extensions.get(id),PACKAGE_PRODUCT);await saved(t=>!flatten(t).some(x=>x.id===observations.installedInstance));
 });
 await check('legacy API1 physically recognized, unknown until exact-version proof, never registered in Runtime2',async()=>{
  // Independent legacy-upgrade scenario: remove only this fixture's prior explicit Runtime-uninstall preference, then reload Hub.
  await d.eval(id=>{const key='miemie_hub_extensions_v1',s=JSON.parse(localStorage.getItem(key));delete s.extensions[id];localStorage.setItem(key,JSON.stringify(s));},PACKAGE_PRODUCT);
  await d.page.reload();await wait(d,()=>window.__MieMieHub?.apiVersion===2,null,60000);await d.eval(()=>__MieMieHub.ready);await d.eval(()=>__MieMieHub.open());await settle(d);await click(d,'[data-hub-app="extension-center"]');await settle(d);
  routes=packageRoutes([legacy,v2]);await d.eval(s=>TavernHelper.updateScriptTreesWith(t=>{t.push({...s,id:'99000000-0000-4000-8000-000000000005',name:'Phase4 旧版用户名称',data:{draft:'API1 原数据'}});return t;},{type:'global'}),legacy.script);
  await saved(t=>flatten(t).some(x=>x.content===legacy.script.content));await installed();assert.match(await d.eval(s=>document.querySelector(s).textContent,card),/API 未确认/);assert.equal(await d.eval(id=>__MieMieHub.extensions.get(id),PACKAGE_PRODUCT),null);
  await action('verify-api');await wait(d,s=>document.querySelector(s)?.textContent.includes('版本不兼容'),card);assert.match(await d.eval(s=>document.querySelector(s).textContent,card),/API 1/);
 });
 await check('safe API1 to API2 upgrade verifies target before write and waits for new registration and durable save',async()=>{
  await action('check');await wait(d,()=>document.querySelector('[data-action="fixture.package-contract:update"]'));await action('update');await wait(d,()=>document.documentElement.textContent.includes('更新完成：'),null,60000);
  const tree=await saved(t=>flatten(t).some(x=>x.content===v2.script.content));const item=flatten(tree).find(x=>x.content===v2.script.content);assert.equal(item.id,'99000000-0000-4000-8000-000000000005');assert.deepEqual(item.data,{draft:'API1 原数据'});assert.equal(item.name,'Phase4 旧版用户名称 2.0.0');assert.equal(await d.eval(id=>__MieMieHub.extensions.get(id).manifest.apiVersion,PACKAGE_PRODUCT),2);
 });
 await check('highest incompatible release is visibly refused, no fallback and no write',async()=>{
  const before=await disk();routes=packageRoutes([legacy,v2,bad]);await action('check');await wait(d,s=>document.querySelector(s)?.textContent.includes('最新版本：3.0.0'),card);assert.equal(await d.eval(()=>!!document.querySelector('[data-action="fixture.package-contract:update"]')),false);assert.deepEqual(await disk(),before);
 });
 await d.screenshot(new URL('installed.png',out).pathname);
 await check('final physical uninstall and reload prove server removal and preserve external storage',async()=>{
  await d.eval(()=>localStorage.setItem('phase4-external-sentinel','保留'));await action('uninstall');await saved(t=>!flatten(t).some(x=>x.content.startsWith('// MieMie-Extension-Build:')));await d.page.reload();await wait(d,()=>window.__MieMieHub?.apiVersion===2,null,60000);assert.equal(await d.eval(()=>localStorage.getItem('phase4-external-sentinel')),'保留');assert.equal(await d.eval(id=>__MieMieHub.extensions.get(id),PACKAGE_PRODUCT),null);
 });
 await check('no uncaught browser errors',async()=>assert.deepEqual(errors,[]));
}catch(error){errors.push(error.stack);console.error(error.stack);process.exitCode=1;await d?.screenshot(new URL('failure.png',out).pathname).catch(()=>{});}
finally{releaseAsset?.();if(d)await d.eval(()=>TavernHelper.replaceScriptTrees([],{type:'global'})).catch(()=>{});await writeFile(new URL('results.json',out),JSON.stringify({scope:'Real isolated Tavern/Helper/UI/persistence; simulated GitHub fixtures, no production Registry',versions,engine:d?.version,artifactSha256:packageHash(bytes),results,observations,errors},null,2));await d?.close();}
