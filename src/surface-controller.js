import {createSurfaceMotion} from './surface-motion.js';

// One Hub Surface and one Native capability registry; no third-party motion adapter.
export function createSurfaceController({host,shell,root,launcher,panels,resolve,place,onState,onError,runtime,onEntryChange=()=>{}}) {
  const motion=createSurfaceMotion({host,shell,launcher});
  function report(error){
    try{Promise.resolve(onError(error instanceof Error?error:Error(String(error)))).catch(()=>{});}catch(_){}
  }
  const cancelMotion=()=>motion.cancel();
  const runMotion=(panel,opening)=>motion.run(panel,surfaceOrigin,opening);
  function restore(origin,highlight=false){launcher.resume(origin);if(highlight)launcher.highlight(origin,{focus:false});}
  const origins=new Map(),nativeWindows=new Map();
  let ownershipEpoch=0,hubRequest=null,target='closed';
  const preferenceKey='miemie_hub_shortcuts_v1';let preferences={};
  try{const value=JSON.parse(host.localStorage.getItem(preferenceKey));if(value&&typeof value==='object'&&!Array.isArray(value))preferences=value;}catch(_){}
  function invalidateRequests(){
    ++ownershipEpoch;hubRequest?.controller.abort();hubRequest=null;
  }
  function cancelHubWork(){
    ++serial;stopFocusWatch();cancelMotion();
    if(pending){
      // Retire the interrupted Surface synchronously; a successor must not
      // replay the same closing animation or inherit its deferred focus.
      const next=target==='closed'?'closed':'menu';
      hide();setState(next);restore(surfaceOrigin);surfaceOrigin=null;
      launcher.settle(next==='menu');
    }
    transition=Promise.resolve();pending=null;
  }
  function requestSurface(owner){
    if(disposed)return null;
    invalidateRequests();cancelHubWork();target='panel:'+owner;
    const controller=new host.AbortController(),entry=resolve(target);
    const request={owner,entry,controller,epoch:ownershipEpoch};
    request.context=Object.freeze({signal:controller.signal,isCurrent:()=>!disposed&&hubRequest===request&&request.epoch===ownershipEpoch&&!controller.signal.aborted&&resolve('panel:'+owner)===entry});
    hubRequest=request;return request.context;
  }
  function validSurface(owner,lease){return !!lease&&hubRequest?.owner===owner&&hubRequest.context===lease&&lease.isCurrent();}
  function cancelSurface(owner,lease){if(validSurface(owner,lease)){invalidateRequests();cancelHubWork();}}

  let state='closed',disposed=false,serial=0,surfaceOrigin=null,transition=Promise.resolve(),pending=null;
  // Opt-in panels keep their original ancestry (and scoped Extension CSS).
  // Lift the explicit panel's stacking chain above the Hub backdrop only while
  // visible. Never scan or reparent third-party UI, and restore all inline styles.
  let releaseLayer=()=>{};
  let stopFocusWatch=()=>{};
  const deepFocus=()=>{let node=host.document.activeElement;while(node?.shadowRoot?.activeElement)node=node.shadowRoot.activeElement;return node;};
  const within=(scope,node)=>{for(;node;node=node.parentNode||node.host)if(node===scope)return true;return false;};
  function focusTarget(origin){
    const node=launcher.originElement(origin);
    if(!node)return null;
    const selector='button,input:not([type="hidden"]),select,textarea,a[href],[tabindex],[contenteditable="true"]';
    // Only the captured Honeycomb origin subtree, including an open shadow root.
    // Preserve its tabindex; a wrapper focus() is not necessarily effective.
    const eligible=n=>{
      if(!n?.isConnected||typeof n.focus!=='function'||n.matches(':disabled'))return false;
      for(let ancestor=n;ancestor;ancestor=ancestor.parentElement||ancestor.getRootNode().host){
        const style=host.getComputedStyle(ancestor);
        if(ancestor.hidden||ancestor.inert||ancestor.hasAttribute('inert')||style.visibility==='hidden'||style.display==='none')return false;
      }
      return true;
    };
    const find=n=>{if(!eligible(n))return null;if(n.matches?.(selector))return n;for(const child of [...(n.shadowRoot?.children||[]),...n.children]){const found=find(child);if(found)return found;}return null;};
    if(!eligible(node))return null;
    return find(node);
  }
  function watchCloseFocus(old,origin){
    stopFocusWatch();
    const doc=host.document,active=deepFocus(),source=launcher.originElement(origin);
    let allowed=!old||!active||active===doc.body||within(old,active)||within(root,active)||within(source,active)||active===shell.orb;
    const abandon=()=>{allowed=false;};
    const key=e=>{if(e.key!=='Escape')abandon();};
    // Transition-local intent guard, removed on completion/revoke/dispose.
    // focusout caused by hidden/inert is not new user intent; any new focus is.
    doc.addEventListener('focusin',abandon,true);doc.addEventListener('pointerdown',abandon,true);doc.addEventListener('keydown',key,true);
    const stop=()=>{doc.removeEventListener('focusin',abandon,true);doc.removeEventListener('pointerdown',abandon,true);doc.removeEventListener('keydown',key,true);if(stopFocusWatch===stop)stopFocusWatch=()=>{};};
    stopFocusWatch=stop;return {allowed:()=>allowed,stop};
  }
  function raiseSurface(panel){
    releaseLayer();
    if(shell.root.contains(panel))return;
    const saved=[],z=host.getComputedStyle(shell.root).getPropertyValue('--mie-z-surface').trim()||'2147483646';
    const seen=new Set();
    function lift(start,level){for(let node=start;node&&node!==host.document.body&&node!==host.document.documentElement;node=node.parentElement){
      if(!seen.has(node)){for(const key of ['position','z-index'])saved.push([node,key,node.style.getPropertyValue(key),node.style.getPropertyPriority(key)]);seen.add(node);}
      if(!host.getComputedStyle(node).position||host.getComputedStyle(node).position==='static')node.style.setProperty('position','relative','important');
      node.style.setProperty('z-index',String(level),'important');
    }}
    lift(panel,z);
    releaseLayer=()=>{for(const[node,key,value,priority]of saved){if(value)node.style.setProperty(key,value,priority);else node.style.removeProperty(key);}releaseLayer=()=>{};};
  }
  const hide=()=>{cancelMotion();for(const p of panels){if(ownsNative(p))continue;p.hidden=true;p.inert=true;}releaseLayer();};
  function setState(next){state=next;if(next==='closed')delete shell.root.dataset.hubForeground;else shell.root.dataset.hubForeground='true';onState(next);}
  async function change(next,entry,isLatest=()=>true){
    if(disposed)return false;
    // Business open() may reset its root's layout before showPanel(). Reapply
    // the current entrance's presentation without changing Origin or motion.
    if(state===next){entry?.prepare?.();if(entry)place();entry?.panel.focus({preventScroll:true});return true;}
    const freshEntry=state==='closed',id=++serial,old=resolve(state)?.panel,origin=surfaceOrigin;
    const returnFocusToOrigin=!!old&&next==='menu';
    const focus=!entry&&(old||next==='closed')?watchCloseFocus(old,origin):null;
    try{
    if(old&&!old.hidden){
      old.inert=true;old.dataset.surfaceState='closing';restore(surfaceOrigin);root.inert=true;
      await runMotion(old,false);
      // Ownership may already have returned to Standalone or a new Session.
      if(id!==serial||disposed)return false;
      old.hidden=true;old.inert=true;old.dataset.surfaceState='closed';releaseLayer();
      cancelMotion();
      if(id!==serial||disposed)return false;
      restore(surfaceOrigin);surfaceOrigin=null;
    }
    if(id!==serial||disposed)return false;
    if(entry){
      if(root.hidden)await launcher.open({preserve:true});
      if(id!==serial||disposed||resolve(next)!==entry)return false;
      surfaceOrigin=origins.get(entry.owner)||launcher.capture(entry.owner);origins.delete(entry.owner);
      restore(surfaceOrigin);hide();setState(next);entry.prepare?.();
      const panel=entry.panel;panel.hidden=false;panel.inert=true;panel.dataset.surfaceState='opening';place();raiseSurface(panel);
      const flight=runMotion(panel,true);launcher.suspend();await flight;
      if(id!==serial||disposed||resolve(next)!==entry)return false;
      panel.dataset.surfaceState='open';panel.inert=false;panel.focus({preventScroll:true});
    }else{
      hide();setState(next);launcher.resume();
      if(next==='menu')await launcher.open({preserve:!freshEntry,focus:!focus});else await launcher.close();
      if(id===serial&&!disposed&&isLatest()&&focus?.allowed()){
        const target=returnFocusToOrigin?focusTarget(origin):shell.orb;
        if(target?.isConnected&&!target.closest('[hidden],[inert]')){
          focus.stop();target.focus({preventScroll:true});
          if(returnFocusToOrigin)restore(origin,true);
        }
      }
    }
    return true;
    }finally{focus?.stop();}
  }
  function go(next,entry=resolve(next),closingKey=null,lease=null){
    if(disposed||(!entry&&next!=='menu'&&next!=='closed'))return Promise.resolve(false);
    if(lease&&!validSurface(entry?.owner,lease))return Promise.resolve(false);
    if(!lease){invalidateRequests();cancelHubWork();}
    target=next;
    if(pending?.next===next&&pending.entry===entry&&pending.closingKey===closingKey)return pending.task;
    const epoch=ownershipEpoch;
    const task=transition.then(()=>{
      if(epoch!==ownershipEpoch)return false;
      if(entry&&(resolve(closingKey||next)!==entry||(closingKey&&state!==closingKey)))return false;
      return change(next,closingKey?null:entry,()=>transition===task);
    }).catch(error=>{
      if(disposed||epoch!==ownershipEpoch)return false;
      cancelMotion();hide();setState('menu');restore(surfaceOrigin);surfaceOrigin=null;
      void launcher.open({preserve:true,focus:false});onError(error);return false;
    });
    transition=task;pending={next,entry,closingKey,task};
    void task.finally(()=>{if(pending?.task===task)pending=null;});return task;
  }
  function revoke(owner,reason='session-end'){
    if(disposed)return;
    const released=acquireHub(owner,reason);
    if(hubRequest?.owner===owner){invalidateRequests();cancelHubWork();}
    origins.delete(owner);
    if(resolve(state)?.owner!==owner)return released;
    ++serial;stopFocusWatch();cancelMotion();hide();const next='menu';setState(next);restore(surfaceOrigin);surfaceOrigin=null;
    if(next==='menu')void launcher.open({preserve:true,focus:false});else void launcher.close();
    return released;
  }
  // A failed release protects the root but grants NO valid Native lease.
  function ownsNative(panel){if(!panel)return false;for(const n of nativeWindows.values())if(n.entry.panel===panel&&(n.lease||n.blocked))return true;return false;}
  function acquireHub(owner,reason='surface'){
    const n=nativeWindows.get(owner);if(!n||(!n.lease&&!n.blocked))return true;
    if(n.releasing)return false;
    const lease=n.lease||n.blocked;n.lease=null;n.blocked=lease;
    lease.controller.abort();n.releasing=true;
    try{syncNative(n.provider.release,lease.context,reason);}
    catch(error){lease.error=String(error?.message||error);report(error);return false;}
    finally{n.releasing=false;}
    n.entry.saveNative();n.blocked=null;
    n.entry.panel.hidden=true;n.entry.panel.inert=true;n.entry.panel.dataset.surfaceState='closed';return true;
  }
  function syncNative(fn,...args){
    const value=fn(...args);
    if(value&&typeof value.then==='function'){Promise.resolve(value).catch(report);throw Error('Native Window callbacks must complete synchronously; use the lease for animation.');}
    return value;
  }
  function origin(n){
    const value=n.handle?.getOrigin();
    return value?.nodeType===1&&value.ownerDocument===host.document&&value.isConnected?value:null;
  }
  function unmount(n,reason){
    const ok=acquireHub(n.owner,reason),handle=n.handle;n.handle=null;
    n.mountController?.abort();n.mountController=null;
    if(handle)try{syncNative(handle.dispose);}catch(error){report(error);}
    return ok;
  }
  function syncEntries(){
    if(disposed)return;
    for(const [owner,n]of nativeWindows){
      const record=runtime?.get(owner);
      if(preferences[owner]!==true||!record?.enabled||!record?.launcherAvailable){
        if(n.handle)unmount(n,'entry-off');continue;
      }
      if(n.handle||n.mountFailed)continue;
      const controller=new host.AbortController();n.mountController=controller;
      const open=()=>!disposed&&nativeWindows.get(owner)===n&&n.mountController===controller&&!controller.signal.aborted&&n.handle&&runtime.get(owner)?.enabled?openNative(owner):Promise.resolve(false);
      try{
        const handle=syncNative(n.provider.mount,Object.freeze({open,signal:controller.signal}));
        n.handle=handle;
        if(!handle||typeof handle.dispose!=='function'||typeof handle.getOrigin!=='function'||!origin(n))throw Error('Native mount requires a connected getOrigin() and synchronous dispose().');
      }catch(error){n.mountFailed=String(error?.message||error);unmount(n,'entry-off');report(error);}
    }
  }
  function openNative(owner){
    const n=nativeWindows.get(owner);if(!n)return Promise.resolve(false);
    if(disposed||n.releasing||!n.handle||!runtime?.get(owner)?.enabled||resolve('panel:'+owner)!==n.entry)return Promise.resolve(false);
    // EVERY click invalidates older Hub intents, even when reusing a Native lease.
    invalidateRequests();
    if(resolve(state)?.owner===owner||pending){
      const next=target==='closed'?'closed':'menu';
      cancelHubWork();hide();setState(next);restore(surfaceOrigin);surfaceOrigin=null;
      launcher.settle(next==='menu');target=next;
    }
    origins.delete(owner);
    try{
      if(n.blocked&&!acquireHub(owner,'retry'))return Promise.resolve({ok:false,error:'Native release retry failed.'});
      if(!n.lease){
        n.entry.restoreNative();
        const controller=new host.AbortController(),lease={controller};n.lease=lease;
        lease.context=Object.freeze({signal:controller.signal,isCurrent:()=>!disposed&&nativeWindows.get(owner)===n&&n.lease===lease&&!controller.signal.aborted});
      }
      const lease=n.lease;syncNative(n.provider.open,lease.context);
      return Promise.resolve(lease.context.isCurrent()?{ok:true}:{ok:false,cancelled:true});
    }catch(error){acquireHub(owner,'open-failed');report(error);return Promise.resolve({ok:false,error:String(error?.message||error)});}
  }
  function nativeEvent(event){
    if(!nativeWindows.size)return false;
    const path=event.composedPath?.()||[],active=deepFocus();
    for(const n of nativeWindows.values()){
      if(!n.lease&&!n.blocked)continue;
      let orb;try{orb=origin(n);}catch(error){report(error);}
      if(path.includes(n.entry.panel)||path.includes(orb)||within(n.entry.panel,active)||within(orb,active))return true;
      // Explicit portals only. Do not scan document for an Extension's dialogs.
      try{const owns=n.provider.ownsEvent?.(event);if(owns===true)return true;if(owns&&typeof owns.then==='function'){Promise.resolve(owns).catch(report);report(Error('Native Window ownsEvent 必须同步返回 boolean。'));}}catch(error){report(error);}
    }
    return false;
  }
  return {
    registerNativeWindow(owner,provider){
      const entry=resolve('panel:'+owner);
      if(disposed||!entry||nativeWindows.has(owner))throw Error('Native Window 未挂载或重复。');
      const n={owner,entry,provider,lease:null,blocked:null,handle:null,mountController:null,mountFailed:false,releasing:false};nativeWindows.set(owner,n);
      return (reason='session-end')=>{if(nativeWindows.get(owner)!==n)return;unmount(n,reason);nativeWindows.delete(owner);};
    },
    entryError:owner=>{const n=nativeWindows.get(owner);return n?.mountFailed?'悬浮球挂载失败：'+n.mountFailed:n?.blocked?.error?'原生窗口释放失败：'+n.blocked.error:'';},
    releaseBlocked:owner=>!!nativeWindows.get(owner)?.blocked,
    retryRelease(owner){const ok=acquireHub(owner,'retry');onEntryChange();return ok;},
    entryEnabled:owner=>preferences[owner]===true,
    entryMounted:owner=>{try{return !!origin(nativeWindows.get(owner)||{});}catch(error){report(error);return false;}},
    setEntry(owner,value){
      const n=nativeWindows.get(owner);if(disposed||!n||typeof value!=='boolean')return false;
      const next={...preferences,[owner]:value};host.localStorage.setItem(preferenceKey,JSON.stringify(next));preferences=next;
      n.mountFailed=false;
      const released=value?true:unmount(n,'entry-off');syncEntries();onEntryChange();
      return value?!!n.handle:released;
    },
    forgetEntry(owner){delete preferences[owner];try{host.localStorage.setItem(preferenceKey,JSON.stringify(preferences));}catch(error){report(error);}syncEntries();},
    syncEntries,requestSurface,validSurface,cancelSurface,
    ownsNative,openNative,acquireHub,nativeEvent,
    get state(){return state;},
    // Reuse existing Surface identity and queue; no second navigation generation.
    backContext(){
      const key=state,entry=resolve(key),id=serial,task=transition;
      const isCurrent=()=>!disposed&&state===key&&resolve(key)===entry&&serial===id&&transition===task;
      return {key,owner:entry?.owner,ready:!!entry&&!pending&&entry.panel.dataset.surfaceState==='open',isCurrent};
    },
    go,revoke,
    close(key){const entry=resolve(key);return entry&&(state===key||pending?.next===key)?go('menu',entry,key):Promise.resolve(false);},
    launch(owner,open){
      if(disposed)return Promise.resolve(false);
      origins.set(owner,launcher.capture(owner));
      // runtime.open captures the request identity during this user event.
      try{return Promise.resolve(open());}catch(error){return Promise.reject(error);}
    },
    // The lifecycle still completes at the newly laid-out endpoint. No stale flight
    // is resumed after rotation/keyboard resize; cancellation is not deactivation.
    resize(){cancelMotion();},
    dispose(){if(disposed)return;invalidateRequests();for(const n of nativeWindows.values())unmount(n,'hub-dispose');disposed=true;++serial;stopFocusWatch();cancelMotion();hide();nativeWindows.clear();delete shell.root.dataset.hubForeground;origins.clear();},
  };
}
