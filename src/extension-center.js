// Product declaration never grants installation; GitHub Language is deliberately unused.
const productDistribution=(type,source,github)=>({tavern_extension:source==='github'&&github?.compatibility==='installable'?'managed_install':'external_release',standalone_app:'external_release',web_tool:'open_url'})[type];
import {createSubmissionSelects} from './submission-select.js';
import {HUB_COPY} from './ui-copy.js';
// Catalog is optional online UI; this module is never a Core startup dependency.
export function createExtensionCenter({host, body, accountContainer, runtime, sources, shortcuts, packages, registry, refreshLaunchers = () => {}}) {
  const doc = host.document, configKey = 'miemie_registry_url_v1';
  let disposed = false, active = 'discover', serial = 0, page = 1, query = '', sourceFilter = '', busy = false;
  const candidates = new Map();
  let clearForm=()=>{};
  function el(tag, text, className) {const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e;}
  const tabs = el('nav', undefined, 'mm-ecosystem-tabs'), content = el('div'), notice = el('p', '', 'mm-hub-note');
  const main = el('div', undefined, 'mm-center-main');
  const account = accountContainer || el('div', undefined, 'mm-header-account');
  if (!accountContainer) body.before(account);
  body.classList.add('mm-center-layout'); notice.classList.add('mm-center-notice');
  tabs.setAttribute('aria-label',HUB_COPY.extensionCenter+'导航');
  notice.setAttribute('role', 'status'); main.append(notice,content); body.append(tabs,main);
  const tabButtons = new Map();
  for (const [id, label] of [['discover', HUB_COPY.discover], ['installed', HUB_COPY.installed], ['mine', HUB_COPY.mine]]) {
    const b = el('button'); const glyph=el('span',{discover:'◈',installed:'▦',mine:'◎'}[id]); glyph.setAttribute('aria-hidden','true'); b.append(glyph,el('span',label)); b.setAttribute('aria-label',label); b.title=label; b.type = 'button'; b.dataset.centerTab = id; b.onclick = () => activate(id); tabs.append(b); tabButtons.set(id, b);
  }
  try {const override = host.localStorage.getItem(configKey); if (override) registry.setBase(override);} catch (_) {}
  const unsubscribe = registry.subscribe?.(() => {
    if (disposed) return; renderAccount(); if (active === 'installed') return;
    // Authorized cards and pending responses are invalid as soon as identity changes.
    ++serial; page = 1; content.replaceChildren(); void activate(active);
  });
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
  async function operate(fn) {
    if (busy) return; busy = true;
    try {const result = await fn(); if (result?.ok === false) throw Error(result.error || '操作失败。'); report(result?.action === 'updated' && result.persistence === 'confirmed' ? ('更新完成：已重新读取宿主脚本并确认服务器保存。' + (result.runtimeConfirmed ? '新版运行已确认。' : '此扩展未运行，启用后加载新版。')) : '操作完成；脚本保存与运行状态请在酒馆助手中确认。');}
    finally {busy = false; if (!disposed) {refreshLaunchers(); await renderInstalled();}}
  }
  async function renderInstalled() {
    if (disposed || active !== 'installed') return;
    const generation = ++serial, focusedShortcut=doc.activeElement?.dataset?.shortcut;
    let physical = [], unavailable = '';
    try {physical = packages ? await packages.listInstalled() : [];} catch (e) {unavailable = e.message;}
    if (disposed || active !== 'installed' || generation !== serial) return;
    content.replaceChildren();
    content.append(el('p', '已识别的全局 Package 可以管理酒馆助手脚本条目。其他扩展的“Runtime 注销”只清理运行实例，不删除原始脚本。物理卸载会删除该脚本条目及其 data，确认后直接卸载，不生成备份；localStorage 等外部业务设置不清空。', 'mm-hub-note'));
    if (unavailable) content.append(el('p', 'Package 管理不可用：' + unavailable, 'mm-hub-note'));
    // Product presentation policy comes from the build, not specific tool IDs.
    const userManaged = id => sources.policy?.(id)?.management !== 'hub';
    const managed = new Map(physical.filter(x => userManaged(x.id)).map(x => [x.id, x])), records = new Map(runtime.list().filter(x => userManaged(x.manifest.id)).map(x => [x.manifest.id, x]));
    const ids = new Set([...managed.keys(), ...records.keys()]);
    for (const id of ids) {
      const local = records.get(id), installed = managed.get(id), manifest = local?.manifest || installed?.manifest || installed || {};
      const card = el('article', undefined, 'mm-extension-card'); card.dataset.extensionId = id;
      const title = el('div', undefined, 'mm-extension-title'); title.append(el('strong', manifest.name || installed?.name || id));
      const enabled = installed ? installed.enabled : !!local?.enabled;
      title.append(el('small', (installed ? (installed.version || '保存版本待确认') : (manifest.version || '')) + ' · ' + (enabled ? '已启用' : '已停用'))); card.append(title);
      card.append(el('p', manifest.description || id, 'mm-hub-note'));
      if (installed) card.append(el('p', '酒馆脚本名称：' + installed.name + '（更新保留原名；版本以已保存内容为准）', 'mm-hub-note'));
      card.append(el('p', 'Launcher：' + (local?.launcherAvailable ? '可用' : '未提供或未启用'), 'mm-hub-note'));
      for (const error of [local?.error, local?.launcherError]) if (error) card.append(el('p', error, 'mm-extension-error'));
      const candidate = candidates.get(id); if (candidate) card.append(el('p', '最新版本：' + candidate.version, 'mm-hub-note'));
      if (installed?.persistenceError) card.append(el('p', installed.persistenceError, 'mm-extension-error'));
      if (installed && local && installed.version !== local.manifest.version) {
        card.append(el('p', '已保存版本：' + (installed.version || '待确认') + ' · 实际运行版本：' + local.manifest.version + '。尚未完成新版运行确认。', 'mm-extension-error'));
        if (installed.version && !installed.persistenceError && installed.version === installed.memoryVersion) {
          card.append(el('p', '如需重新加载，请先停止生成并保存编辑；刷新会中断当前任务。', 'mm-hub-note'));
          action(card, '刷新页面加载已保存版本', () => host.location.reload(), id + ':reload-page');
        }
      }
      if(local?.shortcutLauncherAvailable&&shortcuts){
        const label=el('label',undefined,'mm-shortcut-toggle'),toggle=el('input'),copy=el('span',undefined,'mm-shortcut-copy');
        toggle.type='checkbox';toggle.setAttribute('role','switch');toggle.setAttribute('aria-label','显示悬浮球');toggle.dataset.shortcut=id;
        const update=()=>{toggle.checked=shortcuts.enabled(id)&&(!shortcuts.mounted||shortcuts.mounted(id));toggle.setAttribute('aria-checked',String(toggle.checked));};
        update();toggle.disabled=!!(busy||local.busy||!local.enabled);
        toggle.onchange=()=>{try{shortcuts.set(id,toggle.checked);}catch(e){report(e.message);}finally{update();}};
        toggle.onkeydown=event=>{if(event.key==='Enter'&&!toggle.disabled){event.preventDefault();toggle.click();}};
        const track=el('span',undefined,'mm-switch-track');track.setAttribute('aria-hidden','true');track.append(el('span',undefined,'mm-switch-thumb'));
        copy.append(el('span','显示悬浮球'),el('small','在酒馆页面创建快捷入口'));
        label.append(copy,toggle,track);card.append(label);
      }
      const actions = el('div', undefined, 'mm-extension-actions'); card.append(actions);
      if (local?.launcherAvailable) action(actions, '打开', () => runtime.open(id), id + ':open', local.busy);
      action(actions, enabled ? '停用' : '启用', () => operate(async () => {
        if (!installed) return enabled ? runtime.disable(id) : runtime.enable(id);
        return packages.setEnabled(id, !enabled);
      }), id + ':toggle', busy || local?.busy);
      if (installed) {
        action(actions, '检查更新', async () => {const next = await packages.check(id); candidates.set(id, next); await renderInstalled();}, id + ':check', busy);
        if (candidate?.available) action(actions, '更新', () => operate(() => packages.update(id, candidate)), id + ':update', busy);
        action(actions, '卸载', () => operate(async () => {await packages.uninstall(id); if (runtime.get(id)) await runtime.uninstall(id); candidates.delete(id);}), id + ':uninstall', busy);
        link(actions, '作者 GitHub', installed.repoUrl);
      } else action(actions, 'Runtime 注销', () => operate(() => runtime.uninstall(id)), id + ':uninstall', busy || local?.busy);
      content.append(card);
    }
    for (const manifest of sources.list().filter(x => userManaged(x.id) && !records.has(x.id) && !managed.has(x.id))) action(content, '注册 ' + manifest.name, () => operate(() => sources.register(manifest.id)), manifest.id + ':register');
    if (!ids.size) content.append(el('p', '没有已注册的扩展。', 'mm-hub-note'));
    if(focusedShortcut)[...content.querySelectorAll('[data-shortcut]')].find(input=>input.dataset.shortcut===focusedShortcut)?.focus({preventScroll:true});
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
    const generation = ++serial; content.replaceChildren();
    const form = el('form', undefined, 'mm-catalog-search'), search = el('input'); search.placeholder = '搜索扩展'; search.value = query; search.setAttribute('aria-label', '搜索扩展');
    const filter = el('select'); filter.setAttribute('aria-label', '来源筛选'); for (const [v,t] of [['','全部来源'],['github','GitHub'],['discord','Discord']]) {const o = el('option',t); o.value=v; filter.append(o);} filter.value=sourceFilter;
    const submit = el('button', '搜索'); submit.type='submit'; form.append(search,filter,submit); form.onsubmit=e=>{e.preventDefault();query=search.value.slice(0,100);sourceFilter=filter.value;page=1;void activate('discover');}; content.append(form);
    const direct = el('details'); direct.append(el('summary', '从作者 GitHub 查看安装兼容性'));
    const repo = el('input'); repo.type='url'; repo.placeholder='https://github.com/作者/仓库'; repo.setAttribute('aria-label','GitHub Repository URL'); direct.append(repo);
    action(direct,'预览项目',()=>previewInstall(repo.value.trim(),direct),'github:preview',!packages); content.append(direct);
    const list=el('div'); content.append(list);
    if (!registry.getBase()) {list.append(el('p','在线扩展服务暂未开放；本地已安装扩展仍可正常使用。','mm-hub-note'));return;}
    list.append(el('p','正在读取扩展目录…','mm-hub-note'));
    try {
      const params=new URLSearchParams({page:String(page),pageSize:'12',q:query,source:sourceFilter});
      const result=await registry.api('/api/catalog?'+params,{authenticated:'optional'});
      if(disposed||generation!==serial||active!=='discover')return;
      if(!Array.isArray(result.items))throw Error('Catalog 格式异常。');
      list.replaceChildren();
      for(const item of result.items) {
        const card=el('article',undefined,'mm-extension-card'); card.dataset.catalogId=item.id;
        const heading=el('div',undefined,'mm-catalog-heading');
        icon(heading,item.github?.manifest?.iconUrl||item.icon);
        const name=el('div',undefined,'mm-catalog-name'), title=el('div',undefined,'mm-catalog-title');
        title.append(el('strong',item.name));if(item.version)title.append(el('small',item.version,'mm-catalog-version'));
        name.append(title,el('small','作者：'+item.author));heading.append(name);
        const badge=el('span',item.classification==='official'?HUB_COPY.classification.official:HUB_COPY.classification.community,'mm-identity-badge');
        badge.dataset.classification=item.classification==='official'?'official':'community';
        const assurance=el('div',undefined,'mm-catalog-assurance');assurance.append(badge);
        card.append(heading,assurance,el('p',item.description,'mm-catalog-description'));
        const meta=el('div',undefined,'mm-catalog-meta');
        for(const text of [item.sourceType==='github'?'来源：GitHub':'来源：Discord',
          {tavern_extension:'酒馆扩展',standalone_app:'独立应用',web_tool:'Web 工具'}[item.type]||'酒馆扩展',
          item.platforms?.join(', ')])if(text)meta.append(el('span',text));
        const footer=el('div',undefined,'mm-catalog-footer'),details=el('div',undefined,'mm-catalog-details');details.append(meta);
        const actions=el('div',undefined,'mm-extension-actions');card.append(actions);
        if(item.type==='web_tool'){link(actions,'打开网站',item.websiteUrl);link(actions,'原始来源',item.sourceUrl);}
        else if(item.type==='standalone_app'){link(actions,'前往作者发布页',item.sourceType==='github'?item.sourceUrl.replace(/\/$/,'')+'/releases':item.sourceUrl);}
        else if(item.sourceType==='github') {
          if(packages&&(!item.type||item.type==='tavern_extension')&&(!item.distribution||item.distribution==='managed_install')&&item.github?.compatibility==='installable'){assurance.prepend(el('p','机器安装兼容，不代表已审核安全；安装将运行作者代码。','mm-hub-note'));const knownId=item.github?.manifest?.id;if(knownId&&runtime.get(knownId))actions.append(el('span',HUB_COPY.installed,'mm-installed-status'));else action(actions,'安装',async()=>{const candidate=await packages.inspect(item.sourceUrl);if(!candidate.installable)throw Error(candidate.reason||'项目不再提供可安装包。');if(knownId&&candidate.id!==knownId)throw Error('项目的扩展身份已改变，请重新确认目录记录。');await packages.install(candidate);await activate('installed');},item.id+':install');}
          else if(!item.type||item.type==='tavern_extension')link(actions,'前往 GitHub',item.sourceUrl);
          else link(actions,item.distribution==='open_url'?'打开链接':'前往作者发布页',item.distribution==='open_url'?item.sourceUrl:item.sourceUrl.replace(/\/$/,'')+'/releases');}
        else if(item.sourceType==='discord')link(actions,'前往 Discord',item.sourceUrl);
        const submitter=el('div',undefined,'mm-catalog-submitter');
        icon(submitter,item.submitter?.avatarUrl,'投稿者头像');submitter.append(el('span','投稿者：'+(item.submitter?.displayName||'未提供')));details.append(submitter);
        if(item.sourceType==='github') {
          const links=el('div',undefined,'mm-catalog-links');
          const post=Object.hasOwn(item,'discordPostUrl')?item.discordPostUrl:item.discordUrl;
          for(const [label,caption,url] of [['GitHub 仓库','查看仓库',item.sourceUrl],['Discord 发布帖','查看发布帖',post]]){
            const row=el('div');row.append(el('span',label+'：'));if(safeURL(url))link(row,caption,url);else row.append(el('span','暂无'));links.append(row);
          }
          footer.append(links);
        }
        footer.append(details);card.append(footer);list.append(card);
      }
      if(!result.items.length)list.append(el('p','没有符合条件的上架项目。','mm-hub-note'));
      const paging=el('div',undefined,'mm-extension-actions'); if(page>1)action(paging,'上一页',()=>{page--;return activate('discover');}); if(result.hasMore)action(paging,'下一页',()=>{page++;return activate('discover');});list.append(paging);
    }catch(error){if(!disposed&&generation===serial){list.replaceChildren(el('p','扩展目录无法连接：'+error.message,'mm-extension-error'));}}
  }
  function submissionForm(item) {
    clearForm();
    const generation = ++serial;
    const form=el('form',undefined,'mm-submission-form'); form.dataset.submissionForm='';let choices=null;
    const fields={};
    for(const [name,label,multiline] of [['name','项目名称'],['author','作者'],['description','简介',true],['githubUrl','GitHub Repository URL'],['discordPostUrl','Discord 发布帖（可选）'],['discordUrl','Discord 原帖 URL'],['websiteUrl','Website URL（Web Tool 必填）'],['icon','Icon URL（可选）'],['tags','标签（逗号分隔）']]) {
      const wrap=el('label',label),input=el(multiline?'textarea':'input'); input.name=name;input.value=name==='tags'?(item?.tags||[]).join(', '):(item?.[name]||'');input.maxLength=name==='description'?2000:name==='githubUrl'||name==='discordUrl'||name==='discordPostUrl'||name==='icon'||name==='websiteUrl'?2048:120; if(['name','author','description'].includes(name))input.required=true;wrap.append(input);form.append(wrap);fields[name]=input;
    }
    fields.githubUrl.value=(item?.sourceType==='github'?item.sourceUrl:item?.githubUrl)||'';
    fields.discordUrl.value=(item?.sourceType==='discord'?item.sourceUrl:'')||'';
    fields.discordPostUrl.value=item?.sourceType==='github'?(Object.hasOwn(item,'discordPostUrl')?item.discordPostUrl:item.discordUrl)||'':'';
    fields.githubUrl.type=fields.discordUrl.type=fields.discordPostUrl.type='url';
    const discordWrap=fields.discordUrl.parentElement,discordRow=el('div',undefined,'mm-link-verify-row');discordRow.append(fields.discordUrl);discordWrap.append(discordRow);
    const githubWrap=fields.githubUrl.closest('label'),githubRow=el('div',undefined,'mm-github-inspect-row');githubRow.append(fields.githubUrl);githubWrap.append(githubRow);
    const prefillWrap=el('div'),detection=el('p','', 'mm-hub-note');
    detection.dataset.packageDetection='';detection.setAttribute('role','status');
    let inspectedPackage=null,previewSerial=0,submitting=false,save,autoTimer=null,pendingPreview=null,inspectionState='waiting',pastePending=false,previewWantsPrefill=false;
    const source=el('select');source.name='sourceType';source.setAttribute('aria-label','来源');for(const value of ['github','discord']){const o=el('option',value==='github'?'GitHub':'Discord');o.value=value;source.append(o);}source.value=item?.sourceType||'github';form.prepend(source);
    let productAnchor=source;
    function selectField(name,label,options,value){const wrap=el('label',label),select=el('select');select.name=name;for(const [v,t]of options){const o=el('option',t);o.value=v;select.append(o);}select.value=value;wrap.append(select);form.insertBefore(wrap,productAnchor.nextSibling);productAnchor=wrap;return select;}
    const type=selectField('type','产品类型',[['tavern_extension','酒馆扩展'],['standalone_app','独立应用'],['web_tool','Web 工具']],item?.type||'tavern_extension');
    const distributionWrap=el('label','分发方式'),distributionField=el('select');distributionField.name='distribution';distributionField.disabled=true;distributionField.dataset.distribution='';distributionField.setAttribute('aria-label','分发方式（自动检测）');distributionWrap.append(distributionField);form.insertBefore(distributionWrap,productAnchor.nextSibling);
    const platformWrap=el('label','平台（逗号分隔：windows, macos, linux, android, ios, web）'),platforms=el('input');platforms.name='platforms';platforms.value=(item?.platforms||[]).join(', ');platformWrap.append(platforms);form.append(platformWrap);
    function refreshProduct(){
      const distribution=productDistribution(type.value,source.value,inspectedPackage);
      const waiting=source.value==='github'&&type.value==='tavern_extension'&&!inspectedPackage;
      const option=el('option',waiting?({waiting:'由 Registry 检测后确定',pending:'正在检测…',error:'检测失败，请重试'}[inspectionState]):({managed_install:'Hub 安装',external_release:'作者发布页',open_url:'打开链接'}[distribution]||''));option.value=waiting?inspectionState:distribution;distributionField.replaceChildren(option);
      refreshSave();
      fields.websiteUrl.required=type.value==='web_tool';fields.websiteUrl.parentElement.hidden=type.value!=='web_tool';
      platformWrap.hidden=type.value==='tavern_extension';
    }
    function refreshSave(){if(save)save.disabled=submitting;}
    function invalidatePreview(){++previewSerial;if(autoTimer!==null)host.clearTimeout(autoTimer);autoTimer=null;pendingPreview=null;inspectedPackage=null;inspectionState='waiting';detection.textContent='';refreshProduct();}
    type.onchange=()=>{invalidatePreview();scheduleInspection();};refreshProduct();
    const visibilityWrap=el('label','可见范围'),visibility=el('select');visibility.name='visibility';
    for(const [value,label]of [['public','所有人'],['discord_guild','仅该 Discord 服务器成员']]){const option=el('option',label);option.value=value;visibility.append(option);}
    visibility.value=item?.visibility==='discord_guild'?'discord_guild':'public';visibilityWrap.append(visibility);form.append(visibilityWrap);
    const guildWrap=el('div',undefined,'mm-visibility-source'),guildLabel=el('label','作为可见范围依据的 Discord 帖子 / 消息链接'),guildSource=el('input'),verifyRow=el('div',undefined,'mm-link-verify-row');
    guildSource.name='visibilitySourceUrl';guildSource.type='url';guildSource.maxLength=2048;guildSource.setAttribute('aria-label','作为可见范围依据的 Discord 帖子 / 消息链接');guildSource.value=item?.visibilitySourceUrl||'';
    guildLabel.append(verifyRow);verifyRow.append(guildSource);guildWrap.append(guildLabel);form.append(guildWrap);
    const verified=el('div',undefined,'mm-guild-verification');verified.setAttribute('role','status');verified.setAttribute('aria-live','polite');guildWrap.append(verified);
    let verifySerial=0;
    const clearVerification=()=>{++verifySerial;verified.replaceChildren();};
    guildSource.addEventListener('input',clearVerification);
    const verificationSource=()=>source.value==='discord'?fields.discordUrl:guildSource;
    const verifyButton=action(verifyRow,'验证',async()=>{
      const input=verificationSource(),url=input.value.trim(),request=++verifySerial;
      if(!url){verified.textContent='请先填写 Discord 原帖链接。';return;}
      verified.textContent='正在验证服务器与成员资格…';
      try {
        const result=await registry.api('/api/discord/verify?url='+encodeURIComponent(url),{authenticated:true});
        if(disposed||generation!==serial||request!==verifySerial||verificationSource()!==input||input.value.trim()!==url)return;
        if(result.member!==true||!result.guild?.name)throw Error('服务器未返回有效验证结果。');
        verified.replaceChildren();const image=icon(verified,result.guild.iconUrl,'服务器头像');if(!result.guild.iconUrl)image.textContent=result.guild.name.slice(0,1);
        const copy=el('div');copy.append(el('strong',result.guild.name),el('p','成员资格已验证 · '+(source.value==='discord'||visibility.value==='discord_guild'?'保存后仅该服务器成员可见。':'当前仍为所有人可见。'),'mm-hub-note'),el('small','仅验证服务器与成员资格，不验证帖子内容；保存时会再次校验。'));verified.append(copy);
      }catch(error){if(!disposed&&generation===serial&&request===verifySerial)verified.textContent='验证失败：'+error.message;}
    },'discord:verify');
    const visibilityNote=el('p','', 'mm-hub-note');form.append(visibilityNote);
    function refreshVisibility() {
      const github=source.value==='github',restricted=github&&visibility.value==='discord_guild';
      for(const key of ['githubUrl','discordPostUrl','discordUrl']){
        const shown=key==='discordUrl'?!github:github;
        fields[key].closest('label').hidden=!shown;fields[key].disabled=!shown;
      }
      fields.githubUrl.required=github;fields.discordUrl.required=!github;
      visibilityWrap.hidden=!github;visibility.disabled=!github;choices?.refresh();
      guildWrap.hidden=!restricted;guildSource.required=restricted;guildSource.disabled=!restricted;
      if(restricted&&!guildSource.value.trim())guildSource.value=fields.discordPostUrl.value.trim();
      (github?verifyRow:discordRow).append(verifyButton);(github?guildWrap:discordWrap).append(verified);
      prefillWrap.hidden=!github;
      visibilityNote.textContent=!github ? '🔒 Discord 来源项目仅对原帖所在服务器成员显示。保存时会验证成员资格，不验证作者身份或帖子内容。' : restricted ? '使用依据链接所属的 Discord 服务器作为可见范围。服务器会确认投稿者也是成员；未登录或非成员无法看到此目录记录。不会读取 Discord 消息。' : '默认对所有人可见。Discord 发布帖仅作辅助展示。';
    }
    fields.discordUrl.addEventListener('input',clearVerification);
    visibility.onchange=()=>{clearVerification();refreshVisibility();};source.onchange=()=>{clearVerification();invalidatePreview();refreshVisibility();scheduleInspection();};refreshVisibility();
    prefillWrap.append(detection);githubWrap.append(prefillWrap);
    const validRepository=()=>{try{const u=new URL(fields.githubUrl.value.trim());return u.protocol==='https:'&&u.hostname==='github.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]+\/?$/.test(u.pathname);}catch{return false;}};
    function scheduleInspection(){if(autoTimer!==null)host.clearTimeout(autoTimer);autoTimer=host.setTimeout(()=>{autoTimer=null;if(!disposed&&generation===serial&&form.isConnected)void inspectGithub(false);},0);}
    fields.githubUrl.addEventListener('input',invalidatePreview);
    fields.githubUrl.addEventListener('paste',()=>{pastePending=true;scheduleInspection();});
    // Paste's input event runs after paste; defer scheduling until that input has landed.
    fields.githubUrl.addEventListener('input',event=>{if(pastePending||event.inputType==='insertFromPaste'){pastePending=false;scheduleInspection();}});
    fields.githubUrl.addEventListener('blur',()=>void inspectGithub(false));
    async function inspectGithub(manual){
      if(disposed||generation!==serial||source.value!=='github')return;
      if(!validRepository()){if(manual)detection.textContent='请填写完整的公开 GitHub 仓库地址。';return;}
      if(pendingPreview){previewWantsPrefill||=manual;return pendingPreview;}
      if(!manual&&inspectedPackage)return;
      previewWantsPrefill=manual;
      const sourceUrl=fields.githubUrl.value.trim(),request=++previewSerial,declaredType=type.value;
      const before=Object.fromEntries(['name','author','description','icon'].map(key=>[key,fields[key].value]));
      inspectedPackage=null;inspectionState='pending';refreshProduct();detection.textContent='正在检测 GitHub Package / Release…';
      const current=()=>!disposed&&generation===serial&&request===previewSerial&&source.value==='github'&&type.value===declaredType&&fields.githubUrl.value.trim()===sourceUrl;
      const task=(async()=>{try{
        const result=await registry.api('/api/github/preview?url='+encodeURIComponent(sourceUrl),{authenticated:true});
        if(!current())return;
        inspectedPackage=result;inspectionState='waiting';refreshProduct();
        detection.textContent=result.compatibility==='installable'?'已检测到标准 Hub 可安装扩展包。':'未检测到 Hub 安装包，将作为 GitHub 外部发布项目收录。';
        if(previewWantsPrefill){const m=result.manifest||result.github?.manifest;if(!m){report('展示信息请手动填写。');return;}
          for(const key of ['name','author','description'])if(typeof m[key]==='string'&&fields[key].value===before[key])fields[key].value=m[key];if(m.iconUrl&&fields.icon.value===before.icon)fields.icon.value=m.iconUrl;
          report('已预填，请确认展示信息后提交。读取仓库不会自动创建投稿。');}
      }catch(error){if(current()){inspectionState='error';refreshProduct();detection.textContent='GitHub 检测失败：'+error.message+'。可点击读取 GitHub 资料重试。';}}
      finally{if(current())pendingPreview=null;}})();pendingPreview=task;await task;
    }
    action(githubRow,'读取 GitHub 资料',()=>inspectGithub(true),'github:inspect');
    save=el('button',item?'保存修改':'提交扩展');save.type='submit';form.append(save);invalidatePreview();
    action(form,'取消',()=>activate('mine'));
    form.onsubmit=async event=>{
      event.preventDefault();if(save.disabled||submitting||disposed||generation!==serial)return;submitting=true;refreshSave();
      try {
        if(!['github','discord'].includes(source.value)||!productDistribution(type.value,source.value))throw Error('产品类型、来源与分发方式不兼容。');
        const payload={sourceType:source.value,visibility:source.value==='discord'?'discord_guild':visibility.value,type:type.value,platforms:platforms.value.split(',').map(x=>x.trim()).filter(Boolean)};
        for(const [key,input]of Object.entries(fields))if(!['githubUrl','discordUrl','discordPostUrl'].includes(key))payload[key]=key==='tags'?input.value.split(',').map(x=>x.trim()).filter(Boolean):input.value.trim();
        payload.sourceUrl=(source.value==='github'?fields.githubUrl:fields.discordUrl).value.trim();
        if(source.value==='github')payload.discordPostUrl=fields.discordPostUrl.value.trim();
        if(payload.visibility==='discord_guild')payload.visibilitySourceUrl=source.value==='discord'?payload.sourceUrl:guildSource.value.trim();
        await registry.api('/api/submissions'+(item?'/'+encodeURIComponent(item.id):''),{method:item?'PATCH':'POST',body:payload,authenticated:true});
        if(disposed||generation!==serial)return;await activate('mine');report('投稿已保存。默认上架不代表官方审核或作者认证。');
      }catch(e){if(!disposed&&generation===serial)report(e.message);}finally{submitting=false;refreshSave();}
    };
    choices=createSubmissionSelects({host,form});for(const select of [source,type,visibility])choices.add(select);
    clearForm=()=>{++previewSerial;if(autoTimer!==null)host.clearTimeout(autoTimer);autoTimer=null;choices.dispose();clearForm=()=>{};};
    content.replaceChildren(form);
  }
  async function renderMine() {
    const generation=++serial;content.replaceChildren();
    const identity=registry.getIdentity();if(generation!==serial)return;
    if(!identity){content.append(el('p','使用右上角 Discord 登录入口后，即可提交和管理你的扩展。','mm-hub-note'));return;}
    if(identity.canSubmit!==false)action(content,'提交扩展',()=>submissionForm());else content.append(el('p','此 Discord 身份的投稿权限已暂停。','mm-hub-note'));
    try {
      const result=await registry.api('/api/submissions',{authenticated:true});if(disposed||generation!==serial||active!=='mine')return;
      if(!Array.isArray(result.items))throw Error('我的投稿格式异常。');
      for(const item of result.items){const card=el('article',undefined,'mm-extension-card');card.append(el('strong',item.name),el('p','作者：'+item.author+' · 投稿状态：'+item.status+' · 管理状态：'+(item.moderation||'visible'),'mm-hub-note'));const actions=el('div',undefined,'mm-extension-actions');card.append(el('p',(item.sourceType==='discord'?'Discord':'GitHub')+' · '+(item.visibility==='discord_guild'?'仅该 Discord 服务器成员可见':'所有人可见'),'mm-hub-note'));if(identity.canSubmit!==false)action(actions,'编辑',()=>submissionForm(item),item.id+':edit');if(identity.canSubmit!==false&&(!item.moderation||item.moderation==='visible'))action(actions,item.status==='listed'?'下架':'重新上架',async()=>{await registry.api('/api/submissions/'+encodeURIComponent(item.id)+'/status',{method:'POST',authenticated:true,body:{status:item.status==='listed'?'unlisted':'listed'}});await activate('mine');},item.id+':status');card.append(actions);content.append(card);}
      if(!result.items.length)content.append(el('p','你还没有投稿。','mm-hub-note'));
    }catch(error){if(disposed||generation!==serial||active!=='mine')return;report('我的投稿无法读取：'+error.message);if(!registry.getIdentity())void activate('mine');}
  }
  function renderAccount() {
    if(disposed)return;
    // Reading an expired session may synchronously notify subscribers.
    const identity=registry.getIdentity();
    account.replaceChildren(); account.dataset.authenticated=String(!!identity);
    if(!identity){action(account,'Discord 登录',async()=>{await registry.login();renderAccount();if(!registry.subscribe)await activate();},'registry:login');return;}
    const profile=el('div',undefined,'mm-submit-profile');icon(profile,identity.profile?.avatarUrl);
    const copy=el('div',undefined,'mm-account-copy');copy.append(el('strong',identity.profile?.displayName||'Discord'));
    const status=el('span',identity.banned===true?HUB_COPY.account.restricted:identity.isAdmin===true?HUB_COPY.account.admin:HUB_COPY.account.regular);status.dataset.accountStatus='';copy.append(status);profile.append(copy);account.append(profile);
    action(account,'退出',async()=>{await registry.logout();renderAccount();if(!registry.subscribe)await activate();},'registry:logout');
  }
  async function activate(tab=active) {
    if(disposed)return;clearForm();active=tab;report('');renderAccount();for(const[id,b]of tabButtons){b.setAttribute('aria-selected',String(id===active));if(id===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
    try{if(active==='installed')await renderInstalled();else if(active==='mine')await renderMine();else await renderDiscover();}catch(e){report(e.message);}
  }
  renderAccount();
  return {activate,report,refresh(){if(active==='installed')void renderInstalled();},dispose(){disposed=true;clearForm();++serial;unsubscribe?.();registry.dispose();packages?.dispose();tabs.remove();main.remove();account.replaceChildren();if(!accountContainer)account.remove();body.classList.remove('mm-center-layout');},getActive:()=>active};
}
