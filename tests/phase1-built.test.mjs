import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM, VirtualConsole} from 'jsdom';

const read = name => readFile(new URL('../' + name, import.meta.url), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const artifact = JSON.parse(await read('build/phase1/咩咩Hub-' + pkg.version + '.json'));
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

function generic(f,{id='fixture.native',mountFailure=false}={}){
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

test('built v2: Source/Native leases, OFF, disable, source replace and explicit uninstall stay distinct',async t=>{
 const f=await fixture(t),g=generic(f),hub=f.host.__MieMieHub;assert.equal(hub.apiVersion,2);assert.equal(hub.extensions.list().length,0);
 let source=await g.provide();assert.equal(g.counts.factories,1);assert.equal(f.query('[data-native]'),null);
 await g.preference(true);await g.native();const native=g.lease(),session=g.api().signal;g.panel().querySelector('input').value='UNSAVED';
 await g.preference(false);assert.equal(native.isCurrent(),false);assert.equal(session.aborted,false);assert.equal(g.counts.factories,1);assert.equal(hub.extensions.get(g.manifest.id).launcherAvailable,true);
 await f.launch(g.manifest.id);assert.equal(g.panel().hidden,false);assert.equal(g.panel().dataset.surfaceState,'open');assert.equal(g.panel().querySelector('input').value,'UNSAVED');
 await g.preference(true);await g.native();const previous=g.lease();await hub.extensions.disable(g.manifest.id);assert.equal(previous.isCurrent(),false);assert.equal(g.counts.active,0);
 await hub.extensions.enable(g.manifest.id);assert.equal(g.counts.active,1);assert.equal(f.doc.querySelectorAll('[data-native]').length,1);
 await source.release();assert.equal(g.counts.active,0);assert.equal(hub.extensions.get(g.manifest.id),null);assert.equal(JSON.parse(f.host.localStorage.getItem('miemie_hub_shortcuts_v1'))[g.manifest.id],true);
 source=await g.provide();assert.equal(g.counts.peak,1);await hub.extensions.uninstall(g.manifest.id);assert.equal(g.counts.active,0);assert.equal(Object.hasOwn(JSON.parse(f.host.localStorage.getItem('miemie_hub_shortcuts_v1')),g.manifest.id),false);await source.release();
});
test('built v2: reload awaits slow cleanup, rejects stale APIs and leaves no tracked listeners/hooks',async t=>{
 const f=await fixture(t),g=generic(f);await g.provide();await g.preference(true);await g.native();const hub=f.host.__MieMieHub,old=g.api(),lease=g.lease();let finish;
 old.onCleanup(()=>new Promise(r=>finish=r));f.unmount();assert.equal(lease.isCurrent(),false);assert.equal(old.signal.aborted,true);assert.equal(await old.showPanel(),false);
 let done=false;hub.whenDisposed.then(()=>done=true);await settle();assert.equal(done,false);finish();await hub.whenDisposed;assert.equal(g.counts.active,0);assert.equal(g.counts.hooks,0);assert.equal(f.listeners.length,0);
 await f.mount();assert.notEqual(f.host.__MieMieHub,hub);await g.provide();assert.equal(g.counts.peak,1);assert.equal(f.doc.querySelectorAll('[data-native]').length,1);
});
test('built v2: Native DOM/focus/input survive Hub layout, foreground and representative Portal/Shadow/dialog events',async t=>{
 const f=await fixture(t),g=generic(f);await g.provide();await g.preference(true);await g.native();
 await f.host.__MieMieHub.open();const panel=g.panel();panel.style.width='412px';panel.querySelector('input').value='KEEP';const before=panel.outerHTML;
 f.host.visualViewport.width=901;f.host.visualViewport.dispatchEvent(new f.host.Event('resize'));await settle();assert.equal(panel.outerHTML,before);
 for(const node of [panel.querySelector('input'),g.portal(),g.shadow().shadowRoot.querySelector('button'),g.dialog().querySelector('input')]){
  node.focus();for(const type of ['keydown','keyup']){let seen=0;node.addEventListener(type,()=>seen++,{once:true});const e=new f.host.KeyboardEvent(type,{key:'Escape',bubbles:true,composed:true,cancelable:true});node.dispatchEvent(e);assert.equal(e.defaultPrevented,false);assert.equal(seen,1);}
  assert.equal(f.doc.getElementById('meeme-combined-menu').dataset.open,'true');
 }
 const cancel=new f.host.Event('cancel',{cancelable:true});g.dialog().dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,false);
 assert.equal(panel.outerHTML,before);assert.equal(g.lease().isCurrent(),true);
 await f.host.__meemeCombinedUI.toggle();assert.equal(f.doc.getElementById('meeme-combined-menu').hidden,true);
 const outside=f.doc.createElement('input');f.doc.body.append(outside);const e=new f.host.KeyboardEvent('keydown',{key:'Escape',repeat:true,bubbles:true,cancelable:true});outside.dispatchEvent(e);assert.equal(e.defaultPrevented,false);
});
test('built v2: real Honeycomb close animation cancellation preserves closed intent (Race A)',async t=>{
 const f=await fixture(t),g=generic(f);await g.provide();await g.preference(true);await f.host.__MieMieHub.open();
 const flights=[];f.host.HTMLElement.prototype.animate=function(){let finish;const finished=new Promise(r=>finish=r);const a={finished,cancel(){finish();},finish};flights.push(a);return a;};
 const closing=f.host.__meemeCombinedUI.toggle();await settle();const root=f.query('#meeme-combined-menu');assert.equal(root.dataset.open,'false');assert.equal(root.hidden,false);assert.ok(flights.length>0);
 await g.native();assert.equal(root.hidden,true);assert.equal(root.dataset.open,'false');const before=g.panel().outerHTML;
 for(const a of flights)a.finish();await closing;await settle();assert.equal(root.hidden,true);assert.equal(g.panel().outerHTML,before);assert.equal(g.lease().isCurrent(),true);
});
test('built v2: mount fault remains visibly ON and does not retry during UI refresh',async t=>{
 const f=await fixture(t),g=generic(f,{mountFailure:true});await g.provide();const input=await g.preference(true);
 assert.equal(input.checked,true);assert.equal(g.counts.mount,1);assert.equal(f.query('[data-native]'),null);assert.match(f.doc.documentElement.textContent,/fixture mount failure/);
 await f.launch('settings');await f.launch('extension-center');await f.click('[data-center-tab="installed"]');assert.equal(f.query('[data-shortcut]').checked,true);assert.equal(g.counts.mount,1);
 await f.launch(g.manifest.id);assert.equal(g.panel().hidden,false);assert.equal(g.counts.factories,1);
});
test('built v2: failed release does not steal root; disable still finishes cleanup',async t=>{
 const f=await fixture(t),g=generic(f);await g.provide();await g.preference(true);await g.native();g.broken(true);const before=g.panel().outerHTML;
 const result=await f.host.__MieMieHub.extensions.open(g.manifest.id);assert.equal(result.ok,false);assert.equal(g.lease().isCurrent(),false);assert.equal(g.panel().outerHTML,before);
 f.host.visualViewport.dispatchEvent(new f.host.Event('resize'));assert.equal(g.panel().outerHTML,before);await f.host.__MieMieHub.extensions.disable(g.manifest.id);assert.equal(g.counts.active,0);assert.equal(f.query('[data-native]'),null);
});
test('built v2: Runtime intent during launcher close cannot orphan old animation before Native takeover',async t=>{
 const f=await fixture(t),g=generic(f);await g.provide();await g.preference(true);await f.host.__MieMieHub.open();
 const flights=[];f.host.HTMLElement.prototype.animate=()=>{let finish;const finished=new Promise(r=>finish=r);const a={finished,cancel(){finish();},finish};flights.push(a);return a;};
 const closing=f.host.__meemeCombinedUI.toggle();await settle();const queued=f.host.__MieMieHub.extensions.open(g.manifest.id);await g.native();
 const root=f.query('#meeme-combined-menu');assert.equal(root.hidden,true);const active=f.doc.activeElement;
 for(const a of flights)a.finish();await Promise.all([closing,queued]);assert.equal(f.doc.activeElement,active);assert.equal(root.hidden,true);assert.equal(g.lease().isCurrent(),true);
});

test('built v2: repeated dual entrances dispatch exactly one business hook per session',async t=>{
 const f=await fixture(t),g=generic(f);await g.provide();await g.preference(true);
 for(let i=0;i<12;i++){await g.native();await f.host.__MieMieHub.extensions.open(g.manifest.id);}
 f.host.dispatchEvent(new f.host.Event('fixture:business:'+g.manifest.id));assert.equal(g.counts.hookCalls,1);assert.equal(g.counts.factories,1);assert.equal(g.counts.active,1);
 await f.host.__MieMieHub.extensions.disable(g.manifest.id);f.host.dispatchEvent(new f.host.Event('fixture:business:'+g.manifest.id));assert.equal(g.counts.hookCalls,1);
 await f.host.__MieMieHub.extensions.enable(g.manifest.id);f.host.dispatchEvent(new f.host.Event('fixture:business:'+g.manifest.id));assert.equal(g.counts.hookCalls,2);assert.equal(g.counts.peak,1);
});
