// Identical business workload for both API versions. The sole version adapter is registration.
export async function installBenchmark(n){
 const h=window,doc=document,hub=h.__MieMieHub;
 h.benchApps=[];
 for(let i=0;i<n;i++){
  const id='fixture.performance.'+i,stats={factories:0,active:0,peak:0,hooks:0,pulses:0};let api,panel,nativeLease,surfaceLease,mountSignal,entry,sourceLive=true;
  const source=hub.extensions.provide({id,name:'Benchmark '+i,version:'1.0.0',schemaVersion:1,apiVersion:hub.apiVersion,hubApi:{min:hub.apiVersion,max:hub.apiVersion},contributes:{launcher:{title:'Benchmark '+i}}},a=>{
   api=a;stats.factories++;return {activate(){
    stats.active++;stats.peak=Math.max(stats.peak,stats.active);stats.hooks++;
    panel=doc.createElement('section');panel.dataset.bench=id;panel.hidden=true;panel.tabIndex=-1;panel.style.cssText='position:fixed;left:160px;top:160px;width:360px;height:320px;background:white;color:black;z-index:2147483550';panel.innerHTML='<textarea>DRAFT</textarea><div hidden>View 2</div>';doc.body.append(panel);a.attachPanel(panel);
    const hook=()=>stats.pulses++;doc.addEventListener('bench:pulse',hook);
    const provider={mount({open,signal}){mountSignal=signal;entry=doc.createElement('button');entry.dataset.benchOrb=id;entry.textContent='Native '+i;entry.style.cssText='position:fixed;left:'+(30+i*85)+'px;top:300px;z-index:2147483600';entry.onclick=open;doc.body.append(entry);return{getOrigin:()=>entry,dispose(){entry.onclick=null;entry.remove();}};},open(l){nativeLease=l;panel.hidden=!panel.hidden;panel.inert=false;panel.focus();},release(){},ownsEvent(){return false;}};
    if(hub.apiVersion===1)a.registerShortcutLauncher({mount:({open})=>provider.mount({open,signal:a.signal})});
    a.registerNativeWindow(provider);
    a.onCleanup(()=>{doc.removeEventListener('bench:pulse',hook);panel.remove();stats.active--;stats.hooks--;});
   },open(l){surfaceLease=l;return a.showPanel(l);}};
  });if(!source.ok||(await source.ready).ok===false)throw Error('provide failed');
  h.benchApps.push({id,stats,native:()=>entry.onclick(),panel:()=>panel,async release(){await source.release();sourceLive=false;},snapshot:()=>({id,...stats,sourceLive,session:!api.signal.aborted,mount:!!entry?.isConnected,mountSignal:!!mountSignal&&!mountSignal.aborted,nativeLease:!!nativeLease?.isCurrent(),surfaceLease:!!surfaceLease?.isCurrent(),draft:panel.querySelector('textarea').value})});
 }
}
