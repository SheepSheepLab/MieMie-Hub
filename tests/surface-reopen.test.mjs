import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createSurfaceController} from '../src/surface-controller.js';
function fixture(t){
 const dom=new JSDOM('<body><div id="shell"></div><div id="menu"><button id="icon">Icon</button></div><button id="orb">Orb</button><button id="native">Native</button><section id="panel" tabindex="-1"><span hidden>Business state</span></section>',{url:'https://reopen.invalid'}),host=dom.window,doc=host.document,get=id=>doc.getElementById(id),panel=get('panel'),root=get('menu'),errors=[];host.matchMedia=()=>({matches:true});root.hidden=panel.hidden=true;
 let runs=0,broken=false;const nativeRect={left:'80px',top:'120px',width:'372px',height:'640px'},hubRect={left:'400px',top:'40px',width:'600px',height:'700px'};
 const provider={available:()=>true,place(p){if(broken)throw Error('native placement fault');Object.assign(p.style,{position:'fixed',...nativeRect});},run(){runs++;},cancel(){},release(){}};
 const launcher={originRect:()=>null,originElement:()=>get('icon'),capture:()=>({element:get('icon')}),resume(){root.inert=false;},suspend(){root.inert=true;},async open(){root.hidden=false;},async close(){root.hidden=true;},highlight(){}};
 const entry={panel,owner:'app'},controller=createSurfaceController({host,shell:{root:get('shell'),orb:get('orb')},root,launcher,panels:[panel],resolve:k=>k==='panel'?entry:null,place(){if(!controller.placeNative(panel))Object.assign(panel.style,{position:'fixed',...hubRect});},onState(){},onError:e=>errors.push(e)});
 const shortcut={kind:'shortcut',presentation:provider,rect:{left:5,top:5,width:40,height:40},element:()=>get('native'),focusElement:()=>get('native')};
 const open=kind=>controller.launch('app',()=>{panel.removeAttribute('style');return controller.go('panel');},kind==='shortcut'?shortcut:null);
 t.after(()=>{controller.dispose();dom.window.close();});return {panel,doc,root,errors,controller,open,runs:()=>runs,failPlace(){broken=true;}};
}
test('repeated native Shortcut open repairs layout reset by business open without replaying motion',async t=>{
 const f=fixture(t);await f.open('shortcut');assert.equal(f.panel.style.position,'fixed');for(let n=0;n<3;n++){await f.open('shortcut');assert.equal(f.panel.style.position,'fixed');assert.equal(f.panel.style.width,'372px');assert.equal(f.panel.style.height,'640px');assert.equal(f.panel.hidden,false);assert.equal(f.panel.inert,false);assert.equal(f.panel.dataset.surfaceState,'open');assert.equal(f.panel.firstChild.hidden,true);}assert.equal(f.runs(),1);assert.deepEqual(f.errors,[]);await f.controller.close('panel');assert.equal(f.doc.activeElement,f.doc.getElementById('native'));
});
test('repeated opens retain first entrance geometry and return focus in both directions',async t=>{
 const f=fixture(t);for(const first of ['honeycomb','shortcut']){await f.open(first);await f.open(first==='shortcut'?'honeycomb':'shortcut');assert.equal(f.panel.style.width,first==='shortcut'?'372px':'600px');assert.equal(f.panel.style.left,first==='shortcut'?'80px':'400px');await f.controller.close('panel');assert.equal(f.doc.activeElement,f.doc.getElementById(first==='shortcut'?'native':'icon'));}assert.deepEqual(f.errors,[]);
});
test('native place failure on repeated open uses existing fallback and leaves Surface usable',async t=>{
 const f=fixture(t);await f.open('shortcut');f.failPlace();await f.open('shortcut');assert.equal(f.errors.length,1);assert.match(f.errors[0].message,/native placement fault/);assert.equal(f.panel.style.position,'fixed');assert.equal(f.panel.style.width,'600px');assert.equal(f.panel.hidden,false);assert.equal(f.panel.inert,false);await f.controller.close('panel');assert.equal(f.panel.hidden,true);
});
