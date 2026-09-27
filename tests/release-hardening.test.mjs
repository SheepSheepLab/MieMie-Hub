import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createExtensionRuntime} from '../src/extension-runtime.js';
import {createShortcutLaunchers} from '../src/shortcut-launchers.js';

const manifest=id=>({id,name:id,version:'1.0.0',schemaVersion:1,apiVersion:1});
for(const phase of ['creation','disable'])test(`throwing deactivate getter during ${phase} cannot skip tracked cleanup`,async t=>{
  const runtime=createExtensionRuntime();t.after(()=>runtime.dispose());
  const cleaned=[];let broken=phase==='creation';
  runtime.register(manifest('audit.fault'),api=>{
    api.onCleanup(()=>cleaned.push('first'));api.onCleanup(()=>cleaned.push('second'));
    return {get deactivate(){if(broken)throw Error('getter fault');return ()=>{};}};
  });
  const result=await runtime.enable('audit.fault');
  if(phase==='disable'){assert.equal(result.ok,true);broken=true;await runtime.disable('audit.fault');}
  else assert.equal(result.ok,false);
  assert.deepEqual(cleaned,['second','first']);
  runtime.register(manifest('audit.healthy'),()=>({open(){}}));
  assert.equal((await runtime.enable('audit.healthy')).ok,true);
  assert.equal((await runtime.open('audit.healthy')).ok,true);
  await runtime.uninstall('audit.fault');assert.deepEqual(cleaned,['second','first']);
});

for(const value of ['{','null','[]','42','{"audit.orb":"true"}'])test(`malformed or old shortcut preference safely defaults off: ${value}`,t=>{
  const dom=new JSDOM('<body>',{url:'https://fixture.invalid'});t.after(()=>dom.window.close());
  dom.window.localStorage.setItem('miemie_hub_shortcuts_v1',value);
  const manager=createShortcutLaunchers({host:dom.window,runtime:{get:()=>({enabled:true,launcherAvailable:true})},launch:()=>true});
  assert.equal(manager.enabled('audit.orb'),false);manager.sync();manager.dispose();
});

for(const mode of ['unavailable','quota-limited'])test(`${mode} shortcut storage cannot mount or claim ON`,t=>{
  const dom=new JSDOM('<body>',{url:'https://fixture.invalid'});t.after(()=>dom.window.close());
  if(mode==='unavailable')Object.defineProperty(dom.window,'localStorage',{get(){throw Error('storage denied');}});
  else dom.window.Storage.prototype.setItem=function(){throw Error('storage quota exceeded');};
  let mounts=0;const manager=createShortcutLaunchers({host:dom.window,runtime:{get:()=>({enabled:true,launcherAvailable:true})},launch:()=>true});
  manager.register('audit.orb',()=>{mounts++;});
  assert.throws(()=>manager.set('audit.orb',true),/storage (denied|quota exceeded)/);
  assert.equal(manager.enabled('audit.orb'),false);assert.equal(mounts,0);manager.dispose();
});
