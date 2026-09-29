// Submission-only presentation; native values remain the form's source of truth.
export function createSubmissionSelects({host,form}) {
  const doc=host.document,cleanups=[],syncers=[];let popup=null,sequence=0;
  function close(focus=false){
    if(!popup)return;const old=popup;popup=null;old.menu.remove();old.trigger.setAttribute('aria-expanded','false');old.trigger.removeAttribute('aria-controls');
    doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('scroll',scrolled,true);host.removeEventListener('keydown',key,true);host.removeEventListener('resize',resized);host.visualViewport?.removeEventListener('resize',resized);
    if(focus&&old.trigger.isConnected)old.trigger.focus({preventScroll:true});
  }
  function outside(event){if(popup&&!popup.wrap.contains(event.target))close();}
  function scrolled(event){if(popup&&!popup.menu.contains(event.target))close();}
  function resized(){close();}
  function key(event){
    if(!popup)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(true);return;}
    if(!popup.wrap.contains(event.target))return;
    if(event.key==='Tab'){close(true);return;}
    const buttons=[...popup.menu.children],at=buttons.indexOf(doc.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[index]?.focus({preventScroll:true});buttons[index]?.scrollIntoView?.({block:'nearest'});
    }
  }
  function add(select){
    const wrap=doc.createElement('div'),trigger=doc.createElement('button');wrap.className='mm-form-select';select.before(wrap);wrap.append(select,trigger);
    select.hidden=true;select.tabIndex=-1;trigger.type='button';trigger.className='mm-form-select-trigger';trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.dataset.selectFor=select.name;
    const label=select.getAttribute('aria-label')||select.closest('label')?.firstChild?.textContent||select.name;
    function sync(){trigger.textContent=select.selectedOptions[0]?.textContent||'';trigger.disabled=select.disabled;trigger.setAttribute('aria-label',label+'：'+trigger.textContent);}
    function show(last=false){
      if(select.disabled)return;if(popup?.trigger===trigger){close(true);return;}close();
      const menu=doc.createElement('div');menu.className='mm-form-select-menu';menu.id='mm-submission-choice-'+(++sequence);menu.setAttribute('role','listbox');menu.setAttribute('aria-label',label);
      for(const option of select.options){if(option.disabled)continue;const b=doc.createElement('button');b.type='button';b.tabIndex=-1;b.setAttribute('role','option');b.setAttribute('aria-selected',String(option.selected));b.textContent=option.textContent;b.onclick=()=>{select.value=option.value;select.dispatchEvent(new host.Event('change',{bubbles:true}));sync();close(true);};menu.append(b);}
      wrap.append(menu);const rect=trigger.getBoundingClientRect(),clip=form.closest('.mm-center-main')?.getBoundingClientRect(),v=host.visualViewport;
      const top=Math.max(v?.offsetTop||0,clip?.top||0),bottom=Math.min((v?.offsetTop||0)+(v?.height||host.innerHeight),clip?.bottom||host.innerHeight);
      const below=bottom-rect.bottom-8,above=rect.top-top-8,up=below<Math.min(240,above);
      menu.dataset.side=up?'above':'below';menu.style.maxHeight=Math.max(44,Math.min(280,up?above:below))+'px';
      trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls',menu.id);popup={wrap,trigger,menu};
      const buttons=[...menu.children];(last?buttons.at(-1):buttons.find(b=>b.getAttribute('aria-selected')==='true')||buttons[0])?.focus({preventScroll:true});
      doc.addEventListener('pointerdown',outside,true);doc.addEventListener('scroll',scrolled,true);host.addEventListener('keydown',key,true);host.addEventListener('resize',resized);host.visualViewport?.addEventListener('resize',resized);
    }
    trigger.onclick=()=>show();trigger.onkeydown=event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();show(event.key==='ArrowUp');}};
    select.addEventListener('change',sync);sync();syncers.push(sync);cleanups.push(()=>select.removeEventListener('change',sync));
  }
  return {add,refresh(){for(const sync of syncers)sync();},dispose(){close();for(const cleanup of cleanups)cleanup();}};
}
