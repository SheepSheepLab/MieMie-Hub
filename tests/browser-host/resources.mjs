// Test instrumentation only. Installed after the real host/Helper loaded.
// Measures parent-realm registrations of the same 12 event types as Phase2.
export function instrumentResources(){
 window.phase3BrowserErrors=[];window.addEventListener('error',e=>phase3BrowserErrors.push(e.message||'resource error'),false);window.addEventListener('unhandledrejection',e=>phase3BrowserErrors.push(String(e.reason)),false);
 const types=new Set(['click','keydown','keyup','blur','pointerdown','pointermove','pointerup','pointercancel','lostpointercapture','resize','scroll','orientationchange']);
 const listeners=[],observers=new Set(),timeouts=new Set(),intervals=new Set(),timerInfo=new Map(),observerInfo=new WeakMap(),proto=EventTarget.prototype,add=proto.addEventListener,remove=proto.removeEventListener;
 const capture=o=>typeof o==='boolean'?o:!!o?.capture;
 proto.addEventListener=function(type,fn,o){if(types.has(type)&&!listeners.some(x=>x.ref.deref()===this&&x.type===type&&x.fn.deref()===fn&&x.capture===capture(o)))listeners.push({ref:new WeakRef(this),type,fn:new WeakRef(fn),capture:capture(o),signal:o?.signal,stack:new Error().stack?.split('\n').slice(2,6).join('\n')});return add.call(this,type,fn,o);};
 proto.removeEventListener=function(type,fn,o){const i=listeners.findIndex(x=>x.ref.deref()===this&&x.type===type&&x.fn.deref()===fn&&x.capture===capture(o));if(i>=0)listeners.splice(i,1);return remove.call(this,type,fn,o);};
 const st=window.setTimeout,ct=window.clearTimeout,si=window.setInterval,ci=window.clearInterval;
 window.setTimeout=(fn,ms,...args)=>{let id=st(()=>{timeouts.delete(id);timerInfo.delete(id);typeof fn==='function'?fn(...args):eval(fn);},ms);timeouts.add(id);timerInfo.set(id,{ms,stack:new Error().stack?.split('\n').slice(2,6).join('\n')});return id;};window.clearTimeout=id=>{timeouts.delete(id);timerInfo.delete(id);ct(id);};
 window.setInterval=(fn,ms,...args)=>{const id=si(fn,ms,...args);intervals.add(id);return id;};window.clearInterval=id=>{intervals.delete(id);ci(id);};
 for(const kind of ['MutationObserver','ResizeObserver']){const Original=window[kind];window[kind]=class extends Original{constructor(...args){super(...args);observerInfo.set(this,{kind,stack:new Error().stack?.split('\n').slice(2,6).join('\n')});}observe(...args){observers.add(this);return super.observe(...args);}disconnect(){observers.delete(this);return super.disconnect();}};}
 // Safari WebDriver creates this exact watchdog even on an empty data: page.
 // Keep raw counts and its provenance; every other timer remains in the teardown assertion.
 const driverTimer = x => x.ms===30000 && x.stack==='Promise@[native code]\n_execute@\nevaluateJavaScriptFunction@';
 window.phase3Resources=()=>{const automation=[...timerInfo.values()].filter(driverTimer);const live=listeners.filter(x=>x.ref.deref()&&x.fn.deref()&&!x.signal?.aborted).map(x=>({...x,t:x.ref.deref()}));return {parentListeners:live.length,connectedListeners:live.filter(x=>x.t===window||x.t===document||x.t===visualViewport||x.t.isConnected).length,timeouts:timeouts.size-automation.length,rawTimeouts:timeouts.size,automationTimeouts:automation.length,automationTimeoutDetails:automation,timeoutDetails:[...timerInfo.values()].filter(x=>!driverTimer(x)),intervals:intervals.size,observers:observers.size,observerDetails:[...observers].map(x=>observerInfo.get(x)),listenerTargets:live.map(x=>({type:x.type,target:x.t===window?'window':x.t===document?'document':x.t.id||x.t.tagName||'other',connected:!!x.t.isConnected,stack:x.stack}))};};
}
