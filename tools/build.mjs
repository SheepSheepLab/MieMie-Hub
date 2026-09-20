import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const project = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFile(path.join(project, file), 'utf8');
const data = JSON.parse(await read('packaging/script-template.json'));
const pkg = JSON.parse(await read('package.json'));
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
for (const file of ['src/extension-runtime.js', 'src/hub-root.js', 'src/hub-update-check.js', 'src/hub-ui.js', 'extensions/hello-mie/hello-mie.js']) {
  let source = (await read(file)).replace(/^export /gm, '');
  if (file === 'src/hub-ui.js') source = source.replace('/* LEGACY_ANIMATIONS */', await read('src/legacy-animations.inc.js'));
  functions.push(source);
}
const content = [
  '// 咩咩Hub ' + pkg.version + ' · Hub Release 版本检查 / 基于咩咩工具箱 1.0.1',
  '(() => {',
  "'use strict';",
  'const h=window.parent;',
  'if(h.__MieMieHub){h.__MieMieHub.open();return;}',
  "if(h.__meemeCombinedUI||h.__timelineSwitcherV1||h.__meemeTranslation01){h.alert('请先停用旧咩咩工具箱或独立时间线／润色脚本并刷新，再启用咩咩Hub。原有设置会沿用。');return;}",
  'const HUB_VERSION=' + JSON.stringify(pkg.version) + ';',
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
data.info = '内置时间线、扩展管理、设置、扩展中心入口及 Hello Mie；翻译／润色请另行导入独立扩展脚本。停用旧版并刷新后启用；原有设置沿用。设置可查询公开 GitHub Release（含预发布）并比较 Hub 版本；不下载或安装更新。扩展中心正在准备中。';
data.content = content;
await mkdir(path.join(project, 'build'), {recursive: true});
await writeFile(path.join(project, 'build/miemie-hub.js'), content);
await writeFile(path.join(project, 'build/咩咩Hub-' + pkg.version + '.json'), JSON.stringify(data, null, 2) + '\n');
console.log('Built ' + data.name + ' · ' + Buffer.byteLength(content) + ' bytes');
