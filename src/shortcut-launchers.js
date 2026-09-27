// Private UI capability registry. Extensions own every pixel and pointer handler.
export function createShortcutLaunchers({host,runtime,launch,onChange=()=>{},onError=()=>{}}){
 const key='miemie_hub_shortcuts_v1',entries=new Map();let preferences={},disposed=false;
 try{const value=JSON.parse(host.localStorage.getItem(key));if(value&&typeof value==='object'&&!Array.isArray(value))preferences=value;}catch(_){}
 const report=error=>onError(error?.message||String(error));
 function save(){host.localStorage.setItem(key,JSON.stringify(preferences));}
 function unmount(entry){const handle=entry.handle;entry.handle=null;if(handle)try{handle.dispose();}catch(e){report(e);}}
 function sync(){
  if(disposed)return;
  for(const [id,entry] of entries){
   const record=runtime.get(id),visible=preferences[id]===true&&record?.enabled&&record?.launcherAvailable;
   if(!visible){unmount(entry);continue;}
   if(entry.handle)continue;
   try{
    const open=()=>{if(disposed||entries.get(id)!==entry||!entry.handle||!runtime.get(id)?.enabled)return Promise.resolve(false);return launch(id,()=>runtime.open(id),capture(entry));};
    const mount=entry.mount,handle=mount(Object.freeze({open}));
    if(!handle||typeof handle.dispose!=='function'||typeof handle.getOrigin!=='function'){handle?.dispose?.();throw Error('Shortcut mount 必须返回 getOrigin / dispose。');}
    entry.handle=handle;
    if(!element(entry)){unmount(entry);throw Error('Shortcut 未挂载有效的快捷入口。');}
   }catch(e){preferences={...preferences,[id]:false};try{save();}catch(storageError){report(storageError);}report(e);}
  }
 }
 function element(entry){try{const value=entry.handle?.getOrigin();return value?.ownerDocument===host.document&&value.isConnected?value:null;}catch(_){return null;}}
 function capture(entry){
  const read=()=>{try{const node=element(entry);return node?node.getBoundingClientRect():null;}catch(_){return null;}},r=read();
  const node=element(entry),style=node?host.getComputedStyle(node):null;
  const radius=style?(style.borderRadius.includes('%')?style.borderRadius:(Math.min(50,(parseFloat(style.borderRadius)||0)/Math.max(1,r?.width||1)*100)+'%')):'0%';
  // Optional native presentation receives only its own attached panel and an
  // opening boolean. Capture this mount, never redirect an old Surface to a new
  // handle after toggling/updating; no Runtime record or controller crosses here.
  const handle=entry.handle,provider=handle?.presentation;
  const available=()=>entries.get(entry.id)===entry&&entry.handle===handle&&!!element(entry);
  const invoke=(name,...args)=>{const fn=provider[name];return fn(...args);};
  const presentation=provider&&['place','run','cancel','release'].every(name=>typeof provider[name]==='function')?Object.freeze({
   available,place:panel=>invoke('place',panel),run:(panel,opening)=>invoke('run',panel,opening),
   cancel:()=>invoke('cancel'),release:()=>invoke('release'),
  }):null;
  return {kind:'shortcut',presentation,radius,background:style?.background,id:entry.id,rect:r?{left:r.left,top:r.top,width:r.width,height:r.height}:null,
   currentRect:read,element:()=>element(entry),
   active:value=>{try{entry.handle?.setActive?.(value);}catch(e){report(e);}},
   highlight:()=>{try{entry.handle?.highlight?.();}catch(e){report(e);}},
  };
 }
 return {
  register(id,mount){
   if(disposed||entries.has(id)||typeof mount!=='function')throw Error('Shortcut capability 已注册或无效。');
   const entry={id,mount,handle:null};entries.set(id,entry);
   return ()=>{if(entries.get(id)!==entry)return;unmount(entry);entries.delete(id);};
  },
  sync,
  enabled:id=>preferences[id]===true,
  mounted:id=>{const entry=entries.get(id);return !!(entry&&element(entry));},
  set(id,value){
   if(disposed||!entries.has(id)||typeof value!=='boolean')return false;
   const old=preferences;preferences={...preferences,[id]:value};
   try{save();}catch(e){preferences=old;throw e;}sync();onChange();return value===false||!!entries.get(id)?.handle;
  },
  forget(id){if(Object.hasOwn(preferences,id)){delete preferences[id];try{save();}catch(e){report(e);}}sync();},
  dispose(){disposed=true;for(const entry of entries.values())unmount(entry);entries.clear();},
 };
}
