import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = fileURLToPath(new URL('../../', import.meta.url));
const flags = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const name = process.argv[i], value = process.argv[i + 1];
  if (!['--polisher', '--hub', '--lock'].includes(name) || !value || flags.has(name)) throw Error('参数应为 --polisher <JSON路径> [--hub <JSON路径>] [--lock <锁定文件路径>]');
  flags.set(name, path.resolve(value));
}
if (!flags.has('--polisher')) throw Error('请用 --polisher 指定已构建的独立 Extension JSON；本测试不会查找另一个仓库的源码或自动下载。');
const lock = JSON.parse(await readFile(flags.get('--lock') || new URL('./artifacts.lock.json', import.meta.url), 'utf8'));
assert.equal(lock.format, 1);
const artifacts = {}, verified = {};
for (const kind of ['hub', 'polisher']) {
  const expected = lock.artifacts[kind];
  const file = flags.get('--' + kind) || path.join(root, 'build', expected.filename);
  const bytes = await readFile(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256, expected.sha256, kind + ' SHA-256 不匹配；拒绝执行未锁定的产物。');
  const script = JSON.parse(bytes);
  assert.equal(script.type, 'script');
  assert.equal(script.id, expected.scriptId);
  assert.ok(script.name.endsWith(' ' + expected.version), kind + ' 版本不匹配');
  assert.equal(typeof script.content, 'string');
  artifacts[kind] = script;
  verified[kind] = {version: expected.version, sha256, file};
}

const errors = [], warnings = [], virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.stack || String(error)));
virtualConsole.on('warn', (...args) => warnings.push(args.map(String).join(' ')));
virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
// No HTTP server, browser, external resources, or real service calls. Only the
// hash-verified release scripts execute against this disposable simulated host.
const dom = new JSDOM('<!doctype html><html><body><button id="run-tests">Run</button><pre id="fixture-log"></pre><form id="send_form"><textarea id="send_textarea"></textarea><button id="send_but" type="submit">Send</button></form></body></html>', {
  url: 'https://host.invalid/', runScripts: 'outside-only', virtualConsole,
});
const host = dom.window;
Object.assign(host, {Response, Request, Headers, Blob, File});
host.URL.createObjectURL = URL.createObjectURL.bind(URL);
host.URL.revokeObjectURL = URL.revokeObjectURL.bind(URL);
host.__testLog = message => console.log(message);
host.__loadArtifact = kind => {
  assert.ok(artifacts[kind], 'Unknown artifact ' + kind);
  const frame = host.document.createElement('iframe');
  host.document.body.appendChild(frame);
  const scope = frame.contentWindow;
  Object.assign(scope, {Response, Request, Headers});
  scope.eval(`
    window.addEventListener('error', e => parent.__fixture.pageErrors.push(e.message));
    window.addEventListener('unhandledrejection', e => parent.__fixture.pageErrors.push(String(e.reason)));
    for (const name of ['getVariables','replaceVariables','getCharWorldbookNames','eventOn','setChatMessages','formatAsTavernRegexedString']) window[name] = (...args) => parent.__fixture[name](...args);
    const interval = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
    window.setInterval = (...args) => {const id = interval(...args); parent.__fixture.activeTimers.add(id); return id;};
    window.clearInterval = id => {parent.__fixture.activeTimers.delete(id); return clear(id);};
  `);
  scope.eval(artifacts[kind].content);
  return frame;
};
let result;
try {
  host.eval((await readFile(new URL('./host-fixture.js', import.meta.url), 'utf8')) + '\n' +
    (await readFile(new URL('./polisher-checks.js', import.meta.url), 'utf8')));
  result = await host.runTests();
  result = {...result, environment: 'Node.js + jsdom; simulated Tavern APIs, no rendering or real network', artifacts: verified, warnings, jsdomErrors: errors};
  if (errors.length) result.failed = Math.max(1, result.failed);
} finally {
  dom.window.close();
}
await mkdir(new URL('../../test-results/', import.meta.url), {recursive: true});
// test-results is at project root, kept out of version control.
const resultDir = new URL('../../test-results/', import.meta.url);
await writeFile(new URL('integration.json', resultDir), JSON.stringify(result, null, 2) + '\n');
assert.equal(result.failed, 0, result.error || errors.join('\n'));
console.log('PASS: ' + result.passed + ' artifact integration checks; versions and SHA-256 verified.');
