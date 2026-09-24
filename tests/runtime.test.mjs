import test from 'node:test';
import assert from 'node:assert/strict';
import {createExtensionRuntime} from '../src/extension-runtime.js';
import {createRuntimeFixture} from './fixtures/runtime-extension.js';

const {manifest: sample, factory: sampleFactory} = createRuntimeFixture();
const manifest = (id, launcher = true) => ({schemaVersion: 1, apiVersion: 1, id, name: id, version: '0.1.0', ...(launcher ? {contributes: {launcher: {title: id}}} : {})});
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));

test('Runtime fixture: register, enable, open, disable, re-enable and uninstall', async () => {
  const {manifest: sample, factory: sampleFactory, events} = createRuntimeFixture();
  const messages = [], closed = [];
  const runtime = createExtensionRuntime({onMessage: (...args) => messages.push(args), onClose: id => closed.push(id)});
  assert.equal(runtime.register(sample, sampleFactory).ok, true);
  assert.equal(runtime.get(sample.id).state, 'disabled');
  assert.equal((await runtime.open(sample.id)).ok, false);
  assert.equal((await runtime.enable(sample.id)).ok, true);
  assert.equal(runtime.get(sample.id).launcherAvailable, true);
  assert.equal(runtime.get(sample.id).launcherError, '');
  assert.equal((await runtime.open(sample.id)).ok, true);
  assert.deepEqual(messages[0], [sample.id, 'Runtime fixture', 'Fixture message']);
  await runtime.disable(sample.id);
  assert.equal(runtime.get(sample.id).enabled, false);
  assert.equal(runtime.get(sample.id).launcherAvailable, false);
  assert.equal((await runtime.open(sample.id)).ok, false);
  await runtime.enable(sample.id); await runtime.open(sample.id);
  assert.equal(messages.length, 2);
  await runtime.uninstall(sample.id);
  assert.equal(runtime.get(sample.id), null);
  assert.equal(closed.length, 2);
  assert.deepEqual(events, ['factory','activate','open','deactivate','cleanup','factory','activate','open','deactivate','cleanup']);
  assert.equal((await runtime.enable(sample.id)).ok, false);
  assert.equal(runtime.register(sample, sampleFactory).ok, true);
  await runtime.dispose();
});

test('duplicate registration and invalid manifests do not replace a working instance', async () => {
  const runtime = createExtensionRuntime();
  runtime.register(sample, sampleFactory); await runtime.enable(sample.id);
  assert.equal(runtime.register(sample, () => {throw Error('should not execute');}).ok, false);
  assert.equal(runtime.register({...sample, id: '__proto__'}, sampleFactory).ok, false);
  assert.equal(runtime.register({...sample, id: 'test.future', apiVersion: 2}, sampleFactory).ok, false);
  const snapshot = runtime.get(sample.id); snapshot.manifest.name = 'mutated';
  assert.equal(runtime.get(sample.id).manifest.name, 'Runtime fixture');
  assert.equal(runtime.get(sample.id).enabled, true);
  await runtime.dispose();
});

test('background extension works without a launcher or open()', async () => {
  let starts = 0, stops = 0, cleanups = 0;
  const runtime = createExtensionRuntime();
  assert.equal(runtime.register(manifest('test.background', false), api => {
    api.onCleanup(() => cleanups++);
    return {activate() {starts++;}, deactivate() {stops++;}};
  }).ok, true);
  assert.equal((await runtime.enable('test.background')).ok, true);
  assert.equal(starts, 1);
  assert.equal(runtime.get('test.background').manifest.contributes, undefined);
  assert.equal((await runtime.open('test.background')).ok, false);
  assert.equal(runtime.get('test.background').enabled, true);
  assert.equal(runtime.get('test.background').launcherAvailable, false);
  assert.equal(runtime.get('test.background').launcherError, '');
  await runtime.disable('test.background'); assert.equal(stops, 1); assert.equal(cleanups, 1);
  assert.equal((await runtime.enable('test.background')).ok, true); assert.equal(starts, 2);
  await runtime.uninstall('test.background'); assert.equal(stops, 2); assert.equal(cleanups, 2);
  assert.equal(runtime.get('test.background'), null);
});

test('declared launcher without callable open warns but preserves activation and lifecycle', async () => {
  for (const value of [undefined, null, 'invalid']) {
    const runtime = createExtensionRuntime(); let starts = 0, stops = 0, cleaned = 0, signal;
    runtime.register(manifest('test.noopen'), api => {
      signal = api.signal; api.onCleanup(() => cleaned++);
      return {activate() {starts++;}, deactivate() {stops++;}, ...(value === undefined ? {} : {open: value})};
    });
    assert.equal((await runtime.enable('test.noopen')).ok, true);
    const item = runtime.get('test.noopen');
    assert.equal(starts, 1); assert.equal(item.enabled, true); assert.equal(signal.aborted, false);
    assert.equal(item.error, ''); assert.equal(item.launcherAvailable, false);
    assert.match(item.launcherError, /Launcher 不可用.*open\(\)/);
    assert.equal((await runtime.open('test.noopen')).ok, false);
    assert.equal(runtime.get('test.noopen').enabled, true); assert.equal(stops, 0); assert.equal(cleaned, 0);
    await runtime.disable('test.noopen'); assert.equal(stops, 1); assert.equal(cleaned, 1);
    await runtime.enable('test.noopen'); await runtime.uninstall('test.noopen');
    assert.equal(starts, 2); assert.equal(stops, 2); assert.equal(cleaned, 2);
  }
});

for (const mode of ['sync', 'async', 'timeout']) {
  test(`${mode} open failure preserves background resources and permits a successful retry`, async () => {
    const runtime = createExtensionRuntime({timeoutMs: 40});
    const target = new EventTarget(); let hits = 0, stops = 0, cleaned = 0, opened = 0, signal;
    runtime.register(manifest('test.openfault'), api => {
      signal = api.signal;
      const listener = api.guard(() => hits++);
      api.onCleanup(() => {cleaned++; target.removeEventListener('ping', listener);});
      return {
        activate() {target.addEventListener('ping', listener);},
        open() {
          if (++opened > 1) return api.showMessage('recovered');
          if (mode === 'async') return Promise.reject(Error('open fault'));
          if (mode === 'timeout') return new Promise(() => {});
          throw Error('open fault');
        },
        deactivate() {stops++;},
      };
    });
    await runtime.enable('test.openfault');
    const result = await runtime.open('test.openfault');
    assert.equal(result.ok, false); assert.match(result.error, /扩展界面打开失败/);
    const item = runtime.get('test.openfault');
    assert.equal(item.state, 'enabled'); assert.equal(item.enabled, true); assert.equal(signal.aborted, false);
    assert.equal(item.error, ''); assert.equal(item.launcherAvailable, true); assert.match(item.launcherError, /扩展界面打开失败/);
    assert.equal(stops, 0); assert.equal(cleaned, 0);
    target.dispatchEvent(new Event('ping')); await nextTask(); assert.equal(hits, 1);
    assert.equal((await runtime.open('test.openfault')).ok, true);
    assert.equal(runtime.get('test.openfault').launcherError, '');
    await runtime.uninstall('test.openfault'); assert.equal(stops, 1); assert.equal(cleaned, 1);
    target.dispatchEvent(new Event('ping')); await nextTask(); assert.equal(hits, 1);
  });
}

for (const phase of ['factory', 'activate', 'deactivate', 'cleanup']) {
  test(`${phase} failure is contained and all tracked resources are cleaned`, async () => {
    const runtime = createExtensionRuntime();
    const events = [];
    runtime.register(sample, sampleFactory); await runtime.enable(sample.id);
    runtime.register(manifest('test.fault'), api => {
      api.onCleanup(() => events.push('cleanup-first'));
      api.onCleanup(() => {events.push('cleanup-second'); if (phase === 'cleanup') throw Error('cleanup fault');});
      if (phase === 'factory') throw Error('factory fault');
      return {
        activate() {if (phase === 'activate') return Promise.reject(Error('activate fault'));},
        open() {},
        deactivate() {events.push('deactivate'); if (phase === 'deactivate') throw Error('deactivate fault');},
      };
    });
    const enabled = await runtime.enable('test.fault');
    if (phase === 'factory' || phase === 'activate') assert.equal(enabled.ok, false);
    else {
      assert.equal(enabled.ok, true);
      await runtime.disable('test.fault');
    }
    assert.ok(runtime.get('test.fault').error.includes('fault'));
    assert.deepEqual(events.slice(-2), ['cleanup-second', 'cleanup-first']);
    assert.equal(runtime.get(sample.id).enabled, true);
    assert.equal((await runtime.open(sample.id)).ok, true);
    await runtime.uninstall('test.fault');
    assert.equal(runtime.get('test.fault'), null);
    assert.equal(events.filter(x => x === 'cleanup-first').length, 1);
    await runtime.dispose();
  });
}

test('disable cancels in-progress activation and late work cannot reopen a panel', async () => {
  let finish, started, api, cleaned = 0;
  const messages = [];
  const began = new Promise(resolve => {started = resolve;});
  const runtime = createExtensionRuntime({onMessage: (...args) => messages.push(args)});
  runtime.register(manifest('test.slow'), context => {
    api = context;
    context.onCleanup(() => cleaned++);
    return {activate() {started(); return new Promise(resolve => {finish = resolve;});}, open() {context.showMessage('late');}};
  });
  const enabling = runtime.enable('test.slow'); await began;
  const disabling = runtime.disable('test.slow');
  assert.equal(api.signal.aborted, true);
  assert.equal(api.showMessage('late'), false);
  finish(); await enabling; await disabling;
  assert.equal(runtime.get('test.slow').state, 'disabled'); assert.equal(cleaned, 1);
  assert.deepEqual(messages, []);
  let lateCleanup = 0; api.onCleanup(() => lateCleanup++); await nextTask();
  assert.equal(lateCleanup, 1);
  await runtime.dispose();
});

test('hanging lifecycle times out while another extension remains usable', async () => {
  const runtime = createExtensionRuntime({timeoutMs: 30}); let cleaned = 0;
  runtime.register(manifest('test.hang'), api => {api.onCleanup(() => cleaned++); return {activate: () => new Promise(() => {}), open() {}};});
  runtime.register(sample, sampleFactory);
  const hanging = runtime.enable('test.hang');
  assert.equal((await runtime.enable(sample.id)).ok, true);
  assert.equal((await runtime.open(sample.id)).ok, true);
  assert.equal((await hanging).ok, false);
  assert.equal(runtime.get('test.hang').state, 'error'); assert.equal(cleaned, 1);
  await runtime.dispose();
});

test('tracked event listener is released on disable, without duplicates on re-enable', async () => {
  const target = new EventTarget(); let hits = 0;
  const runtime = createExtensionRuntime();
  runtime.register(manifest('test.events', false), api => ({activate() {
    const listener = api.guard(() => {hits++;});
    target.addEventListener('ping', listener);
    api.onCleanup(() => target.removeEventListener('ping', listener));
  }}));
  for (let i = 1; i <= 3; i++) {
    await runtime.enable('test.events');
    target.dispatchEvent(new Event('ping')); await nextTask(); assert.equal(hits, i);
    await runtime.disable('test.events');
    target.dispatchEvent(new Event('ping')); await nextTask(); assert.equal(hits, i);
  }
  await runtime.dispose();
});

test('a directly guarded open uses launcher isolation instead of extension teardown', async () => {
  let cleaned = 0, signal;
  const runtime = createExtensionRuntime({timeoutMs: 200});
  runtime.register(manifest('test.guard'), api => {
    signal = api.signal;
    api.onCleanup(() => cleaned++);
    return {open: api.guard(async () => {throw Error('callback fault');})};
  });
  await runtime.enable('test.guard');
  assert.equal((await runtime.open('test.guard')).ok, false); await nextTask();
  assert.equal(runtime.get('test.guard').state, 'enabled'); assert.equal(signal.aborted, false);
  assert.match(runtime.get('test.guard').launcherError, /扩展界面打开失败.*callback fault/); assert.equal(cleaned, 0);
  await runtime.dispose();
  assert.equal(cleaned, 1);
});

test('a separate background callback fault during open retains extension-level cleanup', async () => {
  let failBackground, finishOpen, started, cleaned = 0;
  const began = new Promise(resolve => {started = resolve;});
  const runtime = createExtensionRuntime();
  runtime.register(manifest('test.backgroundfault'), api => {
    failBackground = api.guard(() => {throw Error('background fault');});
    api.onCleanup(() => cleaned++);
    return {open() {started(); return new Promise(resolve => {finishOpen = resolve;});}};
  });
  await runtime.enable('test.backgroundfault');
  const opening = runtime.open('test.backgroundfault'); await began;
  await failBackground(); finishOpen(); await opening; await nextTask();
  assert.equal(runtime.get('test.backgroundfault').state, 'error');
  assert.match(runtime.get('test.backgroundfault').error, /background fault/); assert.equal(cleaned, 1);
  await runtime.dispose();
});

test('rapid concurrent enable calls produce one active instance; teardown persists no uninstalls', async () => {
  let starts = 0, stops = 0; const changes = [];
  const runtime = createExtensionRuntime({onChange: event => changes.push(event.kind)});
  runtime.register(manifest('test.repeat'), () => ({activate() {starts++;}, open() {}, deactivate() {stops++;}}));
  await Promise.all([runtime.enable('test.repeat'), runtime.enable('test.repeat'), runtime.enable('test.repeat')]);
  assert.equal(starts, 1); assert.equal(runtime.get('test.repeat').enabled, true);
  await runtime.dispose(); assert.equal(stops, 1);
  assert.equal(changes.includes('uninstall'), false);
  assert.equal(runtime.register(sample, sampleFactory).ok, false);
});

test('custom panel is session-scoped and detached after activation failure or disable', async () => {
  let attached=0,detached=0,shown=0,api;
  const runtime=createExtensionRuntime({onPanel(){attached++;return()=>detached++;},onShowPanel(){shown++;return true;}});
  runtime.register(manifest('test.panel'),context=>{api=context;return {activate(){context.attachPanel({});},open(){return context.showPanel();}};});
  await runtime.enable('test.panel');await runtime.open('test.panel');
  assert.equal(attached,1);assert.equal(shown,1);await runtime.disable('test.panel');
  assert.equal(detached,1);assert.equal(api.showPanel(),false);assert.equal(api.attachPanel({}),false);
  await runtime.enable('test.panel');await runtime.uninstall('test.panel');assert.equal(detached,2);
  runtime.register(manifest('test.failpanel'),context=>({activate(){context.attachPanel({});throw Error('after attach');},open(){}}));
  assert.equal((await runtime.enable('test.failpanel')).ok,false);assert.equal(detached,3);
  await runtime.dispose();
});
