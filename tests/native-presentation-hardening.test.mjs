import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createSurfaceController} from '../src/surface-controller.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t,overrides={}){
 const dom=new JSDOM('<body>',{url:'https://fixture.invalid'}),host=dom.window,doc=host.document;
 const root=doc.createElement('div'),shellRoot=doc.createElement('div'),orb=doc.createElement('button');doc.body.append(shellRoot,root,orb);root.hidden=true;
 const panel=doc.createElement('section'),other=doc.createElement('section');doc.body.append(panel,other);panel.hidden=other.hidden=true;
 for(const p of [panel,other]){p.tabIndex=-1;p.append(doc.createElement('div'));p.getBoundingClientRect=()=>({left:100,top:30,width:600,height:650});}
 orb.getBoundingClientRect=()=>({left:800,top:100,width:64,height:64});
 const calls=[],errors=[],timers=new Map();let sequence=0,controller;
 // Only the watchdog uses timers in this fixture. Advance it explicitly, no sleeps.
 host.setTimeout=(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id;};host.clearTimeout=id=>timers.delete(id);
 host.Element.prototype.animate=function(frames){calls.push(['fallback',this,frames]);return {finished:Promise.resolve(),cancel(){}};};
 host.matchMedia=()=>({matches:overrides.reduced||false});
 const provider={available:()=>true,
  place(p){calls.push(['place']);p.style.left='37px';overrides.place?.(p);},
  run(p,opening){calls.push(['run',opening]);return overrides.run?.(p,opening);},
  cancel(){calls.push(['cancel']);return overrides.cancel?.();},release(){calls.push(['release']);return overrides.release?.();},
 };
 const entries={a:{owner:'a',panel},b:{owner:'b',panel:other}};
 const launcher={originRect:o=>o?.rect,originElement:()=>null,capture:()=>({scroll:125}),resume(){root.inert=false;},highlight(){},suspend(){root.hidden=true;},async open(){root.hidden=false;root.inert=false;},async close(){root.hidden=true;root.inert=false;}};
 const place=()=>{for(const p of [panel,other])if(!controller.placeNative(p)){p.style.left='100px';p.style.width='600px';}};
 controller=createSurfaceController({host,shell:{root:shellRoot,orb},root,launcher,panels:[panel,other],resolve:k=>entries[k],place,onState(){},onError:e=>{errors.push(e);return overrides.report?.();}});
 const origin=()=>({kind:'shortcut',presentation:provider,rect:orb.getBoundingClientRect(),currentRect:()=>orb.getBoundingClientRect(),element:()=>orb});
 const open=()=>controller.launch('a',()=>controller.go('a'),origin());
 t.after(()=>{controller.dispose();dom.window.close();});
 return {controller,panel,other,root,provider,calls,errors,timers,open,place,
  expire(){assert.equal(timers.size,1);const [id,timer]=[...timers][0];assert.equal(timer.ms,5000);timers.delete(id);timer.fn();},
  fallback:p=>calls.filter(c=>c[0]==='fallback'&&c[1]===p),
 };
}
function closed(f){assert.equal(f.panel.hidden,true);assert.equal(f.panel.inert,true);assert.equal(f.controller.state,'closed');assert.equal(f.root.inert,false);assert.equal(f.timers.size,0);}

test('place throws on opening: report, release, Hub layout/motion and normal close',async t=>{
 const f=fixture(t,{place(p){p.style.opacity='0';throw Error('place failed');}});
 assert.equal(await f.open(),true);assert.equal(f.controller.state,'a');assert.equal(f.panel.inert,false);assert.equal(f.panel.style.left,'100px');assert.equal(f.panel.style.opacity,'');
 assert.match(f.errors[0].message,/place failed/);assert.ok(f.calls.some(c=>c[0]==='release'));assert.equal(f.calls.filter(c=>c[0]==='run').length,0);assert.equal(f.fallback(f.panel).length,1);
 await f.controller.close('a');closed(f);assert.equal(f.fallback(f.panel).length,2);
});
test('place failure while open cannot escape resize or retry the failed provider',async t=>{
 let fail=false;const f=fixture(t,{place(){if(fail)throw Error('resize place failed');}});await f.open();fail=true;
 assert.doesNotThrow(()=>f.place());assert.equal(f.panel.hidden,false);assert.equal(f.panel.style.left,'100px');assert.equal(f.errors.length,1);
 f.place();assert.equal(f.errors.length,1);await f.controller.close('a');closed(f);
});
for(const kind of ['throw','reject','timeout'])for(const phase of ['opening','closing'])test(kind+' during '+phase+' finishes with existing Hub fallback and unblocks queued navigation',async t=>{
 let fail=true;
 const f=fixture(t,{run(p,opening){if(!fail||opening!==(phase==='opening'))return;
  p.style.opacity='0';if(kind==='throw')throw Error('native run failed');if(kind==='reject')return Promise.reject(Error('native run rejected'));return new Promise(()=>{});
 }});
 let task;if(phase==='opening')task=f.open();else{await f.open();task=f.controller.close('a');}
 await tick();if(kind==='timeout'){assert.equal(f.panel.dataset.surfaceState,phase);f.expire();}
 assert.equal(await task,true);assert.equal(f.errors.length,1);assert.ok(f.calls.some(c=>c[0]==='release'));assert.ok(f.fallback(f.panel).length);assert.equal(f.panel.style.opacity,'');assert.equal(f.timers.size,0);
 if(phase==='opening'){assert.equal(f.panel.hidden,false);assert.equal(f.panel.inert,false);await f.controller.close('a');}closed(f);
 fail=false;await f.open();assert.equal(f.panel.hidden,false);await f.controller.go('b');assert.equal(f.panel.hidden,true);assert.equal(f.other.hidden,false);await f.controller.close('b');
});
test('a queued Surface proceeds after timeout even if cancel/release throw or reject',async t=>{
 const f=fixture(t,{run(){return new Promise(()=>{});},cancel(){throw Error('cancel failed');},release(){return Promise.reject(Error('release failed'));},report(){throw Error('reporter failed');}});
 const a=f.open();await tick();const b=f.controller.go('b');f.expire();assert.equal(await a,true);assert.equal(await b,true);await tick();
 assert.equal(f.other.hidden,false);assert.equal(f.other.inert,false);assert.equal(f.panel.hidden,true);assert.equal(f.timers.size,0);
 assert.ok(f.errors.some(e=>e.message.includes('超时')));assert.ok(f.errors.some(e=>e.message==='cancel failed'));assert.ok(f.errors.some(e=>e.message==='release failed'));
 await f.controller.close('b');assert.equal(f.root.inert,false);
});
for(const action of ['resize','revoke','dispose'])for(const opening of [true,false])test(action+' clears watchdog and suppresses late provider rejection/fallback; opening='+opening,async t=>{
 let reject;const f=fixture(t,{run(p,isOpening){if(isOpening===opening)return new Promise((_,r)=>reject=r);}});if(!opening)await f.open();const task=opening?f.open():f.controller.close('a');await tick();assert.equal(f.timers.size,1);
 if(action==='revoke')f.controller.revoke('a');else f.controller[action]();await task;
 assert.equal(f.timers.size,0);assert.equal(f.fallback(f.panel).length,0);reject(Error('late rejection'));await tick();assert.equal(f.errors.length,0);assert.equal(f.fallback(f.panel).length,0);
 if(action!=='resize'||!opening)assert.equal(f.panel.hidden,true);else assert.equal(f.panel.inert,false);
});
test('late resolution after timeout does not change the next Surface or create a second fallback',async t=>{
 let finish;const f=fixture(t,{run(){return new Promise(r=>finish=r);}});const opening=f.open();await tick();f.expire();await opening;await f.controller.go('b');const n=f.fallback(f.panel).length;
 finish();await tick();assert.equal(f.fallback(f.panel).length,n);assert.equal(f.panel.hidden,true);assert.equal(f.other.hidden,false);assert.equal(f.controller.state,'b');
});
test('successful native presentation clears deadline, remains delegated and never uses fallback',async t=>{
 const f=fixture(t);await f.open();assert.equal(f.timers.size,0);await f.controller.close('a');closed(f);assert.deepEqual(f.calls.filter(c=>c[0]==='run'),[['run',true],['run',false]]);assert.equal(f.fallback(f.panel).length,0);assert.equal(f.errors.length,0);
});
test('reduced motion and even falsy thrown values complete failure recovery',async t=>{
 const f=fixture(t,{reduced:true,run(){throw undefined;}});await f.open();assert.equal(f.errors.length,1);assert.equal(f.panel.inert,false);await f.controller.close('a');closed(f);assert.equal(f.fallback(f.panel).length,0);
});

test('never-settling cleanup Promises are not awaited during fallback or close',async t=>{
 const f=fixture(t,{run(){throw Error('run failed');},cancel(){return new Promise(()=>{});},release(){return new Promise(()=>{});}});
 assert.equal(await f.open(),true);assert.equal(f.panel.inert,false);await f.controller.close('a');closed(f);assert.equal(f.errors.length,1);
});
