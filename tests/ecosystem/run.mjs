// Development Fixture only. Executes complete verified release artifacts against
// an isolated jsdom host; never imports another project's source or calls a network.
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash, webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {JSDOM, VirtualConsole} from 'jsdom';

const project = fileURLToPath(new URL('../../', import.meta.url));
const flags = new Map();
for (let i=2;i<process.argv.length;i+=2) {
  const flag=process.argv[i], value=process.argv[i+1];
  if (!['--polisher','--metadata','--legacy-polisher','--hub','--report'].includes(flag)||!value||flags.has(flag)) throw Error('Use --polisher <JSON> --metadata <update JSON> --legacy-polisher <published 1.0.1 JSON>.');
  flags.set(flag,path.resolve(value));
}
for (const name of ['--polisher','--metadata','--legacy-polisher']) if (!flags.has(name)) throw Error('Missing '+name);
const sha = data => createHash('sha256').update(data).digest('hex');
const clone = data => structuredClone(data);
const pkg = JSON.parse(await readFile(path.join(project,'package.json')));
const hubBytes=await readFile(flags.get('--hub')||path.join(project,'build/MieMie-Hub-'+pkg.version+'.json'));
const polisherBytes=await readFile(flags.get('--polisher')), metaBytes=await readFile(flags.get('--metadata')), legacyBytes=await readFile(flags.get('--legacy-polisher'));
const hubArtifact=JSON.parse(hubBytes), polisherArtifact=JSON.parse(polisherBytes), metadata=JSON.parse(metaBytes), legacyArtifact=JSON.parse(legacyBytes);
assert.match(metadata.version,/^\d+\.\d+\.\d+$/);assert.equal(metadata.productId,'miemie.polisher');assert.equal(metadata.asset.sha256,sha(polisherBytes));assert.equal(metadata.asset.size,polisherBytes.length);assert.equal(metadata.contentSha256,sha(polisherArtifact.content));assert.equal(polisherArtifact.id,metadata.scriptId);
assert.equal(metadata.tag,'v'+metadata.version);assert.equal(metadata.manifest.version,metadata.version);assert.equal(metadata.manifest.id,metadata.productId);assert.equal(metadata.manifest.repository,'https://github.com/SheepSheepLab/MieMie-Polisher');
const identity=JSON.parse(polisherArtifact.content.split('\n')[0].replace('// MieMie-Extension-Build: ',''));assert.equal(identity.productId,metadata.productId);assert.equal(identity.version,metadata.version);assert.equal(identity.repository,metadata.manifest.repository);assert.equal(identity.scriptId,metadata.scriptId);
const legacyHashes = {
  '6bab205ab77804c2128c031e0e615295e8661ae978d58700a16da4b8958d4fbc':'1.0.1',
  '6041b413629366ad8fe5d6667fe35e005224eabc4ddaae33f1824d489b8f0f84':'1.1.0',
};
const legacyVersion = legacyHashes[sha(legacyBytes)];
assert.ok(legacyVersion,'legacy artifact must be exact published bytes');
assert.notEqual(metadata.version,legacyVersion);
const hubIdentity=JSON.parse(hubArtifact.content.split('\n')[0].replace('// MieMie-Hub-Build: ',''));assert.equal(hubIdentity.version,pkg.version);assert.equal(hubIdentity.productId,'miemie.hub');
const timelineIncluded=hubArtifact.content.includes('function createTimelineExtension(');
function checkTimeline(host){assert.equal(!!host.__timelineSwitcherV1,timelineIncluded);assert.equal(!!host.document.querySelector('#miemie-timeline-extension'),timelineIncluded);}
const artifacts={hub:{version:pkg.version,sha256:sha(hubBytes)},polisher:{version:metadata.version,sha256:sha(polisherBytes)},metadata:{sha256:sha(metaBytes)},legacyPolisher:{version:legacyVersion,sha256:sha(legacyBytes)}};
const repoAPI='https://api.github.com/repos/SheepSheepLab/MieMie-Polisher', repoURL=metadata.manifest.repository;
const releaseId=71001, assetId=71002, metadataId=71003;
const asset=(id,name,bytes)=>({id,name,state:'uploaded',size:bytes.length,digest:'sha256:'+sha(bytes),url:repoAPI+'/releases/assets/'+id,browser_download_url:repoURL+'/releases/download/'+metadata.tag+'/'+name});
const release={id:releaseId,tag_name:metadata.tag,draft:false,prerelease:true,assets:[asset(assetId,metadata.asset.name,polisherBytes),asset(metadataId,'MieMie-Extension-update.json',metaBytes)]};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check,label,timeout=8000){const end=Date.now()+timeout;while(Date.now()<end){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Timeout: '+label);}
function response(data,url){const r=new Response(data instanceof Uint8Array?data:JSON.stringify(data),{headers:{'Content-Type':'application/json'}});Object.defineProperty(r,'url',{value:url});return r;}
const results=[];
async function check(name,fn){await fn();results.push({name,passed:true});console.log('PASS: '+name);}

async function fixture({legacy=false,cors=false,corrupt=false}={}) {
  const errors=[],calls=[],backups=[],writes=[],subscriptions=new Set(),frames=new Map(),blobURLs=new Map();
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(String(e)));vc.on('error',(...e)=>errors.push(e.map(String).join(' ')));
  const dom=new JSDOM('<!doctype html><body><form id="send_form"><textarea id="send_textarea"></textarea><button id="send_but"></button></form></body>',{url:'https://ecosystem-fixture.invalid/',runScripts:'outside-only',virtualConsole:vc});
  const h=dom.window,d=h.document;let serial=0, closing=false, reconcileQueue=Promise.resolve(), registryOffline=false;
  const actualHubId='fixture-user-hub', actualLegacyId='fixture-user-renamed-polisher';
  const other={type:'script',id:'fixture-other-script',enabled:true,name:'Development Fixture other script',content:'window.parent.__fixtureOtherStarts=(window.parent.__fixtureOtherStarts||0)+1;',info:'untouched',button:{enabled:false,buttons:[]},data:{preserve:[1,2,3]},export_with:{data:true,button:true}};
  const hubScript={...clone(hubArtifact),id:actualHubId,name:'Development Fixture Hub'};
  const legacyScript={...clone(legacyArtifact),id:actualLegacyId,name:'User renamed Polisher',info:'user custom info',button:{enabled:true,buttons:[{name:'user button',visible:false}]},data:{privateFixtureSetting:{keep:['value',42]}},export_with:{data:false,button:true}};
  let trees=[other,{type:'folder',enabled:true,id:'fixture-folder',name:'User tools folder',icon:'fa-folder',color:'#abcdef',scripts:[hubScript,...(legacy?[legacyScript]:[])]}];
  const flat=value=>value.flatMap(x=>x.type==='folder'?x.scripts.map(script=>({script,enabled:x.enabled&&script.enabled})): [{script:x,enabled:x.enabled}]);
  const events=['GENERATION_STARTED','GENERATION_ENDED','MESSAGE_RECEIVED','GENERATION_STOPPED','CHAT_CHANGED','GENERATION_AFTER_COMMANDS','CHAT_COMPLETION_SETTINGS_READY','MESSAGE_SWIPED','MESSAGE_EDITED','MESSAGE_DELETED','MESSAGE_UPDATED'];
  const scope=JSON.stringify(['fixture.png','fixture-chat',null]), text='<story_scene>Fixture processed text</story_scene>';
  const vars={timeline_switcher_v2:{version:1,books:[]},meeme_translation_v1:{config:{base:'https://fixture-api.invalid/v1',model:'fixture-model',maxTokens:8192,timeoutSeconds:300,thinkingMode:'default',protectedTags:''},cards:{'fixture.png':{mode:'polish',target:'简体中文',polishRules:'Fixture rules',rules:'Fixture translation',terms:'fixture = fixture',prePrompt:{text:'Fixture pre prompt',role:'system'},postPrompt:{text:'Fixture post prompt',role:'user'},sendOriginal:true,selections:{polish:'fixture-polish',translate:'fixture-translation'}}},library:[{id:'fixture-polish',name:'Development Fixture polish',mode:'polish',data:{target:'简体中文',rules:'Fixture rules'}},{id:'fixture-translation',name:'Development Fixture translation',mode:'translate',data:{target:'简体中文',rules:'Fixture translation'}}],backups:[{scope,id:0,swipe:0,source:'<story_scene>Fixture original text</story_scene>',expected:text,processed:text}]}};
  const worldbook={entries:{1:{uid:1,comment:'Development Fixture timeline',disable:false,content:'<world_timeline>\n事件一：测试（60年3月15日）：结束\n</world_timeline>'}}};
  const ctx={characterId:0,characters:[{avatar:'fixture.png',name:'Development Fixture'}],chatId:'fixture-chat',groupId:null,chat:[{is_user:false,is_system:false,mes:text,swipe_id:0}],eventTypes:Object.fromEntries(events.map(x=>[x,x])),saveChat:async()=>{},stopGeneration(){},getRequestHeaders:()=>({'Content-Type':'application/json'}),loadWorldInfo:async()=>clone(worldbook),saveWorldInfo:async()=>{},reloadWorldInfoEditor(){},mainApi:'openai'};
  h.SillyTavern={getContext:()=>ctx};h.visualViewport=Object.assign(new h.EventTarget(),{width:1024,height:768,offsetLeft:0,offsetTop:0});
  h.localStorage.setItem('meeme_translation_key_v1',JSON.stringify({base:'https://fixture-api.invalid/v1',key:'fixture-not-real-api-key'}));h.localStorage.setItem('meeme_timeline_dock_v1',JSON.stringify({side:'right',ratio:0.4}));h.localStorage.setItem('fixture-other-storage','keep');
  h.Blob=Blob;h.URL.createObjectURL=blob=>{const url='blob:https://ecosystem-fixture.invalid/'+(++serial);blobURLs.set(url,blob);return url;};h.URL.revokeObjectURL=url=>blobURLs.delete(url);h.HTMLAnchorElement.prototype.click=function(){backups.push({name:this.download,blob:blobURLs.get(this.href)});};h.confirm=()=>true;h.alert=message=>errors.push('alert: '+message);
  function block(scope){scope.XMLHttpRequest.prototype.send=()=>{throw Error('Real XHR forbidden');};scope.WebSocket=class{constructor(){throw Error('Real websocket forbidden');}};scope.EventSource=class{constructor(){throw Error('Real EventSource forbidden');}};scope.navigator.sendBeacon=()=>{throw Error('Real beacon forbidden');};}
  async function fetchMock(url,init={}) {
    url=String(url);calls.push({url,method:init.method,headers:clone(init.headers||{}),body:init.body});
    if(url.startsWith(repoAPI)) {
      assert.equal(init.credentials,'omit');assert.equal(init.referrerPolicy,'no-referrer');assert.equal(init.mode,'cors');assert.equal(init.body,undefined);assert.equal(init.headers.Authorization,undefined);
      if(url===repoAPI)return response({private:false,full_name:'SheepSheepLab/MieMie-Polisher'},url);
      if(url===repoAPI+'/releases?per_page=100&page=1')return response([release],url);
      if(url===repoAPI+'/releases/'+releaseId)return response(release,url);
      if(url===repoAPI+'/releases/assets/'+metadataId){if(cors)throw TypeError('Development Fixture CORS failure');return response(metaBytes,url);}
      if(url===repoAPI+'/releases/assets/'+assetId){const bytes=Buffer.from(polisherBytes);if(corrupt)bytes[bytes.length-2]^=1;return response(bytes,url);}
    }
    if(url==='https://registry.sheepsheeplab.com/api/catalog?page=1&pageSize=12&q=&source=')return response({items:[],hasMore:false},url);
    if(url==='https://registry.sheepsheeplab.com/api/packages/github/asset')throw TypeError('Development Fixture Registry offline');
    if(url==='https://registry-fixture.invalid/api/catalog?page=1&pageSize=12&q=&source=') {
      if(registryOffline)throw TypeError('Development Fixture Registry offline');
      return response({items:[{id:'fixture-catalog-polisher',name:'Development Fixture · Polisher reference',author:'SheepSheep',description:'Test Data pointing to the official package fixture',sourceType:'github',sourceUrl:repoURL,submitter:{displayName:'Development Fixture submitter'},github:{compatibility:'installable',manifest:metadata.manifest}}],hasMore:false},url);
    }
    if(url===h.location.origin+'/api/settings/get')return response({settings:JSON.stringify({extension_settings:{tavern_helper:{script:{scripts:trees}}}})},url);
    if(url.startsWith('https://fixture-api.invalid/'))return response({choices:[{message:{content:JSON.stringify({translations:['Fixture polished response']})}}]},url);
    throw Error('Unexpected or real network forbidden: '+url);
  }
  block(h);h.fetch=fetchMock;
  async function stop(id) {
    const item=frames.get(id);if(!item)return;frames.delete(id);
    const hubBefore=id===actualHubId?h.__MieMieHub:null, sourceBefore=h.__MieMiePolisherSource;
    item.frame.contentWindow.dispatchEvent(new item.frame.contentWindow.Event('pagehide'));
    if(hubBefore)await hubBefore.whenDisposed;
    if(sourceBefore?.disposed)await sourceBefore.settled();
    await tick();item.frame.remove();await tick();
  }
  function mount(script) {
    const frame=d.createElement('iframe');d.body.appendChild(frame);const w=frame.contentWindow;
    block(w);Object.defineProperty(w,'crypto',{value:webcrypto});Object.assign(w,{TextEncoder,TextDecoder,Response,Request,Headers,ReadableStream,structuredClone,fetch:fetchMock,getScriptId:()=>script.id,getScriptTrees:options=>{assert.equal(options.type,'global');return clone(trees);},
      updateScriptTreesWith:(updater,options)=>{assert.equal(options.type,'global');const old=clone(trees),result=updater(clone(trees));assert.ok(Array.isArray(result));assert.equal(typeof result.then,'undefined');trees=clone(result);writes.push({before:old,after:clone(trees)});schedule();return clone(trees);},
      getCharWorldbookNames:()=>({primary:'Development Fixture book',additional:[]}),getVariables:spec=>clone(vars[spec.extension_id]||{}),replaceVariables:(value,spec)=>{vars[spec.extension_id]=clone(value);},
      eventOn:(type,fn)=>{const sub={id:script.id,type,fn};subscriptions.add(sub);return{stop:()=>subscriptions.delete(sub)};},setChatMessages:async rows=>{for(const row of rows)ctx.chat[row.message_id].mes=row.message;},formatAsTavernRegexedString:text=>text,
    });
    frames.set(script.id,{frame,content:script.content});w.eval(script.content);return frame;
  }
  async function reconcile() {
    if(closing)return;
    const desired=flat(trees), enabled=new Map(desired.filter(x=>x.enabled).map(x=>[x.script.id,x.script]));
    for(const [id,item]of frames)if(!enabled.has(id)||enabled.get(id).content!==item.content)await stop(id);
    for(const {script,enabled:running}of desired)if(running&&!frames.has(script.id))mount(script);
    await tick();
  }
  function schedule(){reconcileQueue=reconcileQueue.then(reconcile).catch(e=>{errors.push(e.stack);});return reconcileQueue;}
  await schedule();await until(()=>h.__MieMieHub,'Hub startup');await h.__MieMieHub.ready;
  if(legacy)await until(()=>h.__MieMieHub.extensions.get('miemie.polisher')?.enabled,'legacy Polisher startup');
  const q=selector=>d.querySelector(selector);
  const click=selector=>{const node=q(selector);assert.ok(node,'Missing '+selector+'; UI: '+q('[data-hub-panel="extension-center"]')?.textContent);assert.equal(node.disabled,false,'disabled '+selector);node.click();};
  async function center(tab='discover'){await h.__MieMieHub.open();click('[data-hub-app="extension-center"]');await tick();click('[data-center-tab="'+tab+'"]');await tick();}
  async function action(name){click('[data-action="'+name+'"]');await tick();}
  const installed=()=>flat(trees).map(x=>x.script).find(x=>x.content.startsWith('// MieMie-Extension-Build:')||x.content.startsWith('// MieMie Polisher ·'));
  async function drain(){await reconcileQueue;await tick();if(h.__MieMiePolisherSource)await h.__MieMiePolisherSource.settled();await tick();}
  return {h,d,q,click,center,action,installed,drain,calls,backups,writes,errors,subscriptions,frames,actualLegacyId,actualHubId,initialLegacy:legacyScript,other,vars,worldbook,ctx,
    trees:()=>clone(trees),registryOffline(){registryOffline=true;h.localStorage.setItem('miemie_registry_url_v1','https://registry-fixture.invalid');},
    async stopHub(){await stop(actualHubId);await drain();},
    async restartHub(){await schedule();await until(()=>h.__MieMieHub,'Hub restart');await h.__MieMieHub.ready;await until(()=>h.__MieMieHub.extensions.get('miemie.polisher')?.enabled,'Polisher recollected');await drain();},
    async close(){closing=true;for(const id of [...frames.keys()].filter(id=>id!==actualHubId))await stop(id);await stop(actualHubId);dom.window.close();assert.deepEqual(errors,[]);assert.equal(subscriptions.size,0);},
  };
}

let activeFixture;
try {
  const f=activeFixture=await fixture();
  await check('fresh built Hub opens merged center with Discover / Installed / Mine and no old manager launcher',async()=>{
    await f.center();assert.equal(f.q('[data-hub-app="extensions"]'),null);for(const tab of ['discover','installed','mine'])assert.ok(f.q('[data-center-tab="'+tab+'"]'));
    await f.center('mine');assert.match(f.q('[data-hub-panel="extension-center"]').textContent,/使用 Discord 登录/);await f.center('discover');assert.equal(f.installed(),undefined);
  });
  await check('author GitHub preview downloads verified package and installs real Polisher artifact without manual import',async()=>{
    f.q('[aria-label="GitHub Repository URL"]').value=repoURL;await f.action('github:preview');await until(()=>f.q('[data-action="package:install"]'),'package preview');await f.action('package:install');
    await until(()=>f.h.__MieMieHub.extensions.get('miemie.polisher')?.enabled,'automatic package registration');await f.drain();
    assert.equal(f.installed().content,polisherArtifact.content);assert.notEqual(f.installed().id,polisherArtifact.id);assert.equal(f.h.__MieMiePolisherSource.mode,'hub');assert.ok(f.q('[data-extension-id="miemie.polisher"]'));
    assert.ok(f.calls.some(x=>x.url===repoAPI+'/releases/assets/'+assetId));assert.ok(f.calls.every(x=>x.url===f.h.location.origin+'/api/settings/get'||x.url.startsWith(repoAPI)||x.url==='https://registry.sheepsheeplab.com/api/catalog?page=1&pageSize=12&q=&source='));assert.equal(f.writes.length,1);assert.deepEqual(f.trees()[0],f.other);
  });
  await check('installed real artifact opens through Hub Launcher and physical enable/disable follows helper iframe lifetime',async()=>{
    await f.h.__MieMieHub.open();f.click('[data-hub-app="miemie.polisher"]');await until(()=>f.q('#meeme-translation section')?.hidden===false,'Launcher open');
    await f.center('installed');await f.action('miemie.polisher:toggle');await until(()=>!f.h.__meemeTranslation01,'physical disable');await f.drain();assert.equal(f.installed().enabled,false);assert.equal(f.h.__MieMiePolisherSource,undefined);assert.equal(f.q('[data-miemie-polisher-standalone]'),null);
    await f.center('installed');await f.action('miemie.polisher:toggle');await until(()=>f.h.__MieMieHub.extensions.get('miemie.polisher')?.enabled,'physical reenable');await f.drain();assert.equal(f.installed().enabled,true);assert.equal(f.d.querySelectorAll('#meeme-translation').length,1);
  });
  await check('installed version comparison reports the same author version without offering an update',async()=>{
    await f.center('installed');await f.action('miemie.polisher:check');await until(()=>f.q('[data-extension-id="miemie.polisher"]').textContent.includes('最新版本：'+metadata.version),'same version result');
    assert.equal(f.q('[data-action="miemie.polisher:update"]'),null);assert.equal(f.installed().content,polisherArtifact.content);
  });
  await check('physical uninstall creates no backup and removes only target script; saved business data survives',async()=>{
    const before=clone(f.installed()),data=JSON.stringify(f.vars),key=f.h.localStorage.getItem('meeme_translation_key_v1');
    await f.center('installed');await f.action('miemie.polisher:uninstall');await until(()=>!f.installed(),'target physically removed');await f.drain();
    assert.equal(f.backups.length,0);assert.equal(f.h.__MieMieHub.extensions.get('miemie.polisher'),null);assert.deepEqual(f.trees()[0],f.other);assert.equal(JSON.stringify(f.vars),data);assert.equal(f.h.localStorage.getItem('meeme_translation_key_v1'),key);checkTimeline(f.h);
  });
  await check('uninstalled Polisher can be reinstalled through the real center without an uninstall backup',async()=>{
    await f.center();f.q('[aria-label="GitHub Repository URL"]').value=repoURL;await f.action('github:preview');await until(()=>f.q('[data-action="package:install"]'),'reinstall preview');await f.action('package:install');
    await until(()=>f.h.__MieMieHub.extensions.get('miemie.polisher')?.enabled,'reinstalled active');await f.drain();
    assert.equal(f.installed().content,polisherArtifact.content);assert.equal(f.backups.length,0);assert.deepEqual(f.trees()[0],f.other);
  });
  await f.close();activeFixture=null;
  const u=activeFixture=await fixture({legacy:true});
  await check('published baseline is identified by verified content despite custom installed ID, folder and rename',async()=>{
    await u.center('installed');await until(()=>u.q('[data-action="miemie.polisher:check"]'),'legacy managed');assert.ok(u.q('[data-extension-id="miemie.polisher"]').textContent.includes(legacyVersion));assert.equal(u.installed().id,u.actualLegacyId);
  });
  await check('published baseline updates from author Release retaining instance metadata and external data',async()=>{
    const before=clone(u.installed()),vars=JSON.stringify(u.vars),key=u.h.localStorage.getItem('meeme_translation_key_v1'),worldbook=JSON.stringify(u.worldbook);
    await u.action('miemie.polisher:check');await until(()=>u.q('[data-action="miemie.polisher:update"]'),'newer package');await u.action('miemie.polisher:update');
    await until(()=>u.h.__MieMieHub.extensions.get('miemie.polisher')?.manifest.version===metadata.version&&u.h.__MieMieHub.extensions.get('miemie.polisher')?.enabled,'upgraded iframe activation');await u.drain();
    assert.deepEqual(u.installed(),{...before,content:polisherArtifact.content});assert.deepEqual(JSON.parse(await u.backups.at(-1).blob.text()),before);assert.equal(JSON.stringify(u.vars),vars);assert.equal(u.h.localStorage.getItem('meeme_translation_key_v1'),key);assert.equal(JSON.stringify(u.worldbook),worldbook);assert.deepEqual(u.trees()[0],u.other);assert.equal(u.h.__fixtureOtherStarts,1);
    await u.h.__MieMieHub.open();u.click('[data-hub-app="miemie.polisher"]');await until(()=>u.q('#meeme-translation section')?.hidden===false,'updated Launcher UI');assert.equal(u.q('[data-key]').value,'fixture-not-real-api-key');assert.equal(u.q('[data-pre-text]').value,'Fixture pre prompt');assert.equal(u.vars.meeme_translation_v1.backups.length,1);
    const artLine=polisherArtifact.content.split('\n').find(line=>line.startsWith('const POLISHER_ASSETS='));const expectedIcon=JSON.parse(artLine.slice('const POLISHER_ASSETS='.length,-1)).icon;
    assert.equal(u.q('[data-hub-app="miemie.polisher"] img').src,expectedIcon);assert.equal(u.q('#meeme-translation [data-tool-icon]').src,expectedIcon);
    await until(()=>u.q('[data-hub-panel="extension-center"]').textContent.includes('已重新读取宿主脚本'),'durable update confirmation');
  });
  await check('Registry offline leaves real installed package, timeline and local settings usable',async()=>{
    await u.h.__MieMieHub.open();u.click('[data-hub-app="settings"]');await tick();u.q('[data-hub-developer-settings]').open=true;const url=u.q('[aria-label="Registry 服务地址"]');url.value='https://registry-fixture.invalid';u.registryOffline();await u.action('registry:configure');await u.center('discover');await until(()=>u.q('[data-hub-panel="extension-center"]').textContent.includes('扩展目录无法连接'),'offline Catalog message');
    checkTimeline(u.h);assert.equal(u.h.__MieMieHub.extensions.get('miemie.polisher').enabled,true);await u.center('installed');assert.ok(u.q('[data-extension-id="miemie.polisher"]'));
  });
  await check('upgraded Polisher restores one standalone launcher when only Hub stops',async()=>{
    const frame=u.frames.get(u.actualLegacyId).frame;await u.stopHub();await until(()=>u.h.__MieMiePolisherSource?.mode==='standalone','standalone after Hub');assert.equal(u.frames.get(u.actualLegacyId).frame,frame);assert.equal(u.d.querySelectorAll('[data-miemie-polisher-standalone]').length,1);assert.equal(u.d.querySelectorAll('#meeme-translation').length,1);u.click('[data-miemie-polisher-standalone]');await until(()=>u.q('#meeme-translation section').hidden===false,'standalone opens original UI');
  });
  await check('updated complete artifacts repeatedly recollect after Hub restart with no duplicate DOM or event subscriptions',async()=>{
    const frame=u.frames.get(u.actualLegacyId).frame;
    for(let i=0;i<3;i++){
      await u.restartHub();assert.equal(u.h.__MieMiePolisherSource.mode,'hub');assert.equal(u.q('[data-miemie-polisher-standalone]'),null);assert.equal(u.d.querySelectorAll('[data-hub-app="miemie.polisher"]').length,1);assert.equal(u.d.querySelectorAll('#meeme-translation').length,1);
      assert.equal([...u.subscriptions].filter(s=>s.id===u.actualLegacyId).length,10);assert.equal(u.frames.get(u.actualLegacyId).frame,frame);
      await u.stopHub();assert.equal(u.h.__MieMiePolisherSource.mode,'standalone');assert.equal([...u.subscriptions].filter(s=>s.id===u.actualLegacyId).length,10);assert.equal(u.d.querySelectorAll('[data-miemie-polisher-standalone]').length,1);
    }
  });
  await u.close();activeFixture=null;
  const failed=activeFixture=await fixture({cors:true});
  await check('real center displays CORS/readability failure without partial script installation',async()=>{
    await failed.center();failed.q('[aria-label="GitHub Repository URL"]').value=repoURL;await failed.action('github:preview');await until(()=>failed.q('[data-hub-panel="extension-center"]').textContent.match(/安全下载服务暂(?:不可用|时无法连接)/),'safe download service error');assert.equal(failed.installed(),undefined);assert.equal(failed.writes.length,0);checkTimeline(failed.h);await failed.h.__MieMieHub.open();assert.ok(failed.q('[data-hub-app="settings"]'));
  });
  await failed.close();activeFixture=null;
  const bad=activeFixture=await fixture({corrupt:true});
  await check('corrupt package bytes fail integrity verification after UI install click without writing any host script',async()=>{
    await bad.center();bad.q('[aria-label="GitHub Repository URL"]').value=repoURL;await bad.action('github:preview');await until(()=>bad.q('[data-action="package:install"]'),'corrupt package preview');await bad.action('package:install');
    await until(()=>bad.q('[data-hub-panel="extension-center"]').textContent.includes('digest 校验失败'),'integrity error');assert.equal(bad.installed(),undefined);assert.equal(bad.writes.length,0);assert.equal(bad.backups.length,0);assert.equal(bad.h.__MieMieHub.extensions.get('miemie.polisher'),null);assert.deepEqual(bad.trees()[0],bad.other);
  });
  await bad.close();activeFixture=null;
} catch(error) {
  results.push({passed:false,error:error.stack||String(error)});
  if(activeFixture)try{await activeFixture.close();}catch(cleanup){results.push({passed:false,error:'Cleanup: '+cleanup.stack});}
}
const report={environment:'Development Fixture: Node.js + jsdom; complete built artifacts, mocked official host APIs and author GitHub; no real browser/CORS/OAuth proof',artifacts,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,checks:results};
await mkdir(path.join(project,'test-results'),{recursive:true});await writeFile(flags.get('--report')||path.join(project,'test-results/ecosystem.json'),JSON.stringify(report,null,2)+'\n');
if(report.failed){console.error(results.filter(x=>!x.passed));process.exitCode=1;}else console.log('PASS: '+report.passed+' ecosystem artifact golden-path checks.');
