import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createExtensionRuntime} from './fixtures/runtime-host.js';
import {createSurfaceController} from '../src/surface-controller.js';
function nativeManager(host){return createSurfaceController({host,shell:{root:host.document.body},root:host.document.body,launcher:{},panels:new Set(),resolve:()=>({panel:host.document.createElement("section")}),place(){},onState(){},onError(){},runtime:{get:()=>({enabled:true,launcherAvailable:true})}});}

const manifest=id=>({id,name:id,version:'1.0.0',schemaVersion:1,apiVersion:2});
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
  const manager=nativeManager(dom.window);
  assert.equal(manager.entryEnabled('audit.orb'),false);manager.syncEntries();manager.dispose();
});

for(const mode of ['unavailable','quota-limited'])test(`${mode} shortcut storage cannot mount or claim ON`,t=>{
  const dom=new JSDOM('<body>',{url:'https://fixture.invalid'});t.after(()=>dom.window.close());
  if(mode==='unavailable')Object.defineProperty(dom.window,'localStorage',{get(){throw Error('storage denied');}});
  else dom.window.Storage.prototype.setItem=function(){throw Error('storage quota exceeded');};
  let mounts=0;const manager=nativeManager(dom.window);
  manager.registerNativeWindow('audit.orb',{mount(){mounts++;},open(){},release(){}});
  assert.throws(()=>manager.setEntry('audit.orb',true),/storage (denied|quota exceeded)/);
  assert.equal(manager.entryEnabled('audit.orb'),false);assert.equal(mounts,0);manager.dispose();
});
