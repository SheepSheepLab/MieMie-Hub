// 咩咩时间线切换器 — Tavern Helper 4.9.3
// 无模块导入；使用已初始化的父窗口 SillyTavern.getContext()。
(() => {
  'use strict';
  const host = window.parent, doc = host.document;
  const KEY = '__timelineSwitcherV1';
  if (host[KEY]) { host[KEY].open(); return; }
  let disposed = false, busy = false, epoch = 0, snapshot = null, needsReload = false;
  const root = hubShell.root, view = doc.createElement('div');
  view.innerHTML = "<section id=\"meeme-ts-panel\" class=\"ts-panel\" hidden aria-label=\"咩咩时间线切换器\"><header class=\"ts-row mm-tool-heading\"><div class=\"mm-tool-brand\"><img data-tool-icon=\"timeline\" alt=\"咩咩时间线\" draggable=\"false\"><div class=\"mm-tool-titles\"><strong>咩咩时间线切换器</strong><small data-timeline-card>请打开单人角色聊天</small></div></div><button type=\"button\" data-close>收起</button></header><p class=\"ts-note\">切换会修改世界书；共用这本书的聊天也会受影响。旧聊天与记忆不会清空。</p><button type=\"button\" data-refresh>刷新列表</button><div class=\"ts-status\" role=\"status\" aria-live=\"polite\"></div><div class=\"ts-status ts-note\" data-auto-status role=\"status\" aria-live=\"polite\"></div><div data-list></div></section>";
  root.appendChild(view);
  const panel = root.querySelector('.ts-panel'), status = root.querySelector('.ts-status'), list = root.querySelector('[data-list]');
  const context = () => host.SillyTavern.getContext();
  function paintTimelineCard(){
    const c=context(),character=c.characters?.[c.characterId];
    root.querySelector('[data-timeline-card]').textContent=!c.groupId&&character?.avatar?'当前角色：'+(character.name||character.avatar):'请打开单人角色聊天';
  }
  paintTimelineCard();
  function identity() {
    const c = context();
    if (c.groupId || c.characterId == null || !c.characters?.[c.characterId]) return null;
    const w = getCharWorldbookNames('current');
    const books = [...new Set([w.primary, ...(w.additional || [])].filter(Boolean))];
    const avatar = c.characters[c.characterId].avatar;
    return { key: JSON.stringify([c.characterId, avatar, c.chatId, books]), books, name:c.characters[c.characterId].name };
  }
  function identify(entries) {
    return {entries:entries.filter(e=>timelineInfo(e).blocks.length>0),fallback:false};
  }
  function timelineInfo(entry) {
    const text=String(entry.content||'');
    const blocks=[...text.matchAll(/<world_timeline\s*>([\s\S]*?)<\/world_timeline\s*>/gi)].map(m=>m[1]).filter(b=>b.trim());
    return {blocks};
  }
  const stable = value => {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+stable(value[k])).join(',') + '}';
    return JSON.stringify(value);
  };
  function choose(data, uid) {
    const copy = JSON.parse(JSON.stringify(data));
    const items = identify(Object.values(copy.entries)).entries;
    if (!items.some(e => e.uid === uid) || new Set(items.map(e => e.uid)).size !== items.length) throw Error('时间线条目已变化或编号重复，请刷新。');
    for (const item of items) item.disable = item.uid !== uid;
    return copy;
  }
  // 只处理虚构日期元组，不调用 Date，不读取现实时间。
  function compareDate(a, b) {
    for (let i=0;i<5;i++) { if (a[i]!==b[i]) return a[i]<b[i] ? -1 : 1; }
    return 0;
  }
  function parseDatePart(text) {
    const m=String(text).trim().match(/^(\d{1,6})年\s*(\d{1,2})月\s*(\d{1,2})日(?:\s*[/／]?\s*(?:(\d{1,2})[:：](\d{2})|(\d{1,2})时(?:(\d{1,2})分)?))?$/);
    if (!m) throw Error('日期格式不明确，需要“60年3月15日”或带“10:15”的日期。');
    const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]),timed=m[4]!==undefined||m[6]!==undefined;
    const hour=Number(m[4]??m[6]??0),minute=Number(m[5]??m[7]??0);
    const leap=y%4===0&&(y%100!==0||y%400===0);
    const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    if (y<1||month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59) throw Error('日期或时刻无效，保持当前篇章。');
    return {value:[y,month,day,hour,minute],timed};
  }
  function dateLabel(value) { return `${value[0]}年${value[1]}月${value[2]}日 ${String(value[3]).padStart(2,'0')}:${String(value[4]).padStart(2,'0')}`; }
  function threshold(entry) {
    const blocks=timelineInfo(entry).blocks;
    if (blocks.length!==1) throw Error('需要唯一、完整的 world_timeline，无法自动确定交接时间。');
    const events=blocks[0].split(/\r?\n/).filter(line=>/^\s*(?:[-*•]\s*)?事件[^:：\n]*[:：]/.test(line));
    if (!events.length) throw Error('未找到明确的事件行，无法自动确定交接时间。');
    const line=events.at(-1);
    // 日期只能来自末事件标题紧随的括号；冒号后的叙事正文不参与解析。
    const m=line.match(/^\s*(?:[-*•]\s*)?事件[^:：\n]*[:：]\s*([^()（）]*?)\s*[（(]([^()（）]+)[）)](?:\s*[:：].*)?\s*$/);
    if (!m) throw Error('末事件行的日期括号不明确，保持当前篇章。');
    const sandbox=/沙盒模式/.test(m[1]);
    let segment=m[2].trim(),date;
    if (sandbox) {
      segment=segment.replace(/\s*起?\s*(?:[-－—–~～至到]\s*)?∞\s*$/,'').replace(/\s*起\s*$/,'').trim();
      date=parseDatePart(segment);
      date.value=[...date.value.slice(0,3),0,0];
      return {value:date.value,strict:false,label:dateLabel(date.value)+' 起（末事件：沙盒模式）'};
    }
    const parts=segment.split(/\s*(?:[-－—–~～]|至|到)\s*/);
    if (parts.length<1||parts.length>2) throw Error('末事件日期范围不明确，保持当前篇章。');
    const start=parseDatePart(parts[0]);date=parseDatePart(parts.at(-1));
    if (compareDate(start.value,date.value)>0) throw Error('末事件日期范围倒序，保持当前篇章。');
    if (date.timed) return {value:date.value,strict:false,label:dateLabel(date.value)+' 起（末事件结束）'};
    return {value:[...date.value.slice(0,3),23,59],strict:true,label:`${date.value[0]}年${date.value[1]}月${date.value[2]}日过完后（末事件结束）`};
  }
  function wlogDate(text) {
    const raw=String(text||'');
    const blocks=[...raw.matchAll(/<wlog\b([^>]*)>[\s\S]*?<\/wlog\s*>/gi)];
    if (!blocks.length) throw Error('本次AI回复没有完整 wlog，保持当前篇章。');
    const dates=blocks.map(block=>{
      const attrs=[...block[1].matchAll(/(?:^|\s)time\s*=\s*(["'])(.*?)\1/gi)];
      if (attrs.length!==1) throw Error('wlog 的 time 属性缺失或不唯一，保持当前篇章。');
      const value=attrs[0][2].replace(/^\s*(?:🕒\s*)?(?:时间\s*[:：]\s*)?/,'').trim();
      // 只去掉明确的星期后缀，星期不用于判断剧情时间。
      return parseDatePart(value.replace(/\s*[/／]\s*星期[一二三四五六日天1-7]\s*$/,'')).value;
    });
    if (dates.some(d=>compareDate(d,dates[0])!==0)) throw Error('回复中多个 wlog 时间不一致，保持当前篇章。');
    return dates[0];
  }
  function linkCycle(links, from) {
    const seen=new Set();let current=from;
    while(current!==null&&current!==undefined) {
      if(seen.has(current)) return true;
      seen.add(current);current=links.find(link=>link.from===current)?.to;
    }
    return false;
  }

  async function api() {
    const existing = context();
    if (typeof existing.saveWorldInfo !== 'function' || typeof existing.loadWorldInfo !== 'function') throw Error('当前酒馆缺少所需世界书接口，未进行修改。');
    return existing;
  }
  async function read(name) {
    const response = await host.fetch('/api/worldinfo/get', {method:'POST',headers:context().getRequestHeaders(),body:JSON.stringify({name}),cache:'no-store'});
    if (!response.ok) throw Error('读取世界书失败（HTTP '+response.status+'）。');
    const data = await response.json();
    if (!data?.entries || typeof data.entries !== 'object') throw Error('世界书数据格式不正确。');
    return data;
  }
  function assertCurrent(key, token) {
    if (disposed || token !== epoch || identity()?.key !== key) throw Error('角色、聊天或绑定世界书已切换；已取消尚未提交的操作，请刷新。');
  }
  function controls() {
    if(busy||needsReload)closePicker();
    root.querySelectorAll('[data-refresh],.ts-choice,select,input,.ts-route-trigger,.ts-mode-button').forEach(b => { b.disabled = busy || needsReload || (b.className==='ts-mode-button'&&!autoAvailable); });
  }
  async function refresh() {
    paintTimelineCard();
    if (busy || disposed || needsReload) return;
    closePicker();
    const token = ++epoch;
    snapshot = null; list.replaceChildren(); status.textContent = '正在读取…';
    try {
      const id = identity();
      if (!id) { status.textContent = '请打开一个角色的单人聊天。群聊暂不支持。'; return; }
      await api();
      const books = [];
      for (const name of id.books) {
        const data = await read(name); assertCurrent(id.key, token);
        const found = identify(Object.values(data.entries));
        if (found.entries.length) books.push({name,data,...found});
      }
      assertCurrent(id.key, token);
      snapshot = {id,books};
      status.textContent = books.length ? id.name + ' · 点击一项即可切换' : '当前角色绑定的世界书中没有识别到时间线。请确认已导入并绑定角色世界书，再刷新。';
      for (const book of books) {
        const heading = doc.createElement('p'); heading.className='ts-note';
        const active = book.entries.filter(e => !e.disable).length;
        heading.textContent = book.name + ' · ' + active + ' 项启用' + (active !== 1 ? '（请选择一项）' : '') + (book.fallback ? ' · 按标题识别，请核对' : ''); list.appendChild(heading);
        renderMode(book);
        for (const entry of book.entries) {
          const b = doc.createElement('button'); b.type='button'; b.className='ts-choice'; b.setAttribute('aria-pressed',String(!entry.disable));
          b.textContent = (!entry.disable ? '✓ ' : '') + (entry.comment || '未命名时间线 #'+entry.uid);
          b.addEventListener('click',() => switchTo(book.name,entry.uid)); const row=doc.createElement('div');row.className='ts-entry';row.appendChild(b);list.appendChild(row);
          renderAutomatic(book,entry,row);
        }
      }
      controls();
    } catch (error) { if (token === epoch && !disposed) { snapshot=null; list.replaceChildren(); status.textContent=error.message; } }
  }
  async function writeBook(name,uid,expected,guard) {
    let committed=false;
    try {
      const perform=async()=>{
        guard();
        const native=await api(),latest=await read(name);
        guard();
        if(stable(latest)!==stable(expected))throw Error('世界书已被其他操作修改，请刷新后重新选择。');
        const cached=await native.loadWorldInfo(name);
        if(stable(cached)!==stable(latest))throw Error('世界书编辑器有尚未同步的更改，请先完成保存，再刷新页面。');
        const updated=choose(latest,uid);
        guard();committed=true;
        await native.saveWorldInfo(name,updated,true);
        const saved=await read(name);
        if(stable(saved)!==stable(updated))throw Error('服务器回读与预期不同，未确认保存成功。');
        if(typeof native.reloadWorldInfoEditor==='function')native.reloadWorldInfoEditor(name);
      };
      if(host.navigator.locks?.request)await host.navigator.locks.request('timeline-switcher:'+name,perform);
      else await perform();
    }catch(error){if(committed)needsReload=true;throw error;}
  }
  async function switchTo(name,uid) {
    if(busy||!snapshot||disposed||needsReload)return;
    const selected=snapshot,token=epoch,shown=selected.books.find(b=>b.name===name);
    if(!shown)return;
    cancelGeneration('已采用手动选择；不会用历史回复覆盖，等待下一次完整AI回复。');
    busy=true;controls();status.textContent='正在保存，请稍候…';
    try{
      await writeBook(name,uid,shown.data,()=>assertCurrent(selected.id.key,token));
      busy=false;await refresh();
      if(!disposed)status.textContent=identity()?.key===selected.id.key?'已保存：'+shown.entries.find(e=>e.uid===uid).comment:'已保存到「'+name+'」。提交期间聊天已切换，列表已刷新。';
    }catch(error){
      snapshot=null;list.replaceChildren();
      status.textContent=(needsReload?'保存结果需核对，请刷新整个酒馆网页：':'未提交修改：')+error.message;
    }finally{busy=false;controls();}
  }
  const SETTINGS={type:'extension',extension_id:'timeline_switcher_v2'};
  let autoMessage='自动模式默认关闭；只按你选择的接续关系切换。',generation=null,finishTimer=null,autoAvailable=false;
  const subscriptions=[];
  const autoStatus=root.querySelector('[data-auto-status]');
  function autoNote(message) {autoMessage=message;autoStatus.textContent=message;}
  function settings() {
    if(typeof getVariables!=='function'||typeof replaceVariables!=='function') throw Error('缺少设置保存接口，自动模式不可用。');
    const saved=getVariables(SETTINGS);
    if(!saved||Object.keys(saved).length===0)return {version:1,books:[]};
    if(saved.version!==1||!Array.isArray(saved.books))throw Error('自动设置格式异常，已暂停自动模式。');
    return saved;
  }
  function bookSettings(saved,name) {
    const book=saved.books.find(b=>b.name===name);
    if(!book)return {name,auto:false,links:[]};
    if(typeof book.auto!=='boolean'||!Array.isArray(book.links)||book.links.some(l=>!Number.isInteger(l.from)||!Number.isInteger(l.to)))throw Error('该书自动设置格式异常，已暂停自动模式。');
    return book;
  }
  function saveSettings(name, change) {
    const saved=settings(),book=bookSettings(saved,name),updated=change(JSON.parse(JSON.stringify(book)));
    saved.books=saved.books.filter(b=>b.name!==name);saved.books.push(updated);
    replaceVariables(saved,SETTINGS);
    cancelGeneration('接续设置已保存；从下一次完整AI回复开始检查。');
  }
  function renderAutomatic(book,entry,row) {
    const details=doc.createElement('div');details.className='ts-routing';
    const select=doc.createElement('select');select.setAttribute('aria-label',`${entry.comment} 自动接续到`);
    const none=doc.createElement('option');none.value='';none.textContent='不自动切换';select.appendChild(none);
    for(const target of book.entries.filter(e=>e.uid!==entry.uid)) {
      const option=doc.createElement('option');option.value=String(target.uid);option.textContent=target.comment||`未命名时间线 #${target.uid}`;select.appendChild(option);
    }
    let config;
    try{config=bookSettings(settings(),book.name);select.value=String(config.links.find(l=>l.from===entry.uid)?.to??'');}
    catch(error){select.disabled=true;autoNote(error.message);}
    const hint=doc.createElement('p');hint.className='ts-handoff';
    try{hint.textContent='交接时间：'+threshold(entry).label;}catch(error){hint.textContent='暂不能自动接续：'+error.message;}
    const configured=config?.links.find(l=>l.from===entry.uid)?.to;
    if(configured!==undefined&&!book.entries.some(e=>e.uid===configured))hint.textContent+='；原接续条目已不存在，请重新选择。';
    if(config&&linkCycle(config.links,entry.uid))hint.textContent+='；接续链有循环，自动切换已阻止。';
    select.addEventListener('change',()=>{
      const previous=config?.links.find(l=>l.from===entry.uid)?.to;
      try{
        if(busy||needsReload||snapshot?.id.key!==identity()?.key)throw Error('当前正在操作或角色已切换，请刷新。');
        const to=select.value===''?null:Number(select.value);
        if(to!==null&&(!Number.isInteger(to)||to===entry.uid||!book.entries.some(e=>e.uid===to)))throw Error('请选择本书的其他时间线。');
        saveSettings(book.name,b=>{
          b.links=b.links.filter(l=>l.from!==entry.uid);
          if(to!==null)b.links.push({from:entry.uid,to});
          if(linkCycle(b.links,entry.uid))throw Error('这会形成循环接续，请改选另一篇或“不自动切换”。');
          config=b;return b;
        });
      }catch(error){select.value=String(previous??'');autoNote(error.message);}
    });
    select.title=select.children[select.selectedIndex]?.textContent||'自动接续到';
    details.appendChild(select);row.appendChild(details);row.appendChild(hint);upgradeSelect(select,row);
  }
  function renderMode(book) {
    const wrap=doc.createElement('div');wrap.className='ts-mode';
    const toggle=doc.createElement('button');toggle.type='button';toggle.className='ts-mode-button';
    toggle.setAttribute('aria-label',book.name+' 模式切换');
    const state=doc.createElement('span');state.className='ts-mode-state';state.setAttribute('role','status');
    let enabled=false;
    function paint(){toggle.textContent=enabled?'自动模式':'手动模式';toggle.setAttribute('aria-pressed',String(enabled));state.textContent=enabled?'已开启 · 仅本书\n按已选接续关系自动推进':'当前为手动\n接续关系会保留';}
    try{enabled=bookSettings(settings(),book.name).auto;toggle.disabled=!autoAvailable;}catch(error){toggle.disabled=true;autoNote(error.message);}
    paint();wrap.appendChild(toggle);wrap.appendChild(state);list.appendChild(wrap);
    toggle.addEventListener('click',()=>{
      try{
        if(busy||needsReload||snapshot?.id.key!==identity()?.key)throw Error('当前正在操作或角色已切换，请刷新。');
        if(!autoAvailable)throw Error('缺少完整生成事件接口，自动模式暂不可用。');
        const next=!enabled;
        saveSettings(book.name,b=>({...b,auto:next}));enabled=next;paint();
        autoNote(enabled?'已开启自动模式；无接续关系的篇章仍保持不变。等下一次完整AI回复。':'已回到手动模式；接续关系已保留。');
      }catch(error){paint();autoNote(error.message);}
    });
  }
  function cancelGeneration(message) {
    if(generation)generation.cancelled=true;
    generation=null;
    if(finishTimer!==null){clearTimeout(finishTimer);finishTimer=null;}
    if(message)autoNote(message);
  }
  function messageKey(message,index) {return JSON.stringify([index,message?.swipe_id??0,message?.mes??'',message?.gen_started??null,message?.gen_finished??null]);}
  function streamFailed(run) {
    const stream=context().streamingProcessor;
    return !!(run.failed||(stream&&stream!==run.initialStream&&(stream.isStopped||stream.abortController?.signal?.aborted)));
  }
  function generationStart(type,options,dryRun) {
    cancelGeneration();
    if(disposed||needsReload||busy||dryRun||!['normal','regenerate','continue','swipe','append','appendFinal'].includes(type??'normal'))return;
    try{
      const id=identity();if(!id)return;
      const config=settings();
      if(!id.books.some(name=>bookSettings(config,name).auto)){autoNote('手动模式：本次回复不会自动切换。');return;}
      const chat=context().chat||[];
      generation={key:id.key,books:id.books,config:stable(config),baseline:chat.map(messageKey),initialStream:context().streamingProcessor,failed:false,ended:false,candidate:null,cancelled:false,done:false};
      autoNote('自动模式：等待本次AI回复完成…');
    }catch(error){autoNote(error.message);}
  }
  function received(index,type) {
    const run=generation;
    if(!run||run.cancelled||run.done||!['normal','regenerate','continue','swipe','append','appendFinal'].includes(type??'normal'))return;
    try {if(!Number.isInteger(index)||identity()?.key!==run.key)return;}catch(error){cancelGeneration(error.message);return;}
    run.candidate=index;
    const stream=context().streamingProcessor;
    if(stream&&stream!==run.initialStream&&(stream.isStopped||stream.abortController?.signal?.aborted))run.failed=true;
    queueFinish(run);
  }
  function ended() {if(generation){generation.ended=true;queueFinish(generation);}}
  function queueFinish(run) {
    if(!run.ended||run.candidate===null||run.done||run.cancelled)return;
    if(finishTimer!==null)clearTimeout(finishTimer);
    // 流式路径可能先发结束事件、后发收信事件；下一任务再读取最终原始正文。
    finishTimer=setTimeout(()=>{finishTimer=null;finishGeneration(run).catch(error=>autoNote(error.message));},0);
  }
  function assertRun(run) {
    if(disposed||needsReload||run.cancelled||generation!==run||identity()?.key!==run.key||stable(settings())!==run.config)throw Error('自动检查已取消：角色、聊天或设置已改变。');
    const message=context().chat?.[run.candidate];
    if(run.fingerprint&&messageKey(message,run.candidate)!==run.fingerprint)throw Error('AI消息已改变，取消本次自动检查。');
  }
  async function finishGeneration(run) {
    if(run.done||run.cancelled||generation!==run||disposed)return;
    run.done=true; // 同一次回复只消费一次；任何失败都不自动重试。
    if(busy||needsReload){autoNote('正在保存或需要刷新，本次不自动切换。');return;}
    try{
      assertRun(run);
      if(streamFailed(run))throw Error('生成被停止或流式回复失败，本次不自动切换。');
      const chat=context().chat||[],message=chat[run.candidate];
      if(!message||message.is_user||message.is_system||run.candidate!==chat.length-1)throw Error('本次没有最新的完整AI消息，保持当前篇章。');
      run.fingerprint=messageKey(message,run.candidate);
      if(run.baseline[run.candidate]===run.fingerprint)throw Error('消息没有更新，不使用历史回复触发切换。');
      const now=wlogDate(message.mes),reports=[];
      busy=true;controls();
      for(const name of run.books) {
        assertRun(run);
        const config=bookSettings(settings(),name);
        if(!config.auto)continue;
        const data=await read(name);assertRun(run);
        const entries=identify(Object.values(data.entries)).entries;
        const active=entries.filter(e=>!e.disable);
        if(active.length!==1){reports.push(name+'：时间线启用数量不是1，保持不变。');continue;}
        const current=active[0],targetId=config.links.find(l=>l.from===current.uid)?.to;
        if(targetId===undefined){reports.push(name+'：'+current.comment+' 未设置接续，保持不变。');continue;}
        if(linkCycle(config.links,current.uid)){reports.push(name+'：接续链有循环，保持不变。');continue;}
        const next=entries.find(e=>e.uid===targetId);
        if(!next||next.uid===current.uid){reports.push(name+'：接续条目失效，保持不变。');continue;}
        let handoff;
        try{handoff=threshold(current);}catch(error){reports.push(name+'：'+error.message);continue;}
        const cmp=compareDate(now,handoff.value);
        if(cmp<0||(cmp===0&&handoff.strict)){reports.push(name+'：当前 '+dateLabel(now)+'；等待 '+handoff.label);continue;}
        await writeBook(name,next.uid,data,()=>assertRun(run));
        reports.push(name+'：已自动接续到 '+next.comment+'。每次回复最多接续一篇。');
      }
      autoNote(reports.join('\n')||'当前绑定世界书未开启自动模式。');
    }catch(error){autoNote((needsReload?'保存结果需核对，请刷新整个酒馆网页：':'本次保持当前篇章：')+error.message);}
    finally{busy=false;controls();if(!disposed&&!needsReload&&!panel.hidden)await refresh();}
  }
  function installEvents() {
    try{
      const events=context().eventTypes;
      if(typeof eventOn!=='function'||!events?.GENERATION_STARTED||!events?.GENERATION_ENDED||!events?.MESSAGE_RECEIVED||!events?.GENERATION_STOPPED||!events?.CHAT_CHANGED)throw Error('缺少完整生成事件接口，自动模式暂不可用；手动切换仍可使用。');
      autoAvailable=true;
      subscriptions.push(eventOn(events.GENERATION_STARTED,generationStart),eventOn(events.MESSAGE_RECEIVED,received),eventOn(events.GENERATION_ENDED,ended),eventOn(events.GENERATION_STOPPED,()=>cancelGeneration('生成已停止，本次不自动切换。')),eventOn(events.CHAT_CHANGED,()=>cancelGeneration('聊天已切换；等待新回复，不扫描历史消息。')));
    }catch(error){autoNote(error.message);}
  }
  autoNote(autoMessage);

  // The Hub owns the orb, drag listeners and the existing dock storage key.
  let picker=null,pickerSerial=0,panelOpen=false,closeTimer=null;
  const orb=hubShell.orb;
  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
  function viewport(){return {width:host.innerWidth,height:host.innerHeight};}
  function placeDock(){hubShell.placeDock();}
  function closePicker(restoreFocus=false){if(!picker)return;const old=picker;picker=null;old.trigger.setAttribute('aria-expanded','false');old.popup.remove();if(restoreFocus&&old.trigger.isConnected)old.trigger.focus();}
  function upgradeSelect(select,row){
    select.hidden=true;select.tabIndex=-1;
    const trigger=doc.createElement('button');trigger.type='button';trigger.className='ts-route-trigger';trigger.setAttribute('data-routing-trigger','');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
    const label=doc.createElement('span');trigger.appendChild(label);
    function sync(){const option=Array.from(select.children).find(o=>o.value===select.value);label.textContent=option?.textContent||'不自动切换';trigger.title=label.textContent;trigger.setAttribute('aria-label',(select.getAttribute('aria-label')||'自动接续到')+'：'+label.textContent);}
    sync();select.addEventListener('change',sync);row.querySelector('.ts-routing').appendChild(trigger);
    function show(fromEnd=false){
      if(trigger.disabled||busy||needsReload)return;
      if(picker?.trigger===trigger){closePicker(true);return;}
      closePicker();
      const popup=doc.createElement('div');popup.className='ts-picker';popup.id='meeme-ts-picker-'+(++pickerSerial);popup.setAttribute('role','listbox');popup.setAttribute('aria-label',select.getAttribute('aria-label')||'自动接续到');
      const options=Array.from(select.children),buttons=[];
      options.forEach(option=>{const b=doc.createElement('button');b.type='button';b.tabIndex=-1;b.setAttribute('role','option');b.setAttribute('aria-selected',String(option.value===select.value));b.textContent=option.textContent;b.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new host.Event('change',{bubbles:true}));sync();closePicker(true);});popup.appendChild(b);buttons.push(b);});
      root.appendChild(popup);trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls',popup.id);picker={popup,trigger};
      const rect=trigger.getBoundingClientRect(),v=viewport(),width=Math.min(Math.max(260,rect.width),v.width-16),spaceBelow=v.height-rect.bottom-12,spaceAbove=rect.top-12;
      const below=spaceBelow>=Math.min(240,spaceAbove),height=Math.max(1,Math.min(320,below?spaceBelow:spaceAbove));
      Object.assign(popup.style,{left:clamp(rect.left,8,Math.max(8,v.width-width-8))+'px',top:(below?rect.bottom+5:Math.max(8,rect.top-height-5))+'px',width:width+'px',maxHeight:height+'px'});
      let index=fromEnd?buttons.length-1:Math.max(0,options.findIndex(o=>o.value===select.value));
      function focus(i){index=(i+buttons.length)%buttons.length;buttons[index]?.focus();}
      popup.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();focus(event.key==='Home'?0:event.key==='End'?buttons.length-1:index+(event.key==='ArrowDown'?1:-1));}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closePicker(true);}else if(event.key==='Tab'){closePicker(true);}});
      buttons.forEach((b,i)=>b.addEventListener('focus',()=>{index=i;}));focus(index);
    }
    trigger.addEventListener('click',()=>show());
    trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();show(event.key==='ArrowUp');}});
  }
  function hidePanel(){
    panelOpen=false;closePicker();root.setAttribute('data-open','false');panel.inert=true;
    clearTimeout(closeTimer);closeTimer=setTimeout(()=>{if(!panelOpen)panel.hidden=true;},180);
    if(panel.contains(doc.activeElement))orb.focus();
  }
  function open(){
    clearTimeout(closeTimer);panelOpen=true;panel.hidden=false;panel.inert=false;placeDock();panel.getBoundingClientRect();root.setAttribute('data-open','true');refresh();
  }
  function outsidePointer(event){if(picker&&!picker.popup.contains(event.target)&&!picker.trigger.contains(event.target))closePicker();}
  function globalKey(event){if(event.key==='Escape'&&panelOpen&&!picker){hidePanel();}}
  function resized(){closePicker();}
  function panelScrolled(){closePicker();}
  root.querySelector('[data-close]').onclick=hidePanel;
  doc.addEventListener('pointerdown',outsidePointer,true);doc.addEventListener('keydown',globalKey);host.addEventListener('resize',resized);panel.addEventListener('scroll',panelScrolled);
  function cleanupPresentation(){clearTimeout(closeTimer);closePicker();doc.removeEventListener('pointerdown',outsidePointer,true);doc.removeEventListener('keydown',globalKey);host.removeEventListener('resize',resized);panel.removeEventListener('scroll',panelScrolled);}
  placeDock();

  root.querySelector('[data-refresh]').onclick=refresh;
  let lastKey;
  try { lastKey=identity()?.key; } catch (_) {}
  const timer=setInterval(()=>{
    try {paintTimelineCard();const key=identity()?.key; if (key!==lastKey) {lastKey=key;epoch++;closePicker();cancelGeneration("角色或聊天已切换；等待新回复，不扫描历史消息。");snapshot=null;list.replaceChildren();if(!panel.hidden&&!busy)refresh();}}
    catch(error){snapshot=null;list.replaceChildren();status.textContent=error.message;}
  },800);
  function cleanup(){if(disposed)return;cleanupPresentation();cancelGeneration();subscriptions.forEach(s=>s.stop());disposed=true;epoch++;clearInterval(timer);view.remove();if(host[KEY]?.root===root)delete host[KEY];}
  installEvents();
  host[KEY]={open,root,close:hidePanel,closePicker,dispose:cleanup};
  window.addEventListener('pagehide',cleanup,{once:true});
  window.addEventListener('unload',cleanup,{once:true});
})();
