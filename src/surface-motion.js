import {SURFACE_TUNING} from './motion-tuning.js';

export function createSurfaceMotion({host,shell,launcher}) {
 const doc=host.document,animations=new Set(),surfaceCleanups=new Set();
 let generation=0;
 function cancelAnimations(){
  ++generation;
  for(const a of animations)a.cancel();animations.clear();
  for(const cleanup of [...surfaceCleanups])cleanup();
 }
 function motion(name){
  const theme=host.getComputedStyle(shell.root),raw=theme.getPropertyValue('--mie-motion-surface-'+name).trim();
  const duration=parseFloat(raw)*(raw.endsWith('ms')?1:1000);
  return {duration:Number.isFinite(duration)?Math.min(2000,Math.max(0,duration)):0,easing:theme.getPropertyValue('--mie-ease-surface').trim()||'ease'};
 }
 function collapsed(panel,origin){
  const r=panel.getBoundingClientRect(),o=launcher.originRect(origin);
  if(!o||!r.width||!r.height)return {transform:'translate(0,'+SURFACE_TUNING.fallbackOffset+'px) scale('+SURFACE_TUNING.fallbackScale+')',opacity:0};
  // Keep an opaque shared surface all the way to the icon; clipping also works
  // when an Extension has an !important panel border-radius of its own.
  return {transform:'translate('+(o.left-r.left)+'px,'+(o.top-r.top)+'px) scale('+o.width/r.width+','+o.height/r.height+')',opacity:1,clipPath:'inset(0 round '+(origin?.radius||'50%')+')'};
 }
 async function animate(element,frames,options){
  const a=element.animate(frames,{...options,fill:'both'});animations.add(a);
  try{await a.finished;}catch(_){}finally{a.cancel();animations.delete(a);}
 }
 function surfaceFace(panel,origin){
  const button=launcher.originElement(origin),o=launcher.originRect(origin),r=panel.getBoundingClientRect();
  if(!button||!o||!r.width||!r.height)return null;
  const art=button.querySelector('span');if(!art)return null;
  const style=host.getComputedStyle(button),artStyle=host.getComputedStyle(art);
  const face=doc.createElement('div');face.dataset.surfaceFace='';face.setAttribute('aria-hidden','true');face.inert=true;
  Object.assign(face.style,{all:'initial',position:'absolute',inset:'0',zIndex:'2147483647',display:'grid',placeItems:'center',overflow:'hidden',pointerEvents:'none',background:style.background,color:style.color});
  const source=art.querySelector('img');
  if(source){
   const image=doc.createElement('img');image.src=source.currentSrc||source.src;image.alt='';image.draggable=false;image.referrerPolicy='no-referrer';
   Object.assign(image.style,{all:'initial',display:'block',width:'100%',height:'100%',objectFit:'fill'});face.append(image);
  }else{
   const glyph=doc.createElement('span');glyph.textContent=art.textContent;
   Object.assign(glyph.style,{all:'initial',color:style.color,fontFamily:artStyle.fontFamily,fontSize:(parseFloat(artStyle.fontSize)||28)*r.width/(button.offsetWidth||o.width)+'px',lineHeight:'1',transform:'scaleY('+(o.width/r.width)/(o.height/r.height)+')'});face.append(glyph);
  }
  // Copy only the Hub-owned icon art, never Extension content or listeners.
  panel.append(face);return {face,button};
 }
 // Historical splash is prepared BEFORE the window flight: artwork is already
 // present on the first frame; only the content behind it is temporarily blurred.
 function prepareHeader(panel,target){
  const r=panel.getBoundingClientRect(),size=Math.min(148,r.width-24,r.height-24);
  if(size<=0)return null;
  const theme=host.getComputedStyle(shell.root),overlay=doc.createElement('div'),veil=doc.createElement('div'),face=doc.createElement('img');
  overlay.dataset.surfaceSplash='';overlay.setAttribute('aria-hidden','true');overlay.inert=true;
  Object.assign(overlay.style,{position:'absolute',inset:'0',zIndex:'2147483647',pointerEvents:'none',borderRadius:'inherit'});
  veil.dataset.surfaceVeil='';const blur=theme.getPropertyValue('--mie-blur-hero').trim()||'14px';
  Object.assign(veil.style,{position:'absolute',inset:'0',borderRadius:'inherit',background:theme.getPropertyValue('--mie-hero-backdrop').trim()||'#201332b8',backdropFilter:'blur('+blur+')',webkitBackdropFilter:'blur('+blur+')'});
  face.src=target.currentSrc||target.src;face.alt='';face.dataset.surfaceHero='';
  Object.assign(face.style,{position:'absolute',left:(r.width-size)/2+panel.scrollLeft+'px',top:(r.height-size)/2+panel.scrollTop+'px',width:size+'px',height:size+'px',maxWidth:'none',borderRadius:'50%',transformOrigin:'center',objectFit:'contain'});
  overlay.append(veil,face);panel.append(overlay);const visibility=target.style.visibility;target.style.visibility='hidden';let cleaned=false;
  const cleanup=()=>{if(cleaned)return;cleaned=true;overlay.remove();target.style.visibility=visibility;surfaceCleanups.delete(cleanup);};surfaceCleanups.add(cleanup);
  return {cleanup,async land(){
   if(cleaned)return;const from=face.getBoundingClientRect(),to=target.getBoundingClientRect();if(!from.width||!to.width){cleanup();return;}
   const raw=theme.getPropertyValue('--mie-motion-hero').trim(),options={duration:parseFloat(raw)*(raw.endsWith('ms')?1:1000)||0,easing:theme.getPropertyValue('--mie-ease-hero').trim()||'ease'};
   const destination=`translate(${to.left+to.width/2-from.left-from.width/2}px,${to.top+to.height/2-from.top-from.height/2}px) scale(${to.width/from.width},${to.height/from.height})`;
   try{await Promise.all([
    animate(face,[{transform:'none',clipPath:'circle(49%)'},{transform:'none',clipPath:'circle(49%)',offset:.16},{transform:destination,clipPath:'circle(71%)'}],options),
    animate(veil,[{opacity:1},{opacity:1,offset:.16},{opacity:0}],{...options,easing:'ease-in-out'}),
   ]);}finally{cleanup();}
  }};
 }
 async function surfaceMotion(panel,origin,opening){
  if(!panel.animate||host.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const epoch=generation,header=opening?panel.querySelector('[data-tool-icon]'):null;
  const children=[...panel.children],small=collapsed(panel,origin),radius=host.getComputedStyle(panel).borderRadius||'16px';
  const large={transform:'none',opacity:1,clipPath:'inset(0 round '+radius+')'},options=motion(opening?'open':'close');
  const hero=header?prepareHeader(panel,header):null;
  // A native shortcut is a persistent anchor, unlike a Honeycomb icon morph.
  // Let the page emerge/retreat behind the existing orb, never replace it with
  // a stretched copy of its artwork. Honeycomb motion is unchanged.
  if(origin?.kind==='shortcut')small.opacity=0;
  const previous=['transform-origin','overflow'].map(key=>[key,panel.style.getPropertyValue(key),panel.style.getPropertyPriority(key)]);
  panel.style.setProperty('transform-origin','0 0');panel.style.setProperty('overflow','hidden');
  const visual=hero||origin?.kind==='shortcut'?null:surfaceFace(panel,origin),visibility=visual?.button?.style.getPropertyValue('visibility'),priority=visual?.button?.style.getPropertyPriority('visibility');
  visual?.button?.style.setProperty('visibility','hidden');
  origin?.active?.(true);
  let cleaned=false;
  function cleanup(){
   if(cleaned)return;cleaned=true;visual?.face.remove();
   origin?.active?.(false);
   if(visual?.button){if(visibility)visual.button.style.setProperty('visibility',visibility,priority);else visual.button.style.removeProperty('visibility');}
   for(const [key,value,weight] of previous){if(value)panel.style.setProperty(key,value,weight);else panel.style.removeProperty(key);}
   surfaceCleanups.delete(cleanup);
  }
  surfaceCleanups.add(cleanup);
  try{
   await Promise.all([
    animate(panel,opening?[small,large]:[large,small],options),
    ...children.map(child=>animate(child,opening?[{opacity:0},{opacity:0,offset:SURFACE_TUNING.contentEnterStart},{opacity:1,offset:SURFACE_TUNING.contentEnterEnd},{opacity:1}]:[{opacity:1},{opacity:0,offset:SURFACE_TUNING.contentExitEnd},{opacity:0}],options)),
    ...(visual?[animate(visual.face,opening?[{opacity:1},{opacity:0,offset:SURFACE_TUNING.faceEnterEnd},{opacity:0}]:[{opacity:0},{opacity:0,offset:SURFACE_TUNING.faceExitStart},{opacity:1,offset:SURFACE_TUNING.faceExitEnd},{opacity:1}],options)]:[]),
   ]);
  }catch(error){hero?.cleanup();throw error;}finally{cleanup();}
  try{if(hero&&epoch===generation)await hero.land();}finally{hero?.cleanup();}
 }

 return {run:surfaceMotion,cancel:cancelAnimations};
}
