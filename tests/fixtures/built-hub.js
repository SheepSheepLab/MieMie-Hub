import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM, VirtualConsole} from 'jsdom';

const read = name => readFile(new URL('../../' + name, import.meta.url), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const artifact = JSON.parse(await read('build/咩咩Hub-' + pkg.version + '.json'));
const registryBase = JSON.parse(artifact.content.split('\n').find(line => line.startsWith('const HUB_DEFAULT_REGISTRY_URL=')).slice('const HUB_DEFAULT_REGISTRY_URL='.length, -1));
const settle = () => new Promise(resolve => setImmediate(resolve));

// Execute the complete built Hub in a disposable helper-like iframe. There is
// no character selected, no Polisher artifact, and no real network access.
export async function fixture(t, releaseFetch = async () => ({ok: true, json: async () => [{tag_name: 'v' + pkg.version, draft: false, prerelease: true}]}), pendingInstall = false) {
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

export function generic(f,{id='fixture.native',mountFailure=false}={}){
 const {host,doc}=f,counts={factories:0,active:0,peak:0,hooks:0,hookCalls:0,mount:0,release:0},manifest={id,name:'Generic Fixture',version:'1.0.0',schemaVersion:1,apiVersion:2,hubApi:{min:2,max:2},contributes:{launcher:{title:'Generic'}}};
 let api,panel,lease,surfaceLease,portal,shadow,dialog,broken=false;
 const factory=a=>{api=a;counts.factories++;return {
  activate(){
   counts.active++;counts.hooks++;const hook=()=>counts.hookCalls++;host.addEventListener('fixture:business:'+id,hook);counts.peak=Math.max(counts.peak,counts.active);
   panel=doc.createElement('section');panel.dataset.fixture=id;panel.tabIndex=-1;panel.hidden=true;panel.innerHTML='<input value="DRAFT"><span hidden>Original state</span>';panel.style.width='321px';doc.body.append(panel);
   portal=doc.createElement('button');portal.dataset.portal=id;doc.body.append(portal);
   shadow=doc.createElement('div');doc.body.append(shadow);const root=shadow.attachShadow({mode:'open'});root.innerHTML='<button>Shadow input</button>';
   dialog=doc.createElement('dialog');dialog.dataset.fixtureDialog=id;dialog.innerHTML='<input>';doc.body.append(dialog);
   a.attachPanel(panel);
   a.registerNativeWindow({
    mount({open,signal}){counts.mount++;if(mountFailure)throw Error('fixture mount failure');const orb=doc.createElement('button');orb.dataset.native=id;orb.onclick=open;doc.body.append(orb);return {getOrigin:()=>orb,dispose(){assert.equal(signal.aborted,true);orb.onclick=null;orb.remove();}};},
    open(l){lease=l;panel.hidden=!panel.hidden;panel.inert=false;panel.focus();},
    release(l){counts.release++;assert.equal(l.isCurrent(),false);assert.equal(l.signal.aborted,true);if(broken)throw Error('fixture release failure');},
    ownsEvent(e){const path=e.composedPath();return path.includes(portal)||path.includes(shadow)||path.includes(dialog);},
   });
   a.onCleanup(()=>{host.removeEventListener('fixture:business:'+id,hook);panel.remove();portal.remove();shadow.remove();dialog.remove();counts.active--;counts.hooks--;});
  },
  open(l){surfaceLease=l;return a.showPanel(l);},
 };};
 return {manifest,factory,counts,api:()=>api,panel:()=>panel,lease:()=>lease,surfaceLease:()=>surfaceLease,portal:()=>portal,shadow:()=>shadow,dialog:()=>dialog,broken:v=>broken=v,
  native:()=>doc.querySelector('[data-native="'+id+'"]').onclick(),
  async provide(){const s=host.__MieMieHub.extensions.provide(manifest,factory);assert.equal(s.ok,true);assert.equal((await s.ready).ok,true);await settle();return s;},
  async preference(value){await f.launch('extension-center');await f.click('[data-center-tab="installed"]');const input=doc.querySelector('[data-shortcut="'+id+'"]');assert.ok(input);input.checked=value;input.dispatchEvent(new host.Event('change'));await settle();return doc.querySelector('[data-shortcut="'+id+'"]');},
 };
}
