# MieMie Hub · 咩咩Hub

轻量 Hub Core，当前版本 **0.2.1**（GitHub Pre-release）。项目独立维护主悬浮球、Hub UI、内置时间线、Extension Runtime 和 Hello Mie；润色业务由独立的 MieMie Polisher 提供。

本版加入第一代 Hub 自更新：查询官方 Release，下载并校验发布文件，仅替换当前全局 Hub 脚本的代码，由新版接续确认保存。下载受浏览器 CORS 与宿主能力限制；无法安全读取、校验或定位当前实例时明确失败，不绕过检查。项目不需要 Polisher 目录、旧工具箱 JSON 或混合开发项目即可构建和运行基础测试。

## 开发

需要 Node.js 22 或更新版本和 npm。在本目录执行：

```sh
npm ci
npm run build
npm test
```

`npm test` 会先构建本项目。构建仅使用 Node 内置模块；锁定的开发依赖 `jsdom` 用于 Core 面板 DOM 测试及组合测试，不进入运行产物。`package-lock.json` 应提交，`node_modules/`、`build/`、`test-results/` 不提交。

构建生成：

```text
build/咩咩Hub-0.2.1.json
build/MieMie-Hub-0.2.1.json
build/MieMie-Hub-update.json
build/miemie-hub.js
```

中英文文件名的 Hub JSON 字节完全一致；GitHub Release 分发 ASCII 名称的 JSON 与机器更新元数据。JavaScript 文件用于检查。版本只来自本项目 `package.json`，构建注入运行代码、身份标记、设置页版本及更新元数据；Hub 与 Polisher 独立维护版本。新的官方版本必须使用无前导零的纯 `MAJOR.MINOR.PATCH`，见 [版本规范](docs/VERSIONING.md)。

## 目录职责

```text
assets/                       Hub 与时间线样式、图片、HTML
src/                          Core、Runtime、Shell、UI、内置时间线
src/hub-update-check.js        公开版本查询、SemVer 比较、超时及取消
src/hub-self-update.js         下载、校验、更新交接与持久保存确认
src/hub-script-host.js         正式脚本 API 适配、实例定位、仅 content 写入
extensions/hello-mie/          内置生命周期测试扩展及 Manifest
packaging/script-template.json 酒馆助手导出元数据
tools/build.mjs               Hub 构建、身份标记与机器更新元数据
tests/*.test.mjs               Runtime、面板、版本、宿主及自更新测试
tests/fixtures/                本项目负责部分的旧版只读测试基线
tests/integration/             固定 JSON 产物组合测试、宿主模拟和锁定信息
docs/                         Extension API、版本、自更新及测试说明
```

## 使用与更新

只启用 Hub 即可使用时间线与 Hello Mie。需要润色时，另外导入 MieMie Polisher 的 Extension JSON；本项目不打包润色源码或图标。扩展管理中的卸载仅撤销 Runtime 注册与实例，不删除助手脚本条目。时间线、主球位置与扩展偏好继续沿用原数据键。

旧版 `0.2.0-alpha.4` 没有自更新代码，首次仍需手动升级到 `0.2.1`。只保留一个 Hub 脚本候选；保留旧条目恢复材料，不清除用户存储、世界书或 Polisher 数据。若旧 Hub 条目有自定义 `data`，优先在原条目中替换新版 `content`。详见 [首次升级和恢复](docs/SELF-UPDATE.md)。

「扩展中心」与「设置」属于 Core Panel，不注册到 Extension Runtime。时间线、扩展管理及扩展提供的可选 Launcher 保持原有职责。扩展中心仍显示准备中说明，没有发现、安装或更新服务。

设置页在点击「检查更新」后查询 `SheepSheepLab/MieMie-Hub` 的公开 Release，不要求 GitHub 登录或 Token。查询使用包含 Pre-release 的 [Release 列表 API](https://docs.github.com/en/rest/releases/releases#list-releases)，忽略 Draft 与无效 Tag，分页后选择最高有效 SemVer；保留历史预发布版本的比较兼容，不使用 `/releases/latest`。检查总超时为 15 秒，重复调用合并，teardown 取消请求。

发现新的纯三段式版本后可点击「更新」。第一代仅支持酒馆助手全局脚本，包括受支持的全局文件夹；通过当前 iframe 的 `getScriptId()` 精确定位安装实例。更新只替换 `content`，保留实例 ID、用户名称、`data`、启用状态、顺序、文件夹及其他脚本。脚本列表名称可能继续含旧版本后缀，实际版本以新版 Hub 设置页为准。

更新会重新加载 Hub，并可能中断 Extension 请求和未保存编辑，请先停止生成并保存操作。写入前请求浏览器下载旧脚本恢复文件；**请求下载不等于文件已经永久保存**。新版启动后从本标签 sessionStorage 接手确认，并通过本地宿主接口读回保存内容；只有版本、实例、代码和持久保存都匹配，才显示已确认完成。

GitHub 请求不带酒馆凭据或用户数据；下载失败、CORS 阻止、hash 不符或宿主状态不明时不降级为未校验安装。不使用公共代理、`no-cors`、Token 或自动开启宿主 Proxy。第一代没有 Loader／A/B 自动回滚；hash 验证也不代表代码绝对安全。完整边界见 [自更新说明](docs/SELF-UPDATE.md)。

本版本不包含 Catalog、Extension 在线更新、Package Manager、Pinned 或蜂窝 UI。

## 开发扩展与组合验证

- [Extension API v1](docs/EXTENSION-API.md)
- [版本规范](docs/VERSIONING.md)
- [自更新、保存确认与恢复](docs/SELF-UPDATE.md)
- [测试、固定版本产物与限制](docs/TESTING.md)

基础测试不使用 Polisher。组合测试显式接收独立构建的 Polisher **1.0.1** JSON，并按 `tests/integration/artifacts.lock.json` 检查双方版本及 SHA-256：

```sh
npm run test:integration -- --polisher /absolute/path/咩咩润色工具-Extension-1.0.1.json
```

JSON 可以来自任意目录，无需另一项目源码，不自动下载。自动测试不等同于真实酒馆更新验收。

## 授权与来源

Copyright © 2026 SheepSheep。

本项目的软件代码采用 **GNU General Public License v3.0 or later**（SPDX：`GPL-3.0-or-later`）。你可以按照 GNU 通用公共许可证第 3 版，或自行选择自由软件基金会发布的任何后续版本，使用、研究、修改、再分发及商业使用软件。软件不提供任何担保，具体权利与义务见 [LICENSE](LICENSE)。

该授权包括本项目的 JavaScript、CSS、HTML、软件配置、构建脚本、测试及历史代码测试基线。`LICENSE` 是[GNU 官方 GPLv3 完整文本](https://www.gnu.org/licenses/gpl-3.0.txt)的原样副本；“or later”的选择由本声明及包元数据明确，不修改许可证正文。

MieMie / 咩咩官方品牌身份，以及指定角色美术资产，**不因软件采用 GPL 而获得同样授权**。当前单独说明的图片仅为 `assets/hub.png` 和 `assets/timeline.png`；`assets/` 中的 CSS / HTML 仍属于 GPL 软件代码。这是代码与指定素材分别说明许可的项目，不能将包含图片的整个发布包概括为单一 GPL 授权。

- [品牌身份与正常引用规则](BRAND.md)
- [指定 PNG 的来源与素材使用范围](ASSETS-LICENSE.md)
- [第三方依赖及其原有许可证](THIRD_PARTY_NOTICES.md)

按 SheepSheep 的来源确认，原咩咩工具箱和本项目的需求、功能设计及架构决策由 SheepSheep 提出，代码主要由 Codex 按这些需求生成、修改和迭代；当前没有其他需列出的共同版权人。当前审计未识别出复制或改写自第三方项目的产品代码。第三方开发依赖保持其原有授权，不被重新声明为 SheepSheep 的代码。

对外分发时应随附 `LICENSE`、上述品牌／素材说明及适用的第三方声明，并按 GPL 提供对应版本源码和构建材料。当前构建不会把这些文件嵌入酒馆助手 JSON；单独一个 JSON 不能替代完整的授权说明与源码提供安排。
