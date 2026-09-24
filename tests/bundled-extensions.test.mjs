import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, cp, rm, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {JSDOM, VirtualConsole} from 'jsdom';
import {loadBundledExtensions} from '../src/bundled-extensions.js';
const run = promisify(execFile), project = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', project)));
const full = JSON.parse(await readFile(new URL(`build/MieMie-Hub-${pkg.version}.json`, project)));
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) {
  for (let i=0;i<200;i++) {if (check()) return; await new Promise(r=>setTimeout(r,5));}
  assert.fail('fixture condition timed out');
}
async function fixture(t, artifact=full, hostAPI=true) {
  const errors=[], subscriptions=new Set(), timers=new Set();
  const vc=new VirtualConsole(); vc.on('jsdomError',e=>errors.push(String(e)));
  const dom=new JSDOM('<!doctype html><body></body>',{url:'http://127.0.0.1:8000',runScripts:'outside-only',virtualConsole:vc});
  const h=dom.window,d=h.document;
  const vars={version:1,books:[{name:'book',auto:false,links:[{from:1,to:2}]}]};
  const before=JSON.stringify(vars);
  const book={entries:{1:{uid:1,comment:'One',disable:false,content:'<world_timeline>事件一：结束（60年3月15日）：结束</world_timeline>'},2:{uid:2,comment:'Two',disable:true,content:'<world_timeline>事件一：结束（60年3月20日）：结束</world_timeline>'}}};
  let writes=0, holdRead=null, frame;
  const ctx={characterId:0,characters:[{name:'Fixture',avatar:'fixture.png'}],chatId:'fixture-chat',chat:[],eventTypes:Object.fromEntries(['GENERATION_STARTED','MESSAGE_RECEIVED','GENERATION_ENDED','GENERATION_STOPPED','CHAT_CHANGED'].map(x=>[x,x])),
    getRequestHeaders:()=>({'Content-Type':'application/json'}),loadWorldInfo:async()=>holdRead?holdRead():structuredClone(book),saveWorldInfo:async()=>{writes++;},reloadWorldInfoEditor(){}};
  if(hostAPI)h.SillyTavern={getContext:()=>ctx};
  h.localStorage.setItem('meeme_timeline_dock_v1',JSON.stringify({side:'right',ratio:.4}));
  h.localStorage.setItem('fixture-other-data','unchanged');
  h.confirm=()=>true;
  h.fetch=async url=>{assert.equal(url,'/api/worldinfo/get');return {ok:true,json:async()=>holdRead?holdRead():structuredClone(book)};};
  async function unmount(){if(!frame)return;const hub=h.__MieMieHub;frame.contentWindow.dispatchEvent(new frame.contentWindow.Event('pagehide'));await hub?.whenDisposed;frame.remove();frame=null;await tick();}
  async function mount(){
    frame=d.createElement('iframe');d.body.appendChild(frame);const w=frame.contentWindow;
    const si=w.setInterval.bind(w),ci=w.clearInterval.bind(w);
    w.setInterval=(...args)=>{const id=si(...args);timers.add(id);return id;};w.clearInterval=id=>{timers.delete(id);ci(id);};
    w.getCharWorldbookNames=()=>({primary:'book',additional:[]});w.getVariables=()=>structuredClone(vars);
    w.replaceVariables=value=>{Object.assign(vars,structuredClone(value));};
    w.eventOn=(type,fn)=>{const item={type,fn};subscriptions.add(item);return{stop:()=>subscriptions.delete(item)};};
    w.fetch=async()=>{throw Error('fixture network unavailable');};
    w.eval(artifact.content);await h.__MieMieHub.ready;await tick();
  }
  t.after(async()=>{await unmount();dom.window.close();assert.deepEqual(errors,[]);});
  await mount();
  return{h,d,vars,before,subscriptions,timers,mount,unmount,get writes(){return writes;},hold(fn){holdRead=fn;},async open(){await h.__MieMieHub.extensions.open('miemie.timeline');await until(()=>d.querySelectorAll('.ts-choice').length===2);}};
}

test('Core and System Modules have no Timeline business or asset dependency',async()=>{
  for(const directory of ['src','assets'])for(const file of await readdir(new URL(directory+'/',project))){
    const text=await readFile(new URL(directory+'/'+file,project),'utf8');
    // A legacy Hub dock-position storage key remains intentionally compatible.
    assert.doesNotMatch(text.replaceAll('meeme_timeline_dock_v1','legacy_position'),/timeline|world_timeline|timeline_switcher_v2|__timelineSwitcherV1/i,file);
  }
  const timeline=await readFile(new URL('extensions/timeline/timeline.js',project),'utf8');
  assert.doesNotMatch(timeline,/hubShell|hubUI|extensionRuntime|from ['"].*src\//);
  assert.doesNotMatch(timeline,/__MieMieHub\.(?!open)/);
  assert.equal((await readdir(new URL('src/',project))).includes('timeline-builtin.js'),false);
});

test('bundled loader isolates invalid sources and uses the ordinary provide contract',async()=>{
  const called=[];
  const result=await loadBundledExtensions([{manifest:{id:'bad'}},{manifest:{id:'good'}}],m=>{
    called.push(m.id);if(m.id==='bad')throw Error('bad source');return{ok:true,ready:Promise.resolve('ready')};
  });
  assert.deepEqual(called,['bad','good']);assert.deepEqual(result.map(x=>x.status),['rejected','fulfilled']);
});

test('physical deletion of Timeline directory and declaration still builds and boots Core',async t=>{
  const copy=await mkdtemp(path.join(tmpdir(),'miemie-core-without-timeline-'));
  t.after(()=>rm(copy,{recursive:true,force:true}));
  for(const name of ['src','assets','tools','packaging','extensions','package.json'])await cp(new URL(name,project),path.join(copy,name),{recursive:true});
  await rm(path.join(copy,'extensions/timeline'),{recursive:true});
  const declarations=JSON.parse(await readFile(path.join(copy,'packaging/bundled-extensions.json'))).filter(x=>x.directory!=='extensions/timeline');
  await writeFile(path.join(copy,'packaging/bundled-extensions.json'),JSON.stringify(declarations));
  for(const selection of [null,'']){
    await run(process.execPath,[path.join(copy,'tools/build.mjs'),...(selection===null?[]:['--bundled='])],{env:{...process.env,MIEMIE_BUILD_MODE:'development',MIEMIE_DEFAULT_REGISTRY_URL:''}});
    const artifact=JSON.parse(await readFile(path.join(copy,`build/MieMie-Hub-${pkg.version}.json`)));
    assert.doesNotMatch(artifact.content,/createTimelineExtension|world_timeline|timeline_switcher_v2|__timelineSwitcherV1|miemie-timeline-extension/);
    assert.ok(!artifact.content.includes((await readFile(new URL('extensions/timeline/icon.png',project))).toString('base64')));
    const f=await fixture(t,artifact,false),runtime=f.h.__MieMieHub.extensions;
    assert.equal(runtime.get('miemie.timeline'),null);assert.equal(f.d.querySelector('.ts-panel'),null);
    assert.equal(f.subscriptions.size,0);assert.equal(f.timers.size,0);
    assert.equal(runtime.list().length,selection===null?1:0);
    if(selection===null)assert.equal((await runtime.open('miemie.hello')).ok,true);
    for(const id of ['extension-center','settings']){
      await f.h.__MieMieHub.open();f.d.querySelector(`[data-hub-app="${id}"]`).click();await tick();
      assert.equal(f.d.querySelector(`[data-hub-panel="${id}"]`).hidden,false);
      assert.equal(runtime.get(id),null,'System Module is not an Extension');
    }
    assert.equal(f.h.localStorage.getItem('fixture-other-data'),'unchanged');
    await f.unmount();assert.equal(f.d.querySelector('#miemie-hub-shell'),null);
    await f.mount();assert.equal(f.d.querySelectorAll('#miemie-hub-shell').length,1);
    await f.unmount();
  }
});

test('Timeline uses runtime lifecycle, closes pickers, preserves data and stays single-instance on reload',async t=>{
  const f=await fixture(t),runtime=()=>f.h.__MieMieHub.extensions;
  assert.equal(runtime().get('miemie.timeline').enabled,true);assert.equal(f.subscriptions.size,5);assert.equal(f.timers.size,1);
  await f.open();f.d.querySelector('[data-routing-trigger]').click();assert.ok(f.d.querySelector('.ts-picker'));
  await f.h.__MieMieHub.open();await tick();assert.equal(f.d.querySelector('.ts-picker'),null);
  for(let i=0;i<3;i++){
    await runtime().disable('miemie.timeline');assert.equal(f.subscriptions.size,0);assert.equal(f.timers.size,0);
    assert.equal(f.d.querySelector('#miemie-timeline-extension'),null);assert.equal(f.h.__timelineSwitcherV1,undefined);
    assert.equal(f.d.querySelector('[data-hub-app="miemie.timeline"]'),null);
    assert.equal((await runtime().open('miemie.hello')).ok,true);
    await runtime().enable('miemie.timeline');assert.equal(f.subscriptions.size,5);assert.equal(f.timers.size,1);
    assert.equal(f.d.querySelectorAll('#miemie-timeline-extension').length,1);
  }
  await f.unmount();assert.equal(f.subscriptions.size,0);assert.equal(f.timers.size,0);
  await f.mount();assert.equal(f.subscriptions.size,5);assert.equal(f.d.querySelectorAll('[data-hub-app="miemie.timeline"]').length,1);
  assert.equal(JSON.stringify(f.vars),f.before);
});

test('Timeline is a fixed Launcher tool, absent from installed management even with stale preferences',async t=>{
  const f=await fixture(t);
  async function installed(){await f.h.__MieMieHub.open();f.d.querySelector('[data-hub-app="extension-center"]').click();await tick();f.d.querySelector('[data-center-tab="installed"]').click();await tick();}
  await installed();
  assert.equal(f.d.querySelector('[data-extension-id="miemie.timeline"]'),null);
  for(const action of ['open','toggle','uninstall','check','update','register'])assert.equal(f.d.querySelector(`[data-action="miemie.timeline:${action}"]`),null);
  assert.ok(f.d.querySelector('[data-action="miemie.hello:uninstall"]'),'Hello existing contract unchanged');
  assert.ok(f.d.querySelector('[data-hub-app="miemie.timeline"]'));
  // Developer lifecycle calls remain standard, but cannot establish a normal product removal preference.
  await f.h.__MieMieHub.extensions.disable('miemie.timeline');await f.unmount();await f.mount();
  assert.equal(f.h.__MieMieHub.extensions.get('miemie.timeline').enabled,true);assert.equal(f.subscriptions.size,5);
  await f.h.__MieMieHub.extensions.uninstall('miemie.timeline');await f.unmount();await f.mount();
  assert.equal(f.h.__MieMieHub.extensions.get('miemie.timeline').enabled,true);await installed();
  assert.equal(f.d.querySelector('[data-action="miemie.timeline:register"]'),null);
  assert.equal(f.d.querySelector('[data-extension-id="miemie.timeline"]'),null);
  assert.equal(f.subscriptions.size,5);assert.equal(JSON.stringify(f.vars),f.before);
});

test('disabling Timeline during a pending worldbook read prevents a late write',async t=>{
  const f=await fixture(t);await f.open();let release;
  f.hold(()=>new Promise(resolve=>{release=resolve;}));
  f.d.querySelectorAll('.ts-choice')[1].click();await until(()=>release);
  await f.h.__MieMieHub.extensions.disable('miemie.timeline');release({entries:{}});await tick();
  assert.equal(f.writes,0);assert.equal(f.d.querySelector('#miemie-timeline-extension'),null);
  assert.equal(JSON.stringify(f.vars),f.before);
});

test('missing Timeline host APIs fail that Extension without blocking Core or Hello',async t=>{
  const f=await fixture(t,full,false);
  assert.equal(f.h.__MieMieHub.extensions.get('miemie.timeline').enabled,false);
  assert.equal(f.d.querySelector('#miemie-timeline-extension'),null);
  assert.equal(f.subscriptions.size,0);assert.equal(f.timers.size,0);
  assert.equal((await f.h.__MieMieHub.extensions.open('miemie.hello')).ok,true);
  await f.h.__MieMieHub.open();assert.ok(f.d.querySelector('[data-hub-app="settings"]'));
});
