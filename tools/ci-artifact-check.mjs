// Build-time verification; no downloads, installation, browser or Registry requests.
import {readFile, writeFile, readdir, lstat, mkdtemp, rm, cp} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {HUB_PRODUCT} from '../src/product-identity.js';
import {HUB_UPDATE_PACKAGE_ID, HUB_UPDATE_ASSET_LIMIT, HUB_UPDATE_METADATA_LIMIT, validateHubUpdateMetadata, validateHubUpdatePackage} from '../src/hub-self-update.js';
import {assertExtensionRuntimeCompatibility} from '../src/extension-runtime.js';
import {inspectContent} from './ci-source-check.mjs';

const root = fileURLToPath(new URL('../',import.meta.url));
const read = name => readFile(path.join(root,name));
const json = async name => JSON.parse(await read(name));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const modes = ['development','production','unbundled'];
// Public configuration only. Building does not connect to this endpoint.
const registry = 'https://registry.sheepsheeplab.com';
function build(directory, mode) {
  assert.ok(modes.includes(mode),'Unknown build mode');
  execFileSync(process.execPath,[path.join(root,'tools/build.mjs'),'--output-dir='+directory,...(mode==='unbundled'?['--bundled=']:[])],{
    cwd:root, stdio:'inherit', timeout:60000,
    env:{...process.env,MIEMIE_BUILD_MODE:mode==='production'?'production':'development',MIEMIE_DEFAULT_REGISTRY_URL:mode==='production'?registry:''},
  });
}
export async function verifyDirectory(directory, mode) {
  assert.ok(modes.includes(mode),'Unknown build mode');
  const pkg = await json('package.json'), template = await json('packaging/script-template.json');
  assert.match(pkg.version,/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,'Official version');
  assert.equal(template.id,HUB_UPDATE_PACKAGE_ID,'Stable Script ID');
  const ascii = 'MieMie-Hub-'+pkg.version+'.json', localized=HUB_PRODUCT.name+'-'+pkg.version+'.json';
  const names=[ascii,localized,'miemie-hub.js','MieMie-Hub-update.json'];
  assert.deepEqual((await readdir(directory)).sort(),[...names].sort(),'Exact build file set');
  const files = new Map();
  for (const name of names) {
    const file=path.join(directory,name), stat=await lstat(file);
    assert.ok(stat.isFile() && stat.size>0 && stat.size <= (name==='MieMie-Hub-update.json'?HUB_UPDATE_METADATA_LIMIT:HUB_UPDATE_ASSET_LIMIT),'Regular bounded build file');
    files.set(name,await readFile(file));
  }
  const bytes=files.get(ascii), metadata=JSON.parse(files.get('MieMie-Hub-update.json'));
  assert.deepEqual(bytes,files.get(localized),'Localized/ASCII bytes');
  const expected={schemaVersion:1,productId:'miemie.hub',version:pkg.version,tag:'v'+pkg.version,format:'tavern-helper-script',scriptId:HUB_UPDATE_PACKAGE_ID,
    asset:{name:ascii,size:bytes.length,sha256:hash(bytes)},contentSha256:hash(files.get('miemie-hub.js'))};
  assert.deepEqual(metadata,expected,'Metadata identity, size and both hashes');
  // The release argument is a local byte-derived expectation, not a production Release.
  validateHubUpdateMetadata(metadata,{version:pkg.version,tag:'v'+pkg.version,asset:expected.asset});
  const script=await validateHubUpdatePackage(bytes,metadata);
  assert.deepEqual(script.data,{},'No public user data');
  assert.equal(script.name,HUB_PRODUCT.name+' '+pkg.version);
  assert.equal(script.enabled,template.enabled);
  assert.deepEqual(script.button,template.button);
  assert.deepEqual(script.export_with,template.export_with);
  const content=script.content;
  assert.deepEqual(Buffer.from(content),files.get('miemie-hub.js'),'JS/JSON content');
  new vm.Script(content,{filename:'verified-hub.js'}); // Parse, never execute a downloaded script.
  assert.deepEqual(JSON.parse(content.split('\n')[0].slice('// MieMie-Hub-Build: '.length)),
    {schemaVersion:1,productId:'miemie.hub',version:pkg.version,scriptId:HUB_UPDATE_PACKAGE_ID});
  for (const [name,value] of [['HUB_VERSION',pkg.version],['HUB_BUILD_MODE',mode==='production'?'production':'development'],['HUB_DEFAULT_REGISTRY_URL',mode==='production'?registry:'']])
    assert.ok(content.includes('const '+name+'='+JSON.stringify(value)+';'),'Embedded '+name);
  assert.match(content,/version: HUB_VERSION, apiVersion: 2,/,'Built public Runtime API2 declaration');
  // Match present inputs rather than freezing an old release's hashes.
  const buildSource=(await read('tools/build.mjs')).toString();
  const inputs=[...new Set([...buildSource.matchAll(/['"](src\/[a-z0-9-]+\.js)['"]/g)].map(x=>x[1]))];
  assert.ok(inputs.includes('src/bootstrap.js') && inputs.includes('src/extension-runtime.js'),'Declared production inputs');
  for (const file of inputs) {
    const source=(await read(file)).toString().replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
    assert.ok(content.includes(source),'Current source included: '+file);
  }
  const assetsLine=content.split('\n').find(x=>x.startsWith('const HUB_ASSETS='));
  assert.ok(assetsLine,'Built assets');
  const assets=JSON.parse(assetsLine.slice('const HUB_ASSETS='.length,-1));
  assert.equal(assets.icons.home,'data:image/png;base64,'+(await read('assets/hub.png')).toString('base64'),'Original Hub PNG');
  const declarations=await json('packaging/bundled-extensions.json');
  assert.ok(declarations.some(x=>x.directory==='extensions/timeline'),'Default Timeline declaration');
  for (const entry of declarations) {
    assert.match(entry.directory,/^extensions\/[a-z0-9-]+$/);
    const manifest=await json(entry.directory+'/manifest.json');
    assertExtensionRuntimeCompatibility(manifest);
    const present=mode!=='unbundled';
    assert.equal(content.includes('manifest:'+JSON.stringify(manifest)),present,'Bundled Manifest '+manifest.id);
    assert.equal(content.includes('function '+entry.factory+'('),present,'Bundled factory '+manifest.id);
    if (present) {
      assert.ok(!manifest.entry.includes('..') && !path.isAbsolute(manifest.entry));
      assert.ok(content.includes((await read(entry.directory+'/'+manifest.entry)).toString().replace(/^export /gm,'')),'Current bundled source');
    }
    for (const file of Object.values(entry.resources||{})) {
      assert.ok(!file.includes('..') && !path.isAbsolute(file));
      const bytes=await read(entry.directory+'/'+file), resource=file.endsWith('.png')?'data:image/png;base64,'+bytes.toString('base64'):bytes.toString();
      assert.equal(content.includes(JSON.stringify(resource)),present,'Bundled resource '+file);
    }
  }
  assert.deepEqual(inspectContent(content).errors,[],'No private paths/credentials in content');
  assert.deepEqual(inspectContent(bytes.toString('utf8')).errors,[],'No private paths/credentials in package fields');
  assert.doesNotMatch(content,/PHASE3_ONLY_Character|test\.miemie\.native-window-parity|95000000-0000-4000-8000/,'No acceptance fixture in product');
  return {mode,version:pkg.version,bytes:bytes.length,sha256:hash(bytes),contentSha256:metadata.contentSha256,
    files:Object.fromEntries([...files].map(([name,b])=>[name,hash(b)])),runtimeAPI:2,buildIdentitySchema:1,metadataSchema:1};
}
async function selfTest() {
  const {test} = await import('node:test');
  test('artifact checker validates a fresh build and rejects integrity/identity/missing-file failures',async t=>{
    const dir=await mkdtemp(path.join(tmpdir(),'hub-ci-artifact-'));
    try {
      const baseline=path.join(dir,'valid'); build(baseline,'development');
      await t.test('valid current build',()=>verifyDirectory(baseline,'development'));
      const cases=[
        ['bad attachment hash',async d=>{const f=path.join(d,'MieMie-Hub-update.json'),m=JSON.parse(await readFile(f));m.asset.sha256='0'.repeat(64);await writeFile(f,JSON.stringify(m));}],
        ['wrong product identity',async d=>{const f=path.join(d,'MieMie-Hub-update.json'),m=JSON.parse(await readFile(f));m.productId='example.wrong';await writeFile(f,JSON.stringify(m));}],
        ['bad content hash',async d=>{const f=path.join(d,'MieMie-Hub-update.json'),m=JSON.parse(await readFile(f));m.contentSha256='0'.repeat(64);await writeFile(f,JSON.stringify(m));}],
        ['missing required file',d=>rm(path.join(d,'miemie-hub.js'))],
        ['unexpected file',d=>writeFile(path.join(d,'private-backup.txt'),'synthetic')],
        ['wrong build mode',async()=>{}],
      ];
      for (const [i,[label,mutate]] of cases.entries()) await t.test(label,async()=>{
        const copy=path.join(dir,'negative-'+i);await cp(baseline,copy,{recursive:true});await mutate(copy);
        await assert.rejects(verifyDirectory(copy,label==='wrong build mode'?'production':'development'));
      });
    } finally {await rm(dir,{recursive:true,force:true});}
  });
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const args=process.argv.slice(2);
  if (args.length===1 && args[0]==='--self-test') await selfTest();
  else if (args.length===1 && args[0]==='--build') {
    const results=[];
    for (const mode of modes) {
      const first=path.join(root,'build/ci',mode,'first'), repeat=path.join(root,'build/ci',mode,'repeat');
      build(first,mode);const a=await verifyDirectory(first,mode);
      build(repeat,mode);const b=await verifyDirectory(repeat,mode);
      assert.deepEqual(a.files,b.files,'Same-input reproducibility: '+mode);results.push({...a,reproducible:true});
    }
    console.log(JSON.stringify({scope:'Local build integrity only; not production or Runtime acceptance',results},null,2));
  } else if (args.length===3 && args[0]==='--verify') console.log(JSON.stringify(await verifyDirectory(path.resolve(args[2]),args[1]),null,2));
  else throw Error('Use --build, --self-test or --verify <development|production|unbundled> <directory>');
}
