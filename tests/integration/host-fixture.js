/* Node/jsdom integration host; consumes only verified JSON artifacts. No real Tavern data or network. */
const logEl = document.querySelector('#fixture-log');
const log = text => {logEl.textContent += '\n' + text; window.__testLog(text);};
const clone = value => JSON.parse(JSON.stringify(value));
const waits = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {if (check()) return; await waits(15);}
  throw Error('等待超时：' + label);
}
function assert(value, message) {if (!value) throw Error(message);}
const events = new Map(), activeTimers = new Set(), pageErrors = [];
window.addEventListener('error', event => pageErrors.push(event.message));
window.addEventListener('unhandledrejection', event => pageErrors.push(String(event.reason)));
const hostTimers=new Set(), nativeTimeout=window.setTimeout.bind(window), nativeClearTimeout=window.clearTimeout.bind(window), nativeInterval=window.setInterval.bind(window), nativeClearInterval=window.clearInterval.bind(window);
window.setTimeout=(fn,ms,...args)=>{const timer=nativeTimeout(()=>{hostTimers.delete(timer);fn(...args);},ms);if(ms>=1000)hostTimers.add(timer);return timer;};
window.clearTimeout=id=>{hostTimers.delete(id);return nativeClearTimeout(id);};
window.setInterval=(...args)=>{const timer=nativeInterval(...args);hostTimers.add(timer);return timer;};
window.clearInterval=id=>{hostTimers.delete(id);return nativeClearInterval(id);};
const seedVariables = {
  timeline_switcher_v2: {version: 1, books: [{name: '测试世界书', auto: false, links: [{from: 1, to: 2}]}]},
  meeme_translation_v1: {
    config: {base: 'https://fixture.invalid/v1', model: 'fixture-model', maxTokens: 8192, timeoutSeconds: 300, thinkingMode: 'default', protectedTags: 'image'},
    cards: {'fixture-hero.png': {mode: 'polish', target: '简体中文', polishRules: '保留事实，润色文字。', rules: '保持段落。', terms: '咩咩 = 咩咩', prePrompt: {text: '测试前置', role: 'system'}, postPrompt: {text: '', role: 'system'}, sendOriginal: true, selections: {polish: 'fixture-polish', translate: 'fixture-translate'}}},
    library: [{id: 'fixture-polish', mode: 'polish', name: '测试润色', data: {target: '简体中文', rules: '保留事实，润色文字。'}}, {id: 'fixture-translate', mode: 'translate', name: '测试翻译', data: {target: '简体中文', rules: '保持段落。'}}],
    backups: [],
  },
};
let variables, worldbook, frame, polisherFrame, pendingRequest, requestMode = "normal", responseText = "处理后的正文。", probeRequests = [], delayedWrite = null, saveCount = 0, externalRequests = 0, fetchCalls = 0, interceptedMain = null;
const hubReleaseRequests = [];
const eventNames = ['GENERATION_STARTED', 'GENERATION_ENDED', 'MESSAGE_RECEIVED', 'GENERATION_STOPPED', 'CHAT_CHANGED', 'GENERATION_AFTER_COMMANDS', 'CHAT_COMPLETION_SETTINGS_READY', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_UPDATED'];
const ctx = {
  characterId: 0, characters: [{name: '测试角色', avatar: 'fixture-hero.png'}], chatId: 'fixture-chat', groupId: null, mainApi: 'openai', streamingProcessor: null,
  eventTypes: Object.fromEntries(eventNames.map(name => [name, name])), chat: [],
  getRequestHeaders: () => ({'Content-Type': 'application/json'}),
  loadWorldInfo: async () => clone(worldbook),
  saveWorldInfo: async (_name, data) => {worldbook = clone(data);},
  reloadWorldInfoEditor() {},
  saveChat: async () => {saveCount++;},
  stopGeneration: () => emit('GENERATION_STOPPED'),
};
window.SillyTavern = {getContext: () => ctx};
function resetBusiness() {
  variables = clone(seedVariables);
  worldbook = {entries: {
    1: {uid: 1, comment: '序章', disable: false, content: '<world_timeline>\n事件一：序章结尾（60年3月15日 10:00）：结束\n</world_timeline>'},
    2: {uid: 2, comment: '第二章', disable: true, content: '<world_timeline>\n事件一：第二章结尾（60年3月20日）：结束\n</world_timeline>'},
    3: {uid: 3, comment: '普通设定', disable: false, content: '不应被时间线修改。'},
  }};
  ctx.chatId = 'fixture-chat';
  ctx.chat = [{is_user: false, is_system: false, mes: '<story_scene>原始正文。</story_scene><wlog time="60年3月14日 10:00">日志</wlog>', swipe_id: 0}];
  saveCount = 0; interceptedMain = null;
}
resetBusiness();
async function fixtureFetch(input, init) {
  fetchCalls++;
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (url.origin === location.origin && url.pathname === '/api/worldinfo/get') return new Response(JSON.stringify(worldbook), {headers: {'Content-Type': 'application/json'}});
  if (url.origin === location.origin && url.pathname === '/api/backends/chat-completions/generate') {
    interceptedMain = JSON.parse(init.body);
    return new Response(JSON.stringify({ok: true}), {headers: {'Content-Type': 'application/json'}});
  }
  if (url.hostname === 'fixture.invalid') {
    probeRequests.push({url: url.href, init, body: init?.body ? JSON.parse(init.body) : null});
    if (requestMode === 'defer') return new Promise(resolve => {pendingRequest = {resolve, signal: init.signal};});
    if (url.pathname.endsWith('/models')) return new Response(JSON.stringify({data:[{id:'fixture-model'},{id:'fixture-other'}]}));
    return new Response(JSON.stringify({choices: [{message: {content: JSON.stringify({translations: [responseText]})}, finish_reason: 'stop'}]}), {headers: {'Content-Type': 'application/json'}});
  }
  externalRequests++; throw Error('模拟环境阻止外部请求：' + url.origin);
}
window.fetch = fixtureFetch;
window.__fixture = {
  pageErrors,
  async hubReleaseFetch(url, init) {
    assert(url === 'https://api.github.com/repos/SheepSheepLab/MieMie-Hub/releases?per_page=100&page=1', 'Hub 请求了错误的地址');
    assert(init.method === 'GET' && init.credentials === 'omit' && init.referrerPolicy === 'no-referrer' && !init.body, 'Hub 请求包含多余数据');
    assert(JSON.stringify(init.headers) === JSON.stringify({Accept: 'application/vnd.github+json'}), 'Hub 请求包含多余 Header');
    hubReleaseRequests.push({url, init});
    return new Response(JSON.stringify([{tag_name: 'v' + __MieMieHub.version, draft: false, prerelease: true}]));
  },
  getVariables: spec => clone(variables[spec.extension_id] || {}),
  replaceVariables: (value, spec) => {variables[spec.extension_id] = clone(value);},
  getCharWorldbookNames: () => ({primary: '测试世界书', additional: []}),
  eventOn(name, callback) {
    const handlers = events.get(name) || new Set(); handlers.add(callback); events.set(name, handlers);
    return {stop() {handlers.delete(callback);}};
  },
  async setChatMessages(messages) {
    for (const item of messages) {ctx.chat[item.message_id].mes = item.message; if (ctx.chat[item.message_id].swipes) ctx.chat[item.message_id].swipes[ctx.chat[item.message_id].swipe_id || 0] = item.message;}
    if (delayedWrite) await new Promise(resolve => {delayedWrite.resolve = resolve;});
    await emit('MESSAGE_UPDATED');
  },
  formatAsTavernRegexedString: value => value,
};
async function emit(name, ...args) {for (const fn of [...(events.get(name) || [])]) await fn(...args);}
async function removeFrame(item) {
  if (!item) return;
  const source = window.__MieMiePolisherSource, hub = window.__MieMieHub;
  item.contentWindow.dispatchEvent(new Event('pagehide'));
  if (hub && window.__MieMieHub !== hub) await hub.whenDisposed;
  if (source) await source.settled();
  item.remove(); await waits(5);
}
async function unmount() {
  await removeFrame(polisherFrame); polisherFrame=null;
  await removeFrame(frame); frame=null;
}
async function loadFrame(kind) { return window.__loadArtifact(kind); }
async function loadPolisher() {
  const previous=JSON.parse(localStorage.getItem('miemie_hub_extensions_v1'))?.extensions?.['miemie.polisher'];
  polisherFrame=await loadFrame('polisher');
  // Read the preference before registration temporarily persists enabled:false.
  await until(()=>previous?.registered===false
    ? !window.__MieMieHub?.extensions.get('miemie.polisher')
    : previous?.enabled===false
      ? window.__MieMieHub?.extensions.get('miemie.polisher')?.state==='disabled'
      : window.__MieMieHub?.extensions.get('miemie.polisher')?.enabled, '扩展载入');
}
async function mount(kind='hub') {
  frame=await loadFrame('hub');
  await until(()=>window.__MieMieHub,'脚本载入');
  if(window.__MieMieHub)await window.__MieMieHub.ready;
  if(kind==='hub')await loadPolisher();
}
function click(selector) {const el = document.querySelector(selector); assert(el && !el.disabled, '找不到可点击元素：' + selector); el.click();}
async function menu() {await __MieMieHub.open(); await until(() => document.querySelector('#meeme-combined-menu')?.dataset.open === 'true', '菜单打开');}
async function manage() {await menu(); click('[data-hub-app="extension-center"]'); await until(() => !document.querySelector('[data-hub-panel="extension-center"]').hidden, '扩展中心');click('[data-center-tab="installed"]');await waits(5);}
const registered = () => __MieMieHub.extensions.get('miemie.hello');
const launcher = () => document.querySelector('[data-hub-app="miemie.hello"]');
const messagePanel = () => document.querySelector('[data-hub-panel="message"]');
function resetLocal() {
  localStorage.removeItem('miemie_hub_extensions_v1');
  localStorage.setItem('meeme_timeline_dock_v1', JSON.stringify({side: 'right', ratio: .72}));
  localStorage.setItem('meeme_translation_key_v1', JSON.stringify({base: 'https://fixture.invalid/v1', key: 'fixture-test-key'}));
}
async function runTests() {
  const button = document.querySelector('#run-tests'); button.disabled = true;
  const results = []; logEl.textContent = '正在运行本地 DOM 组合测试…';
  async function check(name, fn) {await fn(); results.push(name); log('✓ ' + name);}
  try {
    await unmount(); resetLocal(); resetBusiness();
    await mount();
    await check('产物协作后保留旧设置、密钥、提示词和时间线关系', async () => {
      const polisher = __MieMieHub.extensions.get('miemie.polisher');
      assert(polisher?.enabled && polisher.manifest.name === '咩咩润色工具', 'Polisher 身份或显示名称错误');
      assert(!__MieMieHub.extensions.get('miemie.translation'), '仍注册了旧 Extension ID');
      assert(document.querySelector('[data-hub-app="miemie.polisher"]')?.textContent.includes('咩咩润色'), 'Launcher 名称错误');
      for(const key of ['base','model','maxTokens','timeoutSeconds','thinkingMode','protectedTags']) assert(variables.meeme_translation_v1.config[key]===seedVariables.meeme_translation_v1.config[key], '原配置变化：'+key);
      for(const template of seedVariables.meeme_translation_v1.library) assert(variables.meeme_translation_v1.library.some(x=>x.id===template.id&&JSON.stringify(x.data)===JSON.stringify(template.data)), '原提示词变化');
      assert(JSON.stringify(variables.timeline_switcher_v2)===JSON.stringify(seedVariables.timeline_switcher_v2), '时间线关系变化');
      assert(JSON.parse(localStorage.getItem('meeme_translation_key_v1')).key === 'fixture-test-key', '密钥变化');
      assert(JSON.parse(localStorage.getItem('meeme_timeline_dock_v1')).ratio === .72, '球位置变化');
    });
    await check('扩展中心与设置作为 Core 入口共存，版本与实际 Hub 一致', async () => {
      const ids = JSON.stringify(__MieMieHub.extensions.list().map(item => item.manifest.id));
      await menu();
      for (const id of ['miemie.timeline', 'extension-center', 'settings', 'miemie.hello', 'miemie.polisher']) {
        assert(document.querySelectorAll('[data-hub-app="' + id + '"]').length === 1, '入口缺失或重复：' + id);
      }
      click('[data-hub-app="extension-center"]');
      const center = document.querySelector('[data-hub-panel="extension-center"]');
      await until(() => !center.hidden, '扩展中心打开');
      for(const tab of ['discover','installed','mine']) assert(center.querySelector('[data-center-tab="'+tab+'"]'),'扩展中心分页缺失');
      assert(!document.querySelector('[data-hub-app="extensions"]'),'旧扩展管理入口未合并');
      await menu(); click('[data-hub-app="settings"]');
      await until(() => !document.querySelector('[data-hub-panel="settings"]').hidden, '设置打开');
      assert(center.hidden, '设置打开后扩展中心未关闭');
      assert(document.querySelector('[data-hub-version]').textContent === __MieMieHub.version, '设置版本与运行版本不一致');
      assert(JSON.stringify(__MieMieHub.extensions.list().map(item => item.manifest.id)) === ids, 'Core 入口改变了 Extension 注册列表');
    });
    await check('Hub 只查询自己的公开 Release 元数据，不经过润色 Hook，也不改变扩展状态', async () => {
      const before = fetchCalls, extensions = JSON.stringify(__MieMieHub.extensions.list());
      assert(hubReleaseRequests.length === 0, '未点击时出现版本检查');
      assert(document.querySelector('[data-hub-update-status]').textContent === '尚未检查', '初始更新状态错误');
      click('[data-hub-action="check-updates"]');
      await until(() => document.querySelector('[data-hub-update-status]').textContent === '✓ 已是最新版', '模拟 Release 查询');
      assert(hubReleaseRequests.length === 1 && fetchCalls === before, '查询没有隔离宿主请求与润色 Hook');
      assert(document.querySelector('[data-hub-latest-version]').textContent === __MieMieHub.version, '远程版本显示错误');
      assert(JSON.stringify(__MieMieHub.extensions.list()) === extensions, '检查更新改变了扩展状态');
      click('[data-hub-panel="settings"] .mm-return');
      await until(() => document.querySelector('#meeme-combined-menu').dataset.open === 'true', '设置返回菜单');
    });
    await check('Hello Mie 已注册，快捷入口只出现一次并能显示正确文本', async () => {
      assert(registered().enabled, '默认 Hello 未启用'); await menu();
      assert(document.querySelectorAll('[data-hub-app="miemie.hello"]').length === 1, '入口数量错误');
      click('[data-hub-app="miemie.hello"]');
      await until(() => !messagePanel().hidden && messagePanel().textContent.includes('咩咩Hub扩展系统运行正常'), 'Hello 文本');
    });
    await check('停用移除入口，旧回调不能重开；重新载入后保持停用', async () => {
      await manage(); click('[data-action="miemie.hello:toggle"]');
      await until(() => registered().state === 'disabled' && !launcher(), '停用');
      assert((await __MieMieHub.extensions.open('miemie.hello')).ok === false, '停用仍可打开');
      await unmount(); await mount(); assert(!registered().enabled && !launcher(), '刷新恢复了停用扩展');
    });
    await check('重新启用恢复入口，卸载清理窗口和记录；重新载入不会复活', async () => {
      await manage(); click('[data-action="miemie.hello:toggle"]'); await until(() => registered().enabled && launcher(), '重新启用');
      await menu(); click('[data-hub-app="miemie.hello"]'); await until(() => !messagePanel().hidden, '重新打开');
      await __MieMieHub.extensions.uninstall('miemie.hello');
      assert(!registered() && !launcher(), '卸载残留记录或入口');
      await until(() => messagePanel().hidden, '卸载关闭窗口');
      await unmount(); await mount(); assert(!registered() && !launcher(), '刷新后卸载扩展复活');
    });
    await check('管理页重新注册 Hello，重复注册不会产生两个实例', async () => {
      await manage(); click('[data-action="miemie.hello:register"]'); await until(() => registered()?.enabled, '重新注册');
      const result = __MieMieHub.extensions.register(registered().manifest, () => ({open() {throw Error('duplicate');}}));
      assert(!result.ok && document.querySelectorAll('[data-hub-app="miemie.hello"]').length === 1, '重复注册未阻止');
    });
    await check('无快捷入口的后台扩展可以启停和清理', async () => {
      let starts = 0, stops = 0;
      const runtime = __MieMieHub.extensions;
      runtime.register({schemaVersion: 1, apiVersion: 1, id: 'fixture.background', name: '后台测试', version: '0.1.0'}, api => ({activate() {starts++; api.onCleanup(() => stops++);}}));
      await runtime.enable('fixture.background'); assert(starts === 1 && !document.querySelector('[data-hub-app="fixture.background"]'), '后台扩展出现入口');
      await runtime.uninstall('fixture.background'); assert(stops === 1, '后台扩展没有清理');
    });
    await check('缺少 open 的 Launcher 被隐藏，扩展仍启用且可管理', async () => {
      const runtime = __MieMieHub.extensions, id = 'fixture.noopen';
      let starts = 0, stops = 0;
      runtime.register({schemaVersion: 1, apiVersion: 1, id, name: '无启动函数测试', version: '0.1.0', contributes: {launcher: {title: '无启动函数测试'}}}, () => ({activate() {starts++;}, deactivate() {stops++;}}));
      await runtime.enable(id); await manage();
      const card = document.querySelector('[data-extension-id="fixture.noopen"]');
      assert(starts === 1 && runtime.get(id).enabled && card?.textContent.includes('已启用'), '无 open 扩展未启用');
      assert(card.textContent.includes('Launcher 不可用') && !document.querySelector('[data-hub-app="fixture.noopen"]') && !card.querySelector('[data-action="fixture.noopen:open"]'), '警告或入口状态错误');
      click('[data-action="fixture.noopen:toggle"]'); await until(() => runtime.get(id).state === 'disabled', '后台停用');
      assert(stops === 1, '后台未停用'); await runtime.uninstall(id);
    });
    await check('打开抛错保留启用与资源，显式卸载才执行清理', async () => {
      let cleaned = 0;
      const runtime = __MieMieHub.extensions;
      runtime.register({schemaVersion: 1, apiVersion: 1, id: 'fixture.fault', name: '故障测试', version: '0.1.0', contributes: {launcher: {title: '故障测试'}}}, api => {
        api.onCleanup(() => cleaned++); api.onCleanup(() => {throw Error('预期清理故障');});
        return {open() {throw Error('预期打开故障');}, deactivate() {throw Error('预期停用故障');}};
      });
      await runtime.enable('fixture.fault'); await menu(); click('[data-hub-app="fixture.fault"]');
      await until(() => runtime.get('fixture.fault').launcherError.includes('扩展界面打开失败'), 'Launcher 错误提示');
      assert(cleaned === 0 && runtime.get('fixture.fault').enabled && registered().enabled && document.querySelector('[data-hub-app="fixture.fault"]'), '打开失败破坏生命周期');
      await runtime.uninstall('fixture.fault');
      assert(cleaned === 1 && !document.querySelector('[data-hub-app="fixture.fault"]'), '卸载未完成清理');
      await runtime.open('miemie.hello'); await until(() => !messagePanel().hidden, '故障后 Hello');
    });
    await check('故障后时间线仍可读取和手动切换，普通世界书条目不变', async () => {
      await menu(); click('[data-hub-app="miemie.timeline"]');
      await until(() => document.querySelectorAll('.ts-choice').length === 2, '时间线列表');
      document.querySelectorAll('.ts-choice')[1].click();
      await until(() => !worldbook.entries[2].disable && worldbook.entries[1].disable, '切到第二章');
      assert(worldbook.entries[3].disable === false && worldbook.entries[3].content === '不应被时间线修改。', '普通条目被改变');
      await until(() => !document.querySelectorAll('.ts-choice')[0].disabled, '保存结束');
      document.querySelectorAll('.ts-choice')[0].click(); await until(() => !worldbook.entries[1].disable, '切回序章');
    });
    await check('时间线自动接续仍按新回复推进', async () => {
      await until(() => document.querySelector('.ts-mode-button') && !document.querySelector('.ts-mode-button').disabled, '模式按钮');
      click('.ts-mode-button'); await emit('GENERATION_STARTED', 'normal', {}, false); await emit('GENERATION_AFTER_COMMANDS');
      ctx.chat.push({is_user: false, mes: '<story_scene>新的原始正文。</story_scene><wlog time="60年3月16日 10:00">日志</wlog>', swipe_id: 0});
      await emit('MESSAGE_RECEIVED', ctx.chat.length - 1, 'normal'); await emit('GENERATION_ENDED');
      await until(() => !worldbook.entries[2].disable && worldbook.entries[1].disable, '自动接续');
    });
    await check('原润色可以写回、恢复，并在发送时换回原文', async () => {
      await menu(); click('[data-hub-app="miemie.polisher"]');
      await until(() => !document.querySelector('#meeme-translation section').hidden, '润色面板');
      const original = ctx.chat.at(-1).mes;
      click('#meeme-translation [data-translate]');
      await until(() => ctx.chat.at(-1).mes.includes('处理后的正文。'), '润色写回');
      await until(() => !document.querySelector('#meeme-translation [data-restore]').disabled, '处理结束');
      click('#meeme-translation [data-restore]'); await until(() => ctx.chat.at(-1).mes === original && document.querySelector('#meeme-translation [data-restore]').textContent === '查看处理结果', '恢复原文并完成保存');
      click('#meeme-translation [data-restore]'); await until(() => ctx.chat.at(-1).mes.includes('处理后的正文。') && document.querySelector('#meeme-translation [data-restore]').textContent === '查看原文', '恢复结果并完成保存');
      await emit('GENERATION_STARTED', 'normal', {}, false); await emit('GENERATION_AFTER_COMMANDS');
      const payload = {messages: [{role: 'assistant', content: ctx.chat.at(-1).mes}]};
      await emit('CHAT_COMPLETION_SETTINGS_READY', payload);
      await window.fetch('/api/backends/chat-completions/generate', {method: 'POST', body: JSON.stringify(payload)});
      assert(interceptedMain.messages[0].content === original, '发送正文没有换回原文');
      assert(ctx.chat.at(-1).mes.includes('处理后的正文。'), '换回原文修改了显示记录');
      await emit('GENERATION_STOPPED'); await emit('GENERATION_ENDED');
      assert(saveCount >= 3, '润色保存未调用');
    });
    await runPolisherChecks(check);
    await check('仅重载 Hub iframe 时，原 Polisher 脚本自动重连且设置、密钥、备份和世界书完整保留', async () => {
      const oldHub = window.__MieMieHub, sourceFrame = polisherFrame, sourceWindow = polisherFrame.contentWindow;
      const oldPolisherPanel = window.__meemeTranslation01.panel, oldFetch = window.fetch;
      const eventCounts = () => JSON.stringify([...events].map(([name, handlers]) => [name, handlers.size]).sort());
      const liveCounts = eventCounts();
      const before = {
        variables: JSON.stringify(variables), worldbook: JSON.stringify(worldbook), chat: JSON.stringify(ctx.chat),
        preferences: localStorage.getItem('miemie_hub_extensions_v1'),
        dock: localStorage.getItem('meeme_timeline_dock_v1'), key: localStorage.getItem('meeme_translation_key_v1'),
        backups: JSON.stringify(variables.meeme_translation_v1.backups),
      };
      assert(oldHub.extensions.get('miemie.polisher')?.enabled && sourceFrame.isConnected, '测试前润色未启用或源 iframe 缺失');
      await removeFrame(frame); frame = null;
      assert(polisherFrame === sourceFrame && sourceFrame.isConnected && sourceFrame.contentWindow === sourceWindow, '错误地重载了 Polisher 源 iframe');
      assert(!window.__MieMieHub && window.__meemeTranslation01 && document.querySelectorAll('#meeme-translation').length===1, 'Hub 停止后未恢复单个独立润色实例');
      assert(!document.querySelector('[data-hub-app="miemie.polisher"]') && window.fetch !== fixtureFetch, '独立润色Hook或Hub入口清理错误');
      assert([...events.values()].reduce((n,handlers)=>n+handlers.size,0)===10, '独立润色业务监听缺失或重复');
      assert([...oldPolisherPanel.querySelectorAll('*')].every(el => !el.onclick && !el.oninput && !el.onchange && !el.onkeydown), '旧润色节点残留事件回调');
      assert(localStorage.getItem('miemie_hub_extensions_v1') === before.preferences, 'Hub teardown 改写了扩展启用偏好');
      frame = await loadFrame('hub');
      await until(() => window.__MieMieHub && window.__MieMieHub !== oldHub, '新 Hub 实例载入');
      await window.__MieMieHub.ready;
      await until(() => window.__MieMieHub.extensions.get('miemie.polisher')?.enabled, '保留的 Polisher 源自动重新提供并启用');
      assert(polisherFrame === sourceFrame && sourceFrame.contentWindow === sourceWindow && sourceFrame.isConnected, '新 Hub 通过重载 Polisher 假装重连');
      assert(window.fetch !== fixtureFetch && window.fetch !== oldFetch, '新 Hub 没有创建独立的新润色 Hook');
      assert(eventCounts() === liveCounts, '重连后监听数量变化或重复注册');
      assert(document.querySelectorAll('#meeme-translation').length === 1 && document.querySelectorAll('[data-hub-app="miemie.polisher"]').length === 1, '重连后润色 UI 或 Launcher 重复');
      await menu(); click('[data-hub-app="miemie.polisher"]');
      await until(() => !document.querySelector('#meeme-translation section').hidden, '从新 Hub Launcher 打开原 Polisher');
      assert(window.__meemeTranslation01.panel !== oldPolisherPanel, '重连错误地复用了已清理的面板');
      assert(JSON.stringify(variables) === before.variables, 'Hub 单独重载改变了时间线或 Polisher 配置/提示词');
      assert(JSON.stringify(variables.meeme_translation_v1.backups) === before.backups, 'Hub 单独重载改变了润色备份');
      assert(JSON.stringify(worldbook) === before.worldbook && JSON.stringify(ctx.chat) === before.chat, 'Hub 单独重载改变了世界书或聊天');
      assert(localStorage.getItem('miemie_hub_extensions_v1') === before.preferences, '重连改变了注册/启用偏好');
      assert(localStorage.getItem('meeme_timeline_dock_v1') === before.dock && localStorage.getItem('meeme_translation_key_v1') === before.key, '重连改变了悬浮球位置或 API Key');
    });
    await check('脚本停用清理事件、轮询、DOM 和 fetch 包装；状态可恢复', async () => {
      await unmount();
      assert([...events.values()].every(set => set.size === 0), '残留宿主事件监听');
      assert(activeTimers.size === 0, '残留轮询');
      assert(!document.querySelector('#miemie-hub-shell, #miemie-timeline-extension') && !document.querySelector('#meeme-translation') && !document.querySelector('#meeme-combined-menu'), '残留 DOM');
      assert(window.fetch === fixtureFetch, 'fetch 包装未恢复');
      assert(!window.__MieMieHub && !window.__timelineSwitcherV1 && !window.__meemeTranslation01 && !window.__meemeCombinedUI, '残留全局实例');
      await mount(); assert(registered().enabled, '重新载入没有恢复 Hello');
    });
    await check('未捕获异常和外部网络请求均为零', async () => {
      assert(pageErrors.length === 0, pageErrors.join('\n')); assert(externalRequests === 0, '存在外部请求');
    });
    await menu();
    document.documentElement.dataset.testStatus = 'passed';
    window.__fixtureResults = {passed: results.length, failed: 0, tests: results, pageErrors, externalRequests};
    log('\n全部通过：' + results.length + ' 项 DOM 组合验证。');
  } catch (error) {
    document.documentElement.dataset.testStatus = 'failed';
    log('✗ ' + error.stack);
    window.__fixtureResults = {passed: results.length, failed: 1, tests: results, error: error.stack, pageErrors};
  } finally {button.disabled = false; await unmount();}
  return window.__fixtureResults;
}
window.__fixture.activeTimers = activeTimers;
document.querySelector('#send_form').onsubmit = event => event.preventDefault();
