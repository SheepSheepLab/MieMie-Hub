import test from 'node:test';
import assert from 'node:assert/strict';
import {updatedScriptName, applyScriptUpdate} from '../src/script-update-fields.js';

test('shared name update preserves titles, replaces stale suffixes and is idempotent', () => {
  for (const [before, after] of [
    ['咩咩Hub 0.5.1', '咩咩Hub 1.1.3'],
    ['咩咩润色工具 Extension 1.1.2', '咩咩润色工具 Extension 1.1.3'],
    ['我的工具 - v1.1.2', '我的工具 - 1.1.3'],
    ['我的工具 · 1.1.2-alpha.1+test', '我的工具 · 1.1.3'],
    ['Custom title', 'Custom title 1.1.3'],
    ['Custom title  ', 'Custom title 1.1.3'],
    ['1.1.2', '1.1.3'],
    ['Tools 1.1.2 for writing', 'Tools 1.1.2 for writing 1.1.3'],
  ]) {
    assert.equal(updatedScriptName(before, '1.1.3'), after);
    assert.equal(updatedScriptName(after, '1.1.3'), after);
  }
  for (const version of ['1.1.3\n', 'v1.1.3', '1.1.3-alpha', '01.1.3']) assert.throws(() => updatedScriptName('Tool', version));
});

test('shared writer only changes content and the display version, never adds host fields', () => {
  const script = {id:'same-instance', name:'Custom 1.1.2', content:'old', info:'my info', enabled:false,
    data:{privateFixtureValue:[1,2]}, button:{enabled:true}, export_with:{data:false}};
  const before = structuredClone(script);
  assert.equal(applyScriptUpdate(script, 'verified bytes', '1.1.3'), 'Custom 1.1.3');
  assert.deepEqual(script, {...before, content:'verified bytes', name:'Custom 1.1.3'});
});
