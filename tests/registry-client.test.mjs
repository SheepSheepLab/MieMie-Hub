import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createRegistryClient,registryBaseURL} from '../src/registry-client.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(handler,{exchange={},clientOptions={}}={}){
 const host=new EventTarget();host.location={origin:'https://tavern.example'};host.btoa=x=>Buffer.from(x,'binary').toString('base64');
 const popup={closed:false,location:{href:''},close(){this.closed=true;}};host.open=()=>{popup.closed=false;popup.location.href='';return popup;};
 const requests=[];let challenge;
 const client=createRegistryClient({host,crypto:webcrypto,timeoutMs:30,loginTimeoutMs:1000,fetch:async(url,init)=>{requests.push({url,init});
  if(url.endsWith('/api/auth/start')){challenge=JSON.parse(init.body).codeChallenge;return json({requestId:'request',authorizationUrl:'https://registry.example/api/auth/authorize?requestId=request'});}
  if(url.endsWith('/api/auth/exchange')){const body=JSON.parse(init.body);assert.equal(Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(body.codeVerifier))).toString('base64url'),challenge);return json({token:'test-opaque-registry-session',profile:{displayName:'Development Fixture',avatarUrl:null},isAdmin:false,...exchange});}
  return handler?handler(url,init):json({ok:true});
 },...clientOptions});client.setBase('https://registry.example');
 function message(overrides={}){const event=new Event('message');Object.assign(event,{origin:'https://registry.example',source:popup,data:{type:'miemie-registry-auth',requestId:'request',code:'bridge-code'},...overrides});host.dispatchEvent(event);}
 async function login(){const promise=client.login();for(let i=0;i<20&&!popup.location.href;i++)await tick();message();return promise;}
 return {client,host,popup,requests,message,login};
}
test('Registry base is explicit HTTPS or loopback development; no credential or URL injection',()=>{
 assert.equal(registryBaseURL('https://registry.example/'),'https://registry.example');assert.equal(registryBaseURL('http://127.0.0.1:8787'),'http://127.0.0.1:8787');
 for(const bad of ['http://remote.example','https://user:password@registry.example','https://registry.example/path','https://registry.example?secret=x'])assert.throws(()=>registryBaseURL(bad));
});
test('public catalog sends no session and offline failure leaves client usable',async()=>{let failed=true;const f=fixture(()=>{if(failed)throw Error('offline');return json({items:[]});});await assert.rejects(f.client.api('/api/catalog'),/offline/);failed=false;assert.deepEqual(await f.client.api('/api/catalog'),{items:[]});assert.ok(f.requests.every(x=>!x.init.headers.Authorization&&x.init.credentials==='omit'));f.client.dispose();});
test('popup login validates Registry origin, window and requestId; PKCE then memory-only session',async()=>{
 const f=fixture();const pending=f.client.login();assert.equal(f.client.login(),pending);for(let i=0;i<20&&!f.popup.location.href;i++)await tick();
 f.message({origin:'https://evil.example'});f.message({source:{}});f.message({data:{type:'miemie-registry-auth',requestId:'wrong',code:'x'}});await tick();assert.equal(f.requests.filter(x=>x.url.endsWith('/exchange')).length,0);
 f.message();await pending;assert.equal(f.client.getIdentity().profile.displayName,'Development Fixture');await f.client.api('/api/submissions',{authenticated:true});await f.client.api('/api/catalog');
 assert.equal(f.requests.at(-2).init.headers.Authorization,'Bearer test-opaque-registry-session');assert.equal(f.requests.at(-1).init.headers.Authorization,undefined);assert.equal(f.popup.closed,true);f.client.dispose();
});
test('401 clears expired session, logout revokes and changing Registry clears credentials',async()=>{let status=200;const f=fixture(()=>json({error:{message:'expired'}},status));await f.login();status=401;await assert.rejects(f.client.api('/api/me',{authenticated:true}),/expired/);assert.equal(f.client.getIdentity(),null);f.client.dispose();
 const other=fixture();await other.login();await other.client.logout();assert.equal(other.client.getIdentity(),null);assert.ok(other.requests.some(x=>x.url.endsWith('/api/auth/logout')&&x.init.headers.Authorization));other.client.dispose();
 const changed=fixture();await changed.login();changed.client.setBase('https://other.example');assert.equal(changed.client.getIdentity(),null);changed.client.dispose();});
test('teardown and deadline cancel non-cooperative Registry request',async()=>{let signal;const f=fixture((u,i)=>{signal=i.signal;return new Promise(()=>{});});await assert.rejects(f.client.api('/api/catalog'),/超时|取消/);assert.equal(signal.aborted,true);const p=f.client.api('/api/catalog');f.client.dispose();await assert.rejects(p,/取消/);});
test('response byte limit, malformed data and API path injection fail safely',async()=>{const f=fixture(()=>new Response(new Uint8Array(2*1024*1024+1)));await assert.rejects(f.client.api('/api/catalog'),/过大/);await assert.rejects(f.client.api('//evil.example'),/路径/);f.client.dispose();const g=fixture(()=>new Response('not-json'));await assert.rejects(g.client.api('/api/catalog'),/格式/);g.client.dispose();});

test('authorized Catalog uses only the opaque Registry session; anonymous Catalog stays public',async()=>{
 const f=fixture();await f.client.api('/api/catalog',{authenticated:'optional'});assert.equal(f.requests.at(-1).init.headers.Authorization,undefined);
 await f.login();await f.client.api('/api/catalog',{authenticated:'optional'});assert.equal(f.requests.at(-1).init.headers.Authorization,'Bearer test-opaque-registry-session');assert.equal(f.requests.at(-1).init.credentials,'omit');f.client.dispose();
});
test('logout immediately clears UI identity and discards a delayed authorized Catalog response',async()=>{
 let finish;const f=fixture(url=>url.includes('/api/catalog')?new Promise(r=>{finish=r;}):json({ok:true}));await f.login();const seen=[];f.client.subscribe(identity=>seen.push(identity));
 const request=f.client.api('/api/catalog',{authenticated:'optional'});await f.client.logout();assert.equal(f.client.getIdentity(),null);assert.equal(seen.at(-1),null);
 finish(json({items:[{name:'Restricted Development Fixture'}]}));await assert.rejects(request,/登录状态已改变/);f.client.dispose();
});
test('a stale 401 or me response cannot clear or resurrect a different login',async()=>{
 let finish;const f=fixture(url=>url.endsWith('/api/me')?new Promise(r=>{finish=r;}):json({ok:true}));await f.login();const pending=f.client.me();await f.client.logout();await f.login();
 finish(json({error:'stale expired session'},401));await assert.rejects(pending,/登录状态已改变/);assert.equal(f.client.getIdentity().profile.displayName,'Development Fixture');f.client.dispose();
 let finishOther;const g=fixture(url=>url.endsWith('/api/me')?new Promise(r=>{finishOther=r;}):json({ok:true}));await g.login();const me=g.client.me();await g.client.logout();finishOther(json({profile:{displayName:'Old Profile'}}));await assert.rejects(me,/登录状态已改变/);assert.equal(g.client.getIdentity(),null);g.client.dispose();
});
test('session deadline notifies the UI without waiting for another API call',async()=>{
 const f=fixture(undefined,{exchange:{expiresAt:new Date(Date.now()+80).toISOString()}});const seen=[];f.client.subscribe(identity=>seen.push(identity));await f.login();assert.ok(f.client.getIdentity());
 await new Promise(r=>setTimeout(r,100));assert.equal(f.client.getIdentity(),null);assert.equal(seen.at(-1),null);await f.client.api('/api/catalog',{authenticated:'optional'});assert.equal(f.requests.at(-1).init.headers.Authorization,undefined);f.client.dispose();
});
test('public profile projection excludes identity, email and OAuth fields even from a malformed server',async()=>{
 const f=fixture(undefined,{exchange:{profile:{displayName:'Visible Fixture',avatarUrl:'/api/avatars/test',id:'123456789012345678',email:'private@example.invalid',access_token:'test-only-oauth'}}});await f.login();assert.deepEqual(f.client.getIdentity().profile,{displayName:'Visible Fixture',avatarUrl:'/api/avatars/test'});assert.doesNotMatch(JSON.stringify(f.client.getIdentity()),/private|123456|access_token/);f.client.dispose();
});
test('logout during initial PKCE preparation cannot complete a stale login',async()=>{
 let digest;const crypto={getRandomValues:x=>webcrypto.getRandomValues(x),subtle:{digest:()=>new Promise(r=>{digest=r;})}};
 const f=fixture(undefined,{clientOptions:{crypto}});const pending=f.client.login();await f.client.logout();digest(new Uint8Array(32));await assert.rejects(pending,/登录上下文已改变/);assert.equal(f.requests.length,0);assert.equal(f.popup.closed,true);assert.equal(f.client.getIdentity(),null);f.client.dispose();
});
test('default Registry URL is public build configuration and can be overridden without a login',()=>{
 const client=createRegistryClient({defaultBaseURL:'https://registry.example'});assert.equal(client.getBase(),'https://registry.example');assert.equal(client.getDefaultBase(),'https://registry.example');client.setBase('http://127.0.0.1:8787');assert.equal(client.getBase(),'http://127.0.0.1:8787');client.dispose();
 const empty=createRegistryClient();assert.equal(empty.getBase(),'');empty.dispose();assert.throws(()=>createRegistryClient({defaultBaseURL:'https://secret@registry.example'}));
});
