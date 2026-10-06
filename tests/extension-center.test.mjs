import {readFileSync} from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {createExtensionCenter} from '../src/extension-center.js';
const tick=()=>new Promise(r=>setImmediate(r));
const github={id:'dev-github',name:'Development Fixture <script>',description:'Test Data',author:'Fixture Author',sourceType:'github',sourceUrl:'https://github.com/example/extension',submitter:{displayName:'Development Submitter',avatarUrl:null},github:{compatibility:'installable',manifest:{id:'fixture.package'}},status:'listed',moderation:'visible'};
const discord={...github,id:'dev-discord',sourceType:'discord',sourceUrl:'https://discord.com/channels/111111111111111111/222222222222222222',github:null};
function fixture(t,{identity=null,request,defaultBase='',storedBase='https://registry.example',shortcuts,exportDiagnostics}={}){
 const dom=new JSDOM('<header id="account"></header><div id="body"></div>',{url:'https://tavern.example'}),host=dom.window,body=host.document.querySelector('#body');if(storedBase!==null)host.localStorage.setItem('miemie_registry_url_v1',storedBase);
 const calls=[],listeners=new Set();const notify=()=>{for(const listener of listeners)listener(who);};let base=defaultBase,who=identity,records=[{manifest:{id:'fixture.background',name:'Background Development Fixture',version:'1.0.0'},enabled:true,launcherAvailable:false,state:'enabled'}];
 const registry={setBase(v){if(base!==v){base=v;notify();}},getBase:()=>base,getDefaultBase:()=>defaultBase,getIdentity:()=>who,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},setIdentity(value){who=value;notify();},async login(){who={profile:{displayName:'Development Submitter'}};notify();},async logout(){who=null;notify();},dispose(){calls.push('registry.dispose');},async api(path,options){calls.push({path,options});if(request)return request(path,options);if(path.startsWith('/api/catalog'))return {items:[github,discord],hasMore:false};if(path.startsWith('/api/github/preview'))return {compatibility:'installable'};if(path==='/api/submissions'&&!options?.method)return {items:[github]};return {ok:true};}};
 const runtime={list:()=>records,get:id=>records.find(x=>x.manifest.id===id),open:async id=>{calls.push('open:'+id);return {ok:true};},disable:async id=>{records.find(x=>x.manifest.id===id).enabled=false;},enable:async id=>{records.find(x=>x.manifest.id===id).enabled=true;},uninstall:async id=>{records=records.filter(x=>x.manifest.id!==id);}};
 const packages={exportDiagnostics,async listInstalled(){return [];},async inspect(url){calls.push('inspect:'+url);return {installable:true,id:'fixture.package',manifest:{name:'Development Fixture'},version:'1.0.1'};},async install(candidate){calls.push('install:'+candidate.id);},dispose(){calls.push('packages.dispose');}};
 const account=host.document.querySelector('#account');const center=createExtensionCenter({host,body,accountContainer:account,runtime,shortcuts,sources:{list:()=>[],register:async()=>{}},packages,registry});
 t.after(()=>{center.dispose();dom.window.close();});
 async function click(text){const b=[...host.document.querySelectorAll('button')].find(x=>x.textContent===text);assert.ok(b,text);b.click();await tick();await tick();}
 return {host,body,account,center,calls,click,runtime,registry,packages};
}
test('discover keeps ordinary-user actions even for owner; source paths and install capability remain distinct',async t=>{const f=fixture(t,{identity:{profile:{displayName:'Development Submitter'}}});await f.center.activate('discover');assert.equal(f.body.querySelector('script'),null);assert.match(f.body.textContent,/Fixture Author/);assert.match(f.body.textContent,/Development Submitter/);assert.equal([...f.body.querySelectorAll('button')].some(b=>/编辑|下架/.test(b.textContent)),false);assert.equal(f.body.querySelector('[data-catalog-id="dev-discord"] a').href,discord.sourceUrl);assert.equal(f.body.querySelector('[data-catalog-id="dev-discord"] [data-package-install]'),null);await f.click('安装');assert.ok(f.calls.includes('inspect:'+github.sourceUrl));assert.ok(f.calls.includes('install:fixture.package'));assert.equal(f.center.getActive(),'installed');});
test('Registry offline is isolated from installed background lifecycle and Core-facing local UI',async t=>{const f=fixture(t,{request:()=>{throw Error('offline');}});await f.center.activate('discover');assert.match(f.body.textContent,/扩展目录无法连接/);await f.center.activate('installed');assert.match(f.body.textContent,/Background Development Fixture/);assert.equal([...f.body.querySelectorAll('button')].some(b=>b.textContent==='打开'),false);await f.click('停用');assert.equal(f.runtime.list()[0].enabled,false);await f.click('启用');assert.equal(f.runtime.list()[0].enabled,true);await f.click('Runtime 注销');assert.equal(f.runtime.list().length,0);});
test('mine login and editing controls stay separate; admin-hidden records cannot claim relisting',async t=>{const f=fixture(t,{request:path=>path.startsWith('/api/github/preview')?{compatibility:'installable'}:{items:[{...github,moderation:'hidden',moderationReason:'Development moderation fixture'}]}});await f.center.activate('mine');assert.match(f.body.textContent,/使用右上角 Discord 登录入口后/);await f.click('Discord 登录');assert.ok([...f.body.querySelectorAll('button')].some(x=>x.textContent==='编辑'));assert.equal([...f.body.querySelectorAll('button')].some(x=>x.textContent==='下架'||x.textContent==='重新上架'),false);assert.match(f.body.textContent,/hidden/);assert.equal([...f.body.querySelectorAll('button')].some(x=>x.textContent==='管理员管理'),false);await f.click('编辑');await f.click('读取 GitHub 资料');const input=f.body.querySelector('[name="name"]');input.value='New fixture name';const form=f.body.querySelector('form');if(form.querySelector('[name=sourceType]').value==='github'&&form.querySelector('[name=type]').value==='tavern_extension')await f.click('读取 GitHub 资料');form.dispatchEvent(new f.host.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.ok(f.calls.some(x=>x.path==='/api/submissions/dev-github'&&x.options.method==='PATCH'&&x.options.body.name==='New fixture name'));});
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
test('GitHub defaults public; Discord source enforces guild-only without auxiliary fields',async t=>{
 const f=fixture(t,{identity:{profile:{displayName:'Development Submitter'}}});await f.center.activate('mine');await f.click('提交扩展');const form=f.body.querySelector('[data-submission-form]');const field=name=>form.querySelector('[name="'+name+'"]');assert.equal(field('visibility').value,'public');
 field('sourceType').value='discord';field('sourceType').dispatchEvent(new f.host.Event('change'));assert.equal(field('visibility').closest('label').hidden,true);assert.equal(field('visibilitySourceUrl').disabled,true);assert.equal(field('githubUrl').closest('label').hidden,true);assert.equal(field('discordPostUrl').closest('label').hidden,true);assert.match(form.textContent,/🔒 Discord 来源项目仅对原帖所在服务器成员显示/);
 assert.equal(field('discordUrl').required,true);assert.equal(field('githubUrl').required,false);for(const[key,value]of Object.entries({name:'Development Guild Fixture',author:'Fixture Author',description:'Test Data',discordUrl:'https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333',tags:'test, development'}))field(key).value=value;
 field('discordUrl').dispatchEvent(new f.host.Event('input'));if(form.querySelector('[name=sourceType]').value==='github'&&form.querySelector('[name=type]').value==='tavern_extension')await f.click('读取 GitHub 资料');form.dispatchEvent(new f.host.Event('submit',{cancelable:true}));await tick();const sent=f.calls.find(x=>x.path==='/api/submissions'&&x.options?.method==='POST').options.body;
 assert.equal(sent.visibility,'discord_guild');assert.equal(sent.sourceType,'discord');assert.deepEqual(sent.tags,['test','development']);assert.equal(sent.visibilitySourceUrl,sent.sourceUrl);assert.equal(sent.visibilityGuildId,undefined);assert.equal(sent.ownerDiscordUserId,undefined);
});
test('GitHub restricted submission sends an explicit Discord post while editing cannot change owner',async t=>{
 const own={...github,visibility:'discord_guild',visibilitySourceUrl:'https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333',tags:['development'],ownerDiscordUserId:'not-for-client-edit'};
 const f=fixture(t,{identity:{profile:{displayName:'Development Submitter'}},request:path=>path.startsWith('/api/github/preview')?{compatibility:'installable'}:{items:[own]}});await f.center.activate('mine');await f.click('编辑');const form=f.body.querySelector('form'),field=name=>form.querySelector('[name="'+name+'"]');assert.equal(field('visibility').value,'discord_guild');assert.equal(field('visibilitySourceUrl').value,own.visibilitySourceUrl);assert.equal(field('visibilitySourceUrl').required,true);assert.equal(field('discordUrl').value,'');assert.equal(field('discordUrl').required,false);assert.equal(field('ownerDiscordUserId'),null);
 field('githubUrl').value='https://github.com/example/changed';field('description').value='Changed Test Data';if(form.querySelector('[name=sourceType]').value==='github'&&form.querySelector('[name=type]').value==='tavern_extension')await f.click('读取 GitHub 资料');form.dispatchEvent(new f.host.Event('submit',{cancelable:true}));await tick();const payload=f.calls.find(x=>x.options?.method==='PATCH').options.body;assert.equal(payload.visibilitySourceUrl,own.visibilitySourceUrl);assert.equal(payload.sourceUrl,'https://github.com/example/changed');assert.equal(payload.ownerDiscordUserId,undefined);
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
 for(const id of ['app','web'])assert.equal(f.body.querySelector(`[data-catalog-id="${id}"] .mm-extension-actions button`),null);
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
 assert.equal(field('classification'),null);field('type').value='web_tool';field('type').dispatchEvent(new f.host.Event('change'));assert.equal(field('distribution').disabled,true);assert.match(form.querySelector('[data-distribution]').textContent,/打开链接/);assert.equal(field('websiteUrl').required,true);
 for(const [k,v]of Object.entries({name:'Web Test',author:'Fixture',description:'Test',githubUrl:'https://github.com/example/web',websiteUrl:'https://author.example/tool',platforms:'web'}))field(k).value=v;
 if(form.querySelector('[name=sourceType]').value==='github'&&form.querySelector('[name=type]').value==='tavern_extension')await f.click('读取 GitHub 资料');form.dispatchEvent(new f.host.Event('submit',{cancelable:true}));await tick();const sent=f.calls.find(x=>x.options?.method==='POST').options.body;assert.equal(sent.type,'web_tool');assert.equal(sent.distribution,undefined);assert.deepEqual(sent.platforms,['web']);assert.equal(sent.classification,undefined);
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
 assert.equal(field('sourceUrl'),null);assert.equal(field('discordPostUrl').parentElement.hidden,false);assert.equal(field('discordUrl').required,false);
 for(const[k,v]of Object.entries({name:'Test',author:'Author',description:'Test description',githubUrl:'https://github.com/example/new',discordPostUrl:'https://discord.com/channels/111111111111111111/222222222222222222'}))field(k).value=v;
 field('visibility').value='discord_guild';field('visibility').dispatchEvent(new f.host.Event('change'));assert.equal(field('discordUrl').required,false);assert.equal(field('visibilitySourceUrl').required,true);field('visibilitySourceUrl').value='https://discord.com/channels/333333333333333333/444444444444444444';
 if(form.querySelector('[name=sourceType]').value==='github'&&form.querySelector('[name=type]').value==='tavern_extension')await f.click('读取 GitHub 资料');form.dispatchEvent(new f.host.Event('submit',{cancelable:true}));await tick();const sent=f.calls.find(x=>x.options?.method==='POST').options.body;assert.equal(sent.sourceUrl,'https://github.com/example/new');assert.equal(sent.githubUrl,undefined);assert.notEqual(sent.discordPostUrl,sent.visibilitySourceUrl);assert.equal(sent.visibilitySourceUrl,field('visibilitySourceUrl').value);
});
test('catalog shows both project links with explicit absent placeholders and safe URL handling',async t=>{
 const post='https://discord.com/channels/111111111111111111/222222222222222222';
 const f=fixture(t,{request:()=>({items:[{...github,discordUrl:post},{...discord,id:'none',sourceUrl:'javascript:alert(1)'}]})});await f.center.activate('discover');
 const links=f.body.querySelector('[data-catalog-id="dev-github"] .mm-catalog-links');assert.deepEqual([...links.querySelectorAll('a')].map(a=>a.href),[github.sourceUrl,post]);assert.deepEqual([...links.querySelectorAll('a')].map(a=>a.textContent),['查看仓库','查看发布帖']);assert.doesNotMatch(links.textContent,/https:/);
 const missing=f.body.querySelector('[data-catalog-id="none"] .mm-catalog-links');assert.equal(missing,null);assert.equal(f.body.querySelector('[data-catalog-id=none] a'),null);
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
 await f.center.activate('discover');assert.equal(f.body.querySelector('[data-catalog-id] .mm-extension-actions button'),null);
 await f.center.activate('mine');await f.click('提交扩展');const type=f.body.querySelector('[name=type]');type.value='standalone_app';type.dispatchEvent(new f.host.Event('change'));f.body.querySelector('[name=githubUrl]').value=github.sourceUrl;await f.click('读取 GitHub 资料');assert.equal(type.value,'standalone_app');assert.match(f.body.querySelector('[data-package-detection]').textContent,/未检测到 Hub 安装包/);
 assert.equal(f.body.querySelector('[name=distribution]').disabled,true);assert.match(f.body.querySelector('[data-distribution]').textContent,/作者发布页/);
});

test('shortcut switch handles touch activation and disables while Runtime is busy',async t=>{
 let on=false,calls=0;const f=fixture(t,{shortcuts:{enabled:()=>on,mounted:()=>on,set(_id,value){on=value;calls++;}}});
 const record=f.runtime.get('fixture.background');record.shortcutLauncherAvailable=true;record.launcherAvailable=true;record.busy=true;
 await f.center.activate('installed');let toggle=f.body.querySelector('[role="switch"]');assert.equal(toggle.disabled,true);toggle.click();assert.equal(calls,0);assert.equal(toggle.getAttribute('aria-checked'),'false');
 record.busy=false;await f.center.activate('installed');toggle=f.body.querySelector('[role="switch"]');assert.equal(toggle.disabled,false);
 const tap=new f.host.MouseEvent('click',{bubbles:true,cancelable:true,detail:1});Object.defineProperty(tap,'pointerType',{value:'touch'});toggle.dispatchEvent(tap);assert.equal(calls,1);assert.equal(toggle.getAttribute('aria-checked'),'true');
 toggle.click();assert.equal(calls,2);assert.equal(toggle.getAttribute('aria-checked'),'false');
});

test('GitHub form labels, optional post and independent scope survive source switching',async t=>{
 const f=fixture(t,{identity:{profile:{displayName:'Fixture'}}});await f.center.activate('mine');await f.click('提交扩展');
 const form=f.body.querySelector('form'),field=n=>form.querySelector(`[name="${n}"]`),change=n=>field(n).dispatchEvent(new f.host.Event('change'));
 assert.match(field('githubUrl').closest('label').textContent,/GitHub Repository URL/);assert.match(field('discordPostUrl').closest('label').textContent,/Discord 发布帖（可选）/);
 assert.equal(field('visibility').value,'public');assert.equal(field('discordPostUrl').required,false);assert.equal(field('discordUrl').disabled,true);
 field('discordPostUrl').value=discord.sourceUrl;field('visibility').value='discord_guild';change('visibility');assert.equal(field('visibilitySourceUrl').value,discord.sourceUrl);
 field('visibilitySourceUrl').value=discord.sourceUrl+'/333333333333333333';const independent=field('visibilitySourceUrl').value;
 field('sourceType').value='discord';change('sourceType');assert.equal(field('visibilitySourceUrl').disabled,true);assert.equal(field('visibility').disabled,true);assert.equal(field('discordUrl').closest('label').hidden,false);
 assert.ok(field('discordUrl').parentElement.querySelector('[data-action="discord:verify"]'));assert.equal(field('githubUrl').disabled,true);
 field('sourceType').value='github';change('sourceType');assert.equal(field('visibilitySourceUrl').value,independent);assert.equal(field('discordPostUrl').value,discord.sourceUrl);assert.equal(form.querySelectorAll('[data-action="discord:verify"]').length,1);
});
test('edit fills new post field, legacy fallback is source-specific and explicit null wins',async t=>{
 for(const item of [{...github,discordPostUrl:discord.sourceUrl,discordUrl:'https://ignored.example'},{...github,discordPostUrl:null,discordUrl:discord.sourceUrl},discord]){
  const f=fixture(t,{identity:{profile:{displayName:'Fixture'}},request:()=>({items:[item]})});await f.center.activate('mine');await f.click('编辑');const field=n=>f.body.querySelector(`[name="${n}"]`);
  assert.equal(field('discordPostUrl').value,item.sourceType==='github'?item.discordPostUrl||'':'');assert.equal(field('discordUrl').value,item.sourceType==='discord'?item.sourceUrl:'');
  assert.equal(field('visibility').closest('label').hidden,item.sourceType==='discord');
 }
});
test('Discord cards retain type-specific CTA without duplicate footer links; GitHub post absence is explicit',async t=>{
 const items=[{...discord,id:'disc-ext',type:'tavern_extension'},{...discord,id:'disc-app',type:'standalone_app'},{...discord,id:'disc-web',type:'web_tool',websiteUrl:'https://example.com/tool'},{...github,discordPostUrl:null,discordUrl:discord.sourceUrl,distribution:'external_release'}];
 const f=fixture(t,{request:()=>({items})});await f.center.activate('discover');
 for(const id of ['disc-ext','disc-app','disc-web']){const card=f.body.querySelector(`[data-catalog-id="${id}"]`);assert.equal(card.querySelector('.mm-catalog-links'),null);assert.ok(card.querySelector('.mm-catalog-submitter'));assert.equal(card.querySelector('.mm-extension-actions button'),null);}
 assert.equal(f.body.querySelector('[data-catalog-id=disc-ext] a').textContent,'前往 Discord');assert.equal(f.body.querySelector('[data-catalog-id=disc-app] a').href,discord.sourceUrl);
 assert.deepEqual([...f.body.querySelectorAll('[data-catalog-id=disc-web] a')].map(a=>a.textContent),['打开网站','原始来源']);
 const gh=f.body.querySelector('[data-catalog-id=dev-github]');assert.match(gh.querySelector('.mm-catalog-links').textContent,/GitHub 仓库：查看仓库Discord 发布帖：暂无/);assert.equal(gh.querySelector('.mm-extension-actions a').href,github.sourceUrl);
});
test('GitHub prefill still supplies metadata and package capability without verifying optional Discord post',async t=>{
 const f=fixture(t,{identity:{profile:{displayName:'Fixture'}},request:path=>path.startsWith('/api/github/preview')?{compatibility:'installable',manifest:{name:'Detected',author:'Author',description:'Description',iconUrl:'https://github.com/icon.png'}}:{items:[]}});
 await f.center.activate('mine');await f.click('提交扩展');const field=n=>f.body.querySelector(`[name="${n}"]`);field('githubUrl').value=github.sourceUrl;field('discordPostUrl').value=discord.sourceUrl;await f.click('读取 GitHub 资料');
 assert.equal(field('name').value,'Detected');assert.equal(field('author').value,'Author');assert.equal(field('distribution').disabled,true);assert.match(f.body.querySelector('[data-distribution]').textContent,/Hub 安装/);assert.equal(field('icon').value,'https://github.com/icon.png');assert.equal(f.calls.some(c=>c.path?.startsWith('/api/discord/verify')),false);
});

test('distribution is derived for every source/type and distribution is a disabled display and is not sent',async t=>{
 for(const source of ['github','discord'])for(const [type,expected]of [['tavern_extension',source==='github'?'managed_install':'external_release'],['standalone_app','external_release'],['web_tool','open_url']]){
  const f=fixture(t,{identity:{profile:{displayName:'Fixture'}}});await f.center.activate('mine');await f.click('提交扩展');const form=f.body.querySelector('form'),field=n=>form.querySelector(`[name="${n}"]`);
  for(const[name,value]of [['sourceType',source],['type',type]]){field(name).value=value;field(name).dispatchEvent(new f.host.Event('change'));}
  assert.equal(field('distribution').disabled,true);
  field('githubUrl').value=github.sourceUrl;field('discordUrl').value=discord.sourceUrl;field('websiteUrl').value='https://example.com/tool';
  if(source==='github'&&type==='tavern_extension')await f.click('读取 GitHub 资料');
  form.dispatchEvent(new f.host.Event('submit',{cancelable:true}));await tick();assert.equal(f.calls.find(c=>c.options?.method==='POST').options.body.distribution,undefined);
 }
});
test('GitHub Tavern preview informs distribution without blocking submission or changing source',async t=>{
 for(const compatible of [false,true]){
  const f=fixture(t,{identity:{profile:{displayName:'Fixture'}},request:path=>path.startsWith('/api/github/preview')?{compatibility:compatible?'installable':'external',language:'JavaScript'}:{items:[]}});
  await f.center.activate('mine');await f.click('提交扩展');const form=f.body.querySelector('form'),save=form.querySelector('[type=submit]'),url=form.querySelector('[name=githubUrl]');url.value=github.sourceUrl;
  assert.equal(save.disabled,false);await f.click('读取 GitHub 资料');assert.equal(save.disabled,false);
  assert.match(form.querySelector('[data-package-detection]').textContent,compatible?/已检测到标准 Hub 可安装扩展包/:/未检测到 Hub 安装包，将作为 GitHub 外部发布项目收录/);
  assert.match(form.querySelector('[data-distribution]').textContent,compatible?/Hub 安装/:/作者发布页/);
  assert.equal(form.querySelector('[name=sourceType]').value,'github');form.dispatchEvent(new f.host.Event('submit',{cancelable:true}));await tick();const payload=f.calls.find(c=>c.options?.method==='POST').options.body;assert.equal(payload.distribution,undefined);assert.equal(payload.sourceType,'github');
 }
});
test('late preview cannot restore stale capability after source/type/URL changes',async t=>{
 const replies=[];const f=fixture(t,{identity:{profile:{displayName:'Fixture'}},request:path=>path.startsWith('/api/github/preview')?new Promise(r=>replies.push(r)):{items:[]}});
 await f.center.activate('mine');await f.click('提交扩展');const form=f.body.querySelector('form'),type=form.querySelector('[name=type]'),url=form.querySelector('[name=githubUrl]');url.value=github.sourceUrl;
 await f.click('读取 GitHub 资料');type.value='standalone_app';type.dispatchEvent(new f.host.Event('change'));type.value='tavern_extension';type.dispatchEvent(new f.host.Event('change'));replies.shift()({compatibility:'installable'});await tick();assert.doesNotMatch(form.querySelector('[data-distribution]').textContent,/Hub 安装/);
 await f.click('读取 GitHub 资料');replies.shift()({compatibility:'external'});await tick();assert.match(form.querySelector('[data-distribution]').textContent,/作者发布页/);
 url.value='https://github.com/example/replaced';url.dispatchEvent(new f.host.Event('input'));assert.match(form.querySelector('[data-distribution]').textContent,/检测后确定/);assert.equal(form.querySelector('[type=submit]').disabled,false);
});
test('non-installable Catalog GitHub Tavern has a direct GitHub CTA, including legacy and stale DTOs',async t=>{
 for(const distribution of [undefined,'managed_install','external_release']){
  const f=fixture(t,{request:()=>({items:[{...github,type:'tavern_extension',distribution,github:{compatibility:'external'}}]})});await f.center.activate('discover');const card=f.body.querySelector('[data-catalog-id]');assert.equal(card.querySelector('.mm-extension-actions button'),null);const cta=card.querySelector('.mm-extension-actions a');assert.equal(cta.textContent,'前往 GitHub');assert.equal(cta.href,github.sourceUrl);assert.doesNotMatch(card.textContent,/检查安装兼容性/);
 }
});

const autoTick=()=>new Promise(r=>setTimeout(r,10));
test('GitHub blur inspects once, auto detection preserves text, manual read shares request and keeps its button beside URL',async t=>{
 let finish;const f=fixture(t,{identity:{profile:{displayName:'Fixture'}},request:path=>path.startsWith('/api/github/preview')?new Promise(r=>finish=r):{items:[]}});
 await f.center.activate('mine');await f.click('提交扩展');const form=f.body.querySelector('form'),url=form.querySelector('[name=githubUrl]'),display=form.querySelector('[data-distribution]'),name=form.querySelector('[name=name]');
 assert.equal(display.disabled,true);assert.equal(display.textContent,'由 Registry 检测后确定');assert.ok(url.parentElement.querySelector('[data-action="github:inspect"]'));assert.equal(f.body.querySelector('[data-action="github:inspect"]').textContent,'读取 GitHub 资料');
 url.value=github.sourceUrl;url.dispatchEvent(new f.host.Event('input'));name.value='Own name';url.dispatchEvent(new f.host.Event('blur'));url.dispatchEvent(new f.host.Event('blur'));assert.equal(f.calls.filter(c=>c.path?.startsWith('/api/github/preview')).length,1);assert.equal(display.textContent,'正在检测…');
 finish({compatibility:'installable',manifest:{name:'Remote name'}});await tick();assert.equal(display.value,'managed_install');assert.equal(name.value,'Own name');url.dispatchEvent(new f.host.Event('blur'));assert.equal(f.calls.filter(c=>c.path?.startsWith('/api/github/preview')).length,1);
 url.value='https://github.com/example/new';url.dispatchEvent(new f.host.Event('input'));assert.equal(display.textContent,'由 Registry 检测后确定');url.dispatchEvent(new f.host.Event('blur'));await f.click('读取 GitHub 资料');assert.equal(f.calls.filter(c=>c.path?.startsWith('/api/github/preview')).length,2);
 name.value='Edited during detection';finish({compatibility:'external',manifest:{name:'Do not overwrite edit',author:'Remote author'}});await tick();assert.equal(name.value,'Edited during detection');assert.equal(form.querySelector('[name=author]').value,'Remote author');assert.equal(display.value,'external_release');
});
test('paste detects after input, replacing URLs invalidates old replies, malformed URLs do not request Registry',async t=>{
 const replies=[];const f=fixture(t,{identity:{profile:{displayName:'Fixture'}},request:path=>path.startsWith('/api/github/preview')?new Promise(r=>replies.push(r)):{items:[]}});
 await f.center.activate('mine');await f.click('提交扩展');const url=f.body.querySelector('[name=githubUrl]'),display=f.body.querySelector('[data-distribution]');
 const paste=async value=>{url.dispatchEvent(new f.host.Event('paste'));url.value=value;url.dispatchEvent(new f.host.Event('input'));await autoTick();};
 await paste('https://github.com/example/first');assert.equal(replies.length,1);await paste('https://github.com/example/second');assert.equal(replies.length,2);
 replies[1]({compatibility:'external'});await tick();replies[0]({compatibility:'installable'});await tick();assert.equal(display.value,'external_release');
 await paste('https://github.com/example');url.dispatchEvent(new f.host.Event('blur'));assert.equal(replies.length,2);assert.equal(display.textContent,'由 Registry 检测后确定');
});
test('failed auto detection is visible and manually retryable without blocking external submission',async t=>{
 let fail=true;const f=fixture(t,{identity:{profile:{displayName:'Fixture'}},request:path=>{if(path.startsWith('/api/github/preview')){if(fail)throw Error('temporarily offline');return {compatibility:'external'};}return {items:[]};}});
 await f.center.activate('mine');await f.click('提交扩展');const form=f.body.querySelector('form'),url=form.querySelector('[name=githubUrl]'),display=form.querySelector('[data-distribution]');url.value=github.sourceUrl;url.dispatchEvent(new f.host.Event('blur'));await tick();assert.equal(display.textContent,'检测失败，请重试');assert.match(form.querySelector('[data-package-detection]').textContent,/temporarily offline/);assert.equal(form.querySelector('[type=submit]').disabled,false);
 fail=false;await f.click('读取 GitHub 资料');assert.equal(display.value,'external_release');
});
test('source switch, logout and dispose cancel scheduled detection and stale updates',async t=>{
 for(const action of ['discord','logout','dispose']){
  const f=fixture(t,{identity:{profile:{displayName:'Fixture'}}});await f.center.activate('mine');await f.click('提交扩展');const url=f.body.querySelector('[name=githubUrl]');url.dispatchEvent(new f.host.Event('paste'));url.value=github.sourceUrl;url.dispatchEvent(new f.host.Event('input'));
  if(action==='discord'){const source=f.body.querySelector('[name=sourceType]');source.value='discord';source.dispatchEvent(new f.host.Event('change'));}else if(action==='logout')f.registry.setIdentity(null);else f.center.dispose();
  await autoTick();assert.equal(f.calls.filter(c=>c.path?.startsWith('/api/github/preview')).length,0);
 }
});
test('editing Discord then switching to GitHub enables the themed visibility control',async t=>{
 const f=fixture(t,{identity:{profile:{displayName:'Fixture'}},request:()=>({items:[discord]})});await f.center.activate('mine');await f.click('编辑');const source=f.body.querySelector('[name=sourceType]'),visibility=f.body.querySelector('[data-select-for=visibility]');assert.equal(visibility.disabled,true);source.value='github';source.dispatchEvent(new f.host.Event('change'));assert.equal(visibility.disabled,false);visibility.click();assert.equal(f.body.querySelector('[role=listbox]').children.length,2);
});

test('Catalog install shows progress immediately, blocks repeat clicks across rerenders, then recovers', async t => {
 const f=fixture(t,{request:()=>({items:[github,{...github,id:'second-fixture'}],hasMore:false})});
 let finishInspect,finishInstall,options,inspections=0,installs=0;
 f.packages.inspect=()=>{inspections++;return new Promise(resolve=>{finishInspect=resolve;});};
 f.packages.install=(candidate,next)=>{installs++;options=next;next.onProgress('downloading');return new Promise(resolve=>{finishInstall=resolve;});};
 await f.center.activate('discover');
 const first=f.body.querySelector('[data-action="dev-github:install"]');first.click();
 assert.match(f.body.querySelector('[role="status"]').textContent,/正在验证/);
 assert.ok([...f.body.querySelectorAll('[data-package-install]')].every(b=>b.disabled));first.click();
 await f.center.activate('discover');
 f.body.querySelector('[data-action="second-fixture:install"]').click();assert.equal(inspections,1);
 finishInspect({installable:true,id:'fixture.package'});await tick();
 assert.match(f.body.querySelector('[role="status"]').textContent,/正在下载/);
 options.onProgress('relaying');assert.match(f.body.querySelector('[role="status"]').textContent,/切换安全下载服务/);
 options.onProgress('installing');assert.match(f.body.querySelector('[role="status"]').textContent,/正在安装/);
 finishInstall();await tick();await tick();assert.equal(installs,1);assert.equal(f.center.getActive(),'installed');
 await f.center.activate('discover');assert.ok([...f.body.querySelectorAll('[data-package-install]')].every(b=>!b.disabled));
});

test('failed Catalog install restores buttons and shows failure without a success state', async t => {
 const f=fixture(t);let fail;
 f.packages.install=()=>new Promise((resolve,reject)=>{fail=reject;});
 await f.center.activate('discover');const button=f.body.querySelector('[data-action="dev-github:install"]');button.click();await tick();
 assert.equal(button.disabled,true);fail(Error('GitHub 请求超时，未完成安装。'));await tick();await tick();
 assert.match(f.body.querySelector('[role="status"]').textContent,/GitHub 请求超时/);assert.equal(button.disabled,false);assert.equal(f.center.getActive(),'discover');
});

test('manual GitHub preview shares install progress and duplicate-click protection', async t => {
 const f=fixture(t);let finish;
 f.packages.install=(candidate,{onProgress})=>{onProgress('downloading');return new Promise(resolve=>{finish=resolve;});};
 await f.center.activate('discover');f.body.querySelector('[aria-label="GitHub Repository URL"]').value=github.sourceUrl;
 await f.click('预览项目');const button=f.body.querySelector('[data-action="package:install"]');button.click();await tick();
 assert.match(f.body.querySelector('[role="status"]').textContent,/正在下载/);assert.equal(button.disabled,true);
 assert.equal(f.body.querySelector('[data-action="dev-github:install"]').disabled,true);
 finish();await tick();await tick();assert.equal(f.center.getActive(),'installed');
});

test('cancelled install restores controls without changing unrelated Catalog content', async t => {
 const f=fixture(t);let cancel;
 f.packages.install=()=>new Promise((resolve,reject)=>{cancel=()=>reject(Object.assign(Error('扩展操作已取消。'),{code:'cancelled'}));});
 await f.center.activate('discover');const other=f.body.querySelector('[data-catalog-id="dev-discord"]'),before=other.outerHTML;
 const button=f.body.querySelector('[data-action="dev-github:install"]');button.click();await tick();
 cancel();await tick();await tick();
 assert.equal(button.disabled,false);assert.match(f.body.querySelector('[role="status"]').textContent,/已取消/);
 assert.equal(other.outerHTML,before);assert.equal(f.center.getActive(),'discover');
});

test('disposing center during inspection prevents late install or status restoration', async t => {
 const f=fixture(t);let finish;
 f.packages.inspect=()=>new Promise(resolve=>{finish=resolve;});
 await f.center.activate('discover');f.body.querySelector('[data-action="dev-github:install"]').click();
 f.center.dispose();finish({installable:true,id:'fixture.package'});await tick();await tick();
 assert.equal(f.calls.some(value=>typeof value==='string'&&value.startsWith('install:')),false);
 assert.equal(f.body.querySelector('[role="status"]'),null);
 const reopened=fixture(t);await reopened.center.activate('discover');
 assert.equal(reopened.body.querySelector('[data-action="dev-github:install"]').disabled,false);
});


test('install progress crosses the production bootstrap adapter into the visible status', async t => {
 const f=fixture(t);let progress,finish;
 const packageManager={install(candidate,{onProgress}={}) {
  assert.equal(candidate.id,'fixture.package');progress=onProgress;
  onProgress?.('downloading');return new Promise(resolve=>{finish=resolve;});
 }};
 // Exercise the real adapter that was missing from the center-only tests.
 const bootstrap=readFileSync(new URL('../src/bootstrap.js',import.meta.url),'utf8');
 const begin=bootstrap.indexOf('packageUI.install = '),end=bootstrap.indexOf('const registryClient = ',begin);
 assert.ok(begin>=0&&end>begin);
 new Function('packageUI','packageManager','bundledPolicies','withPackagePreference',bootstrap.slice(begin,end))(
  f.packages,packageManager,new Map(),(_id,_enabled,action)=>action());
 await f.center.activate('discover');await f.click('安装');
 const status=()=>f.body.querySelector('[role="status"]').textContent;
 assert.equal(status(),'正在下载…');
 progress('downloading',{receivedBytes:1048576,totalBytes:2097152});
 assert.equal(f.body.querySelector('progress').value,50);
 assert.match(f.body.querySelector('[data-install-progress]').textContent,/下载 50% · 1.00 MB \/ 2.00 MB/);
 for(const [phase,text]of [['relaying','GitHub 直连停滞，正在切换安全下载服务…'],['verifying','正在验证…'],['installing','正在安装…']]) {
  progress(phase);assert.equal(status(),text);
 }
 finish({ok:true});await tick();await tick();
 assert.equal(f.center.getActive(),'installed');assert.equal(status(),'');assert.equal(f.body.querySelector('[data-install-progress]').dataset.state,'completed');
});


test('download percentage resets on fallback, stays distinct from install completion, and ignores late progress', async t => {
 const f=fixture(t);let progress,finish;
 f.packages.install=(_candidate,{onProgress})=>{progress=onProgress;return new Promise(resolve=>{finish=resolve;});};
 await f.center.activate('discover');await f.click('安装');
 const panel=f.body.querySelector('[data-install-progress]'),bar=panel.querySelector('progress');
 assert.equal(panel.hidden,false);assert.equal(bar.hasAttribute('value'),false);
 progress('downloading',{receivedBytes:25,totalBytes:100});assert.equal(bar.value,25);
 progress('relaying');assert.equal(bar.hasAttribute('value'),false);
 progress('downloading',{receivedBytes:0,totalBytes:100});assert.equal(bar.value,0);
 progress('downloading',{receivedBytes:100,totalBytes:100});assert.equal(bar.value,100);assert.doesNotMatch(panel.textContent,/安装完成/);
 progress('verifying');assert.equal(bar.hasAttribute('value'),false);assert.match(panel.textContent,/下载完成.*校验/);
 progress('installing');assert.equal(bar.hasAttribute('value'),false);assert.match(panel.textContent,/写入/);
 finish({ok:true});await tick();await tick();assert.equal(bar.value,100);assert.match(panel.textContent,/安装完成 · 100%/);
 progress('downloading',{receivedBytes:0,totalBytes:100});assert.match(panel.textContent,/安装完成 · 100%/);
});

test('rate-limit failure hides pending progress and keeps retry time instead of reporting completed', async t => {
 const f=fixture(t);let fail,progress;
 f.packages.install=(_candidate,{onProgress})=>{progress=onProgress;onProgress('relaying');return new Promise((_,reject)=>{fail=reject;});};
 await f.center.activate('discover');await f.click('安装');
 fail(Error('GitHub 匿名访问额度暂时用完，请在 05:20:16 后重试；本地扩展未被修改。'));await tick();await tick();
 const panel=f.body.querySelector('[data-install-progress]');assert.equal(panel.hidden,true);
 assert.match(f.body.querySelector('[role="status"]').textContent,/05:20:16/);
 progress('downloading',{receivedBytes:100,totalBytes:100});assert.equal(panel.hidden,true);
 assert.doesNotMatch(f.body.querySelector('[role="status"]').textContent,/已安装/);
});

test('rolling download speed falls to zero on silence, resets for relay, and clears timers', async t => {
 const f=fixture(t); let now=0,serial=0,progress,finish;const timers=new Map();
 Object.defineProperty(f.host.performance,'now',{value:()=>now});
 f.host.setInterval=fn=>{timers.set(++serial,fn);return serial;};f.host.clearInterval=id=>timers.delete(id);
 f.packages.install=(_candidate,{onProgress})=>{progress=onProgress;return new Promise(resolve=>{finish=resolve;});};
 await f.center.activate('discover');await f.click('安装');
 const panel=f.body.querySelector('[data-install-progress]'),status=()=>f.body.querySelector('[role="status"]').textContent;
 progress('downloading',{receivedBytes:0,totalBytes:102400});
 now=1000;progress('downloading',{receivedBytes:1024,totalBytes:102400});
 assert.match(panel.textContent,/1.0 KB\/s/);assert.match(status(),/下载较慢，仍在继续/);
 for(let second=2;second<=7;second++){now=second*1000;for(const timer of timers.values())timer();}
 assert.match(panel.textContent,/0 B\/s/);assert.match(status(),/暂未收到新数据/);
 progress('relaying');assert.equal(timers.size,0);
 progress('downloading',{receivedBytes:0,totalBytes:102400});assert.match(panel.textContent,/正在计算速度/);
 now+=1000;progress('downloading',{receivedBytes:102400,totalBytes:102400});assert.match(panel.textContent,/100.0 KB\/s/);
 progress('verifying');assert.equal(timers.size,0);
 progress('installing');assert.equal(panel.querySelector('[data-cancel-install]').hidden,true);
 finish({ok:true});await tick();await tick();assert.match(panel.textContent,/安装完成 · 100%/);assert.equal(timers.size,0);
});

test('cancel download aborts install signal, restores retry, and ignores late byte callbacks',async t=>{
 const f=fixture(t);let progress,signal;
 f.packages.install=(_candidate,options)=>{progress=options.onProgress;signal=options.signal;return new Promise((resolve,reject)=>{
  signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
 });};
 await f.center.activate('discover');await f.click('安装');
 progress('downloading',{receivedBytes:10,totalBytes:100});
 const panel=f.body.querySelector('[data-install-progress]'),cancel=panel.querySelector('[data-cancel-install]');
 assert.equal(cancel.hidden,false);cancel.click();await tick();await tick();
 assert.equal(signal.aborted,true);assert.equal(panel.hidden,true);
 assert.match(f.body.querySelector('[role="status"]').textContent,/已取消安装/);
 assert.equal(f.body.querySelector('[data-package-install]').disabled,false);
 progress('downloading',{receivedBytes:100,totalBytes:100});assert.equal(panel.hidden,true);
});

test('disposing center stops speed refresh and aborts ongoing installation',async t=>{
 const f=fixture(t);let progress,signal,serial=0;const timers=new Map();
 f.host.setInterval=fn=>{timers.set(++serial,fn);return serial;};f.host.clearInterval=id=>timers.delete(id);
 f.packages.install=(_candidate,options)=>{progress=options.onProgress;signal=options.signal;return new Promise((resolve,reject)=>{
  signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
 });};
 await f.center.activate('discover');await f.click('安装');progress('downloading',{receivedBytes:10,totalBytes:100});
 assert.equal(timers.size,1);f.center.dispose();assert.equal(signal.aborted,true);assert.equal(timers.size,0);await tick();
});

function uiClock(f){
 let now=0,id=0;const tasks=new Map();
 Object.defineProperty(f.host.performance,'now',{value:()=>now});
 f.host.setTimeout=(fn,delay)=>{tasks.set(++id,{fn,at:now+delay});return id;};f.host.clearTimeout=id=>tasks.delete(id);
 return {tasks,async advance(ms){now+=ms;for(const[key,task]of [...tasks])if(task.at<=now){tasks.delete(key);task.fn();}await tick();await tick();}};
}

test('named download toast completes, retracts and disappears without a permanent success banner',async t=>{
 const f=fixture(t),clock=uiClock(f);let done;
 f.packages.install=(_c,{onProgress})=>{onProgress('downloading',{receivedBytes:50,totalBytes:100});return new Promise(resolve=>{done=resolve;});};
 await f.center.activate('discover');await f.click('安装');
 const toast=f.body.querySelector('[data-install-progress]');assert.match(toast.querySelector('.mm-install-name').textContent,/Development Fixture/);
 assert.equal(toast.parentElement,f.body);assert.equal(toast.hidden,false);
 done();await tick();await tick();assert.equal(toast.dataset.state,'completed');assert.match(toast.textContent,/安装完成/);
 await clock.advance(1200);assert.equal(toast.dataset.state,'leaving');await clock.advance(380);assert.equal(toast.hidden,true);
 assert.equal(f.body.querySelector('.mm-center-notice').textContent,'');
});

test('leaving during preview aborts its signal and late preview never installs',async t=>{
 const f=fixture(t);let signal,done,installs=0;
 f.packages.inspect=(_url,options)=>{signal=options.signal;return new Promise(resolve=>{done=resolve;});};
 f.packages.install=async()=>{installs++;};
 await f.center.activate('discover');await f.click('安装');f.center.leave();assert.equal(signal.aborted,true);
 done({installable:true,id:'fixture.package'});await tick();await tick();assert.equal(installs,0);
 assert.equal(f.body.querySelector('[data-install-progress]').hidden,true);assert.equal(f.center.getActive(),'discover');
});

test('leaving aborts download through the actual production adapter and cannot reopen the center',async t=>{
 const f=fixture(t);let signal;
 const manager={install(_c,options){signal=options.signal;options.onProgress('downloading',{receivedBytes:1,totalBytes:100});return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}};
 const source=readFileSync(new URL('../src/bootstrap.js',import.meta.url),'utf8');
 new Function('packageUI','packageManager','bundledPolicies','withPackagePreference',source.slice(source.indexOf('packageUI.install = '),source.indexOf('const registryClient = ')))(f.packages,manager,new Map(),(_id,_enabled,action)=>action());
 await f.center.activate('discover');await f.click('安装');f.center.leave();assert.equal(signal.aborted,true);await tick();await tick();
 assert.equal(f.body.querySelector('[data-install-progress]').hidden,true);assert.equal(f.center.getActive(),'discover');
 await f.center.activate('discover');assert.equal(f.body.querySelector('[data-package-install]').disabled,false);
});

test('fresh save is neutral while pending, automatically refreshes to confirmed and stops polling',async t=>{
 const f=fixture(t),clock=uiClock(f);let reads=0;
 f.packages.listInstalled=async()=>{reads++;return [{id:'fixture.background',instanceId:'test',version:reads<2?null:'1.0.0',name:'Fixture',repoUrl:github.sourceUrl,enabled:true,
  persistenceState:reads<2?'pending':undefined,persistenceError:reads<2?'尚未确认此脚本已持久保存。':''}];};
 await f.center.activate('installed');assert.doesNotMatch(f.body.textContent,/正在确认酒馆保存/);assert.equal(f.body.querySelector('[data-save-state=pending]').getAttribute('aria-busy'),'true');assert.equal(f.body.querySelector('.mm-extension-error'),null);
 await clock.advance(750);assert.equal(reads,2);assert.equal(f.body.querySelector('[data-save-state=confirmed]').getAttribute('aria-busy'),'false');assert.doesNotMatch(f.body.textContent,/正在确认|尚未确认|已保存版本：待确认/);assert.equal(clock.tasks.size,0);
 await clock.advance(20000);assert.equal(reads,2);
});

test('unconfirmed save remains a real warning after bounded retries and can be checked again',async t=>{
 const f=fixture(t),clock=uiClock(f);
 f.packages.listInstalled=async()=>[{id:'fixture.background',version:null,name:'Fixture',repoUrl:github.sourceUrl,enabled:true,persistenceState:'pending',persistenceError:'尚未确认此脚本已持久保存。'}];
 await f.center.activate('installed');await clock.advance(15000);
 assert.match(f.body.querySelector('.mm-extension-error').textContent,/尚未确认/);assert.ok(f.body.querySelector('[data-save-state=error]'));assert.equal(clock.tasks.size,0);
 await f.click('重新检查保存');assert.ok(f.body.querySelector('[data-save-state=pending]'));assert.doesNotMatch(f.body.textContent,/正在确认酒馆保存/);
 f.center.leave();assert.equal(clock.tasks.size,0);
});

test('actual mismatched save stays red during automatic checking',async t=>{
 const f=fixture(t);uiClock(f);
 f.packages.listInstalled=async()=>[{id:'fixture.background',version:'0.9.0',name:'Fixture',repoUrl:github.sourceUrl,enabled:true,persistenceError:'内存与已保存脚本不一致，尚未确认更新成功。'}];
 await f.center.activate('installed');assert.match(f.body.querySelector('.mm-extension-error').textContent,/不一致/);assert.match(f.body.textContent,/已保存版本：0.9.0/);assert.ok(f.body.querySelector('[data-save-state=error]'));assert.ok(f.body.querySelector('[data-action="fixture.background:recheck-save"]'));
});


test('full description is plain text in a separate dialog; Back/Escape restore focus and leaving removes it',async t=>{
 const description='【功能】\n'+('很长的简介。\n'.repeat(150))+'<img src=x onerror=alert(1)>';
 const f=fixture(t,{request:()=>({items:[{...github,description}]})});
 // jsdom has no top layer; actual native dialog layout/focus is covered in Chromium.
 f.host.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 f.host.HTMLDialogElement.prototype.close=function(){this.open=false;};
 await f.center.activate('discover');const card=f.body.querySelector('[data-catalog-id]'),opener=card.querySelector('.mm-description-open');
 assert.equal(opener.hidden,false);opener.click();
 let dialog=f.body.querySelector('dialog');assert.equal(card.contains(dialog),false);assert.equal(dialog.open,true);
 assert.equal(dialog.querySelector('.mm-description-full').textContent,description);assert.equal(dialog.querySelector('img'),null);
 dialog.querySelector('button').click();assert.equal(f.body.querySelector('dialog'),null);assert.equal(f.host.document.activeElement,opener);
 let parentEscapes=0;f.host.document.addEventListener('keydown',()=>parentEscapes++,true);
 opener.click();f.body.querySelector('.mm-description-full').dispatchEvent(new f.host.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 assert.equal(parentEscapes,0);assert.equal(f.body.querySelector('dialog'),null);assert.equal(f.host.document.activeElement,opener);
 opener.click();f.center.leave();assert.equal(f.body.querySelector('dialog'),null);
 f.host.document.dispatchEvent(new f.host.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(parentEscapes,1);
 await f.center.activate('discover');f.body.querySelector('.mm-description-open').click();await f.center.activate('mine');assert.equal(f.body.querySelector('dialog'),null);
});
test('description editing preserves line breaks and brackets in the submission and reports its existing limit',async t=>{
 const f=fixture(t,{identity:{profile:{displayName:'Fixture'}}});await f.center.activate('mine');await f.click('编辑');
 const form=f.body.querySelector('form'),input=form.querySelector('[name=description]'),hint=form.querySelector('.mm-description-hint');
 assert.equal(input.tagName,'TEXTAREA');assert.equal(input.maxLength,2000);
 input.value='文'.repeat(2000);input.dispatchEvent(new f.host.Event('input'));assert.match(hint.textContent,/2000 \/ 2000.*已达上限/);
 const description='【功能】\n第一段。\n\n【用法】\n第二段！';input.value=description;input.dispatchEvent(new f.host.Event('input'));
 assert.match(hint.textContent,/支持换行/);assert.ok(hint.textContent.startsWith(description.length+' / 2000'));
 const key=new f.host.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true});input.dispatchEvent(key);assert.equal(key.defaultPrevented,false);
 form.dispatchEvent(new f.host.Event('submit',{cancelable:true}));await tick();assert.equal(f.calls.find(x=>x.options?.method==='PATCH').options.body.description,description);
});


test('save effects keep their elapsed time across polling and success only follows verified persistence',async t=>{
 const f=fixture(t),clock=uiClock(f);let saved=false;
 f.packages.listInstalled=async()=>[{id:'fixture.background',version:saved?'1.0.0':null,name:'Fixture',enabled:true,persistenceState:saved?undefined:'pending',persistenceError:saved?'':'尚未确认此脚本已持久保存。'}];
 await f.center.activate('installed');assert.equal(f.body.querySelector('[data-save-state=pending]').style.getPropertyValue('--mm-save-elapsed'),'0ms');
 await clock.advance(750);assert.equal(f.body.querySelector('[data-save-state=pending]').style.getPropertyValue('--mm-save-elapsed'),'-750ms');
 saved=true;await clock.advance(750);assert.equal(f.body.querySelector('[data-save-state=confirmed]').style.getPropertyValue('--mm-save-elapsed'),'0ms');
 await clock.advance(2000);await f.center.activate('installed');assert.equal(f.body.querySelector('[data-save-state=confirmed]').style.getPropertyValue('--mm-save-elapsed'),'-2000ms');assert.equal(clock.tasks.size,0);
});
test('ordinary confirmed listings do not replay ready effects and a running-version mismatch cannot look ready',async t=>{
 const f=fixture(t);uiClock(f);let mismatch=false;
 f.packages.listInstalled=async()=>[{id:'fixture.background',version:mismatch?'2.0.0':'1.0.0',name:'Fixture',enabled:true,persistenceError:''}];
 await f.center.activate('installed');assert.equal(f.body.querySelector('[data-save-state]'),null);
 mismatch=true;await f.center.activate('installed');assert.ok(f.body.querySelector('[data-save-state=error]'));assert.equal(f.body.querySelector('[data-save-state=confirmed]'),null);assert.match(f.body.textContent,/尚未完成新版运行确认/);
});
