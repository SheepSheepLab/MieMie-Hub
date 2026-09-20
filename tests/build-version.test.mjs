import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, copyFile, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';

const run = promisify(execFile);
const read = name => readFile(new URL('../' + name, import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('Hub build rejects suffixed, malformed and non-string versions before reading product assets', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'miemie-hub-version-'));
  try {
    await mkdir(path.join(project, 'tools'));
    await mkdir(path.join(project, 'packaging'));
    await copyFile(new URL('../tools/build.mjs', import.meta.url), path.join(project, 'tools/build.mjs'));
    await copyFile(new URL('../packaging/script-template.json', import.meta.url), path.join(project, 'packaging/script-template.json'));
    const invalid = ['0.2.1-alpha.1', '0.2.1-beta.1', '0.2.1-hub.1', '0.2.1-build.1', '0.2.1+build.1',
      '00.2.1', '0.02.1', '0.2.01', '0.2', '0.2.1.0', 'v0.2.1', ' 0.2.1', '0.2.1 ',
      '0.2.1\n', '0.2.1\r', '0.2.1\r\n', '0.2.1\u2028', '0.2.1\u2029', 1, null, ['0.2.1']];
    for (const version of invalid) {
      await writeFile(path.join(project, 'package.json'), JSON.stringify({version}));
      await assert.rejects(run(process.execPath, [path.join(project, 'tools/build.mjs')]), error => {
        assert.match(error.stderr, /MieMie 官方版本必须使用纯 MAJOR\.MINOR\.PATCH/);
        assert.doesNotMatch(error.stderr, /ENOENT/);
        return true;
      }, JSON.stringify(version));
    }
  } finally {
    await rm(project, {recursive: true, force: true});
  }
});

test('Hub ASCII distribution bytes, update metadata and embedded identity agree with the package version', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const assetName = 'MieMie-Hub-' + pkg.version + '.json';
  const artifactBytes = await read('build/' + assetName);
  assert.deepEqual(artifactBytes, await read('build/咩咩Hub-' + pkg.version + '.json'));
  const script = JSON.parse(artifactBytes);
  const metadata = JSON.parse(await read('build/MieMie-Hub-update.json'));
  const scriptId = 'e85cd9a3-6352-4b23-938a-6c94d826b4d3';
  assert.equal(script.type, 'script');
  assert.equal(script.id, scriptId);
  assert.equal(script.name, '咩咩Hub ' + pkg.version);
  assert.deepEqual(Buffer.from(script.content, 'utf8'), await read('build/miemie-hub.js'));
  assert.deepEqual(metadata, {
    schemaVersion: 1, productId: 'miemie.hub', version: pkg.version, tag: 'v' + pkg.version,
    format: 'tavern-helper-script', scriptId,
    asset: {name: assetName, size: artifactBytes.byteLength, sha256: sha256(artifactBytes)},
    contentSha256: sha256(Buffer.from(script.content, 'utf8')),
  });
  const firstLine = script.content.split('\n', 1)[0];
  const prefix = '// MieMie-Hub-Build: ';
  assert.ok(firstLine.startsWith(prefix));
  assert.deepEqual(JSON.parse(firstLine.slice(prefix.length)), {
    schemaVersion: 1, productId: 'miemie.hub', version: pkg.version, scriptId,
  });
  assert.ok(script.content.includes('const HUB_VERSION=' + JSON.stringify(pkg.version) + ';'));
});

test('Hub build embeds each official icon without changing any PNG bytes', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const script = JSON.parse(await read('build/MieMie-Hub-' + pkg.version + '.json'));
  const assetsLine = script.content.split('\n').find(line => line.startsWith('const HUB_ASSETS='));
  assert.ok(assetsLine?.endsWith(';'));
  const assets = JSON.parse(assetsLine.slice('const HUB_ASSETS='.length, -1));
  for (const [key, file] of [['home', 'hub'], ['timeline', 'timeline']]) {
    assert.ok(assets.icons[key].startsWith('data:image/png;base64,'));
    assert.deepEqual(Buffer.from(assets.icons[key].slice('data:image/png;base64,'.length), 'base64'), await read('assets/' + file + '.png'));
  }
});
