import {createSurfaceMotion} from './surface-motion.js';

// Provider liveness deadline, not a visual duration or an Extension preference.
const NATIVE_PRESENTATION_TIMEOUT_MS=5000;
// Hub-private UI state only. Entries contain panel/owner/prepare, never Runtime records.
// Navigation supplies entries; motion supplies pixels. Neither knows Registry or packages.
export function createSurfaceController({host,shell,root,launcher,panels,resolve,place,onState,onError}) {
  const geometry={
    originRect(origin){
      if(origin?.kind!=='shortcut')return launcher.originRect(origin);
      const valid=r=>r&&[r.left,r.top,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0;
      const current=origin.currentRect?.(),r=valid(current)?current:origin.rect;if(!valid(r))return null;
      const v=host.visualViewport,w=v?.width||host.innerWidth,h=v?.height||host.innerHeight,x=v?.offsetLeft||0,y=v?.offsetTop||0;
      const width=Math.min(w,r.width),height=Math.min(h,r.height);
      return {left:Math.max(x,Math.min(x+w-width,r.left)),top:Math.max(y,Math.min(y+h-height,r.top)),width,height};
    },
    originElement:origin=>origin?.kind==='shortcut'?null:launcher.originElement(origin),
  };
  const motion=createSurfaceMotion({host,shell,launcher:geometry});
  let nativePresentation=null,finishNative=null;
  function report(error){
    try{Promise.resolve(onError(error instanceof Error?error:Error(String(error)))).catch(()=>{});}catch(_){}
  }
  function cleanupNative(provider,method){
    // Cleanup must be synchronous by contract. Observe accidental rejections,
    // but never wait on third-party cleanup to unblock Surface navigation.
    try{Promise.resolve(provider?.[method]()).catch(report);}catch(error){report(error);}
  }
  function cancelMotion(){
    motion.cancel();finishNative?.();finishNative=null;
    cleanupNative(nativePresentation,'cancel');
  }
  function releasePresentation(){
    cancelMotion();const previous=nativePresentation;nativePresentation=null;
    cleanupNative(previous,'release');
  }
  function failNative(error){
    // Quarantine this presentation for the current Surface, including its close.
    // A future explicit open may retry; failed callbacks cannot recurse in place().
    releasePresentation();report(error);
  }
  function restoreStyle(panel,style){
    if(style===null)panel.removeAttribute('style');else panel.setAttribute('style',style);
  }
  async function runMotion(panel,opening){
    if(!nativePresentation?.available())return motion.run(panel,surfaceOrigin,opening);
    const provider=nativePresentation,id=serial,style=panel.getAttribute('style');
    let finish,timer,failure,failed=false;
    const cancelled=new Promise(resolve=>{finish=resolve;});finishNative=finish;
    const timeout=new Promise((_,reject)=>{timer=host.setTimeout(()=>reject(Error('Native Presentation run() 超时（5000ms），已回退到 Hub Surface。')),NATIVE_PRESENTATION_TIMEOUT_MS);});
    try{await Promise.race([Promise.resolve(provider.run(panel,opening)),cancelled,timeout]);}
    catch(error){failure=error;failed=true;}
    finally{host.clearTimeout(timer);if(finishNative===finish)finishNative=null;}
    // Revoke/dispose/resize may already have settled the race. Late provider
    // rejection is consumed by Promise.race and cannot reopen or hide a Surface.
    if(failed&&!disposed&&id===serial&&nativePresentation===provider){
      failNative(failure);restoreStyle(panel,style);place();
      await motion.run(panel,surfaceOrigin,opening); // Existing motion, no second fallback implementation.
    }
  }
  function restore(origin,highlight=false){
    if(origin?.kind==='shortcut'){
      launcher.resume(origin.honeycomb);if(highlight)origin.highlight?.();
    }else{launcher.resume(origin);if(highlight)launcher.highlight(origin);}
  }
  const origins=new Map(),launching=new Map();
  let state='closed',disposed=false,serial=0,surfaceOrigin=null,transition=Promise.resolve(),pending=null;
  // Opt-in panels keep their original ancestry (and scoped Extension CSS).
  // Lift the explicit panel's stacking chain above the Hub backdrop only while
  // visible. Never scan or reparent third-party UI, and restore all inline styles.
  let releaseLayer=()=>{},stopFollowing=()=>{};
  function followShortcut(){
    if(nativePresentation?.available())return; // Native component owns drag/follow.
    stopFollowing();const node=surfaceOrigin?.kind==='shortcut'?surfaceOrigin.element?.():null;
    if(!node||!host.MutationObserver)return;
    let frame=0;const raf=host.requestAnimationFrame?.bind(host)||((fn)=>host.setTimeout(fn,16)),caf=host.cancelAnimationFrame?.bind(host)||host.clearTimeout.bind(host);
    const observer=new host.MutationObserver(()=>{if(frame)return;frame=raf(()=>{frame=0;if(!disposed&&resolve(state)?.panel.dataset.surfaceState==='open')place();});});
    // Explicit capability-owned element only; no document scanning or idle loop.
    observer.observe(node,{attributes:true,attributeFilter:['style','class']});
    stopFollowing=()=>{observer.disconnect();if(frame)caf(frame);frame=0;stopFollowing=()=>{};};
  }
  function raiseSurface(panel){
    releaseLayer();
    if(shell.root.contains(panel))return;
    const saved=[],z=host.getComputedStyle(shell.root).getPropertyValue('--mie-z-surface').trim()||'2147483500';
    const seen=new Set();
    function lift(start,level){for(let node=start;node&&node!==host.document.body&&node!==host.document.documentElement;node=node.parentElement){
      if(!seen.has(node)){for(const key of ['position','z-index'])saved.push([node,key,node.style.getPropertyValue(key),node.style.getPropertyPriority(key)]);seen.add(node);}
      if(!host.getComputedStyle(node).position||host.getComputedStyle(node).position==='static')node.style.setProperty('position','relative','important');
      node.style.setProperty('z-index',String(level),'important');
    }}
    lift(panel,z);
    if(surfaceOrigin?.kind==='shortcut'){const node=surfaceOrigin.element?.();if(node?.isConnected)lift(node,Number(z)+1);}
    releaseLayer=()=>{for(const[node,key,value,priority]of saved){if(value)node.style.setProperty(key,value,priority);else node.style.removeProperty(key);}releaseLayer=()=>{};};
  }
  const hide=()=>{stopFollowing();releasePresentation();for(const p of panels){p.hidden=true;p.inert=true;}releaseLayer();};
  function setState(next){state=next;onState(next);}
  async function change(next,entry,returnToOrigin=false){
    if(disposed)return false;
    if(state===next){entry?.prepare?.();entry?.panel.focus({preventScroll:true});return true;}
    const freshEntry=state==='closed',id=++serial,old=resolve(state)?.panel;
    if(old&&!old.hidden){
      stopFollowing();old.inert=true;old.dataset.surfaceState='closing';restore(surfaceOrigin);root.inert=true;
      await runMotion(old,false);
      old.hidden=true;old.inert=true;old.dataset.surfaceState='closed';releaseLayer();
      releasePresentation();
      if(id!==serial||disposed)return false;
      const returnState=surfaceOrigin?.returnState;restore(surfaceOrigin,true);surfaceOrigin=null;
      if(returnToOrigin&&next==='menu'&&returnState==='closed')next='closed';
    }
    if(id!==serial||disposed)return false;
    if(entry){
      const requestedOrigin=origins.get(entry.owner);
      if(root.hidden&&requestedOrigin?.kind!=='shortcut')await launcher.open({preserve:true});
      if(id!==serial||disposed||resolve(next)!==entry)return false;
      surfaceOrigin=origins.get(entry.owner)||launcher.capture(entry.owner);origins.delete(entry.owner);
      if(surfaceOrigin?.kind==='shortcut')surfaceOrigin.icon=entry.icon;
      restore(surfaceOrigin);hide();setState(next);entry.prepare?.();
      nativePresentation=surfaceOrigin?.presentation||null;
      const panel=entry.panel;panel.hidden=false;panel.inert=true;panel.dataset.surfaceState='opening';place();raiseSurface(panel);
      const flight=runMotion(panel,true);launcher.suspend();await flight;
      if(id!==serial||disposed||resolve(next)!==entry)return false;
      panel.dataset.surfaceState='open';followShortcut();panel.inert=false;panel.focus({preventScroll:true});
    }else{
      hide();setState(next);launcher.resume();
      if(next==='menu')await launcher.open({preserve:!freshEntry});else{await launcher.close();shell.orb.focus({preventScroll:true});}
    }
    return true;
  }
  function go(next,entry=resolve(next),closingKey=null){
    if(disposed||(!entry&&next!=='menu'&&next!=='closed'))return Promise.resolve(false);
    if(pending?.next===next&&pending.entry===entry&&pending.closingKey===closingKey)return pending.task;
    const task=transition.then(()=>{
      if(entry&&(resolve(closingKey||next)!==entry||(closingKey&&state!==closingKey)))return false;
      return change(next,closingKey?null:entry,!!closingKey);
    }).catch(error=>{
      if(disposed)return false;
      cancelMotion();hide();setState('menu');restore(surfaceOrigin);surfaceOrigin=null;
      void launcher.open({preserve:true});onError(error);return false;
    });
    transition=task;pending={next,entry,closingKey,task};
    void task.finally(()=>{if(pending?.task===task)pending=null;});return task;
  }
  function revoke(owner){
    if(disposed)return;
    origins.delete(owner);
    if(resolve(state)?.owner!==owner)return;
    ++serial;cancelMotion();hide();const next=surfaceOrigin?.returnState||'menu';setState(next);restore(surfaceOrigin);surfaceOrigin=null;
    if(next==='menu')void launcher.open({preserve:true});else void launcher.close();
  }
  return {
    get state(){return state;},
    placeNative(panel){
      if(resolve(state)?.panel!==panel||!nativePresentation?.available())return false;
      const style=panel.getAttribute('style');
      try{nativePresentation.place(panel);return true;}
      catch(error){failNative(error);restoreStyle(panel,style);return false;}
    },
    floatingAnchor(panel){return surfaceOrigin?.kind==='shortcut'&&resolve(state)?.panel===panel?geometry.originRect(surfaceOrigin):null;},go,revoke,
    close(key){const entry=resolve(key);return entry&&(state===key||pending?.next===key)?go('menu',entry,key):Promise.resolve(false);},
    launch(owner,open,origin=null){
      if(disposed)return Promise.resolve(false);
      if(launching.has(owner))return launching.get(owner);
      if(origin?.kind==='shortcut'){origin.returnState=root.hidden?'closed':'menu';origin.honeycomb=launcher.capture(owner);}
      origins.set(owner,origin||launcher.capture(owner));
      const task=Promise.resolve().then(()=>disposed?false:open()).finally(()=>{launching.delete(owner);origins.delete(owner);});
      launching.set(owner,task);return task;
    },
    // The lifecycle still completes at the newly laid-out endpoint. No stale flight
    // is resumed after rotation/keyboard resize; cancellation is not deactivation.
    resize(){cancelMotion();},
    dispose(){if(disposed)return;disposed=true;++serial;cancelMotion();hide();origins.clear();launching.clear();},
  };
}
