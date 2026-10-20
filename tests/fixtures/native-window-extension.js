// Independent acceptance application. No production extension code or data.
export function installNativeWindowAcceptance(scriptWindow, testControls = false) {
 const host=scriptWindow.parent,doc=host.document,id='test.miemie.native-window-parity',key='miemie_native_parity_fixture_v1';
 const manifest={schemaVersion:1,apiVersion:2,id,name:'Native Window Parity Acceptance',version:'1.0.0',contributes:{launcher:{title:'Native Window Test',icon:'🧪'}}};
 let memory={rect:{x:120,y:150,w:360,h:420},orb:{x:24,y:220},draft:''};try{memory={...memory,...JSON.parse(host.localStorage.getItem(key)||'{}')};}catch(_){}
 const stats={factories:0,active:0,peak:0,hooks:0,pulses:0,hubOpens:0,nativeOpens:0,backs:0,releases:0,session:0};
 let business=null,source=null,disposed=false,queue=Promise.resolve();
 const controls={failRelease:false,holdOpen:false,pending:[],surfaceLeases:[],nativeLeases:[],lateResults:[],inputs:{},release(){for(const finish of this.pending.splice(0))finish();}};
 const save=()=>host.localStorage.setItem(key,JSON.stringify(memory));
 function createBusiness(api=null){
  stats.factories++;stats.session++;stats.active++;stats.peak=Math.max(stats.peak,stats.active);stats.hooks++;
  const life=new host.AbortController(),session=stats.session,gestures=[];let mode=api?'hub':'standalone',visible=false,epoch=0,nativeLease=null,surfaceLease=null,flight=null,orb=null,dropOpen=false;
  const panel=doc.createElement('section');panel.dataset.nativeParityPanel='';panel.tabIndex=-1;panel.hidden=true;
  panel.style.cssText='position:fixed;box-sizing:border-box;background:#f6f0ff;color:#261738;border:2px solid #9879ce;border-radius:14px;z-index:2147483550;padding:12px;box-shadow:0 8px 24px #0005;';
  panel.innerHTML='<header data-native-drag style="touch-action:none;cursor:move;font-weight:bold">Native Window Test <button data-native-close style="float:right">关闭</button></header><p>独立测试窗口：拖动标题、拖动右下角缩放；草稿随入口切换保留。</p><textarea aria-label="测试草稿" style="width:95%;height:90px"></textarea><p><button data-open-dialog>打开内部弹窗</button></p><dialog data-native-dialog><p>内部 Dialog</p><button data-open-dropdown>打开 Dropdown</button><div data-native-dropdown hidden tabindex="-1">Dropdown · 按 Esc 返回</div></dialog><button data-native-resize aria-label="缩放窗口" style="position:absolute;right:0;bottom:0;touch-action:none;cursor:nwse-resize">↘</button>';
  doc.body.append(panel);const draft=panel.querySelector('textarea'),dialog=panel.querySelector('dialog'),dropdown=panel.querySelector('[data-native-dropdown]');draft.value=memory.draft;
  const listen=(target,type,fn)=>target.addEventListener(type,fn,{signal:life.signal});
  let portal=null,shadow=null;
  if(testControls){portal=doc.createElement('input');portal.dataset.nativeParityPortal='';portal.setAttribute('aria-label','Native portal');portal.style.cssText='position:fixed;left:650px;top:50px;width:180px;z-index:2147483550';doc.body.append(portal);shadow=doc.createElement('div');shadow.dataset.nativeParityShadow='';shadow.style.cssText='position:fixed;left:650px;top:90px;width:180px;z-index:2147483550';doc.body.append(shadow);const closed=shadow.attachShadow({mode:'closed'}),input=doc.createElement('input');closed.append(input);controls.shadowInput=input;for(const n of [portal,input])listen(n,'keydown',e=>{controls.inputs.portalKeys=(controls.inputs.portalKeys||0)+1;});}
  const native=()=>mode!=='hub',valid=()=>!life.signal.aborted&&native()&&(!nativeLease||nativeLease.isCurrent());
  const apply=()=>{const r=memory.rect;Object.assign(panel.style,{position:'fixed',left:r.x+'px',top:r.y+'px',right:'auto',bottom:'auto',width:r.w+'px',height:r.h+'px',maxHeight:'none'});};
  const cancel=()=>{++epoch;flight?.cancel();flight=null;};
  const layers=()=>{dropOpen=false;dropdown.hidden=true;if(dialog.open)dialog.close();};
  function show(value){
   if(!valid())return;visible=value;cancel();const n=epoch;panel.hidden=false;panel.inert=!value;apply();
   const done=()=>{if(n!==epoch||!valid())return;panel.hidden=!value;panel.inert=!value;if(value)panel.focus({preventScroll:true});else orb?.focus({preventScroll:true});};
   if(!panel.animate||host.matchMedia?.('(prefers-reduced-motion: reduce)').matches){done();return;}
   flight=panel.animate(value?[{opacity:0,transform:'scale(.93)'},{opacity:1,transform:'none'}]:[{opacity:1,transform:'none'},{opacity:0,transform:'scale(.93)'}],{duration:160});
   const a=flight;a.finished.then(done,()=>{}).finally(()=>{a.cancel();if(flight===a)flight=null;});
  }
  function close(){layers();if(native())show(false);else void api.closePanel(surfaceLease);}
  listen(draft,'input',()=>{memory.draft=draft.value;save();});listen(panel.querySelector('[data-native-close]'),'click',close);
  listen(panel.querySelector('[data-open-dialog]'),'click',()=>dialog.showModal());
  listen(panel.querySelector('[data-open-dropdown]'),'click',()=>{dropOpen=true;dropdown.hidden=false;dropdown.focus();});
  function back(){stats.backs++;if(dropOpen){dropOpen=false;dropdown.hidden=true;panel.querySelector('[data-open-dropdown]').focus();return true;}if(dialog.open){dialog.close();panel.querySelector('[data-open-dialog]').focus();return true;}return false;}
  let pressed=false;
  const esc=e=>{if(!native()||e.key!=='Escape'||e.isComposing||e.keyCode===229)return;e.preventDefault();e.stopPropagation();if(e.repeat||pressed)return;pressed=true;if(!back())close();};
  listen(panel,'keydown',esc);listen(doc,'keyup',e=>{if(e.key==='Escape')pressed=false;});listen(host,'blur',()=>pressed=false);
  listen(dialog,'cancel',e=>{if(native()){e.preventDefault();if(!pressed)back();}});
  function pointer(target,resize=false){let start=null;const stop=()=>{const own=start;start=null;if(own&&target.hasPointerCapture(own.id))target.releasePointerCapture(own.id);};gestures.push(stop);
   listen(target,'pointerdown',e=>{if(!native()||e.button!==0||e.target.closest('button')&&!resize)return;start={id:e.pointerId,x:e.clientX,y:e.clientY,rect:{...memory.rect}};target.setPointerCapture(e.pointerId);e.preventDefault();});
   listen(target,'pointermove',e=>{if(!start||!valid())return;const dx=e.clientX-start.x,dy=e.clientY-start.y,r=start.rect;memory.rect=resize?{...r,w:Math.max(280,r.w+dx),h:Math.max(300,r.h+dy)}:{...r,x:r.x+dx,y:r.y+dy};apply();});
   listen(target,'pointerup',()=>{if(start)save();start=null;});listen(target,'pointercancel',()=>start=null);listen(target,'lostpointercapture',()=>start=null);
  }
  pointer(panel.querySelector('[data-native-drag]'));pointer(panel.querySelector('[data-native-resize]'),true);apply();
  listen(doc,'miemie-native-test-pulse',()=>stats.pulses++);
  if(testControls)listen(doc,'keydown',e=>{if(e.ctrlKey&&e.altKey&&e.code==='KeyN'){e.preventDefault();orb?.click();}});
  if(testControls)for(const type of ['dblclick','contextmenu','wheel','keydown','compositionstart','compositionend','pointerdown','gotpointercapture'])listen(panel,type,e=>{controls.inputs[type]=(controls.inputs[type]||0)+1;if(e.isTrusted)controls.inputs[type+':trusted']=(controls.inputs[type+':trusted']||0)+1;if(type==='contextmenu')e.preventDefault();});
  function mount(open,signal){
   const button=doc.createElement('button');button.dataset.nativeParityOrb='';button.textContent='🧪';button.setAttribute('aria-label','Native Window Test');button.style.cssText='position:fixed;width:52px;height:52px;border-radius:18px;border:2px solid #9879ce;background:#e5d7ff;z-index:2147483600;touch-action:none;font-size:25px;';doc.body.append(button);orb=button;
   const own=new host.AbortController(),on=(name,fn)=>button.addEventListener(name,fn,{signal:own.signal});
   signal?.addEventListener('abort',()=>own.abort(),{once:true});
   const position=()=>Object.assign(button.style,{left:memory.orb.x+'px',top:memory.orb.y+'px'});position();let start=null,dragged=false;
   on('pointerdown',e=>{if(e.button!==0)return;start={px:e.clientX,py:e.clientY,...memory.orb};dragged=false;button.setPointerCapture(e.pointerId);});
   on('pointermove',e=>{if(!start)return;const dx=e.clientX-start.px,dy=e.clientY-start.py;if(Math.abs(dx)+Math.abs(dy)>5)dragged=true;if(dragged){memory.orb={x:Math.max(8,Math.min(host.innerWidth-60,start.x+dx)),y:Math.max(8,Math.min(host.innerHeight-60,start.y+dy))};position();}});
   on('pointerup',()=>{if(dragged){memory.orb.x=memory.orb.x+26<host.innerWidth/2?8:host.innerWidth-60;position();save();}start=null;});on('pointercancel',()=>start=null);on('lostpointercapture',()=>start=null);
   on('click',()=>{if(dragged){dragged=false;return;}void open();});on('keydown',esc);
   return {getOrigin:()=>button,dispose(){own.abort();button.remove();if(orb===button)orb=null;}};
  }
  const cleanup=()=>{if(life.signal.aborted)return;cancel();for(const stop of gestures)stop();layers();life.abort();panel.remove();portal?.remove();shadow?.remove();standaloneHandle?.dispose();stats.active--;stats.hooks--;if(business?.session===session)business=null;};let standaloneHandle=null;
  if(api){
   api.onCleanup(cleanup);api.attachPanel(panel);api.registerBackHandler?.(()=>back());
   api.registerNativeWindow({ownsEvent:e=>!!testControls&&(e.composedPath().includes(portal)||e.composedPath().includes(shadow)),mount:({open,signal})=>mount(open,signal),open(lease){if(testControls)controls.nativeLeases.push(lease);mode='native';nativeLease=lease;stats.nativeOpens++;show(!visible);},release(){if(testControls&&controls.failRelease)throw Error('injected release failure');cancel();for(const stop of gestures)stop();layers();visible=false;nativeLease=null;mode='hub';stats.releases++;}});
  }else standaloneHandle=mount(()=>{stats.nativeOpens++;show(!visible);});
  return {session,panel,cleanup,open(lease){surfaceLease=lease;stats.hubOpens++;mode='hub';if(testControls){controls.surfaceLeases.push(lease);if(controls.holdOpen)return new Promise(r=>controls.pending.push(r)).then(async()=>{const result=await api.showPanel(lease);controls.lateResults.push(result);return result;});}return api.showPanel(lease);} ,snapshot:()=>({session,mode,visible,leaseCurrent:!!nativeLease?.isCurrent(),hidden:panel.hidden,inert:panel.inert,rect:{...memory.rect},draft:draft.value,dialog:dialog.open,dropdown:dropOpen})};
 }
 async function attach(hub){if(disposed||!hub||source?.hub===hub)return;business?.cleanup();if(source)await source.lease.release();const lease=hub.extensions.provide(manifest,api=>{const b=createBusiness(api);business=b;return {open:lease=>b.open(lease)};});source={hub,lease};await lease.ready;}
 const schedule=fn=>{queue=queue.then(fn).catch(e=>{probe.error=String(e);});return queue;};
 const ready=e=>schedule(()=>attach(e.detail));
 const gone=e=>schedule(async()=>{if(source?.hub!==e.detail)return;await e.detail.whenDisposed;source=null;if(disposed)return;if(host.__MieMieHub)await attach(host.__MieMieHub);else business=createBusiness();});
 const probe={id,stats,...(testControls?{controls,releaseSource:()=>source?.lease.release()}:{}),snapshot:()=>({stats:{...stats},business:business?.snapshot(),orbs:doc.querySelectorAll('[data-native-parity-orb]').length,panels:doc.querySelectorAll('[data-native-parity-panel]').length,error:probe.error||null})};host.__MieMieNativeAcceptance=probe;
 host.addEventListener('miemie:hub-ready',ready);host.addEventListener('miemie:hub-disposed',gone);
 const stop=()=>{if(disposed)return;disposed=true;host.removeEventListener('miemie:hub-ready',ready);host.removeEventListener('miemie:hub-disposed',gone);business?.cleanup();void source?.lease.release();if(host.__MieMieNativeAcceptance===probe)delete host.__MieMieNativeAcceptance;};
 scriptWindow.addEventListener('pagehide',stop,{once:true});scriptWindow.addEventListener('unload',stop,{once:true});
 if(host.__MieMieHub)schedule(()=>attach(host.__MieMieHub));else business=createBusiness();
 return probe;
}
