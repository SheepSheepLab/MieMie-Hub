import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM, VirtualConsole} from 'jsdom';

const read = name => readFile(new URL('../' + name, import.meta.url), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const artifact = JSON.parse(await readFile(process.env.HUB_ARTIFACT||new URL('../build/phase1/咩咩Hub-'+pkg.version+'.json',import.meta.url),'utf8'));
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
  const timeouts=new Set(),intervals=new Set(),observers=new Set();
  const st=host.setTimeout.bind(host),ct=host.clearTimeout.bind(host),si=host.setInterval.bind(host),ci=host.clearInterval.bind(host);
  host.setTimeout=(fn,ms,...args)=>{let id=st(()=>{timeouts.delete(id);fn(...args);},ms);timeouts.add(id);return id;};
  host.clearTimeout=id=>{timeouts.delete(id);ct(id);};
  host.setInterval=(fn,ms,...args)=>{const id=si(fn,ms,...args);intervals.add(id);return id;};
  host.clearInterval=id=>{intervals.delete(id);ci(id);};
  for(const kind of ['MutationObserver','ResizeObserver'])if(host[kind]){const Original=host[kind];host[kind]=class extends Original{observe(...args){observers.add(this);return super.observe(...args);}disconnect(){observers.delete(this);return super.disconnect();}};}
  const resources=()=>({listeners:listeners.length,timeouts:timeouts.size,intervals:intervals.size,observers:observers.size});
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
  return {resources,host, doc, query, click, launch, listeners, subscriptions, requests, releaseRequests, unmount, mount, getInstallSignal:()=>installSignal};
}

function generic(f,{id='fixture.native',mountFailure=false}={}){
 const {host,doc}=f,counts={factories:0,active:0,peak:0,hooks:0,hookCalls:0,mount:0,release:0},manifest={id,name:'Generic Fixture',version:'1.0.0',schemaVersion:1,apiVersion:host.__MieMieHub.apiVersion,hubApi:{min:host.__MieMieHub.apiVersion,max:host.__MieMieHub.apiVersion},contributes:{launcher:{title:'Generic'}}};
 let api,panel,lease,surfaceLease,portal,shadow,dialog,broken=false;
 const factory=a=>{api=a;counts.factories++;return {
  activate(){
   counts.active++;counts.hooks++;const hook=()=>counts.hookCalls++;host.addEventListener('fixture:business:'+id,hook);counts.peak=Math.max(counts.peak,counts.active);
   panel=doc.createElement('section');panel.dataset.fixture=id;panel.tabIndex=-1;panel.hidden=true;panel.innerHTML='<input value="DRAFT"><span hidden>Original state</span>';panel.style.width='321px';doc.body.append(panel);
   portal=doc.createElement('button');portal.dataset.portal=id;doc.body.append(portal);
   shadow=doc.createElement('div');doc.body.append(shadow);const root=shadow.attachShadow({mode:'open'});root.innerHTML='<button>Shadow input</button>';
   dialog=doc.createElement('dialog');dialog.dataset.fixtureDialog=id;dialog.innerHTML='<input>';doc.body.append(dialog);
   a.attachPanel(panel);
   const provider={
    mount({open,signal}){counts.mount++;if(mountFailure)throw Error('fixture mount failure');const orb=doc.createElement('button');orb.dataset.native=id;orb.onclick=open;doc.body.append(orb);return {getOrigin:()=>orb,dispose(){orb.onclick=null;orb.remove();}};},
    open(l){lease=l;panel.hidden=!panel.hidden;panel.inert=false;panel.focus();},
    release(l){counts.release++;if(l){assert.equal(l.isCurrent(),false);assert.equal(l.signal.aborted,true);}if(broken)throw Error('fixture release failure');},
    ownsEvent(e){const path=e.composedPath();return path.includes(portal)||path.includes(shadow)||path.includes(dialog);},
   };
   if(a.registerShortcutLauncher)a.registerShortcutLauncher({mount:({open})=>provider.mount({open,signal:a.signal})});
   a.registerNativeWindow(provider);
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


test('same-load resources: 0, 1 and 4 generic Native extensions then dispose',async t=>{
 const f=await fixture(t),rows=[{load:0,...f.resources()}],extensions=[];
 for(let i=0;i<4;i++){
  const g=generic(f,{id:'fixture.native'+i});extensions.push(g);await g.provide();await g.preference(true);await g.native();
  await f.host.__meemeCombinedUI.toggle();await settle();
  if(i===0||i===3)rows.push({load:i+1,...f.resources(),factories:extensions.reduce((n,g)=>n+g.counts.factories,0),hooks:extensions.reduce((n,g)=>n+g.counts.hooks,0)});
 }
 for(let i=0;i<8;i++){await f.host.__MieMieHub.extensions.open(extensions[0].manifest.id);await extensions[0].native();}
 await f.host.__meemeCombinedUI.toggle();await settle();rows.push({load:'after switches',...f.resources()});
 const hub=f.host.__MieMieHub;f.unmount();await hub.whenDisposed;rows.push({load:'disposed',...f.resources(),hooks:extensions.reduce((n,g)=>n+g.counts.hooks,0)});
 console.log('RESOURCE_METRICS',JSON.stringify({api:hub.apiVersion,rows}));
 assert.equal(f.listeners.length,0);assert.equal(extensions.reduce((n,g)=>n+g.counts.hooks,0),0);
 assert.deepEqual(f.resources(),{listeners:0,timeouts:0,intervals:0,observers:0});
});
