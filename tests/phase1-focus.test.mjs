import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createSurfaceController} from '../src/surface-controller.js';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(t){
 const dom=new JSDOM('<body><div id="shell"></div><div id="menu"><button id="icon">App</button></div><button id="hub">Hub</button><button id="shortcut">Shortcut</button><input id="outside"><section id="a" tabindex="-1"></section><section id="b" tabindex="-1"></section>',{url:'https://focus.invalid'});
 const host=dom.window,doc=host.document,get=id=>doc.getElementById(id),root=get('menu'),orb=get('hub'),shortcut=get('shortcut'),icon=get('icon'),panel=get('a'),other=get('b');root.hidden=true;panel.hidden=other.hidden=true;
 const errors=[];host.matchMedia=()=>({matches:true});let finish,hold=false,valid=true,focusCount=0;icon.addEventListener('focus',()=>focusCount++);
 const entries={a:{owner:'a',panel},b:{owner:'b',panel:other}},launcher={originRect:()=>null,originElement:o=>o?.element,capture:()=>({element:icon}),resume(){root.inert=false;},suspend(){root.inert=true;},async open({focus=true}={}){root.hidden=false;root.inert=false;if(focus)orb.focus();},async close(){root.hidden=true;},settle(open){root.hidden=!open;},highlight(o,{focus=true}={}){if(focus)o?.element?.focus();}};
 const provider={available:()=>true,place(){},run(p,opening){if(!opening&&hold)return new Promise(r=>finish=r);},cancel(){finish?.();},release(){}};
 const origin=()=>({kind:'shortcut',element:()=>shortcut,focusElement:()=>valid?shortcut:null,rect:{left:1,top:1,width:60,height:60},presentation:provider});
 const controller=createSurfaceController({host,shell:{root:get('shell'),orb},root,launcher,panels:[panel,other],resolve:k=>entries[k],place(){},onState(){},onError:e=>errors.push(e)});
 const counts=new Map(),add=doc.addEventListener.bind(doc),remove=doc.removeEventListener.bind(doc);
 doc.addEventListener=(type,fn,...rest)=>{if(['focusin','pointerdown','keydown'].includes(type))counts.set(fn,type);add(type,fn,...rest);};doc.removeEventListener=(type,fn,...rest)=>{counts.delete(fn);remove(type,fn,...rest);};
 t.after(()=>{controller.dispose();assert.equal(counts.size,0);dom.window.close();});
 return {errors,host,doc,get,root,orb,shortcut:icon,icon,panel,other,controller,entries,counts,origin,provider,
  async open(){await controller.launch('a',()=>controller.go('a'));assert.equal(doc.activeElement,panel);},
  async closing(){host.matchMedia=()=>({matches:false});panel.animate=()=>({finished:new Promise(r=>finish=r),cancel(){finish?.();}});const task=controller.close('a');await tick();assert.equal(panel.dataset.surfaceState,'closing');return {task,finish:()=>finish()};},
  invalidate(){valid=false;},focusCount:()=>focusCount};
}
test('C: closing Hub itself and Hub-orb explicit close return to Hub orb',async t=>{const f=fixture(t);await f.controller.go('menu');await f.controller.go('closed');assert.equal(f.doc.activeElement,f.orb);await f.open();await f.controller.go('closed');assert.equal(f.doc.activeElement,f.orb);});
test('Hub return-button go(menu) retains its existing navigation and restores Origin',async t=>{const f=fixture(t);await f.open('honeycomb');await f.controller.go('menu');assert.equal(f.controller.state,'menu');assert.equal(f.doc.activeElement,f.icon);});
test('F: removing/disabling Origin during close must not focus it or a replacement',async t=>{const f=fixture(t);await f.open();const c=await f.closing();f.invalidate();f.shortcut.remove();const replacement=f.doc.createElement('button');f.doc.body.append(replacement);replacement.focus();c.finish();await c.task;assert.equal(f.doc.activeElement,replacement);assert.equal(f.focusCount(),0);});
test('G: new focus, even if later blurred, prevents delayed restoration',async t=>{const f=fixture(t);await f.open();const c=await f.closing();f.get('outside').focus();f.get('outside').blur();c.finish();await c.task;assert.equal(f.doc.activeElement,f.doc.body);assert.equal(f.focusCount(),0);});
test('G: pointer intent on non-focusable content prevents restoration',async t=>{const f=fixture(t);await f.open();const c=await f.closing();f.doc.body.dispatchEvent(new f.host.Event('pointerdown',{bubbles:true}));c.finish();await c.task;assert.equal(f.focusCount(),0);});
test('H/I: revoke old Session then open new Surface; late completion never focuses old Origin',async t=>{const f=fixture(t);await f.open();const c=await f.closing();f.controller.revoke('a');f.entries.a={owner:'a',panel:f.other};const next=f.controller.go('a');c.finish();await Promise.all([c.task,next]);assert.equal(f.doc.activeElement,f.other);assert.equal(f.focusCount(),0);});
test('queued new Surface suppresses even transient focus at old Origin',async t=>{const f=fixture(t);await f.open();const c=await f.closing();const next=f.controller.go('b');c.finish();await Promise.all([c.task,next]);assert.equal(f.doc.activeElement,f.other);assert.equal(f.focusCount(),0);});
test('M: dispose cancels transition-local listeners and late focus',async t=>{const f=fixture(t);await f.open();const c=await f.closing();f.controller.dispose();assert.equal(f.counts.size,0);f.get('outside').focus();c.finish();await c.task;assert.equal(f.doc.activeElement,f.get('outside'));assert.equal(f.focusCount(),0);});
test('resize cancellation finishes at valid Origin, without waiting on stale animation',async t=>{const f=fixture(t);await f.open();const c=await f.closing();f.controller.resize();await c.task;assert.equal(f.doc.activeElement,f.shortcut);});
test('explicit close while external control already owns focus leaves it alone',async t=>{const f=fixture(t);await f.open();f.get('outside').focus();await f.controller.close('a');assert.equal(f.doc.activeElement,f.get('outside'));});
test('failed Origin focus abandons restoration; error recovery cannot focus Hub later',async t=>{const f=fixture(t);await f.open();f.shortcut.focus=()=>{throw Error('Origin focus failed');};assert.equal(await f.controller.close('a'),false);await tick();assert.equal(f.errors.length,1);assert.notEqual(f.doc.activeElement,f.orb);assert.equal(f.counts.size,0);});
