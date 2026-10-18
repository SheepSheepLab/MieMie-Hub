import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM, VirtualConsole} from 'jsdom';
import {createRuntimeFixture} from './fixtures/runtime-extension.js';
import {createBackFixture} from './fixtures/back-extension.js';

const read = name => readFile(new URL('../' + name, import.meta.url), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const artifact = JSON.parse(await read('build/咩咩Hub-' + pkg.version + '.json'));
const registryBase = JSON.parse(artifact.content.split('\n').find(line => line.startsWith('const HUB_DEFAULT_REGISTRY_URL=')).slice('const HUB_DEFAULT_REGISTRY_URL='.length, -1));
const settle = () => new Promise(resolve => setImmediate(resolve));

// Execute the complete built Hub in a disposable helper-like iframe. There is
// no character selected, no Polisher artifact, and no real network access.
async function fixture(t, releaseFetch = async () => ({ok: true, json: async () => [{tag_name: 'v' + pkg.version, draft: false, prerelease: true}]}), pendingInstall = false) {
  const errors = [], requests = [], releaseRequests = [], listeners = [], subscriptions = new Set();
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://hub-test.invalid/', runScripts: 'outside-only', virtualConsole,
  });
  const host = dom.window, doc = host.document;
  host.SillyTavern = {getContext: () => ({
    characterId: null, characters: [], chat: [],
    eventTypes: Object.fromEntries(['GENERATION_STARTED', 'GENERATION_ENDED', 'MESSAGE_RECEIVED', 'GENERATION_STOPPED', 'CHAT_CHANGED'].map(name => [name, name])),
  })};
  host.visualViewport = Object.assign(new host.EventTarget(), {width: 1024, height: 768, offsetLeft: 0, offsetTop: 0});
  function blockNetwork(scope) {
    const block = kind => {requests.push(kind); throw Error('Unexpected network request: ' + kind);};
    scope.fetch = async () => block('fetch');
    scope.XMLHttpRequest.prototype.send = () => block('XMLHttpRequest');
    scope.navigator.sendBeacon = () => block('sendBeacon');
    scope.WebSocket = class {constructor() {block('WebSocket');}};
    scope.EventSource = class {constructor() {block('EventSource');}};
  }
  blockNetwork(host);
  const types = new Set(['click', 'keydown', 'keyup', 'blur', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'resize', 'scroll', 'orientationchange']);
  const eventPrototype = host.EventTarget.prototype;
  const add = eventPrototype.addEventListener, remove = eventPrototype.removeEventListener;
  const capture = options => typeof options === 'boolean' ? options : !!options?.capture;
  eventPrototype.addEventListener = function(type, fn, options) {
    if (types.has(type) && !listeners.some(x => x.target === this && x.type === type && x.fn === fn && x.capture === capture(options))) {
      listeners.push({target: this, type, fn, capture: capture(options)});
    }
    return add.call(this, type, fn, options);
  };
  eventPrototype.removeEventListener = function(type, fn, options) {
    const index = listeners.findIndex(x => x.target === this && x.type === type && x.fn === fn && x.capture === capture(options));
    if (index >= 0) listeners.splice(index, 1);
    return remove.call(this, type, fn, options);
  };
  let frame, installSignal;
  if(pendingInstall)host.localStorage.setItem('miemie_registry_url_v1','https://registry.example');
  function unmount() {
    if (!frame) return;
    frame.contentWindow.dispatchEvent(new frame.contentWindow.Event('pagehide'));
    frame.remove(); frame = null;
  }
  async function mount() {
    frame = doc.createElement('iframe'); doc.body.appendChild(frame);
    const scope = frame.contentWindow;
    blockNetwork(scope);
    Object.assign(scope, {TextDecoder, TextEncoder});
    scope.fetch = (url, init) => {
      if(pendingInstall&&url.startsWith('https://registry.example/api/catalog'))return Promise.resolve(Response.json({items:[{id:'pending-fixture',name:'Fixture',description:'【简介】\n'+('正文。'.repeat(300)),sourceType:'github',sourceUrl:'https://github.com/DevelopmentFixture/Example',github:{compatibility:'installable',manifest:{id:'fixture.example'}}}],hasMore:false}));
      if(pendingInstall&&url==='https://api.github.com/repos/DevelopmentFixture/Example'){installSignal=init.signal;return new Promise(()=>{});}
      if (registryBase && url === registryBase + '/api/catalog?page=1&pageSize=12&q=&source=') return Promise.resolve(Response.json({items:[],hasMore:false}));
      assert.equal(url, 'https://api.github.com/repos/SheepSheepLab/MieMie-Hub/releases?per_page=100&page=1');
      releaseRequests.push({url, init}); return releaseFetch(url, init);
    };
    scope.getCharWorldbookNames = () => ({primary: '', additional: []});
    scope.getVariables = () => ({});
    scope.eventOn = (type, fn) => {
      const subscription = {type, fn}; subscriptions.add(subscription);
      return {stop() {subscriptions.delete(subscription);}};
    };
    scope.eval(artifact.content);
    await host.__MieMieHub.ready; await settle();
  }
  t.after(() => {
    unmount(); dom.window.close();
    assert.deepEqual(errors, [], 'uncaught DOM errors');
    assert.deepEqual(requests, [], 'unexpected network activity');
  });
  await mount();
  const query = selector => doc.querySelector(selector);
  async function click(selector) {
    const element = query(selector);
    assert.ok(element && !element.disabled, selector);
    element.click(); await settle();
  }
  async function launch(id) {
    await host.__MieMieHub.open(); await click('[data-hub-app="' + id + '"]');
  }
  return {host, doc, query, click, launch, listeners, subscriptions, requests, releaseRequests, unmount, mount, getInstallSignal:()=>installSignal};
}

test('Core system launchers coexist with existing entries without registering Extensions', async t => {
  const f = await fixture(t);
  await f.click('.ts-orb');
  assert.equal(f.query('#meeme-combined-menu').dataset.open, 'true');
  for (const [id, label] of [['miemie.timeline', '时间线切换器'], ['extension-center', '扩展中心'], ['settings', '设置']]) {
    assert.equal(f.doc.querySelectorAll('[data-hub-app="' + id + '"]').length, 1);
    assert.equal(f.query('[data-hub-app="' + id + '"]').getAttribute('aria-label'), label);
  }
  assert.deepEqual(Array.from(f.host.__MieMieHub.extensions.list(), item => item.manifest.id), ['miemie.timeline']);
  await f.click('[data-hub-app="extension-center"]');
  const panel = f.query('[data-hub-panel="extension-center"]');
  assert.equal(panel.hidden, false); assert.equal(panel.inert, false);
  assert.equal(f.query('[data-hub-app="extensions"]'), null);
  for (const tab of ['discover', 'installed', 'mine']) assert.ok(f.query('[data-center-tab="' + tab + '"]'));
  assert.match(panel.textContent, registryBase ? /没有符合条件的上架项目/ : /在线扩展服务暂未开放/);
  await f.click('[data-center-tab="installed"]');
  assert.equal(f.doc.querySelectorAll('[data-extension-id]').length, 0);
});

test('settings uses the actual package and built Core version, with an honest initial status', async t => {
  const f = await fixture(t);
  await f.launch('settings');
  assert.equal(f.query('[data-hub-panel="settings"]').hidden, false);
  assert.equal(f.query('[data-hub-version]').textContent, pkg.version);
  assert.equal(f.query('[data-hub-update-test]').textContent, '自动更新功能测试版本');
  assert.equal(f.query('[data-hub-version]').textContent, f.host.__MieMieHub.version);
  assert.equal(artifact.name, '咩咩Hub ' + pkg.version);
  assert.equal(f.query('[data-hub-update-status]').dataset.hubUpdateStatus, 'unchecked');
  assert.equal(f.query('[data-hub-update-status]').textContent, '尚未检查');
  assert.equal(f.query('[data-hub-latest-version]').parentElement.hidden, true);
  assert.equal(f.releaseRequests.length, 0);
});

for (const [version, state, label] of [[pkg.version, 'current', '✓ 已是最新版'], ['9.0.0', 'available', '● 发现新版本'], ['0.2.0', 'ahead', '当前版本高于已发布版本']]) {
  test('settings shows remote version and ' + state + ', offering update only for a newer release', async t => {
    const f = await fixture(t, async () => ({ok: true, json: async () => [{id: 123, tag_name: 'v' + version, draft: false, prerelease: true}]}));
    await f.launch('settings'); await f.click('[data-hub-action="check-updates"]');
    const status = f.query('[data-hub-update-status]');
    assert.equal(status.dataset.hubUpdateStatus, state); assert.equal(status.textContent, label);
    assert.equal(status.getAttribute('role'), 'status');
    assert.equal(f.query('[data-hub-latest-version]').textContent, version);
    assert.equal(f.query('[data-hub-latest-version]').parentElement.hidden, false);
    assert.equal(f.query('[data-hub-action="update"]').hidden, state !== 'available');
    assert.equal(f.query('[data-hub-action="check-updates"]').disabled, false);
    await f.click('[data-hub-panel="settings"] .mm-return'); await f.launch('settings');
    assert.equal(f.query('[data-hub-update-status]'), status); assert.equal(status.textContent, label);
    assert.equal(f.releaseRequests.length, 1); assert.deepEqual(f.requests, []);
  });
}

test('checking disables duplicate clicks and failure clears stale success and permits retry', async t => {
  let finish, attempt = 0;
  const success = {ok: true, json: async () => [{tag_name: 'v' + pkg.version, draft: false}]};
  const f = await fixture(t, () => ++attempt === 2 ? new Promise(resolve => {finish = resolve;}) : success);
  await f.launch('settings'); await f.click('[data-hub-action="check-updates"]');
  const button = f.query('[data-hub-action="check-updates"]'), status = f.query('[data-hub-update-status]');
  button.click(); button.click(); button.onclick(); await settle();
  assert.equal(button.disabled, true); assert.equal(status.textContent, '正在检查…');
  assert.equal(f.releaseRequests.length, 2); assert.equal(f.query('[data-hub-latest-version]').parentElement.hidden, true);
  finish({ok: false, status: 403, json() {throw Error('unused');}}); await settle();
  assert.equal(status.textContent, '检查更新失败'); assert.equal(button.disabled, false);
  assert.match(f.query('[data-hub-update-error]').textContent, /HTTP 403/);
  assert.equal(f.query('[data-hub-latest-version]').parentElement.hidden, true);
  await f.click('[data-hub-action="check-updates"]');
  assert.equal(status.textContent, '✓ 已是最新版'); assert.equal(f.releaseRequests.length, 3);
  assert.equal(f.query('[data-hub-update-error]').hidden, true);
});

test('Hub pagehide aborts a pending check and late results cannot touch the disposed panel or a new Hub', async t => {
  let finish;
  const f = await fixture(t, () => new Promise(resolve => {finish = resolve;}));
  await f.launch('settings'); await f.click('[data-hub-action="check-updates"]');
  const status = f.query('[data-hub-update-status]'), button = f.query('[data-hub-action="check-updates"]'), handler = button.onclick;
  f.unmount(); assert.equal(f.releaseRequests[0].init.signal.aborted, true);
  assert.equal(button.onclick, null); handler();
  finish({ok: true, json: async () => [{tag_name: '9.0.0', draft: false}]}); await settle();
  assert.equal(status.textContent, '正在检查…'); assert.equal(f.releaseRequests.length, 1);
  assert.equal(f.query('[data-hub-panel="settings"]'), null);
  await f.mount(); await f.launch('settings');
  assert.equal(f.query('[data-hub-update-status]').textContent, '尚未检查');
  assert.equal(f.query('[data-hub-action="check-updates"]').disabled, false);
});

test('timeline and optional Extension launchers still work alongside Core panels', async t => {
  const f = await fixture(t);
  await f.launch('miemie.timeline');
  assert.equal(f.query('.ts-panel').hidden, false);
  assert.equal(f.query('[data-hub-panel="settings"]').hidden, true);
  const probe = createRuntimeFixture();
  await f.host.__MieMieHub.extensions.provide(probe.manifest, probe.factory).ready;
  await f.launch('test.runtime');
  assert.equal(f.query('[data-hub-panel="message"]').hidden, false);
  assert.match(f.query('[data-hub-panel="message"]').textContent, /Fixture message/);
  await f.host.__MieMieHub.extensions.disable('test.runtime');
  assert.equal(f.query('[data-hub-app="test.runtime"]'), null);
  await f.launch('extension-center');
  assert.equal(f.query('[data-hub-panel="extension-center"]').hidden, false);
  await f.host.__MieMieHub.extensions.enable('test.runtime');
  await f.launch('test.runtime');
  assert.equal(f.query('[data-hub-panel="message"]').hidden, false);
});

test('repeated panel switching, return, Escape and orb close reuse DOM and listeners', async t => {
  const f = await fixture(t);
  const center = f.query('[data-hub-panel="extension-center"]'), settings = f.query('[data-hub-panel="settings"]');
  const checkButton = f.query('[data-hub-action="check-updates"]'), checkHandler = checkButton.onclick;
  assert.equal(settings.querySelector('[data-hub-developer-settings]'), null);
  assert.doesNotMatch(settings.textContent,/高级 \/ 开发者选项|扩展服务|registry\.sheepsheeplab/);
  assert.match(center.textContent,/发现更多工具/);
  assert.doesNotMatch(center.textContent,/发现更多咩咩工具/);
  assert.equal(center.querySelector('[aria-label="Registry 服务地址"]'), null);
  const listenerCount = f.listeners.length;
  const panelCount = f.doc.querySelectorAll('.mm-hub-panel').length;
  for (let i = 0; i < 12; i++) {
    await f.launch('extension-center');
    assert.equal(center.hidden, false); assert.equal(settings.hidden, true);
    await f.click('[data-hub-panel="extension-center"] .mm-return');
    assert.equal(f.query('#meeme-combined-menu').dataset.open, 'true');
    await f.click('[data-hub-app="settings"]');
    assert.equal(center.hidden, true); assert.equal(settings.hidden, false);
    await f.click('.ts-orb');
    assert.equal(settings.hidden, true);
    assert.equal(f.query('#meeme-combined-menu').dataset.open, 'false');
    await f.launch('settings');
    f.doc.dispatchEvent(new f.host.KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); await settle();
    assert.equal(settings.hidden, true);
    assert.equal(f.query('#meeme-combined-menu').dataset.open, 'true');
    f.doc.dispatchEvent(new f.host.KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); await settle();
    assert.equal(f.query('#meeme-combined-menu').dataset.open, 'false');
  }
  await f.host.__MieMieHub.open();
  f.query('[data-hub-app="extension-center"]').click();
  f.query('[data-hub-app="settings"]').click(); await settle();
  assert.equal(center.hidden, true); assert.equal(settings.hidden, false);
  assert.equal(f.query('[data-hub-panel="extension-center"]'), center);
  assert.equal(f.query('[data-hub-panel="settings"]'), settings);
  assert.equal(f.doc.querySelectorAll('.mm-hub-panel').length, panelCount);
  assert.equal(f.doc.querySelectorAll('[data-hub-action="check-updates"]').length, 1);
  assert.equal(f.query('[data-hub-action="check-updates"]'), checkButton);
  assert.equal(checkButton.onclick, checkHandler);
  assert.equal(f.doc.querySelectorAll('[data-hub-developer-settings]').length, 0);
  assert.equal(f.listeners.length, listenerCount);
});

test('script removal cleans up new panels and handlers, and reload creates one fresh instance', async t => {
  const f = await fixture(t);
  const listenerCount = f.listeners.length;
  await f.launch('settings'); await f.click('[data-hub-action="check-updates"]');
  const oldButton = f.query('[data-hub-action="check-updates"]');
  assert.equal(f.query('[data-action="registry:configure"]'), null);
  f.unmount(); await settle();
  assert.equal(oldButton.onclick, null);
  assert.equal(f.doc.querySelectorAll('[data-hub-panel], [data-hub-app], #miemie-hub-shell, #miemie-timeline-extension, #meeme-combined-menu').length, 0);
  assert.equal(f.listeners.length, 0); assert.equal(f.subscriptions.size, 0);
  assert.equal(f.host.__MieMieHub, undefined);
  oldButton.click(); await settle();
  assert.equal(f.doc.querySelectorAll('[data-hub-panel]').length, 0);
  await f.mount(); await f.launch('settings');
  for (const id of ['extension-center', 'settings']) {
    assert.equal(f.doc.querySelectorAll('[data-hub-panel="' + id + '"]').length, 1);
    assert.equal(f.doc.querySelectorAll('[data-hub-app="' + id + '"]').length, 1);
  }
  assert.equal(f.query('[data-hub-update-status]').textContent, '尚未检查');
  assert.equal(f.listeners.length, listenerCount);
});

test('Extension Center has a semantic sidebar and persistent header login, outside scroll panes',async t=>{
 const f=await fixture(t);await f.launch('extension-center');const center=f.query('[data-hub-panel="extension-center"]');
 assert.ok(center.querySelector('.mm-hub-header [data-action="registry:login"]'));
 assert.equal(center.querySelector('.mm-hub-body [data-action="registry:login"]'),null);
 for(const id of ['discover','installed','mine']){const b=center.querySelector('[data-center-tab="'+id+'"]');assert.ok(b.title);assert.ok(b.getAttribute('aria-label'));b.click();await settle();assert.equal(b.getAttribute('aria-current'),'page');assert.ok(center.querySelector('.mm-hub-header [data-action="registry:login"]'));}
});

async function surfaceProbe(f,id){
 let api,panel,surfaceLease,opens=0,deactivations=0;
 const lease=f.host.__MieMieHub.extensions.provide({id,name:id,version:'1.0.0',schemaVersion:1,apiVersion:2,contributes:{launcher:{title:id}}},context=>{
  api=context;return {activate(){panel=f.doc.createElement('section');panel.tabIndex=-1;panel.dataset.surfaceTest=id;panel.innerHTML='<div>Content</div><button>Close</button>';panel.lastChild.onclick=()=>api.closePanel(surfaceLease);f.doc.body.append(panel);panel.getBoundingClientRect=()=>({left:100,top:50,width:600,height:650});api.attachPanel(panel);api.onCleanup(()=>panel.remove());},open(lease){surfaceLease=lease;opens++;return api.showPanel(lease);},deactivate(){deactivations++;}};
 });await lease.ready;
 return {open:()=>f.host.__MieMieHub.extensions.open(id),show:()=>api.showPanel(surfaceLease),close:()=>api.closePanel(surfaceLease),get api(){return api;},get panel(){return panel;},get opens(){return opens;},get deactivations(){return deactivations;},lease};
}
function animationProbe(f,hold=false){
 const calls=[],pending=new Set();
 f.host.Element.prototype.animate=function(frames,options){let finish;const a={finished:hold?new Promise(r=>finish=r):Promise.resolve(),cancel(){finish?.();pending.delete(a);}};calls.push({el:this,frames,options});if(hold)pending.add(a);return a;};
 return {calls,async finish(){for(let n=0;n<16;n++){for(const a of [...pending])a.cancel();await settle();}}};
}
test('Surface A and B use their own icon rect, return scroll, and keep business instances alive',async t=>{
 const f=await fixture(t),a=await surfaceProbe(f,'test.surface.a'),b=await surfaceProbe(f,'test.surface.b');
 await f.host.__MieMieHub.open();const scroll=f.query('.mm-honeycomb-scroll');scroll.scrollTop=215;
 const icon=id=>f.query('[data-hub-app="'+id+'"]');
 icon('test.surface.a').getBoundingClientRect=()=>({left:160,top:220,width:60,height:60});
 icon('test.surface.b').getBoundingClientRect=()=>({left:360,top:320,width:50,height:50});
 const motion=animationProbe(f);
 await f.click('[data-hub-app="test.surface.a"]');assert.equal(a.panel.dataset.surfaceState,'open');assert.equal(f.query('#meeme-combined-menu').dataset.surface,'true');
 assert.match(motion.calls.find(c=>c.el===a.panel).frames[0].transform,/translate\(60px,170px\) scale\(0.1,/);
 scroll.scrollTop=800;icon('test.surface.a').getBoundingClientRect=()=>({left:190,top:240,width:60,height:60});
 await a.close();assert.equal(scroll.scrollTop,215);assert.equal(a.panel.hidden,true);assert.equal(a.deactivations,0);
 assert.match(motion.calls.filter(c=>c.el===a.panel).at(-1).frames.at(-1).transform,/translate\(90px,190px\)/);
 await f.click('[data-hub-app="test.surface.b"]');assert.match(motion.calls.find(c=>c.el===b.panel).frames[0].transform,/translate\(260px,270px\)/);
 assert.equal(await a.close(),false,'A cannot close B');assert.equal(b.panel.hidden,false);
 await b.close();assert.equal(scroll.scrollTop,215);assert.equal(b.deactivations,0);assert.equal(f.host.__MieMieHub.extensions.get('test.surface.a').enabled,true);
});
test('Surface opening/closing deduplicates, queues switches and is safe on disable during animation',async t=>{
 const f=await fixture(t),a=await surfaceProbe(f,'test.surface.a'),b=await surfaceProbe(f,'test.surface.b');await f.host.__MieMieHub.open();
 const motion=animationProbe(f,true),button=f.query('[data-hub-app="test.surface.a"]');button.click();button.click();await settle();assert.equal(a.opens,1);assert.equal(a.panel.dataset.surfaceState,'opening');
 const again=a.show();await motion.finish();await again;assert.equal(motion.calls.filter(c=>c.el===a.panel).length,1);
 const close=a.close(),closeAgain=a.close();assert.equal(closeAgain,false);await settle();assert.equal(a.panel.dataset.surfaceState,'closing');
 const showB=b.open();await motion.finish();await Promise.all([close,showB]);assert.equal(a.panel.hidden,true);assert.equal(b.panel.hidden,false);assert.equal(b.panel.dataset.surfaceState,'open');
 const closingB=b.close();await settle();await f.host.__MieMieHub.extensions.disable('test.surface.b');await motion.finish();await closingB;
 assert.equal(b.panel.isConnected,false);assert.equal(f.query('#meeme-combined-menu').inert,false);assert.notEqual(f.query('#meeme-combined-menu').dataset.surface,'true');
});
test('Surface close tolerates removed launchers, resize, and restores after explicit detach',async t=>{
 const f=await fixture(t),a=await surfaceProbe(f,'test.surface.a');await f.launch('test.surface.a');
 f.query('[data-hub-app="test.surface.a"]').remove();Object.assign(f.host.visualViewport,{width:390,height:700});f.host.visualViewport.dispatchEvent(new f.host.Event('resize'));
 const motion=animationProbe(f);await a.close();assert.equal(a.panel.hidden,true);assert.equal(f.query('#meeme-combined-menu').inert,false);
 assert.equal(motion.calls.find(c=>c.el===a.panel).frames.at(-1).transform,'translate(0,12px) scale(0.96)');
 await a.open();await a.lease.release();assert.equal(a.panel.isConnected,false);assert.equal(f.query('#meeme-combined-menu').inert,false);
});
test('System and bundled surfaces share Back/Escape, reduced motion retains scroll, unadapted UI stays independent',async t=>{
 const f=await fixture(t);f.host.matchMedia=()=>({matches:true});f.host.Element.prototype.animate=()=>{throw Error('Reduced motion must skip animation');};
 const independent=f.doc.createElement('section');independent.textContent='Independent third-party UI';f.doc.body.append(independent);
 await f.host.__MieMieHub.open();const scroll=f.query('.mm-honeycomb-scroll');scroll.scrollTop=170;
 for(const id of ['settings','extension-center','miemie.timeline']){
  await f.click('[data-hub-app="'+id+'"]');const p=id==='miemie.timeline'?f.query('.ts-panel'):f.query('[data-hub-panel="'+id+'"]');assert.equal(p.hidden,false);
  if(id==='settings')f.doc.dispatchEvent(new f.host.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));else p.querySelector('.mm-return').click();await settle();
  assert.equal(p.hidden,true);assert.equal(scroll.scrollTop,170);assert.equal(f.query('#meeme-combined-menu').inert,false);assert.equal(independent.hidden,false);
 }
 f.unmount();await settle();assert.equal(f.query('#meeme-combined-menu'),null);assert.equal(independent.isConnected,true);
});

test('unadapted launcher stays independent and Hub disposal cancels an opening Surface',async t=>{
 const f=await fixture(t);let opened=0;const own=f.doc.createElement('section');own.hidden=true;f.doc.body.append(own);
 await f.host.__MieMieHub.extensions.provide({id:'test.independent',name:'Independent',version:'1.0.0',schemaVersion:1,apiVersion:2,contributes:{launcher:{title:'Independent'}}},()=>({open(){opened++;own.hidden=false;}})).ready;
 await f.launch('test.independent');assert.equal(opened,1);assert.equal(own.hidden,false);assert.equal(own.dataset.surfaceState,undefined);assert.equal(own.parentElement,f.doc.body);
 const a=await surfaceProbe(f,'test.surface.a');await f.host.__MieMieHub.open();const motion=animationProbe(f,true);
 f.query('[data-hub-app="test.surface.a"]').click();await settle();assert.equal(a.panel.dataset.surfaceState,'opening');
 f.unmount();await motion.finish();assert.equal(a.panel.isConnected,false);assert.equal(f.query('#meeme-combined-menu'),null);assert.equal(own.isConnected,true);
});


test('legacy message surfaces switch with distinct extension origins',async t=>{
 const f=await fixture(t);let apiA,apiB;
 for(const [id,assign] of [['test.message.a',api=>apiA=api],['test.message.b',api=>apiB=api]]){
  await f.host.__MieMieHub.extensions.provide({id,name:id,version:'1.0.0',schemaVersion:1,apiVersion:2,contributes:{launcher:{title:id}}},api=>{assign(api);return {open(){return api.showMessage(id);}};}).ready;
 }
 await f.host.__MieMieHub.open();
 const panel=f.query('[data-hub-panel="message"]');panel.getBoundingClientRect=()=>({left:100,top:50,width:600,height:650});
 f.query('[data-hub-app="test.message.a"]').getBoundingClientRect=()=>({left:160,top:220,width:60,height:60});
 f.query('[data-hub-app="test.message.b"]').getBoundingClientRect=()=>({left:360,top:320,width:50,height:50});
 const motion=animationProbe(f);await apiA.showMessage('A');await settle();await apiB.showMessage('B');await settle();
 assert.equal(panel.querySelector('.mm-extension-message-text').textContent,'B');
 const flights=motion.calls.filter(c=>c.el===panel);assert.equal(flights.length,3);
 assert.match(flights[1].frames.at(-1).transform,/translate\(60px,170px\)/);
 assert.match(flights[2].frames[0].transform,/translate\(260px,270px\)/);
 await f.click('[data-hub-panel="message"] .mm-return');assert.equal(panel.hidden,true);
 assert.match(motion.calls.filter(c=>c.el===panel).at(-1).frames.at(-1).transform,/translate\(260px,270px\)/);
});

test('queued Surface requests from a detached session cannot open a replacement instance',async t=>{
 const f=await fixture(t),a=await surfaceProbe(f,'test.surface.a'),b=await surfaceProbe(f,'test.surface.b');await f.host.__MieMieHub.open();
 const motion=animationProbe(f,true),opening=a.open();await settle();
 const staleAPI=b.api,queued=b.open();
 await f.host.__MieMieHub.extensions.disable('test.surface.b');
 await f.host.__MieMieHub.extensions.enable('test.surface.b');
 const replacement=b.panel;assert.notEqual(b.api,staleAPI);
 await motion.finish();await opening;assert.equal((await queued).cancelled,true);assert.equal(replacement.hidden,true);assert.equal(a.panel.hidden,true);
 assert.equal(staleAPI.closePanel(),false);assert.equal(a.panel.hidden,true);
 const fresh=b.open();await motion.finish();await fresh;assert.equal(replacement.hidden,false);assert.equal(a.panel.hidden,true);
});

test('Surface morph hands icon art to an opaque clipped window and back, cleaning up on interruption',async t=>{
 const f=await fixture(t),a=await surfaceProbe(f,'test.surface.morph');await f.host.__MieMieHub.open();
 const button=f.query('[data-hub-app="test.surface.morph"]');button.getBoundingClientRect=()=>({left:160,top:220,width:60,height:60});
 const image=f.doc.createElement('img');image.src='https://example.com/icon.png';button.querySelector('span').replaceChildren(image);
 const motion=animationProbe(f,true),opening=a.open();await settle();
 const face=a.panel.querySelector('[data-surface-face]');assert.ok(face);assert.equal(face.getAttribute('aria-hidden'),'true');assert.equal(face.inert,true);
 assert.equal(face.querySelector('img').src,image.src);assert.equal(button.style.visibility,'hidden');assert.equal(a.panel.style.overflow,'hidden');
 const flight=motion.calls.find(c=>c.el===a.panel);assert.equal(flight.frames[0].opacity,1);assert.equal(flight.frames[0].clipPath,'inset(0 round 50%)');
 const artFlight=motion.calls.find(c=>c.el===face);assert.equal(artFlight.frames[0].opacity,1);assert.equal(artFlight.frames.at(-1).opacity,0);
 await motion.finish();await opening;assert.equal(a.panel.querySelector('[data-surface-face]'),null);assert.equal(button.style.visibility,'');assert.equal(a.panel.style.overflow,'');
 const closing=a.close();await settle();const closeFace=a.panel.querySelector('[data-surface-face]');assert.ok(closeFace);
 const reverse=motion.calls.find(c=>c.el===closeFace);assert.equal(reverse.frames[0].opacity,0);assert.equal(reverse.frames.at(-1).opacity,1);
 const closeFlight=motion.calls.filter(c=>c.el===a.panel).at(-1);assert.equal(closeFlight.frames.at(-1).opacity,1);assert.equal(closeFlight.frames.at(-1).clipPath,'inset(0 round 50%)');
 await f.host.__MieMieHub.extensions.disable('test.surface.morph');await motion.finish();await closing;
 assert.equal(closeFace.isConnected,false);assert.equal(button.style.visibility,'');assert.equal(f.doc.querySelector('[data-surface-face]'),null);assert.equal(f.query('#meeme-combined-menu').inert,false);
});

test('viewport change finishes in-flight Surface at current geometry without a stuck overlay',async t=>{
 const f=await fixture(t),a=await surfaceProbe(f,'test.surface.resize');await f.host.__MieMieHub.open();
 const scroll=f.query('.mm-honeycomb-scroll');scroll.scrollTop=180;
 const button=f.query('[data-hub-app="test.surface.resize"]');button.getBoundingClientRect=()=>({left:160,top:220,width:60,height:60});
 const motion=animationProbe(f,true),opening=a.open();await settle();
 assert.equal(a.panel.dataset.surfaceState,'opening');assert.ok(a.panel.querySelector('[data-surface-face]'));
 Object.assign(f.host.visualViewport,{width:390,height:700});f.host.visualViewport.dispatchEvent(new f.host.Event('resize'));
 await opening;assert.equal(a.panel.dataset.surfaceState,'open');assert.equal(a.panel.inert,false);assert.equal(a.panel.style.width,'366px');
 assert.equal(a.panel.querySelector('[data-surface-face]'),null);assert.equal(button.style.visibility,'');
 const closing=a.close();await settle();assert.equal(a.panel.dataset.surfaceState,'closing');
 Object.assign(f.host.visualViewport,{width:700,height:390});f.host.dispatchEvent(new f.host.Event('orientationchange'));
 await closing;assert.equal(a.panel.hidden,true);assert.equal(a.panel.dataset.surfaceState,'closed');assert.equal(a.panel.style.width,'600px');
 assert.equal(scroll.scrollTop,180);assert.equal(f.query('#meeme-combined-menu').inert,false);
 assert.equal(f.doc.querySelector('[data-surface-face]'),null);assert.equal(a.deactivations,0);await motion.finish();
});

test('revocation during opening and Hub disposal during closing release Surface state and icon faces',async t=>{
 const f=await fixture(t),a=await surfaceProbe(f,'test.surface.abort');await f.host.__MieMieHub.open();
 let button=f.query('[data-hub-app="test.surface.abort"]');button.getBoundingClientRect=()=>({left:160,top:220,width:60,height:60});
 const motion=animationProbe(f,true),opening=a.open();await settle();
 await f.host.__MieMieHub.extensions.disable('test.surface.abort');assert.equal((await opening).cancelled,true);
 assert.equal(a.panel.isConnected,false);assert.equal(f.doc.querySelector('[data-surface-face]'),null);assert.equal(button.style.visibility,'');
 assert.equal(f.query('#meeme-combined-menu').inert,false);
 await f.host.__MieMieHub.extensions.enable('test.surface.abort');button=f.query('[data-hub-app="test.surface.abort"]');button.getBoundingClientRect=()=>({left:160,top:220,width:60,height:60});
 const again=a.open();await motion.finish();await again;
 const closing=a.close();await settle();assert.equal(a.panel.dataset.surfaceState,'closing');
 f.unmount();await closing;assert.equal(a.panel.isConnected,false);assert.equal(f.doc.querySelector('[data-surface-face]'),null);
 assert.equal(f.query('#meeme-combined-menu'),null);assert.equal(button.style.visibility,'');await motion.finish();
});

test('full Hub reopen recenters while an Extension round trip preserves the scrolled position',async t=>{
 const f=await fixture(t),a=await surfaceProbe(f,'test.recenter');await f.host.__MieMieHub.open();
 const scroll=f.query('.mm-honeycomb-scroll'),center=scroll.scrollTop;scroll.scrollTop=center+125;
 await f.click('[data-hub-app="test.recenter"]');await a.close();assert.equal(scroll.scrollTop,center+125);
 await f.click('.ts-orb');assert.equal(f.query('#meeme-combined-menu').hidden,true);
 await f.host.__MieMieHub.open();assert.equal(scroll.scrollTop,center);
});
test('registered external stacking roots sit above the blur layer and restore on close or revoke',async t=>{
 const f=await fixture(t),a=await surfaceProbe(f,'test.layers');
 const app=f.doc.createElement('div');app.style.cssText='position:fixed;z-index:10000';f.doc.documentElement.append(app);app.append(a.panel);
 const previous=app.getAttribute('style'),shell=f.query('#miemie-hub-shell');
 await f.launch('test.layers');assert.ok(Number(f.host.getComputedStyle(app).zIndex)>Number(f.host.getComputedStyle(shell).zIndex));
 for(let node=a.panel;node;node=node.parentElement)assert.ok(!f.host.getComputedStyle(node).filter?.includes('blur('));
 await a.close();assert.equal(app.getAttribute('style'),previous);
 await a.open();await a.lease.release();assert.equal(app.getAttribute('style'),previous);
 for(const id of ['settings','extension-center','miemie.timeline']){
  await f.launch(id);const panel=id==='miemie.timeline'?f.query('.ts-panel'):f.query('[data-hub-panel="'+id+'"]');
  for(let node=panel;node;node=node.parentElement)assert.ok(!f.host.getComputedStyle(node).filter?.includes('blur('));
  if(id==='miemie.timeline')assert.ok(Number(f.host.getComputedStyle(f.query('#miemie-timeline-extension')).zIndex)>Number(f.host.getComputedStyle(shell).zIndex));
  panel.querySelector('.mm-return').click();await settle();
 }
});
test('Timeline historical center icon lands in header after morph; resize cancels the landing',async t=>{
 const f=await fixture(t);await f.host.__MieMieHub.open();const panel=f.query('.ts-panel'),icon=panel.querySelector('[data-tool-icon]');
 panel.getBoundingClientRect=()=>({left:100,top:40,width:600,height:650});icon.getBoundingClientRect=()=>({left:116,top:54,width:52,height:52});
 const rect=f.host.Element.prototype.getBoundingClientRect;f.host.Element.prototype.getBoundingClientRect=function(){return this.hasAttribute('data-surface-hero')?{left:326,top:291,width:148,height:148}:rect.call(this);};
 const motion=animationProbe(f);await f.launch('miemie.timeline');
 const hero=motion.calls.find(c=>c.el.hasAttribute('data-surface-hero'));assert.ok(hero);assert.equal(hero.options.duration,760);assert.equal(hero.frames[1].offset,.16);assert.match(hero.frames.at(-1).transform,/translate\(-258px,-285px\) scale\(/);
 assert.equal(f.query('[data-surface-hero]'),null);assert.equal(icon.style.visibility,'');
 panel.querySelector('.mm-return').click();await settle();
 const held=animationProbe(f,true);f.query('[data-hub-app="miemie.timeline"]').click();await settle();f.host.visualViewport.dispatchEvent(new f.host.Event('resize'));await held.finish();
 assert.equal(f.query('[data-surface-hero]'),null);assert.equal(panel.dataset.surfaceState,'open');assert.equal(icon.style.visibility,'');
});
for(const exit of ['button','escape'])test('built Hub '+exit+' cancels pending install inspection immediately',async t=>{
 const f=await fixture(t,undefined,true);await f.launch('extension-center');
 for(let i=0;i<50&&!f.query('[data-action="pending-fixture:install"]');i++)await settle();
 await f.click('[data-action="pending-fixture:install"]');
 for(let i=0;i<50&&!f.getInstallSignal();i++)await settle();assert.ok(f.getInstallSignal());
 const panel=f.query('[data-hub-panel="extension-center"]'),toast=panel.querySelector('[data-install-progress]');
 assert.equal(toast.parentElement,panel);assert.equal(toast.nextElementSibling,panel.querySelector('.mm-return'));
 if(exit==='button')panel.querySelector('.mm-return').click();else f.doc.dispatchEvent(new f.host.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(f.getInstallSignal().aborted,true);assert.equal(toast.hidden,true);await settle();
});


test('description Escape closes only its dialog in the complete built Hub and disposal removes the modal',async t=>{
 const f=await fixture(t,undefined,true);
 f.host.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 f.host.HTMLDialogElement.prototype.close=function(){this.open=false;};
 await f.launch('extension-center');await f.click('.mm-description-open');
 const panel=f.query('[data-hub-panel="extension-center"]');assert.equal(panel.hidden,false);assert.ok(f.query('dialog[open]'));
 f.query('.mm-description-full').dispatchEvent(new f.host.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await settle();
 assert.equal(f.query('dialog'),null);assert.equal(panel.hidden,false);assert.equal(f.doc.activeElement,f.query('.mm-description-open'));
 await f.click('.mm-description-open');f.unmount();assert.equal(f.query('dialog'),null);
 assert.equal(f.listeners.filter(x=>x.type==='keydown').length,0);
});

function escape(f,{repeat=false,target=f.doc.activeElement,release=true,isComposing=false}={}){
 const e=new f.host.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true,composed:true,repeat,isComposing});
 target.dispatchEvent(e);if(release)f.doc.dispatchEvent(new f.host.KeyboardEvent('keyup',{key:'Escape',bubbles:true}));return e;
}
async function backFixture(f,options){const probe=createBackFixture(f.doc,options);const lease=f.host.__MieMieHub.extensions.provide(probe.manifest,probe.factory);await lease.ready;await f.launch(probe.manifest.id);return {probe,lease};}
function nativeDialogStub(f){f.host.HTMLDialogElement.prototype.showModal=function(){this.open=true;};f.host.HTMLDialogElement.prototype.close=function(){this.open=false;};}

test('optional Back consumes exactly one internal layer, then preserves the original honeycomb close',async t=>{
 const f=await fixture(t),{probe}=await backFixture(f);const scroll=f.query('.mm-honeycomb-scroll');scroll.scrollTop=174;
 for(let remaining=2;remaining>=0;remaining--){assert.equal(escape(f).defaultPrevented,true);await settle();assert.equal(probe.remaining,remaining);assert.equal(probe.panel.hidden,false);}
 escape(f);await settle();assert.equal(probe.panel.hidden,true);assert.equal(probe.calls,4);assert.equal(probe.factories,1);
 assert.equal(f.query('#meeme-combined-menu').hidden,false);assert.equal(f.doc.activeElement?.dataset.hubApp,probe.manifest.id);
 await probe.open();await probe.close();assert.equal(probe.calls,4,'Explicit Close never delegates');
 assert.equal(f.host.__MieMieHub.extensions.requestBack,undefined);assert.equal(f.host.__MieMieHub.back,undefined);
});
test('one held Escape cannot drain layers or subsequently close the returned Launcher; blur and independent presses recover',async t=>{
 const f=await fixture(t),{probe}=await backFixture(f,{layers:1});
 escape(f,{release:false});for(let i=0;i<5;i++)escape(f,{repeat:true,release:false});assert.equal(probe.calls,1);assert.equal(probe.panel.hidden,false);
 f.host.dispatchEvent(new f.host.Event('blur'));escape(f,{release:false});await settle();assert.equal(probe.panel.hidden,true);
 escape(f,{repeat:true,release:false});await settle();assert.equal(f.query('#meeme-combined-menu').hidden,false);
 f.doc.dispatchEvent(new f.host.KeyboardEvent('keyup',{key:'Escape'}));escape(f);await settle();assert.equal(f.query('#meeme-combined-menu').hidden,true);
});
test('Back skips IME and already consumed input and blocks repeat even when first keydown was not observed',async t=>{
 const f=await fixture(t),{probe}=await backFixture(f);
 assert.equal(escape(f,{isComposing:true}).defaultPrevented,false);escape(f,{repeat:true});assert.equal(probe.calls,0);
 const before=e=>{if(e.key==='Escape')e.preventDefault();};f.host.addEventListener('keydown',before,true);escape(f);f.host.removeEventListener('keydown',before,true);
 assert.equal(probe.calls,0);escape(f);assert.equal(probe.calls,1);
});
test('API 2 fixture without optional Back retains capture, repeat, close, reopening and lifecycle',async t=>{
 const f=await fixture(t),a=await surfaceProbe(f,'test.legacy.back');let targetCalls=0;
 a.panel.addEventListener('keydown',()=>targetCalls++);await f.launch('test.legacy.back');
 escape(f,{repeat:true,target:a.panel});await settle();assert.equal(a.panel.hidden,true);assert.equal(targetCalls,0);
 await f.launch('test.legacy.back');await a.close();assert.equal(a.deactivations,0);
 await f.host.__MieMieHub.extensions.disable('test.legacy.back');await f.host.__MieMieHub.extensions.enable('test.legacy.back');
 await f.launch('test.legacy.back');escape(f);await settle();assert.equal(a.panel.hidden,true);
 await f.host.__MieMieHub.extensions.uninstall('test.legacy.back');assert.equal(f.host.__MieMieHub.extensions.get('test.legacy.back'),null);
});
for(const [name,handler]of [['throw',()=>{throw Error('fixture draft');}],['promise',()=>Promise.reject(Error('async draft'))],['invalid',()=>undefined]])test('Back '+name+' preserves draft and offers safe recovery without trapping explicit close',async t=>{
 const f=await fixture(t);nativeDialogStub(f);const a=await surfaceProbe(f,'test.back.fault');let calls=0;
 a.api.registerBackHandler(()=>{calls++;return handler();});await f.launch('test.back.fault');escape(f);await settle();
 assert.equal(a.panel.hidden,false);assert.equal(f.host.__MieMieHub.extensions.get('test.back.fault').enabled,true);
 let dialog=f.query('[data-back-recovery]');assert.ok(dialog?.open);assert.match(dialog.textContent,/未保存/);
 escape(f);await settle();assert.equal(f.query('[data-back-recovery]'),null);assert.equal(calls,1);assert.equal(a.panel.hidden,false);
 escape(f);await settle();dialog=f.query('[data-back-recovery]');[...dialog.querySelectorAll('button')].find(b=>b.textContent==='关闭当前界面').click();await settle();
 assert.equal(a.panel.hidden,true);assert.equal(calls,2);assert.equal(f.query('[data-back-recovery]'),null);
 const b=await surfaceProbe(f,'test.back.other');await f.launch('test.back.other');escape(f);await settle();assert.equal(b.panel.hidden,true);
});
test('fault recovery retry can succeed and stale recovery cannot close the next Surface',async t=>{
 const f=await fixture(t);nativeDialogStub(f);const a=await surfaceProbe(f,'test.back.retry'),b=await surfaceProbe(f,'test.back.next');let fail=true;
 a.api.registerBackHandler(()=>{if(fail)throw Error('retry');return false;});await f.launch('test.back.retry');escape(f);await settle();
 const stale=f.query('[data-back-recovery] button:last-child');await b.open();stale.click();await settle();assert.equal(b.panel.hidden,false);
 await a.open();escape(f);await settle();fail=false;f.query('[data-back-recovery] button:nth-child(2)').click();await settle();assert.equal(a.panel.hidden,true);
});
test('Surface transition guard and request validity reuse existing queue across close/reopen and revoke',async t=>{
 const f=await fixture(t),{probe,lease}=await backFixture(f,{layers:8});escape(f);const oldRequest=probe.request;
 await probe.close();await probe.open();assert.equal(oldRequest.isCurrent(),false);
 const motion=animationProbe(f,true);const closing=probe.close();escape(f);assert.equal(probe.calls,1);await motion.finish();await closing;
 const opening=probe.open();await settle();escape(f);assert.equal(probe.calls,1);await motion.finish();await opening;
 escape(f);assert.equal(probe.calls,2);const current=probe.request;const release=lease.release();assert.equal(current.isCurrent(),false);assert.equal(probe.api.registerBackHandler(()=>false),false);await release;
 const {probe:replacement}=await backFixture(f,{id:probe.manifest.id,layers:1});assert.equal(current.isCurrent(),false);await motion.finish();escape(f);assert.equal(replacement.calls,1);
});
test('handlers dispatch by current owner, including body portals and closed Shadow DOM, without DOM ancestry inference',async t=>{
 const f=await fixture(t),{probe:a}=await backFixture(f,{id:'test.back.a'}),{probe:b}=await backFixture(f,{id:'test.back.b'});
 const portal=f.doc.createElement('button');f.doc.body.append(portal);escape(f,{target:portal});assert.equal(a.calls,0);assert.equal(b.calls,1);
 const container=f.doc.createElement('div');f.doc.body.append(container);const shadow=container.attachShadow({mode:'closed'}),button=f.doc.createElement('button');shadow.append(button);
 let local=0;button.addEventListener('keydown',()=>local++);escape(f,{target:button});assert.equal(b.calls,2);assert.equal(local,0);
});
test('handler switching Surface and returning false cannot close the destination; direct bridge and Orb bypass Back',async t=>{
 const f=await fixture(t),a=await surfaceProbe(f,'test.back.switch'),b=await surfaceProbe(f,'test.back.destination');let calls=0;
 a.api.registerBackHandler(()=>{calls++;void b.open();return false;});await f.launch('test.back.switch');escape(f);await settle();assert.equal(b.panel.hidden,false);
 await a.open();await f.host.__meemeCombinedUI.back();assert.equal(a.panel.hidden,true);assert.equal(calls,1);
 await a.open();await f.click('.ts-orb');assert.equal(a.panel.hidden,true);assert.equal(f.query('#meeme-combined-menu').hidden,true);assert.equal(calls,1);
});
test('source release and Hub disposal invalidate requests and remove the sole input listeners',async t=>{
 const f=await fixture(t),{probe}=await backFixture(f);escape(f);const request=probe.request;
 const counts=()=>['keydown','keyup','blur'].map(type=>f.listeners.filter(x=>x.type===type).length);const before=counts();
 for(let i=0;i<3;i++){await probe.close();await probe.open();}assert.deepEqual(counts(),before);
 f.unmount();await settle();assert.equal(request.isCurrent(),false);assert.equal(probe.api.registerBackHandler(()=>true),false);assert.deepEqual(counts(),[0,0,0]);
});
test('System description consumes repeats, native cancel and Back without window Escape capture',async t=>{
 const f=await fixture(t,undefined,true);nativeDialogStub(f);await f.launch('extension-center');await f.click('.mm-description-open');
 const panel=f.query('[data-hub-panel="extension-center"]');escape(f,{release:false});escape(f,{repeat:true,release:false});await settle();assert.equal(panel.hidden,false);assert.equal(f.query('dialog'),null);
 await f.click('.mm-description-open');const dialog=f.query('dialog');dialog.dispatchEvent(new f.host.Event('cancel',{cancelable:true}));assert.equal(f.query('dialog'),null);assert.equal(panel.hidden,false);
 await f.click('.mm-description-open');panel.querySelector('.mm-return').click();await settle();assert.equal(f.query('dialog'),null);assert.equal(panel.hidden,false);
 panel.querySelector('.mm-return').click();await settle();assert.equal(panel.hidden,true);
});
