import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSemVer, compareSemVer, selectLatestRelease, createHubUpdateChecker, HUB_UPDATE_TIMEOUT_MS} from '../src/hub-update-check.js';

const release = (tag_name, extra = {}) => ({tag_name, draft: false, prerelease: true, ...extra});
const response = data => ({ok: true, status: 200, json: async () => data});
const settle = () => new Promise(resolve => setImmediate(resolve));
function setup(t, fetch, extra = {}) {
  const changes = [], calls = [];
  const checker = createHubUpdateChecker({currentVersion: '0.2.0-alpha.3',
    fetch: (...args) => {calls.push(args); return fetch(...args);}, onChange: state => changes.push(state), ...extra});
  t.after(() => checker.dispose());
  return {checker, changes, calls};
}

test('SemVer handles v prefixes and ignores build metadata precedence', () => {
  assert.equal(parseSemVer('v0.2.0-alpha.3+build.001').version, '0.2.0-alpha.3+build.001');
  assert.equal(compareSemVer('v0.2.0-alpha.3', '0.2.0-alpha.3'), 0);
  assert.equal(compareSemVer('1.0.0+aaa', '1.0.0+bbb'), 0);
  assert.equal(compareSemVer('1.0.0-alpha+one', '1.0.0-alpha+two'), 0);
});

test('SemVer rejects malformed tags and leading zeros without accepting surrounding whitespace', () => {
  for (const value of [null, 3, '', 'main', 'v1.2', 'V1.2.3', '01.2.3', '1.02.3', '1.2.03', '1.2.3-01',
    '1.2.3-alpha.01', '1.2.3-', '1.2.3+', '1.2.3-a..b', '1.2.3-α', '1.2.3+build..1', ' 1.2.3', '1.2.3\n']) {
    assert.equal(parseSemVer(value), null, String(value));
  }
  assert.ok(parseSemVer('1.2.3-alpha-01+001'));
});

test('SemVer sorts core and prerelease identifiers numerically with stable versions above prereleases', () => {
  const order = ['0.2.0-alpha.2', '0.2.0-alpha.3', '0.2.0-alpha.10', '0.2.0-beta.1', '0.2.0', '0.2.1', '0.2.10', '0.10.0', '1.0.0'];
  assert.deepEqual([...order].reverse().sort(compareSemVer), order);
  const standard = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
  for (let i = 1; i < standard.length; i++) {
    assert.equal(compareSemVer(standard[i - 1], standard[i]), -1);
    assert.equal(compareSemVer(standard[i], standard[i - 1]), 1);
  }
  assert.equal(compareSemVer('1.0.0-9', '1.0.0-A'), -1);
  assert.equal(compareSemVer('1.0.0-A', '1.0.0-a'), -1);
  assert.equal(compareSemVer('9007199254740992.0.0', '9007199254740993.0.0'), -1);
  assert.equal(compareSemVer('1.0.0-9007199254740992', '1.0.0-9007199254740993'), -1);
});

test('Release selection includes prereleases, ignores drafts and invalid tags, and does not trust list order', () => {
  const releases = [release('v0.2.0-alpha.2'), release('9.0.0', {draft: true}), null, {}, release('main'),
    release('v0.2.0-beta.1'), release('v0.2.0-alpha.3'), release('99.0.0', {draft: 'false'})];
  assert.equal(selectLatestRelease(releases).version, '0.2.0-beta.1');
  assert.equal(selectLatestRelease(releases.reverse()).version, '0.2.0-beta.1');
  assert.equal(selectLatestRelease([...releases, release('0.2.0', {prerelease: false})]).version, '0.2.0');
});

for (const [remote, status] of [['v0.2.0-alpha.3', 'current'], ['v0.2.0-alpha.4', 'available'], ['v0.2.0-alpha.2', 'ahead']]) {
  test('version check reports ' + status, async t => {
    const {checker, changes, calls} = setup(t, async () => response([release(remote)]));
    assert.deepEqual(checker.getState(), {status: 'unchecked', latestVersion: null, error: ''});
    assert.equal(calls.length, 0, 'no background or startup request');
    const result = await checker.check();
    assert.equal(result.status, status); assert.equal(result.latestVersion, remote.slice(1));
    assert.deepEqual(changes.map(x => x.status), ['checking', status]);
    assert.equal(calls[0][0], 'https://api.github.com/repos/SheepSheepLab/MieMie-Hub/releases?per_page=100&page=1');
    const {signal, ...options} = calls[0][1];
    assert.deepEqual(options, {method: 'GET', headers: {Accept: 'application/vnd.github+json'},
      credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors', redirect: 'error', cache: 'no-store'});
    assert.equal(signal.aborted, false);
  });
}

test('all pages participate in selection, using only locally constructed GitHub URLs', async t => {
  const first = Array.from({length: 100}, () => release('0.1.0', {assets_url: 'https://unexpected.invalid/', html_url: 'https://unexpected.invalid/'}));
  const pages = [first, [release('0.3.0-beta.1'), release('0.2.0')]];
  const {checker, calls} = setup(t, async () => response(pages.shift()));
  assert.equal((await checker.check()).latestVersion, '0.3.0-beta.1');
  assert.deepEqual(calls.map(x => x[0]), [1, 2].map(page => 'https://api.github.com/repos/SheepSheepLab/MieMie-Hub/releases?per_page=100&page=' + page));
  assert.equal(calls[0][1].signal, calls[1][1].signal);
});

const failures = [
  ['HTTP 403', async () => ({ok: false, status: 403, json() {throw Error('must not read error body');}}), /HTTP 403/],
  ['HTTP 500', async () => ({ok: false, status: 500, json() {throw Error('must not read error body');}}), /HTTP 500/],
  ['network rejection', async () => {throw TypeError('network');}, /网络/],
  ['non-Error rejection', async () => {throw null;}, /网络/],
  ['invalid response', async () => null, /格式异常/],
  ['invalid JSON', async () => ({ok: true, json: async () => {throw SyntaxError('JSON');}}), /格式异常/],
  ['non-array data', async () => response({message: 'oops'}), /格式异常/],
  ['empty releases', async () => response([]), /未找到有效/],
  ['only drafts or invalid tags', async () => response([null, release('main'), release('2.0.0', {draft: true})]), /未找到有效/],
  ['oversized page', async () => response(Array.from({length: 101}, () => release('1.0.0'))), /格式异常/],
];
for (const [name, fetch, message] of failures) {
  test('failed check stays retryable: ' + name, async t => {
    let failing = true;
    const {checker} = setup(t, (...args) => failing ? fetch(...args) : Promise.resolve(response([release('0.2.0-alpha.3')])));
    const result = await checker.check();
    assert.equal(result.status, 'failed'); assert.equal(result.latestVersion, null); assert.match(result.error, message);
    failing = false; assert.equal((await checker.check()).status, 'current');
  });
}

test('partial pagination and the page limit fail instead of claiming to be current', async t => {
  const full = Array.from({length: 100}, () => release('0.2.0-alpha.3'));
  let index = 0;
  const {checker} = setup(t, async () => ++index === 1 ? response(full) : {ok: false, status: 503, json() {}});
  assert.equal((await checker.check()).status, 'failed');
  const bounded = setup(t, async () => response(full));
  const result = await bounded.checker.check();
  assert.equal(result.status, 'failed'); assert.match(result.error, /列表过长/); assert.equal(bounded.calls.length, 10);
});

test('duplicate checks share one in-flight request and one completion', async t => {
  let finish;
  const {checker, calls, changes} = setup(t, () => new Promise(resolve => {finish = resolve;}));
  const first = checker.check();
  assert.equal(checker.check(), first); assert.equal(checker.check(), first);
  await settle(); assert.equal(calls.length, 1); assert.equal(checker.getState().status, 'checking');
  finish(response([release('0.2.0-alpha.3')])); await first;
  assert.deepEqual(changes.map(x => x.status), ['checking', 'current']);
});

for (const stage of ['fetch', 'json']) {
  test('15-second timeout cancels uncooperative ' + stage + ' and ignores late completion', async t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    let finish;
    const delayed = () => new Promise(resolve => {finish = resolve;});
    const {checker, calls, changes} = setup(t, stage === 'fetch' ? delayed : async () => ({ok: true, json: delayed}));
    const check = checker.check(); await settle();
    t.mock.timers.tick(HUB_UPDATE_TIMEOUT_MS - 1); assert.equal(checker.getState().status, 'checking');
    t.mock.timers.tick(1);
    const result = await check;
    assert.equal(result.status, 'failed'); assert.match(result.error, /超时/); assert.equal(calls[0][1].signal.aborted, true);
    finish(stage === 'fetch' ? response([release('9.0.0')]) : [release('9.0.0')]); await settle();
    assert.deepEqual(changes.map(x => x.status), ['checking', 'failed']);
  });
}

test('dispose aborts, settles pending checks, suppresses late pages and forbids new requests', async t => {
  let finish;
  const {checker, calls, changes} = setup(t, () => new Promise(resolve => {finish = resolve;}));
  const check = checker.check(); await settle();
  checker.dispose(); checker.dispose();
  assert.equal(calls[0][1].signal.aborted, true); assert.equal((await check).status, 'cancelled');
  finish(response(Array.from({length: 100}, () => release('9.0.0')))); await settle();
  assert.equal((await checker.check()).status, 'cancelled'); assert.equal(calls.length, 1);
  assert.deepEqual(changes.map(x => x.status), ['checking']);
});

test('retry wins over a timed-out result arriving later', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let finish, attempt = 0;
  const {checker} = setup(t, () => ++attempt === 1 ? new Promise(resolve => {finish = resolve;}) : response([release('0.2.0-alpha.3')]));
  const first = checker.check(); await settle(); t.mock.timers.tick(HUB_UPDATE_TIMEOUT_MS); await first;
  assert.equal((await checker.check()).status, 'current');
  finish(response([release('99.0.0')])); await settle();
  assert.equal(checker.getState().status, 'current');
});
