import assert from 'node:assert/strict';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createDriver,wait,settle,click} from '../browser-host/driver.mjs';import {installNativeWindowAcceptance} from '../fixtures/native-window-extension.js';import {installDeepBusiness} from './fixture.mjs';import {instrumentResources} from '../browser-host/resources.mjs';
const kind=process.env.TEST_BROWSER||'chromium',out=new URL('../../../evidence/deep-'+kind+'/',import.meta.url);await mkdir(out,{recursive:true});const bytes=await readFile(new URL('../../build/MieMie-Hub-0.9.0.json',import.meta.url)),artifact=JSON.parse(bytes),content='('+installNativeWindowAcceptance+')(window,true);\n('+installDeepBusiness+')(window);',fixture={type:'script',id:'95000000-0000-4000-8000-000000000003',name:'PHASE5 Dynamic business fixture',enabled:true,content},hub={...artifact,id:'95000000-0000-4000-8000-000000000001',enabled:true};const id='test.miemie.native-window-parity',P='[data-native-parity-panel]',O='[data-native-parity-orb]';const results=[],errors=[],observations={};let d,cdp;
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.stack});throw e;}}
async function closeHub(){if(await d.eval(()=>!!document.querySelector('#miemie-hub-shell')?.dataset.hubForeground))await d.eval(()=>__meemeCombinedUI.toggle());await settle(d);}
async function pref(value){await d.eval(()=>__MieMieHub.open());await settle(d);await click(d,'[data-hub-app="extension-center"]');await settle(d);await click(d,'[data-center-tab="installed"]');await settle(d);await d.eval(({id,value})=>{const n=document.querySelector('[data-shortcut="'+id+'"]');if(n.checked!==value){n.checked=value;n.dispatchEvent(new Event('change',{bubbles:true}));}},{id,value});await closeHub();}
async function native(){if(!(await d.eval(()=>__MieMieNativeAcceptance.snapshot().business.visible)))await click(d,O);await settle(d);}
async function deep(label){
 await native();await d.eval(()=>phase5Deep.add());await wait(d,()=>phase5Deep.frame.contentDocument?.querySelector('input')&&Array.isArray(phase5Deep.frame.contentWindow.trace));
 await click(d,'[data-deep-add]');await click(d,'[data-deep-add]');await click(d,'[data-deep-menu]');await d.fill('[data-deep-input]','dynamic draft 中文');await d.key('x');await click(d,'[data-deep-save]');
 await d.eval(()=>{const s=phase5Deep.stage;s.scrollTop=s.scrollHeight;phase5Deep.shadowInput.focus();});await d.key('s');
 await d.eval(()=>phase5Deep.frame.contentDocument.querySelector('input').focus());await d.key('f');await d.eval(()=>phase5Deep.frame.contentDocument.querySelector('input').focus());await d.key('Escape');
 await d.eval(()=>phase5Deep.frame.contentDocument.querySelector('button').click());await d.eval(()=>phase5Deep.animate());
 const snapshot=await d.eval(()=>phase5Deep.snapshot());observations[label]=snapshot;assert.equal(snapshot.views,2);assert.deepEqual(snapshot.actions,['1','0']);assert.equal(snapshot.input,'dynamic draft 中文x');assert.equal(snapshot.persisted,snapshot.input);assert.equal(snapshot.shadow,'s');assert.equal(snapshot.frameValue,'f');assert.equal(snapshot.frameOutput,'1');assert.ok(snapshot.frameTrace.some(x=>x.key==='Escape'&&x.trusted));assert.ok(snapshot.scroll>0);assert.equal(await d.eval(()=>phase5Deep.stage.dataset.animation),'finished');
 const trace=snapshot.events.filter(x=>x.type==='keydown'&&x.key==='x');assert.deepEqual(trace.map(x=>x.label),['capture','target','bubble']);assert.ok(trace.every(x=>x.trusted&&!x.prevented));
 await d.screenshot(new URL(label+'.png',out).pathname);
}
try{
 d=await createDriver(kind,errors);await d.goto('http://127.0.0.1:48190/');await wait(d,()=>!!window.TavernHelper);await wait(d,()=>!document.querySelector('.splash-screen'));await d.resize(1200,1000);if(d.page){cdp=await d.page.context().newCDPSession(d.page);await cdp.send('Performance.enable');}observations.env=await d.eval(async()=>({tavern:await TavernHelper.getTavernVersion(),helper:await TavernHelper.getTavernHelperVersion(),ua:navigator.userAgent}));
 await d.eval(()=>TavernHelper.replaceScriptTrees([],{type:'global'}));await wait(d,()=>!window.__MieMieHub&&!window.__MieMieNativeAcceptance);await d.eval(()=>localStorage.clear());await d.eval(instrumentResources);
 await d.eval(a=>TavernHelper.replaceScriptTrees([a],{type:'global'}),fixture);await wait(d,()=>!!window.__MieMieNativeAcceptance&&!!window.phase5Deep,null,60000);await check('Standalone dynamically created views, event capture/bubble, closed shadow, real iframe keyboard, scroll, animation and persistence',()=>deep('standalone'));
 await d.eval(()=>TavernHelper.replaceScriptTrees([],{type:'global'}));await wait(d,()=>!window.__MieMieNativeAcceptance);await d.eval(()=>localStorage.clear());await d.eval(a=>TavernHelper.replaceScriptTrees(a,{type:'global'}),[fixture,hub]);await wait(d,()=>window.__MieMieHub&&window.__MieMieNativeAcceptance?.snapshot().business?.mode==='hub',null,60000);await d.eval(()=>__MieMieHub.ready);await pref(true);
 await check('Hub Native identical bytes: dynamic interactions run without any Core adaptation',()=>deep('native'));
 await check('Standalone/Hub Native structural, layout, style, state and event-flow differential',async()=>{for(const k of ['html','input','rect','style','views','actions','scroll','shadow','frameValue','frameOutput','persisted'])assert.deepEqual(observations.native[k],observations.standalone[k],k);});
 await check('100 Hub/Native handoffs preserve dynamically-created DOM, iframe draft and one business/hook',async()=>{
  const samples=[];for(let j=0;j<100;j++){
   await d.eval(async id=>{await __MieMieHub.extensions.open(id);document.querySelector('[data-native-parity-orb]').click();},id);await closeHub();
   if(j%10===9){const s=await d.eval(()=>({business:__MieMieNativeAcceptance.snapshot(),deep:phase5Deep.snapshot(),resources:phase3Resources()}));assert.equal(s.business.stats.active,1);assert.equal(s.business.stats.hooks,1);assert.equal(s.business.stats.peak,1);assert.equal(s.deep.input,'dynamic draft 中文x');assert.equal(s.deep.frameValue,'f');assert.equal(s.deep.views,2);if(cdp){await cdp.send('HeapProfiler.collectGarbage');const m=await cdp.send('Performance.getMetrics');s.heapAfterGC=m.metrics.find(x=>x.name==='JSHeapUsedSize').value;s.dom=await cdp.send('Memory.getDOMCounters');}samples.push({cycle:j+1,...s});}
  }observations.stress=samples;
 });
 await check('25 Race A closing takeovers and 25 Race B queued/late opens retain Native ownership',async()=>{
  const records=[];
  for(let i=0;i<25;i++){
   await closeHub();await d.eval(()=>__MieMieHub.open());await settle(d);
   await d.eval(()=>{window.phase5Closing=__meemeCombinedUI.toggle();document.querySelector('[data-native-parity-orb]').click();});await d.eval(()=>phase5Closing);await settle(d);
   assert.equal(await d.eval(()=>document.querySelector('#meeme-combined-menu').hidden),true);
   assert.equal(await d.eval(()=>__MieMieNativeAcceptance.snapshot().business.leaseCurrent),true);
   await d.eval(id=>{const c=__MieMieNativeAcceptance.controls;c.holdOpen=true;c.lateResults=[];window.phase5First=__MieMieHub.extensions.open(id);},id);await wait(d,()=>__MieMieNativeAcceptance.controls.pending.length===1);
   await d.eval(id=>{window.phase5Second=__MieMieHub.extensions.open(id);document.querySelector('[data-native-parity-orb]').click();document.querySelector('[data-native-parity-orb]').click();const c=__MieMieNativeAcceptance.controls;c.holdOpen=false;c.release();},id);
   await d.eval(()=>Promise.all([phase5First,phase5Second]));await settle(d);
   const r=await d.eval(()=>({late:__MieMieNativeAcceptance.controls.lateResults,probe:__MieMieNativeAcceptance.snapshot()}));assert.deepEqual(r.late,[false]);assert.equal(r.probe.business.leaseCurrent,true);assert.equal(r.probe.stats.peak,1);records.push(r);
  }observations.repeatedRaces=records;
 });
 await check('dynamic subtree remains unchanged during Hub foreground and viewport changes',async()=>{await native();const before=await d.eval(()=>phase5Deep.stage.outerHTML);await d.eval(()=>__MieMieHub.open());await settle(d);await d.resize(1050,850);assert.equal(await d.eval(()=>phase5Deep.stage.outerHTML),before);await closeHub();await d.resize(1200,1000);});
 await check('ON/OFF preserves business and dynamic draft; captured old Native/Surface leases stay invalid',async()=>{const factories=await d.eval(()=>__MieMieNativeAcceptance.stats.factories);for(let i=0;i<5;i++){await pref(false);assert.equal(await d.eval(()=>document.querySelectorAll('[data-native-parity-orb]').length),0);await pref(true);await native();}assert.equal(await d.eval(()=>__MieMieNativeAcceptance.stats.factories),factories);assert.equal(await d.eval(()=>phase5Deep.snapshot().input),'dynamic draft 中文x');});
 await check('20 Runtime disable/enable cycles and 5 Helper Hub reloads retain one hook and saved draft',async()=>{
  await native();await d.fill('[data-native-parity-panel] textarea','Phase5 lifecycle draft');await d.eval(()=>phase5Deep.cleanup());
  observations.lifecycle=[];
  for(let i=0;i<20;i++){
   await d.eval(id=>__MieMieHub.extensions.disable(id),id);assert.equal(await d.eval(()=>__MieMieNativeAcceptance.stats.active),0);assert.equal(await d.eval(()=>__MieMieNativeAcceptance.stats.hooks),0);
   await d.eval(id=>__MieMieHub.extensions.enable(id),id);await wait(d,()=>__MieMieNativeAcceptance.stats.active===1);
   const r=await d.eval(()=>{const p=__MieMieNativeAcceptance,n=p.stats.pulses;document.dispatchEvent(new Event('miemie-native-test-pulse'));return{...p.snapshot(),pulseDelta:p.stats.pulses-n};});assert.equal(r.pulseDelta,1);assert.equal(r.business.draft,'Phase5 lifecycle draft');assert.equal(r.stats.peak,1);observations.lifecycle.push(r);
  }
  for(let i=0;i<5;i++){
   await d.eval(()=>{window.phase5OldHub=__MieMieHub;TavernHelper.updateScriptTreesWith(t=>t.map(x=>x.id.endsWith('001')?{...x,enabled:false}:x),{type:'global'});});await wait(d,()=>!window.__MieMieHub);await d.eval(()=>phase5OldHub.whenDisposed);await wait(d,()=>__MieMieNativeAcceptance.snapshot().business?.mode==='standalone');
   await d.eval(()=>TavernHelper.updateScriptTreesWith(t=>t.map(x=>x.id.endsWith('001')?{...x,enabled:true}:x),{type:'global'}));await wait(d,()=>window.__MieMieHub&&window.__MieMieHub!==phase5OldHub,null,60000);await d.eval(()=>__MieMieHub.ready);await wait(d,()=>__MieMieNativeAcceptance.snapshot().business?.mode==='hub');assert.equal(await d.eval(()=>__MieMieNativeAcceptance.stats.peak),1);assert.equal(await d.eval(()=>__MieMieNativeAcceptance.stats.hooks),1);assert.equal(await d.eval(()=>__MieMieNativeAcceptance.snapshot().business.draft),'Phase5 lifecycle draft');
  }
 });
 await check('source withdrawal and physical fixture removal clean business, dynamic roots and leases',async()=>{await d.eval(async()=>{phase5Deep.cleanup();await __MieMieNativeAcceptance.releaseSource();});assert.equal(await d.eval(()=>__MieMieNativeAcceptance.stats.active),0);assert.equal(await d.eval(()=>__MieMieNativeAcceptance.controls.nativeLeases.filter(x=>x.isCurrent()).length),0);await d.eval(()=>TavernHelper.replaceScriptTrees([],{type:'global'}));await wait(d,()=>!window.__MieMieHub&&!window.phase5Deep&&!window.__MieMieNativeAcceptance);assert.equal(await d.eval(()=>document.querySelectorAll('[data-deep-stage],[data-native-parity-panel],[data-native-parity-orb]').length),0);observations.finalResources=await d.eval(()=>phase3Resources());});
}catch(e){errors.push(e.stack);console.error(e);process.exitCode=1;if(d)await d.screenshot(new URL('failure.png',out).pathname).catch(()=>{});}finally{await writeFile(new URL('results.json',out),JSON.stringify({kind,engine:d?.version,artifactSha256:createHash('sha256').update(bytes).digest('hex'),fixtureSha256:createHash('sha256').update(content).digest('hex'),results,observations,errors},null,2));await d?.close();}
