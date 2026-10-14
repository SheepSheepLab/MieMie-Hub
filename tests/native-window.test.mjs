import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createSurfaceController} from '../src/surface-controller.js';
import {createExtensionRuntime} from '../src/extension-runtime.js';
import {createShortcutLaunchers} from '../src/shortcut-launchers.js';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(t,{animation=false,beforeHubOpen}={}){
 const dom=new JSDOM('<body><div id="shell"></div><div id="menu"><button id="icon">Icon</button></div><button id="hub">Hub</button>',{url:'https://native.invalid'}),host=dom.window,doc=host.document,root=doc.getElementById('menu'),panels=new Set(),entries=new Map(),errors=[],counts={factory:0,active:0,peak:0,hubOpen:0,nativeOpen:0,release:0};let controller,manager,mode='hub',lease,api,broken=false;host.matchMedia=()=>({matches:!animation});
 const launcher={originRect:()=>null,originElement:()=>doc.getElementById('icon'),capture:()=>({}),resume(){root.inert=false;},suspend(){root.inert=true;},async open(){root.hidden=false;},async close(){root.hidden=true;},highlight(){}};
 const place=()=>{for(const panel of panels)if(!controller.ownsNative(panel))Object.assign(panel.style,{position:'fixed',width:'600px',height:'700px'});};
 controller=createSurfaceController({host,shell:{root:doc.getElementById('shell'),orb:doc.getElementById('hub')},root,launcher,panels,resolve:k=>entries.get(k),place,onState(){},onError:e=>errors.push(e.message)});
 const runtime=createExtensionRuntime({onChange:()=>manager?.sync(),onPanel(id,title,panel){let saved={style:panel.getAttribute('style'),hidden:panel.hidden,inert:panel.inert};const entry={owner:id,panel,restoreNative(){if(saved.style===null)panel.removeAttribute('style');else panel.setAttribute('style',saved.style);panel.hidden=saved.hidden;panel.inert=saved.inert;},saveNative(){saved={style:panel.getAttribute('style'),hidden:panel.hidden,inert:panel.inert};}};entries.set('panel:'+id,entry);panels.add(panel);panel.hidden=panel.inert=true;place();return ()=>{controller.revoke(id);panels.delete(panel);entries.delete('panel:'+id);};},onNativeWindow:(id,p)=>controller.registerNativeWindow(id,p),onBeforeOpen:id=>controller.acquireHub(id),onShowPanel:id=>controller.ownsNative(entries.get('panel:'+id)?.panel)?false:controller.go('panel:'+id),onClosePanel:id=>controller.close('panel:'+id),onShortcut:(id,mount)=>manager.register(id,mount)});
 manager=createShortcutLaunchers({host,runtime,launch:(id,open,origin)=>controller.launch(id,open,origin),openNative:(id,origin)=>controller.openNative(id,origin),releaseNative:id=>controller.acquireHub(id),onError:e=>errors.push(e)});
 const id='test.native';runtime.register({id,name:'Native',schemaVersion:1,apiVersion:1,version:'1.0.0',contributes:{launcher:{title:'Native'}}},a=>{api=a;counts.factory++;let panel;return {activate(){counts.active++;counts.peak=Math.max(counts.peak,counts.active);panel=doc.createElement('section');panel.tabIndex=-1;panel.innerHTML='<input value="DRAFT"><span hidden>Own hidden</span>';panel.style.width='320px';panel.hidden=true;doc.body.append(panel);a.attachPanel(panel);a.registerNativeWindow({open(l){mode='native';lease=l;counts.nativeOpen++;panel.hidden=!panel.hidden;panel.inert=false;panel.focus();},release(){counts.release++;if(broken)throw Error('release failed');mode='hub';},ownsEvent:e=>e.target?.id==='portal'});a.registerShortcutLauncher({mount({open}){const orb=doc.createElement('button');orb.id='native';orb.onclick=open;doc.body.append(orb);return {getOrigin:()=>orb,dispose:()=>orb.remove()};}});a.onCleanup(()=>{panel.remove();counts.active--;});},async open(){counts.hubOpen++;if(beforeHubOpen)await beforeHubOpen(counts.hubOpen);return a.showPanel();}};});
 t.after(async()=>{await runtime.dispose();manager.dispose();controller.dispose();host.close();});
 return {host,doc,root,id,runtime,manager,controller,counts,errors,api:()=>api,panel:()=>entries.get('panel:'+id)?.panel,mode:()=>mode,lease:()=>lease,breakRelease(){broken=true;},async enable(){await runtime.enable(id);manager.set(id,true);},async native(){return doc.getElementById('native').onclick();},async hub(){return controller.launch(id,()=>runtime.open(id));}};
}
test('dual entries share one session/draft; native toggle and Hub Back use independent ownership',async t=>{
 const f=fixture(t);await f.enable();const p=f.panel();await f.native();assert.equal(f.mode(),'native');assert.equal(p.hidden,false);assert.equal(p.inert,false);assert.equal(p.style.width,'320px');assert.equal(f.runtime.get(f.id).launcherAvailable,true);assert.equal(f.runtime.get(f.id).nativeWindowAvailable,true);p.querySelector('input').value='UNSAVED';await f.native();assert.equal(p.hidden,true);await f.native();assert.equal(p.hidden,false);const old=f.lease();await f.hub();assert.equal(old.signal.aborted,true);assert.equal(old.isCurrent(),false);assert.equal(f.mode(),'hub');assert.equal(p.style.width,'600px');assert.equal(p.dataset.surfaceState,'open');await f.controller.close('panel:'+f.id);await f.native();assert.equal(p.style.width,'320px');assert.equal(p.querySelector('input').value,'UNSAVED');assert.equal(p.querySelector('span').hidden,true);assert.equal(f.counts.factory,1);assert.equal(f.counts.peak,1);assert.deepEqual(f.errors,[]);
});
test('Hub hide/layout/resize and unrelated navigation never write a native-owned root',async t=>{
 const f=fixture(t);await f.enable();await f.native();const p=f.panel();p.style.width='387px';p.inert=true;const attrs=p.outerHTML;await f.controller.go('menu');f.controller.resize();await f.controller.go('closed');assert.equal(p.outerHTML,attrs);assert.equal(f.controller.backContext().owner,undefined);assert.equal(await f.api().showPanel(),false);assert.equal(await f.api().closePanel(),false);
});
test('native event delegation scopes panel, orb and declared portal; unrelated Hub keys stay Hub',async t=>{
 const f=fixture(t);await f.enable();await f.native();const p=f.panel();let event; p.addEventListener('keydown',e=>event=e);p.dispatchEvent(new f.host.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.controller.nativeEvent(event),true);f.doc.getElementById('hub').focus();assert.equal(f.controller.nativeEvent(new f.host.KeyboardEvent('keydown',{key:'Escape'})),false);const portal=f.doc.createElement('button');portal.id='portal';f.doc.body.append(portal);portal.addEventListener('keydown',e=>event=e);portal.dispatchEvent(new f.host.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.controller.nativeEvent(event),true);
});
test('disable revokes lease and stale open before cleanup; re-enable creates exactly one valid session',async t=>{
 const f=fixture(t);await f.enable();await f.native();const old=f.lease(),callback=f.doc.getElementById('native').onclick,oldApi=f.api();const task=f.runtime.disable(f.id);assert.equal(old.signal.aborted,true);assert.equal(old.isCurrent(),false);assert.equal(f.doc.getElementById('native'),null);assert.equal(await callback(),false);await task;assert.equal(oldApi.registerNativeWindow({}),false);assert.equal(f.counts.active,0);await f.runtime.enable(f.id);assert.equal(f.doc.querySelectorAll('#native').length,1);assert.equal(f.counts.active,1);assert.equal(f.counts.peak,1);
});
test('turning Shortcut off retires native lease without factory restart and allows Honeycomb',async t=>{
 const f=fixture(t);await f.enable();await f.native();const old=f.lease();f.manager.set(f.id,false);assert.equal(old.isCurrent(),false);assert.equal(f.panel().hidden,true);assert.equal(f.mode(),'hub');await f.hub();assert.equal(f.panel().hidden,false);assert.equal(f.counts.factory,1);f.manager.set(f.id,true);await f.native();assert.equal(f.doc.querySelectorAll('#native').length,1);
});
test('native release failure preserves exclusive ownership, reports open failure, never corrupts draft',async t=>{
 const f=fixture(t);await f.enable();await f.native();f.breakRelease();const p=f.panel(),before=p.outerHTML;const result=await f.hub();assert.equal(result.ok,false);assert.equal(f.controller.ownsNative(p),true);assert.equal(p.outerHTML,before);assert.equal(f.runtime.get(f.id).enabled,true);assert.equal(f.counts.hubOpen,0);assert.ok(f.errors.includes('release failed'));
});
test('native takeover cancels opening Hub motion and prevents late hidden/inert/focus writes',async t=>{
 const f=fixture(t,{animation:true});await f.enable();const p=f.panel(),flights=[];f.host.HTMLElement.prototype.animate=()=>{let end;const finished=new Promise(r=>end=r),a={finished,cancel(){end();}};flights.push(a);return a;};const opening=f.hub();for(let i=0;i<10&&p.dataset.surfaceState!=='opening';i++)await tick();assert.equal(p.dataset.surfaceState,'opening');await f.native();const before=p.outerHTML;await opening;await tick();assert.equal(p.outerHTML,before);assert.equal(p.hidden,false);assert.equal(f.mode(),'native');assert.equal(f.lease().isCurrent(),true);assert.deepEqual(f.errors,[]);
});
test('native takeover cancels closing Hub motion and queued same-owner reopen',async t=>{
 const f=fixture(t);await f.enable();await f.hub();f.host.matchMedia=()=>({matches:false});const p=f.panel();let finish;p.animate=()=>({finished:new Promise(r=>finish=r),cancel(){finish?.();}});const closing=f.controller.close('panel:'+f.id);await tick();assert.equal(p.dataset.surfaceState,'closing');const queued=f.api().showPanel();await f.native();const before=p.outerHTML;await Promise.all([closing,queued]);assert.equal(p.outerHTML,before);assert.equal(p.hidden,false);assert.equal(f.counts.factory,1);
});
test('repeated rapid entry switches keep one factory and reject old animation completions',async t=>{
 const f=fixture(t);await f.enable();for(let i=0;i<12;i++){await f.native();const old=f.lease();await f.hub();assert.equal(old.isCurrent(),false);assert.equal(f.panel().inert,false);}assert.equal(f.counts.factory,1);assert.equal(f.counts.peak,1);assert.deepEqual(f.errors,[]);
});
test('native capability validates registration, remains session scoped and rejects async guard',async t=>{
 const f=fixture(t);let api;f.runtime.register({id:'test.no-panel',name:'Empty',schemaVersion:1,apiVersion:1,version:'1.0.0',contributes:{launcher:{title:'Empty'}}},a=>{api=a;return {open(){}};});await f.runtime.enable('test.no-panel');assert.throws(()=>api.registerNativeWindow({open(){},release(){}}),/主面板/);await f.enable();assert.throws(()=>f.api().registerNativeWindow({open(){},release(){}}),/重复/);assert.equal(f.runtime.get(f.id).nativeWindowAvailable,true);await f.runtime.disable(f.id);assert.equal(f.runtime.get(f.id).nativeWindowAvailable,false);assert.equal(f.api().registerNativeWindow({}),false);
});
test('late native completion guarded by lease cannot write after Honeycomb reacquires',async t=>{
 const f=fixture(t);await f.enable();await f.native();const old=f.lease(),p=f.panel();const late=()=>{if(old.isCurrent()&&!old.signal.aborted)p.hidden=true;};await f.hub();late();assert.equal(p.hidden,false);assert.equal(p.inert,false);assert.equal(p.dataset.surfaceState,'open');
});
test('Hub disposal retires native ownership synchronously before slow business cleanup',async t=>{
 const f=fixture(t);await f.enable();await f.native();const old=f.lease();let finish;f.api().onCleanup(()=>new Promise(r=>finish=r));const done=f.runtime.dispose();assert.equal(old.isCurrent(),false);assert.equal(old.signal.aborted,true);assert.equal(f.doc.getElementById('native'),null);for(let i=0;i<10&&!finish;i++)await tick();finish();await done;assert.equal(f.counts.active,0);assert.equal(f.doc.querySelectorAll('section').length,0);
});

test('native callbacks cannot be wrapped in asynchronous guard',async()=>{
 const runtime=createExtensionRuntime({onPanel:()=>()=>{},onNativeWindow:()=>()=>{}});let api;runtime.register({id:'test.validation',name:'Validation',schemaVersion:1,apiVersion:1,version:'1.0.0',contributes:{launcher:{title:'Validation'}}},a=>{api=a;return {activate(){a.attachPanel({});},open(){}};});await runtime.enable('test.validation');for(const name of ['open','release','ownsEvent']){const provider={open(){},release(){}};provider[name]=api.guard(()=>{});assert.throws(()=>api.registerNativeWindow(provider),/guard/);}assert.equal(runtime.get('test.validation').nativeWindowAvailable,false);await runtime.dispose();
});

test('native takeover before Hub request microtask prevents the obsolete business open',async t=>{
 const f=fixture(t);await f.enable();const old=f.hub();await f.native();await old;assert.equal(f.mode(),'native');assert.equal(f.panel().style.width,'320px');assert.equal(f.counts.hubOpen,0);
});
test('new Honeycomb request after native takeover never deduplicates to obsolete pending business open',async t=>{
 let finish;const gate=new Promise(r=>finish=r),f=fixture(t,{beforeHubOpen:n=>n===1?gate:undefined});await f.enable();const old=f.hub();for(let i=0;i<10&&!f.counts.hubOpen;i++)await tick();assert.equal(f.counts.hubOpen,1);await f.native();const fresh=f.hub();finish();await Promise.all([old,fresh]);assert.equal(f.mode(),'hub');assert.equal(f.panel().style.width,'600px');assert.equal(f.counts.hubOpen,2);assert.equal(f.counts.factory,1);assert.equal(f.panel().hidden,false);
});

test('Hub foreground changes only its own layer while native window state and session survive',async t=>{
 const f=fixture(t);await f.enable();await f.native();const panel=f.panel(),before=panel.outerHTML,lease=f.lease(),shell=f.doc.getElementById('shell');
 await f.controller.go('menu');assert.equal(shell.dataset.hubForeground,'true');assert.equal(panel.outerHTML,before);assert.equal(lease.isCurrent(),true);
 await f.controller.go('closed');assert.equal(shell.hasAttribute('data-hub-foreground'),false);assert.equal(panel.outerHTML,before);assert.equal(f.counts.factory,1);
 await f.native();assert.equal(panel.hidden,true);await f.native();assert.equal(panel.hidden,false);
 await f.hub();assert.equal(shell.dataset.hubForeground,'true');await f.controller.close('panel:'+f.id);assert.equal(shell.dataset.hubForeground,'true');
 await f.controller.go('closed');assert.equal(shell.hasAttribute('data-hub-foreground'),false);
});

test('disposing an open Hub removes its foreground marker without leaving another presentation owner',async t=>{
 const f=fixture(t);await f.enable();await f.native();await f.controller.go('menu');const lease=f.lease();f.controller.dispose();
 assert.equal(f.doc.getElementById('shell').hasAttribute('data-hub-foreground'),false);assert.equal(lease.isCurrent(),false);assert.equal(f.mode(),'hub');
});
