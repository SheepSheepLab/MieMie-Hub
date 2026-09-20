// Catalog is optional online UI; this module is never a Core startup dependency.
export function createExtensionCenter({host, body, runtime, sources, packages, registry, refreshLaunchers = () => {}}) {
  const doc = host.document, configKey = 'miemie_registry_url_v1';
  let disposed = false, active = 'discover', serial = 0, page = 1, query = '', sourceFilter = '', busy = false;
  const candidates = new Map();
  function el(tag, text, className) {const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e;}
  const tabs = el('nav', undefined, 'mm-ecosystem-tabs'), content = el('div'), notice = el('p', '', 'mm-hub-note');
  notice.setAttribute('role', 'status'); body.append(tabs, notice, content);
  const tabButtons = new Map();
  for (const [id, label] of [['discover', '发现'], ['installed', '已安装'], ['mine', '我的']]) {
    const b = el('button', label); b.type = 'button'; b.dataset.centerTab = id; b.onclick = () => activate(id); tabs.append(b); tabButtons.set(id, b);
  }
  try {registry.setBase(host.localStorage.getItem(configKey) || '');} catch (_) {}
  function report(message) {if (!disposed) notice.textContent = message || '';}
  function safeURL(value, base) {try {const url = new URL(value, base); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;} catch (_) {return null;}}
  function icon(parent, value, label = '') {
    const wrapper = el('span', '🧩', 'mm-extension-icon'); wrapper.setAttribute('aria-label', label);
    const url = safeURL(value, registry.getBase() || undefined);
    // Local Registry avatar proxy is permitted only on the explicitly configured origin.
    let local; try {const u = new URL(value, registry.getBase()); if (u.origin === registry.getBase() && /^\/api\/avatars\//.test(u.pathname)) local = u.href;} catch (_) {}
    if (url || local) {const image = el('img'); image.alt = ''; image.referrerPolicy = 'no-referrer'; image.loading = 'lazy'; image.src = url || local; image.onerror = () => {image.remove(); wrapper.textContent = '🧩';}; wrapper.replaceChildren(image);}
    parent.append(wrapper); return wrapper;
  }
  function action(parent, label, handler, key, disabled = false) {
    const b = el('button', label); b.type = 'button'; b.disabled = disabled; if (key) b.dataset.action = key;
    b.onclick = async () => {
      if (b.disabled || disposed) return;
      b.disabled = true; report('');
      try {const result = await handler(); if (result?.ok === false) throw Error(result.error || '操作失败。');}
      catch (error) {report(error.message || '操作失败。');}
      finally {if (!disposed) b.disabled = false;}
    }; parent.append(b); return b;
  }
  function link(parent, label, url) {
    const safe = safeURL(url); if (!safe) return;
    const a = el('a', label); a.href = safe; a.target = '_blank'; a.rel = 'noopener noreferrer'; parent.append(a);
  }
  function configuration(parent) {
    const details = el('details'); details.append(el('summary', 'Registry 连接设置'));
    const input = el('input'); input.type = 'url'; input.placeholder = 'https://registry.example.org'; input.value = registry.getBase(); input.setAttribute('aria-label', 'Registry 服务地址');
    details.append(input, el('p', '部署前可连接本机 Registry；连接地址保存在本机，登录会话只保留在当前 Hub 内存。', 'mm-hub-note'));
    action(details, '保存连接', async () => {const url = registry.setBase(input.value.trim()); host.localStorage.setItem(configKey, url); await activate(active);}, 'registry:configure');
    parent.append(details);
  }
  async function operate(fn) {
    if (busy) return; busy = true;
    try {const result = await fn(); if (result?.ok === false) throw Error(result.error || '操作失败。'); report('操作完成；脚本保存与运行状态请在酒馆助手中确认。');}
    finally {busy = false; if (!disposed) {refreshLaunchers(); await renderInstalled();}}
  }
  async function renderInstalled() {
    if (disposed || active !== 'installed') return;
    const generation = ++serial;
    let physical = [], unavailable = '';
    try {physical = packages ? await packages.listInstalled() : [];} catch (e) {unavailable = e.message;}
    if (disposed || active !== 'installed' || generation !== serial) return;
    content.replaceChildren();
    content.append(el('p', '已识别的全局 Package 可以管理酒馆助手脚本条目。其他扩展的“Runtime 注销”只清理运行实例，不删除原始脚本。物理卸载会删除该脚本条目及其 data，需先保存恢复备份；localStorage 等外部业务设置不清空。', 'mm-hub-note'));
    if (unavailable) content.append(el('p', 'Package 管理不可用：' + unavailable, 'mm-hub-note'));
    const managed = new Map(physical.map(x => [x.id, x])), records = new Map(runtime.list().map(x => [x.manifest.id, x]));
    const ids = new Set([...managed.keys(), ...records.keys()]);
    for (const id of ids) {
      const local = records.get(id), installed = managed.get(id), manifest = local?.manifest || installed?.manifest || installed || {};
      const card = el('article', undefined, 'mm-extension-card'); card.dataset.extensionId = id;
      const title = el('div', undefined, 'mm-extension-title'); title.append(el('strong', manifest.name || installed?.name || id));
      const enabled = installed ? installed.enabled : local.enabled;
      title.append(el('small', (installed?.version || manifest.version || '') + ' · ' + (enabled ? '已启用' : '已停用'))); card.append(title);
      card.append(el('p', manifest.description || id, 'mm-hub-note'));
      card.append(el('p', 'Launcher：' + (local?.launcherAvailable ? '可用' : '未提供或未启用') + ' · 固定功能尚未加入', 'mm-hub-note'));
      for (const error of [local?.error, local?.launcherError]) if (error) card.append(el('p', error, 'mm-extension-error'));
      const candidate = candidates.get(id); if (candidate) card.append(el('p', '最新版本：' + candidate.version, 'mm-hub-note'));
      const actions = el('div', undefined, 'mm-extension-actions'); card.append(actions);
      if (local?.launcherAvailable) action(actions, '打开', () => runtime.open(id), id + ':open', local.busy);
      action(actions, enabled ? '停用' : '启用', () => operate(async () => {
        if (!installed) return enabled ? runtime.disable(id) : runtime.enable(id);
        return packages.setEnabled(id, !enabled);
      }), id + ':toggle', busy || local?.busy);
      if (installed) {
        action(actions, '检查更新', async () => {const next = await packages.check(id); candidates.set(id, next); await renderInstalled();}, id + ':check', busy);
        if (candidate?.available) action(actions, '更新', () => operate(() => packages.update(id, candidate)), id + ':update', busy);
        action(actions, '备份后卸载脚本', () => operate(async () => {await packages.uninstall(id); if (runtime.get(id)) await runtime.uninstall(id); candidates.delete(id);}), id + ':uninstall', busy);
        link(actions, '作者 GitHub', installed.repoUrl);
      } else action(actions, 'Runtime 注销', () => operate(() => runtime.uninstall(id)), id + ':uninstall', busy || local?.busy);
      content.append(card);
    }
    for (const manifest of sources.list().filter(x => !records.has(x.id) && !managed.has(x.id))) action(content, '注册 ' + manifest.name, () => operate(() => sources.register(manifest.id)), manifest.id + ':register');
    if (!ids.size) content.append(el('p', '没有已注册的扩展。', 'mm-hub-note'));
  }
  async function previewInstall(repoURL, parent) {
    const candidate = await packages.inspect(repoURL);
    const old = parent.querySelector('[data-package-preview]'); old?.remove();
    const preview = el('div'); preview.dataset.packagePreview = '';
    preview.append(el('p', (candidate.manifest?.name || 'GitHub 项目') + (candidate.version ? ' · ' + candidate.version : ''), 'mm-hub-note'));
    if (candidate.installable) {
      preview.append(el('p', '安装将运行作者提供的代码。机器兼容性和 Hash 校验不代表 MieMie 安全审核。', 'mm-hub-note'));
      action(preview, '安装', async () => {await packages.install(candidate); report('已安装到全局脚本；正在等待扩展注册。'); await activate('installed');}, 'package:install', busy);
    } else {preview.append(el('p', candidate.reason || '此项目未提供可安装 Package。', 'mm-hub-note')); link(preview, '查看 GitHub', repoURL);}
    parent.append(preview);
  }
  async function renderDiscover() {
    const generation = ++serial; content.replaceChildren(); configuration(content);
    const form = el('form', undefined, 'mm-catalog-search'), search = el('input'); search.placeholder = '搜索扩展'; search.value = query; search.setAttribute('aria-label', '搜索扩展');
    const filter = el('select'); filter.setAttribute('aria-label', '来源筛选'); for (const [v,t] of [['','全部来源'],['github','GitHub'],['discord','Discord']]) {const o = el('option',t); o.value=v; filter.append(o);} filter.value=sourceFilter;
    const submit = el('button', '搜索'); submit.type='submit'; form.append(search,filter,submit); form.onsubmit=e=>{e.preventDefault();query=search.value.slice(0,100);sourceFilter=filter.value;page=1;void activate('discover');}; content.append(form);
    const direct = el('details'); direct.append(el('summary', '从作者 GitHub 查看安装兼容性'));
    const repo = el('input'); repo.type='url'; repo.value='https://github.com/SheepSheepLab/MieMie-Polisher'; repo.setAttribute('aria-label','GitHub Repository URL'); direct.append(repo);
    action(direct,'预览项目',()=>previewInstall(repo.value.trim(),direct),'github:preview',!packages); content.append(direct);
    const list=el('div'); content.append(list);
    if (!registry.getBase()) {list.append(el('p','尚未配置 Registry。发现与投稿需要连接 Registry，本地已安装扩展不受影响。','mm-hub-note'));return;}
    list.append(el('p','正在读取 Catalog…','mm-hub-note'));
    try {
      const params=new URLSearchParams({page:String(page),pageSize:'12',q:query,source:sourceFilter});
      const result=await registry.api('/api/catalog?'+params);
      if(disposed||generation!==serial||active!=='discover')return;
      if(!Array.isArray(result.items))throw Error('Catalog 格式异常。');
      list.replaceChildren();
      for(const item of result.items) {
        const card=el('article',undefined,'mm-extension-card'); card.dataset.catalogId=item.id;
        icon(card,item.github?.manifest?.iconUrl||item.icon); card.append(el('strong',item.name),el('p','作者：'+item.author,'mm-hub-note'),el('p',item.description,'mm-hub-note'));
        const profile=el('p',undefined,'mm-submit-profile'); icon(profile,item.submitter?.avatarUrl);profile.append(el('span','投稿者：'+(item.submitter?.displayName||'未提供')));card.append(profile);
        if(item.version)card.append(el('p','Catalog 记录版本：'+item.version,'mm-hub-note'));
        card.append(el('p',item.sourceType==='github'?'来源：作者 GitHub · 文件由作者 Release 提供':'来源：Discord · 前往作者原帖获取','mm-hub-note'));
        const actions=el('div',undefined,'mm-extension-actions');card.append(actions);
        if(item.sourceType==='github') {link(actions,'查看 GitHub',item.sourceUrl);
          if(item.sourceUrl.toLowerCase()==='https://github.com/sheepsheeplab/miemie-polisher')card.append(el('p','MieMie 官方项目 · 投稿身份不代表作者认证','mm-hub-note'));
          if(packages&&item.github?.compatibility==='installable'){card.append(el('p','机器安装兼容，不代表已审核安全；安装将运行作者代码。','mm-hub-note'));const knownId=item.github?.manifest?.id;if(knownId&&runtime.get(knownId))action(actions,'已安装',()=>activate('installed'));else action(actions,'安装',async()=>{const candidate=await packages.inspect(item.sourceUrl);if(!candidate.installable)throw Error(candidate.reason||'项目不再提供可安装包。');await packages.install(candidate);await activate('installed');},item.id+':install');}
          else if(packages)action(actions,'检查安装兼容性',()=>previewInstall(item.sourceUrl,card),item.id+':preview');}
        else if(item.sourceType==='discord')link(actions,'前往 Discord',item.sourceUrl);
        list.append(card);
      }
      if(!result.items.length)list.append(el('p','没有符合条件的上架项目。','mm-hub-note'));
      const paging=el('div',undefined,'mm-extension-actions'); if(page>1)action(paging,'上一页',()=>{page--;return activate('discover');}); if(result.hasMore)action(paging,'下一页',()=>{page++;return activate('discover');});list.append(paging);
    }catch(error){if(!disposed&&generation===serial){list.replaceChildren(el('p','Catalog 无法连接：'+error.message,'mm-extension-error'));}}
  }
  function submissionForm(item) {
    ++serial;
    const form=el('form',undefined,'mm-submission-form'); form.dataset.submissionForm='';
    const fields={};
    for(const [name,label,multiline] of [['name','脚本名称'],['author','作者'],['description','简介',true],['sourceUrl','GitHub Repository / Discord 原帖 URL'],['icon','Icon URL（可选）'],['tags','标签（逗号分隔）']]) {
      const wrap=el('label',label),input=el(multiline?'textarea':'input'); input.name=name;input.value=name==='tags'?(item?.tags||[]).join(', '):(item?.[name]||'');input.maxLength=name==='description'?2000:name==='sourceUrl'||name==='icon'?2048:120; if(['name','author','description','sourceUrl'].includes(name))input.required=true;wrap.append(input);form.append(wrap);fields[name]=input;
    }
    const source=el('select');source.name='sourceType';for(const value of ['github','discord']){const o=el('option',value==='github'?'GitHub':'Discord');o.value=value;source.append(o);}source.value=item?.sourceType||'github';form.prepend(source);
    action(form,'读取 GitHub 资料',async()=>{if(source.value!=='github')throw Error('仅 GitHub 支持预填。');const result=await registry.api('/api/github/preview?url='+encodeURIComponent(fields.sourceUrl.value),{authenticated:true});const m=result.manifest||result.github?.manifest;if(!m){report('未找到标准 Manifest，请手动填写。');return;}for(const key of ['name','author','description'])if(typeof m[key]==='string')fields[key].value=m[key];if(m.iconUrl)fields.icon.value=m.iconUrl;report('已预填，请确认展示信息后提交。');});
    const save=el('button',item?'保存修改':'提交扩展');save.type='submit';form.append(save);
    action(form,'取消',()=>activate('mine'));
    form.onsubmit=async event=>{event.preventDefault();if(save.disabled)return;save.disabled=true;try{const payload={sourceType:source.value};for(const [key,input]of Object.entries(fields))payload[key]=key==='tags'?input.value.split(',').map(x=>x.trim()).filter(Boolean):input.value.trim();await registry.api('/api/submissions'+(item?'/'+encodeURIComponent(item.id):''),{method:item?'PATCH':'POST',body:payload,authenticated:true});await activate('mine');report('投稿已保存。默认上架不代表官方审核或作者认证。');}catch(e){report(e.message);}finally{save.disabled=false;}};
    content.replaceChildren(form);
  }
  async function renderMine() {
    const generation=++serial;content.replaceChildren();configuration(content);
    const identity=registry.getIdentity();
    if(!identity){content.append(el('p','使用 Discord 登录后即可提交和管理你的扩展。','mm-hub-note'));action(content,'使用 Discord 登录',async()=>{await registry.login();await activate('mine');},'registry:login');return;}
    const profile=el('div',undefined,'mm-submit-profile');icon(profile,identity.profile?.avatarUrl);profile.append(el('strong',identity.profile?.displayName||''));content.append(profile);
    action(content,'提交扩展',()=>submissionForm()); action(content,'退出登录',async()=>{await registry.logout();await activate('mine');},'registry:logout');
    if(identity.isAdmin)action(content,'管理员管理',renderAdmin,'registry:admin');
    try {
      const result=await registry.api('/api/submissions',{authenticated:true});if(disposed||generation!==serial||active!=='mine')return;
      if(!Array.isArray(result.items))throw Error('我的投稿格式异常。');
      for(const item of result.items){const card=el('article',undefined,'mm-extension-card');card.append(el('strong',item.name),el('p','作者：'+item.author+' · 投稿状态：'+item.status+' · 管理状态：'+(item.moderation||'visible'),'mm-hub-note'));action(card,'编辑',()=>submissionForm(item),item.id+':edit');if(!item.moderation||item.moderation==='visible')action(card,item.status==='listed'?'下架':'重新上架',async()=>{await registry.api('/api/submissions/'+encodeURIComponent(item.id)+'/status',{method:'POST',authenticated:true,body:{status:item.status==='listed'?'unlisted':'listed'}});await activate('mine');},item.id+':status');content.append(card);}
      if(!result.items.length)content.append(el('p','你还没有投稿。','mm-hub-note'));
    }catch(error){report('我的投稿无法读取：'+error.message);if(!registry.getIdentity())void activate('mine');}
  }
  async function renderAdmin(adminPage=1) {
    if(!registry.getIdentity()?.isAdmin)return;
    const generation=++serial;
    const result=await registry.api('/api/admin/submissions?page='+adminPage,{authenticated:true});if(disposed||generation!==serial)return;
    content.replaceChildren(el('h3','管理员管理'));action(content,'返回我的',()=>activate('mine'));
    for(const item of result.items||[]){const card=el('article',undefined,'mm-extension-card');card.append(el('strong',item.name),el('p','状态：'+item.status,'mm-hub-note'));const reason=el('input');reason.placeholder='管理原因';reason.maxLength=500;card.append(reason);for(const [status,label]of [['hidden','隐藏'],['unlisted','下架'],['listed','恢复']])action(card,label,async()=>{await registry.api('/api/admin/submissions/'+encodeURIComponent(item.id)+'/moderation',{method:'POST',authenticated:true,body:{action:({hidden:'hide',unlisted:'unlist',listed:'restore'})[status],reason:reason.value}});await renderAdmin(adminPage);});if(item.ownerDiscordUserId)action(card,item.submitterBanned?'解除投稿者封禁':'封禁投稿者',async()=>{await registry.api('/api/admin/identities/'+encodeURIComponent(item.ownerDiscordUserId)+'/ban',{method:'POST',authenticated:true,body:{banned:!item.submitterBanned,reason:reason.value}});await renderAdmin(adminPage);});content.append(card);}
    const paging=el('div',undefined,'mm-extension-actions');if(adminPage>1)action(paging,'上一页',()=>renderAdmin(adminPage-1));if(result.hasMore)action(paging,'下一页',()=>renderAdmin(adminPage+1));content.append(paging);
    const ban=el('div');const id=el('input');id.placeholder='需要管理的 Discord User ID（仅管理员）';const reason=el('input');reason.placeholder='封禁原因';ban.append(id,reason);for(const [banned,label]of [[true,'封禁投稿者'],[false,'解除封禁']])action(ban,label,async()=>{await registry.api('/api/admin/identities/'+encodeURIComponent(id.value.trim())+'/ban',{method:'POST',authenticated:true,body:{banned,reason:reason.value}});report('投稿者权限已更新。');});content.append(ban);
  }
  async function activate(tab=active) {
    if(disposed)return;active=tab;report('');for(const[id,b]of tabButtons)b.setAttribute('aria-selected',String(id===active));
    try{if(active==='installed')await renderInstalled();else if(active==='mine')await renderMine();else await renderDiscover();}catch(e){report(e.message);}
  }
  return {activate,report,refresh(){if(active==='installed')void renderInstalled();},dispose(){disposed=true;++serial;registry.dispose();packages?.dispose();tabs.remove();notice.remove();content.remove();},getActive:()=>active};
}
