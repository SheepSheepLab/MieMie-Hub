import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createHubRoot} from '../src/hub-root.js';
import {createHoneycombLauncher,honeycombLayout,honeycombScale,honeycombPosition,honeycombResistance} from '../src/honeycomb-launcher.js';

function fixture(t,{width=390,height=740,reduced=false}={}) {
 const dom=new JSDOM('<!doctype html>',{url:'https://fixture.invalid'}),host=dom.window,doc=host.document;
 Object.defineProperties(host,{innerWidth:{value:width,writable:true},innerHeight:{value:height,writable:true}});
 host.matchMedia=()=>({matches:reduced});
 const frames=new Map();let sequence=0,time=0;
 host.requestAnimationFrame=fn=>{frames.set(++sequence,fn);return sequence;};host.cancelAnimationFrame=id=>frames.delete(id);
 host.localStorage.setItem('meeme_timeline_dock_v1',JSON.stringify({side:'left',ratio:.31}));
 const shell=createHubRoot(host,{shellStyles:'',orbHTML:'<button class="ts-orb"><img></button>',icons:{home:'test.png'}});
 const root=doc.createElement('div');shell.root.append(root);
 const launcher=createHoneycombLauncher({host,root,shell,title:'Applications'});
 function items(n){launcher.setItems(Array.from({length:n},(_,i)=>{const b=doc.createElement('button');b.dataset.hubApp='test.'+i;b.textContent='Test '+i;return b;}));}
 function flush(n=1){for(let i=0;i<n;i++){time+=16;const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(time));}}
 function pointer(type,x,y,kind='mouse',target=root.querySelector('.mm-honeycomb-scroll')){const e=new host.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:1,clientX:x,clientY:y,pointerType:kind,button:0});target.dispatchEvent(e);return e;}
 t.after(()=>{launcher.dispose();shell.dispose();assert.equal(frames.size,0);dom.window.close();});
 items(20);return {host,doc,shell,root,launcher,items,flush,pointer,scroll:root.querySelector('.mm-honeycomb-scroll')};
}
test('reference diamond extends staggered columns for mobile and desktop without overlap',()=>{
 for(const width of [320,375,390,430,1440])for(const count of [1,5,9,20,61]){
  const g=honeycombLayout(count,width);
  assert.equal(g.items.length,count);assert.equal(g.items[0].x,0);for(const row of new Set(g.items.map(p=>p.row)))assert.ok(g.items.filter(p=>p.row===row).length<=2);
  for(const p of g.items)assert.ok(Math.abs(p.x)+g.size/2<width/2);
  assert.equal(new Set(g.items.map(p=>p.x+','+p.y)).size,count);
  for(const [i,a]of g.items.entries())for(const [j,b]of g.items.entries())if(j>i)assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>g.size*1.18);
 }
 const g=honeycombLayout(7,1280),hub=g.items[0];
 assert.deepEqual(g.items.map(p=>[p.x,p.y-hub.y]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]),[[0,-144],[-125,-72],[125,-72],[0,0],[-125,72],[125,72],[0,144]]);
});
test('continuous scale shrinks toward either edge without a disappearance threshold',()=>{
 let previous=1;for(let y=0;y<=400;y+=.1){const s=honeycombScale(y,800);assert.ok(s<=previous+1e-12);assert.ok(previous-s<.001);assert.ok(s>=.479);assert.equal(s,honeycombScale(-y,800));previous=s;}
 assert.equal(honeycombScale(0,800),1);assert.ok(honeycombScale(400,800)>.47);
});
test('initial Hub is centered in the same native scrolling canvas, then moves with it',async t=>{
 const f=fixture(t);await f.launcher.open();const cell=f.shell.orb.parentElement;
 assert.ok(cell.matches('[data-hub-cell]'));assert.ok(Math.abs(parseFloat(cell.style.top)+parseFloat(cell.style.height)/2-f.scroll.scrollTop-370)<1e-8);
 const before=cell.style.transform;f.scroll.scrollTop+=140;f.scroll.dispatchEvent(new f.host.Event('scroll'));f.flush();
 assert.notEqual(cell.style.transform,before);assert.ok(Math.abs(parseFloat(cell.style.top)+parseFloat(cell.style.height)/2-f.scroll.scrollTop-230)<1e-8);
});
test('mouse vertical drag and resisted X return to center, with no click after dragging',async t=>{
 const f=fixture(t);await f.launcher.open();const start=f.scroll.scrollTop;f.pointer('pointerdown',100,250);f.pointer('pointermove',180,180);f.flush();
 assert.equal(f.scroll.scrollTop,start+70);assert.match(f.shell.orb.parentElement.style.transform,/translateX\(21\.33px\)/);
 f.pointer('pointerup',180,180);f.flush(50);assert.match(f.shell.orb.parentElement.style.transform,/translateX\(0\.00px\)/);
 const click=new f.host.MouseEvent('click',{bubbles:true,cancelable:true,detail:1});f.scroll.dispatchEvent(click);assert.equal(click.defaultPrevented,true);
 assert.ok(Math.abs(honeycombResistance(10000))<64);
});
test('touch does not prevent native Y scrolling; pointer cancellation releases X',async t=>{
 const f=fixture(t);await f.launcher.open();const start=f.scroll.scrollTop;f.pointer('pointerdown',100,200,'touch');const move=f.pointer('pointermove',140,100,'touch');f.flush();assert.equal(move.defaultPrevented,false);assert.equal(f.scroll.scrollTop,start);
 f.scroll.scrollTop+=100;f.scroll.dispatchEvent(new f.host.Event('scroll'));f.pointer('pointercancel',140,100,'touch');f.flush(50);assert.match(f.shell.orb.parentElement.style.transform,/translateX\(0\.00px\)/);
});
test('closing and reopening preserve the original dock and use exactly one actual Hub orb',async t=>{
 const f=fixture(t);const style=f.shell.orb.getAttribute('style'),saved=f.host.localStorage.getItem('meeme_timeline_dock_v1');
 for(let i=0;i<8;i++){await f.launcher.open();f.scroll.scrollTop+=100;await f.launcher.close();assert.equal(f.shell.orb.parentElement,f.shell.root);assert.equal(f.root.hidden,true);assert.equal(f.doc.querySelectorAll('.ts-orb').length,1);assert.equal(f.shell.orb.getAttribute('style'),style);assert.equal(f.host.localStorage.getItem('meeme_timeline_dock_v1'),saved);}
});
test('dynamic launcher replacement keeps Hub, count, and keyboard focus without duplicate nodes',async t=>{
 const f=fixture(t);await f.launcher.open();f.root.querySelector('[data-hub-app="test.2"]').focus();f.items(40);assert.equal(f.root.querySelectorAll('.mm-honeycomb-cell').length,41);assert.equal(f.doc.activeElement.dataset.hubApp,'test.2');f.items(2);assert.equal(f.root.querySelectorAll('.mm-honeycomb-cell').length,3);assert.equal(f.doc.querySelectorAll('.ts-orb').length,1);await f.launcher.close();
});
test('reduced motion skips flights and immediately recenters elastic X',async t=>{
 const f=fixture(t,{reduced:true});f.host.Element.prototype.animate=()=>{throw Error('Should not animate');};await f.launcher.open();f.pointer('pointerdown',20,100);f.pointer('pointermove',100,100);f.flush();f.pointer('pointerup',100,100);f.flush();assert.match(f.shell.orb.parentElement.style.transform,/translateX\(0\.00px\)/);await f.launcher.close();
});
test('Dock dragging is suspended in Launcher and remains available after closing',async t=>{
 const f=fixture(t);const saved=f.host.localStorage.getItem('meeme_timeline_dock_v1');await f.launcher.open();f.pointer('pointerdown',20,100,'touch',f.shell.orb);f.pointer('pointermove',100,200,'touch',f.shell.orb);f.pointer('pointerup',100,200,'touch',f.shell.orb);assert.equal(f.host.localStorage.getItem('meeme_timeline_dock_v1'),saved);await f.launcher.close();f.pointer('pointerdown',20,100,'mouse',f.shell.orb);f.pointer('pointermove',350,250,'mouse',f.shell.orb);f.pointer('pointerup',350,250,'mouse',f.shell.orb);assert.equal(JSON.parse(f.host.localStorage.getItem('meeme_timeline_dock_v1')).side,'right');
});

test('keyboard focus reveals offscreen applications, pointer focus never shifts a tap target',async t=>{
 const f=fixture(t);f.items(50);await f.launcher.open();const last=f.root.querySelector('[data-hub-app="test.49"]');
 const before=f.scroll.scrollTop;f.pointer('pointerdown',100,700,'touch',last);last.focus();assert.equal(f.scroll.scrollTop,before);f.pointer('pointerup',100,700,'touch',last);
 f.shell.orb.focus();last.focus();assert.notEqual(f.scroll.scrollTop,before,'keyboard traversal reveals focused cell in either scroll direction');assert.equal(f.scroll.scrollTop,parseFloat(last.parentElement.style.top)+parseFloat(last.parentElement.style.height)/2-370);
});

test('interrupted animated open/close and dynamic refresh settle without losing the real orb',async t=>{
 const f=fixture(t);const pending=new Set();
 f.host.Element.prototype.animate=function(){let finish;const a={finished:new Promise(resolve=>{finish=resolve;}),cancel(){pending.delete(a);finish();}};pending.add(a);return a;};
 const opening=f.launcher.open();const closing=f.launcher.close();const reopening=f.launcher.open();
 for(const a of [...pending])a.cancel();await Promise.all([opening,closing,reopening]);assert.equal(f.root.dataset.open,'true');assert.equal(f.root.hidden,false);assert.ok(f.shell.orb.parentElement.matches('[data-hub-cell]'));
 const finalClose=f.launcher.close();f.items(5);for(let i=0;i<8;i++){for(const a of [...pending])a.cancel();await Promise.resolve();}await finalClose;assert.equal(f.root.hidden,true);assert.equal(f.shell.orb.parentElement,f.shell.root);assert.equal(f.doc.querySelectorAll('.ts-orb').length,1);assert.equal(pending.size,0);
});

test('edge icons remain large enough to indicate more content while scaling smoothly',async t=>{
 const f=fixture(t);await f.launcher.open();const cell=f.shell.orb.parentElement,center=cell.style.transform;
 f.scroll.scrollTop+=370;f.scroll.dispatchEvent(new f.host.Event('scroll'));f.flush();assert.notEqual(cell.style.transform,center);assert.ok(honeycombScale(370,740)>=.48);assert.ok(honeycombScale(300,740)>honeycombScale(370,740));
});

test('pressing a moving icon does not cancel its flight and teleport the click target',async t=>{
 const f=fixture(t);const pending=new Set();let cancelled=0,clicked=0;
 f.host.Element.prototype.animate=function(){let finish;const a={finished:new Promise(resolve=>{finish=resolve;}),cancel(){cancelled++;pending.delete(a);finish();}};pending.add(a);return a;};
 const opening=f.launcher.open(),button=f.root.querySelector('[data-hub-app="test.0"]');button.onclick=()=>clicked++;
 f.pointer('pointerdown',100,200,'mouse',button);assert.equal(cancelled,0,'a press must not snap the moving icon to its final position');
 f.pointer('pointerup',100,200,'mouse',button);button.dispatchEvent(new f.host.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));assert.equal(clicked,1);
 f.pointer('pointerdown',100,200,'mouse',button);f.pointer('pointermove',125,210,'mouse',button);assert.ok(cancelled>0,'actual dragging takes over the canvas');f.pointer('pointerup',125,210,'mouse',button);
 for(const a of [...pending])a.cancel();await opening;
});


test('position compression follows the scale curve continuously, preserves ordering and packs edge rows',()=>{
 for(const height of [640,844]){
  let previous=0;
  for(let d=0;d<height*2;d+=1){const p=honeycombPosition(d,height);assert.ok(p>=previous);assert.equal(p,-honeycombPosition(-d,height)||0);assert.ok(Math.abs(honeycombPosition(d+.01,height)-p-.01*honeycombScale(d,height))<.00001);previous=p;}
  const edge=height/2;assert.ok(honeycombPosition(edge,height)<edge*.81);assert.ok(honeycombPosition(edge+72,height)-honeycombPosition(edge,height)<36);assert.ok(honeycombPosition(height*2,height)>height/2);
 }
});
test('B opens from the center with an immediate Hub title; released close motion returns to Dock',async t=>{
 const f=fixture(t),pending=new Set(),calls=[];
 f.shell.orb.getBoundingClientRect=()=>({left:18,top:200,width:64,height:64});
 f.host.Element.prototype.animate=function(frames,options){let finish;const a={finished:new Promise(r=>finish=r),cancel(){pending.delete(a);finish();}};calls.push({el:this,frames,options});pending.add(a);return a;};
 async function settle(){for(let i=0;i<16;i++){for(const a of [...pending])a.cancel();await Promise.resolve();}}
 const opening=f.launcher.open();const child=calls.find(c=>c.el.querySelector('[data-hub-app]')),p=child.el;
 const shift=child.frames[0].transform.match(/translate\(([-.\d]+)px,([-.\d]+)px\)/);assert.ok(shift);
 assert.equal(parseFloat(p.style.left)+parseFloat(p.style.width)/2+Number(shift[1]),195);
 assert.equal(parseFloat(p.style.top)+parseFloat(p.style.height)/2-f.scroll.scrollTop+Number(shift[2]),370);
 const wave=calls.find(c=>c.el.classList.contains('mm-launcher-ripple'));assert.ok(wave);assert.equal(wave.frames.at(-1).opacity,0);assert.match(wave.frames.at(-1).transform,/scale\(3.9\)/);
 const main=calls.find(c=>c.el.matches('[data-hub-cell]'));assert.equal(main.frames[0].transform,main.frames.at(-1).transform,'Hub appears at center instead of flying from dock');
 assert.equal(main.frames[0].opacity,1);assert.equal(main.frames.at(-1).opacity,1);
 const title=f.root.querySelector('.mm-hub-launcher-label');assert.equal(title.style.opacity,'1');assert.equal(title.style.transform,'translate(-50%,0) scale(1)');assert.ok(!calls.some(c=>c.el===title),'no independent title reveal');
 await settle();await opening;calls.length=0;
 const dock=f.shell.getDock();
 const closing=f.launcher.close(),label=f.root.querySelector('.mm-hub-launcher-label');assert.equal(label.style.opacity,'0');assert.match(label.style.transform,/scale\(0?\.05\)/);
 const hubFlight=calls.find(c=>c.el.matches('[data-hub-cell]'));assert.ok(hubFlight,'the real Hub flies back to its Dock');
 assert.equal(hubFlight.options.duration,440);assert.equal(hubFlight.options.delay,0);assert.equal(hubFlight.options.easing,'linear');assert.equal(hubFlight.frames.length,25);assert.equal(hubFlight.frames.at(-1).opacity,1);
 const point=(c,frame)=>{const xy=frame.transform.match(/translate\(([-.\d]+)px,([-.\d]+)px\)/);return {x:parseFloat(c.el.style.left)+parseFloat(c.el.style.width)/2+Number(xy[1]),y:parseFloat(c.el.style.top)+parseFloat(c.el.style.height)/2-f.scroll.scrollTop+Number(xy[2])};};
 const end=point(hubFlight,hubFlight.frames.at(-1));assert.equal(end.x,dock.x+dock.size/2);assert.equal(end.y,dock.y+dock.size/2);
 const start=point(hubFlight,hubFlight.frames[0]),half=point(hubFlight,hubFlight.frames[12]);assert.equal(half.x,(start.x+end.x)/2);assert.equal(half.y,(start.y+end.y)/2);
 for(const c of calls.filter(c=>c.el.querySelector('[data-hub-app]'))){assert.equal(c.options.duration,440);assert.equal(c.options.delay,0);assert.equal(c.frames.length,25);assert.equal(c.frames.at(-1).opacity,0,'children collect into the moving Hub');const target=point(c,c.frames.at(-1));assert.ok(Math.abs(target.x-end.x)<1e-8&&Math.abs(target.y-end.y)<1e-8);assert.ok(Math.abs(Number(c.frames.at(-1).transform.match(/scale\(([^)]+)\)/)[1])-.04)<1e-8);}
 assert.equal(calls.filter(c=>c.el.matches('[data-hub-cell]')).length,1);
 assert.ok(calls.filter(c=>c.el.querySelector('[data-hub-app]')).every(c=>c.frames.at(-1).opacity===0));
 await settle();await closing;assert.ok(calls.some(c=>c.el.matches('[data-hub-cell]')));assert.equal(f.shell.orb.parentElement,f.shell.root);assert.equal(f.root.hidden,true);
});

 test('reversing a closing flight starts at its visible positions, not stale inline endpoints',async t=>{
  const f=fixture(t),pending=new Set(),calls=[];
  f.host.Element.prototype.animate=function(frames,options){let finish;const a={finished:new Promise(r=>finish=r),cancel(){pending.delete(a);finish();}};pending.add(a);calls.push({el:this,frames,options});return a;};
  const settle=async()=>{for(let i=0;i<12;i++){for(const a of [...pending])a.cancel();await Promise.resolve();}};
  const opening=f.launcher.open();await settle();await opening;
  const closing=f.launcher.close();
  const cell=f.root.querySelector('[data-hub-app="test.0"]').parentElement;
  cell.getBoundingClientRect=()=>({left:90,top:170,width:42,height:42});
  calls.length=0;const reopen=f.launcher.open(),first=calls.find(c=>c.el===cell).frames[0];
  const shift=first.transform.match(/translate\(([-.\d]+)px,([-.\d]+)px\)/);
  assert.equal(parseFloat(cell.style.left)+parseFloat(cell.style.width)/2+Number(shift[1]),111);
  assert.equal(parseFloat(cell.style.top)+parseFloat(cell.style.height)/2-f.scroll.scrollTop+Number(shift[2]),191);
  await settle();await Promise.all([closing,reopen]);assert.equal(f.root.hidden,false);assert.equal(f.root.dataset.open,'true');
 });

test('Surface origins survive launcher rebuild and resume edge scroll without focus recentering',async t=>{
 const f=fixture(t);await f.launcher.open();f.scroll.scrollTop=200;
 const first=f.root.querySelector('[data-hub-app="test.0"]');first.getBoundingClientRect=()=>({left:60,top:90,width:50,height:50});
 const origin=f.launcher.capture('test.0');f.launcher.suspend();f.items(30);f.scroll.scrollTop=999;
 f.launcher.resume(origin);const restored=f.scroll.scrollTop;
 f.launcher.highlight(origin);assert.equal(f.scroll.scrollTop,restored);
 const replacement=f.root.querySelector('[data-hub-app="test.0"]');replacement.getBoundingClientRect=()=>({left:120,top:80,width:40,height:40});
 assert.deepEqual(f.launcher.originRect(origin),{left:120,top:80,width:40,height:40});assert.notEqual(replacement,origin.element);
 replacement.getBoundingClientRect=()=>({left:0,top:0,width:0,height:0});assert.deepEqual(f.launcher.originRect(origin),origin.rect);
 replacement.remove();assert.deepEqual(f.launcher.originRect(origin),origin.rect);
 Object.assign(f.host,{innerWidth:35,innerHeight:40});
 assert.deepEqual(f.launcher.originRect(origin),{left:0,top:0,width:35,height:40});
 assert.equal(f.launcher.originRect({...origin,rect:null}),null);
});
