export function createHubUI(host, shell, assets, runtime, localSources, hubVersion) {
  const doc = host.document, orb = shell.orb, icons = assets.icons;
  const timeline = host.__timelineSwitcherV1;
  const tp = timeline.root.querySelector('.ts-panel');
  tp.querySelector('[data-tool-icon]').src = icons.timeline;
  const extensionPanels = new Map();
  const root = doc.createElement('div'); root.id = 'meeme-combined-menu';
  const style = doc.createElement('style'); style.textContent = assets.menuStyles + '\n' + assets.hubStyles;
  root.appendChild(style); root.insertAdjacentHTML('beforeend', assets.effectsHTML);
  doc.documentElement.appendChild(root);
  let state = 'closed', disposed = false, serial = 0, activeExtension = null, lastError = '';
  let menuButtons = [];
  const animations = new Set(), splashes = new Map();
  function addSplash(p) {
    const splash = doc.createElement('div'); splash.className = 'mm-splash'; splash.hidden = true;
    splash.setAttribute('aria-hidden', 'true'); splash.innerHTML = '<div class="mm-splash-backdrop"></div><img alt="">';
    p.appendChild(splash); splashes.set(p, splash);
  }
  addSplash(tp);
  function makePanel(title, subtitle) {
    const panel = doc.createElement('section'); panel.className = 'mm-hub-panel'; panel.hidden = true; panel.inert = true; panel.tabIndex = -1;
    panel.setAttribute('aria-label', title);
    const header = doc.createElement('header'); header.className = 'mm-hub-header';
    const img = doc.createElement('img'); img.src = icons.home; img.alt = '';
    const text = doc.createElement('div'), heading = doc.createElement('strong'), sub = doc.createElement('small');
    heading.textContent = title; sub.textContent = subtitle; text.append(heading, sub); header.append(img, text);
    const body = doc.createElement('div'); body.className = 'mm-hub-body';
    panel.append(header, body); shell.root.appendChild(panel); returnButton(panel);
    return {panel, body, heading};
  }
  const manager = makePanel('已安装扩展', '咩咩Hub · 本地扩展测试');
  const message = makePanel('Hello Mie', '咩咩Hub Extension');
  // Core panels have no Extension registration, Manifest or lifecycle.
  const center = makePanel('咩咩Hub · 扩展中心', '发现更多咩咩工具');
  const settings = makePanel('咩咩Hub · 设置', 'Hub 版本与更新');
  manager.panel.dataset.hubPanel = 'extensions'; message.panel.dataset.hubPanel = 'message';
  center.panel.dataset.hubPanel = 'extension-center'; settings.panel.dataset.hubPanel = 'settings';
  const panels = new Set([tp, manager.panel, message.panel, center.panel, settings.panel]);
  function panelFor(next) {
    if (next === 'extension-center') return center.panel;
    if (next === 'settings') return settings.panel;
    return next === 'timeline' ? tp : next === 'extensions' ? manager.panel : next === 'extension' ? message.panel : extensionPanels.get(next)?.panel;
  }

  const centerCard = doc.createElement('div'); centerCard.className = 'mm-system-card';
  const centerTitle = doc.createElement('h2'); centerTitle.textContent = '扩展中心正在准备中';
  const centerNote = doc.createElement('p'); centerNote.className = 'mm-hub-note'; centerNote.textContent = '以后可以在这里发现、安装和更新扩展。';
  centerCard.append(centerTitle, centerNote); center.body.appendChild(centerCard);

  const versionCard = doc.createElement('div'); versionCard.className = 'mm-system-card';
  const versionTitle = doc.createElement('h2'); versionTitle.textContent = 'Hub 版本';
  const versionDetails = doc.createElement('dl'); versionDetails.className = 'mm-setting-list';
  function settingRow(label) {
    const row = doc.createElement('div'), term = doc.createElement('dt'), value = doc.createElement('dd');
    term.textContent = label; row.append(term, value); versionDetails.appendChild(row); return value;
  }
  const currentVersion = settingRow('当前版本'); currentVersion.dataset.hubVersion = ''; currentVersion.textContent = hubVersion;
  const updateStatus = settingRow('更新状态'); updateStatus.setAttribute('role', 'status'); updateStatus.setAttribute('aria-live', 'polite');
  // Keep update state separate from presentation; this phase has no network service.
  const updateState = {status: 'unchecked'};
  const updateLabels = {unchecked: '尚未检查', unavailable: '在线更新服务尚未接入'};
  function renderUpdateState() {
    updateStatus.dataset.hubUpdateStatus = updateState.status;
    updateStatus.textContent = updateLabels[updateState.status];
  }
  function checkHubUpdate() {
    if (disposed) return;
    updateState.status = 'unavailable'; renderUpdateState();
  }
  const checkUpdateButton = doc.createElement('button'); checkUpdateButton.type = 'button'; checkUpdateButton.className = 'mm-system-action';
  checkUpdateButton.dataset.hubAction = 'check-updates'; checkUpdateButton.textContent = '检查更新'; checkUpdateButton.onclick = checkHubUpdate;
  versionCard.append(versionTitle, versionDetails, checkUpdateButton); settings.body.appendChild(versionCard);
  renderUpdateState();

  function place() {
    if (disposed) return;
    const r = orb.getBoundingClientRect(), v = host.visualViewport;
    const w = v?.width || host.innerWidth, h = v?.height || host.innerHeight, ox = v?.offsetLeft || 0, oy = v?.offsetTop || 0;
    const left = r.left + r.width / 2 < ox + w / 2, dir = left ? 1 : -1;
    const available = left ? ox + w - (r.left + r.width / 2) : r.left + r.width / 2 - ox;
    const columns = menuButtons.length > 2 && available >= 198 ? 2 : 1;
    const rows = Math.ceil(menuButtons.length / columns);
    const step = rows > 1 ? Math.min(84, Math.max(48, (h - 84) / (rows - 1))) : 0;
    const half = (rows - 1) * step / 2;
    const cy = Math.max(oy + 30 + half, Math.min(oy + h - 52 - half, r.top + r.height / 2));
    menuButtons.forEach((b, i) => {
      const col = Math.floor(i / rows), row = i % rows;
      const targetX = Math.max(ox + 38, Math.min(ox + w - 38, r.left + r.width / 2 + dir * (78 + col * 88)));
      b.style.left = r.left + r.width / 2 - 22 + 'px'; b.style.top = r.top + r.height / 2 - 22 + 'px';
      b.style.setProperty('--mm-x', targetX - r.left - r.width / 2 + 'px');
      b.style.setProperty('--mm-y', cy + row * step - half - r.top - r.height / 2 + 'px');
    });
    const pw = Math.max(1, Math.min(520, w - 20)), space = left ? ox + w - r.right - 22 : r.left - ox - 22;
    let x, y, ph;
    if (space >= pw) { x = left ? r.right + 12 : r.left - pw - 12; ph = Math.min(740, h - 20); y = Math.max(oy + 10, Math.min(oy + h - ph - 10, r.top + r.height / 2 - ph / 2)); }
    else {
      x = ox + (w - pw) / 2;
      const above = r.top - oy - 16, below = oy + h - r.bottom - 16;
      ph = Math.min(h - 20, Math.max(100, Math.min(740, Math.max(above, below))));
      y = above >= below ? Math.max(oy + 10, r.top - ph - 12) : Math.min(oy + h - ph - 10, r.bottom + 12);
    }
    for (const p of panels) for (const [key, value] of Object.entries({position: 'fixed', left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto', width: pw + 'px', maxHeight: ph + 'px', height: ph + 'px'})) p.style.setProperty(key.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), value, 'important');
  }
  function menuVisible(on) {
    root.dataset.open = String(on); root.inert = !on;
    orb.classList.toggle('mm-jelly-open', on);
    orb.setAttribute('aria-expanded', String(state !== 'closed'));
    orb.setAttribute('aria-label', state === 'closed' ? '展开咩咩Hub菜单' : '关闭咩咩Hub菜单');
  }
  function hideWindows() {
    timeline.close();
    for (const p of panels) { p.hidden = true; p.inert = true; }
  }
  /* LEGACY_ANIMATIONS */

  async function change(next) {
    if (disposed) return;
    const id = ++serial, previous = state; state = next;
    cancelAnimations(); menuVisible(false); orb.classList.toggle('mm-tool-active', next !== 'closed');
    const p = panelFor(next);
    if (p) {
      hideWindows();
      if (next === 'timeline') timeline.open();
      if (next === 'extensions') renderManager();
      p.hidden = false; p.inert = false; p.style.opacity = '1'; p.style.transform = 'none'; place(); p.scrollTop = 0;
      const art = next === 'timeline' ? icons.timeline : extensionPanels.get(next)?.icon;
      const splash = art ? prepareSplash(p, art) : null;
      await animate(p, [collapsed(p), {transform: 'none', opacity: 1}], 440, 'cubic-bezier(.16,1,.3,1)');
      if (id !== serial || disposed) return;
      if (splash) await landSplash(p, splash, id);
      if (id !== serial || disposed) return;
      if (p.tabIndex === -1) p.focus({preventScroll: true});
    } else {
      const old = panelFor(previous);
      if (old && !old.hidden) { old.inert = true; await animate(old, [{transform: 'none', opacity: 1}, collapsed(old)], 340, 'cubic-bezier(.55,0,.85,.35)'); }
      if (id !== serial || disposed) return;
      hideWindows(); place(); menuVisible(next === 'menu');
      if (next === 'menu') menuButtons[0]?.focus({preventScroll: true}); else orb.focus({preventScroll: true});
    }
  }
  function go(next) {
    return change(next).catch(error => {
      lastError = error.message; state = 'extensions'; cancelAnimations(); hideWindows(); renderManager();
      manager.panel.hidden = false; manager.panel.inert = false; place(); menuVisible(false);
    });
  }
  function returnButton(panel, old) {
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'mm-return'; b.textContent = '返回'; b.onclick = () => go('menu');
    if (old) old.hidden = true;
    panel.appendChild(b);
  }
  returnButton(tp, timeline.root.querySelector('[data-close]'));

  function renderMenu() {
    const focused = doc.activeElement?.dataset?.hubApp;
    for (const b of menuButtons) b.remove();
    const apps = [
      {id: 'timeline', title: '时间线切换器', icon: '🕒', className: 'mm-time', open: () => go('timeline')},
      {id: 'extension-center', title: '扩展中心', icon: '🧩', className: 'mm-center', open: () => go('extension-center')},
      {id: 'settings', title: '设置', icon: '⚙️', className: 'mm-settings', open: () => go('settings')},
      {id: 'extensions', title: '扩展管理', icon: '🧩', className: 'mm-manage', open: () => go('extensions')},
      ...runtime.list().filter(x => x.launcherAvailable).map(x => ({
        id: x.manifest.id, title: x.manifest.contributes.launcher.title, icon: x.manifest.contributes.launcher.icon || '🧩', className: 'mm-extension',
        open: async () => { const result = await runtime.open(x.manifest.id); if (result.ok) lastError = ''; else if (!result.cancelled) { lastError = result.error; await go('extensions'); } },
      })),
    ];
    menuButtons = apps.map(app => {
      const b = doc.createElement('button'); b.type = 'button'; b.className = 'mm-small ' + app.className; b.dataset.hubApp = app.id; b.setAttribute('aria-label', app.title);
      const icon = doc.createElement('span'), label = doc.createElement('small'); icon.textContent = app.icon; label.textContent = app.title; b.append(icon, label);
      b.onclick = () => { void Promise.resolve().then(app.open).catch(error => { lastError = error.message; void go('extensions'); }); };
      root.appendChild(b); return b;
    });
    place();
    if (state === 'menu' && focused) (menuButtons.find(b => b.dataset.hubApp === focused) || menuButtons[0])?.focus({preventScroll: true});
  }
  function renderManager() {
    const focused = manager.body.contains(doc.activeElement) ? doc.activeElement.dataset.action : null;
    manager.body.replaceChildren();
    const note = doc.createElement('p'); note.className = 'mm-hub-note'; note.textContent = '可停用、卸载和重新注册当前已载入的扩展。卸载保留工具设置与备份。'; manager.body.appendChild(note);
    if (lastError) { const error = doc.createElement('p'); error.className = 'mm-extension-error'; error.setAttribute('role', 'status'); error.textContent = lastError; manager.body.appendChild(error); }
    const labels = {disabled: '已停用', enabled: '已启用', enabling: '启用中', disabling: '停用中', uninstalling: '卸载中', error: '运行出错'};
    function button(parent, label, action, key, disabled = false) {
      const b = doc.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.action = key; b.disabled = disabled;
      b.onclick = async () => {
        b.disabled = true; lastError = '';
        try { const result = await action(); if (result && !result.ok && !result.cancelled) lastError = result.error; }
        catch (error) { lastError = error.message; }
        if (!disposed) { renderManager(); renderMenu(); }
      };
      parent.appendChild(b);
    }
    for (const item of runtime.list()) {
      const card = doc.createElement('article'); card.className = 'mm-extension-card'; card.dataset.extensionId = item.manifest.id;
      const title = doc.createElement('div'); title.className = 'mm-extension-title';
      const name = doc.createElement('strong'), status = doc.createElement('small'); name.textContent = item.manifest.name;
      status.textContent = item.manifest.version + ' · ' + labels[item.state]; title.append(name, status); card.appendChild(title);
      const desc = doc.createElement('p'); desc.className = 'mm-hub-note'; desc.textContent = item.manifest.description || item.manifest.id; card.appendChild(desc);
      if (item.error) { const error = doc.createElement('p'); error.className = 'mm-extension-error'; error.textContent = item.error; card.appendChild(error); }
      if (item.launcherError) { const warning = doc.createElement('p'); warning.className = 'mm-extension-error'; warning.textContent = item.launcherError; card.appendChild(warning); }
      const actions = doc.createElement('div'); actions.className = 'mm-extension-actions'; card.appendChild(actions);
      if (item.launcherAvailable) button(actions, '打开', () => runtime.open(item.manifest.id), item.manifest.id + ':open', item.busy);
      button(actions, item.enabled ? '停用' : '启用', () => item.enabled ? runtime.disable(item.manifest.id) : runtime.enable(item.manifest.id), item.manifest.id + ':toggle', item.busy);
      button(actions, '卸载', () => runtime.uninstall(item.manifest.id), item.manifest.id + ':uninstall', item.busy);
      manager.body.appendChild(card);
    }
    for (const manifest of localSources.list().filter(m => !runtime.get(m.id))) {
      const actions = doc.createElement('div'); actions.className = 'mm-extension-actions';
      button(actions, '注册 ' + manifest.name, () => localSources.register(manifest.id), manifest.id + ':register'); manager.body.appendChild(actions);
    }
    if (state === 'extensions' && focused) [...manager.body.querySelectorAll('button')].find(b => b.dataset.action === focused && !b.disabled)?.focus({preventScroll: true});
  }
  function key(e) {
    if (e.key === 'Escape' && state !== 'closed') { e.preventDefault(); e.stopImmediatePropagation(); void go(state === 'menu' ? 'closed' : 'menu'); }
  }
  doc.addEventListener('keydown', key, true);
  host.visualViewport?.addEventListener('resize', place); host.visualViewport?.addEventListener('scroll', place);
  shell.connect({onToggle: () => go(state === 'closed' ? 'menu' : 'closed'), beforeMove: () => timeline.closePicker(), onPosition: place});
  renderMenu(); menuVisible(false);
  return {
    open: () => go('menu'), toggle: () => go(state === 'closed' ? 'menu' : 'closed'), back: () => go('menu'),
    refresh() { if (!disposed) { renderMenu(); if (state === 'extensions') renderManager(); } },
    showMessage(id, title, text) {
      if (disposed) return;
      activeExtension = id; message.heading.textContent = title; message.panel.setAttribute('aria-label', title);
      message.body.replaceChildren(); const p = doc.createElement('p'); p.className = 'mm-hello-text'; p.textContent = text; message.body.appendChild(p);
      void go('extension');
    },
    closeMessage(id) {
      const key = 'panel:' + id;
      if (state === key) void go('extensions');
      if (activeExtension !== id) return;
      activeExtension = null; message.body.replaceChildren();
      if (state === 'extension') void go('extensions');
    },
    attachPanel(id, title, panel, presentation) {
      if (disposed || !panel || panel.nodeType !== 1 || panel.ownerDocument !== doc || !panel.isConnected) throw Error('请先创建并挂载扩展面板。');
      const key = 'panel:' + id;
      if (extensionPanels.has(key)) throw Error('扩展面板已经挂载。');
      const icon = presentation.icon;
      panel.hidden = true; panel.inert = true;
      extensionPanels.set(key, {panel, icon}); panels.add(panel);
      if (icon) addSplash(panel);
      place();
      return () => {
        if (state === key) { ++serial; cancelAnimations(); state = 'extensions'; renderManager(); manager.panel.hidden = false; manager.panel.inert = false; }
        panels.delete(panel); extensionPanels.delete(key);
        splashes.get(panel)?.remove(); splashes.delete(panel); panel.hidden = true; panel.inert = true;
      };
    },
    showPanel(id) { if (extensionPanels.has('panel:' + id)) return go('panel:' + id); return false; },
    report(error) { lastError = error; if (state === 'extensions') renderManager(); },
    dispose() {
      if (disposed) return;
      disposed = true; ++serial; cancelAnimations(); doc.removeEventListener('keydown', key, true);
      host.visualViewport?.removeEventListener('resize', place); host.visualViewport?.removeEventListener('scroll', place);
      checkUpdateButton.onclick = null;
      root.remove(); manager.panel.remove(); message.panel.remove(); center.panel.remove(); settings.panel.remove();
    },
  };
}
