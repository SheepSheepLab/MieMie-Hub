const HUB_STATE_KEY = 'miemie_hub_extensions_v1';
let hubUI, hubDisposed = false, savedHubState = {version: 1, extensions: {}};
const sources = new Map(), withdrawing = new Set();
try {
  const stored = JSON.parse(h.localStorage.getItem(HUB_STATE_KEY));
  if (stored?.version === 1 && stored.extensions && typeof stored.extensions === 'object' && !Array.isArray(stored.extensions)) savedHubState = stored;
} catch (_) {}
function persistHubChange(event) {
  if (hubDisposed || event.kind === 'transition' || event.kind === 'launcher' || withdrawing.has(event.extension.manifest.id)) return;
  const item = event.extension, id = item.manifest.id;
  savedHubState.extensions[id] = {registered: event.kind !== 'uninstall', enabled: item.enabled};
  try { h.localStorage.setItem(HUB_STATE_KEY, JSON.stringify(savedHubState)); }
  catch (_) { hubUI?.report('扩展状态本次未能保存；当前页面仍可使用。'); }
}
const extensionRuntime = createExtensionRuntime({
  onChange(event) { persistHubChange(event); hubUI?.refresh(); },
  onMessage(id, title, text) { hubUI?.showMessage(id, title, text); },
  onClose(id) { hubUI?.closeMessage(id); },
  onPanel: (...args) => hubUI.attachPanel(...args),
  onShowPanel: id => hubUI.showPanel(id),
  onError(id, error) { hubUI?.report(id + ' · ' + error); },
});
async function registerSource(id, enable = true) {
  const source = sources.get(id);
  if (!source || hubDisposed) return {ok: false, error: '扩展脚本尚未载入。'};
  const result = extensionRuntime.register(source.manifest, source.factory);
  return result.ok && enable ? extensionRuntime.enable(id) : result;
}
// A source is merely an already-loaded local factory retained for re-registration.
// Uninstall removes its running registration but deliberately keeps user data.
function provide(manifest, factory) {
  try {
    if (hubDisposed) throw Error('Hub 已关闭。');
    const checked = extensionRuntime.validate(manifest), id = checked.id;
    if (typeof factory !== 'function') throw Error('扩展工厂必须是函数。');
    if (sources.has(id) || extensionRuntime.get(id) || withdrawing.has(id)) throw Error('扩展脚本已经载入：' + id);
    const previous = savedHubState.extensions[id];
    const source = {manifest: checked, factory}; sources.set(id, source);
    const ready = previous?.registered === false ? Promise.resolve({ok: true}) : registerSource(id, previous?.enabled !== false);
    hubUI?.refresh();
    return {ok: true, ready, async release() {
      if (sources.get(id) !== source || hubDisposed) return;
      sources.delete(id); withdrawing.add(id);
      try { if (extensionRuntime.get(id)) await extensionRuntime.uninstall(id); }
      finally { withdrawing.delete(id); hubUI?.refresh(); }
    }};
  } catch (error) { return {ok: false, error: error.message}; }
}
// Capture the iframe-bound API, never derive an installed ID from the package.
const hubScriptHost = createHubScriptHost({currentVersion: HUB_VERSION,
  getScriptId: typeof getScriptId === 'function' ? getScriptId : undefined,
  getScriptTrees: typeof getScriptTrees === 'function' ? getScriptTrees : undefined,
  updateScriptTreesWith: typeof updateScriptTreesWith === 'function' ? updateScriptTreesWith : undefined,
});
const hubSelfUpdater = createHubSelfUpdater({currentVersion: HUB_VERSION, host: hubScriptHost,
  storage: {getItem: key => h.sessionStorage.getItem(key), setItem: (key, value) => h.sessionStorage.setItem(key, value), removeItem: key => h.sessionStorage.removeItem(key)},
  backup(script, version) {
    // A recovery download is not a guarantee that the browser saved the file.
    // Its object URL lives briefly in the parent so our own iframe reload does
    // not revoke it before the browser has started reading the backup.
    const blob = new h.Blob([JSON.stringify(script, null, 2) + '\n'], {type: 'application/json'});
    const url = h.URL.createObjectURL(blob), link = h.document.createElement('a');
    link.href = url; link.download = 'MieMie-Hub-backup-' + version + '-' + Date.now() + '.json';
    link.hidden = true; h.document.body.appendChild(link);
    try {link.click();}
    finally {link.remove(); h.setTimeout(() => h.URL.revokeObjectURL(url), 60000);}
  },
  readSavedContent: createHubSavedScriptReader({fetch: (...args) => window.fetch(...args), origin: h.location.origin,
    getRequestHeaders: () => {
      const context = h.SillyTavern?.getContext?.();
      if (typeof context?.getRequestHeaders !== 'function') throw Error('宿主保存确认接口不可用。');
      return context.getRequestHeaders();
    },
  }),
});
const packageManager = createExtensionPackageManager({
  getScriptTrees: typeof getScriptTrees === 'function' ? getScriptTrees : undefined,
  updateScriptTreesWith: typeof updateScriptTreesWith === 'function' ? updateScriptTreesWith : undefined,
  fetch: (...args) => window.fetch(...args), crypto: window.crypto,
  getRegistryBaseURL: () => registryClient.getBase(),
  storage: {getItem: key => h.localStorage.getItem(key), setItem: (key,value) => h.localStorage.setItem(key,value)},
  onChange() {hubUI?.refresh();},
  async backup(script, context) {
    const bytes = JSON.stringify(script, null, 2) + '\n';
    const url = h.URL.createObjectURL(new h.Blob([bytes], {type: 'application/json'}));
    const link = h.document.createElement('a'); link.href = url; link.download = 'MieMie-Extension-recovery-' + Date.now() + '.json';
    link.hidden = true; h.document.body.appendChild(link);
    try {link.click();} finally {link.remove(); h.setTimeout(() => h.URL.revokeObjectURL(url), 60000);}
    if (context.reason === 'uninstall' && !h.confirm('已请求浏览器下载恢复 JSON，请确认文件已实际保存。卸载会删除此脚本条目及其 data，工具外部设置不会清空。确认继续卸载？')) throw Error('已取消卸载，脚本保留。');
  },
});
const packageUI = Object.create(packageManager);
async function withPackagePreference(id, enabled, action) {
  const previous = savedHubState.extensions[id];
  savedHubState.extensions[id] = {registered: true, enabled};
  try {
    h.localStorage.setItem(HUB_STATE_KEY, JSON.stringify(savedHubState));
    const result = await action();
    if (result?.ok === false) throw Error(result.error);
    return result;
  } catch (error) {
    if (previous) savedHubState.extensions[id] = previous; else delete savedHubState.extensions[id];
    try {h.localStorage.setItem(HUB_STATE_KEY, JSON.stringify(savedHubState));} catch (_) {}
    throw error;
  }
}
packageUI.setEnabled = (id, enabled) => withPackagePreference(id, enabled, () => packageManager.setEnabled(id, enabled));
packageUI.install = candidate => {
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(candidate?.id || '')) return Promise.reject(Error('Extension ID 无效。'));
  return withPackagePreference(candidate.id, true, () => packageManager.install(candidate));
};
const registryClient = createRegistryClient({host: h, fetch: (...args) => window.fetch(...args), crypto: window.crypto});
hubUI = createHubUI(h, hubShell, HUB_ASSETS, extensionRuntime, {
  list: () => [...sources.values()].map(s => JSON.parse(JSON.stringify(s.manifest))),
  register: registerSource,
}, HUB_VERSION, hubSelfUpdater, {packages: packageUI, registry: registryClient});
// Keep the previous Hub bridge for callers; no polishing implementation lives here.
const combinedUI = {open: hubUI.open, toggle: hubUI.toggle, back: hubUI.back};
h.__meemeCombinedUI = combinedUI;
const helloSource = provide(HELLO_MANIFEST, createHelloMie);
let finishHubDisposal;
const whenDisposed = new Promise(resolve => {finishHubDisposal = resolve;});
const publicHub = Object.freeze({
  version: HUB_VERSION, apiVersion: 1, open: hubUI.open,
  ready: helloSource.ready, whenDisposed,
  extensions: Object.freeze({
    register: extensionRuntime.register, enable: extensionRuntime.enable,
    disable: extensionRuntime.disable, uninstall: extensionRuntime.uninstall,
    open: extensionRuntime.open, list: extensionRuntime.list, get: extensionRuntime.get,
    provide,
  }),
});
h.__MieMieHub = publicHub;
h.dispatchEvent(new h.CustomEvent('miemie:hub-ready', {detail: publicHub}));
// UI, Shell, built-in timeline and runtime have been constructed. Only a pending
// local handoff triggers persistence readback; ordinary startup never phones home.
void Promise.resolve(publicHub.ready).then(() => {if (!hubDisposed) return hubSelfUpdater.resume();});
function cleanupHub() {
  if (hubDisposed) return;
  hubDisposed = true;
  hubSelfUpdater.dispose();
  // dispose() revokes every extension synchronously before its first await.
  void Promise.resolve(extensionRuntime.dispose()).finally(finishHubDisposal);
  sources.clear(); hubUI.dispose(); hubShell.dispose();
  if (h.__MieMieHub === publicHub) delete h.__MieMieHub;
  if (h.__meemeCombinedUI === combinedUI) delete h.__meemeCombinedUI;
  h.dispatchEvent(new h.CustomEvent('miemie:hub-disposed', {detail: publicHub}));
}
window.addEventListener('pagehide', cleanupHub, {once: true});
window.addEventListener('unload', cleanupHub, {once: true});
