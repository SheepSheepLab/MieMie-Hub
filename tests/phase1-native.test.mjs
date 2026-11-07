import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createSurfaceController} from '../src/surface-controller.js';
import {createExtensionRuntime} from '../src/extension-runtime.js';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(t,{animation=false,beforeHubOpen,closeGate,mountFailure=false,nativeWork,timeoutMs=10000}={}){
 const dom=new JSDOM('<body><div id="shell"></div><div id="menu"><button id="icon">Icon</button></div><button id="hub">Hub</button>',{url:'https://native.invalid'}),host=dom.window,doc=host.document,root=doc.getElementById('menu'),panels=new Set(),entries=new Map(),errors=[],counts={factory:0,active:0,peak:0,hubOpen:0,nativeOpen:0,release:0,mount:0,unmount:0,hooks:0,hookPeak:0};let controller,manager,mode='hub',lease,api,broken=false;host.matchMedia=()=>({matches:!animation});
 const launcher={originRect:()=>null,originElement:()=>doc.getElementById('icon'),capture:()=>({}),resume(){root.inert=false;},suspend(){root.inert=true;},async open(){root.hidden=false;},async close(){if(closeGate)await closeGate;root.hidden=true;},settle(open){root.hidden=!open;root.inert=!open;},highlight(){}};
 const place=()=>{for(const panel of panels)if(!controller.ownsNative(panel))Object.assign(panel.style,{position:'fixed',width:'600px',height:'700px'});};
 let runtime;controller=createSurfaceController({runtime:{get:id=>runtime?.get(id)},host,shell:{root:doc.getElementById('shell'),orb:doc.getElementById('hub')},root,launcher,panels,resolve:k=>entries.get(k),place,onState(){},onError:e=>errors.push(e.message)});
 runtime=createExtensionRuntime({timeoutMs,onChange:()=>manager?.sync(),onPanel(id,title,panel){let saved={style:panel.getAttribute('style'),hidden:panel.hidden,inert:panel.inert};const entry={owner:id,panel,restoreNative(){if(saved.style===null)panel.removeAttribute('style');else panel.setAttribute('style',saved.style);panel.hidden=saved.hidden;panel.inert=saved.inert;},saveNative(){saved={style:panel.getAttribute('style'),hidden:panel.hidden,inert:panel.inert};}};entries.set('panel:'+id,entry);panels.add(panel);panel.hidden=panel.inert=true;place();return ()=>{controller.revoke(id);panels.delete(panel);entries.delete('panel:'+id);};},onNativeWindow:(id,p)=>controller.registerNativeWindow(id,p),onRequestOpen:id=>controller.requestSurface(id),onCancelOpen:(id,l)=>controller.cancelSurface(id,l),onBeforeOpen:(id,l)=>controller.validSurface(id,l)&&controller.acquireHub(id),onShowPanel:(id,l)=>controller.validSurface(id,l)&&!controller.ownsNative(entries.get('panel:'+id)?.panel)?controller.go('panel:'+id,undefined,null,l):false,onClosePanel:(id,l)=>controller.validSurface(id,l)?controller.close('panel:'+id):false});
 manager={sync:()=>controller.syncEntries(),set:(id,value)=>controller.setEntry(id,value),enabled:id=>controller.entryEnabled(id),mounted:id=>controller.entryMounted(id),dispose(){}};
 const id='test.native';runtime.register({id,name:'Native',schemaVersion:1,apiVersion:2,version:'1.0.0',contributes:{launcher:{title:'Native'}}},a=>{api=a;counts.factory++;let panel;return {activate(){counts.active++;counts.hooks++;counts.hookPeak=Math.max(counts.hookPeak,counts.hooks);counts.peak=Math.max(counts.peak,counts.active);panel=doc.createElement('section');panel.tabIndex=-1;panel.innerHTML='<input value="DRAFT"><span hidden>Own hidden</span>';panel.style.width='320px';panel.hidden=true;doc.body.append(panel);a.attachPanel(panel);a.registerNativeWindow({mount({open,signal}){counts.mount++;if(mountFailure)throw Error('mount failed');const orb=doc.createElement('button');orb.id='native';orb.onclick=open;doc.body.append(orb);return {getOrigin:()=>orb,dispose(){assert.equal(signal.aborted,true);counts.unmount++;orb.remove();}};},open(l){mode='native';lease=l;counts.nativeOpen++;panel.hidden=!panel.hidden;panel.inert=false;panel.focus();nativeWork?.(l,panel);},release(){counts.release++;if(broken)throw Error('release failed');mode='hub';},ownsEvent:e=>e.target?.id==='portal'});a.onCleanup(()=>{panel.remove();counts.active--;counts.hooks--;});},async open(l){counts.hubOpen++;if(beforeHubOpen)await beforeHubOpen(counts.hubOpen,l,a);return a.showPanel(l);}};});
 t.after(async()=>{await runtime.dispose();manager.dispose();controller.dispose();host.close();});
 return {host,doc,root,id,runtime,manager,controller,counts,errors,api:()=>api,panel:()=>entries.get('panel:'+id)?.panel,mode:()=>mode,lease:()=>lease,breakRelease(value=true){broken=value;},mountFailure(value){mountFailure=value;},place,async enable(on=true){assert.equal((await runtime.enable(id)).ok,true);if(on)manager.set(id,true);},async native(){return doc.getElementById('native').onclick();},async hub(){return controller.launch(id,()=>runtime.open(id));}};
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
 const f=fixture(t);let api;f.runtime.register({id:'test.no-panel',name:'Empty',schemaVersion:1,apiVersion:2,version:'1.0.0',contributes:{launcher:{title:'Empty'}}},a=>{api=a;return {open(){}};});await f.runtime.enable('test.no-panel');assert.throws(()=>api.registerNativeWindow({open(){},release(){}}),/主面板/);await f.enable();assert.throws(()=>f.api().registerNativeWindow({open(){},release(){}}),/重复/);assert.equal(f.runtime.get(f.id).nativeWindowAvailable,true);await f.runtime.disable(f.id);assert.equal(f.runtime.get(f.id).nativeWindowAvailable,false);assert.equal(f.api().registerNativeWindow({}),false);
});
test('late native completion guarded by lease cannot write after Honeycomb reacquires',async t=>{
 const f=fixture(t);await f.enable();await f.native();const old=f.lease(),p=f.panel();const late=()=>{if(old.isCurrent()&&!old.signal.aborted)p.hidden=true;};await f.hub();late();assert.equal(p.hidden,false);assert.equal(p.inert,false);assert.equal(p.dataset.surfaceState,'open');
});
test('Hub disposal retires native ownership synchronously before slow business cleanup',async t=>{
 const f=fixture(t);await f.enable();await f.native();const old=f.lease();let finish;f.api().onCleanup(()=>new Promise(r=>finish=r));const done=f.runtime.dispose();assert.equal(old.isCurrent(),false);assert.equal(old.signal.aborted,true);assert.equal(f.doc.getElementById('native'),null);for(let i=0;i<10&&!finish;i++)await tick();finish();await done;assert.equal(f.counts.active,0);assert.equal(f.doc.querySelectorAll('section').length,0);
});

test('native callbacks cannot be wrapped in asynchronous guard',async()=>{
 const runtime=createExtensionRuntime({onPanel:()=>()=>{},onNativeWindow:()=>()=>{}});let api;runtime.register({id:'test.validation',name:'Validation',schemaVersion:1,apiVersion:2,version:'1.0.0',contributes:{launcher:{title:'Validation'}}},a=>{api=a;return {activate(){a.attachPanel({});},open(){}};});await runtime.enable('test.validation');for(const name of ['mount','open','release','ownsEvent']){const provider={mount(){},open(){},release(){}};provider[name]=api.guard(()=>{});assert.throws(()=>api.registerNativeWindow(provider),/guard/);}assert.equal(runtime.get('test.validation').nativeWindowAvailable,false);await runtime.dispose();
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

test('K Race A: logical closed intent survives Native takeover during unfinished close',async t=>{
 let finish;const gate=new Promise(r=>finish=r),f=fixture(t,{closeGate:gate});await f.enable();await f.controller.go('menu');
 const closing=f.controller.go('closed');await tick();assert.equal(f.root.hidden,false);assert.equal(f.controller.state,'closed');
 await f.native();assert.equal(f.controller.state,'closed');assert.equal(f.root.hidden,true);assert.equal(f.lease().isCurrent(),true);
 const before=f.panel().outerHTML;finish();await closing;assert.equal(f.panel().outerHTML,before);assert.equal(f.root.hidden,true);
});
test('L Race B: request identity is captured before queue, including repeated Native clicks',async t=>{
 let finish;const gate=new Promise(r=>finish=r),f=fixture(t,{beforeHubOpen:n=>n===1?gate:undefined});await f.enable();
 const first=f.runtime.open(f.id);while(!f.counts.hubOpen)await tick();
 const queued=f.runtime.open(f.id);await f.native();const native=f.lease();
 const queuedAgain=f.runtime.open(f.id);await f.native();assert.equal(f.lease(),native);
 finish();const results=await Promise.all([first,queued,queuedAgain]);assert.ok(results.every(x=>x.cancelled));
 assert.equal(f.counts.hubOpen,1);assert.equal(native.isCurrent(),true);assert.equal(f.mode(),'native');
});
test('M expired, missing, forged, cross-owner and old-cycle leases never mint a new Surface intent',async t=>{
 let old;const f=fixture(t,{beforeHubOpen:(_n,l)=>{old=l;}});await f.enable();await f.hub();const first=old;
 assert.equal(await f.api().showPanel(),false);assert.equal(await f.api().showPanel({isCurrent:()=>true}),false);
 assert.equal(f.controller.validSurface('other.id',old),false);await f.native();assert.equal(first.signal.aborted,true);
 assert.equal(await f.api().showPanel(first),false);assert.equal(await f.api().closePanel(first),false);
 await f.hub();assert.equal(f.mode(),'hub');assert.notEqual(first,old);assert.equal(await f.api().showPanel(first),false);
 assert.equal(await f.api().showPanel(),false);assert.equal(old.isCurrent(),true);
 await f.controller.close('panel:'+f.id);assert.equal(old.isCurrent(),false);assert.equal(await f.api().showPanel(old),false);
});
test('M late unleased showPanel after async work is rejected even after a newer Hub open',async t=>{
 let finish,late;const gate=new Promise(r=>finish=r);const f=fixture(t,{beforeHubOpen(n,_l,a){if(n===1){late=gate.then(()=>a.showPanel());return gate;}}});await f.enable();
 const first=f.hub();while(!f.counts.hubOpen)await tick();await f.native();const fresh=f.hub();finish();await Promise.all([first,fresh]);
 assert.equal(await late,false);assert.equal(f.counts.factory,1);assert.equal(f.panel().dataset.surfaceState,'open');
});
test('J failed release revokes lease, protects DOM, retries safely on Native then Hub intent',async t=>{
 const f=fixture(t);await f.enable();await f.native();const first=f.lease();f.panel().querySelector('input').value='PRESERVE';f.breakRelease();
 const before=f.panel().outerHTML;assert.equal((await f.hub()).ok,false);assert.equal(first.isCurrent(),false);assert.equal(first.signal.aborted,true);
 await f.controller.go('menu');f.place();assert.equal(f.panel().outerHTML,before);
 assert.equal((await f.native()).ok,false);assert.equal(f.lease(),first);assert.equal(f.panel().outerHTML,before);
 f.breakRelease(false);assert.equal((await f.native()).ok,true);assert.notEqual(f.lease(),first);assert.equal(f.lease().isCurrent(),true);
 assert.equal((await f.hub()).ok,true);assert.equal(f.counts.factory,1);assert.equal(f.panel().querySelector('input').value,'PRESERVE');
});
test('J failed OFF reports failure, removes entry, preserves ON/OFF intent and allows explicit retry',async t=>{
 const f=fixture(t);await f.enable();await f.native();f.breakRelease();const before=f.panel().outerHTML;
 assert.equal(f.manager.set(f.id,false),false);assert.equal(f.manager.enabled(f.id),false);assert.equal(f.doc.getElementById('native'),null);
 f.place();assert.equal(f.panel().outerHTML,before);assert.equal(f.lease().isCurrent(),false);assert.equal(f.counts.active,1);
 f.breakRelease(false);assert.equal(f.manager.set(f.id,false),true);assert.equal(f.panel().hidden,true);assert.equal((await f.hub()).ok,true);
});
test('J session end cleans up idempotently despite continuing release errors',async t=>{
 const f=fixture(t);await f.enable();await f.native();f.breakRelease();await f.hub();const old=f.lease();
 await f.runtime.disable(f.id);await f.runtime.disable(f.id);assert.equal(old.isCurrent(),false);assert.equal(f.counts.active,0);assert.equal(f.counts.unmount,1);assert.equal(f.counts.hooks,0);
 assert.equal(f.doc.querySelectorAll('#native,section').length,0);assert.ok(f.errors.includes('release failed'));
});
test('F,R default OFF and failed mount preserve ON, no refresh retry, explicit retry works',async t=>{
 const f=fixture(t,{mountFailure:true});await f.enable(false);assert.equal(f.counts.mount,0);assert.equal(f.manager.enabled(f.id),false);
 assert.equal(f.manager.set(f.id,true),false);assert.equal(f.counts.mount,1);assert.equal(f.manager.enabled(f.id),true);
 assert.equal(JSON.parse(f.host.localStorage.getItem('miemie_hub_shortcuts_v1'))[f.id],true);
 for(let i=0;i<40;i++)f.manager.sync();assert.equal(f.counts.mount,1);assert.equal((await f.hub()).ok,true);
 f.mountFailure(false);assert.equal(f.manager.set(f.id,true),true);assert.equal(f.counts.mount,2);assert.equal(f.counts.factory,1);
 const oldOpen=f.doc.getElementById('native').onclick;f.manager.set(f.id,false);f.manager.set(f.id,true);assert.equal(await oldOpen(),false);
 assert.equal(f.counts.hookPeak,1);assert.ok(f.errors.includes('mount failed'));
});
test('A,Q duplicate registration and repeated enable cannot duplicate factory, panel, entry or hook',async t=>{
 const f=fixture(t);await f.enable();for(let i=0;i<20;i++){await f.runtime.enable(f.id);await f.native();}
 assert.equal(f.runtime.register({id:f.id,name:'Duplicate',schemaVersion:1,apiVersion:2,version:'1.0.0'},()=>({})).ok,false);
 assert.equal(f.counts.factory,1);assert.equal(f.counts.hookPeak,1);assert.equal(f.doc.querySelectorAll('section').length,1);assert.equal(f.doc.querySelectorAll('#native').length,1);
});
test('API2 is independent of schema1; rejects API1 and malformed hubApi',async()=>{
 const runtime=createExtensionRuntime();const manifest={id:'test.version',name:'Version',schemaVersion:1,apiVersion:2,version:'1.0.0'};
 for(const change of [{apiVersion:1},{schemaVersion:2},{hubApi:{min:1,max:1}},{hubApi:{min:3,max:2}},{hubApi:{min:'2',max:2}},{hubApi:null}])assert.equal(runtime.register({...manifest,...change},()=>({})).ok,false);
 assert.equal(runtime.register({...manifest,hubApi:{min:2,max:2}},()=>({})).ok,true);await runtime.dispose();
});

test('N cancelled native animation cannot apply delayed DOM or focus completion',async t=>{
 let finish,late,cancelled=0;const gate=new Promise(r=>finish=r);
 const f=fixture(t,{nativeWork(l,p){l.signal.addEventListener('abort',()=>cancelled++,{once:true});late=gate.then(()=>{if(l.isCurrent()&&!l.signal.aborted){p.style.width='999px';p.hidden=true;p.focus();}});}});
 await f.enable();await f.native();await f.hub();const html=f.panel().outerHTML,focus=f.doc.activeElement;assert.equal(cancelled,1);
 finish();await late;assert.equal(f.panel().outerHTML,html);assert.equal(f.doc.activeElement,focus);assert.equal(f.counts.factory,1);
});
test('open timeout revokes the request so its delayed completion cannot show a panel',async t=>{
 let finish,old;const gate=new Promise(r=>finish=r);const f=fixture(t,{timeoutMs:30,beforeHubOpen(_n,l){old=l;return gate;}});
 await f.enable();const result=await f.hub();assert.equal(result.ok,false);assert.equal(old.signal.aborted,true);assert.equal(old.isCurrent(),false);
 finish();await tick();assert.equal(f.panel().hidden,true);assert.equal(f.runtime.get(f.id).enabled,true);assert.equal(f.counts.factory,1);
});
