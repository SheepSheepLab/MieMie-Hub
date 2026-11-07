import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, webcrypto} from 'node:crypto';
import {Script} from 'node:vm';
import {fixture} from './fixtures/built-hub.js';
import {createExtensionRuntime} from '../src/extension-runtime.js';
import {validateExtensionManifest, validateExtensionPackageMetadata, validateExtensionPackage} from '../src/extension-packages.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>readFile(resolve(root,name),'utf8');
const docs=['README.md','docs/EXTENSION-DEVELOPER-GUIDE.md','docs/EXTENSION-API.md','docs/EXTENSION-PACKAGE.md','docs/LAUNCHER-PROTOCOL.md','docs/CORE-ARCHITECTURE.md','docs/APPLICATION-PRESENTATION.md','docs/TESTING.md','docs/VERSIONING.md','docs/ECOSYSTEM.md','docs/PRODUCTION.md','docs/SELF-UPDATE.md','docs/ICON-GUIDELINE.md','docs/PRODUCT-IDENTITY.md','docs/RELEASE-0.9.0-DRAFT.md'];
const blocks=(text,lang)=>[...text.matchAll(new RegExp('```'+lang+'\\n([\\s\\S]*?)```','g'))].map(m=>m[1]);
const api=await read('docs/EXTENSION-API.md'),pack=await read('docs/EXTENSION-PACKAGE.md'),launcher=await read('docs/LAUNCHER-PROTOCOL.md');
const [surfaceCode,nativeCode]=blocks(api,'js');
const manifest=JSON.parse(blocks(api,'json')[0]);
const launched={...manifest,contributes:{launcher:{title:'打开示例',icon:'🐑'}}};
const tick=()=>new Promise(r=>setImmediate(r));
function slug(s){return s.toLowerCase().replace(/[`*_]/g,'').replace(/[^\p{L}\p{N}_\-\s]/gu,'').replace(/\s/g,'-');}
test('current documentation local links and heading anchors resolve',async()=>{
 for(const name of docs){const text=await read(name);for(const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)){
  const target=m[1];if(/^[a-z]+:/i.test(target))continue;
  const [path,anchor]=decodeURIComponent(target).split('#');const full=resolve(dirname(resolve(root,name)),path||name.split('/').at(-1));await access(full);
  if(anchor){const text=await readFile(full,'utf8'),heads=[...text.matchAll(/^#{1,6} (.+)$/gm)].map(m=>slug(m[1]));assert.ok(heads.includes(anchor),`${name}: ${target}`);}
 }}
});
test('current JavaScript documentation examples parse',async()=>{
 for(const name of docs)for(const code of blocks(await read(name),'js'))new Script(code.replace(/^export /gm,''),{filename:name});
});
test('documented Runtime and Package Manifest examples pass their own validators',async()=>{
 const rt=createExtensionRuntime();assert.equal(rt.register(manifest,()=>({})).ok,true);await rt.dispose();
 const pm=JSON.parse(blocks(pack,'json')[0]);assert.equal(validateExtensionManifest(pm,pm.repository).apiVersion,2);
 for(const apiVersion of [1,3]){const r=createExtensionRuntime();assert.equal(r.register({...manifest,apiVersion},()=>({})).code,'api-incompatible');await r.dispose();}
});
test('Package metadata placeholders reject; filled example validates actual bytes and content hash',async()=>{
 const [pm,meta]=blocks(pack,'json').map(JSON.parse);assert.throws(()=>validateExtensionPackageMetadata(meta,pm.repository));
 const identity=blocks(pack,'text')[0].trim();
 const script={type:'script',enabled:true,name:pm.name,id:meta.scriptId,content:identity+'\nvoid 0;',info:'',button:{enabled:false,buttons:[]},data:{},export_with:{data:false,button:false}};
 const bytes=Buffer.from(JSON.stringify(script)),hash=x=>createHash('sha256').update(x).digest('hex');
 const actual={...meta,manifest:pm,asset:{...meta.asset,size:bytes.length,sha256:hash(bytes)},contentSha256:hash(script.content)};
 assert.equal(validateExtensionPackageMetadata(actual,pm.repository,{tag_name:actual.tag,draft:false}).schemaVersion,1);
 assert.equal((await validateExtensionPackage(bytes,actual,webcrypto)).content,script.content);
 await assert.rejects(validateExtensionPackage(Buffer.concat([bytes,Buffer.from(' ')]),actual,webcrypto),e=>e.code==='hash');
});
test('documented Surface example opens, returns and cleans up in the actual built Hub',async t=>{
 const f=await fixture(t),hub=f.host.__MieMieHub;
 const factory=f.host.eval('('+surfaceCode.trim()+')'),source=hub.extensions.provide(launched,factory);assert.equal(source.ok,true);assert.equal((await source.ready).ok,true);
 assert.equal((await hub.extensions.open(launched.id)).ok,true);const button=f.doc.querySelector('[data-close]'),panel=button.parentElement;assert.equal(panel.hidden,false);
 await button.onclick();assert.equal(panel.hidden,true);assert.equal(await button.onclick(),false);
 await source.release();assert.equal(panel.isConnected,false);assert.equal(hub.extensions.get(launched.id),null);
});
test('documented Native example mounts only when opted in and shares its Surface panel',async t=>{
 const f=await fixture(t),hub=f.host.__MieMieHub,code=surfaceCode.replace('api.attachPanel(panel);','api.attachPanel(panel);\n'+nativeCode);
 const source=hub.extensions.provide(launched,f.host.eval('('+code.trim()+')'));assert.equal((await source.ready).ok,true);
 const orb=()=>[...f.doc.querySelectorAll('button')].find(b=>b.textContent==='打开我的工具');assert.equal(orb(),undefined);
 await f.launch('extension-center');await f.click('[data-center-tab="installed"]');
 const set=async v=>{const input=f.doc.querySelector('[data-shortcut="'+launched.id+'"]');assert.ok(input);input.checked=v;input.dispatchEvent(new f.host.Event('change'));await tick();};
 await set(true);assert.ok(orb());const panel=f.doc.querySelector('[data-close]').parentElement;orb().click();await tick();assert.equal(panel.hidden,false);
 orb().click();await tick();assert.equal(panel.hidden,true);assert.equal((await hub.extensions.open(launched.id)).ok,true);assert.equal(panel.hidden,false);
 await f.launch('extension-center');await f.click('[data-center-tab="installed"]');await set(false);assert.equal(orb(),undefined);assert.equal(hub.extensions.get(launched.id).enabled,true);
 await source.release();assert.equal(panel.isConnected,false);
});
test('documented source handoff rejects API1 before preparation and respects saved disabled state',async t=>{
 const f=await fixture(t),hub=f.host.__MieMieHub;let preparations=0;
 const attach=new Function('prepareHubHandoff','manifest','createExtension',blocks(launcher,'js')[0]+'\nreturn attach;')(()=>{preparations++;},manifest,()=>({}));
 await assert.rejects(attach({apiVersion:1}));assert.equal(preparations,0);
 const a=await attach(hub);assert.equal(hub.extensions.get(manifest.id).enabled,true);await hub.extensions.disable(manifest.id);await a.release();
 const b=await attach(hub);assert.equal(hub.extensions.get(manifest.id).enabled,false);await b.release();
});
