// Additional, dynamically-created business interactions. No Core dependencies.
export function installDeepBusiness(scope){
 const h=scope.parent,d=h.document,life=new h.AbortController();let epoch=0;
 const control={events:[],stages:0,cleanup:null};
 control.add=()=>{
  control.cleanup?.();const panel=d.querySelector('[data-native-parity-panel]');if(!panel)throw Error('business panel absent');const own=new h.AbortController(),nodes=[];
  const on=(n,t,f,o={})=>n.addEventListener(t,f,{...o,signal:own.signal});
  const stage=d.createElement('div');stage.dataset.deepStage='';stage.style.cssText='height:160px;overflow:auto;background:rgb(231,242,239);color:rgb(30,40,50)';stage.innerHTML='<button data-deep-add>Add dynamic view</button><button data-deep-save>Persist</button><div data-deep-views></div><input data-deep-input aria-label="Deep input"><iframe title="Deep same-origin frame" style="width:260px;height:65px"></iframe><div style="height:300px">Scrollable tail</div>';panel.append(stage);nodes.push(stage);
  const events=control.events=[];const record=label=>e=>events.push({label,type:e.type,key:e.key||'',composing:!!e.isComposing,prevented:e.defaultPrevented,trusted:e.isTrusted});
  const input=stage.querySelector('[data-deep-input]');for(const type of ['keydown','keyup','input','compositionstart','compositionupdate','compositionend','pointerdown','click','dblclick','contextmenu']){on(input,type,record('target'));}on(stage,'keydown',record('capture'),{capture:true});on(stage,'keydown',record('bubble'));
  on(input,'contextmenu',e=>e.preventDefault());on(stage.querySelector('[data-deep-add]'),'click',()=>{const view=d.createElement('details');view.open=true;view.innerHTML='<summary>Dynamic view</summary><button data-deep-menu>New menu path</button><output>0</output>';stage.querySelector('[data-deep-views]').append(view);on(view.querySelector('button'),'click',()=>{const output=view.querySelector('output');output.textContent=String(Number(output.textContent)+1);});});
  on(stage.querySelector('[data-deep-save]'),'click',()=>h.localStorage.setItem('phase5_deep_fixture_draft',input.value));
  const frame=stage.querySelector('iframe');frame.srcdoc='<input aria-label="Frame draft"><button>Frame action</button><output>0</output><script>window.trace=[];for(const t of ["keydown","input","compositionstart","compositionend"])document.addEventListener(t,e=>trace.push({type:t,key:e.key||"",trusted:e.isTrusted}));document.querySelector("button").onclick=()=>{document.querySelector("output").textContent=Number(document.querySelector("output").textContent)+1};<\/script>';
  const shadow=d.createElement('aside');shadow.dataset.deepShadow='';stage.append(shadow);const sr=shadow.attachShadow({mode:'closed'});sr.innerHTML='<input aria-label="Deep shadow"><button>Shadow action</button>';control.shadowInput=sr.querySelector('input');on(control.shadowInput,'keydown',record('closed-shadow'));
  control.stage=stage;control.frame=frame;control.stages++;
  control.animate=()=>{const my=++epoch;const a=stage.animate([{opacity:.5},{opacity:1}],{duration:180});return a.finished.then(()=>{if(my===epoch)stage.dataset.animation='finished';},()=>{});};
  control.cleanup=()=>{epoch++;own.abort();for(const a of stage.getAnimations())a.cancel();for(const n of nodes)n.remove();control.stage=null;};
  return true;
 };
 control.snapshot=()=>{const s=control.stage,r=s.getBoundingClientRect(),style=h.getComputedStyle(s);return{html:s.innerHTML,input:s.querySelector('input').value,rect:{width:r.width,height:r.height},style:{display:style.display,overflow:style.overflow,background:style.backgroundColor,color:style.color},views:s.querySelectorAll('details').length,actions:[...s.querySelectorAll('output')].map(x=>x.value),scroll:s.scrollTop,shadow:control.shadowInput.value,frameValue:control.frame.contentDocument.querySelector('input')?.value,frameOutput:control.frame.contentDocument.querySelector('output')?.value,frameTrace:control.frame.contentWindow.trace,persisted:h.localStorage.getItem('phase5_deep_fixture_draft'),events:[...control.events]};};
 h.phase5Deep=control;const stop=()=>{control.cleanup?.();life.abort();if(h.phase5Deep===control)delete h.phase5Deep;};scope.addEventListener('pagehide',stop,{once:true});
}
