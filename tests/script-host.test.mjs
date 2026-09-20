import test from 'node:test';
import assert from 'node:assert/strict';
import {createHubScriptHost, parseHubBuildIdentity} from '../src/hub-script-host.js';

const packageId = 'e85cd9a3-6352-4b23-938a-6c94d826b4d3';
const identity = (version = '0.2.1', extra = {}) => ({schemaVersion: 1, productId: 'miemie.hub', version, scriptId: packageId, ...extra});
const content = (version = '0.2.1', extra) => '// MieMie-Hub-Build: ' + JSON.stringify(identity(version, extra)) + '\n(() => {})();';
const script = (extra = {}) => ({type: 'script', enabled: true, name: '用户改名的 Hub', id: 'installed-runtime-id',
  content: content(), info: '用户说明', button: {enabled: true, buttons: [{name: '自定义按钮', visible: false}]},
  data: {custom: {nested: [1, true, null, '用户数据']}, productId: 'unrelated-user-value'},
  export_with: {data: false, button: true}, ...extra});
const sibling = (extra = {}) => script({id: 'other-script', name: '其他扩展', content: 'void 0;', ...extra});
const folder = scripts => ({type: 'folder', enabled: true, name: '我的文件夹', id: 'folder-id', icon: 'fa-folder', color: '#ffffff', scripts});
function setup(trees = [script()], extra = {}) {
  let currentTrees = structuredClone(trees);
  let id = 'installed-runtime-id';
  const calls = [];
  const host = createHubScriptHost({currentVersion: '0.2.1',
    getScriptId: () => id,
    getScriptTrees: options => {calls.push(['get', options]); return structuredClone(currentTrees);},
    updateScriptTreesWith: (updater, options) => {
      calls.push(['update', options]);
      const result = updater(structuredClone(currentTrees));
      assert.equal(typeof result?.then, 'undefined', 'updater must remain synchronous');
      currentTrees = result;
      return structuredClone(currentTrees);
    }, ...extra});
  return {host, calls, read: () => structuredClone(currentTrees), edit: fn => fn(currentTrees), setId: value => {id = value;}};
}
const throwsCode = (fn, code) => assert.throws(fn, error => error instanceof Error && error.code === code);

test('build identity is an inert strict first-line marker with a three-component version', () => {
  assert.deepEqual(parseHubBuildIdentity(content()), identity());
  assert.deepEqual(parseHubBuildIdentity(content('12.34.56')), identity('12.34.56'));
  for (const invalid of [null, '', 'void 0;', content().replace('\n', ''), '\n' + content(),
    content('0.2.1-alpha.1'), content('1.0.1-hub.2'), content('v0.2.1'), content('01.2.3'), content('0.2.1+build'),
    ...['\n', '\r', '\u2028', '\u2029'].map(suffix => content('0.2.1' + suffix)),
    content('0.2.1', {schemaVersion: 2}), content('0.2.1', {productId: 'other'}),
    content('0.2.1', {scriptId: 'installed-runtime-id'}), content('0.2.1', {unexpected: true}),
    '// MieMie-Hub-Build: {}\nvoid 0;', '// MieMie-Hub-Build: {bad json}\nvoid 0;',
    '// MieMie-Hub-Build: ' + JSON.stringify(identity()) + '\n   ']) {
    assert.equal(parseHubBuildIdentity(invalid), null, String(invalid));
  }
  // Code after the marker is inspected only as text, never evaluated.
  assert.deepEqual(parseHubBuildIdentity(content() + '\nthrow new Error("must never execute");'), identity());
});

test('factory and ordinary Hub startup do not need any host write API', () => {
  const host = createHubScriptHost({currentVersion: '0.2.1'});
  throwsCode(() => host.snapshot(), 'HOST_UNAVAILABLE');
  throwsCode(() => host.install({}, content('0.2.2')), 'HOST_UNAVAILABLE');
  const readOnly = setup(undefined, {updateScriptTreesWith: undefined});
  const snapshot = readOnly.host.snapshot();
  assert.equal(snapshot.id, 'installed-runtime-id');
  throwsCode(() => readOnly.host.install(snapshot, content('0.2.2')), 'HOST_UNAVAILABLE');
});

test('uses the actual runtime ID, allows a user name, and returns an isolated recovery snapshot', () => {
  const {host, calls, read} = setup([sibling(), script()]);
  const snapshot = host.snapshot();
  assert.equal(snapshot.id, 'installed-runtime-id');
  assert.notEqual(snapshot.id, packageId);
  assert.equal(snapshot.scope, 'global');
  assert.equal(snapshot.script.name, '用户改名的 Hub');
  snapshot.script.data.custom.nested.push('only backup changed');
  assert.equal(read()[1].data.custom.nested.length, 4);
  assert.deepEqual(calls, [['get', {type: 'global'}]]);
});

test('finds the installed Hub inside a global folder and preserves complete tree and current metadata', () => {
  const tree = [sibling({id: 'first'}), folder([sibling({id: 'folder-sibling'}), script()]), sibling({id: 'last'})];
  const {host, read, edit, calls} = setup(tree);
  const snapshot = host.snapshot();
  edit(trees => {
    trees[1].scripts[1].name = '更新下载期间改名';
    trees[1].scripts[1].data.extra = {newest: true};
    trees[1].scripts[1].info = '最新说明';
    trees[2].data.savedMeanwhile = true;
  });
  const expected = read();
  expected[1].scripts[1].content = content('0.2.2');
  const installed = host.install(snapshot, content('0.2.2'));
  assert.deepEqual(read(), expected);
  assert.deepEqual(installed.script, expected[1].scripts[1]);
  assert.equal(installed.scope, 'global');
  assert.equal(installed.id, snapshot.id);
  assert.deepEqual(calls, [['get', {type: 'global'}], ['update', {type: 'global'}]]);
});

test('missing global match refuses even if another Hub has the official exported package UUID', () => {
  const {host} = setup([script({id: packageId})]);
  throwsCode(() => host.snapshot(), 'HOST_NOT_GLOBAL');
  assert.throws(() => host.snapshot(), /角色或预设/);
});

test('non-global host cannot be located by a matching display name', () => {
  const {host} = setup([sibling({name: '用户改名的 Hub'})]);
  throwsCode(() => host.snapshot(), 'HOST_NOT_GLOBAL');
});

test('duplicate IDs and multiple Hub candidates are refused, including disabled legacy copies', () => {
  for (const trees of [[script(), script()], [script(), folder([script()])],
    [script(), script({id: 'copy', enabled: false})],
    [script(), sibling({content: '// 咩咩Hub 0.2.0-alpha.4 · legacy\nvoid 0;'})],
    [script(), sibling({id: packageId})],
    [script(), sibling({content: '// MieMie-Hub-Build: {invalid}\nvoid 0;'})],
    [script(), sibling({id: 'folder-id'}), folder([])]]) {
    throwsCode(() => setup(trees).host.snapshot(), 'HOST_AMBIGUOUS');
  }
});

test('rejects script identity/version mismatch and unavailable runtime identity', () => {
  for (const value of ['void 0;', content('0.2.2'), '// 咩咩Hub 0.2.0-alpha.4\nvoid 0;']) {
    throwsCode(() => setup([script({content: value})]).host.snapshot(), 'HOST_IDENTITY');
  }
  for (const getScriptId of [() => '', () => undefined, () => {throw Error('not a script');}]) {
    throwsCode(() => setup(undefined, {getScriptId}).host.snapshot(), 'HOST_IDENTITY');
  }
  throwsCode(() => setup(undefined, {currentVersion: '0.2.0-alpha.4'}).host.snapshot(), 'HOST_IDENTITY');
});

test('rejects fields the host schema would drop anywhere in the complete tree', () => {
  const cases = [
    trees => {trees[0].futureField = true;},
    trees => {trees[0].button.extra = 'drop';},
    trees => {trees[0].button.buttons[0].extra = 'drop';},
    trees => {trees[0].export_with.extra = true;},
    trees => {trees.push(sibling({unknown: 1}));},
    trees => {trees.push({...folder([]), unknown: true});},
    trees => {trees.push(folder([sibling({unknown: true})]));},
    trees => {trees.push(folder([folder([])]));},
    trees => {delete trees[0].info;},
    trees => {trees[0].enabled = 'true';},
    trees => {trees[0].button.buttons[0].visible = 'false';},
    trees => {trees[0].data = [];},
    trees => {trees[0].data = null;},
    trees => {trees[0].id = '';},
    trees => {trees.push(null);},
  ];
  for (const modify of cases) {
    const trees = [script()]; modify(trees);
    throwsCode(() => setup(trees).host.snapshot(), 'HOST_SCHEMA');
  }
});

test('arbitrary data keys are preserved instead of applying downloaded defaults', () => {
  const data = JSON.parse('{"__proto__":{"safe":"own JSON key"},"constructor":{"value":3},"custom":[null,{"any":"key"}]}');
  const {host, read} = setup([script({data})]);
  host.install(host.snapshot(), content('0.2.2'));
  assert.deepEqual(read()[0].data, data);
  assert.equal(Object.prototype.safe, undefined);
});

test('rechecks original content and scope immediately before write and never overwrites concurrent edits', () => {
  const {host, edit, read} = setup();
  const snapshot = host.snapshot();
  edit(trees => {trees[0].content += '\n// local edit';});
  const before = read();
  throwsCode(() => host.install(snapshot, content('0.2.2')), 'HOST_CHANGED');
  assert.deepEqual(read(), before);
  edit(trees => {trees.length = 0;});
  throwsCode(() => host.install(snapshot, content('0.2.2')), 'HOST_NOT_GLOBAL');
});

test('rechecks full tree structure and new candidates at installation time', () => {
  for (const [modify, code] of [
    [trees => {trees.push(sibling({unknown: true}));}, 'HOST_SCHEMA'],
    [trees => {trees.push(script({id: 'new-copy'}));}, 'HOST_AMBIGUOUS'],
  ]) {
    const {host, edit, read} = setup();
    const snapshot = host.snapshot(); edit(modify); const before = read();
    throwsCode(() => host.install(snapshot, content('0.2.2')), code);
    assert.deepEqual(read(), before);
  }
});

test('rechecks iframe identity and refuses invalid snapshots or target content before calling updater', () => {
  const {host, setId, calls} = setup();
  const snapshot = host.snapshot();
  for (const invalid of [null, {...snapshot, scope: 'character'}, {...snapshot, id: 'other'}]) {
    throwsCode(() => host.install(invalid, content('0.2.2')), 'HOST_CHANGED');
  }
  for (const invalid of [null, 'void 0;', content('0.2.2', {productId: 'other'}), content('0.2.2', {scriptId: 'wrong'})]) {
    throwsCode(() => host.install(snapshot, invalid), 'HOST_IDENTITY');
  }
  setId('new-iframe');
  throwsCode(() => host.install(snapshot, content('0.2.2')), 'HOST_CHANGED');
  assert.equal(calls.filter(call => call[0] === 'update').length, 0);
});

test('runtime identity changing inside the host update is refused before mutation', () => {
  let reads = 0;
  const {host, read} = setup(undefined, {getScriptId: () => ++reads < 3 ? 'installed-runtime-id' : 'changed'});
  const snapshot = host.snapshot();
  throwsCode(() => host.install(snapshot, content('0.2.2')), 'HOST_CHANGED');
  assert.equal(read()[0].content, content());
});

test('host read and write failures surface without exposing underlying payloads', () => {
  const readHost = setup(undefined, {getScriptTrees() {throw Error('private host details');}}).host;
  throwsCode(() => readHost.snapshot(), 'HOST_READ');
  const {host} = setup(undefined, {updateScriptTreesWith() {throw Error('private host details');}});
  const snapshot = host.snapshot();
  assert.throws(() => host.install(snapshot, content('0.2.2')), error => error.code === 'HOST_WRITE' && !error.message.includes('private'));
});

test('unsupported async host callbacks are fenced off and cannot perform a delayed write', async () => {
  let writeAttempted = false;
  const {host} = setup(undefined, {updateScriptTreesWith: async updater => {
    await Promise.resolve();
    const result = updater([script()]);
    writeAttempted = true;
    return result;
  }});
  throwsCode(() => host.install(host.snapshot(), content('0.2.2')), 'HOST_ASYNC');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writeAttempted, false);
});

test('unsupported asynchronous host reads are rejected without unhandled rejections', async () => {
  const {host} = setup(undefined, {getScriptTrees: async () => {throw new Error('async read');}});
  throwsCode(() => host.snapshot(), 'HOST_ASYNC');
  await new Promise(resolve => setImmediate(resolve));
});

test('host callbacks must execute exactly once synchronously and return the installed tree', () => {
  for (const [updateScriptTreesWith, code] of [
    [() => [], 'HOST_WRITE'],
    [updater => {updater([script()]); return [script()];}, 'HOST_IDENTITY'],
    [updater => {updater([script()]); updater([script()]); return [];}, 'HOST_ASYNC'],
  ]) {
    const {host} = setup(undefined, {updateScriptTreesWith});
    throwsCode(() => host.install(host.snapshot(), content('0.2.2')), code);
  }
});
