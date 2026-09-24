async function runPolisherChecks(check) {
  const id='miemie.polisher', p=selector=>document.querySelector('#meeme-translation '+selector);
  const runtime=()=>__MieMieHub.extensions;
  const input=(selector,value,type='input')=>{const node=p(selector);node.value=value;node.dispatchEvent(new Event(type,{bubbles:true}));};
  const clickP=selector=>click('#meeme-translation '+selector);
  const completed=()=>p('[data-translate]').getAttribute('data-working')==='false';
  const eventCounts=()=>JSON.stringify([...events].map(([name,set])=>[name,set.size]));
  let liveCounts=eventCounts();
  await check('两种模式、提示词创建编辑及 JSON 导入导出保持可用',async()=>{
    await runtime().open(id);clickP('[data-mode]');
    assert(p('[data-mode]').textContent.includes('翻译模式'),'模式未切换');
    clickP('[data-template-current] button');clickP('[data-template-new]');
    input('[data-edit-name]','迁移测试词库');input('[data-edit-target]','简体中文');input('[data-edit-rules]','迁移测试要求');clickP('[data-template-confirm]');
    const entry=variables.meeme_translation_v1.library.find(x=>x.name==='迁移测试词库');assert(entry?.data.rules==='迁移测试要求','词库编辑未保存');
    const select=p('[data-template-list] [aria-label="选用：迁移测试词库"]');select.click();
    let exported;
    const originalCreate=URL.createObjectURL,originalClick=HTMLAnchorElement.prototype.click;
    URL.createObjectURL=blob=>{exported=blob;return originalCreate.call(URL,blob);};HTMLAnchorElement.prototype.click=function(){};
    try{p('[data-template-current] [aria-label="导出：迁移测试词库"]').click();}finally{URL.createObjectURL=originalCreate;HTMLAnchorElement.prototype.click=originalClick;}
    const exportedData=JSON.parse(await exported.text());assert(exportedData.format==='meeme-prompt'&&exportedData.rules==='迁移测试要求','导出协议改变');
    const imported={...exportedData,name:'导入测试提示词'};
    // jsdom has no OS file picker/DataTransfer. Supply the selected File, then run the real import handler.
    const file=new File([JSON.stringify(imported)],'prompt.json',{type:'application/json'});
    Object.defineProperty(p('[data-template-file]'),'files',{configurable:true,value:[file]});
    p('[data-template-file]').dispatchEvent(new Event('change'));
    await until(()=>variables.meeme_translation_v1.library.some(x=>x.name==='导入测试提示词'),'提示词导入');
    clickP('[data-mode]');assert(p('[data-mode]').textContent.includes('润色模式'),'润色模式丢失');
  });
  await check('模型列表、连接测试、术语与前后置提示词、标签保护及调试保持可用',async()=>{
    input('[data-term-text]','Hero = 英雄');input('[data-pre-text]','前置校验');input('[data-post-text]','后置校验');
    input('[data-pre-role]','user','change');input('[data-post-role]','assistant','change');input('[data-protected-tags]','<image>');
    clickP('[data-models]');await until(()=>p('[data-model-list]').options.length===3,'模型列表');
    clickP('[data-test]');await until(()=>p('[data-api-status]').textContent.includes('连接成功'),'连接测试');
    ctx.chat.at(-1).mes='<story_scene>开始<image>不许发送的图片内容</image>结尾</story_scene><wlog>保留日志</wlog>';
    await emit('MESSAGE_EDITED');responseText='已处理<mm_protected_0/>结尾';
    clickP('[data-translate]');await until(completed,'保护标签处理');
    assert(ctx.chat.at(-1).mes==='<story_scene>已处理<image>不许发送的图片内容</image>结尾</story_scene><wlog>保留日志</wlog>','保护标签或外部正文变化');
    const request=probeRequests.at(-1).body;const serialized=JSON.stringify(request);
    assert(serialized.includes('mm_protected_0')&&!serialized.includes('不许发送的图片内容'),'保护内容泄露到处理请求');
    assert(serialized.includes('Hero')&&serialized.includes('前置校验')&&serialized.includes('后置校验'),'术语或前后置提示词缺失');
    assert(request.messages[0].role==='user'&&request.messages.at(-1).role==='assistant','前后置身份改变');
    clickP('[data-debug]');assert(p('[data-log]').textContent.includes('已写回')&&!p('[data-log]').textContent.includes('fixture-test-key'),'调试错误');
    responseText='处理后的正文。';
  });
  await check('自动润色仍在完整 AI 回复结束后执行',async()=>{
    clickP('[data-auto]');await emit('GENERATION_STARTED','normal',{},false);await emit('GENERATION_AFTER_COMMANDS');
    ctx.chat.push({is_user:false,mes:'<story_scene>自动处理原文</story_scene>',swipe_id:0});
    await emit('GENERATION_ENDED');await until(()=>ctx.chat.at(-1).mes.includes('处理后的正文。')&&completed(),'自动润色');clickP('[data-auto]');
  });
  await check('停用移除润色面板、入口与订阅，撤销 Hook，设置和备份不变',async()=>{
    const data=JSON.stringify(variables.meeme_translation_v1),key=localStorage.getItem('meeme_translation_key_v1');
    const oldPanel=window.__meemeTranslation01.panel;
    await runtime().disable(id);
    assert(!document.querySelector('#meeme-translation')&&!document.querySelector('[data-hub-app="miemie.polisher"]')&&!window.__meemeTranslation01,'停用残留润色');
    assert(window.fetch===fixtureFetch,'停用未撤销 Hook');assert((await runtime().open(id)).ok===false,'停用仍能打开');
    assert([...oldPanel.querySelectorAll('*')].every(el=>!el.onclick&&!el.oninput&&!el.onchange&&!el.onkeydown),'旧节点保留回调');
    assert(JSON.stringify(variables.meeme_translation_v1)===data&&localStorage.getItem('meeme_translation_key_v1')===key,'停用改变数据');
    await runtime().open('miemie.hello');await menu();click('[data-hub-app="miemie.timeline"]');await until(()=>document.querySelectorAll('.ts-choice').length===2,'停用后时间线');
    for(let i=0;i<3;i++) {await runtime().enable(id);assert(eventCounts()===liveCounts,'重新启用叠加订阅');if(i<2)await runtime().disable(id);}
    assert(document.querySelectorAll('#meeme-translation').length===1&&document.querySelectorAll('[data-hub-app="miemie.polisher"]').length===1,'实例或入口重复');
    await runtime().open(id);clickP('[data-restore]');await until(()=>ctx.chat.at(-1).mes.includes('自动处理原文')&&p('[data-restore]').textContent==='查看处理结果','重新启用保留恢复能力');
  });
  await check('处理中停用立即取消请求、解除发送拦截，迟到响应不写回',async()=>{
    requestMode='defer';pendingRequest=null;clickP('[data-translate]');await until(()=>pendingRequest,'等待处理请求');
    const request=pendingRequest,original=ctx.chat.at(-1).mes;
    const prevented=new MouseEvent('click',{bubbles:true,cancelable:true});document.querySelector('#send_but').dispatchEvent(prevented);assert(prevented.defaultPrevented,'处理未拦截用户发送');
    const waitingGeneration=emit('GENERATION_STARTED','normal',{},false);
    await runtime().disable(id);await Promise.race([waitingGeneration,waits(500).then(()=>{throw Error('生成等待未释放');})]);
    assert(request.signal.aborted,'处理请求未取消');assert(hostTimers.size===0,'停用后存在处理计时器');
    const send=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});document.querySelector('#send_textarea').dispatchEvent(send);assert(!send.defaultPrevented,'停用后仍拦截发送');
    const data=JSON.stringify(variables.meeme_translation_v1);
    request.resolve(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({translations:['迟到结果不应写入']})},finish_reason:'stop'}]})));
    await waits(50);assert(ctx.chat.at(-1).mes===original&&JSON.stringify(variables.meeme_translation_v1)===data,'迟到结果覆盖正文或设置');
    requestMode='normal';await emit('GENERATION_ENDED');await runtime().enable(id);assert(eventCounts()===liveCounts,'取消后订阅重复');
  });
  await check('连接测试和模型列表请求在停用时也会取消',async()=>{
    for(const kind of ['test','models']) {
      await runtime().open(id);requestMode='defer';pendingRequest=null;clickP('[data-'+kind+']');await until(()=>pendingRequest,'等待 '+kind);
      const request=pendingRequest;await runtime().disable(id);assert(request.signal.aborted,kind+' 未取消');
      request.resolve(new Response('{}'));requestMode='normal';await runtime().enable(id);
    }
  });
  await check('写回已发生但界面刷新尚未完成时停用，仍保留可恢复备份',async()=>{
    await runtime().open(id);ctx.chat.at(-1).mes='<story_scene>写回前原文</story_scene>';await emit('MESSAGE_EDITED');
    delayedWrite={};clickP('[data-translate]');await until(()=>delayedWrite.resolve,'等待消息刷新');
    assert(ctx.chat.at(-1).mes.includes('处理后的正文'),'没有触发写回');
    const release=delayedWrite.resolve,saves=saveCount;await runtime().disable(id);assert(saveCount===saves+1,'已写回的正文没有保存');delayedWrite=null;release();await waits(30);
    await runtime().enable(id);await runtime().open(id);assert(!p('[data-restore]').disabled,'写回中停用丢失备份');
    clickP('[data-restore]');await until(()=>ctx.chat.at(-1).mes==='<story_scene>写回前原文</story_scene>'&&p('[data-restore]').textContent==='查看处理结果','恢复写回前原文');
  });
  await check('其他脚本后加 fetch 包装时，停用不会破坏对方且旧润色 Hook 失效',async()=>{
    const polishFetch=window.fetch;let peerCalls=0;
    const peer=function(input,init){peerCalls++;return polishFetch(input,init);};window.fetch=peer;
    await runtime().disable(id);assert(window.fetch===peer,'覆盖其他脚本的 Hook');
    const payload={messages:[{role:'assistant',content:'<story_scene>保持原请求</story_scene>'}]};
    await fetch('/api/backends/chat-completions/generate',{body:JSON.stringify(payload)});
    assert(peerCalls===1&&interceptedMain.messages[0].content===payload.messages[0].content,'遗留 Hook 仍处理正文');
    await runtime().enable(id);await runtime().disable(id);assert(window.fetch===peer,'重启后破坏其他 Hook');window.fetch=fixtureFetch;await runtime().enable(id);
  });
  await check('润色初始化部分失败能清理资源，Hello 与时间线继续可用',async()=>{
    await runtime().disable(id);const offCounts=eventCounts(),originalOn=__fixture.eventOn;let calls=0;
    __fixture.eventOn=(...args)=>{if(++calls===3)throw Error('模拟订阅失败');return originalOn(...args);};
    try{assert(!(await runtime().enable(id)).ok,'应当启用失败');}finally{__fixture.eventOn=originalOn;}
    assert(eventCounts()===offCounts&&!document.querySelector('#meeme-translation')&&window.fetch===fixtureFetch,'半初始化资源残留');
    assert((await runtime().open('miemie.hello')).ok,'Hello 被影响');await menu();click('[data-hub-app="miemie.timeline"]');await until(()=>document.querySelectorAll('.ts-choice').length===2,'错误后时间线');
    assert((await runtime().enable(id)).ok,'错误后无法重新启用');
  });
  await check('停用及卸载状态跨页面重载保留，管理页重新注册恢复旧设置',async()=>{
    await runtime().disable(id);await unmount();await mount();assert(runtime().get(id).state==='disabled'&&!document.querySelector('#meeme-translation'),'重载后自行启用');
    await runtime().enable(id);const data=JSON.stringify(variables.meeme_translation_v1);
    await runtime().uninstall(id);assert(!runtime().get(id)&&!document.querySelector('#meeme-translation'),'卸载残留');
    assert(JSON.stringify(variables.meeme_translation_v1)===data,'卸载删除用户数据');await unmount();await mount();assert(!runtime().get(id),'重载后卸载扩展复活');
    await manage();click('[data-action="miemie.polisher:register"]');await until(()=>runtime().get(id)?.enabled,'润色重新注册');
    assert(JSON.stringify(variables.meeme_translation_v1)===data,'重新注册改变旧数据');
  });
  await check('润色脚本单独移除清理实例，重新载入保留原启用偏好',async()=>{
    await removeFrame(polisherFrame);polisherFrame=null;
    assert(!runtime().get(id)&&window.fetch===fixtureFetch&&!document.querySelector('#meeme-translation'),'脚本停止未清理');
    assert(window.__timelineSwitcherV1&&(await runtime().open('miemie.hello')).ok,'影响 Core');
    await loadPolisher();assert(runtime().get(id).enabled,'脚本重载未恢复');
  });
  await check('Core 可单独运行；扩展先于 Core 载入，以及 Core 单独重载均正常',async()=>{
    await unmount();await mount('core');assert(!runtime().get(id)&&!document.querySelector('#meeme-translation')&&window.fetch===fixtureFetch,'Core 隐含启动润色');
    await unmount();polisherFrame=await loadFrame('polisher');await window.__MieMiePolisherSource.settled();assert(document.querySelector('#meeme-translation')&&window.__MieMiePolisherSource.mode==='standalone','无Core独立润色未启动');
    await mount('core');await until(()=>runtime().get(id)?.enabled,'先加载扩展后加载 Core');
    await removeFrame(frame);frame=null;assert(document.querySelectorAll('#meeme-translation').length===1&&window.__MieMiePolisherSource.mode==='standalone','Core停用未恢复独立润色');
    await mount('core');await until(()=>runtime().get(id)?.enabled,'Core 单独重载');
    assert(document.querySelectorAll('#meeme-translation').length===1,'Core 重启重复实例');
  });
}
