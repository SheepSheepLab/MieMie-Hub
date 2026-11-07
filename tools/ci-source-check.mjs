// Repository hygiene only; not an exhaustive secret scanner or a contributor policy engine.
import {readFile, lstat, mkdtemp, mkdir, writeFile, symlink, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

export const requiredFiles = ['package.json', 'package-lock.json', 'LICENSE', 'BRAND.md',
  'tools/build.mjs', 'packaging/script-template.json', 'packaging/bundled-extensions.json',
  'src/bootstrap.js', 'src/extension-runtime.js', 'src/surface-controller.js',
  '.github/workflows/ci.yml', 'tools/ci-source-check.mjs', 'tools/ci-artifact-check.mjs',
  'tests/docs/back-examples.test.mjs'];
const fixturePath = name => /^(?:tests\/fixtures\/|tests\/.*fixture)/.test(name);
export function inspectContent(text) {
  const errors = [], reviews = [];
  // Full blocks are rejected even in tests. Construct synthetic negatives at runtime.
  if (/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(text)) errors.push('private-key-block');
  if (/\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|AKIA[A-Z0-9]{16})\b/.test(text)) errors.push('credential-format');
  const homes = [...text.matchAll(/(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)([^/\\\s"'`<>]+)/g)];
  if (homes.some(x => !/^(?:example|synthetic|fixture|username|user|USER|REDACTED|runner)$/.test(x[1]))) errors.push('private-home-path');
  if (/(?:MacBook|iMac|Mac-mini)-[A-Za-z0-9_-]{4,}\.local\b/.test(text)) errors.push('device-hostname');
  if (/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(text) && !errors.includes('private-key-block')) reviews.push('key-marker-review');
  // Email/copyright names are legitimate provenance: never rewrite or block them.
  return {errors, reviews};
}
export function inspectFile(name, bytes) {
  const errors = [], reviews = [], parts = name.split('/'), base = parts.at(-1);
  if (path.isAbsolute(name) || parts.includes('..') || /[\x00-\x1f\x7f]/.test(name)) errors.push('unsafe-path');
  if (parts.some(p => ['node_modules', '.ssh', '.aws', '.codex', '.DS_Store'].includes(p)) ||
      /^(?:build|dist|test-results|coverage|evidence|delivery|backups?|private-audit)\//i.test(name) ||
      /^\.env(?:\.|$)/.test(base) && !/^\.env\.(?:[a-z0-9_-]+\.)*(?:example|sample|template)$/.test(base) ||
      /^(?:id_rsa|id_ed25519|id_ecdsa)(?:\.pub)?$/.test(base) && !base.endsWith('.pub')) errors.push('private-or-generated-path');
  if (/\.(?:sqlite3?|db|dump|bak|p12|pfx|key|har)$/i.test(base)) errors.push('database-backup-or-key');
  if (/\.(?:zip|tar|tgz|gz|7z)$/i.test(base)) (fixturePath(name) ? reviews : errors).push('archive-review');
  if (/\.(?:pem|crt)$/i.test(base)) reviews.push('certificate-review');
  if (base === '.npmrc') reviews.push('npm-config-review');
  if (/^(?:cookies?|cookie-jar)\.(?:txt|json)$/i.test(base)) errors.push('browser-credentials');
  const content = inspectContent(bytes.toString('utf8'));
  return {errors: [...errors, ...content.errors], reviews: [...reviews, ...content.reviews]};
}
export async function checkFiles(root, names) {
  const result = {files: names.length, errors: [], reviews: []}, set = new Set(names);
  for (const file of requiredFiles) if (!set.has(file)) result.errors.push({file, rule: 'required-file-missing'});
  for (const file of names) {
    // Reject links before reading; a PR must not make the checker read outside checkout.
    if (path.isAbsolute(file) || file.split('/').includes('..')) {result.errors.push({file, rule:'unsafe-path'}); continue;}
    const target = path.join(root, file);
    let stat;
    try {stat = await lstat(target);} catch {result.errors.push({file, rule:'file-missing'}); continue;}
    if (!stat.isFile()) {result.errors.push({file, rule:'non-regular-file'}); continue;}
    if (stat.size > 20 * 1024 * 1024) {result.errors.push({file, rule:'oversized-source-review'}); continue;}
    const scan = inspectFile(file, await readFile(target));
    for (const rule of scan.errors) result.errors.push({file, rule});
    for (const rule of scan.reviews) result.reviews.push({file, rule});
  }
  return result;
}
async function selfTest() {
  const {test} = await import('node:test');
  test('source policy accepts new source, attribution and ordinary fixtures', () => {
    for (const [name, content] of [['src/new-feature.js','// Copyright Community Contributor <contributor@example.org>'],
      ['tests/fixtures/valid.json','{"token":"test-only","schemaVersion":1}'],
      ['docs/history.md','Historical registerShortcutLauncher; Source: https://github.com/Example/Project'],
      ['.env.example','TOKEN=replace-me'], ['tests/fixtures/path.txt','/Users/synthetic/example']]) assert.deepEqual(inspectFile(name, Buffer.from(content)).errors, []);
  });
  test('source policy rejects explicit generated/private paths and credential shapes', () => {
    for (const name of ['.env','.env.production','node_modules/a.js','build/a.json','evidence/a.json','local.sqlite','snapshot.bak','private-audit.zip','.ssh/id_ed25519']) assert.ok(inspectFile(name, Buffer.from('')).errors.length, name);
    assert.ok(inspectContent('ghp_' + 'A'.repeat(36)).errors.includes('credential-format'));
    assert.ok(inspectContent('sk-' + 'A'.repeat(40)).errors.includes('credential-format'));
    assert.ok(inspectContent('/' + ['Users','private-account','file'].join('/')).errors.includes('private-home-path'));
  });
  test('source policy rejects a synthetic private key even under fixtures', () => {
    const key = ['-----BEGIN', 'PRIVATE KEY-----\n', Buffer.from('not a real key').toString('base64'), '\n-----END', 'PRIVATE KEY-----'].join(' ');
    assert.ok(inspectFile('tests/fixtures/key.txt', Buffer.from(key)).errors.includes('private-key-block'));
  });
  test('ambiguous certificates and fixture archives require review without banning copyright', () => {
    assert.deepEqual(inspectFile('tests/fixtures/sample.zip', Buffer.from('fixture')).errors, []);
    assert.ok(inspectFile('tests/fixtures/sample.zip', Buffer.from('fixture')).reviews.length);
    assert.ok(inspectFile('docs/certificate.pem', Buffer.from('public certificate')).reviews.length);
  });
  test('required-file and symlink checks fail without following outside paths', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hub-ci-source-'));
    try {
      for (const name of requiredFiles) {await mkdir(path.dirname(path.join(dir,name)),{recursive:true}); await writeFile(path.join(dir,name),'');}
      assert.deepEqual((await checkFiles(dir,requiredFiles)).errors, []);
      await rm(path.join(dir,'LICENSE')); assert.ok((await checkFiles(dir,requiredFiles)).errors.some(x=>x.rule==='file-missing'));
      assert.ok((await checkFiles(dir,requiredFiles.filter(x=>x!=='LICENSE'))).errors.some(x=>x.rule==='required-file-missing'));
      await symlink('/nonexistent-private-target',path.join(dir,'LICENSE'));
      assert.ok((await checkFiles(dir,requiredFiles)).errors.some(x=>x.rule==='non-regular-file'));
    } finally {await rm(dir,{recursive:true,force:true});}
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.slice(2).join(' ') === '--self-test') await selfTest();
  else {
    assert.equal(process.argv.length, 2, 'Use no arguments or --self-test');
    const root = fileURLToPath(new URL('../',import.meta.url));
    const names = [...new Set(execFileSync('git',['--no-optional-locks','-C',root,'ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',maxBuffer:8*1024*1024}).split('\0').filter(Boolean))];
    const result = await checkFiles(root,names);
    // Only paths/rule IDs are printed, never matched credential or file contents.
    console.log(JSON.stringify(result,null,2));
    if (result.errors.length) process.exitCode = 1;
    execFileSync('git',['--no-optional-locks','-C',root,'diff','--check'],{stdio:'inherit'});
  }
}
