import assert from 'node:assert/strict';
import {createBackFixture} from '../fixtures/back-extension.js';
import {click,wait,settle} from './driver.mjs';
export async function testBack(d,check,observations,launch,closeHub){
 await check('real-host Portal and closed Shadow Escape stay with Native owner under Hub foreground',async()=>{
  await closeHub();if(!await d.eval(()=>__MieMieNativeAcceptance.snapshot().business.leaseCurrent))await click(d,'[data-native-parity-orb]');await settle(d);await d.eval(()=>__MieMieHub.open());await settle(d);
  for(const target of ['portal','shadow']){await d.eval(target=>{(target==='portal'?document.querySelector('[data-native-parity-portal]'):__MieMieNativeAcceptance.controls.shadowInput).focus();},target);await d.key('Escape');assert.equal(await d.eval(()=>document.querySelector('#meeme-combined-menu').dataset.open),'true');}
  await closeHub();
 });
 await check('actual browser top-layer Native dialog keeps precedence over Hub foreground',async()=>{
  if(!await d.eval(()=>__MieMieNativeAcceptance.snapshot().business.visible))await click(d,'[data-native-parity-orb]');await settle(d);await click(d,'[data-open-dialog]');await wait(d,()=>document.querySelector('[data-native-dialog]').open);await d.eval(()=>__MieMieHub.open());await settle(d);
  assert.equal(await d.eval(()=>{const n=document.querySelector('[data-native-dialog]'),r=n.getBoundingClientRect();return n.matches(':modal')&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
  await d.key('Escape');assert.equal(await d.eval(()=>document.querySelector('[data-native-dialog]').open),false);await closeHub();
 });
 await d.eval(async source=>{window.backProbe=eval('('+source+')')(document);window.backSource=__MieMieHub.extensions.provide(backProbe.manifest,backProbe.factory);await backSource.ready;},createBackFixture.toString());
 await check('real-host trusted Back traverses three layers, returns matching icon, then closes Honeycomb',async()=>{
  await launch('test.back.layers');await settle(d);for(let n=2;n>=0;n--){await d.key('Escape');assert.equal(await d.eval(()=>backProbe.remaining),n);assert.equal(await d.eval(()=>backProbe.panel.hidden),false);}await d.key('Escape');await settle(d);assert.equal(await d.eval(()=>document.activeElement.dataset.hubApp),'test.back.layers');await d.key('Escape');await settle(d);assert.equal(await d.eval(()=>document.querySelector('#meeme-combined-menu').hidden),true);assert.equal(await d.eval(()=>backProbe.factories),1);
 });
 await check('real-host Back request revoked by disable and source withdrawal cleans its panel',async()=>{await launch('test.back.layers');await settle(d);await d.key('Escape');await d.eval(()=>__MieMieHub.extensions.disable('test.back.layers'));assert.equal(await d.eval(()=>backProbe.request.isCurrent()),false);await d.eval(()=>backSource.release());assert.equal(await d.eval(()=>document.querySelectorAll('[data-back-fixture]').length),0);await closeHub();});
 if(d.kind==='chromium')await check('Chromium real touch gesture, mobile viewport and reduced-motion paths',async()=>{
  await d.page.emulateMedia({reducedMotion:'reduce'});await d.resize(420,820);await launch('miemie.timeline');await settle(d);assert.equal(await d.eval(()=>document.querySelector('#meeme-ts-panel').dataset.surfaceState),'open');await d.resize(820,420);await settle(d);await d.key('Escape');await settle(d);await closeHub();
  const orb=d.page.locator('[data-native-parity-orb]');await orb.tap();await settle(d);
  if(!await d.eval(()=>__MieMieNativeAcceptance.snapshot().business.visible)){await orb.tap();await settle(d);}
  const session=await d.page.context().newCDPSession(d.page);const rect=await d.eval(()=>{const r=document.querySelector('[data-native-drag]').getBoundingClientRect();return{x:r.x+15,y:r.y+10};});const before=await d.eval(()=>__MieMieNativeAcceptance.snapshot().business.rect);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x,y:rect.y,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x+30,y:rect.y+20,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const after=await d.eval(()=>__MieMieNativeAcceptance.snapshot().business.rect);assert.equal(after.x-before.x,30);assert.equal(after.y-before.y,20);await session.detach();await d.page.emulateMedia({reducedMotion:'no-preference'});await d.resize(1200,1000);
 });
 else observations.mobileAndReducedMotion='PENDING: this is desktop Safari; iOS driver session unavailable and OS reduced-motion preference not changed';
}
