import assert from 'node:assert/strict';
import {click,wait,settle} from './driver.mjs';
export async function testLifecycle(d,check,observations,launch,closeHub,preference,hub,fixture){
 const id='test.miemie.native-window-parity';
 observations.resourcesBeforeLifecycle=await d.eval(()=>phase3Resources());
 await check('Runtime disable/uninstall and Source release revoke all fixture leases and clean hooks/DOM',async()=>{
  await d.eval(()=>window.oldProbe=__MieMieNativeAcceptance);await d.eval(id=>__MieMieHub.extensions.disable(id),id);
  assert.deepEqual(await d.eval(()=>[oldProbe.stats.active,oldProbe.stats.hooks,document.querySelectorAll('[data-native-parity-panel],[data-native-parity-orb]').length]),[0,0,0]);
  assert.equal(await d.eval(()=>oldProbe.controls.nativeLeases.some(l=>l.isCurrent())||oldProbe.controls.surfaceLeases.some(l=>l.isCurrent())),false);
  await d.eval(id=>__MieMieHub.extensions.enable(id),id);await wait(d,()=>__MieMieNativeAcceptance.stats.active===1);await closeHub();await click(d,'[data-native-parity-orb]');await settle(d);assert.equal(await d.eval(()=>oldProbe.snapshot().business.draft),'Phase3 draft 中文');
  await d.eval(id=>__MieMieHub.extensions.uninstall(id),id);assert.equal(await d.eval(()=>oldProbe.stats.active),0);assert.equal(await d.eval(id=>JSON.parse(localStorage.getItem('miemie_hub_shortcuts_v1')||'{}')[id]??null,id),null);
  await d.eval(()=>oldProbe.releaseSource());assert.equal(await d.eval(()=>document.querySelectorAll('[data-native-parity-panel],[data-native-parity-orb]').length),0);
  await d.eval(()=>TavernHelper.updateScriptTreesWith(s=>s.map(x=>x.id.endsWith('002')?{...x,enabled:false}:x),{type:'global'}));await wait(d,()=>!window.__MieMieNativeAcceptance);
  await d.eval(()=>localStorage.removeItem('miemie_hub_extensions_v1'));
 });
 // A new Helper fixture source is re-registered after Hub reload.
 await d.eval(()=>TavernHelper.updateScriptTreesWith(s=>s.map(x=>x.id.endsWith('002')?{...x,enabled:true}:x),{type:'global'}));await wait(d,()=>window.__MieMieNativeAcceptance);
 // Reload the Hub below reconstructs state from the clean local preference.
 await check('real Helper Hub disable/reload: standalone handoff, one successor and Timeline state retained',async()=>{
  await d.eval(()=>{window.previousHub=__MieMieHub;TavernHelper.updateScriptTreesWith(s=>s.map(x=>x.id.endsWith('001')?{...x,enabled:false}:x),{type:'global'});});await wait(d,()=>!window.__MieMieHub);await d.eval(()=>previousHub.whenDisposed);await wait(d,()=>__MieMieNativeAcceptance.snapshot().business?.mode==='standalone');
  assert.equal(await d.eval(()=>__MieMieNativeAcceptance.stats.active),1);assert.equal(await d.eval(()=>document.querySelectorAll('#miemie-hub-shell,#miemie-timeline-extension').length),0);
  await d.eval(()=>TavernHelper.updateScriptTreesWith(s=>s.map(x=>x.id.endsWith('001')?{...x,enabled:true}:x),{type:'global'}));await wait(d,()=>window.__MieMieHub&&window.__MieMieHub!==previousHub);await d.eval(()=>__MieMieHub.ready);await wait(d,()=>__MieMieNativeAcceptance.snapshot().business?.mode==='hub');
  assert.equal(await d.eval(()=>__MieMieNativeAcceptance.stats.peak),1);assert.equal(await d.eval(()=>document.querySelectorAll('#miemie-hub-shell').length),1);assert.equal(await d.eval(()=>__MieMieHub.extensions.get('miemie.timeline').enabled),true);
  assert.deepEqual(await d.eval(()=>TavernHelper.getVariables({type:'extension',extension_id:'timeline_switcher_v2'})),observations.timelineSettings);
  await launch('miemie.timeline');await wait(d,()=>document.querySelectorAll('#miemie-timeline-extension .ts-choice').length===2);await closeHub();
 });
 await check('final real Helper teardown leaves no Hub/Timeline/fixture DOM, active business or live captured lease',async()=>{
  await d.eval(()=>{window.finalProbe=__MieMieNativeAcceptance;window.finalHub=__MieMieHub;TavernHelper.replaceScriptTrees([],{type:'global'});});await wait(d,()=>!window.__MieMieHub&&!window.__MieMieNativeAcceptance);await d.eval(()=>finalHub.whenDisposed);await settle(d);
  assert.deepEqual(await d.eval(()=>[finalProbe.stats.active,finalProbe.stats.hooks,document.querySelectorAll('#miemie-hub-shell,#miemie-timeline-extension,[data-native-parity-panel],[data-native-parity-orb]').length]),[0,0,0]);
  assert.equal(await d.eval(()=>finalProbe.controls.surfaceLeases.some(x=>x.isCurrent())||finalProbe.controls.nativeLeases.some(x=>x.isCurrent())),false);
  observations.resourcesAfterTeardown=await d.eval(()=>phase3Resources());await wait(d,()=>phase3Resources().timeouts===0,null,15000);observations.resourcesAfterHostSave=await d.eval(()=>phase3Resources());observations.finalFixture=await d.eval(()=>finalProbe.snapshot());
 });
}
