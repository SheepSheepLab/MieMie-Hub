import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto, createHash} from 'node:crypto';
import {createExtensionPackageManager, parseExtensionRepository, validateExtensionManifest, validateExtensionPackageMetadata,
  validateExtensionPackage, parseExtensionBuildIdentity, EXTENSION_PACKAGE_METADATA, EXTENSION_PACKAGE_LIMIT} from '../src/extension-packages.js';

// Deliberately inert development fixtures, never presented as community works.
const REPO = 'https://github.com/DevelopmentFixture/Example';
const API = 'https://api.github.com/repos/DevelopmentFixture/Example';
const ID = 'fixture.example';
const PACKAGE_ID = 'fixture-export-id';
const encode = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const code = expected => error => error?.code === expected;
const manifest = (version = '1.0.1', extra = {}) => ({schemaVersion: 1, apiVersion: 1, id: ID, name: 'Development Fixture', author: 'Test Data', version,
  description: 'Inert package test data', entry: 'extension.js', repository: REPO, license: 'GPL-3.0-or-later', ...extra});
const content = (version = '1.0.1', extra = {}) => '// MieMie-Extension-Build: ' + JSON.stringify({schemaVersion: 1, productId: ID, version, scriptId: PACKAGE_ID, repository: REPO, ...extra}) + '\n(() => { /* Development Fixture: never evaluated by manager tests */ })();';
const script = (version = '1.0.1', extra = {}) => ({type: 'script', enabled: true, name: 'My renamed script', id: 'installed-instance', content: content(version), info: 'My custom information',
  button: {enabled: true, buttons: [{name: 'My button', visible: true}]}, data: {settings: {keep: true}}, export_with: {data: false, button: true}, ...extra});
const other = () => script('1.0.1', {id: 'other-instance', content: 'void 0;'});
const folder = scripts => ({type: 'folder', enabled: true, name: 'User folder', id: 'folder-id', icon: 'folder', color: 'red', scripts});
function fixture(options = {}) {
  const version = options.version || '1.0.2';
  const packageScript = options.script || script(version, {id: PACKAGE_ID, data: {}});
  const bytes = options.bytes || encode(packageScript);
  const metadata = {schemaVersion: 1, format: 'tavern-helper-script', productId: ID, version, tag: 'v' + version, scriptId: PACKAGE_ID,
    manifest: manifest(version), asset: {name: 'Fixture-Extension-' + version + '.json', size: bytes.length, sha256: hash(bytes)}, contentSha256: hash(packageScript.content || ''), ...options.metadata};
  const metadataBytes = encode(metadata);
  const asset = (id, name, bytes) => ({id, name, size: bytes.length, state: 'uploaded', digest: 'sha256:' + hash(bytes), url: API + '/releases/assets/' + id, browser_download_url: REPO + '/releases/download/v' + version + '/' + name});
  const release = {id: 201, tag_name: 'v' + version, draft: false, prerelease: true, assets: [asset(301, metadata.asset.name, bytes), asset(302, EXTENSION_PACKAGE_METADATA, metadataBytes)], ...options.release};
  return {version, packageScript, bytes, metadata, metadataBytes, release};
}
function response(bytes, url, status = 200) {const value = new Response(bytes, {status}); Object.defineProperty(value, 'url', {value: url}); return value;}
function setup(t, f = fixture(), options = {}) {
  let trees = clone(options.trees || [script(), other()]), writes = 0, releaseReads = 0;
  const calls = [], backups = [];
  const baseRequest = async (url, init) => {
    calls.push({url, init});
    if (url === API) return response(encode(options.repoInfo || {private: false, full_name: 'DevelopmentFixture/Example'}), url);
    if (url.startsWith(API + '/releases?')) return response(encode(options.releases || [f.release]), url);
    if (url === API + '/releases/201') {releaseReads++; return response(encode(options.releaseAt ? options.releaseAt(releaseReads, clone(f.release)) : f.release), url);}
    if (url === API + '/releases/assets/302') return response(options.metadataBytes || f.metadataBytes, options.redirect || url);
    if (url === API + '/releases/assets/301') {options.beforeDownload?.(); return response(options.bytes || f.bytes, options.redirect || url);}
    throw Error('Unexpected URL');
  };
  const manager = createExtensionPackageManager({getScriptTrees: () => clone(trees), updateScriptTreesWith(updater, scope) {
    assert.deepEqual(scope, {type: 'global'}); options.beforeWrite?.(trees);
    const result = updater(clone(trees)); assert.equal(typeof result?.then, 'undefined'); trees = result; writes++; return clone(trees);
  }, fetch: options.fetch || baseRequest, crypto: webcrypto, randomUUID: () => 'fresh-instance', backup: options.noBackup ? undefined : async value => {backups.push(value);},
  metadataTimeoutMs: 100, assetTimeoutMs: 100, ...options.manager});
  t.after(() => manager.dispose());
  return {manager, calls, backups, baseRequest, read: () => clone(trees), writes: () => writes, edit: fn => fn(trees)};
}

test('repository URLs accept only public GitHub repo shape, never proxies or credentials', () => {
  assert.equal(parseExtensionRepository(REPO + '.git').url, REPO);
  for (const input of ['http://github.com/a/b', 'https://github.com.evil.test/a/b', 'https://user:secret@github.com/a/b', REPO + '?token=x', REPO + '#x', 'https://api.github.com/repos/a/b', REPO + '/releases', 'https://discord.com/channels/1/2/3']) assert.throws(() => parseExtensionRepository(input), code('repository'));
});

test('optional Launcher, background extension, manifest identity and icon constraints', () => {
  assert.equal(validateExtensionManifest(manifest(), REPO).id, ID);
  assert.equal(validateExtensionManifest(manifest('1.0.1', {contributes: {launcher: {title: 'Development Fixture', icon: '🧩'}}}), REPO).id, ID);
  for (const patch of [{version: '1.0.1-alpha.1'}, {version: '01.1.1'}, {version: '1.0.1\n'}, {id: 'miemie.hub'}, {author: ''}, {apiVersion: 2}, {hubApi: {min: 2, max: 2}}, {repository: 'https://github.com/Someone/Else'}, {icon: 'javascript:alert(1)'}, {icon: '../private.png'}, {icon: '//evil.test/icon.png'}]) assert.throws(() => validateExtensionManifest(manifest('1.0.1', patch), REPO));
  assert.equal(validateExtensionManifest(manifest('1.0.1', {icon: 'assets/icon.png'}), REPO).icon, 'assets/icon.png');
});

test('build identity is explicit and never guessed from product name', () => {
  assert.equal(parseExtensionBuildIdentity(content()).productId, ID);
  assert.equal(parseExtensionBuildIdentity('// ' + ID + '\nvoid 0'), null);
  assert.equal(parseExtensionBuildIdentity(content('1.0.1', {repository: 'https://evil.test/x'})), null);
});

test('metadata rejects identity, tag, size, hash and arbitrary download URL conflicts', () => {
  const f = fixture(); assert.deepEqual(validateExtensionPackageMetadata(f.metadata, REPO, f.release), f.metadata);
  for (const patch of [{schemaVersion: 2}, {productId: 'miemie.hub'}, {version: '1.0.2-alpha.1'}, {tag: 'v1.0.3'}, {contentSha256: 'bad'}, {downloadUrl: 'https://evil.test'}, {asset: {...f.metadata.asset, name: '../x.json'}}, {asset: {...f.metadata.asset, size: EXTENSION_PACKAGE_LIMIT + 1}}, {manifest: {...f.metadata.manifest, id: 'fixture.other'}}]) assert.throws(() => validateExtensionPackageMetadata({...f.metadata, ...patch}, REPO, f.release));
});

test('raw package and content hashes verified before accepting single-script package', async () => {
  const f = fixture(); assert.deepEqual(await validateExtensionPackage(f.bytes, f.metadata, webcrypto), f.packageScript);
  await assert.rejects(validateExtensionPackage(encode('changed'), f.metadata, webcrypto), code('hash'));
  await assert.rejects(validateExtensionPackage(f.bytes, {...f.metadata, contentSha256: '0'.repeat(64)}, webcrypto), code('content-hash'));
  const bad = fixture({bytes: encode('{invalid')}); await assert.rejects(validateExtensionPackage(bad.bytes, bad.metadata, webcrypto), code('json'));
  for (const patch of [{id: 'another-package'}, {content: content('1.0.3')}, {content: content('1.0.2', {productId: 'fixture.other'})}, {data: {secret: 'test fixture'}}, {unknown: 'new field'}, {type: 'folder'}]) {
    const invalid = fixture({script: script('1.0.2', {id: PACKAGE_ID, data: {}, ...patch})}); await assert.rejects(validateExtensionPackage(invalid.bytes, invalid.metadata, webcrypto));
  }
});

test('inspect reads author repository, ignores drafts/invalid tags and compares all versions', async t => {
  const f = fixture(); const sys = setup(t, f, {releases: [{...f.release, tag_name: 'v1.0.1'}, {...f.release, tag_name: 'v99.0.0', draft: true}, {...f.release, tag_name: 'banana'}, {...f.release, tag_name: 'v1.0.3-alpha.1'}, f.release]});
  const candidate = await sys.manager.inspect(REPO); assert.equal(candidate.installable, true); assert.equal(candidate.version, '1.0.2'); assert.equal(candidate.manifest.author, 'Test Data');
  for (const {url, init} of sys.calls) {assert.ok(url.startsWith(API)); assert.equal(init.credentials, 'omit'); assert.equal(init.mode, 'cors'); assert.equal(init.referrerPolicy, 'no-referrer'); assert.equal('Authorization' in init.headers, false);}
});

test('public GitHub without package metadata or releases remains external-only', async t => {
  const f = fixture({release: {id: 201, tag_name: 'v1.0.2', draft: false, assets: []}}); const sys = setup(t, f);
  assert.equal((await sys.manager.inspect(REPO)).compatibility, 'external');
  const empty = setup(t, fixture(), {releases: []}); assert.equal((await empty.manager.inspect(REPO)).installable, false);
  const privateRepo = setup(t, fixture(), {repoInfo: {private: true, full_name: 'DevelopmentFixture/Example'}}); await assert.rejects(privateRepo.manager.inspect(REPO), code('repository'));
});

test('install creates one enabled global script with new instance ID and unchanged other scripts', async t => {
  const sys = setup(t, fixture(), {trees: [other()]}); const before = sys.read();
  const result = await sys.manager.install(await sys.manager.inspect(REPO)); assert.equal(result.ok, true); assert.equal(result.persistence, 'unconfirmed'); assert.equal(result.instanceId, 'fresh-instance');
  assert.deepEqual(sys.read()[0], before[0]); assert.deepEqual(sys.read()[1].data, {}); assert.equal(sys.read()[1].enabled, true);
  assert.equal((await sys.manager.listInstalled())[0].id, ID); assert.equal(sys.writes(), 1);
});

test('duplicate installation rejected and failed downloads produce no half installation', async t => {
  const existing = setup(t); await assert.rejects(existing.manager.install(await existing.manager.inspect(REPO)), code('duplicate')); assert.equal(existing.writes(), 0);
  const sys = setup(t, fixture(), {trees: [other()], bytes: encode('tampered')}); const candidate = await sys.manager.inspect(REPO);
  await assert.rejects(sys.manager.install(candidate)); assert.equal(sys.writes(), 0); assert.deepEqual(sys.read(), [other()]);
});

test('installed folder and renamed script update preserves all data, buttons, fields and siblings', async t => {
  const original = [other(), folder([script(), other()])]; original[1].scripts[1].id = 'sibling';
  const sys = setup(t, fixture(), {trees: original}); const result = await sys.manager.update(ID);
  assert.equal(result.instanceId, 'installed-instance'); assert.equal(result.version, '1.0.2');
  const after = sys.read(); const newContent = after[1].scripts[0].content; after[1].scripts[0].content = original[1].scripts[0].content;
  assert.deepEqual(after, original); assert.equal(parseExtensionBuildIdentity(newContent).version, '1.0.2');
});

test('equal and older remote versions are not updates', async t => {
  for (const version of ['1.0.1', '1.0.0']) {const sys = setup(t, fixture({version})); assert.equal((await sys.manager.check(ID)).available, false); await assert.rejects(sys.manager.update(ID), code('version')); assert.equal(sys.writes(), 0);}
});

test('cross-extension and cross-repository candidate cannot overwrite an installed package', async t => {
  const sys = setup(t); const candidate = await sys.manager.inspect(REPO);
  await assert.rejects(sys.manager.update(ID, {...candidate, id: 'fixture.other'}), code('version'));
  await assert.rejects(sys.manager.update(ID, {...candidate, repoUrl: 'https://github.com/Someone/Else'}), code('version')); assert.equal(sys.writes(), 0);
});

test('fixed published script ID changing is rejected even with matching extension ID and hashes', async t => {
  const f = fixture({script: script('1.0.2', {id: 'new-export-id', data: {}, content: content('1.0.2', {scriptId: 'new-export-id'})}), metadata: {scriptId: 'new-export-id'}});
  const sys = setup(t, f); await assert.rejects(sys.manager.update(ID), code('identity')); assert.equal(sys.writes(), 0);
});

test('release asset ID, digest and size are locked and checked again immediately before writing', async t => {
  for (const mutate of [r => {r.assets[0].id++;}, r => {r.assets[0].digest = 'sha256:' + '0'.repeat(64);}, r => {r.assets[0].size++;}, r => {r.tag_name = 'v1.0.3';}]) {
    const sys = setup(t, fixture(), {releaseAt: (n, r) => {if (n >= 3) mutate(r); return r;}});
    await assert.rejects(sys.manager.update(ID)); assert.equal(sys.writes(), 0);
  }
});

test('write-time concurrent content edits and duplicate IDs reject safely', async t => {
  const edited = setup(t, fixture(), {beforeWrite: trees => {trees[0].content += '\n// external user edit';}});
  await assert.rejects(edited.manager.update(ID), code('changed')); assert.equal(edited.writes(), 0);
  const duplicate = setup(t, fixture(), {trees: [script(), script('1.0.1', {id: 'duplicate-instance'})]});
  await assert.rejects(duplicate.manager.update(ID), code('duplicate'));
  const duplicateInstance = setup(t, fixture(), {trees: [script(), script()]}); await assert.rejects(duplicateInstance.manager.listInstalled(), code('host-ambiguous'));
});

test('write uses the latest tree and preserves concurrent user data edits', async t => {
  const sys = setup(t, fixture(), {beforeWrite: trees => {trees[0].data.latest = 'user edit'; trees[1].name = 'renamed other';}});
  await sys.manager.update(ID); assert.equal(sys.read()[0].data.latest, 'user edit'); assert.equal(sys.read()[1].name, 'renamed other');
});

test('non-global and unknown host fields refuse mutation', async t => {
  const absent = setup(t, fixture(), {trees: [other()]}); await assert.rejects(absent.manager.update(ID), code('not-global'));
  const unknown = setup(t, fixture(), {trees: [script({}), {...other(), unfamiliar: true}]}); await assert.rejects(unknown.manager.listInstalled(), code('host-schema'));
});

test('physical enable/disable and uninstall never affect other scripts and create no backup', async t => {
  const sys = setup(t, fixture(), {trees: [folder([script(), other()])]}); const untouched = sys.read()[0].scripts[1];
  await sys.manager.setEnabled(ID, false); assert.equal(sys.read()[0].scripts[0].enabled, false);
  await sys.manager.setEnabled(ID, true); assert.equal(sys.read()[0].scripts[0].enabled, true);
  const result = await sys.manager.uninstall(ID); assert.equal(result.physical, true); assert.equal(sys.backups.length, 0);
  assert.deepEqual(sys.read()[0].scripts, [untouched]); assert.equal((await sys.manager.listInstalled()).length, 0);
});

test('data-bearing uninstall needs no backup facility and disabled folders stay disabled', async t => {
  const noBackup = setup(t, fixture(), {noBackup: true}); assert.equal((await noBackup.manager.uninstall(ID)).physical, true); assert.equal(noBackup.writes(), 1);
  const tree = folder([script()]); tree.enabled = false; const sys = setup(t, fixture(), {trees: [tree]});
  await assert.rejects(sys.manager.setEnabled(ID, true), code('folder-disabled')); assert.equal(sys.writes(), 0);
});

test('HTTP/rate-limit, network/CORS and untrusted redirect fail before script writes', async t => {
  for (const fetch of [async url => response(encode({message: 'rate limited'}), url, 403), async () => {throw new TypeError('CORS');}]) {
    const sys = setup(t, fixture(), {fetch}); await assert.rejects(sys.manager.update(ID)); assert.equal(sys.writes(), 0);
  }
  const sys = setup(t, fixture(), {redirect: 'https://third-party-proxy.invalid/file'}); await assert.rejects(sys.manager.update(ID), code('redirect')); assert.equal(sys.writes(), 0);
});

test('timeout and teardown cancel non-cooperative fetch without later writes', async t => {
  const hung = setup(t, fixture(), {fetch: () => new Promise(() => {}), manager: {metadataTimeoutMs: 10}});
  await assert.rejects(hung.manager.inspect(REPO), code('timeout')); assert.equal(hung.writes(), 0);
  const sys = setup(t, fixture(), {fetch: () => new Promise(() => {})}); const pending = sys.manager.update(ID);
  await new Promise(resolve => setImmediate(resolve)); sys.manager.dispose(); await assert.rejects(pending, code('cancelled')); assert.equal(sys.writes(), 0);
});

test('duplicate clicks reject a second mutation while the first is active', async t => {
  const sys = setup(t, fixture(), {fetch: () => new Promise(() => {}), manager: {metadataTimeoutMs: 15}});
  const first = sys.manager.update(ID); await assert.rejects(sys.manager.update(ID), code('busy')); await assert.rejects(first, code('timeout')); assert.equal(sys.writes(), 0);
});

test('async host writes and missing APIs refuse operation instead of claiming success', async t => {
  const sys = setup(t, fixture(), {manager: {updateScriptTreesWith: updater => Promise.resolve().then(() => updater([]))}});
  await assert.rejects(sys.manager.setEnabled(ID, false), code('host-async'));
  const missing = createExtensionPackageManager(); t.after(() => missing.dispose()); await assert.rejects(missing.listInstalled(), code('host-unavailable'));
});

test('uninstall rejects concurrent edits and a cancelled delete confirmation', async t => {
  const changed = setup(t, fixture(), {beforeWrite: trees => {trees[0].data.newPrompt = 'test edit after export';}});
  await assert.rejects(changed.manager.uninstall(ID), code('changed')); assert.equal(changed.writes(), 0); assert.equal(changed.read().length, 2);
  const cancelled = setup(t, fixture(), {manager: {confirmUninstall: async () => false}});
  await assert.rejects(cancelled.manager.uninstall(ID), code('cancelled')); assert.equal(cancelled.writes(), 0);
});

test('candidate cannot be changed after inspection and duplicate writes cannot cover an existing ID', async t => {
  const sys = setup(t, fixture(), {trees: [other()]}); const candidate = await sys.manager.inspect(REPO);
  await assert.rejects(sys.manager.install({...candidate, asset: {...candidate.asset, id: 999}}), code('release-changed')); assert.equal(sys.writes(), 0);
  const duplicate = setup(t, fixture(), {trees: [other()], beforeWrite: trees => {trees.push(script());}});
  await assert.rejects(duplicate.manager.install(await duplicate.manager.inspect(REPO)), code('duplicate')); assert.equal(duplicate.writes(), 0);
});

test('install checks new instance ID against folders before committing host tree', async t => {
  const occupiedFolder = folder([other()]); occupiedFolder.id = 'fresh-instance';
  const sys = setup(t, fixture(), {trees: [occupiedFolder]});
  await assert.rejects(sys.manager.install(await sys.manager.inspect(REPO)), code('host-ambiguous')); assert.equal(sys.writes(), 0);
});

test('background Extension without open or Launcher runs through physical complete lifecycle', async t => {
  const f = fixture(); assert.equal(f.metadata.manifest.contributes, undefined);
  const sys = setup(t, f, {trees: [other()]}); await sys.manager.install(await sys.manager.inspect(REPO));
  await sys.manager.setEnabled(ID, false); await sys.manager.setEnabled(ID, true); await sys.manager.uninstall(ID);
  assert.equal((await sys.manager.listInstalled()).length, 0); assert.deepEqual(sys.read(), [other()]);
});

test('malformed API JSON, absent digest and oversize metadata all fail safely', async t => {
  const invalidJSON = setup(t, fixture(), {fetch: async url => response(encode('not json'), url)}); await assert.rejects(invalidJSON.manager.inspect(REPO), code('json'));
  const f = fixture(); f.release.assets[1].digest = null; const absentDigest = setup(t, f); await assert.rejects(absentDigest.manager.inspect(REPO), code('asset'));
  const large = fixture(); large.release.assets[1].size = 65537; const oversize = setup(t, large); await assert.rejects(oversize.manager.inspect(REPO), code('asset'));
  assert.equal(invalidJSON.writes() + absentDigest.writes() + oversize.writes(), 0);
});

test('metadata response does not ignore abort and opaque response cannot install', async t => {
  const opaque = setup(t, fixture(), {fetch: async url => {const result = response(encode({}), url); Object.defineProperty(result, 'type', {value: 'opaque'}); return result;}});
  await assert.rejects(opaque.manager.inspect(REPO), code('http'));
  const sys = setup(t, fixture(), {manager: {crypto: {}}}); await assert.rejects(sys.manager.inspect(REPO), code('crypto')); assert.equal(sys.writes(), 0);
});

test('untrusted old Polisher name or header alone never becomes manageable', async t => {
  const old = script('1.0.1', {content: '// MieMie Polisher · 咩咩润色工具 Extension 1.0.1\n// fabricated Development Fixture'});
  const sys = setup(t, fixture(), {trees: [old]}); assert.deepEqual(await sys.manager.listInstalled(), []);
  await assert.rejects(sys.manager.update('miemie.polisher'), code('not-global'));
});

test('installable manifest is compatible with Runtime v1 ID, name and launcher structural limits', () => {
  assert.equal(validateExtensionManifest(manifest('1.0.1', {id: 'ab'}), REPO).id, 'ab');
  for (const patch of [{id: 'a'.repeat(81)}, {name: 'a'.repeat(81)}, {contributes: {launcher: {}}}, {contributes: {launcher: null}},
    {contributes: {launcher: {title: 'a'.repeat(61)}}}, {contributes: {launcher: {title: 'valid', icon: 'a'.repeat(17)}}}]) assert.throws(() => validateExtensionManifest(manifest('1.0.1', patch), REPO), code('manifest'));
});

test('lowercase Catalog repository input resolves canonical GitHub Asset URL case', async t => {
  const f = fixture(); let sys;
  sys = setup(t, f, {fetch: async (url, init) => {
    if (url === API.toLowerCase()) return response(encode({private: false, full_name: 'DevelopmentFixture/Example'}), url);
    return sys.baseRequest(url, init);
  }});
  const candidate = await sys.manager.inspect(REPO.toLowerCase()); assert.equal(candidate.repoUrl, REPO); assert.equal(candidate.installable, true);
});

test('update exports old content/data after verification and never writes when backup fails', async t => {
  const sys = setup(t); const before = sys.read()[0]; await sys.manager.update(ID); assert.deepEqual(sys.backups[0], before);
  const noBackup = setup(t, fixture(), {noBackup: true}); await assert.rejects(noBackup.manager.update(ID), code('backup-required')); assert.equal(noBackup.writes(), 0); assert.equal(noBackup.read()[0].content, before.content);
  const rejected = setup(t, fixture(), {manager: {backup: async () => {throw Error('download facility unavailable');}}});
  await assert.rejects(rejected.manager.update(ID), /facility/); assert.equal(rejected.writes(), 0); assert.equal(rejected.read()[0].content, before.content);
  const invalid = setup(t, fixture(), {bytes: encode('invalid')}); await assert.rejects(invalid.manager.update(ID)); assert.equal(invalid.backups.length, 0); assert.equal(invalid.writes(), 0);
});


const RELAY = 'https://registry.example';
function relaySetup(t, options = {}) {
  const f = options.fixture || fixture(); let sys;
  const relayCalls = [];
  sys = setup(t, f, {trees: options.trees || [other()], manager: {getRegistryBaseURL: () => RELAY, ...options.manager},
    fetch: async (url, init) => {
      if (url.startsWith(API + '/releases/assets/')) throw new TypeError('Failed to fetch: browser CORS');
      if (url === RELAY + '/api/packages/github/asset') {
        relayCalls.push({url, init});
        const body = JSON.parse(init.body);
        assert.deepEqual(Object.keys(body).sort(), ['assetId', 'releaseId', 'repository']);
        assert.equal(body.repository, REPO); assert.equal(body.releaseId, 201);
        assert.ok([301,302].includes(body.assetId));
        assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error'); assert.equal(init.mode, 'cors');
        assert.equal(init.referrerPolicy, 'no-referrer'); assert.equal(init.headers.Authorization, undefined); assert.equal(init.headers.Cookie, undefined);
        const bytes = body.assetId === 302 ? f.metadataBytes : f.bytes;
        return options.reply ? options.reply(bytes, body, url, init) : response(bytes, url);
      }
      return sys.baseRequest(url, init);
    }});
  return {...sys, relayCalls, fixture: f};
}

test('CORS fallback transports only locked author Release assets with no credentials and installs verified bytes', async t => {
  const sys = relaySetup(t);
  const candidate = await sys.manager.inspect(REPO);
  assert.equal(candidate.repoUrl, REPO); assert.equal(candidate.installable, true);
  await sys.manager.install(candidate);
  assert.equal(sys.writes(), 1); assert.equal(sys.read()[0].content, other().content);
  assert.ok(sys.relayCalls.some(c => JSON.parse(c.init.body).assetId === 302));
  assert.ok(sys.relayCalls.some(c => JSON.parse(c.init.body).assetId === 301));
});

test('CORS relay update preserves installed instance, user data and unrelated scripts', async t => {
  const old = script(); const sys = relaySetup(t, {trees: [folder([old]), other()]});
  await sys.manager.update(ID);
  assert.equal(sys.read()[0].scripts[0].id, old.id);
  assert.deepEqual(sys.read()[0].scripts[0].data, old.data); assert.deepEqual(sys.read()[1], other());
});

test('relay tampering of either metadata or package is rejected by original GitHub digest before writing', async t => {
  for (const corrupted of [301,302]) {
    const sys = relaySetup(t, {reply(bytes, body, url) {const changed = new Uint8Array(bytes); if (body.assetId === corrupted) changed[0] ^= 1; return response(changed, url);}});
    await assert.rejects((async () => {const candidate = await sys.manager.inspect(REPO); await sys.manager.install(candidate);})(), code('hash'));
    assert.equal(sys.writes(), 0);
  }
});

test('relay failure, opaque response and redirect never downgrade verification or install', async t => {
  const replies = [
    () => {throw new TypeError('unreachable');},
    (bytes, body, url) => response(encode({error: 'not supported'}), url, 404),
    (bytes, body, url) => response(bytes, 'https://untrusted.invalid/file'),
    (bytes, body, url) => {const r = response(bytes, url); Object.defineProperty(r, 'type', {value: 'opaque'}); return r;},
  ];
  for (const reply of replies) {const sys = relaySetup(t, {reply}); await assert.rejects(sys.manager.inspect(REPO)); assert.equal(sys.writes(), 0);}
});

test('missing Registry gives actionable CORS setup message without guessing a proxy', async t => {
  const sys = relaySetup(t, {manager: {getRegistryBaseURL: () => ''}});
  await assert.rejects(sys.manager.inspect(REPO), error => error.code === 'download' && error.message.includes('Registry 连接设置') && error.message.includes('无需 Discord 登录'));
  assert.equal(sys.relayCalls.length, 0); assert.equal(sys.writes(), 0);
});

test('invalid Registry address is rejected without requests and mid-download address changes abort', async t => {
  for (const base of ['http://remote.example', 'https://user:password@registry.example', 'https://registry.example/arbitrary']) {
    const sys = relaySetup(t, {manager: {getRegistryBaseURL: () => base}});
    await assert.rejects(sys.manager.inspect(REPO)); assert.equal(sys.relayCalls.length, 0);
  }
  let base = RELAY;
  const sys = relaySetup(t, {manager: {getRegistryBaseURL: () => base}, reply(bytes, body, url) {base = 'https://other.example'; return response(bytes, url);}});
  await assert.rejects(sys.manager.inspect(REPO), code('cancelled')); assert.equal(sys.writes(), 0);
});

test('relay timeout and teardown cancel pending byte transfers with no late installation', async t => {
  const hung = relaySetup(t, {reply: () => new Promise(() => {}), manager: {metadataTimeoutMs: 10}});
  await assert.rejects(hung.manager.inspect(REPO), code('timeout')); assert.equal(hung.writes(), 0);
  let started;
  const begin = new Promise(resolve => {started = resolve;});
  const sys = relaySetup(t, {reply: () => {started(); return new Promise(() => {});}});
  const task = sys.manager.inspect(REPO); await begin; sys.manager.dispose();
  await assert.rejects(task, code('cancelled')); assert.equal(sys.writes(), 0); assert.equal(sys.relayCalls[0].init.signal.aborted, true);
});

test('direct successful downloads do not contact Registry and HTTP or digest failures are not rescued by relay', async t => {
  let reads = 0;
  const sys = setup(t, fixture(), {manager: {getRegistryBaseURL() {reads++; return RELAY;}}});
  await sys.manager.inspect(REPO); assert.equal(reads, 0);
  let rejected;
  rejected = setup(t, fixture(), {manager: {getRegistryBaseURL() {reads++; return RELAY;}}, fetch: async (url, init) => url.includes('/releases/assets/') ? response(encode('forbidden'), url, 403) : rejected.baseRequest(url, init)});
  await assert.rejects(rejected.manager.inspect(REPO), code('http')); assert.equal(reads, 0); assert.equal(rejected.writes(), 0);
});


test('install, uninstall, reinstall reuses only digest-locked bytes and never downloads an uninstall backup', async t => {
  const sys = relaySetup(t); const candidate = await sys.manager.inspect(REPO);
  await sys.manager.install(candidate); const first = sys.relayCalls.length; assert.equal(first, 2);
  await sys.manager.uninstall(ID); assert.equal(sys.backups.length, 0);
  await sys.manager.install(await sys.manager.inspect(REPO));
  assert.equal(sys.relayCalls.length, first); assert.equal(sys.writes(), 3);
  assert.equal((await sys.manager.listInstalled()).length, 1);
});

test('cached bytes expire and fresh authoritative Release changes are still rejected', async t => {
  let time = 0;
  const sys = relaySetup(t, {manager: {now: () => time}});
  const candidate = await sys.manager.inspect(REPO); await sys.manager.inspect(REPO); assert.equal(sys.relayCalls.length, 1);
  time = 120001; await sys.manager.inspect(REPO); assert.equal(sys.relayCalls.length, 2);
  await assert.rejects(sys.manager.install({...candidate, metadataAsset: {...candidate.metadataAsset, sha256: '0'.repeat(64)}}), code('release-changed'));
  assert.equal(sys.writes(), 0);
});

test('Registry GitHub quota errors show retry time and cooldown avoids repeat relay traffic', async t => {
  let time = Date.now(); const until = time + 90000;
  const sys = relaySetup(t, {manager: {now: () => time}, reply: (bytes, body, url) => response(encode({error: {code: 'github_rate_limited', message: 'DO NOT expose upstream private details', retryAt: new Date(until).toISOString()}}), url, 429)});
  await assert.rejects(sys.manager.inspect(REPO), e => e.code === 'github_rate_limited' && e.message.includes('额度') && !e.message.includes('private'));
  await assert.rejects(sys.manager.inspect(REPO), code('github_rate_limited')); assert.equal(sys.relayCalls.length, 1);
  time = until + 1; await assert.rejects(sys.manager.inspect(REPO)); assert.equal(sys.relayCalls.length, 2); assert.equal(sys.writes(), 0);
});

test('Registry upstream failure is distinguished from Origin or service-version misconfiguration', async t => {
  const sys = relaySetup(t, {reply: (bytes, body, url) => response(encode({error: {code: 'github_unavailable', message: 'private upstream information'}}), url, 502)});
  await assert.rejects(sys.manager.inspect(REPO), e => e.code === 'github_unavailable' && !e.message.includes('Origin') && !e.message.includes('private') && e.message.includes('作者 GitHub'));
  assert.equal(sys.writes(), 0);
});
