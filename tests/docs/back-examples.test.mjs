import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from '../fixtures/built-hub.js';
const text=await readFile(new URL('../../docs/EXTENSION-API.md',import.meta.url),'utf8');
const examples=[...text.matchAll(/```js\n([\s\S]*?)```/g)].map(x=>x[1]);
const example = name => {
 const matches = examples.filter(code => new RegExp('^function ' + name + '\\(').test(code.trim()));
 assert.equal(matches.length, 1, 'Exactly one documented ' + name + ' example');
 return matches[0];
};
const manifest={schemaVersion:1,apiVersion:2,id:'test.documentation.back',name:'Back example',version:'1.0.0',contributes:{launcher:{title:'Back example',icon:'🐑'}}};
const tick=()=>new Promise(r=>setImmediate(r));
async function settle(){for(let i=0;i<6;i++)await tick();}
function escape(f,extra={}){const e=new f.host.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true,composed:true,...extra});f.doc.dispatchEvent(e);f.doc.dispatchEvent(new f.host.KeyboardEvent('keyup',{key:'Escape',bubbles:true}));return e;}
async function syncExample(t){const f=await fixture(t),hub=f.host.__MieMieHub;const source=hub.extensions.provide(manifest,f.host.eval('('+example('backFactory').trim()+')'));assert.equal((await source.ready).ok,true);await hub.extensions.open(manifest.id);const panel=f.doc.querySelector('section[data-depth]');return {f,hub,source,panel};}
test('new sync example: two layers then Hub fallback; source release removes resources',async t=>{
 const {f,hub,source,panel}=await syncExample(t);assert.equal(panel.hidden,false);assert.equal(panel.dataset.depth,'2');
 escape(f);assert.equal(panel.dataset.depth,'1');escape(f);assert.equal(panel.dataset.depth,'0');assert.equal(panel.hidden,false);
 escape(f);await settle();assert.equal(panel.hidden,true);assert.equal(hub.extensions.get(manifest.id).enabled,true);
 await source.release();assert.equal(panel.isConnected,false);assert.equal(panel.querySelector('button').onclick,null);
});
test('new sync example: application Back button shares layers and uses the current Surface Lease',async t=>{
 const {hub,panel}=await syncExample(t),button=panel.querySelector('button');await button.onclick();await button.onclick();assert.equal(panel.dataset.depth,'0');await button.onclick();assert.equal(panel.hidden,true);
 assert.equal(await button.onclick(),undefined);await hub.extensions.open(manifest.id);assert.equal(panel.hidden,false);await button.onclick();assert.equal(panel.hidden,true);
});
async function draftExample(t){
 const f=await fixture(t),hub=f.host.__MieMieHub;let panel,lease,api,finish,reject,confirmations=0,dirty=true,errors=[];
 const install=f.host.eval('('+example('installDraftBack').trim()+')');
 const source=hub.extensions.provide(manifest,value=>{api=value;return {activate(){panel=f.doc.createElement('section');panel.hidden=true;f.doc.body.append(panel);api.attachPanel(panel);api.onCleanup(()=>panel.remove());install(api,{getSurfaceLease:()=>lease,hasUnsavedDraft:()=>dirty,confirmDiscardDraft:({signal})=>{assert.equal(signal,api.signal);confirmations++;return new Promise((r,j)=>{finish=r;reject=j;});},showError:e=>errors.push(e.message)});},open(value){lease=value;return api.showPanel(value);}};});
 assert.equal((await source.ready).ok,true);await hub.extensions.open(manifest.id);
 return {f,hub,source,get panel(){return panel;},get lease(){return lease;},get api(){return api;},get confirmations(){return confirmations;},errors,set dirty(value){dirty=value;},finish(value){finish(value);},reject(value){reject(value);}};
}
test('new async example: strict immediate handled, busy consumes repeat requests, confirm closes',async t=>{
 const x=await draftExample(t);escape(x.f);await settle();assert.equal(x.confirmations,1);assert.equal(x.panel.hidden,false);
 escape(x.f);await settle();assert.equal(x.confirmations,1);x.finish(true);await settle();assert.equal(x.panel.hidden,true);assert.equal(x.hub.extensions.get(manifest.id).enabled,true);
});
test('new async example: cancel and non-true response preserve the draft surface, next request works',async t=>{
 const x=await draftExample(t);for(const value of [false,'true']){escape(x.f);await settle();x.finish(value);await settle();assert.equal(x.panel.hidden,false);}assert.equal(x.confirmations,2);
 x.dirty=false;escape(x.f);await settle();assert.equal(x.panel.hidden,true);assert.equal(x.confirmations,2);
});
test('new async example: close/reopen in same Session cannot substitute a new Lease into old completion',async t=>{
 const x=await draftExample(t);escape(x.f);await settle();const old=x.lease;await x.api.closePanel(old);await x.hub.extensions.open(manifest.id);assert.notEqual(old,x.lease);assert.equal(old.isCurrent(),false);assert.equal(x.api.signal.aborted,false);
 x.finish(true);await settle();assert.equal(x.panel.hidden,false);assert.equal(x.lease.isCurrent(),true);
});
test('new async example: changing Surface invalidates request and delayed result cannot close destination',async t=>{
 const x=await draftExample(t);escape(x.f);await settle();await x.f.launch('extension-center');x.finish(true);await settle();assert.equal(x.f.doc.querySelector('[data-hub-panel="extension-center"]').hidden,false);
});
test('new async example: disable/re-enable rejects old Session completion and preserves replacement',async t=>{
 const x=await draftExample(t);escape(x.f);await settle();const oldAPI=x.api,oldPanel=x.panel;await x.hub.extensions.disable(manifest.id);await x.hub.extensions.enable(manifest.id);await x.hub.extensions.open(manifest.id);assert.equal(oldAPI.signal.aborted,true);assert.equal(oldPanel.isConnected,false);
 x.finish(true);await settle();assert.equal(x.panel.hidden,false);assert.equal(x.hub.extensions.get(manifest.id).enabled,true);
});
test('new async example: source release aborts and late confirmation cannot revive UI',async t=>{
 const x=await draftExample(t);escape(x.f);await settle();await x.source.release();x.finish(true);await settle();assert.equal(x.panel.isConnected,false);assert.equal(x.hub.extensions.get(manifest.id),null);
});
test('new async example: current error is shown; stale error is suppressed',async t=>{
 const x=await draftExample(t);escape(x.f);await settle();x.reject(Error('current'));await settle();assert.deepEqual(x.errors,['current']);assert.equal(x.panel.hidden,false);
 escape(x.f);await settle();await x.api.closePanel(x.lease);await x.hub.extensions.open(manifest.id);x.reject(Error('stale'));await settle();assert.deepEqual(x.errors,['current']);assert.equal(x.panel.hidden,false);
});
test('new async example: close before confirmation microtask prevents starting obsolete UI',async t=>{
 const x=await draftExample(t);escape(x.f);await x.api.closePanel(x.lease);await settle();assert.equal(x.confirmations,0);assert.equal(x.panel.hidden,true);
});
