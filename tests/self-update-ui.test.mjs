import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto, createHash} from 'node:crypto';
import {JSDOM, VirtualConsole} from 'jsdom';

const read = name => readFile(new URL('../' + name, import.meta.url), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const artifact = JSON.parse(process.env.MIEMIE_TEST_ARTIFACT ? await readFile(process.env.MIEMIE_TEST_ARTIFACT, 'utf8') : await read('build/咩咩Hub-' + pkg.version + '.json'));
const currentVersion = JSON.parse(artifact.content.split('\n')[0].slice('// MieMie-Hub-Build: '.length)).version;
const targetArtifact = process.env.MIEMIE_TEST_UPDATE_TARGET ? JSON.parse(await readFile(process.env.MIEMIE_TEST_UPDATE_TARGET, 'utf8')) : null;
const versionParts = currentVersion.split('.').map(Number);
const nextVersion = targetArtifact ? JSON.parse(targetArtifact.content.split('\n')[0].slice('// MieMie-Hub-Build: '.length)).version : versionParts.slice(0, 2).join('.') + '.' + (versionParts[2] + 1);
const registryBase = JSON.parse(artifact.content.split('\n').find(x => x.startsWith('const HUB_DEFAULT_REGISTRY_URL=')).slice('const HUB_DEFAULT_REGISTRY_URL='.length, -1));
const repo = 'https://api.github.com/repos/SheepSheepLab/MieMie-Hub';
const clone = value => structuredClone(value);
const encode = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const settle = () => new Promise(resolve => setImmediate(resolve));
async function until(check, message) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) assert.fail(message);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
function response(value, url) {
  const result = new Response(value);
  Object.defineProperty(result, 'url', {value: url});
  return result;
}
function updateFixture() {
  const identity = JSON.parse(artifact.content.split('\n')[0].slice('// MieMie-Hub-Build: '.length));
  identity.version = nextVersion;
  const content = artifact.content.replace(/^\/\/ MieMie-Hub-Build: [^\n]+/, '// MieMie-Hub-Build: ' + JSON.stringify(identity))
    .replace('const HUB_VERSION=' + JSON.stringify(currentVersion) + ';', 'const HUB_VERSION=' + JSON.stringify(nextVersion) + ';');
  const script = targetArtifact || {...clone(artifact), name: '咩咩Hub ' + nextVersion, content};
  const bytes = encode(script);
  const metadata = {schemaVersion: 1, productId: 'miemie.hub', format: 'tavern-helper-script', scriptId: artifact.id,
    version: nextVersion, tag: 'v' + nextVersion,
    asset: {name: 'MieMie-Hub-' + nextVersion + '.json', size: bytes.byteLength, sha256: hash(bytes)},
    contentSha256: hash(encode(script.content))};
  const metadataBytes = encode(metadata);
  const asset = (id, name, bytes) => ({id, name, size: bytes.byteLength, state: 'uploaded', digest: 'sha256:' + hash(bytes),
    url: repo + '/releases/assets/' + id,
    browser_download_url: 'https://github.com/SheepSheepLab/MieMie-Hub/releases/download/v' + nextVersion + '/' + name});
  const release = {id: 901, tag_name: 'v' + nextVersion, draft: false, prerelease: true, assets: [
    asset(902, metadata.asset.name, bytes), asset(903, 'MieMie-Hub-update.json', metadataBytes),
  ]};
  return {script, bytes, metadataBytes, release};
}

// This runs the complete built artifact through real UI handlers in disposable
// helper-like iframes. All network, host writes and downloads are local doubles.
async function fixture(t, mode = 'success') {
  const update = updateFixture(), errors = [], calls = [], blocked = [], downloads = [], listeners = [];
  const subscriptions = new Set(), objects = new Map();
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  console.on('error', (...args) => errors.push(args.map(String).join(' ')));
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://hub-update-test.invalid/', runScripts: 'outside-only', virtualConsole: console,
  });
  const host = dom.window, doc = host.document;
  let frame, writes = 0, reloads = 0, savedReads = 0, reloadTimer, initialListenerCount;
  let oldCheckButton, oldInstallButton, backupNoteAtWrite, cleanupListenerCount, cleanupSubscriptionCount;
  const actualId = 'user-installed-hub-uuid';
  const oldScript = {...clone(artifact), id: actualId, name: '我的 Hub（已手工改名） 0.5.1', info: '用户说明保持不变',
    data: {privateExampleSetting: {keep: [true, null, 'test-only']}},
    button: {enabled: true, buttons: [{name: '自定义按钮', visible: false}]}, export_with: {data: false, button: true}};
  const other = {...clone(artifact), id: 'other-extension', name: '其他脚本', content: 'void 0;', data: {other: true}};
  let trees = [{type: 'folder', enabled: true, name: '工具文件夹', id: 'folder', icon: 'fa-folder', color: '#123456',
    scripts: [other, oldScript]}];
  const initialTrees = clone(trees);
  let diskTrees = clone(trees);
  host.localStorage.setItem('meeme_timeline_dock_v1', JSON.stringify({side: 'right', ratio: 0.4}));
  host.localStorage.setItem('meeme_translation_key_v1', 'test-only-not-a-real-key');
  host.localStorage.setItem('other-extension-storage', 'test-only-preserve');
  host.SillyTavern = {getContext: () => ({characterId: null, characters: [], chat: [],
    getRequestHeaders: () => ({'Content-Type': 'application/json', 'X-CSRF-Token': 'test-only'}),
    eventTypes: Object.fromEntries(['GENERATION_STARTED', 'GENERATION_ENDED', 'MESSAGE_RECEIVED', 'GENERATION_STOPPED', 'CHAT_CHANGED'].map(name => [name, name])),
  })};
  host.visualViewport = Object.assign(new host.EventTarget(), {width: 1024, height: 768, offsetLeft: 0, offsetTop: 0});
  host.Blob = Blob;
  host.URL.createObjectURL = blob => {const url = 'blob:https://hub-update-test.invalid/' + objects.size; objects.set(url, blob); return url;};
  host.URL.revokeObjectURL = url => objects.delete(url);
  host.HTMLAnchorElement.prototype.click = function() {downloads.push({url: this.href, name: this.download, blob: objects.get(this.href)});};
  function blockNetwork(scope) {
    const block = kind => {blocked.push(kind); throw Error('Unexpected real network: ' + kind);};
    scope.fetch = async () => block('fetch');
    scope.XMLHttpRequest.prototype.send = () => block('XMLHttpRequest');
    scope.navigator.sendBeacon = () => block('sendBeacon');
    scope.WebSocket = class {constructor() {block('WebSocket');}};
    scope.EventSource = class {constructor() {block('EventSource');}};
  }
  blockNetwork(host);
  const trackTypes = new Set(['click', 'keydown', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'resize', 'scroll']);
  const prototype = host.EventTarget.prototype, add = prototype.addEventListener, remove = prototype.removeEventListener;
  const capture = options => typeof options === 'boolean' ? options : !!options?.capture;
  prototype.addEventListener = function(type, fn, options) {
    if (trackTypes.has(type) && !listeners.some(l => l.target === this && l.type === type && l.fn === fn && l.capture === capture(options))) {
      listeners.push({target: this, type, fn, capture: capture(options)});
    }
    return add.call(this, type, fn, options);
  };
  prototype.removeEventListener = function(type, fn, options) {
    const index = listeners.findIndex(l => l.target === this && l.type === type && l.fn === fn && l.capture === capture(options));
    if (index >= 0) listeners.splice(index, 1);
    return remove.call(this, type, fn, options);
  };
  function unmount() {
    if (!frame) return;
    frame.contentWindow.dispatchEvent(new frame.contentWindow.Event('pagehide'));
    frame.remove(); frame = null;
  }
  async function fetchMock(url, init) {
    calls.push({url, init});
    if (url === repo + '/releases?per_page=100&page=1') return response(encode([update.release]), url);
    if (url === repo + '/releases/901') return response(encode(update.release), url);
    if (url === repo + '/releases/assets/903') {
      if (mode === 'cors') throw TypeError('Failed to fetch');
      return response(update.metadataBytes, url);
    }
    if (url === repo + '/releases/assets/902') return response(update.bytes, url);
    if (url === host.location.origin + '/api/settings/get') {
      savedReads++;
      const savedTrees = savedReads === 1 ? initialTrees : diskTrees;
      const settings = {extension_settings: {tavern_helper: {script: {scripts: savedTrees}}}};
      return response(encode({settings: JSON.stringify(settings)}), url);
    }
    if (mode === 'cors' && registryBase && url === registryBase + '/api/hub/releases/asset') {
      assert.equal(init.credentials, 'omit'); assert.equal(init.headers.Authorization, undefined);
      throw TypeError('Fixture relay offline');
    }
    blocked.push(url); throw Error('Unexpected request');
  }
  async function mount(content) {
    frame = doc.createElement('iframe'); doc.body.appendChild(frame);
    const scope = frame.contentWindow;
    blockNetwork(scope); scope.fetch = fetchMock;
    Object.defineProperty(scope, 'crypto', {value: webcrypto});
    Object.assign(scope, {TextEncoder, TextDecoder, Response, Headers, Request, ReadableStream, structuredClone});
    scope.getScriptId = () => actualId;
    scope.getScriptTrees = options => {assert.equal(options.type, 'global'); return mode === 'nonglobal' ? [other] : clone(trees);};
    scope.updateScriptTreesWith = (updater, options) => {
      assert.equal(options.type, 'global');
      const oldContent = trees[0].scripts[1].content;
      const latest = clone(trees), result = updater(latest);
      assert.equal(typeof result.then, 'undefined'); trees = result; writes++; diskTrees = clone(result);
      if (oldContent === trees[0].scripts[1].content) return clone(trees); // Name-only save does not restart Helper's iframe.
      backupNoteAtWrite = doc.querySelector('[data-hub-backup-note]').textContent;
      oldCheckButton = doc.querySelector('[data-hub-action="check-updates"]');
      oldInstallButton = doc.querySelector('[data-hub-action="update"]');
      reloadTimer = setTimeout(async () => {
        try {
          unmount(); await settle();
          cleanupListenerCount = listeners.length; cleanupSubscriptionCount = subscriptions.size;
          assert.equal(doc.querySelectorAll('[data-hub-panel], #meeme-combined-menu, #miemie-hub-shell, #miemie-timeline-extension, #timeline-switcher-v1').length, 0);
          reloads++; await mount(trees[0].scripts[1].content);
        } catch (error) {errors.push(error.stack);}
      }, 0);
      return clone(trees);
    };
    scope.getCharWorldbookNames = () => ({primary: '', additional: []}); scope.getVariables = () => ({});
    scope.eventOn = (type, fn) => {const subscription = {type, fn}; subscriptions.add(subscription); return {stop() {subscriptions.delete(subscription);}};};
    scope.eval(content);
    await host.__MieMieHub.ready; await settle();
  }
  t.after(() => {
    clearTimeout(reloadTimer); unmount(); dom.window.close();
    assert.deepEqual(errors, [], 'uncaught UI errors'); assert.deepEqual(blocked, [], 'unexpected real network activity');
  });
  await mount(artifact.content); initialListenerCount = listeners.length;
  const query = selector => doc.querySelector(selector);
  async function openSettings() {
    await host.__MieMieHub.open(); query('[data-hub-app="settings"]').click(); await settle();
  }
  async function discover() {
    await openSettings(); query('[data-hub-action="check-updates"]').click();
    await until(() => query('[data-hub-update-status]').dataset.hubUpdateStatus === 'available', 'version check did not find target');
  }
  return {host, doc, query, openSettings, discover, calls, downloads, listeners, subscriptions, update,
    async refreshFromDisk() {unmount(); await settle(); trees = JSON.parse(JSON.stringify(diskTrees)); await mount(trees[0].scripts[1].content);},
    initialTrees, readTrees: () => clone(trees), writes: () => writes, reloads: () => reloads, savedReads: () => savedReads,
    oldButtons: () => [oldCheckButton, oldInstallButton], backupNote: () => backupNoteAtWrite,
    initialListenerCount, cleanupCounts: () => [cleanupListenerCount, cleanupSubscriptionCount]};
}

test('built Hub UI checks, updates its renamed global instance, reloads and confirms exact saved content', async t => {
  const f = await fixture(t);
  const oldPrefs = f.host.localStorage.getItem('miemie_hub_extensions_v1');
  await f.discover();
  assert.equal(f.query('[data-hub-version]').textContent, currentVersion);
  assert.equal(f.query('[data-hub-latest-version]').textContent, nextVersion);
  const updateButton = f.query('[data-hub-action="update"]');
  assert.equal(updateButton.hidden, false); assert.equal(updateButton.disabled, false);
  updateButton.click(); updateButton.click(); updateButton.onclick();
  await until(() => f.query('[data-hub-update-status]')?.dataset.hubUpdateStatus === 'completed', 'new iframe did not confirm persistence');
  await f.openSettings();
  assert.equal(f.host.__MieMieHub.version, nextVersion);
  assert.equal(f.query('[data-hub-version]').textContent, nextVersion);
  assert.equal(f.query('[data-hub-update-status]').textContent, '✓ 更新完成，已确认保存');
  const expectedBundles = f.update.script.content.includes('function createTimelineExtension(') ? ['miemie.timeline'] : [];
  assert.deepEqual(Array.from(f.host.__MieMieHub.extensions.list(), x => x.manifest.id), expectedBundles, 'updated artifact controls bundled sources; stale preferences cannot resurrect removed sources');
  assert.equal(f.doc.querySelectorAll('#miemie-timeline-extension').length, expectedBundles.length);

  assert.equal(f.writes(), artifact.content.includes('function applyScriptUpdate(') ? 1 : 2); assert.equal(f.reloads(), 1); assert.equal(f.savedReads(), 2);
  const expected = clone(f.initialTrees); expected[0].scripts[1].content = f.update.script.content; expected[0].scripts[1].name = '我的 Hub（已手工改名） ' + nextVersion;
  assert.deepEqual(f.readTrees(), expected);
  assert.equal(f.downloads.length, 1); assert.match(f.downloads[0].name, new RegExp('^MieMie-Hub-backup-' + currentVersion.replaceAll('.', '\\.') + '-\\d+\\.json$'));
  assert.deepEqual(JSON.parse(await f.downloads[0].blob.text()), f.initialTrees[0].scripts[1]);
  assert.match(f.backupNote(), /已请求浏览器下载/); assert.match(f.backupNote(), /请确认文件已保存/);
  assert.deepEqual(f.cleanupCounts(), [0, 0]);
  if (!targetArtifact) assert.equal(f.listeners.length, f.initialListenerCount);
  for (const button of f.oldButtons()) assert.equal(button.onclick, null);
  assert.equal(f.doc.querySelectorAll('[data-hub-panel="settings"]').length, 1);
  assert.equal(f.doc.querySelectorAll('[data-hub-action="update"]').length, 1);
  assert.equal(f.host.sessionStorage.getItem('miemie_hub_update_pending_v1'), null);
  const newPrefs = JSON.parse(f.host.localStorage.getItem('miemie_hub_extensions_v1'));
  for (const [id, pref] of Object.entries(JSON.parse(oldPrefs)?.extensions || {})) assert.deepEqual(newPrefs?.extensions?.[id], pref);
  if (!targetArtifact) assert.equal(f.host.localStorage.getItem('miemie_hub_extensions_v1'), oldPrefs);
  assert.equal(f.host.localStorage.getItem('meeme_translation_key_v1'), 'test-only-not-a-real-key');
  assert.equal(f.host.localStorage.getItem('other-extension-storage'), 'test-only-preserve');
  await f.refreshFromDisk(); await f.openSettings();
  assert.deepEqual(f.readTrees(), expected, 'Helper reload must restore saved name, code, same ID and user fields');
  assert.equal(f.host.__MieMieHub.version, nextVersion);
  assert.equal(f.doc.querySelectorAll('#miemie-hub-shell').length, 1);
  const publicCalls = f.calls.filter(c => c.url.startsWith(repo));
  assert.equal(publicCalls.length, 5);
  for (const {init} of publicCalls) {
    assert.equal(init.credentials, 'omit'); assert.equal(init.headers['X-CSRF-Token'], undefined); assert.equal(init.body, undefined);
  }
  for (const {init} of f.calls.filter(c => c.url.endsWith('/api/settings/get'))) {
    assert.equal(init.credentials, 'same-origin'); assert.equal(init.body, '{}'); assert.equal(init.headers['X-CSRF-Token'], 'test-only');
  }
});

test('built Hub UI reports CORS failure without backup, write or iframe reload', async t => {
  const f = await fixture(t, 'cors'); await f.discover();
  f.query('[data-hub-action="update"]').click();
  await until(() => f.query('[data-hub-update-status]').dataset.hubUpdateStatus === 'failed', 'CORS failure not displayed');
  assert.equal(f.query('[data-hub-update-status]').textContent, '更新失败');
  assert.match(f.query('[data-hub-update-error]').textContent, registryBase ? /安全下载服务无法连接/ : /CORS/);
  assert.equal(f.query('[data-hub-action="update"]').disabled, false);
  assert.equal(f.writes(), 0); assert.equal(f.reloads(), 0); assert.equal(f.downloads.length, 0);
  assert.deepEqual(f.readTrees(), f.initialTrees);
  assert.equal(f.host.__MieMieHub.version, currentVersion);
});

test('built Hub UI rejects a non-global instance before any update download', async t => {
  const f = await fixture(t, 'nonglobal'); await f.discover();
  f.query('[data-hub-action="update"]').click();
  await until(() => f.query('[data-hub-update-status]').dataset.hubUpdateStatus === 'failed', 'scope refusal not displayed');
  assert.match(f.query('[data-hub-update-error]').textContent, /仅支持全局脚本/);
  assert.equal(f.calls.length, 1, 'only the explicitly requested version check is allowed');
  assert.equal(f.writes(), 0); assert.equal(f.downloads.length, 0); assert.deepEqual(f.readTrees(), f.initialTrees);
});
