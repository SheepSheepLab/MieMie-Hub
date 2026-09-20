import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const read = name => readFile(new URL('../' + name, import.meta.url), 'utf8');
const version = JSON.parse(await read('package.json')).version;
const built = JSON.parse(await read('build/咩咩Hub-' + version + '.json'));
const timeline = await read('src/timeline-builtin.js');

test('Core contains no Polisher business implementation, assets or settings', () => {
  for (const value of ['meeme_translation_v1', 'meeme_translation_key_v1', 'mountPolisherTool', 'requestMessages(', 'POLISHER_ASSETS']) {
    assert.equal(built.content.includes(value), false, value);
  }
});

test('timeline parsing, auto-generation handling and worldbook write guards are unchanged', async () => {
  assert.equal(timeline.slice(timeline.indexOf('  const context ='), timeline.indexOf('  // The Hub owns')),
    await read('tests/fixtures/toolbox-timeline-business.txt'));
});

test('Hub artifact preserves the original script identity and export metadata', async () => {
  const original = JSON.parse(await read('tests/fixtures/legacy-export-metadata.json'));
  for (const [key, value] of Object.entries(original)) assert.deepEqual(built[key], value, key);
  assert.equal(built.name, '咩咩Hub ' + version);
  assert.doesNotThrow(() => new vm.Script(built.content));
});

test('only the Shell owns the orb handlers and old position key', async () => {
  const root = await read('src/hub-root.js');
  assert.ok(root.includes("'meeme_timeline_dock_v1'"));
  assert.ok(root.includes('pointerdown: pointerDown'));
  assert.equal(timeline.includes('pointerDown'), false);
  assert.equal(timeline.includes('DOCK_KEY'), false);
  assert.equal(timeline.includes('root.remove()'), false);
});
