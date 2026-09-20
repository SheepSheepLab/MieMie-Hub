import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createRegistryClient,registryBaseURL} from '../src/registry-client.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(handler){
 const host=new EventTarget();host.location={origin:'https://tavern.example'};host.btoa=x=>Buffer.from(x,'binary').toString('base64');
 const popup={closed:false,location:{href:''},close(){this.closed=true;}};host.open=()=>popup;
 const requests=[];let challenge;
 const client=createRegistryClient({host,crypto:webcrypto,timeoutMs:30,loginTimeoutMs:1000,fetch:async(url,init)=>{requests.push({url,init});
  if(url.endsWith('/api/auth/start')){challenge=JSON.parse(init.body).codeChallenge;return json({requestId:'request',authorizationUrl:'https://registry.example/api/auth/authorize?requestId=request'});}
  if(url.endsWith('/api/auth/exchange')){const body=JSON.parse(init.body);assert.equal(Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(body.codeVerifier))).toString('base64url'),challenge);return json({token:'test-opaque-registry-session',profile:{displayName:'Development Fixture',avatarUrl:null},isAdmin:false});}
  return handler?handler(url,init):json({ok:true});
 }});client.setBase('https://registry.example');
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
