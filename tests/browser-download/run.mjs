// Real Chromium fetch/CORS regression, with local test data only.
// No route.fulfill, fake Response, or browser-security disable flags are used.
// Supply an installed Playwright module through PLAYWRIGHT_MODULE (a module name
// or absolute package entry) and its normal PLAYWRIGHT_BROWSERS_PATH if needed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, isAbsolute} from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const serveOnly = process.argv.includes('--serve');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const repository = 'https://github.com/DevelopmentFixture/CorsExtension';
const api = 'https://api.github.com/repos/DevelopmentFixture/CorsExtension';
const productId = 'fixture.cors-extension', version = '1.0.0', scriptId = 'fixture-package-id';
const content = '// MieMie-Extension-Build: ' + JSON.stringify({schemaVersion: 1, productId, version, scriptId, repository}) + '\n// Development Fixture / Test Data: never executed by the harness.\n';
const script = {type: 'script', enabled: true, name: 'Development Fixture / Test Data', id: scriptId,
  content, info: 'Development Fixture / Test Data', button: {enabled: false, buttons: []}, data: {}, export_with: {data: false, button: false}};
const packageBytes = Buffer.from(JSON.stringify(script));
const packageName = 'Development-Fixture-1.0.0.json';
const manifest = {schemaVersion: 1, apiVersion: 1, id: productId, version, name: script.name,
  author: 'Development Fixture', description: 'Test data, not a community author.', entry: packageName,
  repository, license: 'GPL-3.0-or-later', hubApi: {min: 1, max: 1}};
const metadata = {schemaVersion: 1, format: 'tavern-helper-script', productId, version, tag: 'v1.0.0',
  scriptId, manifest, asset: {name: packageName, size: packageBytes.length, sha256: hash(packageBytes)}, contentSha256: hash(content)};
const metadataBytes = Buffer.from(JSON.stringify(metadata));
const asset = (id, name, bytes) => ({id, name, state: 'uploaded', size: bytes.length, digest: 'sha256:' + hash(bytes),
  url: api + '/releases/assets/' + id, browser_download_url: repository + '/releases/download/v1.0.0/' + name});
const release = {id: 7, tag_name: 'v1.0.0', draft: false, prerelease: true, assets: [
  asset(31, 'MieMie-Extension-update.json', metadataBytes), asset(32, packageName, packageBytes),
]};
const observed = {blockedFiles: 0, relayPosts: 0, deniedOrigins: 0, credentialHeaders: 0, preflights: 0};
let relayMode = 'valid', allowedOrigin = '';
let browserHTML = '', workerHTML = '';
const servers = [];
function json(response, value, status = 200, headers = {}) {
  response.writeHead(status, {'Content-Type': 'application/json', ...headers}); response.end(JSON.stringify(value));
}
async function listen(handler) {
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch(error => {if (!response.headersSent) json(response, {error: error.message}, 500); else response.destroy();});
  });
  servers.push(server);
  await new Promise((yes, no) => {server.once('error', no); server.listen(0, '127.0.0.1', yes);});
  return 'http://127.0.0.1:' + server.address().port;
}
const sourceHandler = async (request, response) => {
  const pathname = new URL(request.url, 'http://fixture.invalid').pathname;
  if (pathname === '/fixture-control' && request.method === 'POST' && request.headers.origin === allowedOrigin) {
    const chunks = []; for await (const part of request) chunks.push(part);
    const input = JSON.parse(Buffer.concat(chunks));
    if (input.mode && !['valid', 'slow', 'tamper-metadata', 'tamper-package'].includes(input.mode)) return json(response, {error: 'Bad fixture mode'}, 400);
    if (input.mode) relayMode = input.mode;
    if (input.report) console.log(JSON.stringify(input.report));
    return json(response, observed);
  }
  if (pathname === '/' || pathname === '/worker') {response.writeHead(200, {'Content-Type': 'text/html'}); response.end((pathname === '/worker' ? workerHTML : browserHTML) || '<!doctype html><title>MieMie Chromium CORS test fixture</title>'); return;}
  if (!/^\/src\/[a-z0-9-]+\.js$/.test(pathname)) {response.writeHead(404); response.end(); return;}
  response.writeHead(200, {'Content-Type': 'text/javascript'}); response.end(await readFile(resolve(root, '.' + pathname)));
};
let browser;
const passed = [];
try {
  const appOrigin = await listen(sourceHandler), deniedAppOrigin = await listen(sourceHandler);
  allowedOrigin = appOrigin;
  const githubOrigin = await listen(async (request, response) => {
    const path = new URL(request.url, 'http://fixture.invalid').pathname;
    if (path.startsWith('/files/')) {
      observed.blockedFiles++;
      const bytes = path.endsWith('/31') ? metadataBytes : packageBytes;
      // Intentionally no Access-Control-Allow-Origin: Chromium must reject this
      // actual network response even though its status and bytes are valid.
      response.writeHead(200, {'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length}); response.end(bytes); return;
    }
    const headers = {'Access-Control-Allow-Origin': '*'};
    const match = /\/releases\/assets\/(31|32)$/.exec(path);
    if (match) {response.writeHead(302, {...headers, Location: '/files/' + match[1]}); response.end(); return;}
    if (path === '/repos/DevelopmentFixture/CorsExtension') return json(response, {private: false, full_name: 'DevelopmentFixture/CorsExtension'}, 200, headers);
    if (path.endsWith('/releases')) return json(response, [release], 200, headers);
    if (path.endsWith('/releases/7')) return json(response, release, 200, headers);
    json(response, {error: 'Unexpected fixture request'}, 404, headers);
  });
  const relayOrigin = await listen(async (request, response) => {
    if (request.headers.authorization || request.headers.cookie) observed.credentialHeaders++;
    if (request.headers.origin !== allowedOrigin) {observed.deniedOrigins++; response.writeHead(403); response.end(); return;}
    const headers = {'Access-Control-Allow-Origin': allowedOrigin, Vary: 'Origin', 'Cache-Control': 'no-store'};
    if (request.method === 'OPTIONS') {
      observed.preflights++;
      response.writeHead(204, {...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type'}); response.end(); return;
    }
    if (request.method !== 'POST' || request.url !== '/api/packages/github/asset') return json(response, {error: 'Unknown endpoint'}, 404, headers);
    observed.relayPosts++;
    const chunks = []; for await (const part of request) chunks.push(part);
    const input = JSON.parse(Buffer.concat(chunks));
    // This is a transport contract fixture, not a substitute for the Registry's
    // independent Manifest/SSRF/permission validation tests.
    if (Object.keys(input).sort().join(',') !== 'assetId,releaseId,repository' || input.repository !== repository || input.releaseId !== 7 || ![31, 32].includes(input.assetId)) {
      return json(response, {error: 'Unverified fixture identity'}, 400, headers);
    }
    if (relayMode === 'slow') await new Promise(yes => setTimeout(yes, 500));
    let bytes = input.assetId === 31 ? metadataBytes : packageBytes;
    if ((relayMode === 'tamper-metadata' && input.assetId === 31) || (relayMode === 'tamper-package' && input.assetId === 32)) {
      bytes = Buffer.from(bytes); bytes[bytes.length - 1] ^= 1;
    }
    if (response.destroyed) return;
    response.writeHead(200, {...headers, 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length}); response.end(bytes);
  });
  if (serveOnly) {
    const configuration = {githubOrigin, repository, relayOrigin, appOrigin, deniedAppOrigin, productId, scriptId, content};
    const exerciseSource = async function exerciseInBrowser({githubOrigin, repository, base, install = true, timeout = 3000, disposeAfter}) {
      const {createExtensionPackageManager} = await import('/src/extension-packages.js');
      let trees = [], writes = 0;
      const request = (url, options) => {
        if (url.startsWith('https://api.github.com/repos/DevelopmentFixture/CorsExtension')) {
          const target = new URL(url); return fetch(githubOrigin + target.pathname + target.search, options);
        }
        return fetch(url, options);
      };
      const manager = createExtensionPackageManager({fetch: request, getRegistryBaseURL: () => base,
        metadataTimeoutMs: timeout, assetTimeoutMs: timeout, getScriptTrees: () => structuredClone(trees),
        updateScriptTreesWith(updater) {writes++; trees = updater(structuredClone(trees)); return structuredClone(trees);},
      });
      let timer;
      if (disposeAfter !== undefined) timer = setTimeout(() => manager.dispose(), disposeAfter);
      try {
        const candidate = await manager.inspect(repository);
        const result = install ? await manager.install(candidate) : null;
        return {ok: true, writes, candidate: {id: candidate.id, repoUrl: candidate.repoUrl}, result, trees};
      } catch (error) {return {ok: false, writes, code: error.code, message: error.message, trees};}
      finally {clearTimeout(timer); manager.dispose();}
    };
    const configurationText = JSON.stringify(configuration);
    workerHTML = '<!doctype html><title>CORS fixture worker</title><script type="module">const configuration=' + configurationText + '; const exercise=' + exerciseSource.toString() + `;
      addEventListener('message', async event => {
        if (event.origin !== configuration.appOrigin || event.source !== parent || event.data?.action !== 'exercise') return;
        const result = await exercise(event.data.options);
        parent.postMessage({action:'result', result}, configuration.appOrigin);
      });
      parent.postMessage({action:'ready'}, configuration.appOrigin);
    </script>`;
    browserHTML = '<!doctype html><meta charset="utf-8"><title>MieMie browser CORS regression</title><h1>MieMie browser CORS regression</h1><p>Real browser fetch; local Development Fixture only. No disabled web security or intercepted responses.</p><pre id="output">Running…</pre><script type="module">const configuration=' + configurationText + '; const exercise=' + exerciseSource.toString() + `;
      const output=document.querySelector('#output'), results=[];
      const assert=(condition,message)=>{if(!condition)throw Error(message);};
      const control=async body=>(await fetch('/fixture-control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit'})).json();
      const run=options=>exercise({githubOrigin:configuration.githubOrigin,repository:configuration.repository,base:configuration.relayOrigin,...options});
      const check=async(name,action)=>{try{await action();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message});}output.textContent=JSON.stringify({running:true,results},null,2);};
      // Fixture cookie proves credentials:omit, rather than an empty cookie jar.
      document.cookie='miemie_cors_fixture=not-a-real-credential; Path=/; SameSite=Lax';
      await check('Actual asset CORS rejection without Registry: zero writes',async()=>{
        await control({mode:'valid'});const before=await control({});const result=await run({base:''});const after=await control({});
        assert(!result.ok&&result.code==='download'&&result.writes===0,JSON.stringify(result));
        assert(after.blockedFiles>before.blockedFiles&&after.relayPosts===before.relayPosts,'Missing actual blocked asset request');
      });
      await check('Registry CORS fallback previews and installs verified bytes',async()=>{
        const result=await run({});assert(result.ok&&result.writes===1,JSON.stringify(result));
        assert(result.trees.length===1&&result.trees[0].content===configuration.content&&result.trees[0].id!==configuration.scriptId,'Incorrect installed content or instance ID');
        assert(result.candidate.repoUrl===configuration.repository&&result.result.id===configuration.productId,'Source identity changed');
        const counts=await control({});assert(counts.preflights>0&&counts.credentialHeaders===0,'Preflight missing or credentials leaked');
      });
      await check('Tampered relay metadata: digest rejection, zero writes',async()=>{
        await control({mode:'tamper-metadata'});const result=await run({});await control({mode:'valid'});
        assert(!result.ok&&result.code==='hash'&&result.writes===0,JSON.stringify(result));
      });
      await check('Tampered relay package: digest rejection, zero writes',async()=>{
        await control({mode:'tamper-package'});const result=await run({});await control({mode:'valid'});
        assert(!result.ok&&result.code==='hash'&&result.writes===0,JSON.stringify(result));
      });
      await check('Unapproved browser Origin cannot read Registry transport',async()=>{
        const before=await control({});const frame=document.createElement('iframe');frame.hidden=true;
        const result=await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>{cleanup();reject(Error('Cross-origin worker timeout'));},5000);
          function cleanup(){clearTimeout(timer);removeEventListener('message',receive);frame.remove();}
          function receive(event){if(event.origin!==configuration.deniedAppOrigin||event.source!==frame.contentWindow)return;
            if(event.data?.action==='ready')frame.contentWindow.postMessage({action:'exercise',options:{githubOrigin:configuration.githubOrigin,repository:configuration.repository,base:configuration.relayOrigin}},configuration.deniedAppOrigin);
            if(event.data?.action==='result'){cleanup();resolve(event.data.result);}}
          addEventListener('message',receive);frame.src=configuration.deniedAppOrigin+'/worker';document.body.append(frame);
        });
        const after=await control({});assert(!result.ok&&result.code==='relay'&&result.writes===0,JSON.stringify(result));
        assert(after.relayPosts===before.relayPosts&&after.deniedOrigins>before.deniedOrigins,'Unapproved preflight was accepted');
      });
      await check('Relay timeout leaves host tree untouched',async()=>{
        await control({mode:'slow'});const result=await run({timeout:100});await control({mode:'valid'});
        assert(!result.ok&&result.code==='timeout'&&result.writes===0&&result.trees.length===0,JSON.stringify(result));
      });
      await check('Teardown aborts browser download before any write',async()=>{
        await control({mode:'slow'});const result=await run({disposeAfter:100});await control({mode:'valid'});
        assert(!result.ok&&result.code==='cancelled'&&result.writes===0&&result.trees.length===0,JSON.stringify(result));
      });
      document.cookie='miemie_cors_fixture=; Max-Age=0; Path=/';
      const report={passed:results.filter(r=>r.passed).length,total:results.length,results,observed:await control({}),scope:'Real browser CORS against local fixtures; not real Tavern or public Registry acceptance.'};
      output.textContent=JSON.stringify(report,null,2);document.title=report.passed===report.total?'PASS 7/7 — MieMie CORS':'FAIL — MieMie CORS';
      await control({report});
    </script>`;
    console.log(JSON.stringify({url: appOrigin, mode: 'serve', scope: 'Open this local fixture in a normal browser; results also print here.'}));
    await new Promise(done => {process.once('SIGINT', done); process.once('SIGTERM', done);});
  } else {
  const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
  const {chromium} = await import(isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
  browser = await chromium.launch({headless: true});
  const context = await browser.newContext();
  await context.addCookies([{name: 'miemie_cors_fixture', value: 'not-a-real-credential', url: appOrigin, sameSite: 'Lax'}]);
  const page = await context.newPage();
  let corsConsoleErrors = 0;
  page.on('console', message => {if (/CORS|Access-Control-Allow-Origin/.test(message.text())) corsConsoleErrors++;});
  async function exercise({base = relayOrigin, install = true, timeout = 3000, disposeAfter, origin = appOrigin} = {}) {
    await page.goto(origin);
    return page.evaluate(async ({githubOrigin, repository, base, install, timeout, disposeAfter}) => {
      const {createExtensionPackageManager} = await import('/src/extension-packages.js');
      let trees = [], writes = 0;
      // Only official fixture API URLs are remapped. Responses and failures are
      // native browser fetch objects; browser CORS checks remain fully enabled.
      const request = (url, options) => {
        if (url.startsWith('https://api.github.com/repos/DevelopmentFixture/CorsExtension')) {
          const target = new URL(url); return fetch(githubOrigin + target.pathname + target.search, options);
        }
        return fetch(url, options);
      };
      const manager = createExtensionPackageManager({fetch: request, getRegistryBaseURL: () => base,
        metadataTimeoutMs: timeout, assetTimeoutMs: timeout, getScriptTrees: () => structuredClone(trees),
        updateScriptTreesWith(updater) {writes++; trees = updater(structuredClone(trees)); return structuredClone(trees);},
      });
      let timer;
      if (disposeAfter !== undefined) timer = setTimeout(() => manager.dispose(), disposeAfter);
      try {
        const candidate = await manager.inspect(repository);
        const result = install ? await manager.install(candidate) : null;
        return {ok: true, writes, candidate: {id: candidate.id, repoUrl: candidate.repoUrl}, result, trees};
      } catch (error) {return {ok: false, writes, code: error.code, message: error.message, trees};}
      finally {clearTimeout(timer); manager.dispose();}
    }, {githubOrigin, repository, base, install, timeout, disposeAfter});
  }
  async function check(name, action) {await action(); passed.push(name); console.log('PASS ' + name);}
  await check('actual cross-origin GitHub asset rejection, without Registry, writes nothing', async () => {
    const before = observed.blockedFiles, result = await exercise({base: ''});
    assert.equal(result.ok, false); assert.equal(result.code, 'download'); assert.equal(result.writes, 0);
    assert(observed.blockedFiles > before); assert.equal(observed.relayPosts, 0);
    assert(corsConsoleErrors > 0, 'Chromium must report genuine CORS blocking');
  });
  await check('CORS fallback previews and installs verified bytes via Registry', async () => {
    const result = await exercise();
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.writes, 1); assert.equal(result.trees.length, 1);
    assert.equal(result.candidate.repoUrl, repository); assert.equal(result.result.id, productId);
    assert.equal(result.trees[0].content, content); assert.notEqual(result.trees[0].id, scriptId); assert.deepEqual(result.trees[0].data, {});
    assert(observed.preflights > 0); assert.equal(observed.credentialHeaders, 0);
  });
  await check('tampered Registry metadata fails digest validation before writing', async () => {
    relayMode = 'tamper-metadata'; const result = await exercise(); relayMode = 'valid';
    assert.equal(result.ok, false); assert.equal(result.code, 'hash'); assert.equal(result.writes, 0);
  });
  await check('tampered Registry package fails digest validation before writing', async () => {
    relayMode = 'tamper-package'; const result = await exercise(); relayMode = 'valid';
    assert.equal(result.ok, false); assert.equal(result.code, 'hash'); assert.equal(result.writes, 0);
  });
  await check('unapproved browser Origin cannot use Registry transport', async () => {
    const before = observed.relayPosts, result = await exercise({origin: deniedAppOrigin});
    assert.equal(result.ok, false); assert.equal(result.code, 'relay'); assert.equal(result.writes, 0);
    assert.equal(observed.relayPosts, before); assert(observed.deniedOrigins > 0);
  });
  await check('Registry timeout preserves an empty host tree', async () => {
    relayMode = 'slow'; const result = await exercise({timeout: 100}); relayMode = 'valid';
    assert.equal(result.ok, false); assert.equal(result.code, 'timeout'); assert.equal(result.writes, 0); assert.deepEqual(result.trees, []);
  });
  await check('teardown aborts the in-flight browser download before any write', async () => {
    relayMode = 'slow'; const result = await exercise({disposeAfter: 100}); relayMode = 'valid';
    assert.equal(result.ok, false); assert.equal(result.code, 'cancelled'); assert.equal(result.writes, 0); assert.deepEqual(result.trees, []);
  });
  console.log(JSON.stringify({passed: passed.length, browser: await browser.version(), observed,
    scope: 'Real Chromium CORS against local fixture origins; not live Tavern or public Registry acceptance.'}, null, 2));
  }
} finally {
  await browser?.close();
  await Promise.all(servers.map(server => new Promise(yes => {server.closeAllConnections(); server.close(yes);})));
}
