import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {createSubmissionSelects} from '../src/submission-select.js';
function setup(t){const dom=new JSDOM('<div class="mm-center-main"><form><label>产品类型<select name="type"><option value="tavern">酒馆扩展</option><option value="app">独立应用</option><option value="web">Web 工具</option></select></label></form></div>');const host=dom.window,doc=host.document,form=doc.querySelector('form'),select=doc.querySelector('select'),choices=createSubmissionSelects({host,form});choices.add(select);t.after(()=>{choices.dispose();host.close();});return {host,doc,form,select,choices,trigger:doc.querySelector('[role=combobox]'),key:(value,target=doc.activeElement)=>target.dispatchEvent(new host.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}))};}
test('themed choices preserve native form value, selected state and keyboard navigation',t=>{
 const f=setup(t);let changes=0;f.select.onchange=()=>changes++;assert.equal(f.select.hidden,true);f.trigger.click();assert.equal(f.trigger.getAttribute('aria-expanded'),'true');assert.equal(f.doc.querySelectorAll('[role=listbox]').length,1);assert.equal(f.doc.activeElement.textContent,'酒馆扩展');f.key('End');assert.equal(f.doc.activeElement.textContent,'Web 工具');f.doc.activeElement.click();assert.equal(f.select.value,'web');assert.equal(changes,1);assert.equal(f.trigger.textContent,'Web 工具');assert.equal(f.doc.activeElement,f.trigger);assert.equal(f.doc.querySelector('[role=listbox]'),null);
 f.select.value='app';f.select.dispatchEvent(new f.host.Event('change'));assert.equal(f.trigger.textContent,'独立应用');f.key('ArrowDown',f.trigger);assert.equal(f.doc.activeElement.textContent,'独立应用');f.key('ArrowUp');assert.equal(f.doc.activeElement.textContent,'酒馆扩展');
});
test('Escape closes only the menu before Hub capture; Tab returns normal focus traversal',t=>{
 const f=setup(t);let hubClosed=false;f.doc.addEventListener('keydown',e=>{if(e.key==='Escape')hubClosed=true;},true);f.trigger.click();f.key('Escape');assert.equal(hubClosed,false);assert.equal(f.doc.activeElement,f.trigger);f.trigger.click();f.key('Tab');assert.equal(f.trigger.getAttribute('aria-expanded'),'false');
});
test('outside pointer, scroll, resize and disposal remove open menus and their listeners',t=>{
 const f=setup(t);for(const event of ['pointerdown','scroll','resize']){f.trigger.click();(event==='resize'?f.host:f.doc.body).dispatchEvent(new f.host.Event(event,{bubbles:true}));assert.equal(f.doc.querySelector('[role=listbox]'),null);}
 f.trigger.click();f.choices.dispose();assert.equal(f.doc.querySelector('[role=listbox]'),null);f.key('Escape');
});
test('short popup above uses bottom anchoring and fits the available panel space',t=>{
 const f=setup(t);f.trigger.getBoundingClientRect=()=>({top:400,bottom:444});f.form.closest('.mm-center-main').getBoundingClientRect=()=>({top:100,bottom:460});f.trigger.click();const menu=f.doc.querySelector('[role=listbox]');assert.equal(menu.dataset.side,'above');assert.equal(menu.style.maxHeight,'280px');f.key('Escape');f.trigger.getBoundingClientRect=()=>({top:110,bottom:154});f.trigger.click();assert.equal(f.doc.querySelector('[role=listbox]').dataset.side,'below');
});
