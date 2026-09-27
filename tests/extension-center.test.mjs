import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {createExtensionCenter} from '../src/extension-center.js';
const tick=()=>new Promise(r=>setImmediate(r));
const github={id:'dev-github',name:'Development Fixture <script>',description:'Test Data',author:'Fixture Author',sourceType:'github',sourceUrl:'https://github.com/example/extension',submitter:{displayName:'Development Submitter',avatarUrl:null},github:{compatibility:'installable',manifest:{id:'fixture.package'}},status:'listed',moderation:'visible'};
const discord={...github,id:'dev-discord',sourceType:'discord',sourceUrl:'https://discord.com/channels/111111111111111111/222222222222222222',github:null};
function fixture(t,{identity=null,request,defaultBase='',storedBase='https://registry.example',shortcuts}={}){
 const dom=new JSDOM('<header id="account"></header><div id="body"></div>',{url:'https://tavern.example'}),host=dom.window,body=host.document.querySelector('#body');if(storedBase!==null)host.localStorage.setItem('miemie_registry_url_v1',storedBase);
 const calls=[],listeners=new Set();const notify=()=>{for(const listener of listeners)listener(who);};let base=defaultBase,who=identity,records=[{manifest:{id:'fixture.background',name:'Background Development Fixture',version:'1.0.0'},enabled:true,launcherAvailable:false,state:'enabled'}];
 const registry={setBase(v){if(base!==v){base=v;notify();}},getBase:()=>base,getDefaultBase:()=>defaultBase,getIdentity:()=>who,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},setIdentity(value){who=value;notify();},async login(){who={profile:{displayName:'Development Submitter'}};notify();},async logout(){who=null;notify();},dispose(){calls.push('registry.dispose');},async api(path,options){calls.push({path,options});if(request)return request(path,options);if(path.startsWith('/api/catalog'))return {items:[github,discord],hasMore:false};if(path==='/api/submissions'&&!options?.method)return {items:[github]};return {ok:true};}};
 const runtime={list:()=>records,get:id=>records.find(x=>x.manifest.id===id),open:async id=>{calls.push('open:'+id);return {ok:true};},disable:async id=>{records.find(x=>x.manifest.id===id).enabled=false;},enable:async id=>{records.find(x=>x.manifest.id===id).enabled=true;},uninstall:async id=>{records=records.filter(x=>x.manifest.id!==id);}};
 const packages={async listInstalled(){return [];},async inspect(url){calls.push('inspect:'+url);return {installable:true,id:'fixture.package',manifest:{name:'Development Fixture'},version:'1.0.1'};},async install(candidate){calls.push('install:'+candidate.id);},dispose(){calls.push('packages.dispose');}};
 const account=host.document.querySelector('#account');const center=createExtensionCenter({host,body,accountContainer:account,runtime,shortcuts,sources:{list:()=>[],register:async()=>{}},packages,registry});
 t.after(()=>{center.dispose();dom.window.close();});
 async function click(text){const b=[...host.document.querySelectorAll('button')].find(x=>x.textContent===text);assert.ok(b,text);b.click();await tick();await tick();}
 return {host,body,account,center,calls,click,runtime,registry,packages};
}
test('discover keeps ordinary-user actions even for owner; source paths and install capability remain distinct',async t=>{const f=fixture(t,{identity:{profile:{displayName:'Development Submitter'}}});await f.center.activate('discover');assert.equal(f.body.querySelector('script'),null);assert.match(f.body.textContent,/Fixture Author/);assert.match(f.body.textContent,/Development Submitter/);assert.equal([...f.body.querySelectorAll('button')].some(b=>/编辑|下架/.test(b.textContent)),false);assert.equal(f.body.querySelector('[data-catalog-id="dev-discord"] a').href,discord.sourceUrl);assert.equal(f.body.querySelector('[data-catalog-id="dev-discord"] button'),null);await f.click('安装');assert.ok(f.calls.includes('inspect:'+github.sourceUrl));assert.ok(f.calls.includes('install:fixture.package'));assert.equal(f.center.getActive(),'installed');});
test('Registry offline is isolated from installed background lifecycle and Core-facing local UI',async t=>{const f=fixture(t,{request:()=>{throw Error('offline');}});await f.center.activate('discover');assert.match(f.body.textContent,/扩展目录无法连接/);await f.center.activate('installed');assert.match(f.body.textContent,/Background Development Fixture/);assert.equal([...f.body.querySelectorAll('button')].some(b=>b.textContent==='打开'),false);await f.click('停用');assert.equal(f.runtime.list()[0].enabled,false);await f.click('启用');assert.equal(f.runtime.list()[0].enabled,true);await f.click('Runtime 注销');assert.equal(f.runtime.list().length,0);});
test('mine login and editing controls stay separate; admin-hidden records cannot claim relisting',async t=>{const f=fixture(t,{request:()=>({items:[{...github,moderation:'hidden',moderationReason:'Development moderation fixture'}]})});await f.center.activate('mine');assert.match(f.body.textContent,/使用右上角 Discord 登录入口后/);await f.click('Discord 登录');assert.ok([...f.body.querySelectorAll('button')].some(x=>x.textContent==='编辑'));assert.equal([...f.body.querySelectorAll('button')].some(x=>x.textContent==='下架'||x.textContent==='重新上架'),false);assert.match(f.body.textContent,/hidden/);assert.equal([...f.body.querySelectorAll('button')].some(x=>x.textContent==='管理员管理'),false);await f.click('编辑');const input=f.body.querySelector('[name="name"]');input.value='New fixture name';const form=f.body.querySelector('form');form.dispatchEvent(new f.host.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.ok(f.calls.some(x=>x.path==='/api/submissions/dev-github'&&x.options.method==='PATCH'&&x.options.body.name==='New fixture name'));});
test('slow mine response cannot replace an open submission form',async t=>{let resolve;const f=fixture(t,{identity:{profile:{displayName:'Development Submitter'}},request:()=>new Promise(r=>{resolve=r;})});const pending=f.center.activate('mine');await tick();await f.click('提交扩展');resolve({items:[github]});await pending;assert.ok(f.body.querySelector('[data-submission-form]'));assert.equal(f.body.querySelectorAll('article').length,0);});
test('Catalog pagination/search use optional authorized API and late previous tab results are discarded',async t=>{let resolve;const f=fixture(t,{request:()=>new Promise(r=>{resolve=r;})});const pending=f.center.activate('discover');await tick();await f.center.activate('installed');resolve({items:[github],hasMore:true});await pending;assert.equal(f.body.querySelector('[data-catalog-id]'),null);assert.match(f.body.textContent,/Background Development Fixture/);assert.ok(f.calls[0].path.startsWith('/api/catalog?page=1&pageSize=12'));});

test('Catalog requires active submission; opening discover never seeds Polisher or submits a repository',async t=>{
 const f=fixture(t,{request:()=>({items:[]})});await f.center.activate('discover');assert.equal(f.body.querySelector('[aria-label="GitHub Repository URL"]').value,'');assert.equal(f.body.querySelector('[data-catalog-id]'),null);assert.doesNotMatch(f.body.textContent,/Polisher|SheepSheepLab/);assert.ok(f.calls.every(call=>call.path?.startsWith('/api/catalog')));assert.equal(f.calls[0].options.authenticated,'optional');
});
test('official default supports discovery and Discord login without address controls in any center tab',async t=>{
 const f=fixture(t,{defaultBase:'https://official-registry.example',storedBase:null});
 await f.center.activate('discover');assert.equal(f.registry.getBase(),'https://official-registry.example');assert.ok(f.calls.some(x=>x.path?.startsWith('/api/catalog')));assert.match(f.body.textContent,/Development Fixture/);
 for(const tab of ['discover','installed','mine']){await f.center.activate(tab);assert.equal(f.body.querySelector('[aria-label="Registry 服务地址"]'),null);assert.equal(f.body.querySelector('[data-action="registry:configure"]'),null);assert.doesNotMatch(f.body.textContent,/Registry|高级 \/ 开发者|服务地址/);}
 await f.click('Discord 登录');assert.match(f.account.textContent,/Development Submitter/);assert.ok(f.account.querySelector('[data-action="registry:logout"]'));await f.click('退出');assert.equal(f.account.querySelector('[data-action="registry:login"]').textContent,'Discord 登录');
});
test('existing local override is retained without exposing a center configuration form',async t=>{
 const f=fixture(t,{defaultBase:'https://official-registry.example',storedBase:'http://127.0.0.1:8787'});await f.center.activate('mine');assert.equal(f.registry.getBase(),'http://127.0.0.1:8787');assert.equal(f.body.querySelector('input'),null);
});
test('Discord submission defaults public and derives guild restriction from the source URL on the server',async t=>{
 const f=fixture(t,{identity:{profile:{displayName:'Development Submitter'}}});await f.center.activate('mine');await f.click('提交扩展');const form=f.body.querySelector('[data-submission-form]');const field=name=>form.querySelector('[name="'+name+'"]');assert.equal(field('visibility').value,'public');
 field('sourceType').value='discord';field('sourceType').dispatchEvent(new f.host.Event('change'));field('visibility').value='discord_guild';field('visibility').dispatchEvent(new f.host.Event('change'));
 assert.equal(field('discordUrl').required,true);assert.equal(field('githubUrl').required,false);for(const[key,value]of Object.entries({name:'Development Guild Fixture',author:'Fixture Author',description:'Test Data',discordUrl:'https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333',tags:'test, development'}))field(key).value=value;
 field('discordUrl').dispatchEvent(new f.host.Event('input'));form.dispatchEvent(new f.host.Event('submit',{cancelable:true}));await tick();const sent=f.calls.find(x=>x.path==='/api/submissions'&&x.options?.method==='POST').options.body;
 assert.equal(sent.visibility,'discord_guild');assert.equal(sent.sourceType,'discord');assert.deepEqual(sent.tags,['test','development']);assert.equal(sent.visibilitySourceUrl,sent.discordUrl);assert.equal(sent.visibilityGuildId,undefined);assert.equal(sent.ownerDiscordUserId,undefined);
});
test('GitHub restricted submission sends an explicit Discord post while editing cannot change owner',async t=>{
 const own={...github,visibility:'discord_guild',visibilitySourceUrl:'https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333',tags:['development'],ownerDiscordUserId:'not-for-client-edit'};
 const f=fixture(t,{identity:{profile:{displayName:'Development Submitter'}},request:()=>({items:[own]})});await f.center.activate('mine');await f.click('编辑');const form=f.body.querySelector('form'),field=name=>form.querySelector('[name="'+name+'"]');assert.equal(field('visibility').value,'discord_guild');assert.equal(field('visibilitySourceUrl').value,own.visibilitySourceUrl);assert.equal(field('visibilitySourceUrl').required,true);assert.equal(field('discordUrl').value,'');assert.equal(field('discordUrl').required,false);assert.equal(field('ownerDiscordUserId'),null);
 field('githubUrl').value='https://github.com/example/changed';field('description').value='Changed Test Data';form.dispatchEvent(new f.host.Event('submit',{cancelable:true}));await tick();const payload=f.calls.find(x=>x.options?.method==='PATCH').options.body;assert.equal(payload.visibilitySourceUrl,own.visibilitySourceUrl);assert.equal(payload.sourceUrl,'https://github.com/example/changed');assert.equal(payload.ownerDiscordUserId,undefined);
});
test('GitHub preview only prefills current source and never auto-creates a Catalog entry',async t=>{
 let finish;const f=fixture(t,{identity:{profile:{displayName:'Development Submitter'}},request:path=>path.startsWith('/api/github/preview')?new Promise(r=>{finish=r;}):{items:[]}});await f.center.activate('mine');await f.click('提交扩展');const form=f.body.querySelector('form'),url=form.querySelector('[name="githubUrl"]'),name=form.querySelector('[name="name"]');url.value='https://github.com/example/first';await f.click('读取 GitHub 资料');url.value='https://github.com/example/second';finish({manifest:{name:'Stale Repository',author:'Old',description:'Old'}});await tick();assert.equal(name.value,'');assert.ok(!f.calls.some(x=>x.options?.method==='POST'&&x.path==='/api/submissions'));
});
test('logout immediately removes restricted cards and stale authorized Catalog cannot restore them',async t=>{
 let finish;let requests=0;const f=fixture(t,{identity:{profile:{displayName:'Development Submitter'}},request:()=>{requests++;if(requests===1)return {items:[{...discord,name:'Private Guild Fixture',visibility:'discord_guild'}]};return new Promise(r=>{finish=r;});}});await f.center.activate('discover');assert.match(f.body.textContent,/Private Guild Fixture/);
 f.registry.setIdentity(null);assert.doesNotMatch(f.body.textContent,/Private Guild Fixture/);assert.equal(f.body.querySelector('[data-catalog-id]'),null);finish({items:[]});await tick();assert.equal(f.body.querySelector('[data-catalog-id]'),null);
 let stale;const g=fixture(t,{identity:{profile:{displayName:'Old Profile'}},request:()=>new Promise(r=>{stale=r;})});const old=g.center.activate('discover');await tick();const oldFinish=stale;g.registry.setIdentity(null);oldFinish({items:[{...discord,name:'Old Private Fixture'}]});await old;assert.doesNotMatch(g.body.textContent,/Old Private Fixture/);stale({items:[]});await tick();
});
test('session expiry removes an open private form and restores the Discord login action',async t=>{
 const f=fixture(t,{identity:{profile:{displayName:'Development Submitter'}}});await f.center.activate('mine');await f.click('编辑');assert.ok(f.body.querySelector('[data-submission-form]'));f.registry.setIdentity(null);assert.equal(f.body.querySelector('[data-submission-form]'),null);assert.match(f.body.textContent,/使用右上角 Discord 登录入口后/);assert.equal(f.account.querySelector('button[data-action="registry:login"]').textContent,'Discord 登录');
});

test('installed UI shows persisted version and preserved name; failed update cannot claim success', async t=>{
 const f=fixture(t);let saved='1.0.0';
 f.packages.listInstalled=async()=>[{id:'fixture.background',name:'Original Name 0.9.0',version:saved,memoryVersion:'1.0.1',enabled:true,repoUrl:'https://github.com/example/extension',persistenceError:'服务器仍保存旧内容'}];
 f.packages.check=async()=>({available:true,version:'1.0.1'});
 f.packages.update=async()=>{throw Error('保存尚未确认');};
 await f.center.activate('installed');await f.click('检查更新');await f.click('更新');
 assert.match(f.body.querySelector('[role="status"]').textContent,/保存尚未确认/);
 assert.doesNotMatch(f.body.querySelector('[role="status"]').textContent,/更新完成/);
 assert.match(f.body.querySelector('article small').textContent,/1.0.0/);
 assert.match(f.body.textContent,/Original Name 0.9.0（更新保留原名/);
 assert.equal(f.body.querySelector('[data-action="fixture.background:reload-page"]'),null);
 saved=null;await f.center.activate('installed');assert.match(f.body.querySelector('article small').textContent,/保存版本待确认/);
});
test('confirmed package update reports durable success and separately labels a stale runtime',async t=>{
 const f=fixture(t);f.packages.listInstalled=async()=>[{id:'fixture.background',name:'Fixture 1.0.0',version:'1.0.1',memoryVersion:'1.0.1',enabled:true,repoUrl:'https://github.com/example/extension'}];
 f.packages.check=async()=>({available:true,version:'1.0.2'});
 f.packages.update=async()=>({action:'updated',persistence:'confirmed',runtimeConfirmed:false});
 await f.center.activate('installed');assert.match(f.body.textContent,/已保存版本：1.0.1 · 实际运行版本：1.0.0/);assert.ok(f.body.querySelector('[data-action="fixture.background:reload-page"]'));assert.match(f.body.textContent,/停止生成并保存编辑/);
 await f.click('检查更新');await f.click('更新');assert.match(f.body.querySelector('[role="status"]').textContent,/确认服务器保存/);assert.doesNotMatch(f.body.querySelector('[role="status"]').textContent,/新版运行已确认/);
});

test('Standalone and Web listings cannot enter Package install despite installable discovery; official is explicit server metadata',async t=>{
 const items=[{...github,id:'app',type:'standalone_app',distribution:'external_release',platforms:['macos'],classification:'community',author:'SheepSheep'},{...github,id:'web',type:'web_tool',distribution:'open_url',websiteUrl:'https://author.example/tool',classification:'official'}];
 const f=fixture(t,{request:()=>({items})});await f.center.activate('discover');
 for(const id of ['app','web'])assert.equal(f.body.querySelector(`[data-catalog-id="${id}"] button`),null);
 assert.match(f.body.querySelector('[data-catalog-id="app"]').textContent,/🧩社区扩展/);assert.doesNotMatch(f.body.querySelector('[data-catalog-id="app"]').textContent,/🐑官方扩展/);
 assert.equal(f.body.querySelector('[data-catalog-id="web"] a').href,'https://author.example/tool');assert.match(f.body.querySelector('[data-catalog-id="web"]').textContent,/🐑官方扩展/);
 assert.equal(f.calls.some(x=>typeof x==='string'&&x.startsWith('inspect:')),false);
});
test('Hub never exposes management operations even when identity is Owner/Admin',async t=>{
 const f=fixture(t,{identity:{isAdmin:true,isOwner:true,canPublishOfficial:true,profile:{displayName:'Fixture Owner'}}});await f.center.activate('mine');assert.doesNotMatch(f.body.textContent,/管理员管理|封禁|授予|Security Hold/);assert.equal(f.calls.some(x=>x.path?.startsWith('/api/admin')),false);
 await f.click('提交扩展');assert.equal(f.body.querySelector('[name="classification"]'),null);
});
test('submission form separates product/distribution/platforms and Web URL while preserving source and ownership rules',async t=>{
 const f=fixture(t,{identity:{profile:{displayName:'Fixture'}}});await f.center.activate('mine');await f.click('提交扩展');const form=f.body.querySelector('form'),field=n=>form.querySelector(`[name="${n}"]`);
 assert.equal(field('classification'),null);field('type').value='web_tool';field('type').dispatchEvent(new f.host.Event('change'));assert.equal(field('distribution').value,'open_url');assert.equal(field('websiteUrl').required,true);
 for(const [k,v]of Object.entries({name:'Web Test',author:'Fixture',description:'Test',githubUrl:'https://github.com/example/web',websiteUrl:'https://author.example/tool',platforms:'web'}))field(k).value=v;
 form.dispatchEvent(new f.host.Event('submit',{cancelable:true}));await tick();const sent=f.calls.find(x=>x.options?.method==='POST').options.body;assert.equal(sent.type,'web_tool');assert.equal(sent.distribution,'open_url');assert.deepEqual(sent.platforms,['web']);assert.equal(sent.classification,undefined);
});

test('legacy and self-claimed catalog items show community; only explicit server classification shows official',async t=>{
 const items=[{...github,id:'old',author:'SheepSheep',submitter:{displayName:'SheepSheep'},official:true,github:{...github.github,manifest:{classification:'official'}}},
  {...discord,id:'external-official',author:'星夜',classification:'official'},
  {...github,id:'unknown',classification:'mirror'}];
 const f=fixture(t,{request:()=>({items})});await f.center.activate('discover');
 for(const id of ['old','unknown'])assert.match(f.body.querySelector(`[data-catalog-id="${id}"]`).textContent,/🧩社区扩展/);
 assert.match(f.body.querySelector('[data-catalog-id="external-official"]').textContent,/🐑官方扩展/);
 assert.match(f.body.querySelector('[data-catalog-id="external-official"]').textContent,/来源：Discord/);
});

test('account labels use explicit banned first, then admin, without exposing Owner or guessing from canSubmit',async t=>{
 for(const [flags,label]of [
  [{banned:false,isAdmin:false},'普通用户'],[{banned:false,isAdmin:true},'管理员'],
  [{banned:false,isAdmin:true,isOwner:true},'管理员'],[{banned:true,isAdmin:false},'受限用户'],
  [{banned:true,isAdmin:true,isOwner:true},'受限用户'],[{canSubmit:false},'普通用户'],
 ]){
  const identity={profile:{displayName:'Account Fixture'},...flags};const f=fixture(t,{identity});await f.center.activate('mine');
  assert.equal(f.account.querySelector('[data-account-status]').textContent,label);
  assert.doesNotMatch(f.account.querySelector('.mm-submit-profile').textContent,/Owner|封禁用户/);
  assert.equal(f.registry.getIdentity().isOwner,flags.isOwner);
 }
});

test('header account reacts on installed tab; server roles stay intact and mine has no duplicate login',async t=>{
 const f=fixture(t);await f.center.activate('installed');assert.ok(f.account.querySelector('[data-action="registry:login"]'));
 f.registry.setIdentity({profile:{displayName:'Owner'},isAdmin:true,isOwner:true,banned:false});
 assert.equal(f.account.querySelector('[data-account-status]').textContent,'管理员');assert.equal(f.registry.getIdentity().isOwner,true);assert.equal(f.body.querySelector('[data-account-status]'),null);
 f.registry.setIdentity({profile:{displayName:'Restricted'},isAdmin:true,banned:true});assert.equal(f.account.querySelector('[data-account-status]').textContent,'受限用户');
 await f.center.activate('mine');assert.equal(f.body.querySelector('[data-action="registry:login"]'),null);
});
test('compact cards use server identity badges and native accessible filter preserves request semantics',async t=>{
 const f=fixture(t,{request:()=>({items:[{...github,classification:'official'},discord]})});await f.center.activate('discover');
 assert.equal(f.body.querySelector('[data-catalog-id="dev-github"] .mm-catalog-assurance .mm-identity-badge').textContent,'🐑官方扩展');
 assert.equal(f.body.querySelector('[data-catalog-id="dev-discord"] .mm-identity-badge').textContent,'🧩社区扩展');
 const filter=f.body.querySelector('select[aria-label="来源筛选"]');filter.value='discord';const search=f.body.querySelector('input[aria-label="搜索扩展"]');search.value='社区';filter.closest('form').dispatchEvent(new f.host.Event('submit',{cancelable:true}));await tick();
 assert.match(f.calls.at(-1).path,/source=discord/);assert.match(f.calls.at(-1).path,/q=%E7%A4%BE%E5%8C%BA/);
});

test('synchronous session expiry while rendering header cannot duplicate login controls',async t=>{
 const f=fixture(t,{identity:{profile:{displayName:'Expiring'}}});await f.center.activate('installed');let expire=true;
 f.registry.getIdentity=()=>{if(expire){expire=false;f.registry.setIdentity(null);}return null;};
 await f.center.activate('mine');assert.equal(f.account.querySelectorAll('[data-action="registry:login"]').length,1);assert.equal(f.account.querySelectorAll('[data-account-status]').length,0);
});


test('catalog title carries version, installed is a noninteractive status and submitter retains avatar',async t=>{
 const item={...github,version:'1.2.3',github:{...github.github,manifest:{id:'fixture.background'}},submitter:{displayName:'Distinct Submitter',avatarUrl:'https://registry.example/api/avatars/fixture'}};
 const f=fixture(t,{request:()=>({items:[item]})});await f.center.activate('discover');const card=f.body.querySelector('[data-catalog-id]');
 assert.equal(card.querySelector('.mm-catalog-title strong').textContent,item.name);
 assert.equal(card.querySelector('.mm-catalog-title .mm-catalog-version').textContent,'1.2.3');
 assert.equal(card.querySelector('.mm-installed-status').textContent,'已安装');assert.equal(card.querySelector('.mm-installed-status').tagName,'SPAN');
 assert.equal(card.querySelector('.mm-extension-actions button'),null);
 assert.ok(card.querySelector('.mm-catalog-assurance .mm-hub-note'));
 assert.ok(card.querySelector('.mm-catalog-footer .mm-catalog-links'));
 assert.ok(card.querySelector('.mm-catalog-details .mm-catalog-meta'));
 assert.ok(card.querySelector('.mm-catalog-details .mm-catalog-submitter'));
 assert.equal(card.querySelector('.mm-extension-actions a'),null);
 assert.equal(card.querySelector('.mm-catalog-links a').href,item.sourceUrl);
 assert.doesNotMatch(card.textContent,/查看 GitHub/);
 assert.equal(card.querySelector('.mm-catalog-submitter img').src,item.submitter.avatarUrl);
 assert.match(card.querySelector('.mm-catalog-submitter').textContent,/Distinct Submitter/);
 assert.doesNotMatch(card.querySelector('.mm-catalog-meta').textContent,/1.2.3|投稿者/);
});

test('public project links and private visibility evidence remain independent',async t=>{
 const f=fixture(t,{identity:{profile:{displayName:'Fixture'}}});await f.center.activate('mine');await f.click('提交扩展');const form=f.body.querySelector('form'),field=n=>form.querySelector(`[name="${n}"]`);
 assert.equal(field('sourceUrl'),null);assert.equal(field('discordUrl').parentElement.hidden,false);assert.equal(field('discordUrl').required,false);
 for(const[k,v]of Object.entries({name:'Test',author:'Author',description:'Test description',githubUrl:'https://github.com/example/new',discordUrl:'https://discord.com/channels/111111111111111111/222222222222222222'}))field(k).value=v;
 field('visibility').value='discord_guild';field('visibility').dispatchEvent(new f.host.Event('change'));assert.equal(field('discordUrl').required,false);assert.equal(field('visibilitySourceUrl').required,true);field('visibilitySourceUrl').value='https://discord.com/channels/333333333333333333/444444444444444444';
 form.dispatchEvent(new f.host.Event('submit',{cancelable:true}));await tick();const sent=f.calls.find(x=>x.options?.method==='POST').options.body;assert.equal(sent.githubUrl,sent.sourceUrl);assert.notEqual(sent.discordUrl,sent.visibilitySourceUrl);assert.equal(sent.visibilitySourceUrl,field('visibilitySourceUrl').value);
});
test('catalog shows both project links with explicit absent placeholders and safe URL handling',async t=>{
 const post='https://discord.com/channels/111111111111111111/222222222222222222';
 const f=fixture(t,{request:()=>({items:[{...github,discordUrl:post},{...discord,id:'none',sourceUrl:'javascript:alert(1)'}]})});await f.center.activate('discover');
 const links=f.body.querySelector('[data-catalog-id="dev-github"] .mm-catalog-links');assert.deepEqual([...links.querySelectorAll('a')].map(a=>a.href),[github.sourceUrl,post]);assert.ok([...links.querySelectorAll('a')].every(a=>a.textContent==='点击查看'));assert.doesNotMatch(links.textContent,/https:/);
 const missing=f.body.querySelector('[data-catalog-id="none"] .mm-catalog-links');assert.equal(missing.querySelectorAll('a').length,0);assert.match(missing.textContent,/GitHub 网址：暂无Discord 网址：暂无/);
});

test('Discord verification displays server identity, clears on edits and ignores stale responses',async t=>{
 let finish;const f=fixture(t,{identity:{profile:{displayName:'Fixture'}},request:path=>path.startsWith('/api/discord/verify')?new Promise(r=>finish=r):{items:[]}});
 await f.center.activate('mine');await f.click('提交扩展');const field=f.body.querySelector('[name="visibilitySourceUrl"]'),result=f.body.querySelector('.mm-guild-verification'),visibility=f.body.querySelector('[name="visibility"]');
 field.value='https://discord.com/channels/111111111111111111/222222222222222222';visibility.value='discord_guild';visibility.dispatchEvent(new f.host.Event('change'));await f.click('验证');
 assert.ok(field.closest('.mm-visibility-source'));assert.ok(result.closest('.mm-visibility-source'));assert.equal(f.body.querySelector('[name="discordUrl"]').parentElement.querySelector('button'),null);assert.match(result.textContent,/正在验证/);assert.equal(f.calls.at(-1).options.authenticated,true);
 finish({member:true,guild:{name:'Verified community',iconUrl:'https://cdn.discordapp.com/icons/111111111111111111/0123456789abcdef0123456789abcdef.png'}});await tick();assert.match(result.textContent,/Verified community/);assert.match(result.textContent,/保存后仅该服务器成员可见/);assert.ok(result.querySelector('img'));
 field.dispatchEvent(new f.host.Event('input'));assert.equal(result.textContent,'');await f.click('验证');field.value+='3';field.dispatchEvent(new f.host.Event('input'));finish({member:true,guild:{name:'Stale community'}});await tick();assert.equal(result.textContent,'');
 await f.click('验证');finish({member:false,guild:{name:'Not verified'}});await tick();assert.match(result.textContent,/验证失败/);assert.doesNotMatch(result.textContent,/成员资格已验证/);
});

test('stale Catalog identity and expired installability are blocked after fresh inspection',async t=>{
 for(const candidate of [{installable:false,reason:'changed release'},{installable:true,id:'different.extension'}]){
  const f=fixture(t);f.packages.inspect=async()=>candidate;await f.center.activate('discover');await f.click('安装');assert.equal(f.calls.some(x=>typeof x==='string'&&x.startsWith('install:')),false);assert.equal(f.center.getActive(),'discover');
 }
});
test('external Tavern declaration never gains Install; preview language cannot change declared type',async t=>{
 const f=fixture(t,{identity:{profile:{displayName:'Tester'}},request:path=>path.startsWith('/api/catalog')?{items:[{...github,type:'tavern_extension',distribution:'external_release'}]}:path.startsWith('/api/github/preview')?{compatibility:'external',language:'JavaScript'}:{items:[]}});
 await f.center.activate('discover');assert.equal(f.body.querySelector('[data-catalog-id] button'),null);
 await f.center.activate('mine');await f.click('提交扩展');const type=f.body.querySelector('[name=type]');type.value='standalone_app';type.dispatchEvent(new f.host.Event('change'));f.body.querySelector('[name=githubUrl]').value=github.sourceUrl;await f.click('读取 GitHub 资料');assert.equal(type.value,'standalone_app');assert.match(f.body.querySelector('[data-package-detection]').textContent,/未检测到 Hub 安装包/);
 const distribution=f.body.querySelector('[name=distribution]');distribution.value='managed_install';f.body.querySelector('form').dispatchEvent(new f.host.Event('submit',{cancelable:true}));await tick();assert.equal(f.calls.some(x=>x.options?.method==='POST'),false);
});

test('shortcut switch handles touch activation and disables while Runtime is busy',async t=>{
 let on=false,calls=0;const f=fixture(t,{shortcuts:{enabled:()=>on,mounted:()=>on,set(_id,value){on=value;calls++;}}});
 const record=f.runtime.get('fixture.background');record.shortcutLauncherAvailable=true;record.launcherAvailable=true;record.busy=true;
 await f.center.activate('installed');let toggle=f.body.querySelector('[role="switch"]');assert.equal(toggle.disabled,true);toggle.click();assert.equal(calls,0);assert.equal(toggle.getAttribute('aria-checked'),'false');
 record.busy=false;await f.center.activate('installed');toggle=f.body.querySelector('[role="switch"]');assert.equal(toggle.disabled,false);
 const tap=new f.host.MouseEvent('click',{bubbles:true,cancelable:true,detail:1});Object.defineProperty(tap,'pointerType',{value:'touch'});toggle.dispatchEvent(tap);assert.equal(calls,1);assert.equal(toggle.getAttribute('aria-checked'),'true');
 toggle.click();assert.equal(calls,2);assert.equal(toggle.getAttribute('aria-checked'),'false');
});
