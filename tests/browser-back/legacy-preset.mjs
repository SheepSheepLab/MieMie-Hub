// Executes the unchanged, hash-pinned official Preset Manager 0.5.1 artifact.
// Synthetic Tavern APIs; this is a Runtime integration gate, not real-host or Package acceptance.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
if(!process.env.PRESET_ARTIFACT||!process.env.HUB_ARTIFACT)throw Error('Supply PRESET_ARTIFACT and HUB_ARTIFACT. No downloads are performed.');
const pmBytes=await readFile(process.env.PRESET_ARTIFACT),hubBytes=await readFile(process.env.HUB_ARTIFACT);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(pmBytes),'da305c6e574a857ea7f6cd4acc1456561ab3c66f0e16b9252df54994adac1ad8','Requires unchanged official 0.5.1 bytes');
const pm=JSON.parse(pmBytes),hub=JSON.parse(hubBytes),id='miemie.preset-manager';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({reducedMotion:'reduce'}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:'<!doctype html><body>Legacy 0.5.1 integration fixture</body>'}):route.abort());
 await page.goto('https://legacy-preset-fixture.invalid/');
 await page.evaluate(()=>{
  const raw={prompts:[{identifier:'fixture-prompt',name:'Fixture prompt',content:'Unchanged test text',role:'system',system_prompt:false,marker:false,injection_position:0,injection_depth:4,injection_order:100,injection_trigger:[]}],prompt_order:[{character_id:100001,order:[{identifier:'fixture-prompt',enabled:true}]}],extensions:{}};
  const listeners=new Map(),write=()=>{throw Error('Unexpected write in readonly runtime test');};window.fixtureRaw=JSON.stringify(raw);window.fixtureErrors=[];
  const manager={getSelectedPresetName:()=> 'Fixture preset',findPreset:()=>0,getCompletionPresetByName:()=>structuredClone(raw),getPresetList:()=>({presets:[structuredClone(raw)],preset_names:{'Fixture preset':0},settings:{}}),getAllPresets:()=>['Fixture preset'],savePreset:write,selectPreset:write,updateList:write,deletePreset:write};
  const eventTypes=Object.fromEntries(['GENERATION_STARTED','GENERATION_ENDED','MESSAGE_RECEIVED','GENERATION_STOPPED','CHAT_CHANGED','PRESET_CHANGED','OAI_PRESET_CHANGED_BEFORE','OAI_PRESET_CHANGED_AFTER','SETTINGS_UPDATED','GENERATION_AFTER_COMMANDS','CHAT_COMPLETION_SETTINGS_READY','PRESET_DELETED','PRESET_RENAMED'].map(x=>[x,x]));
  const ctx={characterId:undefined,characters:[],chat:[],chatMetadata:{},extensionSettings:{},chatCompletionSettings:structuredClone(raw),getPresetManager:()=>manager,getRequestHeaders:()=>({'Content-Type':'application/json'}),saveMetadata:write,saveSettingsDebounced:()=>{},stopGeneration:()=>{},eventTypes,eventSource:{on(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeListener(type,fn){listeners.get(type)?.delete(fn);}}};
  window.fixtureListeners=listeners;window.SillyTavern={getContext:()=>ctx};window.TavernHelper={getTavernVersion:()=> '1.19.0',builtin:{promptManager:{configuration:{promptOrder:{strategy:'global',dummyId:100001}}}}};
  window.toastr={error:message=>fixtureErrors.push(message),info:()=>{}};
  window.fetch=async input=>{const path=new URL(input,location.href).pathname;if(path==='/api/settings/get')return Response.json({openai_setting_names:['Fixture preset'],openai_settings:[JSON.stringify(raw)],settings:JSON.stringify({extension_settings:ctx.extensionSettings})});throw Error('Unexpected host network: '+path);};
  window.fixtureCreateFrame=async name=>{const f=document.createElement('iframe');f.id=name;f.style.display='none';f.srcdoc='<!doctype html>';const loaded=new Promise(r=>f.onload=r);document.body.append(f);await loaded;return f;};
 });
 async function load(name,content){await page.evaluate(name=>fixtureCreateFrame(name),name);const frame=page.frames().find(f=>f.name()===name)||await page.locator('#'+name).contentFrame();await frame.evaluate(content=>{window.$=fn=>fn();window.getVariables=()=>({});window.replaceVariables=()=>{};window.getCharWorldbookNames=()=>({primary:'',additional:[]});window.eventOn=()=>({stop(){}});window.fetch=async()=>Response.json({items:[]});window.eval(content);},content);}
 await load('hub-frame',hub.content);await page.evaluate(()=>__MieMieHub.ready);await load('preset-frame',pm.content);
 await page.waitForFunction(()=>window.__MieMieHub.extensions.get('miemie.preset-manager')?.enabled,{},{timeout:15000});
 assert.deepEqual(await page.evaluate(()=>fixtureErrors),[]);checks.push('Unchanged 0.5.1 registers and enables on candidate Hub');
 async function open(){await page.evaluate(()=>__MieMieHub.open());await page.locator('[data-hub-app="'+id+'"]').click();await page.waitForFunction(()=>document.querySelector('.miemie-pm')?.dataset.surfaceState==='open');}
 await open();assert.equal(await page.locator('.miemie-pm').count(),1);await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('.miemie-pm').hidden);checks.push('Legacy Escape closes Surface without layered Back claims');
 await open();await page.locator('.miemie-pm').getByRole('button',{name:'关闭预设管理',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.miemie-pm').hidden);checks.push('Explicit close and reopen retain one business panel');
 await page.evaluate(()=>__MieMieHub.extensions.disable('miemie.preset-manager'));await page.evaluate(()=>__MieMieHub.extensions.enable('miemie.preset-manager'));await open();assert.equal(await page.locator('.miemie-pm').count(),1);checks.push('Disable/re-enable keeps one instance and working Surface');
 await page.evaluate(()=>__MieMieHub.open());await page.locator('[data-hub-app="extension-center"]').click();await page.locator('[data-center-tab="installed"]').click();await page.locator('[data-shortcut="'+id+'"]').check();
 await page.getByRole('button',{name:'返回',exact:true}).click();await page.locator('.ts-orb').click();await page.locator('[data-miemie-preset-manager-native]').click();await page.waitForFunction(()=>document.querySelector('.miemie-pm')?.dataset.surfaceState==='open');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('.miemie-pm').hidden);assert.equal(await page.locator('#meeme-combined-menu').evaluate(e=>e.hidden),true);checks.push('Unchanged native Shortcut opens same panel and restores hidden Hub origin');
 await page.evaluate(()=>__MieMieHub.extensions.uninstall('miemie.preset-manager'));assert.equal(await page.evaluate(()=>__MieMieHub.extensions.get('miemie.preset-manager')),null);checks.push('Runtime uninstall revokes panel capability');
 await page.evaluate(()=>document.querySelector('#preset-frame').remove());await page.waitForFunction(()=>!document.querySelector('.miemie-pm'));checks.push('Source removal clears business UI');
 await page.evaluate(()=>document.querySelector('#hub-frame').remove());await page.waitForFunction(()=>!window.__MieMieHub);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>fixtureErrors),[]);
 const report={engine:browser.version(),scope:'Synthetic Tavern 1.19 API fixture; actual unmodified 0.5.1 artifact. Not full Tavern, Native data safety or Package validation.',knownIssue:'0.5.1 retains its known layered Escape limitation.',hubSha256:hash(hubBytes),presetSha256:hash(pmBytes),passed:checks.length,checks,errors};
 await mkdir(new URL('../../test-results/back-browser/',import.meta.url),{recursive:true});await writeFile(new URL('../../test-results/back-browser/legacy-preset.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){console.error('Host diagnostics',await page.evaluate(()=>({errors:window.fixtureErrors,body:document.body.innerText.slice(-1600),state:window.__MieMieHub?.extensions.get('miemie.preset-manager')?.state})));throw error;}finally{await browser.close();}
