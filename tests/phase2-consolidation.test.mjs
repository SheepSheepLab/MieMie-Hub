import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {fixture,generic} from './fixtures/built-hub.js';
import {installNativeWindowAcceptance} from './fixtures/native-window-extension.js';
const tick=()=>new Promise(r=>setImmediate(r));
async function settle(){for(let i=0;i<8;i++)await tick();}

test('normal Bundled build: OFF release fault is visible, retry is explicit and restores without new business',async t=>{
 const f=await fixture(t),g=generic(f);await g.provide();await g.preference(true);await g.native();g.panel().querySelector('input').value='DRAFT';const old=g.lease();g.broken(true);
 const toggle=await g.preference(false);assert.equal(toggle.checked,false);assert.equal(f.query('[data-native]'),null);assert.equal(old.isCurrent(),false);
 assert.match(f.query('.mm-extension-error').textContent,/原生窗口释放失败.*fixture release failure/);assert.ok(f.query('[data-native-release-retry]'));
 const before=g.panel().outerHTML;await f.click('[data-native-release-retry]');assert.equal(g.panel().outerHTML,before);assert.ok(f.query('[data-native-release-retry]'));
 g.broken(false);await f.click('[data-native-release-retry]');assert.equal(f.query('[data-native-release-retry]'),null);assert.equal(g.panel().hidden,true);assert.equal(old.isCurrent(),false);
 await f.launch(g.manifest.id);assert.equal(g.panel().hidden,false);assert.equal(g.panel().querySelector('input').value,'DRAFT');assert.equal(g.counts.factories,1);assert.equal(g.counts.hooks,1);
 assert.equal(f.host.__MieMieHub.extensions.get('miemie.timeline').enabled,true);
});

test('normal Bundled build: Native preference Enter preserves ON intent after mount fault and retries only explicitly',async t=>{
 const f=await fixture(t),g=generic(f,{mountFailure:true});await g.provide();await f.launch('extension-center');await f.click('[data-center-tab="installed"]');
 let toggle=f.query('[data-shortcut]');toggle.dispatchEvent(new f.host.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await settle();
 toggle=f.query('[data-shortcut]');assert.equal(toggle.checked,true);assert.equal(g.counts.mount,1);assert.match(f.doc.documentElement.textContent,/fixture mount failure/);
 await f.click('[data-center-tab="installed"]');assert.equal(g.counts.mount,1);
 await g.preference(false);await g.preference(true);assert.equal(g.counts.mount,2);assert.equal(g.counts.factories,1);
});

function pointer(host,node,type,x,y){const event=new host.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:7});node.dispatchEvent(event);}
async function parity(t){
 const f=await fixture(t);f.host.matchMedia=()=>({matches:true});
 const captures=new WeakMap();f.host.Element.prototype.setPointerCapture=function(id){captures.set(this,id);};f.host.Element.prototype.hasPointerCapture=function(id){return captures.get(this)===id;};f.host.Element.prototype.releasePointerCapture=function(){captures.delete(this);};
 f.host.HTMLDialogElement.prototype.showModal=function(){this.open=true;};f.host.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const frame=f.doc.createElement('iframe');f.doc.body.append(frame);const probe=installNativeWindowAcceptance(frame.contentWindow);t.after(()=>frame.contentWindow.dispatchEvent(new frame.contentWindow.Event('pagehide')));await settle();
 assert.equal(probe.error,undefined);assert.equal(probe.stats.active,1);assert.equal(f.query('[data-native-parity-orb]'),null);
 await f.launch('extension-center');await f.click('[data-center-tab="installed"]');await f.click('[data-shortcut="'+probe.id+'"]');
 return {...f,probe,frame,captures,async native(){f.query('[data-native-parity-orb]').click();await settle();},snapshot:()=>probe.snapshot().business};
}
test('Native Parity Fixture: provider owns pointer drag/resize, draft, dialog, internal Back and unknown input',async t=>{
 const f=await parity(t);await f.native();const panel=f.query('[data-native-parity-panel]'),draft=panel.querySelector('textarea'),drag=panel.querySelector('[data-native-drag]'),resize=panel.querySelector('[data-native-resize]');
 draft.value='PERSIST';draft.dispatchEvent(new f.host.Event('input'));pointer(f.host,drag,'pointerdown',120,150);assert.equal(drag.hasPointerCapture(7),true);pointer(f.host,drag,'pointermove',170,180);pointer(f.host,drag,'pointerup',170,180);assert.equal(f.snapshot().rect.x,170);
 pointer(f.host,resize,'pointerdown',0,0);pointer(f.host,resize,'pointermove',40,30);pointer(f.host,resize,'pointerup',40,30);assert.equal(f.snapshot().rect.w,400);
 let input=0;for(const type of ['dblclick','contextmenu','compositionstart','compositionend']){draft.addEventListener(type,()=>input++);const e=new f.host.Event(type,{bubbles:true,cancelable:true});draft.dispatchEvent(e);assert.equal(e.defaultPrevented,false);}assert.equal(input,4);
 panel.querySelector('[data-open-dialog]').click();panel.querySelector('[data-open-dropdown]').click();assert.equal(f.snapshot().dialog,true);assert.equal(f.snapshot().dropdown,true);
 const esc=()=>{panel.querySelector('[data-native-dropdown]').dispatchEvent(new f.host.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));f.doc.dispatchEvent(new f.host.KeyboardEvent('keyup',{key:'Escape',bubbles:true}));};
 esc();assert.equal(f.snapshot().dropdown,false);assert.equal(f.snapshot().dialog,true);esc();assert.equal(f.snapshot().dialog,false);assert.equal(panel.hidden,false);
 const rect={...f.snapshot().rect};await f.host.__MieMieHub.extensions.open(f.probe.id);assert.equal(f.snapshot().mode,'hub');assert.equal(draft.value,'PERSIST');panel.querySelector('[data-native-close]').click();await settle();assert.equal(panel.hidden,true);
 await f.native();assert.deepEqual(f.snapshot().rect,rect);assert.equal(draft.value,'PERSIST');assert.equal(f.probe.stats.factories,1);assert.equal(f.probe.stats.hooks,1);assert.equal(f.probe.stats.peak,1);
});
test('Native Parity Fixture: handoff cancels captured gestures and late native animation before Hub writes',async t=>{
 const f=await parity(t);f.host.matchMedia=()=>({matches:false});const flights=[];f.host.Element.prototype.animate=function(){let done;const a={finished:new Promise(r=>done=r),cancel(){done();},finish:()=>done()};flights.push(a);return a;};
 await f.native();const panel=f.query('[data-native-parity-panel]'),drag=panel.querySelector('[data-native-drag]');pointer(f.host,drag,'pointerdown',0,0);assert.equal(drag.hasPointerCapture(7),true);
 const opening=f.host.__MieMieHub.extensions.open(f.probe.id);for(let i=0;i<8;i++){for(const a of flights)a.finish();await tick();}await opening;assert.equal(drag.hasPointerCapture(7),false);const before=panel.outerHTML;pointer(f.host,drag,'pointermove',250,250);for(const a of flights)a.finish();await settle();assert.equal(panel.outerHTML,before);
 const hub=f.host.__MieMieHub;f.unmount();await hub.whenDisposed;await settle();assert.equal(f.probe.stats.active,1,'standalone successor after old lifecycle completed');assert.equal(f.probe.stats.peak,1);assert.equal(f.snapshot().mode,'standalone');
});

test('Core contains one Native registry and no retired Shortcut presentation machinery',async()=>{
 const root=new URL('../',import.meta.url),files=await readdir(new URL('src/',root));assert.equal(files.includes('shortcut-launchers.js'),false);
 for(const file of files.filter(f=>f.endsWith('.js'))){const source=await readFile(new URL('src/'+file,root),'utf8');assert.doesNotMatch(source,/registerShortcutLauncher|nativePresentation|floatingAnchor|followShortcut|createShortcutLaunchers|launching\s*=\s*new Map/,file);}
 const surface=await readFile(new URL('src/surface-controller.js',root),'utf8');assert.doesNotMatch(surface,/MutationObserver|ResizeObserver|setTimeout|setInterval|querySelectorAll/);
});
