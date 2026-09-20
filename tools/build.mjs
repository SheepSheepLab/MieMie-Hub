import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const project = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFile(path.join(project, file), 'utf8');
const data = JSON.parse(await read('packaging/script-template.json'));
const pkg = JSON.parse(await read('package.json'));
if (typeof pkg.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$(?![\s\S])/.test(pkg.version)) throw Error('MieMie 官方版本必须使用纯 MAJOR.MINOR.PATCH。');
const identity = {schemaVersion: 1, productId: 'miemie.hub', version: pkg.version, scriptId: data.id};
// Production must carry a real official endpoint; development may remain offline.
// This setting contains only a public root URL, never server secrets.
const buildMode = process.env.MIEMIE_BUILD_MODE || 'development';
if (!['development', 'production'].includes(buildMode)) throw Error('MIEMIE_BUILD_MODE 必须为 development 或 production。');
let defaultRegistry = '';
if (buildMode === 'production' && !process.env.MIEMIE_DEFAULT_REGISTRY_URL) throw Error('生产构建必须配置真实官方 HTTPS Registry 地址。');
if (process.env.MIEMIE_DEFAULT_REGISTRY_URL) {
  const url = new URL(process.env.MIEMIE_DEFAULT_REGISTRY_URL);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(buildMode === 'development' && loopback && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('默认 Registry 必须为不含凭据的 HTTPS 服务根地址（开发模式允许本机 HTTP）。');
  const placeholder = /(?:^|\.)(?:example\.(?:com|org|net)|example|invalid|test|localhost|local)$/.test(url.hostname.replace(/\.$/, ''));
  if (buildMode === 'production' && (loopback || placeholder || /^[\d.]+$/.test(url.hostname) || url.hostname.startsWith('[') || !url.hostname.includes('.'))) throw Error('生产构建必须配置真实官方 HTTPS Registry 域名，不能使用示例或本机地址。');
  defaultRegistry = url.origin;
}
const icons = {};
for (const [name, file] of Object.entries({home: 'hub', timeline: 'timeline'})) icons[name] = 'data:image/png;base64,' + (await readFile(path.join(project, 'assets/' + file + '.png'))).toString('base64');
const assets = {
  icons,
  timelineStyles: await read('assets/legacy-timeline.css'),
  menuStyles: await read('assets/legacy-menu.css'),
  hubStyles: await read('assets/hub-panels.css'),
  // The Shell assigns the shared icon before attaching the root. Avoid a second
  // copy of its base64 string and avoid a placeholder URL request.
  orbHTML: (await read('assets/orb.html')).replace(' src="__HUB_ICON__"', ''),
  effectsHTML: await read('assets/effects.html'),
};
const manifest = JSON.parse(await read('extensions/hello-mie/manifest.json'));
const functions = [];
for (const file of ['src/extension-runtime.js', 'src/hub-root.js', 'src/hub-update-check.js', 'src/hub-script-host.js', 'src/hub-self-update.js', 'src/registry-client.js', 'src/extension-packages.js', 'src/extension-center.js', 'src/registry-settings.js', 'src/hub-ui.js', 'extensions/hello-mie/hello-mie.js']) {
  let source = (await read(file)).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  if (file === 'src/hub-ui.js') source = source.replace('/* LEGACY_ANIMATIONS */', await read('src/legacy-animations.inc.js'));
  functions.push(source);
}
const content = [
  '// MieMie-Hub-Build: ' + JSON.stringify(identity),
  '// 咩咩Hub ' + pkg.version + ' · Hub 自更新 / 基于咩咩工具箱 1.0.1',
  '(() => {',
  "'use strict';",
  'const h=window.parent;',
  'if(h.__MieMieHub){h.__MieMieHub.open();return;}',
  "if(h.__meemeCombinedUI||h.__timelineSwitcherV1||(h.__meemeTranslation01&&!h.__MieMiePolisherSource)){h.alert('请先停用旧咩咩工具箱或独立时间线／润色脚本并刷新，再启用咩咩Hub。原有设置会沿用。');return;}",
  'const HUB_VERSION=' + JSON.stringify(pkg.version) + ';',
  'const HUB_BUILD_MODE=' + JSON.stringify(buildMode) + ';',
  'const HUB_DEFAULT_REGISTRY_URL=' + JSON.stringify(defaultRegistry) + ';',
  'const HUB_ASSETS=' + JSON.stringify(assets) + ';',
  'const HELLO_MANIFEST=' + JSON.stringify(manifest) + ';',
  ...functions,
  'const hubShell=createHubRoot(h,HUB_ASSETS);',
  await read('src/timeline-builtin.js'),
  await read('src/bootstrap.js'),
  '})();\n',
].join('\n');
new vm.Script(content, {filename: 'miemie-hub.js'});
data.name = '咩咩Hub ' + pkg.version;
data.info = '内置时间线、扩展管理、设置、扩展中心入口及 Hello Mie；润色请另行导入独立扩展。首次从旧版本升级需手动导入并停用旧 Hub。设置可查询官方 GitHub Release；全局脚本支持校验后就地更新自身。浏览器 CORS 或宿主校验失败时拒绝安装；请保留更新前请求下载的恢复文件。扩展中心支持 Catalog、Discord 投稿管理和作者 GitHub Package 安装更新；在线服务地址可由构建预设，开发测试可在高级设置覆盖。';
data.content = content;
await mkdir(path.join(project, 'build'), {recursive: true});
await writeFile(path.join(project, 'build/miemie-hub.js'), content);
const bytes = Buffer.from(JSON.stringify(data, null, 2) + '\n');
const assetName = 'MieMie-Hub-' + pkg.version + '.json';
await writeFile(path.join(project, 'build/咩咩Hub-' + pkg.version + '.json'), bytes);
await writeFile(path.join(project, 'build', assetName), bytes);
const hash = value => createHash('sha256').update(value).digest('hex');
const update = {schemaVersion: 1, productId: identity.productId, version: pkg.version, tag: 'v' + pkg.version,
  format: 'tavern-helper-script', scriptId: data.id,
  asset: {name: assetName, size: bytes.length, sha256: hash(bytes)}, contentSha256: hash(Buffer.from(content))};
await writeFile(path.join(project, 'build/MieMie-Hub-update.json'), JSON.stringify(update, null, 2) + '\n');
console.log('Built ' + data.name + ' · ' + Buffer.byteLength(content) + ' bytes');
