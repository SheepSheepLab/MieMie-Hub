import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createSurfaceController} from '../src/surface-controller.js';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(t){
 const dom=new JSDOM('<body><div id="shell"></div><div id="menu"><button id="icon">App</button></div><button id="hub">Hub</button><input id="outside"><section id="a" tabindex="-1"></section><section id="b" tabindex="-1"></section>',{url:'https://focus.invalid'});
 const host=dom.window,doc=host.document,get=id=>doc.getElementById(id),root=get('menu'),orb=get('hub'),icon=get('icon'),panel=get('a'),other=get('b');root.hidden=true;panel.hidden=other.hidden=true;
 const errors=[];host.matchMedia=()=>({matches:true});let focusCount=0;icon.addEventListener('focus',()=>focusCount++);
 const entries={a:{owner:'a',panel},b:{owner:'b',panel:other}},launcher={originRect:()=>null,originElement:o=>o?.element,capture:owner=>({element:get('declared')||(owner==='b'?get('b-icon')||icon:icon)}),resume(){root.inert=false;},suspend(){root.inert=true;},async open({focus=true}={}){root.hidden=false;root.inert=false;if(focus)orb.focus();},async close(){root.hidden=true;},settle(open){root.hidden=!open;},highlight(o,{focus=true}={}){if(focus)o?.element?.focus();}};
 const controller=createSurfaceController({host,shell:{root:get('shell'),orb},root,launcher,panels:[panel,other],resolve:k=>entries[k],place(){},onState(){},onError:e=>errors.push(e)});
 const counts=new Map(),add=doc.addEventListener.bind(doc),remove=doc.removeEventListener.bind(doc);
 doc.addEventListener=(type,fn,...rest)=>{if(['focusin','pointerdown','keydown'].includes(type))counts.set(fn,type);add(type,fn,...rest);};doc.removeEventListener=(type,fn,...rest)=>{counts.delete(fn);remove(type,fn,...rest);};
 t.after(()=>{controller.dispose();assert.equal(counts.size,0);dom.window.close();});
 return {errors,host,doc,get,root,orb,icon,panel,other,controller,entries,counts,
  async open(){await controller.launch('a',()=>controller.go('a'));assert.equal(doc.activeElement,panel);}};
}
test('Honeycomb A/B origin focus and Hub close select the current entrance',async t=>{
 const f=fixture(t),b=f.doc.createElement('button');b.id='b-icon';f.root.append(b);
 await f.open();await f.controller.close('a');assert.equal(f.doc.activeElement,f.icon);
 await f.controller.launch('b',()=>f.controller.go('b'));await f.controller.close('b');assert.equal(f.doc.activeElement,b);
 await f.controller.go('closed');assert.equal(f.doc.activeElement,f.orb);await f.controller.go('menu');assert.equal(f.doc.activeElement,f.orb);
});
test('Honeycomb focus ignores a disabled or hidden captured origin without redirecting to Hub',async t=>{
 for(const field of ['disabled','hidden']){const f=fixture(t);await f.open();f.icon[field]=true;await f.controller.close('a');assert.notEqual(f.doc.activeElement,f.icon);assert.notEqual(f.doc.activeElement,f.orb);assert.equal(f.counts.size,0);}
});
test('declared Honeycomb subtree focus supports Shadow DOM without changing tabindex',async t=>{
 const f=fixture(t),wrapper=f.doc.createElement('div');wrapper.id='declared';f.root.append(wrapper);const shadow=wrapper.attachShadow({mode:'open'}),button=f.doc.createElement('button');shadow.append(button);
 await f.open();await f.controller.close('a');assert.equal(f.doc.activeElement,wrapper);assert.equal(shadow.activeElement,button);assert.equal(wrapper.hasAttribute('tabindex'),false);
});
test('declared Honeycomb subtree skips hidden/disabled descendants and does not invent a focusable node',async t=>{
 const f=fixture(t),wrapper=f.doc.createElement('div');wrapper.id='declared';wrapper.innerHTML='<div hidden><button>Hidden</button></div><button disabled>Disabled</button><button id="eligible">Valid</button>';f.root.append(wrapper);
 await f.open();await f.controller.close('a');assert.equal(f.doc.activeElement,f.doc.getElementById('eligible'));wrapper.replaceChildren();await f.open();await f.controller.close('a');assert.notEqual(f.doc.activeElement,wrapper);assert.notEqual(f.doc.activeElement,f.orb);assert.equal(wrapper.hasAttribute('tabindex'),false);
});
