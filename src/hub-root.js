import {HUB_PRODUCT} from './product-identity.js';
// The Shell owns its root and main orb. Retain the legacy dock storage key
// for existing Hub positions; it contains no Extension business state.
export function createHubRoot(host, assets) {
  const doc = host.document;
  const root = doc.createElement('div');
  root.id = 'miemie-hub-shell';
  root.dataset.owner = 'miemie-hub-shell';
  const style = doc.createElement('style');
  style.textContent = assets.shellStyles;
  root.appendChild(style);
  root.insertAdjacentHTML('beforeend', assets.orbHTML);
  const orb = root.querySelector('.ts-orb');
  orb.setAttribute('aria-controls', 'meeme-combined-menu');
  orb.querySelector('img').src = assets.icons.home;
  orb.querySelector('img').alt = HUB_PRODUCT.name;
  orb.title = HUB_PRODUCT.name + ' · 点击开关 / 拖动贴边';
  orb.setAttribute('aria-label', HUB_PRODUCT.name + '：点击开关，拖动贴边');
  doc.documentElement.appendChild(root);
  const DOCK_KEY = 'meeme_timeline_dock_v1';
  let dock = {side: 'right', ratio: .72}, drag = null, suppressClick = false, disposed = false;
  let borrowed = false;
  let onToggle = () => {}, beforeMove = () => {}, onPosition = () => {};
  try {
    const saved = JSON.parse(host.localStorage.getItem(DOCK_KEY));
    if (['left', 'right'].includes(saved?.side) && Number.isFinite(saved.ratio)) dock = {side: saved.side, ratio: Math.max(0, Math.min(1, saved.ratio))};
  } catch (_) {}
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function viewport() { return {width: host.innerWidth, height: host.innerHeight}; }
  function getDock() {
    const v = viewport();
    const margin = Math.min(10, Math.max(0, Math.floor(Math.min(v.width, v.height) / 10)));
    const size = Math.max(1, Math.min(64, v.width - 2 * margin, v.height - 2 * margin));
    const x = dock.side === 'left' ? margin : v.width - margin - size;
    const y = margin + clamp(dock.ratio, 0, 1) * Math.max(0, v.height - size - 2 * margin);
    return {x, y, size, margin};
  }
  function placeDock() {
    if (disposed) return null;
    const g = getDock();
    if (!borrowed) Object.assign(orb.style, {position:'fixed',left:g.x+'px',top:g.y+'px',width:g.size+'px',height:g.size+'px'});
    onPosition();
    return g;
  }
  function rememberDock() {
    try { host.localStorage.setItem(DOCK_KEY, JSON.stringify(dock)); }
    catch (_) { orb.title = HUB_PRODUCT.name + ' · 本次位置未能保存'; }
  }
  function pointerDown(event) {
    if (borrowed || event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
    const g = placeDock();
    drag = {id: event.pointerId, startX: event.clientX, startY: event.clientY, ...g, moved: false};
    suppressClick = false;
    try { orb.setPointerCapture(drag.id); } catch (_) {}
  }
  function pointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) drag.moved = true;
    if (!drag.moved) return;
    event.preventDefault(); beforeMove();
    const v = viewport();
    drag.currentX = clamp(drag.x + event.clientX - drag.startX, drag.margin, v.width - drag.size - drag.margin);
    drag.currentY = clamp(drag.y + event.clientY - drag.startY, drag.margin, v.height - drag.size - drag.margin);
    Object.assign(orb.style, {left: drag.currentX + 'px', top: drag.currentY + 'px'});
    onPosition();
  }
  function pointerEnd(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const old = drag; drag = null;
    try { orb.releasePointerCapture(event.pointerId); } catch (_) {}
    if (old.moved) {
      suppressClick = true;
      const v = viewport();
      dock = {side: old.currentX + old.size / 2 < v.width / 2 ? 'left' : 'right', ratio: clamp((old.currentY - old.margin) / Math.max(1, v.height - old.size - 2 * old.margin), 0, 1)};
      rememberDock(); placeDock();
    }
  }
  function pointerCancel(event) {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null; suppressClick = true;
    try { orb.releasePointerCapture(event.pointerId); } catch (_) {}
    placeDock();
  }
  function click(event) {
    if (suppressClick && (event.detail !== 0 || event.pointerType)) { suppressClick = false; event.preventDefault(); return; }
    suppressClick = false; onToggle();
  }
  function resized() {
    if (drag) {
      const id = drag.id; drag = null; suppressClick = true;
      try { orb.releasePointerCapture(id); } catch (_) {}
    }
    beforeMove(); placeDock();
  }
  const listeners = {pointerdown: pointerDown, pointermove: pointerMove, pointerup: pointerEnd, pointercancel: pointerCancel, lostpointercapture: pointerCancel, click};
  for (const [event, callback] of Object.entries(listeners)) orb.addEventListener(event, callback);
  host.addEventListener('resize', resized);
  placeDock();
  return {
    root, orb, placeDock, getDock,
    borrowOrb(container) {
      borrowed = true; drag = null; suppressClick = false;
      orb.dataset.launcherOrb = ''; orb.dataset.productLabel = HUB_PRODUCT.name;
      orb.title = HUB_PRODUCT.name + ' · 点击收起 / 滑动浏览';
      Object.assign(orb.style,{position:'relative',left:'0',top:'0',width:'100%',height:'100%'});
      container.append(orb);
    },
    releaseOrb() {
      if (!borrowed) return;
      borrowed = false; delete orb.dataset.launcherOrb; orb.title = HUB_PRODUCT.name + ' · 点击开关 / 拖动贴边'; root.append(orb); placeDock();
    },
    connect(callbacks) {
      onToggle = callbacks.onToggle;
      beforeMove = callbacks.beforeMove;
      onPosition = callbacks.onPosition;
      placeDock();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      host.removeEventListener('resize', resized);
      for (const [event, callback] of Object.entries(listeners)) orb.removeEventListener(event, callback);
      if (drag) { try { orb.releasePointerCapture(drag.id); } catch (_) {} drag = null; }
      root.remove();
    },
  };
}
