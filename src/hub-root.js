import {HUB_PRODUCT} from './product-identity.js';
import {HUB_COPY} from './ui-copy.js';

// The Shell owns its root and main orb. Keep the legacy key for existing positions.
const DOCK_KEY = 'meeme_timeline_dock_v1';
const APPEARANCE_KEY = 'miemie_hub_orb_v1';
export const DOCK_HOLD_MS = 900;
const SLOP = 6;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const orbPercent = value => Number.isFinite(value) ? clamp(Math.round(value), 50, 150) : 100;
const peekDistance = size => Math.min(12, size * .18);

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
  const pullShape = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  pullShape.setAttribute('class', 'mm-dock-pull');
  pullShape.setAttribute('aria-hidden', 'true');
  pullShape.setAttribute('hidden', '');
  pullShape.innerHTML = `<defs><linearGradient id="mm-hub-dock-wash" y1="0" y2="0">
    <stop offset="0" stop-color="#72549f" stop-opacity=".04"/>
    <stop offset=".62" stop-color="#9576c9" stop-opacity=".17"/>
    <stop offset="1" stop-color="#c7adf4" stop-opacity=".38"/>
  </linearGradient></defs><path/>`;
  const pullGradient = pullShape.querySelector('linearGradient'), pullPath = pullShape.querySelector('path');
  root.append(pullShape);
  orb.setAttribute('aria-controls', 'meeme-combined-menu');
  orb.querySelector('img').src = assets.icons.home;
  orb.querySelector('img').alt = HUB_PRODUCT.name;
  orb.setAttribute('aria-label', HUB_PRODUCT.name + '：点击开关，拖动贴边');
  doc.documentElement.appendChild(root);

  let dock = {side: 'right', ratio: .72}, appearance = {size: 100, tucked: false};
  let drag = null, peekTimer, pullReturn, orbReturn, suppressClick = false, disposed = false, borrowed = false;
  let onToggle = () => {}, beforeMove = () => {}, onPosition = () => {};
  try {
    const saved = JSON.parse(host.localStorage.getItem(DOCK_KEY));
    if (['left', 'right'].includes(saved?.side) && Number.isFinite(saved.ratio)) dock = {side: saved.side, ratio: clamp(saved.ratio, 0, 1)};
  } catch (_) {}
  try {
    const saved = JSON.parse(host.localStorage.getItem(APPEARANCE_KEY));
    appearance = {size: orbPercent(saved?.size), tucked: saved?.tucked === true};
  } catch (_) {}

  function getDock() {
    const view = host.visualViewport, left = view?.offsetLeft || 0, top = view?.offsetTop || 0;
    const width = view?.width || host.innerWidth, height = view?.height || host.innerHeight;
    const margin = Math.min(10, Math.max(0, Math.floor(Math.min(width, height) / 10)));
    const theme = host.getComputedStyle(root);
    const inset = edge => Math.max(margin, parseFloat(theme.getPropertyValue('--mie-safe-' + edge)) || 0);
    const minX = left + inset('left'), minY = top + inset('top');
    const size = Math.max(1, Math.min(64 * appearance.size / 100,
      left + width - inset('right') - minX, top + height - inset('bottom') - minY));
    const maxX = Math.max(minX, left + width - inset('right') - size);
    const maxY = Math.max(minY, top + height - inset('bottom') - size);
    const direction = dock.side === 'left' ? 1 : -1;
    const x = appearance.tucked ? (direction === 1 ? left - size / 2 : left + width - size / 2) : (direction === 1 ? minX : maxX);
    return {x, y: minY + dock.ratio * (maxY - minY), size, margin, minX, minY, maxX, maxY, centerX: left + width / 2, direction,
      viewport: {left, top, width, height}};
  }
  function placeDock() {
    if (disposed) return null;
    const g = getDock();
    if (!borrowed) {
      Object.assign(orb.style, {position:'fixed',left:g.x+'px',top:g.y+'px',width:g.size+'px',height:g.size+'px'});
      orb.toggleAttribute('data-dock-tucked', appearance.tucked);
      orb.style.setProperty('--mm-dock-peek', (peekDistance(g.size) * g.direction)+'px');
      orb.title = HUB_PRODUCT.name + ' · ' + (appearance.tucked ? HUB_COPY.dockMode + ' · 向内拉开 / 长按换位' : '点击开关 / 拖动贴边');
      if (appearance.tucked) orb.setAttribute('aria-description', `向屏幕中央拉，松手打开。原地长按 ${DOCK_HOLD_MS / 1000} 秒后可拖动换位。`);
      else orb.removeAttribute('aria-description');
    }
    onPosition();
    return g;
  }
  function clearPeek() {
    host.clearTimeout(peekTimer);
    delete orb.dataset.dockPeek;
  }
  function clearDrag() {
    const old = drag;
    if (old) {
      drag = null; host.clearTimeout(old.timer);
      try { orb.releasePointerCapture(old.id); } catch (_) {}
    }
    delete orb.dataset.dockGesture;
    delete orb.dataset.dockReady;
    return old;
  }
  function pullReady(gesture, event) {
    const inward = (event.clientX - gesture.startX) * gesture.direction;
    const threshold = Math.max(clamp(gesture.size * .34, 12, 28), Math.abs(event.clientY - gesture.startY) * .8);
    return inward >= threshold;
  }
  function clearPull() {
    pullReturn?.cancel(); orbReturn?.cancel();
    pullReturn = orbReturn = null;
    pullShape.setAttribute('hidden', '');
    pullShape.removeAttribute('data-ready');
  }
  function drawPull(gesture, event) {
    const {left, top, width} = gesture.viewport;
    const {direction, size} = gesture;
    const delta = (event.clientX - gesture.startX) * direction;
    const inward = clamp(gesture.peek + delta, 0, size / 2 + gesture.margin);
    const x = gesture.x + inward * direction;
    const edge = direction === 1 ? 0 : width;
    const tipX = x + size / 2 - left, tipY = gesture.y + size / 2 - top;
    const span = size * .66 + Math.min(40, Math.abs(tipX - edge) * .48);
    const upper = tipY - span, lower = tipY + span;
    // Keep the ends on the screen edge and the tip behind the orb's center.
    pullPath.setAttribute('d', `M ${edge} ${upper}
      C ${edge} ${upper + span * .36} ${tipX} ${tipY - span * .56} ${tipX} ${tipY}
      C ${tipX} ${tipY + span * .56} ${edge} ${lower - span * .36} ${edge} ${lower}`);
    pullShape.toggleAttribute('hidden', delta <= 0);
    const ready = pullReady(gesture, event);
    pullShape.toggleAttribute('data-ready', ready);
    orb.toggleAttribute('data-dock-ready', ready);
    orb.style.left = x+'px';
  }
  function retractPull(gesture, restoreOrb) {
    if (pullShape.hasAttribute('hidden') || !pullShape.animate || host.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      clearPull();
      return;
    }
    const motion = {duration:240, easing:'cubic-bezier(.18,.76,.25,1)'};
    const animation = pullReturn = pullShape.animate([
      {transform:'scaleX(1)', opacity:1}, {transform:'scaleX(0)', opacity:0},
    ], {...motion, fill:'forwards'});
    if (restoreOrb) {
      const dx = parseFloat(orb.style.left) - gesture.x;
      const peek = orb.matches('[data-dock-hover], :focus-visible') ? peekDistance(gesture.size) * gesture.direction : 0;
      orbReturn = orb.animate([{translate:dx+'px 0px'}, {translate:peek+'px 0px'}], motion);
    }
    const finish = () => {if (pullReturn === animation) clearPull();};
    void animation.finished.then(finish, finish);
  }
  function moveOrb(gesture, x, y) {
    beforeMove();
    gesture.currentX = x; gesture.currentY = y;
    Object.assign(orb.style, {left:x+'px',top:y+'px'});
    onPosition();
  }
  function centerGrabbedOrb(gesture, x, y) {
    const {left, top, width, height} = gesture.viewport;
    const radius = gesture.size / 2;
    // While held, the center may reach the viewport edge. Dock insets apply after release.
    moveOrb(gesture, clamp(x, left, left + width) - radius, clamp(y, top, top + height) - radius);
  }
  function pointerDown(event) {
    if (drag || event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
    suppressClick = false;
    if (borrowed) return;
    clearPull();
    const geometry = getDock(), mouse = event.pointerType === 'mouse';
    const peek = appearance.tucked && mouse
      ? clamp((orb.getBoundingClientRect().left - geometry.x) * geometry.direction, 0, peekDistance(geometry.size)) : 0;
    clearPeek();
    if (!mouse) delete orb.dataset.dockHover;
    const gesture = drag = {id:event.pointerId, startX:event.clientX, startY:event.clientY,
      mode:appearance.tucked?'hold':'direct', moved:false, ...geometry, peek};
    try { orb.setPointerCapture(gesture.id); } catch (_) {}
    if (gesture.mode === 'hold') gesture.timer = host.setTimeout(() => {
      if (drag !== gesture) return;
      gesture.mode = 'grabbed';
      orb.dataset.dockGesture = 'grabbed';
      centerGrabbedOrb(gesture, gesture.holdX ?? gesture.startX, gesture.holdY ?? gesture.startY);
    }, DOCK_HOLD_MS);
  }
  function pointerMove(event) {
    const gesture = drag;
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
    if (Math.hypot(dx,dy) > SLOP) gesture.moved = true;
    if (!gesture.moved && gesture.mode !== 'grabbed') {
      if (gesture.mode === 'hold') {
        gesture.holdX = event.clientX;
        gesture.holdY = event.clientY;
      }
      return;
    }
    event.preventDefault();
    if (gesture.mode === 'hold') {
      host.clearTimeout(gesture.timer);
      gesture.mode = 'pull';
      orb.dataset.dockGesture = 'pull';
      const {left, top, width, height} = gesture.viewport;
      Object.assign(pullShape.style, {left:left+'px', top:top+'px', width:width+'px', height:height+'px',
        transformOrigin:gesture.direction === 1 ? 'left center' : 'right center'});
      pullGradient.setAttribute('x1', gesture.direction === 1 ? '0%' : '100%');
      pullGradient.setAttribute('x2', gesture.direction === 1 ? '100%' : '0%');
    }
    if (gesture.mode === 'pull') {
      drawPull(gesture, event);
    } else if (gesture.mode === 'grabbed') {
      centerGrabbedOrb(gesture, event.clientX, event.clientY);
    } else {
      orb.dataset.dockGesture = 'drag';
      moveOrb(gesture, clamp(gesture.x + dx, gesture.minX, gesture.maxX), clamp(gesture.y + dy, gesture.minY, gesture.maxY));
    }
  }
  function pointerEnd(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const gesture = clearDrag();
    if (gesture.mode === 'direct' && !gesture.moved) return;
    suppressClick = true;
    if (gesture.mode === 'pull') {
      const ready = pullReady(gesture, event);
      retractPull(gesture, !ready);
      if (ready) {
        const restore=()=>{if (!borrowed && !drag) placeDock();};
        void Promise.resolve(onToggle()).then(restore,restore);
        return;
      }
    } else if (gesture.mode === 'hold') {
      orb.dataset.dockPeek = '';
      peekTimer = host.setTimeout(clearPeek, 640);
    } else if (gesture.moved) {
      dock = {side:gesture.currentX + gesture.size / 2 < gesture.centerX ? 'left' : 'right',
        ratio:clamp((gesture.currentY - gesture.minY) / Math.max(1,gesture.maxY-gesture.minY),0,1)};
      try { host.localStorage.setItem(DOCK_KEY, JSON.stringify(dock)); } catch (_) {}
    }
    placeDock();
  }
  function pointerCancel(event) {
    if (!drag || event.pointerId !== drag.id) return;
    clearDrag(); clearPull(); suppressClick = true; placeDock();
  }
  function pointerEnter(event) {
    if (!borrowed && appearance.tucked && event.pointerType === 'mouse') orb.dataset.dockHover = '';
  }
  function pointerLeave(event) {
    if (event.pointerType === 'mouse') delete orb.dataset.dockHover;
  }
  function contextMenu(event) {
    if (drag && drag.mode !== 'direct') event.preventDefault();
  }
  function click(event) {
    const pointer = event.detail !== 0 || event.pointerType || event.sourceCapabilities?.firesTouchEvents;
    if (pointer && (suppressClick || (!borrowed && appearance.tucked))) {
      suppressClick = false; event.preventDefault(); return;
    }
    suppressClick = false; onToggle();
  }
  function resized() {
    if (clearDrag()) suppressClick = true;
    clearPull(); clearPeek(); delete orb.dataset.dockHover; beforeMove(); placeDock();
  }
  const listeners = {pointerdown: pointerDown, pointermove: pointerMove, pointerup: pointerEnd, pointercancel: pointerCancel,
    lostpointercapture: pointerCancel, pointerenter: pointerEnter, pointerleave: pointerLeave, contextmenu: contextMenu, click};
  for (const [event, callback] of Object.entries(listeners)) orb.addEventListener(event, callback);
  host.addEventListener('resize', resized);
  const visual = host.visualViewport;
  visual?.addEventListener('resize', resized);visual?.addEventListener('scroll', resized);
  placeDock();
  return {
    root, orb, placeDock, getDock,
    getOrbAppearance: () => ({...appearance}),
    setOrbAppearance(next, {save = true} = {}) {
      if (disposed) return false;
      appearance = {size:orbPercent(next.size ?? appearance.size), tucked:next.tucked ?? appearance.tucked};
      if (!borrowed) resized();
      if (save) {
        try { host.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance)); }
        catch (_) {return false;}
      }
      return true;
    },
    borrowOrb(container) {
      borrowed = true;
      if (clearDrag() || orbReturn) clearPull();
      clearPeek();
      delete orb.dataset.dockHover;delete orb.dataset.dockTucked;orb.removeAttribute('aria-description');
      orb.dataset.launcherOrb = ''; orb.dataset.productLabel = HUB_PRODUCT.name;
      orb.title = HUB_PRODUCT.name + ' · 点击收起 / 滑动浏览';
      Object.assign(orb.style,{position:'relative',left:'0',top:'0',width:'100%',height:'100%'});
      container.append(orb);
    },
    releaseOrb() {
      if (!borrowed) return;
      borrowed = false; delete orb.dataset.launcherOrb;root.append(orb);placeDock();
    },
    connect(callbacks) {
      onToggle = callbacks.onToggle;
      beforeMove = callbacks.beforeMove;
      onPosition = callbacks.onPosition;
      placeDock();
    },
    dispose() {
      if (disposed) return;
      disposed = true;clearDrag();clearPull();clearPeek();
      host.removeEventListener('resize', resized);
      visual?.removeEventListener('resize', resized);visual?.removeEventListener('scroll', resized);
      for (const [event, callback] of Object.entries(listeners)) orb.removeEventListener(event, callback);
      root.remove();
    },
  };
}
