import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM, VirtualConsole} from 'jsdom';
import {createRuntimeFixture} from './fixtures/runtime-extension.js';

const read = name => readFile(new URL('../' + name, import.meta.url), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const artifact = JSON.parse(await read('build/咩咩Hub-' + pkg.version + '.json'));
const registryBase = JSON.parse(artifact.content.split('\n').find(line => line.startsWith('const HUB_DEFAULT_REGISTRY_URL=')).slice('const HUB_DEFAULT_REGISTRY_URL='.length, -1));
const settle = () => new Promise(resolve => setImmediate(resolve));

// Execute the complete built Hub in a disposable helper-like iframe. There is
// no character selected, no Polisher artifact, and no real network access.
async function fixture(t, releaseFetch = async () => ({ok: true, json: async () => [{tag_name: 'v' + pkg.version, draft: false, prerelease: true}]})) {
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
    Object.assign(scope, {TextDecoder, TextEncoder});
    scope.fetch = (url, init) => {
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
  return {host, doc, query, click, launch, listeners, subscriptions, requests, releaseRequests, unmount, mount};
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
  const developer = settings.querySelector('[data-hub-developer-settings]'), configure = developer.querySelector('button'), configureHandler = configure.onclick;
  assert.equal(developer.open, false);
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
  assert.equal(f.doc.querySelectorAll('[data-hub-developer-settings]').length, 1);
  assert.equal(settings.querySelector('[data-hub-developer-settings]'), developer);
  assert.equal(configure.onclick, configureHandler);
  assert.equal(f.listeners.length, listenerCount);
});

test('script removal cleans up new panels and handlers, and reload creates one fresh instance', async t => {
  const f = await fixture(t);
  const listenerCount = f.listeners.length;
  await f.launch('settings'); await f.click('[data-hub-action="check-updates"]');
  const oldButton = f.query('[data-hub-action="check-updates"]');
  const oldConfigure = f.query('[data-action="registry:configure"]');
  f.unmount(); await settle();
  assert.equal(oldButton.onclick, null);
  assert.equal(oldConfigure.onclick, null);
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
