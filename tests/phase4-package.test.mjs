import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createExtensionRuntime, assertExtensionRuntimeCompatibility} from '../src/extension-runtime.js';
import {createExtensionPackageManager, validateExtensionManifest, validateExtensionPackageMetadata, parseExtensionBuildIdentity} from '../src/extension-packages.js';
import {packageFixture,packageRoutes,PACKAGE_REPO,PACKAGE_API,PACKAGE_PRODUCT} from './fixtures/package-v2.mjs';
const clone = value => structuredClone(value), errorCode = code => error => error.code === code;
function system(t,{installed=packageFixture('1.0.0',1),target=packageFixture('2.0.0'),manager:options={},editFetch,editWrite}={}) {
 let tree=installed?[{...clone(installed.script),id:'user-instance',name:'用户自定义名字',data:{draft:'保留'}}]:[],writes=0;
 const routes=packageRoutes([...(installed?[installed]:[]),target]), requests=[],backups=[];
 const find=(id)=>tree.flatMap(x=>x.type==='folder'?x.scripts:[x]).find(x=>x.id===id);
 const manager=createExtensionPackageManager({getScriptTrees:()=>clone(tree),updateScriptTreesWith(fn){editWrite?.(tree);tree=fn(clone(tree));writes++;return clone(tree);},
 readSavedScript:async id=>clone(find(id)||null),randomUUID:()=> 'new-instance',crypto:webcrypto,persistenceTimeoutMs:100,confirmationIntervalMs:2,
 backup:async value=>backups.push(value),fetch:async(url,init)=>{requests.push(url);let value=routes[url];if(editFetch)value=await editFetch(url,value,routes);if(value===undefined)throw Error('No fixture route '+url);const r=new Response(typeof value==='string'?value:JSON.stringify(value));Object.defineProperty(r,'url',{value:url});return r;},...options});
 t.after(()=>manager.dispose()); return {manager,tree:()=>clone(tree),set: value=>{tree=clone(value);},writes:()=>writes,requests,backups,routes};
}
for (const api of [1,2,3,99]) test('matrix: schema1 API '+api+' machine declaration is independent of Runtime2',()=>{
 const f=packageFixture('1.0.0',api);assert.equal(validateExtensionPackageMetadata(f.metadata,PACKAGE_REPO,f.release).schemaVersion,1);
 const runtime=createExtensionRuntime();const result=runtime.register(f.manifest,()=>({}));assert.equal(result.ok,api===2);void runtime.dispose();
 if(api!==2)assert.throws(()=>assertExtensionRuntimeCompatibility(f.manifest),errorCode('api-incompatible'));
});
for(const patch of [{schemaVersion:2},{apiVersion:undefined},{apiVersion:'2'},{apiVersion:0},{apiVersion:2.5},{hubApi:null},{hubApi:[]},{hubApi:{min:3,max:2}},{hubApi:{min:'2',max:2}},{hubApi:{min:1,max:1}},{version:'01.0.0'},{version:'1.0.0\n'},{version:'1.0.0-01'},{version:'1.0.0-a..b'}])test('malformed manifest rejected by Runtime and Package: '+JSON.stringify(patch),()=>{
 const f=packageFixture('1.0.0',2,patch),runtime=createExtensionRuntime(); assert.equal(runtime.register(f.manifest,()=>({})).ok,false); assert.throws(()=>validateExtensionManifest(f.manifest,PACKAGE_REPO));void runtime.dispose();
});
test('physical identity does not infer API from version/name/repository/code or latest release',async t=>{
 const sys=system(t);let rows=await sys.manager.listInstalled();assert.equal(rows[0].runtimeCompatibility,'unconfirmed');assert.equal(rows[0].apiVersion,null);
 assert.equal(parseExtensionBuildIdentity(sys.tree()[0].content).apiVersion,undefined);await sys.manager.check(PACKAGE_PRODUCT);
 rows=await sys.manager.listInstalled();assert.equal(rows[0].runtimeCompatibility,'unconfirmed');assert.equal(sys.writes(),0);
});
test('exact old release proof marks API1 incompatible, refuses enable, permits safe physical uninstall',async t=>{
 const sys=system(t);const before=sys.tree();assert.deepEqual(await sys.manager.checkInstalledCompatibility(PACKAGE_PRODUCT),{runtimeCompatibility:'incompatible',apiVersion:1});
 assert.ok(sys.requests.includes(PACKAGE_API+'/releases/tags/v1.0.0'));assert.deepEqual(sys.tree(),before);
 await assert.rejects(sys.manager.setEnabled(PACKAGE_PRODUCT,true),errorCode('api-incompatible'));assert.equal(sys.writes(),0);
 await sys.manager.setEnabled(PACKAGE_PRODUCT,false);assert.deepEqual(sys.tree()[0].data,before[0].data);
 assert.equal((await sys.manager.uninstall(PACKAGE_PRODUCT)).physical,true);assert.deepEqual(sys.tree(),[]);
});
test('unavailable or mismatched installed-version proof remains unconfirmed with no mutation',async t=>{
 for(const mode of ['absent','modified','wrong-tag','changed-release']) {
 let reads=0;const sys=system(t,{editFetch(url,v){if(mode==='absent'&&url.includes('/tags/'))return undefined;if(mode==='wrong-tag'&&url.endsWith('/101'))return {...v,tag_name:'v2.0.0'};if(mode==='changed-release'&&url.endsWith('/101')&&++reads===2)return {...v,assets:[]};return v;}});
 if(mode==='modified'){const tree=sys.tree();tree[0].content+='\n// user edit';sys.set(tree);}
 const before=sys.tree();await assert.rejects(sys.manager.checkInstalledCompatibility(PACKAGE_PRODUCT));assert.equal((await sys.manager.listInstalled())[0].runtimeCompatibility,'unconfirmed');assert.deepEqual(sys.tree(),before);
 }
});
for(const api of [1,3])test('highest API'+api+' release cannot install/update or silently select an older API2 release',async t=>{
 const sys=system(t,{installed:packageFixture('1.0.0',2),target:packageFixture('2.0.0',api)});const candidate=await sys.manager.check(PACKAGE_PRODUCT);assert.equal(candidate.version,'2.0.0');assert.equal(candidate.packageValid,true);assert.equal(candidate.compatibility,'api-incompatible');assert.equal(candidate.available,false);
 await assert.rejects(sys.manager.update(PACKAGE_PRODUCT,candidate),errorCode('api-incompatible'));assert.equal(sys.writes(),0);
 const fresh=system(t,{installed:null,target:packageFixture('2.0.0',api)});await assert.rejects(fresh.manager.install(await fresh.manager.inspect(PACKAGE_REPO)),errorCode('api-incompatible'));assert.equal(fresh.writes(),0);
});
test('API1 to API2 upgrade preserves user tree and waits for first API2 Runtime registration',async t=>{
 let sys,running=null,reads=0;sys=system(t,{manager:{getRunningVersion:()=>running,readSavedScript:async()=>{reads++;if(reads>=4)running='2.0.0';return sys.tree()[0];}}});
 await sys.manager.checkInstalledCompatibility(PACKAGE_PRODUCT);const before=sys.tree()[0];const result=await sys.manager.update(PACKAGE_PRODUCT);assert.equal(result.runtimeConfirmed,true);assert.ok(reads>=4);assert.equal(result.persistence,'confirmed');
 assert.equal(result.instanceId,before.id);assert.equal(result.runtimeCompatibility,'compatible');assert.deepEqual(sys.tree()[0].data,before.data);assert.equal(sys.tree()[0].name,'用户自定义名字 2.0.0');assert.deepEqual(sys.backups[0],before);
});
test('API1 to API2 save without Runtime registration is not reported as completed running update',async t=>{
 const sys=system(t,{manager:{getRunningVersion:()=>null,persistenceTimeoutMs:20}});await assert.rejects(sys.manager.update(PACKAGE_PRODUCT),errorCode('persistence'));assert.equal(sys.writes(),1);assert.deepEqual(sys.tree()[0].data,{draft:'保留'});
});
test('disabled API1 folder upgrade retains every field and does not require or claim running',async t=>{
 const sys=system(t,{manager:{getRunningVersion:()=>null}});const old=sys.tree()[0];old.enabled=false;const folder={type:'folder',id:'folder',name:'User Folder',icon:'x',color:'red',enabled:false,scripts:[old]};sys.set([folder]);
 const result=await sys.manager.update(PACKAGE_PRODUCT);assert.equal(result.runtimeConfirmed,false);const after=sys.tree();after[0].scripts[0].content=old.content;after[0].scripts[0].name=old.name;assert.deepEqual(after,[folder]);
});
test('new API2 machine install remains persistence unconfirmed until actual readback; proof is content bound',async t=>{
 const sys=system(t,{installed:null});const result=await sys.manager.install(await sys.manager.inspect(PACKAGE_REPO));assert.equal(result.persistence,'unconfirmed');assert.equal(result.runtimeCompatibility,'compatible');
 const tree=sys.tree();tree[0].content+='\n// changed';sys.set(tree);assert.equal((await sys.manager.listInstalled())[0].runtimeCompatibility,'unconfirmed');
});
test('old API1 migration still rejects wrong scriptId, digest, content and concurrent original replacement',async t=>{
 const sys=system(t,{editWrite(tree){tree[0].content+='\n// user change';}});await assert.rejects(sys.manager.update(PACKAGE_PRODUCT),errorCode('changed'));assert.equal(sys.writes(),0);
 for(const change of [c=>{c.metadata.scriptId='other';},c=>{c.asset.sha256='0'.repeat(64);},c=>{c.metadata.contentSha256='0'.repeat(64);}]){
 const s=system(t);const c=await s.manager.check(PACKAGE_PRODUCT);change(c);await assert.rejects(s.manager.update(PACKAGE_PRODUCT,c),errorCode('release-changed'));assert.equal(s.writes(),0);
 }
});
