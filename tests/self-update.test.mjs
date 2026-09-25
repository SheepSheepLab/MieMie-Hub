import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createHubScriptHost} from '../src/hub-script-host.js';
import {HUB_UPDATE_REPOSITORY_API, HUB_UPDATE_PACKAGE_ID, HUB_UPDATE_PENDING_KEY,
  HUB_UPDATE_METADATA_LIMIT, HUB_UPDATE_ASSET_LIMIT, hashHubUpdateBytes,
  validateHubUpdateRelease, validateHubUpdateMetadata, validateHubUpdatePackage,
  createHubSavedScriptReader, createHubSelfUpdater} from '../src/hub-self-update.js';

const encode = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
const clone = value => structuredClone(value);
const buildContent = (version = '0.2.1', extra = {}) => '// MieMie-Hub-Build: ' + JSON.stringify({
  schemaVersion: 1, productId: 'miemie.hub', version, scriptId: HUB_UPDATE_PACKAGE_ID, ...extra,
}) + '\n(() => { /* inert test fixture */ })();';
const installedScript = (extra = {}) => ({type: 'script', enabled: true, name: '用户自定义 Hub 名称', id: 'actual-installed-id',
  content: buildContent(), info: '用户说明', button: {enabled: true, buttons: [{name: '用户按钮', visible: false}]},
  data: {custom: {preserve: ['all', 'values']}, remembered: true}, export_with: {data: false, button: true}, ...extra});
const otherScript = () => installedScript({id: 'other-extension-id', name: '其他扩展', content: 'void 0;', data: {other: true}});
const newPackage = () => installedScript({id: HUB_UPDATE_PACKAGE_ID, name: '咩咩Hub 0.2.2', content: buildContent('0.2.2'), data: {}});
const target = () => ({releaseId: 201, version: '0.2.2', tag: 'v0.2.2'});
const settle = () => new Promise(resolve => setImmediate(resolve));
const hasCode = code => error => error?.code === code;
async function fixture({script = newPackage(), bytes, metadataPatch = {}, releasePatch = {}} = {}) {
  bytes = bytes ?? encode(script);
  const assetHash = await hashHubUpdateBytes(bytes, webcrypto);
  const metadata = {schemaVersion: 1, productId: 'miemie.hub', format: 'tavern-helper-script', scriptId: HUB_UPDATE_PACKAGE_ID,
    version: '0.2.2', tag: 'v0.2.2',
    asset: {name: 'MieMie-Hub-0.2.2.json', size: bytes.byteLength, sha256: assetHash},
    contentSha256: await hashHubUpdateBytes(encode(script.content ?? ''), webcrypto), ...metadataPatch};
  const metadataBytes = encode(metadata);
  const asset = (id, name, bytes, hash) => ({id, name, state: 'uploaded', size: bytes.byteLength, digest: 'sha256:' + hash,
    url: HUB_UPDATE_REPOSITORY_API + '/releases/assets/' + id,
    browser_download_url: 'https://github.com/SheepSheepLab/MieMie-Hub/releases/download/v0.2.2/' + name});
  const release = {id: 201, tag_name: 'v0.2.2', draft: false, prerelease: true, assets: [
    asset(301, metadata.asset.name, bytes, assetHash),
    asset(302, 'MieMie-Hub-update.json', metadataBytes, await hashHubUpdateBytes(metadataBytes, webcrypto)),
  ], ...releasePatch};
  return {script, bytes, metadata, metadataBytes, release};
}
function response(bytes, url, extra = {}) {
  const result = new Response(bytes, {status: 200, ...extra});
  Object.defineProperty(result, 'url', {value: url, configurable: true});
  return result;
}
function memoryStorage() {
  const values = new Map(), writes = [];
  return {values, writes, getItem: key => values.get(key) ?? null,
    setItem(key, value) {writes.push([key, value]); values.set(key, value);}, removeItem: key => values.delete(key)};
}
function system(t, data, options = {}) {
  let trees = clone(options.trees ?? [otherScript(), installedScript()]);
  let releaseReads = 0, writes = 0;
  const calls = [], backups = [], states = [], storage = options.storage ?? memoryStorage();
  const hostOptions = {currentVersion: '0.2.1', getScriptId: () => 'actual-installed-id',
    getScriptTrees: () => clone(trees), updateScriptTreesWith(updater, scope) {
      assert.deepEqual(scope, {type: 'global'});
      const result = updater(clone(trees));
      assert.equal(typeof result?.then, 'undefined');
      trees = result; writes++; return clone(trees);
    }};
  const request = async (url, init) => {
    calls.push({url, init});
    if (options.fetch) return options.fetch(url, init, calls.length);
    if (url === HUB_UPDATE_REPOSITORY_API + '/releases/201') {
      releaseReads++;
      const value = releaseReads > 1 && options.secondRelease ? options.secondRelease(data.release) : data.release;
      return response(encode(value), url);
    }
    if (url === data.release.assets[1].url) return response(data.metadataBytes, url);
    if (url === data.release.assets[0].url) return response(data.bytes, url);
    throw Error('unexpected URL ' + url);
  };
  const updaterOptions = {currentVersion: '0.2.1', host: createHubScriptHost(hostOptions), storage,
    backup: async (script, version) => {backups.push({script: clone(script), version});},
    fetch: request, crypto: webcrypto, metadataTimeoutMs: 200, assetTimeoutMs: 200,
    confirmationTimeoutMs: 100, confirmationIntervalMs: 1, now: () => 1700000000000,
    ...options.updater};
  const updater = createHubSelfUpdater(updaterOptions);
  updater.subscribe(state => states.push(state));
  t.after(() => updater.dispose());
  return {updater, calls, backups, states, storage, readTrees: () => clone(trees), editTrees: fn => fn(trees),
    writes: () => writes, hostFor: version => createHubScriptHost({...hostOptions, currentVersion: version}),
    next(options = {}) {
      const next = createHubSelfUpdater({...updaterOptions, currentVersion: '0.2.2',
        host: createHubScriptHost({...hostOptions, currentVersion: '0.2.2'}), ...options});
      t.after(() => next.dispose()); return next;
    }};
}

test('SHA-256 uses the downloaded raw bytes and requires available WebCrypto', async () => {
  assert.equal(await hashHubUpdateBytes(encode('abc'), webcrypto), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await assert.rejects(hashHubUpdateBytes(encode('abc'), {}), hasCode('crypto'));
});

test('release validator locks release ID, exact tag, unique ASCII assets and official repository URLs', async () => {
  const data = await fixture();
  const locked = validateHubUpdateRelease(data.release, target());
  assert.equal(locked.releaseId, 201); assert.equal(locked.asset.id, 301); assert.equal(locked.metadata.id, 302);
  for (const mutate of [
    r => {r.id++;}, r => {r.tag_name = 'v0.2.3';}, r => {r.draft = true;}, r => {delete r.draft;},
  ]) {
    const release = clone(data.release); mutate(release);
    assert.throws(() => validateHubUpdateRelease(release, target()), hasCode('release'));
  }
  for (const mutate of [
    r => {r.assets.pop();}, r => {r.assets.push(clone(r.assets[0]));}, r => {r.assets[0].name = '咩咩Hub.json';},
    r => {r.assets[0].state = 'new';}, r => {r.assets[0].digest = null;}, r => {r.assets[0].digest = 'sha256:bad';},
    r => {r.assets[0].size = HUB_UPDATE_ASSET_LIMIT + 1;}, r => {r.assets[1].size = HUB_UPDATE_METADATA_LIMIT + 1;},
    r => {r.assets[0].size = 0;}, r => {r.assets[0].id = 1.2;},
    r => {r.assets[0].url = 'https://example.invalid/download';},
    r => {r.assets[0].url = HUB_UPDATE_REPOSITORY_API + '/releases/assets/999';},
    r => {r.assets[0].browser_download_url = r.assets[0].browser_download_url.replace('MieMie-Hub/releases', 'Other/releases');},
  ]) {
    const release = clone(data.release); mutate(release);
    assert.throws(() => validateHubUpdateRelease(release, target()), hasCode('asset'));
  }
  for (const version of ['0.2.2-alpha.1', 'v0.2.2', '01.2.3', ...['\n', '\r', '\u2028', '\u2029'].map(suffix => '0.2.2' + suffix)]) {
    assert.throws(() => validateHubUpdateRelease(data.release, {...target(), version}), hasCode('release'));
  }
});

test('machine metadata is strict and cannot supply arbitrary download destinations', async () => {
  const data = await fixture(), release = validateHubUpdateRelease(data.release, target());
  assert.equal(validateHubUpdateMetadata(data.metadata, release), data.metadata);
  for (const mutate of [
    m => {m.schemaVersion = 2;}, m => {m.productId = 'miemie.polisher';}, m => {m.format = 'module';},
    m => {m.scriptId = 'actual-installed-id';}, m => {m.version = '0.2.3';}, m => {m.tag = '0.2.2';},
    m => {m.asset.name = 'Other.json';}, m => {m.asset.size++;}, m => {m.asset.sha256 = 'a'.repeat(64);},
    m => {m.contentSha256 = 'bad';}, m => {m.url = 'https://example.invalid/';},
    m => {m.asset.url = 'https://example.invalid/';},
  ]) {
    const metadata = clone(data.metadata); mutate(metadata);
    assert.throws(() => validateHubUpdateMetadata(metadata, release), hasCode('metadata'));
  }
});

test('package validator checks raw size/hash, single script shape, product marker and content hash', async () => {
  const data = await fixture();
  assert.deepEqual(await validateHubUpdatePackage(data.bytes, data.metadata, webcrypto), data.script);
  await assert.rejects(validateHubUpdatePackage(encode('tampered'), data.metadata, webcrypto), hasCode('hash'));
  await assert.rejects(validateHubUpdatePackage(data.bytes, {...data.metadata, contentSha256: '0'.repeat(64)}, webcrypto), hasCode('content-hash'));
  const invalidJSON = await fixture({bytes: encode('{invalid')});
  await assert.rejects(validateHubUpdatePackage(invalidJSON.bytes, invalidJSON.metadata, webcrypto), hasCode('json'));
  const invalidUtf8 = await fixture({bytes: new Uint8Array([0xc3, 0x28])});
  await assert.rejects(validateHubUpdatePackage(invalidUtf8.bytes, invalidUtf8.metadata, webcrypto), hasCode('json'));
  for (const mutate of [
    s => {s.type = 'folder';}, s => {s.id = 'wrong-product';}, s => {s.data = [];},
    s => {s.enabled = 'true';}, s => {s.button.buttons = [{name: 'button', visible: 'true'}];}, s => {s.unknown = true;},
  ]) {
    const script = newPackage(); mutate(script); const invalid = await fixture({script});
    await assert.rejects(validateHubUpdatePackage(invalid.bytes, invalid.metadata, webcrypto), hasCode('package'));
  }
  for (const content of [buildContent('0.2.3'), buildContent('0.2.2', {productId: 'miemie.polisher'}), 'void 0;']) {
    const invalid = await fixture({script: newPackage()});
    invalid.script.content = content;
    const repacked = await fixture({script: invalid.script});
    await assert.rejects(validateHubUpdatePackage(repacked.bytes, repacked.metadata, webcrypto), hasCode('identity'));
  }
});

test('full update preserves the latest tree, downloads backup, stores only a small handoff and confirms after reload', async t => {
  const data = await fixture(), sys = system(t, data);
  const before = sys.readTrees();
  const state = await sys.updater.start(target());
  assert.equal(state.status, 'awaiting-reload'); assert.equal(state.backupRequested, true); assert.equal(sys.writes(), 1);
  const expected = clone(before); expected[1].content = data.script.content; expected[1].name += ' 0.2.2';
  assert.deepEqual(sys.readTrees(), expected);
  assert.deepEqual(sys.backups, [{script: before[1], version: '0.2.1'}]);
  assert.deepEqual(sys.calls.map(c => c.url), [HUB_UPDATE_REPOSITORY_API + '/releases/201',
    data.release.assets[1].url, data.release.assets[0].url, HUB_UPDATE_REPOSITORY_API + '/releases/201']);
  const pending = sys.storage.getItem(HUB_UPDATE_PENDING_KEY);
  assert.ok(pending.length < 1024); assert.ok(!pending.includes('inert test fixture')); assert.ok(!pending.includes('remembered'));
  assert.equal(JSON.parse(pending).id, 'actual-installed-id');
  assert.deepEqual(sys.states.map(s => s.status), ['idle', 'preparing', 'downloading', 'verifying', 'verifying', 'installing', 'awaiting-reload']);
  for (const {init} of sys.calls) {
    assert.equal(init.credentials, 'omit'); assert.equal(init.mode, 'cors'); assert.equal(init.referrerPolicy, 'no-referrer');
    assert.deepEqual(Object.keys(init.headers), ['Accept']); assert.equal(init.body, undefined);
  }
  sys.updater.dispose();
  let reads = 0;
  const next = sys.next({readSavedScript: async (id, signal) => {
    assert.equal(id, 'actual-installed-id'); assert.equal(signal.aborted, false);
    return ++reads < 2 ? before[1] : sys.readTrees()[1];
  }});
  assert.equal((await next.resume()).status, 'completed');
  assert.equal(reads, 2); assert.equal(sys.storage.getItem(HUB_UPDATE_PENDING_KEY), null);
  assert.equal(sys.writes(), 1, 'resume must never reinstall');
});

test('duplicate clicks share one operation and caller mutation cannot replace the locked target', async t => {
  const data = await fixture(), sys = system(t, data);
  const chosen = target(), first = sys.updater.start(chosen), second = sys.updater.start(target());
  assert.equal(first, second); chosen.releaseId = 999; chosen.version = '99.0.0';
  assert.equal((await first).status, 'awaiting-reload');
  assert.equal((await sys.updater.start(target())).status, 'awaiting-reload');
  assert.equal(sys.writes(), 1); assert.equal(sys.calls.length, 4);
});

test('same, older and suffixed target versions never request or write', async t => {
  const data = await fixture();
  for (const version of ['0.2.1', '0.2.0', '0.2.2-alpha.1', '0.2.2\n']) {
    const sys = system(t, data);
    assert.equal((await sys.updater.start({...target(), version, tag: 'v' + version})).status, 'failed');
    assert.equal(sys.calls.length, 0); assert.equal(sys.writes(), 0);
  }
});

test('CORS/network and HTTP download failures keep original code and remain retryable', async t => {
  const data = await fixture();
  for (const failure of [() => {throw TypeError('Failed to fetch');}, url => response('', url, {status: 403})]) {
    const sys = system(t, data, {fetch: async (url, init, index) => index === 1 ? response(encode(data.release), url) : failure(url)});
    const result = await sys.updater.start(target());
    assert.equal(result.status, 'failed'); assert.match(result.error, /CORS|HTTP 403/);
    assert.equal(sys.writes(), 0); assert.equal(sys.backups.length, 0);
    assert.equal(sys.readTrees()[1].content, buildContent());
    assert.equal(sys.storage.getItem(HUB_UPDATE_PENDING_KEY), null);
  }
});

test('opaque responses and nonofficial redirect destinations are never installed', async t => {
  const data = await fixture();
  for (const getResponse of [
    url => {const r = response(data.metadataBytes, url); Object.defineProperty(r, 'type', {value: 'opaque'}); return r;},
    () => response(data.metadataBytes, 'https://untrusted.invalid/file'),
    () => response(data.metadataBytes, 'http://api.github.com/file'),
    () => response(data.metadataBytes, 'https://username:password@api.github.com/file'),
  ]) {
    const sys = system(t, data, {fetch: async (url, init, index) => index === 1 ? response(encode(data.release), url) : getResponse(url)});
    assert.equal((await sys.updater.start(target())).status, 'failed'); assert.equal(sys.writes(), 0);
  }
});

test('metadata/asset raw bytes must match their independent GitHub digests', async t => {
  const data = await fixture();
  for (const badIndex of [2, 3]) {
    const sys = system(t, data, {fetch: async (url, init, index) => {
      if (index === 1) return response(encode(data.release), url);
      const bytes = new Uint8Array(index === 2 ? data.metadataBytes : data.bytes);
      if (index === badIndex) bytes[bytes.length - 1] ^= 1;
      return response(bytes, url);
    }});
    const result = await sys.updater.start(target());
    assert.equal(result.status, 'failed'); assert.match(result.error, /SHA-256/); assert.equal(sys.writes(), 0);
  }
});

test('streamed sizes and declared response limits reject oversized or truncated input', async t => {
  const data = await fixture();
  for (const kind of ['length', 'stream', 'truncated']) {
    let cancelled = false;
    const sys = system(t, data, {fetch: async (url, init, index) => {
      if (index === 1) return response(encode(data.release), url);
      if (kind === 'length') return response(data.metadataBytes, url, {headers: {'content-length': String(HUB_UPDATE_METADATA_LIMIT + 1)}});
      if (kind === 'truncated') return response(data.metadataBytes.slice(0, -1), url);
      const stream = new ReadableStream({start(c) {c.enqueue(new Uint8Array(HUB_UPDATE_METADATA_LIMIT + 1));}, cancel() {cancelled = true;}});
      return response(stream, url);
    }});
    assert.equal((await sys.updater.start(target())).status, 'failed'); assert.equal(sys.writes(), 0);
    if (kind === 'stream') assert.equal(cancelled, true);
  }
});

test('a late fetch that ignores AbortSignal cannot install after timeout', async t => {
  const data = await fixture(); let resolveLate;
  const sys = system(t, data, {fetch: (url, init, index) => index === 1 ? Promise.resolve(response(encode(data.release), url))
    : new Promise(resolve => {resolveLate = () => resolve(response(data.metadataBytes, url));}),
    updater: {metadataTimeoutMs: 10}});
  const result = await sys.updater.start(target());
  assert.equal(result.status, 'failed'); assert.match(result.error, /超时/);
  resolveLate(); await settle(); await settle();
  assert.equal(sys.writes(), 0); assert.equal(sys.backups.length, 0);
});

test('second release read refuses release ID, asset ID or digest changes', async t => {
  const data = await fixture();
  for (const mutate of [
    r => {r.id++;},
    r => {r.assets[0].id++; r.assets[0].url = HUB_UPDATE_REPOSITORY_API + '/releases/assets/' + r.assets[0].id;},
    r => {r.assets[0].digest = 'sha256:' + '0'.repeat(64);},
    r => {r.assets[1].digest = 'sha256:' + '0'.repeat(64);},
  ]) {
    const sys = system(t, data, {secondRelease: release => {const changed = clone(release); mutate(changed); return changed;}});
    assert.equal((await sys.updater.start(target())).status, 'failed');
    assert.equal(sys.writes(), 0); assert.equal(sys.backups.length, 0); assert.equal(sys.storage.getItem(HUB_UPDATE_PENDING_KEY), null);
  }
});

test('concurrent content edits cancel installation but current metadata and other scripts survive', async t => {
  const data = await fixture(); let sys;
  sys = system(t, data, {updater: {backup: async () => sys.editTrees(trees => {trees[1].content += '\n// user edit';})}});
  const result = await sys.updater.start(target());
  assert.equal(result.status, 'unconfirmed'); assert.equal(sys.writes(), 0);
  assert.match(sys.readTrees()[1].content, /user edit/);
  assert.deepEqual(sys.readTrees()[0], otherScript());
});

test('backup and handoff storage failures prevent writes', async t => {
  const data = await fixture();
  for (const updater of [{backup: undefined}, {backup: async () => {throw Error('download unavailable');}},
    {storage: {getItem: () => null, setItem: () => {throw Error('quota');}}}]) {
    const sys = system(t, data, {updater});
    assert.equal((await sys.updater.start(target())).status, 'failed'); assert.equal(sys.writes(), 0);
  }
});

test('dispose during preparation/download/verification prevents writing and ignores late results', async t => {
  const data = await fixture();
  for (const stage of ['preparing', 'downloading', 'verifying']) {
    const sys = system(t, data);
    sys.updater.subscribe(state => {if (state.status === stage) sys.updater.dispose();});
    assert.equal((await sys.updater.start(target())).status, 'cancelled');
    await settle(); assert.equal(sys.writes(), 0); assert.equal(sys.storage.getItem(HUB_UPDATE_PENDING_KEY), null);
  }
});

test('dispose after content installation preserves handoff for the next iframe', async t => {
  const data = await fixture(), sys = system(t, data);
  assert.equal((await sys.updater.start(target())).status, 'awaiting-reload');
  sys.updater.dispose();
  assert.ok(sys.storage.getItem(HUB_UPDATE_PENDING_KEY));
  assert.equal((await sys.next({readSavedScript: async () => sys.readTrees()[1]}).resume()).status, 'completed');
  assert.equal(sys.writes(), 1);
});

test('installing or backup notification teardown cannot leave pending state or write code', async t => {
  const data = await fixture();
  for (const shouldDispose of [state => state.status === 'installing', state => state.backupRequested]) {
    const sys = system(t, data);
    sys.updater.subscribe(state => {if (shouldDispose(state)) sys.updater.dispose();});
    assert.equal((await sys.updater.start(target())).status, 'cancelled');
    await settle();
    assert.equal(sys.writes(), 0); assert.equal(sys.storage.getItem(HUB_UPDATE_PENDING_KEY), null);
    assert.equal(sys.readTrees()[1].content, buildContent());
  }
});

test('replacing the handoff during confirmation prevents success and preserves the replacement', async t => {
  const data = await fixture(), sys = system(t, data); await sys.updater.start(target());
  const replacement = JSON.parse(sys.storage.getItem(HUB_UPDATE_PENDING_KEY)); replacement.releaseId++;
  const next = sys.next({readSavedScript: async () => {
    sys.storage.setItem(HUB_UPDATE_PENDING_KEY, JSON.stringify(replacement));
    return sys.readTrees()[1];
  }});
  const result = await next.resume();
  assert.equal(result.status, 'unconfirmed'); assert.match(result.error, /交接记录发生变化/);
  assert.deepEqual(JSON.parse(sys.storage.getItem(HUB_UPDATE_PENDING_KEY)), replacement);
});

test('manual restoration of the exact original instance/content clears only its handoff and allows retry', async t => {
  const data = await fixture(), sys = system(t, data);
  const before = sys.readTrees()[1].content;
  await sys.updater.start(target()); sys.updater.dispose();
  assert.equal(JSON.parse(sys.storage.getItem(HUB_UPDATE_PENDING_KEY)).previousContentSha256,
    await hashHubUpdateBytes(encode(before), webcrypto));
  sys.editTrees(trees => {trees[1].content = before;});
  const restored = sys.next({currentVersion: '0.2.1', host: sys.hostFor('0.2.1')});
  const resumed = await restored.resume();
  assert.equal(resumed.status, 'failed'); assert.match(resumed.error, /恢复原版本/);
  assert.equal(sys.storage.getItem(HUB_UPDATE_PENDING_KEY), null);
  assert.equal((await restored.start(target())).status, 'awaiting-reload'); assert.equal(sys.writes(), 2);
});

test('a same-version but modified original cannot erase the pending recovery record', async t => {
  const data = await fixture(), sys = system(t, data); await sys.updater.start(target()); sys.updater.dispose();
  sys.editTrees(trees => {trees[1].content = buildContent() + '\n// changed during manual restore';});
  const restored = sys.next({currentVersion: '0.2.1', host: sys.hostFor('0.2.1')});
  assert.equal((await restored.resume()).status, 'unconfirmed'); assert.ok(sys.storage.getItem(HUB_UPDATE_PENDING_KEY));
});

test('write failures clear handoff only when the original content is positively still installed', async t => {
  const data = await fixture();
  for (const afterMutation of [false, true]) {
    let sys;
    const host = {snapshot: () => sys.hostFor('0.2.1').snapshot(), install(snapshot, content) {
      if (afterMutation) sys.hostFor('0.2.1').install(snapshot, content);
      throw Error('host write failure');
    }};
    sys = system(t, data, {updater: {host}});
    const result = await sys.updater.start(target());
    assert.equal(result.status, afterMutation ? 'unconfirmed' : 'failed');
    assert.equal(Boolean(sys.storage.getItem(HUB_UPDATE_PENDING_KEY)), afterMutation);
    assert.equal(sys.writes(), afterMutation ? 1 : 0);
  }
});

test('new iframe teardown cancels confirmation without clearing the recovery record', async t => {
  const data = await fixture(), sys = system(t, data); await sys.updater.start(target()); sys.updater.dispose();
  let resolveLate;
  const next = sys.next({readSavedScript: () => new Promise(resolve => {resolveLate = resolve;})});
  const task = next.resume(); while (!resolveLate) await settle(); next.dispose();
  assert.equal((await task).status, 'cancelled');
  resolveLate(sys.readTrees()[1]); await settle();
  assert.ok(sys.storage.getItem(HUB_UPDATE_PENDING_KEY)); assert.equal(sys.writes(), 1);
});

test('resume requires matching version, instance and content; failed confirmation keeps pending', async t => {
  const data = await fixture();
  for (const makeOptions of [
    sys => ({currentVersion: '0.2.1', host: sys.hostFor('0.2.1')}),
    sys => ({host: {snapshot: () => ({...sys.hostFor('0.2.2').snapshot(), id: 'wrong-id'})}}),
    sys => ({host: {snapshot: () => ({...sys.hostFor('0.2.2').snapshot(), content: 'wrong code'})}}),
    () => ({readSavedScript: undefined}),
    () => ({readSavedScript: async () => installedScript(), confirmationTimeoutMs: 10}),
  ]) {
    const sys = system(t, data); await sys.updater.start(target());
    const next = sys.next({readSavedScript: async () => sys.readTrees()[1], ...makeOptions(sys)});
    assert.equal((await next.resume()).status, 'unconfirmed'); assert.ok(sys.storage.getItem(HUB_UPDATE_PENDING_KEY));
  }
});

test('resume pending validation, expiry and concurrent confirmation are bounded', async t => {
  const data = await fixture(), sys = system(t, data); await sys.updater.start(target());
  let readResolve;
  const next = sys.next({readSavedScript: () => new Promise(resolve => {readResolve = resolve;})});
  const first = next.resume(), second = next.resume(); assert.equal(first, second);
  while (!readResolve) await settle(); readResolve(sys.readTrees()[1]);
  assert.equal((await first).status, 'completed');
  for (const value of ['not json', '{}', 'x'.repeat(4097)]) {
    sys.storage.setItem(HUB_UPDATE_PENDING_KEY, value);
    assert.equal((await sys.next().resume()).status, 'unconfirmed');
  }
  const expiredSys = system(t, data); await expiredSys.updater.start(target());
  assert.equal((await expiredSys.next({now: () => 1700000000000 + 86400001}).resume()).status, 'unconfirmed');
});

test('saved-script reader is same-origin, read-only, and extracts only the exact global instance', async () => {
  const content = buildContent('0.2.2'), calls = [];
  const settings = {extension_settings: {tavern_helper: {script: {scripts: [
    otherScript(), {type: 'folder', scripts: [installedScript({content})]},
  ]}}}, privateOtherSettings: 'never returned to updater'};
  const reader = createHubSavedScriptReader({origin: 'https://tavern.example',
    getRequestHeaders: () => ({'Content-Type': 'application/json', 'X-CSRF-Token': 'test-only'}),
    fetch: async (url, init) => {calls.push({url, init}); return response(encode({settings: JSON.stringify(settings)}), url);}});
  const signal = new AbortController().signal;
  assert.deepEqual(await reader('actual-installed-id', signal), {id: 'actual-installed-id', name: '用户自定义 Hub 名称', content});
  assert.equal(calls[0].url, 'https://tavern.example/api/settings/get');
  assert.equal(calls[0].init.method, 'POST'); assert.equal(calls[0].init.body, '{}');
  assert.equal(calls[0].init.credentials, 'same-origin'); assert.equal(calls[0].init.redirect, 'error');
  assert.equal(await reader('missing', signal), null);
  settings.extension_settings.tavern_helper.script.scripts.push(installedScript());
  await assert.rejects(reader('actual-installed-id', signal), hasCode('persistence'));
});

test('CORS fallback installs verified Hub content through fixed-ID anonymous Registry request', async t => {
  const data=await fixture(),base='https://registry.example.org',endpoint=base+'/api/hub/releases/asset';
  const sys=system(t,data,{updater:{getRegistryBaseURL:()=>base},fetch:async(url,init)=>{
    if(url===HUB_UPDATE_REPOSITORY_API+'/releases/201')return response(encode(data.release),url);
    if(url.startsWith(HUB_UPDATE_REPOSITORY_API+'/releases/assets/'))throw TypeError('Failed to fetch (CORS)');
    assert.equal(url,endpoint);assert.equal(init.method,'POST');assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.mode,'cors');
    assert.deepEqual(Object.keys(init.headers).sort(),['Accept','Content-Type']);
    const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body).sort(),['assetId','releaseId']);assert.equal(body.releaseId,201);
    return response(body.assetId===302?data.metadataBytes:data.bytes,url);
  }});
  const result=await sys.updater.start(target());assert.equal(result.status,'awaiting-reload');assert.equal(sys.writes(),1);
  const installed=sys.readTrees().find(x=>x.id==='actual-installed-id');assert.equal(installed.content,data.script.content);assert.deepEqual(installed.data,installedScript().data);
  assert.equal(sys.calls.filter(c=>c.url===endpoint).length,2);
});
test('Hub relay errors, tampering, redirects, opaque responses and service switching never write',async t=>{
  for(const scenario of ['offline','http','quota','tamper','redirect','opaque','switch']){
    const data=await fixture();let base='https://registry.example.org';
    const sys=system(t,data,{updater:{getRegistryBaseURL:()=>base},fetch:async(url,init)=>{
      if(url===HUB_UPDATE_REPOSITORY_API+'/releases/201')return response(encode(data.release),url);
      if(url.startsWith(HUB_UPDATE_REPOSITORY_API))throw TypeError('CORS');
      if(scenario==='offline')throw TypeError('offline');
      if(scenario==='http')return response('private diagnostics',url,{status:502});
      if(scenario==='quota')return response(encode({error:{code:'github_rate_limited',retryAt:new Date(Date.now()+60000).toISOString()}}),url,{status:429});
      if(scenario==='tamper')return response(encode('wrong'),url);
      if(scenario==='redirect')return response(data.metadataBytes,'https://evil.invalid/');
      if(scenario==='opaque'){const r=response(data.metadataBytes,url);Object.defineProperty(r,'type',{value:'opaque'});return r;}
      base='https://other.example.org';return response(data.metadataBytes,url);
    }});
    const result=await sys.updater.start(target());assert.equal(result.status,'failed',scenario);assert.equal(sys.writes(),0,scenario);assert.equal(sys.backups.length,0,scenario);assert.equal(sys.readTrees()[1].content,installedScript().content);
    assert.ok(!result.error.includes('private diagnostics'));
  }
});
test('Hub relay timeout and teardown cannot write after a late response',async t=>{
  for(const cancel of [false,true]){
    const data=await fixture();let finish;
    const sys=system(t,data,{updater:{getRegistryBaseURL:()=> 'https://registry.example.org',metadataTimeoutMs:15},fetch:async(url)=>{
      if(url===HUB_UPDATE_REPOSITORY_API+'/releases/201')return response(encode(data.release),url);
      if(url.startsWith(HUB_UPDATE_REPOSITORY_API))throw TypeError('CORS');
      return new Promise(resolve=>{finish=()=>resolve(response(data.metadataBytes,url));});
    }});
    const pending=sys.updater.start(target());while(!finish)await settle();if(cancel)sys.updater.dispose();await pending;finish();await settle();assert.equal(sys.writes(),0);
  }
});

test('saved new Hub code with old name cannot complete or clear the handoff', async t => {
  const data=await fixture(), sys=system(t,data); await sys.updater.start(target());
  const next=sys.next({readSavedScript:async()=>({...sys.readTrees()[1],name:'用户自定义 Hub 名称 0.2.1'}),confirmationTimeoutMs:15});
  assert.equal((await next.resume()).status,'unconfirmed');
  assert.ok(sys.storage.getItem(HUB_UPDATE_PENDING_KEY)); assert.equal(sys.writes(),1);
});

test('new writer missing in-memory name fails rather than silently repairing its own failed write', async t => {
  const data=await fixture(),sys=system(t,data); await sys.updater.start(target());
  sys.editTrees(trees=>{trees[1].name='Old label 0.2.1';});
  assert.equal((await sys.next({readSavedScript:async()=>sys.readTrees()[1]}).resume()).status,'unconfirmed');
  assert.equal(sys.writes(),1); assert.ok(sys.storage.getItem(HUB_UPDATE_PENDING_KEY));
});

test('old published updater handoff synchronizes only the verified instance name and confirms its durable save', async t => {
  const data=await fixture(),sys=system(t,data); await sys.updater.start(target());
  const record=JSON.parse(sys.storage.getItem(HUB_UPDATE_PENDING_KEY)); delete record.scriptFieldsVersion;
  sys.storage.setItem(HUB_UPDATE_PENDING_KEY,JSON.stringify(record));
  sys.editTrees(trees=>{trees[1].name='My Hub 0.1.0';trees[1].data.latest=true;});
  const before=sys.readTrees(); let reads=0;
  const next=sys.next({readSavedScript:async()=>++reads<3?before[1]:sys.readTrees()[1]});
  assert.equal((await next.resume()).status,'completed'); assert.equal(reads,3);
  assert.deepEqual(sys.readTrees(),[before[0],{...before[1],name:'My Hub 0.2.2'}]);
  assert.equal(sys.writes(),2); assert.equal(sys.storage.getItem(HUB_UPDATE_PENDING_KEY),null);
});

test('legacy handoff never repairs a mismatched target content or absent durable reader', async t => {
  for (const mismatch of [true,false]) {
    const data=await fixture(),sys=system(t,data); await sys.updater.start(target());
    const record=JSON.parse(sys.storage.getItem(HUB_UPDATE_PENDING_KEY)); delete record.scriptFieldsVersion;
    sys.storage.setItem(HUB_UPDATE_PENDING_KEY,JSON.stringify(record));
    sys.editTrees(trees=>{trees[1].name='My Hub 0.1.0';if(mismatch)trees[1].content+='\n// edited';});
    const next=sys.next({readSavedScript:mismatch?async()=>sys.readTrees()[1]:undefined});
    assert.equal((await next.resume()).status,'unconfirmed'); assert.equal(sys.writes(),1);
  }
});

test('durable reader rejects content-only records and never leaks script data', async () => {
  const scripts=[installedScript({content:buildContent('0.2.2')})];
  const reader=createHubSavedScriptReader({origin:'http://127.0.0.1:8000',getRequestHeaders:()=>({}),fetch:async()=>Response.json({settings:JSON.stringify({extension_settings:{tavern_helper:{script:{scripts}}}})})});
  const saved=await reader(scripts[0].id,new AbortController().signal);
  assert.deepEqual(Object.keys(saved).sort(),['content','id','name']);
  delete scripts[0].name;
  await assert.rejects(reader(scripts[0].id,new AbortController().signal),hasCode('persistence'));
});
