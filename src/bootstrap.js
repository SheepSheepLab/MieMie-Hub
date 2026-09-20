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
hubUI = createHubUI(h, hubShell, HUB_ASSETS, extensionRuntime, {
  list: () => [...sources.values()].map(s => JSON.parse(JSON.stringify(s.manifest))),
  register: registerSource,
}, HUB_VERSION);
// Keep the previous Hub bridge for callers; no polishing implementation lives here.
const combinedUI = {open: hubUI.open, toggle: hubUI.toggle, back: hubUI.back};
h.__meemeCombinedUI = combinedUI;
const helloSource = provide(HELLO_MANIFEST, createHelloMie);
const publicHub = Object.freeze({
  version: HUB_VERSION, apiVersion: 1, open: hubUI.open,
  ready: helloSource.ready,
  extensions: Object.freeze({
    register: extensionRuntime.register, enable: extensionRuntime.enable,
    disable: extensionRuntime.disable, uninstall: extensionRuntime.uninstall,
    open: extensionRuntime.open, list: extensionRuntime.list, get: extensionRuntime.get,
    provide,
  }),
});
h.__MieMieHub = publicHub;
h.dispatchEvent(new h.CustomEvent('miemie:hub-ready', {detail: publicHub}));
function cleanupHub() {
  if (hubDisposed) return;
  hubDisposed = true;
  // dispose() revokes every extension synchronously before its first await.
  void extensionRuntime.dispose();
  sources.clear(); hubUI.dispose(); hubShell.dispose();
  if (h.__MieMieHub === publicHub) delete h.__MieMieHub;
  if (h.__meemeCombinedUI === combinedUI) delete h.__meemeCombinedUI;
  h.dispatchEvent(new h.CustomEvent('miemie:hub-disposed', {detail: publicHub}));
}
window.addEventListener('pagehide', cleanupHub, {once: true});
window.addEventListener('unload', cleanupHub, {once: true});
