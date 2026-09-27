import {LAUNCHER_TUNING} from './motion-tuning.js';
// UI-only geometry. Index 0 is the Hub; the remaining items preserve Runtime order.
export function honeycombLayout(count, width) {
  const mobile = width < 620, size = mobile ? Math.min(76, Math.max(48, width * .165)) : 94;
  const dx = mobile ? Math.min(109, (width - 95) / 2) : 125, dy = mobile ? 65 : 72;
  // Reference diamond: center + six neighbours, with one/two columns on every screen.
  // Continue the same staggered columns vertically for any Runtime item count.
  const candidates = [];
  for (let row = -count; row <= count; row++) {
    const columns = row % 2 ? [-1, 1] : [0];
    for (const col of columns) if (row || col) candidates.push({x:col*dx,y:row*dy,row,col});
  }
  const core = p => Math.abs(p.row) + Math.abs(p.col) <= 2 ? 0 : 1;
  candidates.sort((a,b) => core(a)-core(b) || Math.hypot(a.x,a.y)-Math.hypot(b.x,b.y) || a.y-b.y || a.x-b.x);
  const slots = count ? [{x:0,y:0,row:0,col:0}, ...candidates.slice(0,count-1)] : [];
  const minY = Math.min(0,...slots.map(p=>p.y)), maxY = Math.max(0,...slots.map(p=>p.y));
  return {size,items:slots.map(p=>({...p,y:p.y-minY})),height:maxY-minY};
}
export function honeycombScale(distance, height) {
  return 1 - LAUNCHER_TUNING.edgeScaleAmount * Math.pow(Math.min(1, Math.abs(distance) / Math.max(1, height / 2)), LAUNCHER_TUNING.edgeScaleCurve);
}
// Integrate the scale curve: neighbouring rows get closer as their icons shrink.
// The positive derivative (1 - edgeScaleAmount) preserves order and lets every item scroll out.
export function honeycombPosition(distance, height) {
  const radius=Math.max(1,height/2),t=Math.abs(distance)/radius,u=Math.min(1,t);
  return Math.sign(distance)*radius*(u-LAUNCHER_TUNING.edgeScaleAmount*Math.pow(u,LAUNCHER_TUNING.edgeScaleCurve+1)/(LAUNCHER_TUNING.edgeScaleCurve+1)+Math.max(0,t-1)*(1-LAUNCHER_TUNING.edgeScaleAmount));
}
export function honeycombResistance(distance) {return LAUNCHER_TUNING.resistanceMax * distance / (Math.abs(distance) + LAUNCHER_TUNING.resistanceDistance);}

export function createHoneycombLauncher({host, root, shell, title}) {
  root.style.setProperty('--mie-motion-launcher-open',LAUNCHER_TUNING.openMs+'ms');
  root.style.setProperty('--mie-motion-launcher-close',LAUNCHER_TUNING.closeMs+'ms');
  const doc = host.document, scroll = doc.createElement('div'), canvas = doc.createElement('div');
  scroll.className = 'mm-honeycomb-scroll'; canvas.className = 'mm-honeycomb-canvas';
  root.setAttribute('role','dialog'); root.setAttribute('aria-label',title); root.setAttribute('aria-modal','true');
  scroll.setAttribute('aria-label', title); scroll.tabIndex = -1;
  const hint = doc.createElement('p'); hint.className = 'mm-launcher-hint'; hint.textContent = '上下滑动浏览 · 点击主图标收起';
  scroll.append(canvas); root.append(scroll, hint); root.dataset.open = 'false'; root.inert = true; root.hidden = true;
  let buttons = [], cells = [], hubLabel, geometry, width = 0, height = 0, active = false, disposed = false;
  let x = 0, drag = null, suppressClick = false, frame = 0, lastTime = 0, generation = 0, restoringFocus = false;
  const flights = new Set();
  const reduced = () => !!host.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const raf = fn => host.requestAnimationFrame ? host.requestAnimationFrame(fn) : host.setTimeout(() => fn(Date.now()), 16);
  const cancelRAF = id => host.cancelAnimationFrame ? host.cancelAnimationFrame(id) : host.clearTimeout(id);
  function draw() {
    if (!geometry) return;
    const offset = scroll.scrollTop;
    cells.forEach((cell, i) => {
      const slot = geometry.items[i], distance=slot.y-offset, edge = honeycombScale(distance, height);
      const dy=honeycombPosition(distance,height)-distance, dx=slot.x*(edge-1)*LAUNCHER_TUNING.horizontalCompression;
      const scale = edge * (i === 0 ? LAUNCHER_TUNING.hubScale : 1);
      if(root.dataset.open==='true')cell.style.opacity='1';
      cell.style.transform = 'translateX(' + (x+dx).toFixed(2) + 'px) translateY('+dy.toFixed(2)+'px) scale(' + scale.toFixed(4) + ')';
    });
  }
  function tick(time) {
    frame = 0;
    const dt = Math.min(40, lastTime ? time - lastTime : 16); lastTime = time;
    if (!drag && x) {x = reduced() ? 0 : x * Math.exp(-dt / LAUNCHER_TUNING.returnDecayMs); if (Math.abs(x) < LAUNCHER_TUNING.restThreshold) x = 0;}
    draw(); if (!drag && x) schedule(); else lastTime = 0;
  }
  function schedule() {if (!frame && !disposed && active && root.dataset.open==='true') frame = raf(tick);}
  function layout(reset = false) {
    const v = host.visualViewport;
    width = v?.width || host.innerWidth; height = v?.height || host.innerHeight;
    Object.assign(root.style, {left:(v?.offsetLeft || 0)+'px',top:(v?.offsetTop || 0)+'px',width:width+'px',height:height+'px'});
    const oldHubY = geometry?.items[0]?.y || 0;
    geometry = honeycombLayout(cells.length, width);
    canvas.style.height = height + Math.max(0, geometry.height) + 'px';
    cells.forEach((cell,i) => {
      const p = geometry.items[i]; cell.dataset.row = String(p.row); cell.dataset.col = String(p.col);
      Object.assign(cell.style,{left:width/2+p.x-geometry.size/2+'px',top:height/2+p.y-geometry.size/2+'px',width:geometry.size+'px',height:geometry.size+'px'});
    });
    scroll.scrollTop = reset ? geometry.items[0]?.y || 0 : Math.max(0, scroll.scrollTop + (geometry.items[0]?.y || 0) - oldHubY);
    draw();
  }
  function stopFlights() {for (const a of flights) a.cancel(); flights.clear();}
  async function fly(el, frames, delay = 0, duration = LAUNCHER_TUNING.openMs, easing = LAUNCHER_TUNING.easing) {
    Object.assign(el.style,frames[frames.length-1]);
    if (reduced() || !el.animate) return;
    const a = el.animate(frames,{duration,delay,easing,fill:'backwards'}); flights.add(a);
    try {await a.finished;} catch (_) {} finally {flights.delete(a);}
  }
  function setItems(items) {
    const focused = doc.activeElement?.dataset?.hubApp;
    stopFlights(); buttons = items;
    // Return the real Hub orb before replacing wrappers; there is never a clone.
    if (active) shell.releaseOrb();
    cells = [shell.orb,...buttons].map((button,i) => {
      const cell = doc.createElement('div'); cell.className='mm-honeycomb-cell';
      if (i) cell.append(button); else {cell.dataset.hubCell='';hubLabel=doc.createElement('span');hubLabel.className='mm-hub-launcher-label';hubLabel.textContent=title;hubLabel.setAttribute('aria-hidden','true');cell.append(hubLabel);}
      return cell;
    });
    canvas.replaceChildren(...cells);
    if (active) {shell.borrowOrb(cells[0]);hubLabel.textContent=shell.orb.dataset.productLabel||title;}
    layout();
    if (focused && active) buttons.find(b=>b.dataset.hubApp===focused)?.focus({preventScroll:true});
  }
  // Measure only at transition boundaries. Scrolling still uses cached geometry.
  const center = rect => ({x:rect.left+rect.width/2,y:rect.top+rect.height/2,size:rect.width});
  const ease = t => {t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);};
  const mix = (a,b,t) => a+(b-a)*t;
  function positions() {
    return cells.map(cell => ({...center(cell.getBoundingClientRect()),opacity:Number(host.getComputedStyle(cell).opacity)||0}));
  }
  // One motion sequence: every child expands from / contracts into the MOVING Hub.
  // Quintic position curves avoid the velocity break of two sequential flights.
  function travel(cell, index, start, end, hubStart, hubEnd, opening, duration, bounds) {
    const p=geometry.items[index];
    const origin={x:bounds.left+width/2+p.x,y:bounds.top+height/2+p.y-scroll.scrollTop};
    const frames=Array.from({length:25},(_,step)=>{
      const t=step/24,move=ease(t),fan=index===0?move:ease(opening?(t-LAUNCHER_TUNING.fanDelay-Math.min(index*LAUNCHER_TUNING.fanStagger,LAUNCHER_TUNING.fanStaggerMax))/LAUNCHER_TUNING.fanOpenSpan:t/LAUNCHER_TUNING.fanCloseSpan);
      const anchor={x:mix(hubStart.x,hubEnd.x,move),y:mix(hubStart.y,hubEnd.y,move)};
      const px=anchor.x+mix(start.x-hubStart.x,end.x-hubEnd.x,fan),py=anchor.y+mix(start.y-hubStart.y,end.y-hubEnd.y,fan);
      return {transform:'translate('+(px-origin.x)+'px,'+(py-origin.y)+'px) scale('+mix(start.size,end.size,fan)/geometry.size+')',opacity:mix(start.opacity,end.opacity,fan)};
    });
    return fly(cell,frames,0,duration,'linear');
  }
  async function open({preserve=false}={}) {
    if (disposed || (active && root.dataset.open === 'true')) return;
    const id=++generation,from=center(shell.orb.getBoundingClientRect()),previous=active?positions():null;
    const labelStart=active?{transform:host.getComputedStyle(hubLabel).transform,opacity:host.getComputedStyle(hubLabel).opacity}:null;
    stopFlights();active=true;x=0;root.hidden=false;root.dataset.open='true';root.dataset.moving='true';root.inert=false;
    shell.borrowOrb(cells[0]);hubLabel.textContent=shell.orb.dataset.productLabel||title;layout(!preserve);
    const target=positions(),hubEnd=target[0],bounds=root.getBoundingClientRect();
    await Promise.all([...cells.map((cell,i)=>travel(cell,i,previous?.[i]||{...from,size:i?geometry.size*LAUNCHER_TUNING.collapsedScale:from.size,opacity:i?0:1},target[i],previous?.[0]||from,hubEnd,true,LAUNCHER_TUNING.openMs,bounds)),
      fly(hubLabel,[labelStart||{transform:'translate(-50%,-'+(geometry.size/2+8)+'px) scale('+LAUNCHER_TUNING.labelCollapsedScale+')',opacity:0},{transform:'translate(-50%,0) scale(1)',opacity:1}],0,LAUNCHER_TUNING.openMs)]);
    if(id===generation&&active){root.dataset.moving='false';draw();shell.orb.focus({preventScroll:true});}
  }
  async function close() {
    if (!active || root.dataset.open==='false') return;
    const id=++generation,start=positions(),labelStart={transform:host.getComputedStyle(hubLabel).transform,opacity:host.getComputedStyle(hubLabel).opacity};
    stopFlights();drag=null;root.inert=true;root.dataset.moving='true';
    if(frame){cancelRAF(frame);frame=0;}
    const bounds=root.getBoundingClientRect(),dock=shell.getDock(),end={x:dock.x+dock.size/2,y:dock.y+dock.size/2,size:dock.size,opacity:1};
    root.dataset.open='false';
    await Promise.all([...cells.map((cell,i)=>travel(cell,i,start[i],i?{...end,size:geometry.size*LAUNCHER_TUNING.collapsedScale,opacity:0}:end,start[0],end,false,LAUNCHER_TUNING.closeMs,bounds)),
      fly(hubLabel,[labelStart,{transform:'translate(-50%,-'+(geometry.size/2+8)+'px) scale('+LAUNCHER_TUNING.labelCollapsedScale+')',opacity:0}],0,LAUNCHER_TUNING.labelCloseMs)]);
    if(id!==generation)return;
    active=false;root.hidden=true;root.dataset.moving='false';shell.releaseOrb();x=0;draw();
  }
  function capture(id) {
    const element=buttons.find(b=>b.dataset.hubApp===id);
    const rect=element?.getBoundingClientRect();
    return {id,element,rect:rect?{left:rect.left,top:rect.top,width:rect.width,height:rect.height}:null,
      scrollTop:scroll.scrollTop,hubY:geometry?.items[0]?.y||0};
  }
  function resume(origin) {
    delete root.dataset.surface;root.inert=false;
    if(origin)scroll.scrollTop=Math.max(0,origin.scrollTop+(geometry.items[0]?.y||0)-origin.hubY);
    x=0;draw();
  }
  function originRect(origin) {
    if(!origin)return null;
    const button=buttons.find(b=>b.dataset.hubApp===origin.id);
    const r=button?.isConnected?button.getBoundingClientRect():null;
    const valid=r=>r&&[r.left,r.top,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0;
    const rect=valid(r)?r:origin.rect;
    if(!valid(rect))return null;
    const v=host.visualViewport,w=v?.width||host.innerWidth,h=v?.height||host.innerHeight,ox=v?.offsetLeft||0,oy=v?.offsetTop||0;
    const rw=Math.min(w,rect.width),rh=Math.min(h,rect.height);
    return {left:Math.max(ox,Math.min(ox+w-rw,rect.left)),top:Math.max(oy,Math.min(oy+h-rh,rect.top)),width:rw,height:rh};
  }
  function highlight(origin) {
    const button=buttons.find(b=>b.dataset.hubApp===origin?.id);
    restoringFocus=true;button?.focus({preventScroll:true});restoringFocus=false;
    if(button&&!reduced()){
      const raw=host.getComputedStyle(shell.root).getPropertyValue('--mie-motion-fast').trim(),duration=parseFloat(raw)*(raw.endsWith('ms')?1:1000);
      void fly(button,[{filter:'brightness('+LAUNCHER_TUNING.returnBrightness+')'},{filter:'brightness(1)'}],0,Number.isFinite(duration)?duration:0).finally(()=>button.style.removeProperty('filter'));
    }
  }
  function down(e) {
    if(!active||e.isPrimary===false||(e.button!==undefined&&e.button!==0))return;
    suppressClick=false;drag={id:e.pointerId,type:e.pointerType,startX:e.clientX,startY:e.clientY,top:scroll.scrollTop,moved:false};
  }
  function move(e) {
    if(!drag||e.pointerId!==drag.id)return;
    const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;
    if(!drag.moved && Math.hypot(dx,dy)>LAUNCHER_TUNING.dragThreshold){drag.moved=true;stopFlights();}
    if(!drag.moved)return;
    x=honeycombResistance(dx);
    // Touch Y remains browser-owned (pan-y); no preventDefault or synthetic inertia.
    if(drag.type==='mouse'){try{scroll.setPointerCapture(e.pointerId);}catch(_){}e.preventDefault();scroll.scrollTop=drag.top-dy;}
    schedule();
  }
  function end(e) {if(!drag||e.pointerId!==drag.id)return;suppressClick=drag.moved;drag=null;try{scroll.releasePointerCapture(e.pointerId);}catch(_){}schedule();}
  function click(e) {if(suppressClick&&e.detail!==0){e.preventDefault();e.stopImmediatePropagation();suppressClick=false;}}
  function focus(e) {
    if (drag || restoringFocus) return;
    const i=cells.findIndex(cell=>cell.contains(e.target));if(i<0)return;
    const y=geometry.items[i].y-scroll.scrollTop;
    if(Math.abs(y)>height*LAUNCHER_TUNING.focusBand){scroll.scrollTop=geometry.items[i].y;schedule();}
  }
  const listeners={scroll:schedule,pointerdown:down,pointermove:move,pointerup:end,pointercancel:end,lostpointercapture:end,focusin:focus};
  for(const [name,fn]of Object.entries(listeners))scroll.addEventListener(name,fn);
  scroll.addEventListener('click',click,true);
  return {open,close,setItems,capture,resume,originRect,originElement:origin=>buttons.find(b=>b.dataset.hubApp===origin?.id&&b.isConnected),highlight,suspend(){root.dataset.surface='true';root.inert=true;},resize:()=>layout(),
    dispose(){disposed=true;++generation;stopFlights();if(frame)cancelRAF(frame);for(const[name,fn]of Object.entries(listeners))scroll.removeEventListener(name,fn);scroll.removeEventListener('click',click,true);shell.releaseOrb();scroll.remove();hint.remove();},
  };
}
