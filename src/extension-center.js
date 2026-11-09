// Product declaration never grants installation; GitHub Language is deliberately unused.
const productDistribution=(type,source,github)=>({tavern_extension:source==='github'&&github?.compatibility==='installable'?'managed_install':'external_release',standalone_app:'external_release',web_tool:'open_url'})[type];
import {createSubmissionSelects} from './submission-select.js';
import {HUB_COPY} from './ui-copy.js';
import {parseExtensionRepository} from './extension-packages.js';
import hubQRCode from './vendor/qrcode-generator.mjs';
const catalogTypes={tavern_extension:'酒馆扩展',standalone_app:'独立应用',web_tool:'Web 工具'};
const catalogDistributions={managed_install:'Hub 安装',external_release:'作者发布页',open_url:'打开链接'};
const centerSnapshotMs=15000;
// Catalog is optional online UI; this module is never a Core startup dependency.
export function createExtensionCenter({host, body, accountContainer, progressContainer, runtime, sources, nativeEntries, packages, registry, panelIcon, refreshLaunchers = () => {}}) {
  const doc = host.document, configKey = 'miemie_registry_url_v1';
  let disposed = false, active = 'discover', serial = 0, page = 1, query = '', sourceFilter = '', busy = false;
  const candidates = new Map(), updateChecks = new Map(), updateActivity = new Map();
  let installationPhase = '';
  let installController = null, speedTimer = null, completionTimer = null, hideTimer = null;
  let visible = true, savedCheckTimer = null;
  let publicCatalog, ownSubmissions, viewRequest;
  function clearOnlineSnapshots() {publicCatalog=ownSubmissions=undefined;}
  function stopViewRequest() {viewRequest?.abort();viewRequest=undefined;}
  const savedCheckUntil = new Map();
  const savedVisualStates = new Map();
  function showSavedState(card,id,phase) {
    const now=host.performance.now(),previous=savedVisualStates.get(id);
    if(!phase)return;
    const state=previous?.phase===phase?previous:{phase,since:now};savedVisualStates.set(id,state);
    card.dataset.saveState=phase;
    // Rows are refreshed during polling; retain the animation's elapsed time.
    card.style.setProperty('--mm-save-elapsed',-(now-state.since)+'ms');
    card.setAttribute('aria-busy',String(phase==='pending'));
    card.setAttribute('aria-label',card.querySelector('strong').textContent+' · '+({pending:'正在确认酒馆保存',confirmed:'酒馆保存已确认',error:'状态异常，请查看条目中的说明'}[phase]));
  }
  let clearForm=()=>{},backForm=()=>false;
  let descriptionDialog=null;
  let closeLoginMenu=()=>false, disposeLoginButton=()=>{}, qrLogin=null, windowLoginPending=false;
  function el(tag, text, className) {const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e;}
  function closeDescription(restoreFocus=true,pointerReturn=false) {
    if(!descriptionDialog)return;
    const {dialog,opener}=descriptionDialog;descriptionDialog=null;
    dialog.removeEventListener('keydown',descriptionKey,true);
    if(pointerReturn&&opener.classList.contains('mm-catalog-row-open'))opener.dataset.pointerReturn='';
    if(dialog.open&&typeof dialog.close==='function')dialog.close();dialog.remove();
    if(restoreFocus&&opener.isConnected)opener.focus({preventScroll:true});
  }
  function descriptionKey(event) {
    if(descriptionDialog&&event.key==='Tab'){
      const {dialog}=descriptionDialog,first=dialog.querySelector('.mm-description-full'),last=dialog.querySelector('footer button');
      if(event.shiftKey&&(doc.activeElement===first||doc.activeElement===dialog.querySelector('h2'))||!event.shiftKey&&doc.activeElement===last){
        event.preventDefault();event.stopImmediatePropagation();(event.shiftKey?last:first).focus({preventScroll:true});
      }
    }
  }
  function detailHeader({name,author,version,iconUrl,glyph},badge,allowEmbedded=false) {
    const header=el('header',undefined,'mm-catalog-detail-header');
    icon(header,iconUrl,'',glyph,allowEmbedded).setAttribute('aria-hidden','true');
    const title=el('h2',name),copy=el('div');
    title.id='mm-description-title';title.tabIndex=-1;
    copy.append(title);
    if(author||version)copy.append(el('small',[author?'作者：'+author:'',version].filter(Boolean).join(' · ')));
    header.append(copy,badge);return header;
  }
  function showDetail(header,text,opener,installedId) {
    if(disposed||!visible)return;closeDescription(false);
    const dialog=el('dialog',undefined,'mm-description-dialog mm-catalog-detail-dialog');
    dialog.setAttribute('aria-labelledby','mm-description-title');
    text.tabIndex=0;const footer=el('footer'),back=el('button','返回');back.type='button';
    back.onclick=event=>closeDescription(true,event.detail>0);footer.append(back);dialog.append(header,text,footer);
    const feedback=installedId?el('p','','mm-installed-feedback'):null;
    if(feedback){feedback.setAttribute('role','status');feedback.hidden=true;dialog.insertBefore(feedback,footer);}
    dialog.addEventListener('cancel',event=>{event.preventDefault();closeDescription();});
    descriptionDialog={dialog,opener,installedId,feedback};(progressContainer||body).append(dialog);
    dialog.addEventListener('keydown',descriptionKey,true);
    dialog.showModal();header.querySelector('h2').focus({preventScroll:true});
  }
  function fact(list,label,value) {
    const field=el('dd');field.append(value);list.append(el('dt',label+'：'),field);return field;
  }
  function openDescription(item,opener,managed) {
    const header=detailHeader({...item,iconUrl:item.github?.manifest?.iconUrl||item.icon},catalogBadge(item));
    const text=el('div',undefined,'mm-description-full');
    text.append(el('h3','简介'),el('p',item.description,'mm-catalog-detail-description'));

    const sources=el('dl',undefined,'mm-catalog-facts mm-catalog-links');
    function projectLink(label,caption,url) {
      const field=fact(sources,label,'');link(field,caption,url);
      if(!field.firstElementChild)field.textContent='暂无';
    }
    if(item.sourceType==='github'){
      const post=Object.hasOwn(item,'discordPostUrl')?item.discordPostUrl:item.discordUrl;
      projectLink('GitHub 仓库','查看仓库',item.sourceUrl);
      projectLink('Discord 发布帖','查看发布帖',post);
    }else if(item.sourceType==='discord'){
      projectLink('Discord 原帖','查看原帖',item.sourceUrl);
    }
    if(item.type==='web_tool')projectLink('网站','打开网站',item.websiteUrl);
    text.append(el('h3','项目链接'),sources);

    const meta=el('dl',undefined,'mm-catalog-facts mm-catalog-meta');
    fact(meta,'来源',item.sourceType==='github'?'GitHub':'Discord');
    fact(meta,'产品类型',Object.hasOwn(catalogTypes,item.type)?catalogTypes[item.type]:catalogTypes.tavern_extension);
    if(Object.hasOwn(catalogDistributions,item.distribution))fact(meta,'分发方式',catalogDistributions[item.distribution]);
    if(item.platforms?.length)fact(meta,'平台',item.platforms.join('、'));
    if(item.tags?.length)fact(meta,'标签',item.tags.join('、'));
    if(item.visibility==='public'||item.visibility==='discord_guild')fact(meta,'可见范围',item.visibility==='public'?'所有人':'仅该 Discord 服务器成员');
    const submitter=el('span',undefined,'mm-catalog-submitter');
    icon(submitter,item.submitter?.avatarUrl,'投稿者头像');
    submitter.append(item.submitter?.displayName||'未提供');fact(meta,'投稿者',submitter);
    text.append(el('h3','项目信息'),meta);
    if(managed)text.append(el('p','安装兼容不代表已审核安全','mm-catalog-detail-note'));

    showDetail(header,text,opener);
  }
  const tabs = el('nav', undefined, 'mm-ecosystem-tabs'), content = el('div'), notice = el('p', '', 'mm-hub-note');
  const main = el('div', undefined, 'mm-center-main');
  const checkAnnouncement = el('div', '', 'mm-update-check-announcement');
  checkAnnouncement.setAttribute('role', 'status');
  const installProgress = el('div', undefined, 'mm-install-progress'), progressBar = el('progress'), progressText = el('span');
  installProgress.hidden = true; installProgress.dataset.installProgress = '';
  progressBar.max = 100; progressBar.setAttribute('aria-label', '安装进度');
  const cancelInstall = el('button', '取消下载'); cancelInstall.type = 'button'; cancelInstall.hidden = true;
  cancelInstall.dataset.cancelInstall = '';
  cancelInstall.onclick = () => {if (installController && installationPhase !== 'installing') {cancelInstall.disabled = true; installController.abort();}};
  const progressName = el('strong', '', 'mm-install-name'), progressDetails = el('div', undefined, 'mm-install-details');
  const progressStatus = el('span', '', 'mm-install-status'); progressStatus.setAttribute('role', 'status');
  progressDetails.append(progressStatus, progressBar, progressText);
  const progressIdentity=el('div',undefined,'mm-catalog-heading mm-install-identity');
  function setProgressIdentity(info={}) {
    progressIdentity.replaceChildren();icon(progressIdentity,info.iconUrl || info.icon);
    const copy=el('div',undefined,'mm-catalog-name'),title=el('div',undefined,'mm-catalog-title');
    progressName.textContent=info.name || '扩展';progressName.title=progressName.textContent;title.append(progressName);
    if(info.version)title.append(el('small',info.version,'mm-catalog-version'));
    copy.append(title,el('small','作者：'+(info.author || '未提供')));progressIdentity.append(copy);
  }
  installProgress.append(progressIdentity, progressDetails, cancelInstall);
  const progressMount = progressContainer || body;
  let installHandoff = null;
  function clearInstallHandoff() {
    if(!installHandoff)return;
    const {flight,motion,timer}=installHandoff;installHandoff=null;
    motion?.cancel();flight.remove();host.clearTimeout(timer);
    delete installProgress.dataset.handoff;
  }
  function playInstallHandoff(row) {
    const art=row?.querySelector(':scope > .mm-extension-icon');
    if(!art||typeof art.animate!=='function'||host.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
    const source=row.getBoundingClientRect(),panel=progressMount.getBoundingClientRect();
    if(!source.width||!panel.width)return;
    // Keep the tray stationary while the icon is in flight so the landing stays aligned.
    installProgress.dataset.handoff='flight';
    const target=installProgress.getBoundingClientRect();
    const x=source.left+source.width/2-panel.left;
    const y=Math.min(source.top+source.height/2,target.top-12)-panel.top;
    const dx=target.left+target.width/2-panel.left-x;
    const dy=target.top+Math.min(22,target.height/2)-panel.top-y;
    const flight=art.cloneNode(true);
    flight.classList.add('mm-install-flight');flight.setAttribute('aria-hidden','true');flight.removeAttribute('aria-label');
    const image=flight.querySelector('img');if(image)image.loading='eager';
    flight.style.left=x+'px';flight.style.top=y+'px';progressMount.append(flight);
    const motion=flight.animate([
      {opacity:0,transform:'translate(-50%,-50%) translateY(4px) scale(.76)'},
      {offset:.19,opacity:1,transform:'translate(-50%,-50%) translateY(-7px) scale(1.08)',easing:'cubic-bezier(.5,0,.83,.55)'},
      {offset:.79,opacity:1,transform:`translate(-50%,-50%) translate(${dx}px,${dy-5}px) scale(.86)`,easing:'ease-out'},
      {opacity:0,transform:`translate(-50%,-50%) translate(${dx}px,${dy}px) scale(1.06,.22)`},
    ],{duration:510,fill:'both'});
    const state=installHandoff={flight,motion,timer:null};
    void motion.finished.then(()=>{
      if(installHandoff!==state)return;
      flight.remove();installProgress.dataset.handoff='impact';
      state.timer=host.setTimeout(()=>{
        if(installHandoff!==state)return;
        installHandoff=null;installProgress.dataset.handoff='settled';
      },600);
    },()=>{});
  }
  function clearCompletion() {host.clearTimeout(completionTimer);host.clearTimeout(hideTimer);completionTimer=null;hideTimer=null;}
  function hideProgress() {clearCompletion();clearInstallHandoff();installProgress.hidden=true;delete installProgress.dataset.state;delete installProgress.dataset.handoff;progressMount.classList.remove('mm-download-active');}
  function showProgress() {installProgress.hidden=false;progressMount.classList.add('mm-download-active');}
  function finishProgress() {
    installProgress.dataset.state='completed';progressStatus.textContent='✓ 已写入';
    completionTimer=host.setTimeout(()=>{completionTimer=null;installProgress.dataset.state='leaving';hideTimer=host.setTimeout(hideProgress,380);},1200);
  }
  function stopSavedCheck() {host.clearTimeout(savedCheckTimer);savedCheckTimer=null;}
  function leave() {
    closeLoginMenu();closeQRLogin(false);closeDescription(false);visible=false;++serial;stopViewRequest();clearOnlineSnapshots();stopSavedCheck();hideProgress();
    if(installationPhase!=='installing')installController?.abort();
    if(speedTimer!==null)host.clearInterval(speedTimer);speedTimer=null;
  }
  const account = accountContainer || el('div', undefined, 'mm-header-account');
  if (!accountContainer) body.before(account);
  body.classList.add('mm-center-layout'); notice.classList.add('mm-center-notice');
  tabs.setAttribute('aria-label',HUB_COPY.extensionCenter+'导航');
  notice.setAttribute('role', 'status'); main.append(notice,content); body.append(tabs,main,checkAnnouncement);
  if(progressContainer)progressContainer.insertBefore(installProgress,progressContainer.querySelector('.mm-return'));else body.append(installProgress);
  const tabButtons = new Map();
  for (const [id, label] of [['discover', HUB_COPY.discover], ['installed', HUB_COPY.installed], ['mine', HUB_COPY.mine]]) {
    const b = el('button'); const glyph=el('span',{discover:'◈',installed:'▦',mine:'◎'}[id]); glyph.setAttribute('aria-hidden','true'); b.append(glyph,el('span',label)); b.setAttribute('aria-label',label); b.title=label; b.type = 'button'; b.dataset.centerTab = id; b.onclick = () => activate(id); tabs.append(b); tabButtons.set(id, b);
  }
  try {const override = host.localStorage.getItem(configKey); if (override) registry.setBase(override);} catch (_) {}
  const unsubscribe = registry.subscribe?.(() => {
    if (disposed) return; clearOnlineSnapshots();renderAccount(); if (active === 'installed') return;
    // Authorized cards and pending responses are invalid as soon as identity changes.
    ++serial; stopViewRequest(); page = 1; content.replaceChildren();
    if(visible)void activate(active);
  });
  function report(message) {
    if(disposed)return;
    notice.textContent=message||'';notice.hidden=!!installationPhase;
    if(installationPhase)progressStatus.textContent=message||'';
    const feedback=descriptionDialog?.feedback;
    if(feedback){feedback.textContent=message||'';feedback.hidden=!message;}
  }
  function safeURL(value, base) {try {if(typeof value!=='string'||!value.trim())return null;const url = new URL(value, base); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;} catch (_) {return null;}}
  const embeddedIcon=value=>typeof value==='string'&&/^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)?value:null;
  function manifestIcon(manifest) {
    const art=manifest?.iconUrl||manifest?.icon;
    if(!art)return null;
    const absolute=embeddedIcon(art)||safeURL(art);
    if(absolute)return absolute;
    if(typeof art!=='string'||!/^(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+$/i.test(art)||art.split('/').some(segment=>segment==='.'||segment==='..')||!/^\d+\.\d+\.\d+$/.test(manifest.version))return null;
    try{
      const {owner,repo}=parseExtensionRepository(manifest.repository);
      return 'https://raw.githubusercontent.com/'+owner+'/'+repo+'/v'+manifest.version+'/'+art;
    }catch(_){return null;}
  }
  function icon(parent, value, label = '', fallback = '🧩', allowEmbedded = false) {
    const wrapper = el('span', fallback, 'mm-extension-icon'); wrapper.setAttribute('aria-label', label);
    const url = (allowEmbedded && embeddedIcon(value)) || safeURL(value, registry.getBase() || undefined);
    // Local Registry avatar proxy is permitted only on the explicitly configured origin.
    let local; try {const u = new URL(value, registry.getBase()); if (u.origin === registry.getBase() && /^\/api\/avatars\//.test(u.pathname)) local = u.href;} catch (_) {}
    if (url || local) {const image = el('img'); image.alt = ''; image.referrerPolicy = 'no-referrer'; image.loading = 'lazy'; image.src = url || local; image.onerror = () => {image.remove(); wrapper.textContent = fallback;}; wrapper.replaceChildren(image);}
    parent.append(wrapper); return wrapper;
  }
  function action(parent, label, handler, key, disabled = false) {
    const b = el('button', label); b.type = 'button'; b.disabled = disabled; if (key) b.dataset.action = key;
    b.onclick = async () => {
      if (b.disabled || b.getAttribute('aria-disabled') === 'true' || disposed) return;
      b.disabled = true; report(''); if (!busy) hideProgress();
      try {const result = await handler(); if (result?.ok === false) throw Error(result.error || '操作失败。');}
      catch (error) {report(error.message || '操作失败。');}
      finally {if (!disposed) b.disabled = false;}
    }; parent.append(b); return b;
  }
  function link(parent, label, url, fullLabel) {
    const safe = safeURL(url); if (!safe) return;
    const a = el('a', label); a.href = safe; a.target = '_blank'; a.rel = 'noopener noreferrer';
    if(fullLabel){a.title=fullLabel;a.setAttribute('aria-label',fullLabel);}
    parent.append(a);
  }
  function installAction(parent, getCandidate, key, presentation = {}) {
    const button = action(parent, '安装', () => installPackage(getCandidate, presentation,parent.closest('.mm-catalog-row')), key, busy || !!packages?.isBusy?.());
    button.dataset.packageInstall = '';
  }
  function downloadPercent(detail) {
    if(Number.isSafeInteger(detail?.receivedBytes)&&Number.isSafeInteger(detail?.totalBytes)&&
      detail.totalBytes>0&&detail.receivedBytes>=0&&detail.receivedBytes<=detail.totalBytes)return Math.floor(detail.receivedBytes*100/detail.totalBytes);
    return null;
  }
  function downloadSpeed(samples,received,time) {
    while(samples.length>1&&samples[1].time<=time-5000)samples.shift();
    const elapsed=time-samples[0].time;
    return elapsed>=250?Math.max(0,(received-samples[0].received)*1000/elapsed):null;
  }
  async function installPackage(getCandidate, presentation, row) {
    if (busy || packages?.isBusy?.()) return;
    busy = true;visible=true;clearCompletion();delete installProgress.dataset.state;
    setProgressIdentity(presentation);
    const controller = new AbortController(); installController = controller;
    cancelInstall.hidden = true; cancelInstall.disabled = false;
    const sync = () => {for (const button of content.querySelectorAll('[data-package-install]')) button.disabled = busy;};
    let acceptingProgress = true, hasDownloaded = false;
    const byteSize = value => value >= 1048576 ? (value / 1048576).toFixed(2) + ' MB' : (value / 1024).toFixed(1) + ' KB';
    let samples = [], bytes = null;
    const clearSpeed = () => {if (speedTimer !== null) host.clearInterval(speedTimer); speedTimer = null; samples = []; bytes = null;};
    const renderSpeed = (sample = false) => {
      if (disposed || !visible || !acceptingProgress || !bytes) return;
      const time = host.performance.now();
      if (sample) samples.push({time, received: bytes.receivedBytes});
      const speed = downloadSpeed(samples,bytes.receivedBytes,time);
      const speedText = speed === null ? '正在计算速度…' : speed === 0 ? '0 B/s'
        : speed < 1 ? '不足 1 B/s' : speed < 1024 ? speed.toFixed(0) + ' B/s' : byteSize(speed) + '/s';
      const percent = Math.floor(bytes.receivedBytes * 100 / bytes.totalBytes);
      progressText.textContent = '下载 ' + percent + '% · ' + byteSize(bytes.receivedBytes) + ' / ' + byteSize(bytes.totalBytes)
        + ' · ' + speedText;
      if (bytes.receivedBytes < bytes.totalBytes && speed !== null) {
        report(speed === 0 ? '暂未收到新数据，正在等待…' : speed < 50 * 1024 ? '下载较慢，仍在继续…' : '正在下载…');
      }
    };
    const progress = (phase, detail) => {
      if (disposed || !visible || !acceptingProgress || controller.signal.aborted) return;
      installationPhase = phase;
      if (phase === 'installing') cancelInstall.hidden = true;
      report({verifying: '正在验证…', downloading: '正在下载…', relaying: 'GitHub 直连停滞，正在切换安全下载服务…', installing: '正在安装…'}[phase]);
      showProgress();
      const percent=phase==='downloading'?downloadPercent(detail):null;
      if (percent!==null) {
        hasDownloaded = detail.receivedBytes === detail.totalBytes;
        progressBar.value = percent; progressBar.setAttribute('aria-label', '安装包下载进度');
        if (!bytes || detail.receivedBytes < bytes.receivedBytes || detail.totalBytes !== bytes.totalBytes) {
          clearSpeed(); samples = [{time: host.performance.now(), received: detail.receivedBytes}];
          speedTimer = host.setInterval(() => renderSpeed(true), 1000);
        }
        bytes = {...detail}; renderSpeed();
      } else {
        clearSpeed();
        if (phase === 'relaying' || phase === 'downloading') hasDownloaded = false;
        progressBar.removeAttribute('value'); progressBar.setAttribute('aria-label', '安装进度');
        progressText.textContent = phase === 'verifying' ? (hasDownloaded ? '下载完成 · 正在校验安装包…' : '正在检查安装信息…')
          : phase === 'installing' ? '正在写入全局脚本…'
          : phase === 'relaying' ? '正在连接安全下载服务…' : '正在等待下载响应…';
      }
    };
    sync(); progress('verifying');playInstallHandoff(row);
    try {
      const candidate = await getCandidate(controller.signal);
      if (disposed) return;
      controller.signal.throwIfAborted(); cancelInstall.hidden = false;
      setProgressIdentity({...presentation,...candidate.manifest,iconUrl:presentation.iconUrl || candidate.manifest?.iconUrl});
      await packages.install(candidate, {signal: controller.signal, onProgress: progress});
      savedVisualStates.set(candidate.id,{phase:'pending',since:host.performance.now()});
      clearSpeed();
      if (disposed || !visible) return;
      await activate('installed');
      if(disposed || !visible)return;
      report('');
      progressBar.value = 100; progressBar.setAttribute('aria-label', '安装进度'); progressText.textContent = '已写入 · 保存待确认';finishProgress();
    } catch (error) {
      if (!disposed) hideProgress();
      if (controller.signal.aborted) throw Error('已取消安装；本地扩展未被修改。');
      throw error;
    } finally {clearSpeed(); cancelInstall.hidden = true; installController = null; acceptingProgress = false; busy = false; installationPhase = '';notice.hidden=false; if (!disposed) sync();}
  }
  async function operate(fn) {
    if (busy) return; busy = true;
    try {const result = await fn(); if (result?.ok === false) throw Error(result.error || '操作失败。'); report(result?.action === 'updated' && result.persistence === 'confirmed' ? ('更新完成：已重新读取宿主脚本并确认服务器保存。' + (result.runtimeConfirmed ? '新版运行已确认。' : 'Runtime 运行尚未确认。')) : '操作完成；脚本保存与运行状态请在酒馆助手中确认。');}
    finally {busy = false; if (!disposed) {refreshLaunchers(); await renderInstalled();}}
  }
  const updateLabels={
    downloading:['下载','正在下载更新'], verifying:['校验','正在校验更新'],
    relaying:['连接','正在连接安全下载服务'], installing:['写入','正在写入更新'],
    confirming:['保存','正在确认酒馆保存和运行状态'], complete:['✓','更新完成，酒馆保存已确认'],
  };
  function updateMeter(parent) {
    const meter=el('span',undefined,'mm-update-meter'),label=el('span',undefined,'mm-update-meter-label');
    const value=el('strong'),unit=el('small');label.append(value,unit);label.setAttribute('aria-hidden','true');
    const svgNS='http://www.w3.org/2000/svg',svg=doc.createElementNS(svgNS,'svg');
    svg.setAttribute('viewBox','0 0 56 56');svg.setAttribute('aria-hidden','true');
    for(const className of ['mm-update-track','mm-update-arc']){
      const circle=doc.createElementNS(svgNS,'circle');
      for(const [key,val] of Object.entries({class:className,cx:28,cy:28,r:24,pathLength:100}))circle.setAttribute(key,val);
      svg.append(circle);
    }
    meter.append(svg,label);meter.hidden=true;parent.append(meter);
    return {meter,value,unit,arc:svg.lastElementChild,button:meter.previousElementSibling,row:parent.parentElement};
  }
  function paintUpdate(state) {
    const {meter,value,unit,arc,button,row}=state.view;
    if(!meter.isConnected)return;
    const {phase,percent,speed}=state,complete=phase==='complete';
    const [short,label]=updateLabels[phase];
    if(doc.activeElement===button)row.querySelector('.mm-catalog-row-open').focus({preventScroll:true});
    button.hidden=true;meter.hidden=false;meter.dataset.phase=phase;
    meter.setAttribute('role',complete?'img':'progressbar');meter.setAttribute('aria-label',label);
    if(percent===null)meter.removeAttribute('aria-valuenow');else meter.setAttribute('aria-valuenow',String(percent));
    meter.toggleAttribute('data-indeterminate',!complete&&percent===null);
    arc.style.strokeDashoffset=String(complete?0:100-(percent??0));
    if(speed===null){
      value.textContent=short;unit.textContent='';
    }else {
      const scale=speed>=1048576?1048576:speed>=1024?1024:1;
      value.textContent=(speed/scale).toFixed(scale===1||speed/scale>=100?0:1);
      unit.textContent=({1:'B/s',1024:'KB/s',1048576:'MB/s'})[scale];
      meter.setAttribute('aria-valuetext',percent+'% · '+value.textContent+' '+unit.textContent);
    }
    if(speed===null)meter.removeAttribute('aria-valuetext');
    if(complete){
      row.dataset.updateComplete='';
      row.style.setProperty('--mm-update-elapsed',-(host.performance.now()-state.since)+'ms');
    }
  }
  async function updateInstalled(id,candidate,view) {
    if(busy||packages.isBusy?.())return;
    const state={view,phase:'verifying',percent:null,speed:null,timer:null,expiry:null};
    updateActivity.set(id,state);paintUpdate(state);
    let bytes=null,samples=[];
    const stopSpeed=()=>{host.clearInterval(state.timer);state.timer=null;bytes=null;samples=[];};
    const sampleSpeed=()=>{
      const time=host.performance.now();
      samples.push({time,received:bytes.receivedBytes});
      state.speed=downloadSpeed(samples,bytes.receivedBytes,time);paintUpdate(state);
    };
    const progress=(phase,detail)=>{
      if(disposed||updateActivity.get(id)!==state||state.phase==='complete'||phase==='complete'||!Object.hasOwn(updateLabels,phase))return;
      const percent=phase==='downloading'?downloadPercent(detail):null;
      if(percent===null||bytes&&(bytes.totalBytes!==detail.totalBytes||bytes.receivedBytes>detail.receivedBytes))stopSpeed();
      state.phase=phase;state.percent=percent;state.speed=null;
      if(percent!==null){
        bytes=detail;
        if(state.timer===null)state.timer=host.setInterval(sampleSpeed,500);
        sampleSpeed();
      }else paintUpdate(state);
    };
    await operate(async()=>{
      try{
        const result=await packages.update(id,candidate,{onProgress:progress});
        if(disposed)return result;
        if(result?.ok&&result.action==='updated'&&result.persistence==='confirmed'){
          candidates.delete(id);state.phase='complete';state.percent=null;state.speed=null;state.since=host.performance.now();
          paintUpdate(state);
          state.expiry=host.setTimeout(()=>{
            if(updateActivity.get(id)===state){updateActivity.delete(id);void renderInstalled();}
          },2200);
        }else updateActivity.delete(id);
        return result;
      }catch(error){updateActivity.delete(id);throw error;}
      finally{stopSpeed();}
    });
  }
  function paintUpdateCheck(state) {
    const {button,result}=state;
    button.dataset.updateCheck=result?'result':'checking';
    button.setAttribute('aria-disabled','true');
    if(result){
      button.removeAttribute('aria-busy');
      const mark=el('span','✓');mark.setAttribute('aria-hidden','true');
      button.replaceChildren(mark,el('span',result));
    }else{
      button.setAttribute('aria-busy','true');
      button.textContent='检查中…';
    }
  }
  function finishUpdateCheck(id,state,result) {
    state.result=result;paintUpdateCheck(state);
    let announcement='';
    if(state.button.isConnected){
      const name=state.button.closest('.mm-catalog-row').querySelector('.mm-catalog-row-name strong').textContent;
      announcement=name+' · '+result;checkAnnouncement.textContent=announcement;
    }
    state.timer=host.setTimeout(()=>{
      if(updateChecks.get(id)!==state)return;
      updateChecks.delete(id);
      const {button}=state;
      delete button.dataset.updateCheck;button.removeAttribute('aria-disabled');
      button.textContent='检查更新';
      if(checkAnnouncement.textContent===announcement)checkAnnouncement.textContent='';
    },2200);
  }
  function installedUpdateAction(parent,id,candidate,updateAvailable) {
    const check=updateChecks.get(id);
    const button=action(parent,updateAvailable?'更新':'检查更新',async()=>{
      if(busy||updateChecks.has(id))return;
      if(updateAvailable)return updateInstalled(id,candidate,view);
      const state={button,result:'',timer:null};
      updateChecks.set(id,state);paintUpdateCheck(state);
      checkAnnouncement.textContent='';
      try {
        const next=await packages.check(id);
        if(disposed)return;
        candidates.set(id,next);
        if(next.installable&&!next.available&&!next.reason){
          finishUpdateCheck(id,state,next.version===next.currentVersion?'已是最新':'无需更新');
          return;
        }
        report(next.reason||(next.available?'发现新版本 '+next.version+'，可点击「更新」。':'无法核验最新发行版本。'));
      }finally{if(!state.result){updateChecks.delete(id);await renderInstalled();}}
    },id+(updateAvailable?':update':':check'),busy);
    if(check){check.button=button;paintUpdateCheck(check);}
    const view=updateMeter(parent),state=updateActivity.get(id);
    if(state){state.view=view;paintUpdate(state);}
    return button;
  }
  function nativeStatusBadge(id,repo) {
    const label=el('span',undefined,'mm-native-status');
    label.dataset.nativeOwner=id||'';
    if(repo!==undefined)label.dataset.nativeRepository=repo;
    paintNativeStatus(label);
    return label;
  }
  function paintNativeStatus(label) {
    const id=label.dataset.nativeOwner,repo=label.dataset.nativeRepository;
    let local=id&&runtime.get(id);
    if(local&&repo!==undefined){
      try {if(!repo||parseExtensionRepository(local.manifest.repository).url.toLowerCase()!==repo)local=null;}
      catch{local=null;}
    }
    const enabled=local&&nativeEntries?.enabled(id);
    const state=!local?'unknown':enabled?(local.nativeWindowAvailable&&nativeEntries.mounted(id)?'on':'inactive'):
      local.nativeWindowAvailable&&nativeEntries?'off':local.enabled?'none':'unknown';
    const text={unknown:'独立悬浮球未知',none:'无悬浮球',off:'关闭独立悬浮球',on:'开启独立悬浮球',inactive:'悬浮球未显示'}[state];
    label.dataset.nativeState=state;label.textContent=text;label.title=text;
  }
  function refreshNativeStatuses() {
    for(const label of content.querySelectorAll('[data-native-owner]'))paintNativeStatus(label);
  }
  async function renderInstalled() {
    if (disposed || !visible || active !== 'installed') return;
    stopSavedCheck();stopViewRequest();
    const generation = ++serial;
    const request=new AbortController();viewRequest=request;
    let physical = [], unavailable = '';
    try {physical = packages ? await packages.listInstalled({signal:request.signal}) : [];} catch (e) {unavailable = e.message;}
    finally {if(viewRequest===request)viewRequest=undefined;}
    if (disposed || !visible || active !== 'installed' || generation !== serial) return;
    const currentDetail=descriptionDialog?.installedId ? descriptionDialog : null;
    const focused=doc.activeElement, focusedRow=focused?.closest('[data-extension-id]')?.dataset.extensionId;
    const previousPolicy=content.querySelector('.mm-installed-policy-disclosure');
    content.replaceChildren();
    const policy='已识别的全局 Package 可以管理酒馆助手脚本条目。其他扩展的“Runtime 注销”只清理运行实例，不删除原始脚本。物理卸载会删除该脚本条目及其 data，确认后直接卸载，不生成备份；localStorage 等外部业务设置不清空。';
    const disclosure=el('details',undefined,'mm-installed-policy-disclosure'),summary=el('summary','安装与卸载说明');
    disclosure.open=previousPolicy?.open===true;
    disclosure.append(summary,el('p',policy,'mm-hub-note'));
    content.append(el('p',policy,'mm-hub-note mm-installed-policy'),disclosure);
    if(focused===previousPolicy?.firstElementChild)summary.focus({preventScroll:true});
    if (unavailable) content.append(el('p', 'Package 管理不可用：' + unavailable, 'mm-hub-note'));
    // Product presentation policy comes from the build, not specific tool IDs.
    const userManaged = id => sources.policy?.(id)?.management !== 'hub';
    const managed = new Map(physical.filter(x => userManaged(x.id)).map(x => [x.id, x])), records = new Map(runtime.list().filter(x => userManaged(x.manifest.id)).map(x => [x.manifest.id, x]));
    const ids = new Set([...managed.keys(), ...records.keys()]);
    for(const id of savedVisualStates.keys())if(!ids.has(id))savedVisualStates.delete(id);
    const rows=el('div',undefined,'mm-catalog-rows');
    if(ids.size)content.append(rows);
    let needsSavedCheck=false;
    for (const id of ids) {
      const local = records.get(id), installed = managed.get(id), manifest = local?.manifest || installed?.manifest || installed || {};
      const art = local && panelIcon?.(id);
      const identity = {
        name: manifest.name || installed?.name || id,
        author: manifest.author,
        version: installed ? installed.version || '保存版本待确认' : manifest.version,
        iconUrl: embeddedIcon(art) || safeURL(art) || manifestIcon(manifest) || manifestIcon(installed?.manifest),
        glyph: manifest.contributes?.launcher?.icon,
      };
      const enabled = installed ? installed.enabled : !!local?.enabled;
      const status = installed ? (enabled ? '物理已安装 · 脚本开关开启' : '物理已安装 · 脚本开关关闭') : (enabled ? '已启用' : '已停用');
      const candidate = candidates.get(id), updateAvailable = candidate?.available && candidate.version !== installed?.version;
      let savedPhase='';
      let pending=false;
      if (installed?.persistenceError) {
        if(!savedCheckUntil.has(id))savedCheckUntil.set(id,host.performance.now()+15000);
        const checking=host.performance.now()<savedCheckUntil.get(id);needsSavedCheck ||= checking;
        pending=installed.persistenceState==='pending' && checking;
        savedPhase=pending?'pending':'error';
      } else {
        savedCheckUntil.delete(id);
        if(savedVisualStates.has(id)&&installed?.version&&installed.persistenceError==='')savedPhase='confirmed';
      }
      const versionMismatch=installed?.version && local && installed.version !== local.manifest.version;
      if(versionMismatch||local?.error||local?.launcherError)savedPhase='error';
      function buildDetails() {
        const details=el('div',undefined,'mm-installed-details'), info=el('div',undefined,'mm-installed-info');
        const management=el('div',undefined,'mm-installed-management');
        if(manifest.description)details.append(el('h3','简介'),el('p',manifest.description,'mm-catalog-detail-description'));
        details.append(el('h3','安装信息'),info,el('h3','管理'),management);
        const facts=el('dl',undefined,'mm-catalog-facts');
        fact(facts,'安装状态',status);
        fact(facts,'扩展 ID',id);
        if(installed)fact(facts,'酒馆脚本名称',installed.name+'（更新保留原名；版本以已保存内容为准）');
        fact(facts,'Launcher',local?.launcherAvailable?'可用':'未提供或未启用');
        info.append(facts);
        if (installed) {
          info.append(el('p', installed.runtimeCompatibility === 'incompatible' ? '版本不兼容：此安装版本声明 API ' + installed.apiVersion + '，Hub Runtime 仅支持 API 2；原脚本和数据保留。'
            : installed.runtimeCompatibility === 'compatible' ? '此安装版本的 API 2 声明已核验；实际运行状态单独确认。'
            : 'API 未确认：物理身份不包含 API 版本，需核验对应版本发行包。', installed.runtimeCompatibility === 'incompatible' ? 'mm-extension-error' : 'mm-hub-note'));
          info.append(el('p', local?.enabled ? 'Runtime 可用 · 实际运行版本：' + local.manifest.version : 'Runtime 尚未运行或已停用。', 'mm-hub-note'));
        }
        for (const error of [local?.error, local?.launcherError]) if (error) info.append(el('p', error, 'mm-extension-error'));
        const latest=candidates.get(id);
        if(latest?.version)info.append(el('p','最新版本：'+latest.version+(latest.reason?' · '+latest.reason:latest.available&&latest.version!==installed?.version?' · 存在可更新版本，等待确认更新。':''),'mm-hub-note'));
        if(installed?.persistenceError&&!pending){
          info.append(el('p',installed.persistenceError,'mm-extension-error'));
          action(info,'重新检查保存',()=>{savedCheckUntil.delete(id);return renderInstalled();},id+':recheck-save');
        }
        if (versionMismatch) {
          info.append(el('p', '已保存版本：' + (installed.version || '待确认') + ' · ' + (local.enabled ? '实际运行版本：' : '已注册但未运行版本：') + local.manifest.version + '。尚未完成新版运行确认。', 'mm-extension-error'));
          if (installed.version && !installed.persistenceError && installed.version === installed.memoryVersion) {
            info.append(el('p', '如需重新加载，请先停止生成并保存编辑；刷新会中断当前任务。', 'mm-hub-note'));
            action(info, '刷新页面加载已保存版本', () => host.location.reload(), id + ':reload-page');
          }
        }
        if(local?.nativeWindowAvailable&&nativeEntries){
          const label=el('label',undefined,'mm-shortcut-toggle'),toggle=el('input'),copy=el('span',undefined,'mm-shortcut-copy');
          toggle.type='checkbox';toggle.setAttribute('role','switch');toggle.setAttribute('aria-label','显示悬浮球');toggle.dataset.shortcut=id;
          const update=()=>{toggle.checked=nativeEntries.enabled(id);toggle.setAttribute('aria-checked',String(toggle.checked));};
          update();toggle.disabled=!!(busy||local.busy||!local.enabled);
          toggle.onchange=()=>{try{nativeEntries.set(id,toggle.checked);}catch(e){report(e.message);}finally{update();refreshNativeStatuses();}};
          toggle.onkeydown=event=>{if(event.key==='Enter'&&!toggle.disabled){event.preventDefault();toggle.click();}};
          const track=el('span',undefined,'mm-switch-track');track.setAttribute('aria-hidden','true');track.append(el('span',undefined,'mm-switch-thumb'));
          copy.append(el('span','显示悬浮球'),el('small','原生窗口，保留扩展自己的操作'));
          label.append(copy,toggle,track);management.append(label);
          if(nativeEntries.error?.(id))management.append(el('p',nativeEntries.error(id)+(nativeEntries.blocked?.(id)?'。入口已撤销时不代表窗口已完成关闭；请重试释放。':'。已保留开启选择；关闭再开启可重试。'),'mm-extension-error'));
          if(nativeEntries.blocked?.(id)){const retry=el('button','重试释放窗口','mm-system-action');retry.type='button';retry.dataset.nativeReleaseRetry=id;retry.onclick=()=>nativeEntries.retry(id);management.append(retry);}
        }
        const actions = el('div', undefined, 'mm-extension-actions'); management.append(actions);
        if (local?.launcherAvailable) action(actions, '打开', async () => {const detail=descriptionDialog,result=await runtime.open(id);if(result?.ok&&descriptionDialog===detail)closeDescription();return result;}, id + ':open', local.busy);
        action(actions, enabled ? '停用' : '启用', () => operate(async () => {
          if (!installed) return enabled ? runtime.disable(id) : runtime.enable(id);
          return packages.setEnabled(id, !enabled);
        }), id + ':toggle', busy || local?.busy);
        if (installed) {
          if (packages.checkInstalledCompatibility) action(actions, '核验 API', () => operate(() => packages.checkInstalledCompatibility(id)), id + ':verify-api', busy);
          action(actions, '卸载', () => operate(async () => {await packages.uninstall(id); if (runtime.get(id)) await runtime.uninstall(id); candidates.delete(id);}), id + ':uninstall', busy);
          if(safeURL(installed.repoUrl)){
            const links=el('dl',undefined,'mm-catalog-facts mm-catalog-links');
            link(fact(links,'作者 GitHub',''),'查看仓库',installed.repoUrl);
            details.append(el('h3','项目链接'),links);
          }
        } else action(actions, 'Runtime 注销', () => operate(() => runtime.uninstall(id)), id + ':uninstall', busy || local?.busy);
        return details;
      }
      const rowStatus=savedPhase==='error'?'状态异常':installed?.runtimeCompatibility==='incompatible'?'版本不兼容':
        savedPhase==='pending'?'保存待确认':updateAvailable?'可更新':enabled?'已启用':'已停用';
      const badge=()=> {
        const node=el('span',rowStatus,'mm-identity-badge mm-installed-badge');
        node.dataset.status=rowStatus;node.title=status;return node;
      };
      const openDetails=opener=>{
        const text=el('div',undefined,'mm-description-full');text.append(buildDetails());
        showDetail(detailHeader(identity,badge(),true),text,opener,id);
      };
      const badges=el('div',undefined,'mm-installed-badges');badges.append(badge(),nativeStatusBadge(id));
      const {row,open,actions:rowActions}=extensionRow(identity,badges,openDetails,true);
      row.dataset.extensionId=id;
      showSavedState(row,id,savedPhase);
      rows.append(row);
      const updateButton=installed?installedUpdateAction(rowActions,id,candidate,updateAvailable):null;
      if(!installed)rowActions.append(el('span','手动更新','mm-update-unmanaged'));
      if(currentDetail?.installedId===id){
        currentDetail.opener=open;
        const {dialog}=currentDetail,header=detailHeader(identity,badge(),true);
        dialog.querySelector('header').replaceWith(header);
        const details=buildDetails();
        dialog.querySelector('.mm-installed-details').replaceWith(details);
        // Polling and Runtime events keep the current dialog and its scroll container.
        const focusKey=['action','shortcut','nativeReleaseRetry'].find(key=>focused?.dataset[key]);
        if(focusKey){
          const match=[...details.querySelectorAll('button,input')].find(control=>control.dataset[focusKey]===focused.dataset[focusKey]);
          (match&&!match.disabled?match:header.querySelector('h2')).focus({preventScroll:true});
        }else if(focused?.tagName==='H2')header.querySelector('h2').focus({preventScroll:true});
        else if(focused?.tagName==='A'&&focused.closest('dialog')===dialog){
          ([...details.querySelectorAll('a')].find(link=>link.href===focused.href)||header.querySelector('h2')).focus({preventScroll:true});
        }
      }else if(focusedRow===id){
        if(focused.hasAttribute('data-pointer-return'))open.dataset.pointerReturn='';
        (focused?.dataset.action&&updateButton&&!updateButton.hidden&&!updateButton.disabled?updateButton:open).focus({preventScroll:true});
      }
    }
    for (const manifest of sources.list().filter(x => userManaged(x.id) && !records.has(x.id) && !managed.has(x.id))) action(content, '注册 ' + manifest.name, () => operate(() => sources.register(manifest.id)), manifest.id + ':register');
    if (!ids.size) content.append(el('p', '没有已注册的扩展。', 'mm-hub-note'));
    if(needsSavedCheck)savedCheckTimer=host.setTimeout(()=>{savedCheckTimer=null;void renderInstalled();},750);
    if(currentDetail&&!ids.has(currentDetail.installedId)){
      currentDetail.opener=rows.querySelector('.mm-catalog-row-open')||tabButtons.get('installed');
      closeDescription();
    }
  }
  async function previewInstall(repoURL, parent) {
    const candidate = await packages.inspect(repoURL);
    const old = parent.querySelector('[data-package-preview]'); old?.remove();
    const preview = el('div'); preview.dataset.packagePreview = '';
    preview.append(el('p', (candidate.manifest?.name || 'GitHub 项目') + (candidate.version ? ' · ' + candidate.version : ''), 'mm-hub-note'));
    if (candidate.installable) {
      preview.append(el('p', '安装将运行作者提供的代码。机器兼容性和 Hash 校验不代表 MieMie 安全审核。', 'mm-hub-note'));
      installAction(preview, () => candidate, 'package:install', candidate.manifest);
    } else {preview.append(el('p', candidate.reason || '此项目未提供可安装 Package。', 'mm-hub-note')); link(preview, '查看 GitHub', repoURL);}
    parent.append(preview);
  }
  function extensionRow({name,author,version,iconUrl,glyph},badge,onOpen,allowEmbedded=false) {
    const row=el('article',undefined,'mm-catalog-row'),open=el('button',undefined,'mm-catalog-row-open');
    open.type='button';open.setAttribute('aria-label','查看 '+name+' 的详情');open.setAttribute('aria-haspopup','dialog');
    open.onclick=()=>onOpen(open);
    open.onblur=open.onkeydown=()=>{delete open.dataset.pointerReturn;};
    row.append(open);icon(row,iconUrl,'',glyph,allowEmbedded).setAttribute('aria-hidden','true');
    const copy=el('div',undefined,'mm-catalog-row-name'),title=el('strong',name);
    const summary=el('small',undefined,'mm-catalog-row-summary');
    if(author)summary.append(el('span','作者：'+author,'mm-catalog-row-author'));
    if(version){if(author)summary.append(' · ');summary.append(el('span',version,'mm-catalog-version'));}
    copy.append(title,summary);
    const actions=el('div',undefined,'mm-catalog-row-actions');
    row.append(copy,badge,actions);
    return {row,open,actions};
  }
  function catalogBadge(item) {
    const classification=item.classification==='official'?'official':'community';
    const badge=el('span',HUB_COPY.classification[classification],'mm-identity-badge');
    badge.dataset.classification=classification;return badge;
  }
  async function renderDiscover() {
    const generation = ++serial; content.replaceChildren();
    const form = el('form', undefined, 'mm-catalog-search'), search = el('input'); search.placeholder = '搜索扩展'; search.value = query; search.setAttribute('aria-label', '搜索扩展');
    const filter = el('select'); filter.setAttribute('aria-label', '来源筛选'); for (const [v,t] of [['','全部来源'],['github','GitHub'],['discord','Discord']]) {const o = el('option',t); o.value=v; filter.append(o);} filter.value=sourceFilter;
    const submit = el('button', '搜索'); submit.type='submit'; form.append(search,filter,submit); form.onsubmit=e=>{e.preventDefault();publicCatalog=undefined;query=search.value.slice(0,100);sourceFilter=filter.value;page=1;void activate('discover');}; content.append(form);
    const direct = el('details'); direct.append(el('summary', '从作者 GitHub 查看安装兼容性'));
    const repo = el('input'); repo.type='url'; repo.placeholder='https://github.com/作者/仓库'; repo.setAttribute('aria-label','GitHub Repository URL'); direct.append(repo);
    action(direct,'预览项目',()=>previewInstall(repo.value.trim(),direct),'github:preview',!packages); content.append(direct);
    const list=el('div'); content.append(list);
    if (!registry.getBase()) {list.append(el('p','在线扩展服务暂未开放；本地已安装扩展仍可正常使用。','mm-hub-note'));return;}
    const path='/api/catalog?'+new URLSearchParams({page:String(page),pageSize:'12',q:query,source:sourceFilter});
    const identity=registry.getIdentity(), base=registry.getBase();
    if(generation!==serial)return;
    const snapshot=publicCatalog?.path===path&&publicCatalog.base===base&&publicCatalog.until>host.performance.now()?publicCatalog:null;
    function closePreviewDetail() {
      closeDescription(false);
      tabButtons.get('discover').focus({preventScroll:true});
    }
    function showRows(result,preview=false) {
      const detailRow=descriptionDialog?.opener.closest('[data-catalog-id]');
      const detailId=detailRow&&list.contains(detailRow)?detailRow.dataset.catalogId:null;
      let detailOpener;
      list.replaceChildren();
      const rows=el('div',undefined,'mm-catalog-rows');
      if(result.items.length)list.append(rows);
      for(const item of result.items) {
        const iconUrl=item.github?.manifest?.iconUrl||item.icon;
        const managed=packages&&item.sourceType==='github'&&(!item.type||item.type==='tavern_extension')&&
          (!item.distribution||item.distribution==='managed_install')&&item.github?.compatibility==='installable';
        const {row,open,actions}=extensionRow({...item,iconUrl},catalogBadge(item),opener=>openDescription(item,opener,managed));
        row.dataset.catalogId=item.id;
        if(item.id===detailId)detailOpener=open;
        if(item.type==='web_tool')link(actions,'打开网站',item.websiteUrl);
        else if(item.type==='standalone_app')link(actions,'发布页',item.sourceType==='github'?item.sourceUrl.replace(/\/$/,'')+'/releases':item.sourceUrl,'前往作者发布页');
        else if(item.sourceType==='github') {
          if(managed){
            const knownId=item.github?.manifest?.id;
            if(knownId&&runtime.get(knownId))actions.append(el('span',HUB_COPY.installed,'mm-installed-status'));
            else installAction(actions,async signal=>{
              const candidate=await packages.inspect(item.sourceUrl,{signal});
              if(!candidate.installable)throw Error(candidate.reason||'项目不再提供可安装包。');
              if(knownId&&candidate.id!==knownId)throw Error('项目的扩展身份已改变，请重新确认目录记录。');
              return candidate;
            },item.id+':install',{name:item.name,author:item.author,version:item.version,iconUrl});
          }else if(!item.type||item.type==='tavern_extension')link(actions,'GitHub',item.sourceUrl,'前往 GitHub');
          else if(item.distribution==='open_url')link(actions,'打开链接',item.sourceUrl);
          else link(actions,'发布页',item.sourceUrl.replace(/\/$/,'')+'/releases','前往作者发布页');
        }else if(item.sourceType==='discord')link(actions,'Discord',item.sourceUrl,'前往 Discord');
        rows.append(row);
      }
      if(detailId){
        if(detailOpener)descriptionDialog.opener=detailOpener;
        else closePreviewDetail();
      }
      if(preview){list.append(el('p','正在读取扩展目录…','mm-hub-note'));return;}
      if(!result.items.length)list.append(el('p','没有符合条件的上架项目。','mm-hub-note'));
      const paging=el('div',undefined,'mm-extension-actions'); if(page>1)action(paging,'上一页',()=>{page--;return activate('discover');}); if(result.hasMore)action(paging,'下一页',()=>{page++;return activate('discover');});list.append(paging);
    }
    if(snapshot&&!identity&&snapshot.anonymous){showRows(snapshot.result);return;}
    if(snapshot?.result.items.length)showRows(snapshot.result,true);
    else list.append(el('p','正在读取扩展目录…','mm-hub-note'));
    const request=new AbortController();viewRequest=request;
    try {
      const result=await registry.api(path,{authenticated:'optional',signal:request.signal});
      if(disposed||generation!==serial||active!=='discover')return;
      if(!Array.isArray(result.items))throw Error('Catalog 格式异常。');
      // Only public rows can be reused; signed-in visits always recheck Guild visibility.
      const items=result.items.filter(item=>item.visibility==='public'||!identity&&item.visibility!=='discord_guild'&&item.sourceType==='github');
      publicCatalog={path,base,anonymous:!identity,until:host.performance.now()+centerSnapshotMs,result:{items,hasMore:result.hasMore}};
      showRows(result);
    }catch(error){if(!disposed&&generation===serial){if(descriptionDialog&&list.contains(descriptionDialog.opener))closePreviewDetail();list.replaceChildren(el('p','扩展目录无法连接：'+error.message,'mm-extension-error'));}}
    finally{if(viewRequest===request)viewRequest=undefined;}
  }
  function submissionForm(item) {
    clearForm();stopViewRequest();
    const generation = ++serial;
    const form=el('form',undefined,'mm-submission-form'); form.dataset.submissionForm='';let choices=null;
    const fields={};
    for(const [name,label,multiline] of [['name','项目名称'],['author','作者'],['description','简介',true],['githubUrl','GitHub Repository URL'],['discordPostUrl','Discord 发布帖（可选）'],['discordUrl','Discord 原帖 URL'],['websiteUrl','Website URL（Web Tool 必填）'],['icon','Icon URL（可选）'],['tags','标签（逗号分隔）']]) {
      const wrap=el('label',label),input=el(multiline?'textarea':'input'); input.name=name;input.value=name==='tags'?(item?.tags||[]).join(', '):(item?.[name]||'');input.maxLength=name==='description'?2000:name==='githubUrl'||name==='discordUrl'||name==='discordPostUrl'||name==='icon'||name==='websiteUrl'?2048:120; if(['name','author','description'].includes(name))input.required=true;wrap.append(input);form.append(wrap);fields[name]=input;
    }
    const descriptionHint=el('small',undefined,'mm-description-hint');descriptionHint.id='mm-description-hint';
    fields.description.rows=6;fields.description.setAttribute('aria-describedby',descriptionHint.id);
    fields.description.after(descriptionHint);
    function updateDescriptionHint(){const length=fields.description.value.length;descriptionHint.textContent=length+' / 2000 · '+(length>=2000?'已达上限；添加换行或标点前，请先删减内容。':'支持换行、空行和【】等标点；换行与标点也计入字数。');}
    fields.description.addEventListener('input',updateDescriptionHint);updateDescriptionHint();
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
    const type=selectField('type','产品类型',Object.entries(catalogTypes),item?.type||'tavern_extension');
    const distributionWrap=el('label','分发方式'),distributionField=el('select');distributionField.name='distribution';distributionField.disabled=true;distributionField.dataset.distribution='';distributionField.setAttribute('aria-label','分发方式（自动检测）');distributionWrap.append(distributionField);form.insertBefore(distributionWrap,productAnchor.nextSibling);
    const platformWrap=el('label','平台（逗号分隔：windows, macos, linux, android, ios, web）'),platforms=el('input');platforms.name='platforms';platforms.value=(item?.platforms||[]).join(', ');platformWrap.append(platforms);form.append(platformWrap);
    function refreshProduct(){
      const distribution=productDistribution(type.value,source.value,inspectedPackage);
      const waiting=source.value==='github'&&type.value==='tavern_extension'&&!inspectedPackage;
      const option=el('option',waiting?({waiting:'由 Registry 检测后确定',pending:'正在检测…',error:'检测失败，请重试'}[inspectionState]):(catalogDistributions[distribution]||''));option.value=waiting?inspectionState:distribution;distributionField.replaceChildren(option);
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
          for(const key of ['name','author','description'])if(typeof m[key]==='string'&&fields[key].value===before[key])fields[key].value=m[key];updateDescriptionHint();if(m.iconUrl&&fields.icon.value===before.icon)fields.icon.value=m.iconUrl;
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
        clearOnlineSnapshots();
        if(disposed||generation!==serial)return;await activate('mine');report('投稿已保存。默认上架不代表官方审核或作者认证。');
      }catch(e){if(!disposed&&generation===serial)report(e.message);}finally{submitting=false;refreshSave();}
    };
    choices=createSubmissionSelects({host,form});for(const select of [source,type,visibility])choices.add(select);
    backForm=()=>choices.back();
    clearForm=()=>{++previewSerial;if(autoTimer!==null)host.clearTimeout(autoTimer);autoTimer=null;choices.dispose();backForm=()=>false;clearForm=()=>{};};
    content.replaceChildren(form);
  }
  async function renderMine() {
    const generation=++serial;content.replaceChildren();
    const identity=registry.getIdentity();if(generation!==serial)return;
    if(!identity){content.append(el('p','使用右上角 Discord 登录入口后，即可提交和管理你的扩展。','mm-hub-note'));return;}
    if(identity.canSubmit!==false)action(content,'提交扩展',()=>submissionForm()).classList.add('mm-mine-submit');
    else content.append(el('p','此 Discord 身份的投稿权限已暂停。','mm-hub-note'));
    function showSubmissions(result) {
      for(const item of result.items){
        const card=el('article',undefined,'mm-extension-card'),heading=el('div',undefined,'mm-mine-heading');
        let repo='';
        if(item.sourceType==='github'&&item.extensionId){
          try {repo=parseExtensionRepository(item.sourceUrl).url.toLowerCase();}catch{}
        }
        heading.append(el('strong',item.name),nativeStatusBadge(item.extensionId,repo));
        card.append(heading,el('p','作者：'+item.author+' · 投稿状态：'+item.status+' · 管理状态：'+(item.moderation||'visible'),'mm-hub-note'));
        const actions=el('div',undefined,'mm-extension-actions');
        card.append(el('p',(item.sourceType==='discord'?'Discord':'GitHub')+' · '+(item.visibility==='discord_guild'?'仅该 Discord 服务器成员可见':'所有人可见'),'mm-hub-note'));
        if(identity.canSubmit!==false)action(actions,'编辑',()=>submissionForm(item),item.id+':edit');
        if(identity.canSubmit!==false&&(!item.moderation||item.moderation==='visible'))action(actions,item.status==='listed'?'下架':'重新上架',async()=>{await registry.api('/api/submissions/'+encodeURIComponent(item.id)+'/status',{method:'POST',authenticated:true,body:{status:item.status==='listed'?'unlisted':'listed'}});clearOnlineSnapshots();await activate('mine');},item.id+':status');
        card.append(actions);content.append(card);
      }
      if(!result.items.length)content.append(el('p','你还没有投稿。','mm-hub-note'));
    }
    const base=registry.getBase();
    if(ownSubmissions?.identity===identity&&ownSubmissions.base===base&&ownSubmissions.until>host.performance.now()){
      showSubmissions(ownSubmissions.result);return;
    }
    const request=new AbortController();viewRequest=request;
    try {
      const result=await registry.api('/api/submissions',{authenticated:true,signal:request.signal});
      if(disposed||generation!==serial||active!=='mine')return;
      if(!Array.isArray(result.items))throw Error('我的投稿格式异常。');
      ownSubmissions={identity,base,until:host.performance.now()+centerSnapshotMs,result};
      showSubmissions(result);
    }catch(error){if(disposed||generation!==serial||active!=='mine')return;report('我的投稿无法读取：'+error.message);if(!registry.getIdentity())void activate('mine');}
    finally{if(viewRequest===request)viewRequest=undefined;}
  }
  function closeQRLogin(restoreFocus=true) {
    if(!qrLogin)return false;
    const {dialog,opener,controller,closeTimer}=qrLogin;qrLogin=null;
    host.clearTimeout(closeTimer);controller.abort();dialog.close();dialog.remove();
    if(restoreFocus&&opener.isConnected)opener.focus({preventScroll:true});
    return true;
  }
  function openQRLogin(opener) {
    const dialog=el('dialog',undefined,'mm-description-dialog mm-auth-qr-dialog');
    const title=el('h2','Discord 扫码登录'),content=el('div',undefined,'mm-auth-qr-content');
    const instructions=el('p','用手机相机扫码，在 Discord 官方页面点「授权」。');
    const frame=el('div',undefined,'mm-auth-qr-frame'),status=el('p',undefined,'mm-auth-qr-status');
    const footer=el('footer'),cancel=el('button','取消'),retry=el('button','重新扫码');
    const controller=new AbortController();
    title.id='mm-auth-qr-title';dialog.setAttribute('aria-labelledby',title.id);
    status.setAttribute('role','status');content.append(instructions,frame,status);
    cancel.type='button';cancel.autofocus=true;cancel.onclick=()=>closeQRLogin();
    retry.type='button';retry.hidden=true;retry.onclick=()=>{cancel.focus({preventScroll:true});void run();};
    dialog.addEventListener('cancel',event=>{event.preventDefault();closeQRLogin();});
    footer.append(cancel,retry);dialog.append(title,content,footer);
    (progressContainer||body).append(dialog);
    const attempt=qrLogin={dialog,opener,controller,closeTimer:null};
    function setState(state,message){
      dialog.dataset.qrState=state;status.textContent=message;
    }
    async function run(){
      frame.replaceChildren();retry.hidden=true;cancel.textContent='取消';
      setState('loading','正在生成二维码…');
      try {
        await registry.login({signal:controller.signal,showQR(url){
          const code=hubQRCode(0,'M');code.addData(url);code.make();
          const image=el('img',undefined,'mm-auth-qr-image');
          image.alt='Discord 登录二维码';image.src=code.createDataURL(6);
          frame.replaceChildren(image);setState('waiting','等待授权 · 完成后自动登录');
        }});
        if(qrLogin!==attempt)return;
        const mark=el('span','✓','mm-auth-qr-mark');mark.setAttribute('aria-hidden','true');frame.replaceChildren(mark);
        setState('success','Discord 已登录');
        const finish=async()=>{
          if(qrLogin!==attempt)return;
          closeQRLogin(false);
          if(!registry.subscribe)await activate();
          account.querySelector('[data-action="registry:logout"]')?.focus({preventScroll:true});
        };
        if(host.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)await finish();
        else attempt.closeTimer=host.setTimeout(()=>{void finish();},360);
      }catch(error){
        if(qrLogin!==attempt)return;
        frame.replaceChildren();setState('error',error.message||'扫码登录失败，请重试。');
        cancel.textContent='关闭';retry.hidden=false;
      }
    }
    dialog.showModal();void run();
  }
  function renderLoginButton() {
    const group=el('div',undefined,'mm-auth-login'),trigger=el('button','Discord 登录','mm-auth-trigger');
    const menu=el('div',undefined,'mm-auth-menu');
    let tabTimer;
    trigger.type='button';trigger.dataset.action='registry:login';trigger.disabled=windowLoginPending;
    trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','mm-auth-methods');
    menu.id='mm-auth-methods';menu.inert=true;menu.setAttribute('aria-hidden','true');
    const close=(restoreFocus=false)=>{
      if(trigger.getAttribute('aria-expanded')==='false')return false;
      trigger.setAttribute('aria-expanded','false');
      doc.removeEventListener('pointerdown',outside,true);host.clearTimeout(tabTimer);
      closeLoginMenu=()=>false;
      if(restoreFocus)trigger.focus({preventScroll:true});
      menu.inert=true;menu.setAttribute('aria-hidden','true');
      return true;
    };
    const outside=event=>{if(!group.contains(event.target))close();};
    // In Safari a pointer press can focus the parent panel before the option's click.
    // Handle outside presses by target and wait for Tab's default focus move separately.
    const handleTab=event=>{
      if(event.key!=='Tab')return;
      host.clearTimeout(tabTimer);
      tabTimer=host.setTimeout(()=>{if(!group.contains(doc.activeElement))close();},0);
    };
    group.addEventListener('keydown',handleTab);
    disposeLoginButton=()=>{
      close();host.clearTimeout(tabTimer);
      group.removeEventListener('keydown',handleTab);
    };
    const popup=action(menu,'授权窗口登录',async()=>{
      close(true);windowLoginPending=true;trigger.disabled=true;
      try{await registry.login();if(!registry.subscribe)await activate();}
      finally{windowLoginPending=false;const current=account.querySelector('[data-action="registry:login"]');if(current)current.disabled=false;}
    },'registry:login-window');
    const qr=action(menu,'扫码登录',()=>{close(true);openQRLogin(trigger);},'registry:login-qr');
    qr.setAttribute('aria-haspopup','dialog');
    trigger.onclick=()=>{
      if(close())return;
      menu.inert=false;menu.removeAttribute('aria-hidden');trigger.setAttribute('aria-expanded','true');closeLoginMenu=close;
      doc.addEventListener('pointerdown',outside,true);popup.focus({preventScroll:true});
    };
    group.append(trigger,menu);account.append(group);
  }
  function renderAccount() {
    if(disposed)return;
    // Reading an expired session may synchronously notify subscribers.
    const identity=registry.getIdentity();
    disposeLoginButton();disposeLoginButton=()=>{};
    account.replaceChildren(); account.dataset.authenticated=String(!!identity);
    if(!identity){renderLoginButton();return;}
    const profile=el('div',undefined,'mm-submit-profile');icon(profile,identity.profile?.avatarUrl);
    const copy=el('div',undefined,'mm-account-copy');copy.append(el('strong',identity.profile?.displayName||'Discord'));
    const status=el('span',identity.banned===true?HUB_COPY.account.restricted:identity.isAdmin===true?HUB_COPY.account.admin:HUB_COPY.account.regular);status.dataset.accountStatus='';copy.append(status);profile.append(copy);account.append(profile);
    action(account,'退出',async()=>{await registry.logout();renderAccount();if(!registry.subscribe)await activate();},'registry:logout');
  }
  async function activate(tab=active) {
    if(disposed)return;
    const enteringInstalled=tab==='installed'&&(!visible||active!==tab);
    closeLoginMenu();closeDescription(false);visible=true;stopViewRequest();stopSavedCheck();clearForm();active=tab;
    if(!installationPhase)report('');
    const generation=serial;
    if(registry.subscribe)registry.getIdentity();else renderAccount();
    if(generation!==serial)return; // Expiry notification can activate the tab synchronously.
    for(const[id,b]of tabButtons){b.setAttribute('aria-selected',String(id===active));if(id===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
    // A check or save result must not move the row while its animation is running.
    if(active==='installed'){
      main.append(notice);
      if(enteringInstalled)content.replaceChildren(el('p','正在读取已安装扩展…','mm-hub-note'));
    }else main.prepend(notice);
    try{if(active==='installed')await renderInstalled();else if(active==='mine')await renderMine();else await renderDiscover();}catch(e){report(e.message);}
  }
  renderAccount();
  return {activate,report,leave,back(){if(disposed||!visible)return false;if(closeQRLogin()||closeLoginMenu(true))return true;if(descriptionDialog){closeDescription();return true;}return backForm();},enter(){if(!visible)void activate();},refresh(){if(active==='installed')void renderInstalled();else if(active==='mine')refreshNativeStatuses();},dispose(){leave();disposed=true;disposeLoginButton();for(const state of updateChecks.values())host.clearTimeout(state.timer);updateChecks.clear();for(const state of updateActivity.values()){host.clearInterval(state.timer);host.clearTimeout(state.expiry);}updateActivity.clear();installController?.abort();installProgress.remove();if(speedTimer!==null)host.clearInterval(speedTimer);speedTimer=null;clearForm();++serial;unsubscribe?.();registry.dispose();packages?.dispose();tabs.remove();main.remove();checkAnnouncement.remove();account.replaceChildren();if(!accountContainer)account.remove();body.classList.remove('mm-center-layout');},getActive:()=>active};
}
