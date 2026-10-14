import test from 'node:test';
import assert from 'node:assert/strict';
import {createExtensionRuntime} from '../src/extension-runtime.js';
const manifest=id=>({schemaVersion:1,apiVersion:1,id,name:id,version:'1.0.0'});
const request=()=>({source:'escape',isCurrent:()=>true});
async function fixture(t,handler=()=>true){
 const apis=[],r=createExtensionRuntime({onPanel:()=>()=>{},onClosePanel:()=>true});t.after(()=>r.dispose());
 r.register(manifest('test.back'),api=>{apis.push(api);return {activate(){api.attachPanel({});api.registerBackHandler(handler);}};});
 await r.enable('test.back');return {r,apis};
}
test('optional Back is single-session registration after attachPanel, without changing Manifest v1',async t=>{
 let api;const r=createExtensionRuntime({onPanel:()=>()=>{}});t.after(()=>r.dispose());
 r.register(manifest('test.back'),value=>{api=value;return {};});await r.enable('test.back');
 assert.equal(r.hasBackHandler('test.back'),false);assert.throws(()=>api.registerBackHandler(()=>true),/主面板/);
 api.attachPanel({});assert.throws(()=>api.registerBackHandler(null),/无效/);
 assert.throws(()=>api.registerBackHandler(api.guard(()=>true)),/guard/);
 assert.equal(api.registerBackHandler(()=>false),true);assert.throws(()=>api.registerBackHandler(()=>true),/重复/);
 assert.equal(r.requestBack('test.back',request()).handled,false);
 assert.deepEqual(r.get('test.back').manifest,manifest('test.back'));
});
for(const result of [true,false])test('strict synchronous boolean: '+result,async t=>{
 let seen;const {r}=await fixture(t,function(context){assert.equal(this,undefined);seen=context;return result;});
 assert.deepEqual(r.requestBack('test.back',request()),{handled:result});
 assert.ok(Object.isFrozen(seen));assert.deepEqual(Object.keys(seen).sort(),['isCurrent','source']);assert.equal(seen.source,'escape');assert.equal(seen.isCurrent(),true);
});
for(const [name,handler]of [
 ['throw',()=>{throw Error('draft fault');}],['throw null',()=>{throw null;}],
 ['undefined',()=>undefined],['object',()=>({})],['string',()=>'false'],['number',()=>0],
 ['resolved Promise',()=>Promise.resolve(false)],['rejected Promise',()=>Promise.reject(Error('late'))],
 ['never settling Promise',()=>new Promise(()=>{})],['throwing then',()=>({get then(){throw Error('then');}})],
])test('Back fault preserves instance and explicit close: '+name,async t=>{
 const {r,apis}=await fixture(t,handler);const result=r.requestBack('test.back',request());
 assert.equal(result.handled,true);assert.match(result.error,/返回处理失败/);assert.equal(r.get('test.back').state,'enabled');
 assert.equal(apis[0].closePanel(),true);assert.equal(r.hasBackHandler('test.back'),true);
 await new Promise(resolve=>setImmediate(resolve));
});
for(const action of ['disable','uninstall','dispose'])test(action+' revokes before asynchronous teardown and invalidates retained contexts',async t=>{
 let seen,calls=0;const {r,apis}=await fixture(t,context=>{seen=context;calls++;return true;});
 r.requestBack('test.back',request());const done=action==='dispose'?r.dispose():r[action]('test.back');
 assert.equal(r.hasBackHandler('test.back'),false);assert.equal(apis[0].signal.aborted,true);assert.equal(seen.isCurrent(),false);
 assert.equal(apis[0].registerBackHandler(()=>false),false);assert.equal(r.requestBack('test.back',request()).handled,true);assert.equal(calls,1);await done;
});
test('same ID re-enable rejects old API and request context; one owner cannot dispatch another handler',async t=>{
 const seen=[];const {r,apis}=await fixture(t,context=>{seen.push(context);return true;});
 r.requestBack('test.back',request());await r.disable('test.back');await r.enable('test.back');
 assert.equal(seen[0].isCurrent(),false);assert.equal(apis[0].closePanel(),false);assert.equal(apis.length,2);
 assert.equal(r.requestBack('test.other',request()).handled,true);assert.equal(seen.length,1);
 r.requestBack('test.back',request());assert.equal(seen.length,2);assert.equal(seen[1].isCurrent(),true);
});
test('reentrant dispatch and revoked/changed Surface inside handler cannot fall through',async t=>{
 let r,active=true,calls=0;({r}=await fixture(t,()=>{calls++;assert.equal(r.requestBack('test.back',request()).handled,true);active=false;return false;}));
 assert.equal(r.requestBack('test.back',{source:'escape',isCurrent:()=>active}).handled,true);assert.equal(calls,1);
});
test('disable inside handler returning false still consumes the old request',async t=>{
 let r,done;({r}=await fixture(t,()=>{done=r.disable('test.back');return false;}));
 assert.equal(r.requestBack('test.back',request()).handled,true);await done;
});
test('late async completion using an old session cannot close its re-enabled replacement',async t=>{
 let finish,done,result;const apis=[];const r=createExtensionRuntime({onPanel:()=>()=>{},onClosePanel:()=>{throw Error('old completion must not reach Surface');}});t.after(()=>r.dispose());
 r.register(manifest('test.back'),api=>{apis.push(api);return {activate(){api.attachPanel({});api.registerBackHandler(request=>{
  done=new Promise(resolve=>{finish=resolve;}).then(()=>{assert.equal(request.isCurrent(),false);result=api.closePanel();});return true;
 });}};});await r.enable('test.back');r.requestBack('test.back',request());await r.disable('test.back');await r.enable('test.back');finish();await done;
 assert.equal(result,false);assert.equal(r.get('test.back').enabled,true);assert.equal(apis.length,2);
});
