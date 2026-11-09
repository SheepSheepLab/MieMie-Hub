import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {HUB_PRODUCT} from '../src/product-identity.js';
import {HUB_COPY} from '../src/ui-copy.js';
import {LAUNCHER_TUNING,SURFACE_TUNING} from '../src/motion-tuning.js';
import {createHubRoot} from '../src/hub-root.js';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('current product labels and fixed identity semantics have one source, historical detector remains compatible',async()=>{
 assert.ok(Object.isFrozen(HUB_PRODUCT));assert.ok(Object.isFrozen(HUB_COPY.account));assert.ok(Object.isFrozen(HUB_COPY.classification));
 for(const name of await readdir(new URL('../src/',import.meta.url))){
  if(!name.endsWith('.js')||['product-identity.js','hub-script-host.js'].includes(name))continue;
  const text=await read('src/'+name);assert.doesNotMatch(text,/咩咩Hub|MieMie Hub/,name);
  if(name!=='ui-copy.js')assert.doesNotMatch(text,/['"](?:🐑官方扩展|🧩社区扩展|普通用户|管理员|受限用户)['"]/,name);
 }
 const runtime=await read('src/extension-runtime.js');assert.match(runtime,/factory\(api\)/);assert.doesNotMatch(runtime,/\.animate\(|createSurfaceController|createHoneycombLauncher|style\.textContent/);
 for(const file of ['surface-controller.js','surface-motion.js','honeycomb-launcher.js'])assert.doesNotMatch(await read('src/'+file),/createRegistryClient|installPackage|classification|session\.record/);
});

test('legacy Dock key still restores the saved edge and position through borrow/release',async()=>{
 const dom=new JSDOM('<!doctype html>',{url:'https://fixture.invalid'}),host=dom.window;
 host.localStorage.setItem('meeme_timeline_dock_v1',JSON.stringify({side:'left',ratio:.3}));
 const shell=createHubRoot(host,{shellStyles:'',orbHTML:await read('assets/orb.html'),icons:{home:'data:image/png;base64,AA=='}});
 const before=shell.getDock();assert.equal(before.x,10);assert.equal(before.y,10+.3*(host.innerHeight-84));
 const holder=host.document.createElement('div');shell.root.append(holder);shell.borrowOrb(holder);shell.releaseOrb();
 assert.deepEqual(shell.getDock(),before);assert.equal(JSON.parse(host.localStorage.getItem('meeme_timeline_dock_v1')).ratio,.3);
 shell.dispose();dom.window.close();
});

test('tucked Dock keeps pointer intent separate and cancels the hold timer across viewport changes',async t=>{
 const dom=new JSDOM('<!doctype html>',{url:'https://fixture.invalid'}),host=dom.window;
 const visual=host.visualViewport=Object.assign(new host.EventTarget(),{width:390,height:730,offsetLeft:0,offsetTop:0});
 host.localStorage.setItem('meeme_timeline_dock_v1',JSON.stringify({side:'left',ratio:.3}));
 const shell=createHubRoot(host,{shellStyles:'',orbHTML:await read('assets/orb.html'),icons:{home:'data:image/png;base64,AA=='}});
 t.after(()=>{shell.dispose();host.close();});
 let time=0,serial=0,opens=0;
 const tasks=new Map();
 host.setTimeout=(fn,ms)=>{const id=++serial;tasks.set(id,{fn,at:time+ms});return id;};
 host.clearTimeout=id=>tasks.delete(id);
 const advance=ms=>{time+=ms;for(const [id,task]of tasks)if(task.at<=time){tasks.delete(id);task.fn();}};
 const event=(type,x,y,pointerType='touch')=>{
  const e=new host.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,detail:1});
  Object.defineProperties(e,{pointerId:{value:1},isPrimary:{value:true},pointerType:{value:pointerType}});
  shell.orb.dispatchEvent(e);return e;
 };
 shell.connect({onToggle:()=>{opens++;},beforeMove:()=>{},onPosition:()=>{}});
 shell.setOrbAppearance({size:150,tucked:true});
 assert.equal(shell.getDock().size,96);assert.equal(shell.getDock().x,-48);
 event('pointerenter',8,200,'mouse');assert.equal(shell.orb.hasAttribute('data-dock-hover'),true);
 advance(900);assert.equal(shell.orb.hasAttribute('data-dock-gesture'),false);
 event('pointerdown',8,200,'mouse');event('pointerup',8,200,'mouse');event('click',8,200,'mouse');
 assert.equal(opens,0);assert.equal(shell.orb.hasAttribute('data-dock-peek'),true);
 advance(640);assert.equal(shell.orb.hasAttribute('data-dock-hover'),true);
 event('pointerleave',8,200,'mouse');assert.equal(shell.orb.hasAttribute('data-dock-hover'),false);
 shell.orb.click();assert.equal(opens,1);
 event('pointerdown',8,200);event('pointerup',8,200);event('click',8,200);
 assert.equal(opens,1);assert.equal(shell.orb.hasAttribute('data-dock-peek'),true);advance(640);
 assert.equal(shell.orb.hasAttribute('data-dock-peek'),false);
 event('pointerdown',8,200);event('pointermove',8,250);advance(900);event('pointerup',8,250);
 assert.equal(opens,1);assert.equal(shell.getDock().direction,1);
 const shape=shell.root.querySelector('.mm-dock-pull'),path=shape.querySelector('path');
 event('pointerdown',8,200);event('pointermove',22,200);
 assert.equal(shape.hasAttribute('hidden'),false);
 assert.match(path.getAttribute('d'),/^M 0 /);
 const tip=path.getAttribute('d').split('C')[1].trim().split(/\s+/).slice(-2).map(Number);
 assert.deepEqual(tip,[parseFloat(shell.orb.style.left)+48,parseFloat(shell.orb.style.top)+48]);
 assert.equal(shell.orb.hasAttribute('data-dock-ready'),false);
 event('pointermove',42,204);assert.equal(shape.hasAttribute('data-ready'),true);
 event('pointermove',58,224);
 assert.equal(parseFloat(shell.orb.style.left)+48,50);
 assert.equal(parseFloat(shell.orb.style.top)+48,tip[1],'pull stays on its horizontal axis');
 event('pointermove',150,204);
 assert.equal(parseFloat(shell.orb.style.left)+48,58);
 event('pointermove',42,260);assert.equal(shell.orb.hasAttribute('data-dock-ready'),false);
 event('pointermove',42,204);event('pointerup',42,204);
 assert.equal(shell.orb.hasAttribute('data-dock-ready'),false);
 assert.equal(shape.hasAttribute('hidden'),true);
 assert.equal(opens,2);await Promise.resolve();
 const holder=host.document.createElement('div');shell.root.append(holder);shell.borrowOrb(holder);
 event('pointerdown',190,200);event('pointerup',190,200);event('click',190,200);
 assert.equal(opens,3);shell.releaseOrb();
 event('pointerdown',8,200,'mouse');event('pointermove',11,202,'mouse');
 advance(899);assert.notEqual(shell.orb.dataset.dockGesture,'grabbed');
 advance(1);assert.equal(shell.orb.dataset.dockGesture,'grabbed');
 assert.equal(parseFloat(shell.orb.style.left)+48,11);assert.equal(parseFloat(shell.orb.style.top)+48,202);
 event('pointermove',10,203,'mouse');
 assert.equal(parseFloat(shell.orb.style.left)+48,10);assert.equal(parseFloat(shell.orb.style.top)+48,203);
 event('pointermove',360,510,'mouse');event('pointerup',360,510,'mouse');event('click',360,510,'mouse');
 assert.equal(opens,3);assert.equal(shell.getDock().direction,-1);
 assert.equal(JSON.parse(host.localStorage.getItem('meeme_timeline_dock_v1')).side,'right');
 event('pointerdown',375,510);advance(899);
 assert.notEqual(shell.orb.dataset.dockGesture,'grabbed');
 advance(1);assert.equal(shell.orb.dataset.dockGesture,'grabbed');
 assert.equal(parseFloat(shell.orb.style.left)+48,375);
 event('pointerup',375,510);assert.equal(parseFloat(shell.orb.style.left)+48,390);
 event('pointerdown',375,510);event('pointermove',340,510);
 assert.match(path.getAttribute('d'),/^M 390 /);
 event('pointercancel',340,510);
 assert.equal(shape.hasAttribute('hidden'),true);assert.equal(opens,3);
 event('pointerdown',375,510);visual.height=500;visual.dispatchEvent(new host.Event('resize'));advance(900);
 assert.equal(shell.orb.hasAttribute('data-dock-gesture'),false);assert.equal(tasks.size,0);
 assert.ok(shell.getDock().y+shell.getDock().size<=490);
 event('pointerdown',375,380,'mouse');event('pointermove',340,381,'mouse');event('pointerup',340,381,'mouse');event('click',340,381,'mouse');
 assert.equal(opens,4);
 shell.setOrbAppearance({tucked:false});
 event('pointerdown',350,380,'mouse');event('pointerup',350,380,'mouse');event('click',350,380,'mouse');
 assert.equal(opens,5);
});

test('private motion tuning remains immutable and curves retain finite monotonic ranges',()=>{
 assert.ok(Object.isFrozen(LAUNCHER_TUNING));assert.ok(Object.isFrozen(SURFACE_TUNING));
 assert.ok(LAUNCHER_TUNING.hubScale>1);assert.ok(LAUNCHER_TUNING.edgeScaleAmount>0&&LAUNCHER_TUNING.edgeScaleAmount<1);
 assert.ok(LAUNCHER_TUNING.edgeScaleCurve>0);assert.ok(LAUNCHER_TUNING.resistanceDistance>0);assert.ok(LAUNCHER_TUNING.returnDecayMs>0);
 assert.ok(SURFACE_TUNING.contentEnterStart<SURFACE_TUNING.contentEnterEnd);assert.ok(SURFACE_TUNING.faceExitStart<SURFACE_TUNING.faceExitEnd);
});

test('responsive presentation contains catalog rows, their action slots and details without scaling the page',async()=>{
 const css=await read('assets/hub-panels.css');assert.match(css,/container:extension-center \/ inline-size/);assert.match(css,/@container extension-center \(max-width:600px\)/);assert.match(css,/@container\(max-width:560px\)/);assert.match(css,/@supports not \(container-type:inline-size\)/);assert.match(css,/font-size:clamp\(15px/);assert.doesNotMatch(css,/transform:scale/);
 for(const name of ['mm-catalog-title','mm-catalog-search','mm-catalog-row','mm-catalog-facts']){
  const rule=css.match(new RegExp('\\.'+name+'\\{([^}]+)'))[1];
  assert.match(rule,/display:grid/);assert.doesNotMatch(rule,/flex-wrap/);
 }
 assert.match(css,/\.mm-catalog-row-open\{position:absolute;inset:0/);
 assert.match(css,/\.mm-catalog-row-actions>:is\(button,a,span\)\{[^}]*height:var\(--catalog-action-height\)/);
});
