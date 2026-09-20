# MieMie Hub · 咩咩Hub

轻量 Hub Core，当前版本 **0.2.0-alpha.3**。本项目独立维护主悬浮球、Hub UI、内置时间线、Extension Runtime 和 Hello Mie；润色业务由独立的 MieMie Polisher 提供。

本版在已完成物理拆分的项目中新增「扩展中心」与「设置」两个 Core 系统入口，继续使用主悬浮球与子悬浮球。项目不需要 Polisher 目录、旧工具箱 JSON 或混合开发项目即可构建和运行基础测试。

## 开发

需要 Node.js 22 或更新版本和 npm。在本目录执行：

```sh
npm ci
npm run build
npm test
```

`npm test` 会先构建本项目。构建仅使用 Node 内置模块；锁定的开发依赖 `jsdom` 用于 Core 面板 DOM 测试及单独执行的组合测试，不进入运行产物。`package-lock.json` 应提交，`node_modules/`、`build/`、`test-results/` 不提交。

生成 `build/咩咩Hub-0.2.0-alpha.3.json`（导入酒馆助手）及 `build/miemie-hub.js`（检查用）。Hub 版本由本项目 `package.json` 管理，与 Polisher 版本独立。构建注入 `HUB_VERSION`，同时用于运行中的 Hub 版本与设置页显示，无额外版本常量。

## 目录职责

```text
assets/                       Hub 与时间线样式、图片、HTML
src/                          Core、Runtime、Shell、UI、内置时间线
extensions/hello-mie/          内置生命周期测试扩展及 Manifest
packaging/script-template.json 酒馆助手导出元数据
tools/build.mjs               只构建 Hub
tests/*.test.mjs               Runtime、Core 面板与时间线兼容测试
tests/fixtures/                本项目负责部分的旧版只读测试基线
tests/integration/             固定 JSON 产物的组合测试、宿主模拟和锁定信息
docs/                         Extension API、测试说明
```

## 使用

停用旧工具箱或旧版本 Hub 后刷新，再导入本项目生成的 Hub JSON。只启用 Hub 即可使用时间线与 Hello Mie。需要润色时，另外导入 MieMie Polisher 提供的 Extension JSON；本项目不打包润色源码或图标。

扩展管理中的卸载仅撤销 Runtime 注册与实例，不删除酒馆助手脚本条目。已载入的本地扩展源可供重新注册。时间线、主球位置与扩展偏好继续沿用原数据键。

「扩展中心」与「设置」由 Core 直接打开自己的 Panel，不注册到 Extension Runtime，不使用 Manifest。原时间线与扩展管理入口保留，Extension Launcher 仍由扩展声明的可选能力决定。

- 扩展中心目前显示准备中说明，没有发现、安装或更新服务。
- 设置显示当前 Hub 版本；更新状态初始为「尚未检查」，点击「检查更新」仅在本地改为「在线更新服务尚未接入」，不发起网络请求。同一脚本实例内保留该提示，重新载入后回到「尚未检查」。
- 更新状态与显示逻辑分开，后续可接入版本检查。当前没有实现下载、校验、助手脚本替换、Loader 或回滚。

本版本没有 Catalog、在线下载、安装包管理、在线更新、Pinned 或蜂窝 UI。

## 开发扩展与组合验证

- [Extension API v1](docs/EXTENSION-API.md)
- [测试、固定版本产物与限制](docs/TESTING.md)

基础测试不使用 Polisher。组合测试需显式提供已构建的独立 JSON，校验其版本及 SHA-256 后才运行。例如：

```sh
npm run test:integration -- --polisher /absolute/path/咩咩润色工具-Extension-1.0.1-hub.2.json
```

JSON 可以从任何目录取得，不需要另一项目的源码，也不会自动下载。

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
