import {createShortcutLaunchers} from './shortcut-launchers.js';
import {HUB_COPY} from './ui-copy.js';
import {HUB_PRODUCT} from './product-identity.js';
import {createHoneycombLauncher} from './honeycomb-launcher.js';
import {createSurfaceController} from './surface-controller.js';
export function createHubUI(host, shell, assets, runtime, localSources, hubVersion, selfUpdater, ecosystemOptions) {
  const doc = host.document, orb = shell.orb, icons = assets.icons;
  const extensionPanels = new Map(), messages = new Map();
  const root = doc.createElement('div'); root.id = 'meeme-combined-menu';
  const style = doc.createElement('style'); style.textContent = assets.menuStyles + '\n' + assets.hubStyles;
  root.appendChild(style); shell.root.appendChild(root);
  const launcher = createHoneycombLauncher({host, root, shell, title: HUB_PRODUCT.name + ' 应用'});
  let disposed = false, lastError = '';
  let surface;
  const shortcuts=createShortcutLaunchers({host,runtime,launch:(id,open,origin)=>surface.launch(id,open,origin),onChange:()=>ecosystem.refresh(),onError:error=>ecosystem.report(error)});
  let menuButtons = [];
  function makePanel(title, subtitle) {
    const panel = doc.createElement('section'); panel.className = 'mm-hub-panel'; panel.hidden = true; panel.inert = true; panel.tabIndex = -1;
    panel.setAttribute('aria-label', title);
    const header = doc.createElement('header'); header.className = 'mm-hub-header';
    const img = doc.createElement('img'); img.src = icons.home; img.alt = '';
    const text = doc.createElement('div'), heading = doc.createElement('strong'), sub = doc.createElement('small');
    heading.textContent = title; sub.textContent = subtitle; text.append(heading, sub); header.append(img, text);
    const body = doc.createElement('div'); body.className = 'mm-hub-body';
    panel.append(header, body); shell.root.appendChild(panel); returnButton(panel);
    return {panel, body, heading, header};
  }
  const message = makePanel('扩展消息', HUB_PRODUCT.englishName + ' Extension');
  // Core panels have no Extension registration, Manifest or lifecycle.
  const center = makePanel(HUB_PRODUCT.name + ' · '+HUB_COPY.extensionCenter, '发现更多工具');
  const manager = {panel: center.panel, body: center.body};
  const settings = makePanel(HUB_PRODUCT.name + ' · '+HUB_COPY.settings, 'Hub 版本与更新');
  message.panel.dataset.hubPanel = 'message';
  center.panel.dataset.hubPanel = 'extension-center'; settings.panel.dataset.hubPanel = 'settings';
  const panels = new Set([manager.panel, message.panel, center.panel, settings.panel]);

  const account = doc.createElement('div'); account.className = 'mm-header-account'; center.header.append(account);
  const ecosystem = createExtensionCenter({host, body: center.body, accountContainer: account, runtime, shortcuts, sources: localSources, ...ecosystemOptions, refreshLaunchers: renderMenu});

  const versionCard = doc.createElement('div'); versionCard.className = 'mm-system-card';
  const versionTitle = doc.createElement('h2'); versionTitle.textContent = 'Hub 版本';
  const updateTestNote = doc.createElement('p'); updateTestNote.className = 'mm-hub-note';
  updateTestNote.dataset.hubUpdateTest = ''; updateTestNote.textContent = '自动更新功能测试版本';
  const versionDetails = doc.createElement('dl'); versionDetails.className = 'mm-setting-list';
  function settingRow(label) {
    const row = doc.createElement('div'), term = doc.createElement('dt'), value = doc.createElement('dd');
    term.textContent = label; row.append(term, value); versionDetails.appendChild(row); return value;
  }
  const currentVersion = settingRow('当前版本'); currentVersion.dataset.hubVersion = ''; currentVersion.textContent = hubVersion;
  const latestVersion = settingRow('最新版本'); latestVersion.dataset.hubLatestVersion = '';
  const updateStatus = settingRow('更新状态'); updateStatus.setAttribute('role', 'status'); updateStatus.setAttribute('aria-live', 'polite');
  const updateError = doc.createElement('p'); updateError.className = 'mm-hub-note'; updateError.dataset.hubUpdateError = '';
  const updateLabels = {unchecked: '尚未检查', checking: '正在检查…', current: '✓ 已是最新版',
    available: '● 发现新版本', ahead: '当前版本高于已发布版本', failed: '检查更新失败'};
  const installationLabels = {preparing: '正在准备更新…', downloading: '正在下载…', verifying: '正在校验…',
    installing: '正在安装…', 'awaiting-reload': '等待新版确认…', confirming: '新版已加载，正在确认保存…',
    completed: '✓ 更新完成，已确认保存', unconfirmed: '更新保存状态待确认', failed: '更新失败'};
  let updateState = {status: 'unchecked', latestVersion: null, error: ''};
  let installation = {status: 'idle', error: ''}, showInstallation = false;
  function renderUpdateState(next) {updateState = next; renderUpdatePanel();}
  function renderUpdatePanel() {
    if (disposed) return;
    const installing = showInstallation && installation.status !== 'idle';
    const displayed = installing ? installation : updateState;
    updateStatus.dataset.hubUpdateStatus = displayed.status;
    updateStatus.textContent = (installing ? installationLabels : updateLabels)[displayed.status] || '更新状态待确认';
    latestVersion.textContent = updateState.latestVersion || installation.targetVersion || '';
    latestVersion.parentElement.hidden = !latestVersion.textContent;
    updateError.textContent = displayed.error || ''; updateError.hidden = !displayed.error;
    const busy = !!selfUpdater?.isBusy();
    checkUpdateButton.disabled = updateState.status === 'checking' || busy;
    installButton.hidden = updateState.status !== 'available';
    installButton.disabled = busy || updateState.status === 'checking' || installation.status === 'unconfirmed';
    confirmButton.hidden = installation.status !== 'unconfirmed';
    confirmButton.disabled = busy;
    backupNote.hidden = !installation.backupRequested;
    versionCard.setAttribute('aria-busy', String(checkUpdateButton.disabled));
  }
  function checkHubUpdate() {
    if (disposed || selfUpdater?.isBusy()) return;
    showInstallation = false;
    void updateChecker.check();
  }
  const checkUpdateButton = doc.createElement('button'); checkUpdateButton.type = 'button'; checkUpdateButton.className = 'mm-system-action';
  checkUpdateButton.dataset.hubAction = 'check-updates'; checkUpdateButton.textContent = '检查更新'; checkUpdateButton.onclick = checkHubUpdate;
  // Use the helper iframe's fetch, keeping this request separate from host / Extension hooks.
  const updateChecker = createHubUpdateChecker({currentVersion: hubVersion, onChange: renderUpdateState});
  const installButton = doc.createElement('button'); installButton.type = 'button'; installButton.className = 'mm-system-action';
  installButton.dataset.hubAction = 'update'; installButton.textContent = '更新';
  installButton.onclick = () => {if (!disposed && updateState.status === 'available') void selfUpdater?.start(updateState.targetRelease);};
  const confirmButton = doc.createElement('button'); confirmButton.type = 'button'; confirmButton.className = 'mm-system-action';
  confirmButton.dataset.hubAction = 'confirm-update'; confirmButton.textContent = '重新确认保存';
  confirmButton.onclick = () => {if (!disposed) void selfUpdater?.resume();};
  const actions = doc.createElement('div'); actions.className = 'mm-system-actions'; actions.append(checkUpdateButton, installButton, confirmButton);
  const updateNote = doc.createElement('p'); updateNote.className = 'mm-hub-note';
  updateNote.textContent = '自动更新仅支持全局脚本。更新会重新加载 Hub 并中断扩展任务，请先停止生成并保存编辑。下载或校验失败时不会安装。';
  const backupNote = doc.createElement('p'); backupNote.className = 'mm-hub-note'; backupNote.dataset.hubBackupNote = '';
  backupNote.textContent = '已请求浏览器下载旧 Hub 恢复文件，请确认文件已保存。若新版无法启动，可在酒馆助手中恢复原条目的 content。';
  versionCard.append(versionTitle, updateTestNote, versionDetails, updateError, actions, updateNote, backupNote); settings.body.appendChild(versionCard);
  const unsubscribeUpdate = selfUpdater?.subscribe(next => {installation = next; showInstallation = next.status !== 'idle'; renderUpdatePanel();});
  renderUpdateState(updateChecker.getState());

  function place() {
    if (disposed) return;
    const v = host.visualViewport;
    const w = v?.width || host.innerWidth, h = v?.height || host.innerHeight, ox = v?.offsetLeft || 0, oy = v?.offsetTop || 0;
    const theme = host.getComputedStyle(shell.root), safe = edge => parseFloat(theme.getPropertyValue('--mie-safe-' + edge)) || 0;
    const top = Math.max(16,safe('top')), bottom = Math.max(16,safe('bottom')), left = Math.max(12,safe('left')), right = Math.max(12,safe('right'));
    for (const p of panels) {
      if(surface?.placeNative(p))continue;
      const pw = Math.max(1, Math.min(p === center.panel ? 920 : 600, w - left - right)), ph = Math.max(1, Math.min(780, h - top - bottom));
      const anchor=surface?.floatingAnchor(p),clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
      const x=anchor?clamp(anchor.left+anchor.width/2>ox+w/2?anchor.left-pw-12:anchor.left+anchor.width+12,ox+left,ox+w-right-pw):ox+left+(w-left-right-pw)/2;
      const y=anchor?clamp(anchor.top+anchor.height/2-ph/2,oy+top,oy+h-bottom-ph):oy+top+(h-top-bottom-ph)/2;
      for (const [key,value] of Object.entries({position:'fixed',left:x+'px',top:y+'px',right:'auto',bottom:'auto',width:pw+'px',height:ph+'px',maxHeight:ph+'px'})) p.style.setProperty(key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase()),value,'important');
    }
    launcher.resize();
  }
  function updateOrbState() {
    orb.setAttribute('aria-expanded', String(surface.state !== 'closed'));
    orb.setAttribute('aria-label', (surface.state === 'closed' ? '展开' : '关闭') + HUB_PRODUCT.name + '菜单');
  }
  function renderMessage(id){
    const entry=messages.get(id);if(!entry)return;
    message.heading.textContent=entry.title;message.panel.setAttribute('aria-label',entry.title);
    const p=doc.createElement('p');p.className='mm-extension-message-text';p.textContent=entry.text;message.body.replaceChildren(p);
  }
  const systemSurfaces={
    'extension-center':{owner:'extension-center',panel:center.panel},
    settings:{owner:'settings',panel:settings.panel},
  };
  surface=createSurfaceController({host,shell,root,launcher,panels,place,
    resolve:key=>systemSurfaces[key]||extensionPanels.get(key)||(key.startsWith('message:')?messages.get(key.slice(8)):undefined),
    onState:updateOrbState,onError:error=>{lastError=error.message;ecosystem.report(lastError);},
  });
  function go(next){
    if(next==='extensions'){void ecosystem.activate('installed');next='extension-center';}
    else if(next==='extension-center')void ecosystem.activate();
    return surface.go(next);
  }
  const viewportKey=()=>{const v=host.visualViewport;return [v?.width||host.innerWidth,v?.height||host.innerHeight,v?.offsetLeft||0,v?.offsetTop||0].join(':');};
  let lastViewport=viewportKey();
  function resized(){
    const next=viewportKey();
    // Dock/layout notifications also arrive here; they must not finish a flight.
    if(next!==lastViewport){lastViewport=next;surface.resize();}
    place();
  }
  function returnButton(panel, old) {
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'mm-return'; b.textContent = HUB_COPY.back; b.onclick = () => go('menu');
    if (old) old.hidden = true;
    panel.appendChild(b);
  }

  function renderMenu() {
    const focused = doc.activeElement?.dataset?.hubApp;
    for (const b of menuButtons) b.remove();
    const apps = [
      {id: 'extension-center', title: HUB_COPY.extensionCenter, icon: '🧩', className: 'mm-center', open: () => go('extension-center')},
      {id: 'settings', title: HUB_COPY.settings, icon: '⚙️', className: 'mm-settings', open: () => go('settings')},
      ...runtime.list().filter(x => x.launcherAvailable).map(x => ({
        id: x.manifest.id, title: x.manifest.contributes.launcher.title, icon: x.manifest.contributes.launcher.icon || '🧩', className: 'mm-extension',
        open: async () => { const result = await runtime.open(x.manifest.id); if (result.ok) lastError = ''; else if (!result.cancelled) { lastError = result.error; await go('extensions'); } },
      })),
    ];
    menuButtons = apps.map(app => {
      const b = doc.createElement('button'); b.type = 'button'; b.className = 'mm-app ' + app.className; b.dataset.hubApp = app.id; b.setAttribute('aria-label', app.title); b.title = app.title;
      const icon = doc.createElement('span'), label = doc.createElement('small'); icon.textContent = app.icon;
      const art = extensionPanels.get('panel:' + app.id)?.icon;
      if (typeof art === 'string' && /^(?:data:image\/(?:png|webp|jpeg);base64,|https:\/\/)/.test(art)) {const img = doc.createElement('img'); img.src = art; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.onerror = () => {img.remove(); icon.textContent = app.icon;}; icon.replaceChildren(img); icon.className = 'mm-launcher-image';}
      label.textContent = app.title; b.append(icon, label);
      b.onclick = () => {
        void surface.launch(app.id,app.open).catch(error=>{lastError=error.message;void go('extensions');});
      };
      return b;
    });
    launcher.setItems(menuButtons); place();
    if (surface.state === 'menu' && focused) (menuButtons.find(b => b.dataset.hubApp === focused) || menuButtons[0])?.focus({preventScroll: true});
  }
  function key(e) {
    if (e.key === 'Tab' && surface.state === 'menu') {
      const items = [orb, ...menuButtons], index = items.indexOf(doc.activeElement);
      e.preventDefault(); items[(index + (e.shiftKey ? items.length - 1 : 1)) % items.length]?.focus({preventScroll:true});
    }
    if (e.key === 'Escape' && surface.state !== 'closed') { e.preventDefault(); e.stopImmediatePropagation(); void (surface.state === 'menu' ? go('closed') : surface.close(surface.state)); }
  }
  doc.addEventListener('keydown', key, true);
  host.visualViewport?.addEventListener('resize', resized); host.visualViewport?.addEventListener('scroll', resized);
  host.addEventListener('orientationchange',resized);
  shell.connect({onToggle: () => go(surface.state === 'closed' ? 'menu' : 'closed'), beforeMove: () => {}, onPosition: resized});
  renderMenu(); updateOrbState();
  return {
    open: () => go('menu'), toggle: () => go(surface.state === 'closed' ? 'menu' : 'closed'), back: () => surface.close(surface.state),
    registerShortcut:(id,mount)=>shortcuts.register(id,mount),
    forgetShortcut:id=>shortcuts.forget(id),
    runtimeChanged(event,preservePreference=false){if(event.kind==='uninstall'&&!preservePreference)shortcuts.forget(event.extension.manifest.id);shortcuts.sync();this.refresh();},
    refresh() { if (!disposed) { renderMenu(); ecosystem.refresh(); } },
    showMessage(id, title, text) {
      if (disposed) return;
      const entry=messages.get(id);
      if(entry){entry.title=title;entry.text=text;}
      else messages.set(id,{owner:id,panel:message.panel,title,text,prepare:()=>renderMessage(id)});
      return go('message:'+id);
    },
    closeMessage(id) {
      const visible=surface.state==='message:'+id;surface.revoke(id);messages.delete(id);
      if(visible)message.body.replaceChildren();
    },
    attachPanel(id, title, panel, presentation) {
      if (disposed || !panel || panel.nodeType !== 1 || panel.ownerDocument !== doc || !panel.isConnected) throw Error('请先创建并挂载扩展面板。');
      const key = 'panel:' + id;
      if (extensionPanels.has(key)) throw Error('扩展面板已经挂载。');
      const icon = presentation.icon;
      panel.hidden = true; panel.inert = true;
      extensionPanels.set(key, {panel, icon, owner:id}); panels.add(panel);

      place();
      return () => {
        surface.revoke(id);
        panels.delete(panel); extensionPanels.delete(key);
        panel.hidden = true; panel.inert = true;panel.dataset.surfaceState='closed';
      };
    },
    showPanel(id) {return surface.go('panel:'+id);},
    closePanel(id) {return surface.close('panel:'+id);},
    report(error) { lastError = error; ecosystem.report(error); },
    dispose() {
      if (disposed) return;
      disposed = true; surface.dispose();shortcuts.dispose();messages.clear(); doc.removeEventListener('keydown', key, true);
      updateChecker.dispose();
      unsubscribeUpdate?.(); selfUpdater?.dispose(); ecosystem.dispose(); launcher.dispose();
      host.visualViewport?.removeEventListener('resize', resized); host.visualViewport?.removeEventListener('scroll', resized);
      host.removeEventListener('orientationchange',resized);
      checkUpdateButton.onclick = null;
      installButton.onclick = null; confirmButton.onclick = null;
      root.remove(); manager.panel.remove(); message.panel.remove(); center.panel.remove(); settings.panel.remove();
    },
  };
}
