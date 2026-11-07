import assert from 'node:assert/strict';
import {click,wait,settle} from './driver.mjs';
export async function testTimeline(d,check,observations,launch,closeHub){
 const root='#miemie-timeline-extension',book='PHASE3_ONLY_Timeline',character='PHASE3_ONLY_Character';
 await check('Timeline real-host test character and worldbook creation via real Helper APIs',async()=>{
  await d.eval(async({book,character})=>{
   await TavernHelper.createOrReplaceWorldbook(book,[{uid:0,name:'Phase3 Chapter A',content:'<world_timeline>事件一：开篇（60年3月15日）</world_timeline>',enabled:true},{uid:1,name:'Phase3 Chapter B',content:'<world_timeline>事件二：续篇（60年3月16日）</world_timeline>',enabled:false},{uid:2,name:'Non-timeline sentinel',content:'PHASE3 sentinel must not change',enabled:true}]);
   await TavernHelper.createOrReplaceCharacter(character,{description:'Disposable Phase3 test character',first_messages:['Phase3 test only'],worldbook:book});
   const st=await import('/script.js');const index=SillyTavern.getContext().characters.findIndex(c=>c.name===character);await st.selectCharacterById(index);
  },{book,character});await wait(d,()=>TavernHelper.getCurrentCharacterName()==='PHASE3_ONLY_Character');
  await wait(d,async book=>{const c=SillyTavern.getContext();const data=await (await fetch('/api/worldinfo/get',{method:'POST',headers:c.getRequestHeaders(),body:JSON.stringify({name:book}),cache:'no-store'})).json();return Object.keys(data.entries||{}).length===3&&data.entries['0']?.disable===false;},book);
  observations.timelineOriginal=await d.eval(async book=>{const c=SillyTavern.getContext();return (await fetch('/api/worldinfo/get',{method:'POST',headers:c.getRequestHeaders(),body:JSON.stringify({name:book})})).json();},book);
 });
 await check('Timeline Launcher, real read, picker Back, Surface Back and refresh',async()=>{
  await launch('miemie.timeline');await wait(d,()=>document.querySelectorAll('#miemie-timeline-extension .ts-choice').length===2);await settle(d);
  assert.equal(await d.eval(()=>document.querySelector('#miemie-timeline-extension .ts-choice').getAttribute('aria-pressed')),'true');
  await click(d,root+' .ts-route-trigger');await wait(d,()=>document.querySelector('.ts-picker'));await d.key('Escape');assert.equal(await d.eval(()=>!!document.querySelector('.ts-picker')),false);assert.equal(await d.eval(()=>document.querySelector('#meeme-ts-panel').hidden),false);
  await click(d,root+' [data-refresh]');await wait(d,()=>document.querySelectorAll('#miemie-timeline-extension .ts-choice').length===2);await d.key('Escape');await settle(d);assert.equal(await d.eval(()=>document.activeElement?.dataset.hubApp),'miemie.timeline');await launch('miemie.timeline');await settle(d);
 });
 await check('Timeline safe worldbook save and server readback preserve unrelated entry and content',async()=>{
  await click(d,root+' .ts-entry~.ts-entry .ts-choice');await wait(d,()=>document.querySelector('#miemie-timeline-extension .ts-status').textContent.startsWith('已保存：'));
  const saved=await d.eval(async book=>{const c=SillyTavern.getContext();return (await fetch('/api/worldinfo/get',{method:'POST',headers:c.getRequestHeaders(),body:JSON.stringify({name:book}),cache:'no-store'})).json();},book);
  const expected=structuredClone(observations.timelineOriginal);expected.entries['0'].disable=true;expected.entries['1'].disable=false;assert.deepEqual(saved,expected);observations.timelineSaved=saved;
 });
 await check('Timeline delayed real read cancelled by close; late response cannot repaint stale UI',async()=>{
  await d.eval(()=>{const original=window.fetch;window.phase3FetchRestore=()=>window.fetch=original;window.phase3ReadRelease=null;window.fetch=async(...args)=>{const result=await original(...args);if(String(args[0])==='/api/worldinfo/get'&&!window.phase3ReadRelease){await new Promise(r=>window.phase3ReadRelease=r);}return result;};});
  await click(d,root+' [data-refresh]');await wait(d,()=>!!window.phase3ReadRelease);await d.key('Escape');await settle(d);const before=await d.eval(()=>document.querySelector('#miemie-timeline-extension [data-list]').innerHTML);await d.eval(()=>{phase3FetchRestore();phase3ReadRelease();});await settle(d);assert.equal(await d.eval(()=>document.querySelector('#miemie-timeline-extension [data-list]').innerHTML),before);
  await launch('miemie.timeline');await wait(d,()=>document.querySelectorAll('#miemie-timeline-extension .ts-choice').length===2);await settle(d);
 });
 await check('Timeline state storage, Runtime disable/re-enable and Hub reload retain user settings',async()=>{
  await click(d,root+' .ts-route-trigger');await wait(d,()=>document.querySelector('.ts-picker'));await click(d,'.ts-picker [role="option"]:last-child');
  const saved=await d.eval(()=>TavernHelper.getVariables({type:'extension',extension_id:'timeline_switcher_v2'}));assert.equal(saved.books.find(b=>b.name==='PHASE3_ONLY_Timeline').links[0].to,1);observations.timelineSettings=saved;
  await d.eval(()=>__MieMieHub.extensions.disable('miemie.timeline'));assert.equal(await d.eval(()=>!!document.querySelector('#miemie-timeline-extension')),false);await d.eval(()=>__MieMieHub.extensions.enable('miemie.timeline'));await launch('miemie.timeline');await wait(d,()=>document.querySelectorAll('#miemie-timeline-extension .ts-choice').length===2);assert.deepEqual(await d.eval(()=>TavernHelper.getVariables({type:'extension',extension_id:'timeline_switcher_v2'})),saved);await closeHub();
 });
}
