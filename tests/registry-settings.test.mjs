import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createRegistryDeveloperSettings} from '../src/registry-settings.js';
import {createRegistryClient} from '../src/registry-client.js';

function fixture(t) {
  const dom = new JSDOM('<main></main>', {url:'https://tavern.example'}), host = dom.window;
  const registry = createRegistryClient({defaultBaseURL:'https://official.example'});
  const body = host.document.querySelector('main');
  const settings = createRegistryDeveloperSettings({host, body, registry});
  t.after(() => {settings.dispose(); registry.dispose(); dom.window.close();});
  return {host, registry, body, settings, input:body.querySelector('input'), save:body.querySelector('button')};
}

test('advanced settings start collapsed, preserve local override key and restore official build default', t => {
  const f = fixture(t);
  assert.equal(f.body.querySelector('details').open,false);
  assert.equal(f.body.querySelector('summary').textContent,'高级 / 开发者选项');
  f.input.value='http://127.0.0.1:8787'; f.save.click();
  assert.equal(f.registry.getBase(),'http://127.0.0.1:8787');
  assert.equal(f.host.localStorage.getItem('miemie_registry_url_v1'),'http://127.0.0.1:8787');
  f.input.value=''; f.save.click();
  assert.equal(f.registry.getBase(),'https://official.example');
  assert.equal(f.host.localStorage.getItem('miemie_registry_url_v1'),null);
});

test('invalid override cannot replace current service or persistent preference', t => {
  const f=fixture(t); f.input.value='http://remote.example'; f.save.click();
  assert.equal(f.registry.getBase(),'https://official.example');
  assert.equal(f.host.localStorage.getItem('miemie_registry_url_v1'),null);
  assert.match(f.body.querySelector('[role="status"]').textContent,/HTTPS/);
});

test('settings teardown clears handlers; stale click cannot mutate the next Hub preferences', t => {
  const f=fixture(t), handler=f.save.onclick;
  f.settings.dispose();f.input.value='http://127.0.0.1:8787';handler();f.save.click();
  assert.equal(f.body.children.length,0);assert.equal(f.save.onclick,null);
  assert.equal(f.registry.getBase(),'https://official.example');
});
