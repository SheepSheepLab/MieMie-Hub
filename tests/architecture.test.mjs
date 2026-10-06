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

test('private motion tuning remains immutable and curves retain finite monotonic ranges',()=>{
 assert.ok(Object.isFrozen(LAUNCHER_TUNING));assert.ok(Object.isFrozen(SURFACE_TUNING));
 assert.ok(LAUNCHER_TUNING.hubScale>1);assert.ok(LAUNCHER_TUNING.edgeScaleAmount>0&&LAUNCHER_TUNING.edgeScaleAmount<1);
 assert.ok(LAUNCHER_TUNING.edgeScaleCurve>0);assert.ok(LAUNCHER_TUNING.resistanceDistance>0);assert.ok(LAUNCHER_TUNING.returnDecayMs>0);
 assert.ok(SURFACE_TUNING.contentEnterStart<SURFACE_TUNING.contentEnterEnd);assert.ok(SURFACE_TUNING.faceExitStart<SURFACE_TUNING.faceExitEnd);
});

test('responsive presentation uses named containment and explicit card areas, without scaling the page',async()=>{
 const css=await read('assets/hub-panels.css');assert.match(css,/container:extension-center \/ inline-size/);assert.match(css,/@container\(max-width:760px\)/);assert.match(css,/@container\(max-width:560px\)/);assert.match(css,/@supports not \(container-type:inline-size\)/);assert.match(css,/grid-template-areas:"heading assurance" "description actions" "footer footer"/);assert.match(css,/grid-template-areas:"heading" "assurance" "description" "actions" "footer"/);assert.match(css,/font-size:clamp\(15px/);assert.doesNotMatch(css,/transform:scale/);
 for(const name of ['mm-catalog-title','mm-catalog-search']){const rule=css.match(new RegExp('\\.'+name+'\\{([^}]+)'));assert.match(rule[1],/display:grid/);assert.doesNotMatch(rule[1],/flex-wrap/);}
 for(const name of ['mm-catalog-links','mm-catalog-footer','mm-catalog-details']){
  const rule=css.match(new RegExp('\\.'+name+'\\{([^}]+)'))[1];
  assert.match(rule,/display:flex/);assert.match(rule,/align-items:center/);assert.match(rule,/flex-wrap:wrap/);
 }
});
