import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM, VirtualConsole} from 'jsdom';

const read = name => readFile(new URL('../' + name, import.meta.url), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const artifact = JSON.parse(await read('build/咩咩Hub-' + pkg.version + '.json'));
const settle = () => new Promise(resolve => setImmediate(resolve));

// Execute the complete built Hub in a disposable helper-like iframe. There is
// no character selected, no Polisher artifact, and no permitted network access.
async function fixture(t) {
  const errors = [], requests = [], listeners = [], subscriptions = new Set();
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
  const types = new Set(['click', 'keydown', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'resize', 'scroll']);
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
  let frame;
  function unmount() {
    if (!frame) return;
    frame.contentWindow.dispatchEvent(new frame.contentWindow.Event('pagehide'));
    frame.remove(); frame = null;
  }
  async function mount() {
    frame = doc.createElement('iframe'); doc.body.appendChild(frame);
    const scope = frame.contentWindow;
    blockNetwork(scope);
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
  return {host, doc, query, click, launch, listeners, subscriptions, requests, unmount, mount};
}

test('Core system launchers coexist with existing entries without registering Extensions', async t => {
  const f = await fixture(t);
  await f.click('.ts-orb');
  assert.equal(f.query('#meeme-combined-menu').dataset.open, 'true');
  for (const [id, label] of [['timeline', '时间线切换器'], ['extension-center', '扩展中心'], ['settings', '设置'], ['extensions', '扩展管理'], ['miemie.hello', 'Hello Mie']]) {
    assert.equal(f.doc.querySelectorAll('[data-hub-app="' + id + '"]').length, 1);
    assert.equal(f.query('[data-hub-app="' + id + '"]').getAttribute('aria-label'), label);
  }
  assert.deepEqual(Array.from(f.host.__MieMieHub.extensions.list(), item => item.manifest.id), ['miemie.hello']);
  await f.click('[data-hub-app="extension-center"]');
  const panel = f.query('[data-hub-panel="extension-center"]');
  assert.equal(panel.hidden, false); assert.equal(panel.inert, false);
  assert.match(panel.textContent, /扩展中心正在准备中/);
  assert.match(panel.textContent, /以后可以在这里发现、安装和更新扩展。/);
  await f.launch('extensions');
  assert.equal(f.doc.querySelectorAll('[data-extension-id]').length, 1);
});

test('settings uses the actual package and built Core version, with an honest initial status', async t => {
  const f = await fixture(t);
  await f.launch('settings');
  assert.equal(f.query('[data-hub-panel="settings"]').hidden, false);
  assert.equal(f.query('[data-hub-version]').textContent, pkg.version);
  assert.equal(f.query('[data-hub-version]').textContent, f.host.__MieMieHub.version);
  assert.equal(artifact.name, '咩咩Hub ' + pkg.version);
  assert.equal(f.query('[data-hub-update-status]').dataset.hubUpdateStatus, 'unchecked');
  assert.equal(f.query('[data-hub-update-status]').textContent, '尚未检查');
});

test('checking updates only changes local UI state and never requests the network', async t => {
  const f = await fixture(t);
  await f.launch('settings');
  for (let i = 0; i < 3; i++) await f.click('[data-hub-action="check-updates"]');
  const status = f.query('[data-hub-update-status]');
  assert.equal(status.dataset.hubUpdateStatus, 'unavailable');
  assert.equal(status.textContent, '在线更新服务尚未接入');
  assert.equal(status.getAttribute('role'), 'status');
  await f.click('[data-hub-panel="settings"] .mm-return');
  await f.launch('settings');
  assert.equal(f.query('[data-hub-update-status]'), status);
  assert.equal(status.textContent, '在线更新服务尚未接入');
  assert.doesNotMatch(f.query('[data-hub-panel="settings"]').textContent, /已是最新|发现新版本|最新版本/);
  assert.deepEqual(f.requests, []);
});

test('timeline and optional Extension launchers still work alongside Core panels', async t => {
  const f = await fixture(t);
  await f.launch('timeline');
  assert.equal(f.query('.ts-panel').hidden, false);
  assert.equal(f.query('[data-hub-panel="settings"]').hidden, true);
  await f.launch('miemie.hello');
  assert.equal(f.query('[data-hub-panel="message"]').hidden, false);
  assert.match(f.query('[data-hub-panel="message"]').textContent, /咩咩Hub扩展系统运行正常/);
  await f.host.__MieMieHub.extensions.disable('miemie.hello');
  assert.equal(f.query('[data-hub-app="miemie.hello"]'), null);
  await f.launch('extension-center');
  assert.equal(f.query('[data-hub-panel="extension-center"]').hidden, false);
  await f.host.__MieMieHub.extensions.enable('miemie.hello');
  await f.launch('miemie.hello');
  assert.equal(f.query('[data-hub-panel="message"]').hidden, false);
});

test('repeated panel switching, return, Escape and orb close reuse DOM and listeners', async t => {
  const f = await fixture(t);
  const center = f.query('[data-hub-panel="extension-center"]'), settings = f.query('[data-hub-panel="settings"]');
  const checkButton = f.query('[data-hub-action="check-updates"]'), checkHandler = checkButton.onclick;
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
  assert.equal(f.listeners.length, listenerCount);
});

test('script removal cleans up new panels and handlers, and reload creates one fresh instance', async t => {
  const f = await fixture(t);
  const listenerCount = f.listeners.length;
  await f.launch('settings'); await f.click('[data-hub-action="check-updates"]');
  const oldButton = f.query('[data-hub-action="check-updates"]');
  f.unmount(); await settle();
  assert.equal(oldButton.onclick, null);
  assert.equal(f.doc.querySelectorAll('[data-hub-panel], [data-hub-app], #timeline-switcher-v1, #meeme-combined-menu').length, 0);
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
