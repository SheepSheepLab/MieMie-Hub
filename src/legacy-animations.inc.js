 function cancelAnimations(){
  for(const a of animations)a.cancel();animations.clear();
  for(const [panel,splash] of splashes){splash.hidden=true;panel.querySelector('[data-tool-icon]')?.removeAttribute('data-landing');}
 }
 function collapsed(p){const r=p.getBoundingClientRect(),o=orb.getBoundingClientRect();p.style.transformOrigin=(o.left+o.width/2-r.left)+'px '+(o.top+o.height/2-r.top)+'px';return {transform:'scale(.08,.14)',opacity:0};}
 async function animate(element,frames,duration,easing,hold=false){if(!element.animate||host.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;const a=element.animate(frames,{duration,easing,fill:hold?'forwards':'none'});animations.add(a);try{await a.finished;}catch(_){}finally{if(!hold)animations.delete(a);}}
 function prepareSplash(panel,icon){
  const splash=splashes.get(panel);
  panel.querySelector('[data-tool-icon]')?.setAttribute('data-landing','');
  splash.querySelector('img').src=icon;
  const size=Math.max(1,Math.min(148,panel.clientWidth-24,panel.clientHeight-24));
  splash.style.setProperty('--mm-splash-icon-size',size+'px');
  splash.hidden=false;
  return splash;
 }
 async function landSplash(panel,splash,id){
  const flying=splash.querySelector('img'),target=panel.querySelector('[data-tool-icon]');
  if(!target||!flying.animate||host.matchMedia?.('(prefers-reduced-motion: reduce)').matches){cancelAnimations();return;}
  const from=flying.getBoundingClientRect(),to=target.getBoundingClientRect();
  if(!from.width||!from.height||!to.width||!to.height){cancelAnimations();return;}
  const dx=to.left+to.width/2-from.left-from.width/2,dy=to.top+to.height/2-from.top-from.height/2;
  const destination='translate('+dx+'px,'+dy+'px) scale('+to.width/from.width+','+to.height/from.height+')';
  const atRest={transform:'translate(0px,0px) scale(1)',filter:'drop-shadow(0 0 16px #b67bf65e)',clipPath:'circle(49%)'};
  await Promise.all([
    animate(flying,[atRest,{...atRest,offset:.16},{transform:destination,filter:'drop-shadow(0 0 0px transparent)',clipPath:'circle(71%)'}],760,'cubic-bezier(.4,0,.2,1)',true),
    animate(splash.querySelector('.mm-splash-backdrop'),[{opacity:1},{opacity:1,offset:.16},{opacity:0}],760,'ease-in-out',true)
  ]);
  if(id!==serial||disposed)return;
  // Replace the landed artwork with the header image in the same frame.
  cancelAnimations();
 }
