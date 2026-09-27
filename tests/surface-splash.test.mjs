import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {createSurfaceMotion} from '../src/surface-motion.js';
function fixture(t){
 const dom=new JSDOM('<div id="shell" style="--mie-motion-surface-open:520ms;--mie-motion-hero:760ms;--mie-blur-hero:14px"></div><section><header><img data-tool-icon src="icon.png"></header><main>Body</main></section>'),host=dom.window,doc=host.document,panel=doc.querySelector('section'),target=doc.querySelector('img'),calls=[],pending=new Set();
 panel.getBoundingClientRect=()=>({left:100,top:20,width:600,height:700});target.getBoundingClientRect=()=>({left:116,top:36,width:52,height:52});
 host.Element.prototype.getBoundingClientRect=function(){return {left:326,top:296,width:148,height:148};};
 host.Element.prototype.animate=function(frames,options){let finish;const a={finished:new Promise(r=>finish=r),cancel(){finish();pending.delete(a);}};calls.push({el:this,frames,options});pending.add(a);return a;};
 const motion=createSurfaceMotion({host,shell:{root:doc.querySelector('#shell')},launcher:{originRect:()=>({left:900,top:300,width:64,height:64}),originElement:()=>null}});
 t.after(()=>{motion.cancel();dom.window.close();});return {host,doc,panel,target,motion,calls,pending};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('brand splash exists on first opening frame; only its veil blurs, then fades as icon lands',async t=>{
 const f=fixture(t),opening=f.motion.run(f.panel,{},true);
 const hero=f.doc.querySelector('[data-surface-hero]'),veil=f.doc.querySelector('[data-surface-veil]');assert.ok(hero);assert.ok(veil);assert.equal(veil.style.backdropFilter,'blur(14px)');assert.equal(f.target.style.visibility,'hidden');assert.equal(f.panel.style.filter,'');assert.equal(f.doc.querySelector('[data-surface-face]'),null);
 assert.equal(f.calls.some(c=>c.el===hero),false,'hero is prepared during the window flight, not created after it');for(const a of [...f.pending])a.cancel();await tick();
 const landing=f.calls.find(c=>c.el===hero),reveal=f.calls.find(c=>c.el===veil);assert.ok(landing);assert.equal(landing.frames[1].offset,.16);assert.equal(reveal.frames.at(-1).opacity,0);assert.equal(reveal.options.duration,760);
 for(const a of [...f.pending])a.cancel();await opening;assert.equal(f.doc.querySelector('[data-surface-splash]'),null);assert.equal(f.target.style.visibility,'');
});
test('resize cancellation and reduced motion cannot leave a blurred splash or hidden header',async t=>{
 const f=fixture(t),opening=f.motion.run(f.panel,{},true);f.motion.cancel();await opening;assert.equal(f.doc.querySelector('[data-surface-splash]'),null);assert.equal(f.target.style.visibility,'');
 f.host.matchMedia=()=>({matches:true});await f.motion.run(f.panel,{},true);assert.equal(f.doc.querySelector('[data-surface-splash]'),null);
});
test('Shortcut page retreats into the persistent orb without replacing it; Honeycomb remains opaque',async t=>{
 const f=fixture(t),active=[],origin={kind:'shortcut',active:value=>active.push(value)};
 const closing=f.motion.run(f.panel,origin,false);
 assert.equal(f.doc.querySelector('[data-surface-face]'),null);
 const close=f.calls.find(c=>c.el===f.panel);assert.equal(close.frames.at(-1).opacity,0);assert.match(close.frames.at(-1).transform,/translate\(800px,280px\)/);
 for(const a of [...f.pending])a.cancel();await closing;assert.deepEqual(active,[true,false]);
 f.calls.length=0;const hubClosing=f.motion.run(f.panel,{},false);assert.equal(f.calls.find(c=>c.el===f.panel).frames.at(-1).opacity,1);
 for(const a of [...f.pending])a.cancel();await hubClosing;
});
