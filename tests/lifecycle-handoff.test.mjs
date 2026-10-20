import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM,VirtualConsole} from 'jsdom';
import {createExtensionRuntime} from '../src/extension-runtime.js';
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url)));
const artifact=JSON.parse(await readFile(new URL('../build/MieMie-Hub-'+pkg.version+'.json',import.meta.url)));
const tick=()=>new Promise(r=>setImmediate(r));
const manifest=id=>({id,name:'Independent lifecycle fixture',version:'1.0.0',apiVersion:2,schemaVersion:1,contributes:{launcher:{title:'Lifecycle fixture'}}});
async function fixture(t,shortcuts={}){
 const errors=[],dom=new JSDOM('<body>',{url:'https://handoff.invalid',runScripts:'outside-only',virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(e.message))}),host=dom.window,doc=host.document,frames=[];
 host.localStorage.setItem('miemie_hub_shortcuts_v1',JSON.stringify(shortcuts));host.matchMedia=()=>({matches:true});host._={delay:host.setTimeout.bind(host)};host.SillyTavern={getContext:()=>({characters:[],chat:[],eventTypes:{}})};
 async function mount(wait=true){const frame=doc.createElement('iframe');doc.body.append(frame);frames.push(frame);const w=frame.contentWindow;w.getVariables=()=>({});w.replaceVariables=()=>{};w.getCharWorldbookNames=()=>({primary:'',additional:[]});w.eventOn=()=>({stop(){}});w.fetch=async()=>({ok:true,json:async()=>({items:[]})});w.eval(artifact.content);if(wait){await host.__MieMieHub.ready;await tick();}return frame;}
 function stop(frame){frame.contentWindow.dispatchEvent(new frame.contentWindow.Event('pagehide'));}
 t.after(async()=>{for(const f of frames)stop(f);await host.__MieMieHubDisposal;dom.window.close();assert.deepEqual(errors,[]);});
 const frame=await mount();return {host,doc,frame,mount,stop};
}
async function provide(f,id,panel,cleanup=()=>{},before=false){let api;const hub=f.host.__MieMieHub,lease=hub.extensions.provide(manifest(id),a=>{api=a;return {activate(){if(before)a.onCleanup(cleanup);a.attachPanel(panel);if(!before)a.onCleanup(cleanup);},open(lease){return a.showPanel(lease);}};});await lease.ready;return {api,hub,lease};}

test('panel lease revokes synchronously before deferred deactivate and LIFO user cleanup',async t=>{
 const events=[];let finish;const gate=new Promise(r=>finish=r),r=createExtensionRuntime({onPanel:()=>reason=>events.push(['detach',reason.handoff])});t.after(()=>r.dispose());
 r.register(manifest('test.handoff.runtime'),api=>({activate(){api.attachPanel({});api.onCleanup(()=>events.push(['first']));api.onCleanup(()=>events.push(['second']));},deactivate(){events.push(['deactivate']);return gate;},open(){}}));await r.enable('test.handoff.runtime');const disposed=r.dispose();assert.deepEqual(events,[['detach',true]]);await tick();assert.equal(events[1][0],'deactivate');finish();await disposed;assert.deepEqual(events,[['detach',true],['deactivate'],['second'],['first']]);
});
test('failed synchronous panel detach is reported and does not prevent other cleanup',async t=>{
 let cleaned=0;const errors=[],r=createExtensionRuntime({onPanel:()=>()=>{throw Error('detach fixture fault');},onError:(id,e)=>errors.push(e)});t.after(()=>r.dispose());r.register(manifest('test.handoff.fault'),api=>({activate(){api.attachPanel({});api.onCleanup(()=>cleaned++);},open(){}}));await r.enable('test.handoff.fault');await r.dispose();assert.equal(cleaned,1);assert.equal(errors.length,1);assert.match(errors[0],/detach fixture fault/);
});
for(const initialHidden of [false,true])test('Hub returns borrowed root flags, preserving business descendants; hidden='+initialHidden,async t=>{
 const f=await fixture(t),panel=f.doc.createElement('section');panel.hidden=initialHidden;panel.inert=initialHidden;panel.dataset.hidden='business-closed';panel.style.width='321px';panel.style.color='red';panel.innerHTML='<button hidden>Business child</button>';f.doc.body.append(panel);await provide(f,'test.handoff.flags',panel);
 const old=f.host.__MieMieHub;f.stop(f.frame);assert.equal(panel.hidden,initialHidden);assert.equal(panel.inert,initialHidden);assert.equal(panel.dataset.surfaceState,undefined);assert.equal(panel.style.width,'321px');assert.equal(panel.style.color,'red');assert.equal(panel.firstChild.hidden,true);assert.equal(panel.dataset.hidden,'business-closed');await old.whenDisposed;assert.equal(panel.hidden,initialHidden);assert.equal(panel.inert,initialHidden);
});
for(const before of [false,true])test('Extension cleanup business hidden state wins regardless of registration order; before='+before,async t=>{
 const f=await fixture(t),panel=f.doc.createElement('section');f.doc.body.append(panel);const app=await provide(f,'test.handoff.cleanup',panel,()=>{panel.hidden=true;panel.inert=true;panel.dataset.hidden='extension-owned';},before);f.stop(f.frame);assert.equal(panel.hidden,false);await app.hub.whenDisposed;assert.equal(panel.hidden,true);assert.equal(panel.inert,true);assert.equal(panel.dataset.hidden,'extension-owned');
});
test('normal disable remains hidden; a retained root can re-enable and later hand off without Hub inert residue',async t=>{
 const f=await fixture(t),panel=f.doc.createElement('section');f.doc.body.append(panel);const app=await provide(f,'test.handoff.reuse',panel);await app.hub.extensions.disable('test.handoff.reuse');assert.equal(panel.hidden,true);assert.equal(panel.inert,false);await app.hub.extensions.enable('test.handoff.reuse');assert.equal(panel.hidden,true);assert.equal(panel.inert,true);f.stop(f.frame);await app.hub.whenDisposed;assert.equal(panel.inert,false);assert.equal(panel.hidden,true,'pre-attach hidden state is respected; Standalone may explicitly show it');panel.hidden=false;assert.equal(panel.inert,false);
});
test('disposed notification remains synchronous; whenDisposed includes user cleanup; successor waits for the old Hub',async t=>{
 const f=await fixture(t),panel=f.doc.createElement('section');f.doc.body.append(panel);let finish;const gate=new Promise(r=>finish=r),events=[];const app=await provide(f,'test.handoff.boundary',panel,async()=>{events.push('cleanup-start');await gate;panel.hidden=true;events.push('cleanup-end');});
 f.host.addEventListener('miemie:hub-disposed',e=>{if(e.detail===app.hub)events.push('disposed');});let ended=false;app.hub.whenDisposed.then(()=>ended=true);f.stop(f.frame);assert.deepEqual(events,['disposed']);assert.equal(f.host.__MieMieHub,undefined);assert.equal(panel.hidden,false);assert.equal(ended,false);
 const next=await f.mount(false);await tick();assert.equal(f.host.__MieMieHub,undefined);assert.equal(f.doc.querySelectorAll('.ts-orb').length,0);finish();await app.hub.whenDisposed;await tick();await f.host.__MieMieHub.ready;assert.deepEqual(events,['disposed','cleanup-start','cleanup-end']);assert.notEqual(f.host.__MieMieHub,app.hub);assert.equal(f.doc.querySelectorAll('.ts-orb').length,1);assert.equal(f.host.__MieMieHubDisposal,undefined);assert.equal(panel.hidden,true);assert.ok(next.isConnected);
});
test('unloading a waiting successor cancels startup; multiple waiting candidates still create one Hub',async t=>{
 const f=await fixture(t),panel=f.doc.createElement('section');f.doc.body.append(panel);let finish;const gate=new Promise(r=>finish=r);const app=await provide(f,'test.handoff.wait',panel,()=>gate);f.stop(f.frame);const cancelled=await f.mount(false);f.stop(cancelled);finish();await app.hub.whenDisposed;await tick();assert.equal(f.host.__MieMieHub,undefined);
 await f.mount();const second=f.host.__MieMieHub;let finish2;const gate2=new Promise(r=>finish2=r);const another=await provide(f,'test.handoff.wait2',panel,()=>gate2);const active=f.doc.querySelectorAll('iframe')[2];f.stop(active);assert.equal(another.hub,second);await f.mount(false);await f.mount(false);finish2();await second.whenDisposed;await tick();assert.equal(f.doc.querySelectorAll('.ts-orb').length,1);assert.ok(f.host.__MieMieHub);
});
test('existing cleanup timeout survives removal of the old Hub iframe and unblocks its successor',async t=>{
 const f=await fixture(t),panel=f.doc.createElement('section');f.doc.body.append(panel);const app=await provide(f,'test.handoff.timeout',panel,()=>new Promise(()=>{}));
 f.stop(f.frame);f.frame.remove();await f.mount(false);assert.equal(f.host.__MieMieHub,undefined);
 let deadline;try{await Promise.race([app.hub.whenDisposed,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('cleanup timeout was lost with old iframe')),4500);})]);}finally{clearTimeout(deadline);}
 await tick();assert.ok(f.host.__MieMieHub);assert.notEqual(f.host.__MieMieHub,app.hub);assert.equal(f.doc.querySelectorAll('.ts-orb').length,1);assert.equal(f.host.__MieMieHubDisposal,undefined);
});
