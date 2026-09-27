import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createShortcutLaunchers} from '../src/shortcut-launchers.js';
import {createExtensionRuntime} from '../src/extension-runtime.js';
const manifest=id=>({id,name:id,version:'1.0.0',apiVersion:1,schemaVersion:1,contributes:{launcher:{title:id}}});
function fixture(t){
 const dom=new JSDOM('<body>',{url:'https://fixture.invalid'}),host=dom.window;let manager;const apis={},counts={mount:0,dispose:0,open:0,active:0,peak:0},origins=[],errors=[];
 const runtime=createExtensionRuntime({onPanel:()=>()=>{},onShortcut:(id,mount)=>manager.register(id,mount),onShowPanel:()=>true,onChange:()=>manager?.sync()});
 manager=createShortcutLaunchers({host,runtime,launch:(id,open,origin)=>{origins.push(origin);return open();},onError:e=>errors.push(e)});
 const mount=function(context){assert.equal(this,undefined);assert.deepEqual(Object.keys(context),['open']);assert.ok(Object.isFrozen(context));counts.mount++;const orb=host.document.createElement('button');orb.dataset.shortcutTest='';orb.onclick=context.open;host.document.body.append(orb);orb.getBoundingClientRect=()=>({left:5,top:20,width:64,height:64});return {getOrigin:()=>orb,dispose(){counts.dispose++;orb.remove();}};};
 function register(id='test.shortcut',capability=true){runtime.register(manifest(id),api=>{apis[id]=api;return {activate(){counts.active++;counts.peak=Math.max(counts.peak,counts.active);api.attachPanel({});if(capability)api.registerShortcutLauncher({mount});},open(){counts.open++;return api.showPanel();},deactivate(){counts.active--;}};});return runtime.enable(id);}
 t.after(async()=>{await runtime.dispose();manager.dispose();dom.window.close();});
 return {host,runtime,manager,register,counts,origins,errors,apis};
}
test('generic capability defaults off; mount/unmount preserves Hub launcher and the one instance',async t=>{
 const f=fixture(t);await f.register();assert.equal(f.runtime.get('test.shortcut').shortcutLauncherAvailable,true);assert.equal(f.counts.mount,0);
 f.manager.set('test.shortcut',true);f.manager.sync();assert.equal(f.counts.mount,1);assert.equal(f.runtime.get('test.shortcut').launcherAvailable,true);
 f.host.document.querySelector('button').click();await new Promise(r=>setImmediate(r));assert.equal(f.counts.open,1);assert.equal(f.origins[0].kind,'shortcut');assert.equal(f.origins[0].currentRect().width,64);
 f.manager.set('test.shortcut',false);assert.equal(f.counts.dispose,1);assert.equal(f.runtime.get('test.shortcut').launcherAvailable,true);assert.equal(f.counts.active,1);assert.equal(f.counts.peak,1);
});
test('disable revokes immediately; enable/update restore preference without duplicate native launchers',async t=>{
 const f=fixture(t);await f.register();f.manager.set('test.shortcut',true);const stale=f.host.document.querySelector('button');
 await f.runtime.disable('test.shortcut');assert.equal(stale.isConnected,false);assert.equal(f.manager.enabled('test.shortcut'),true);assert.equal(f.runtime.get('test.shortcut').shortcutLauncherAvailable,false);
 stale.click();await new Promise(r=>setImmediate(r));assert.equal(f.counts.open,0);assert.equal(f.apis['test.shortcut'].registerShortcutLauncher({}),false);
 await f.runtime.enable('test.shortcut');assert.equal(f.host.document.querySelectorAll('button').length,1);
 // Source withdrawal/update preserves the preference; explicit package uninstall calls forget.
 await f.runtime.uninstall('test.shortcut');await f.register();assert.equal(f.host.document.querySelectorAll('button').length,1);assert.equal(f.counts.peak,1);
 f.manager.forget('test.shortcut');assert.equal(f.host.document.querySelectorAll('button').length,0);assert.equal(f.host.localStorage.getItem('miemie_hub_shortcuts_v1'),'{}');
});
test('reload restores local preference and stale capability is ignored without affecting legacy extensions',async t=>{
 const f=fixture(t);await f.register();f.manager.set('test.shortcut',true);await f.runtime.disable('test.shortcut');f.manager.dispose();
 const reopened=createShortcutLaunchers({host:f.host,runtime:f.runtime,launch:()=>true});assert.equal(reopened.enabled('test.shortcut'),true);reopened.sync();assert.equal(f.host.document.querySelectorAll('button').length,0);reopened.dispose();
 await f.register('test.legacy',false);assert.equal(f.runtime.get('test.legacy').shortcutLauncherAvailable,false);assert.equal(f.runtime.get('test.legacy').launcherAvailable,true);
});
test('capability only belongs to attached panel owner and provider cannot receive runtime internals',async t=>{
 const f=fixture(t);await f.register();assert.ok(Object.isFrozen(f.apis['test.shortcut']));assert.throws(()=>f.apis['test.shortcut'].registerShortcutLauncher({mount(){}}),/重复/);
 let api;f.runtime.register(manifest('test.no.panel'),a=>{api=a;return {open(){}};});await f.runtime.enable('test.no.panel');assert.throws(()=>api.registerShortcutLauncher({mount(){}}),/主面板/);
 f.manager.set('test.shortcut',true);f.host.document.querySelector('button').click();await new Promise(r=>setImmediate(r));const origin=f.origins[0];f.manager.set('test.shortcut',false);assert.equal(origin.currentRect(),null);assert.equal(origin.rect.width,64);origin.active(true);origin.highlight();assert.deepEqual(f.errors,[]);
});

test('failed or detached mounts roll preference back and never report an active shortcut',async t=>{
 const f=fixture(t);const record={enabled:true,launcherAvailable:true},errors=[];
 const manager=createShortcutLaunchers({host:f.host,runtime:{get:()=>record},launch:()=>true,onError:e=>errors.push(e)});
 for(const [id,mount] of [['throws',()=>{throw Error('mount failed');}],['detached',()=>({getOrigin:()=>f.host.document.createElement('button'),dispose(){}})]]){
  manager.register(id,mount);assert.equal(manager.set(id,true),false);assert.equal(manager.enabled(id),false);assert.equal(manager.mounted(id),false);assert.equal(JSON.parse(f.host.localStorage.getItem('miemie_hub_shortcuts_v1'))[id],false);
 }
 assert.equal(errors.length,2);manager.dispose();
});
