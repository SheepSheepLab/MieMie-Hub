# MieMie Hub · 咩咩Hub

咩咩Hub 是咩咩（MieMie）开源软件与社区生态的官方项目。生态由 SheepSheep 发起和创建（Founder / 创始人）；SheepSheepLab 是官方 GitHub 开发、维护与发布命名空间，官方项目主要通过该命名空间维护和发布，并欢迎社区贡献者共同参与。

当前版本 **0.6.0**（开发测试 Pre-release）。Core 负责 Extension Runtime、包管理与 Hub 自更新；扩展中心和设置是固定 System Modules。时间线与 Hello Mie 为通过标准 API v1 加载的 Bundled Official Extensions，官方默认捆绑时间线、随 Hub 整体更新，时间线只在 Launcher 打开，不进入已安装列表或包管理；仅架构测试可从构建声明移除。基础构建和测试不依赖 Registry 或 Polisher 源码。

## 扩展中心

首页保留一个「扩展中心」入口，内部为 **发现 / 已安装 / 我的**。发现页始终是普通用户视角，编辑和上下架只在「我的」。在线服务尚未部署或离线时，Core、时间线和本地扩展照常运行。

- **发现**：从在线服务获取当前身份有权看到的主动投稿，分页、搜索及来源筛选；未登录只展示公开项目。作者与 Discord 投稿者分别展示；机器兼容性不等于官方审核。
- **GitHub**：文件始终来自作者自己的公开 Repository / Release。符合 [Package v1](docs/EXTENSION-PACKAGE.md) 才能安装；普通 GitHub 项目仍可跳转获取。也可直接输入作者仓库预览安装兼容性。
- **Discord**：仅展示原帖入口，不缓存临时 CDN 附件或自动安装。
- **已安装**：打开、启停、检查更新、更新，以及确认后物理卸载已识别的全局 Package。未识别为 Package 的运行扩展明确标为「Runtime 注销」，不会冒称已删除助手条目。
- **我的**：Discord OAuth、公开资料、投稿、编辑、上下架，以及服务器成员限定可见。Registry 登录会话仅留在当前 Hub 内存；重载后需重新登录。Official 身份来自服务端可信角色；治理后台独立于 Hub。

普通用户打开「发现」直接使用构建内置的官方服务，在「我的」使用 Discord 登录，不需要 MieMie 账号或任何服务配置。扩展中心不提供 Registry 地址输入。自定义连接仅位于「设置 → 高级 / 开发者选项」，默认折叠；留空保存恢复构建默认值。官方生产构建内置 https://registry.sheepsheeplab.com；普通开发构建可离线。OAuth Secret、管理员 ID 名单始终只在服务器。配置见 [生态使用与安全边界](docs/ECOSYSTEM.md) 及 [Registry 部署说明](https://github.com/SheepSheepLab/MieMie-Registry/blob/main/docs/DEPLOYMENT.md)。

## 安装、更新与数据

只启用 Hub 即可使用时间线与 Hello Mie。MieMie Polisher 1.1.3 可单独运行；Hub 出现后主动收纳，Hub 消失后恢复独立球。Hub 不扫描或删除第三方悬浮球。Launcher 是可选能力，后台 Extension 不需要 open()。

Extension 安装和更新先验证 Release/Asset、Manifest、产品身份、版本、大小和双 SHA-256，才写入酒馆助手全局脚本。更新只替换目标 content，保留实例 ID、名称、data、文件夹与其他脚本。公开包 data 必须为空。脚本 API 返回不等于服务器持久保存或作者代码已成功启动；界面明确提示保存/运行待确认。更新前请求导出旧脚本，作者代码启动失败时可手工恢复，第一版没有自动回滚。

物理卸载会删除目标脚本条目及其 data，仅确认删除，不自动生成备份；不清空 localStorage、酒馆变量、Polisher 历史设置或其他脚本。请保存编辑并停止正在生成的任务后更新。Hash 校验不能保证作者代码安全，软件并未运行在完整沙盒里。

GitHub Extension 下载首先直连作者 Release；浏览器因 CORS 无法读取附件时，使用内置官方服务（或开发者显式覆盖的 Registry）受限字节转发。转发无需 Discord 登录，不携带 Token、聊天、密钥或宿主凭据。Registry 必须先验证作者仓库、Release 与 Manifest，只能转发匹配的两个附件；Hub 再独立校验 digest／SHA-256／身份。Registry 不持久托管软件文件。没有配置服务、服务不可达、超时或校验失败时拒绝写入，不开启宿主 Proxy、不使用公共代理或 no-cors。详见 [浏览器下载修复与复测](docs/DOWNLOAD-TRANSPORT.md)。Hub 0.5.1 自更新另有官方仓库限定的安全转发入口，需要 Registry 0.3.1 或以上，详见 [自更新说明](docs/SELF-UPDATE.md)。

Hub 自更新继续使用设置页独立流程，仅更新自己；[既有自更新说明](docs/SELF-UPDATE.md) 中的安装实例定位、仅 content 写入、新 iframe 交接与保存读回确认保持有效。旧 alpha.4 没有更新代码，首次仍需手动引导。

## 开发与构建

Node.js 22+ 和 npm，在本项目目录执行：

```sh
npm ci
npm run build
npm test
```

默认 `MIEMIE_BUILD_MODE=development`，可不配置在线服务，或使用本机测试服务。正式构建必须执行：

```sh
MIEMIE_BUILD_MODE=production MIEMIE_DEFAULT_REGISTRY_URL="$OFFICIAL_REGISTRY_HTTPS_URL" npm run build
```

`OFFICIAL_REGISTRY_HTTPS_URL` 由维护者设为实际已部署的公开 HTTPS 根地址；缺失、示例域名或本机地址会阻止生产构建。开发构建可设置 `MIEMIE_DEFAULT_REGISTRY_URL=http://127.0.0.1:8787`。此配置只进入公开服务地址，不含任何 Secret。更多见 [生产构建配置](docs/PRODUCTION.md)。

输出：

```text
build/MieMie-Hub-0.6.0.json
build/咩咩Hub-0.6.0.json
build/MieMie-Hub-update.json
build/miemie-hub.js
```

中英文 JSON 字节一致，Release 使用 ASCII 文件名。版本来自 package.json，官方版本强制纯 x.x.x。node_modules、build、test-results 均不提交。

## 开发者资料

- [四层架构、时间线迁移与无时间线测试包](docs/CORE-ARCHITECTURE.md)

- [社区扩展作者指南](docs/ECOSYSTEM.md)
- [Extension Package / Manifest v1](docs/EXTENSION-PACKAGE.md)
- [Extension API v1](docs/EXTENSION-API.md)
- [Launcher 双模式协议 v1](docs/LAUNCHER-PROTOCOL.md)
- [Launcher Icon Guideline v1](docs/ICON-GUIDELINE.md)
- [版本规则](docs/VERSIONING.md)
- [测试及黄金路径](docs/TESTING.md)

Hub 的基础测试完全独立。额外组合测试只读显式提供、锁定版本与 SHA-256 的产物，不查找或导入另一仓库产品源码：

```sh
npm run test:integration -- --polisher /path/to/MieMie-Polisher-Extension-1.1.0.json
```

本阶段不包含蜂窝 UI、Pinned、社交功能、镜像、Discord 附件安装、Extension 代码沙盒或 Loader/A/B。

## 授权与来源

Copyright © 2026 SheepSheep。社区贡献者（Community Contributors）保留各自的贡献者身份；除另有说明，贡献内容的版权归相应贡献者所有。

本项目的软件代码采用 **GNU General Public License v3.0 or later**（SPDX：`GPL-3.0-or-later`）。你可以按照 GNU 通用公共许可证第 3 版，或自行选择自由软件基金会发布的任何后续版本，使用、研究、修改、再分发及商业使用软件。软件不提供任何担保，具体权利与义务见 [LICENSE](LICENSE)。

该授权包括本项目的 JavaScript、CSS、HTML、软件配置、构建脚本、测试及历史代码测试基线。`LICENSE` 是[GNU 官方 GPLv3 完整文本](https://www.gnu.org/licenses/gpl-3.0.txt)的原样副本；“or later”的选择由本声明及包元数据明确，不修改许可证正文。

“咩咩”与“MieMie”分别为地位同级的中文、英文官方品牌；中文语境优先写“咩咩 / MieMie”，英文、GitHub 与技术语境优先写“MieMie / 咩咩”，书写顺序不表示主次。官方品牌身份、Logo、角色形象及指定角色 Icon 不因软件代码采用 GPL 而自动获得同等授权。当前 Reserved Assets 仅为 `assets/hub.png` 和 `extensions/timeline/icon.png`，目录中的软件代码仍适用 GPL。第三方修改版及商业 Fork 请查看 [BRAND.md](BRAND.md) 与 [ASSETS-LICENSE.md](ASSETS-LICENSE.md)：可使用自己的品牌和视觉资产按 GPL 收费分发代码；新素材政策允许免费原样转载含保留素材的官方包，默认不授权收费转售该含图包，历史版本按其发布时适用的许可处理。

- [品牌身份与正常引用规则](BRAND.md)
- [指定 PNG 的来源与素材使用范围](ASSETS-LICENSE.md)
- [第三方依赖及其原有许可证](THIRD_PARTY_NOTICES.md)

按既有来源记录，原咩咩工具箱及本项目初始创建阶段的需求、功能设计与架构决策由 SheepSheep 提出，初始代码主要由 Codex 按这些需求生成、修改和迭代。此记录说明初始创建来源，不将后续社区贡献归为 SheepSheep 的独占作品。当前审计未识别出复制或改写自第三方项目的产品代码。第三方开发依赖保持其原有授权，不被重新声明为 SheepSheep 的代码。

对外分发时应随附 `LICENSE`、上述品牌／素材说明及适用的第三方声明，并按 GPL 提供对应版本源码和构建材料。当前构建不会把这些文件嵌入酒馆助手 JSON；单独一个 JSON 不能替代完整的授权说明与源码提供安排。

### 0.4.2 Discord 登录修复

登录结果使用绑定原 Origin 和 PKCE 的一次性交接，不依赖弹窗消息或第三方 Cookie；收到 Registry 会话后验证当前用户并刷新「我的」。原消息交接保持旧服务兼容。生产发布构建使用 `MIEMIE_BUILD_MODE=production` 和真实 `MIEMIE_DEFAULT_REGISTRY_URL`。关闭 Hub/重载后需重新登录；不要复制任何 Token。

## Catalog 类型与治理

发现页区分 Community / MieMie 官方、酒馆扩展 / 独立应用 / Web 工具及平台。只有 Tavern + managed_install + 有效 Package 可以进入安装；独立程序跳转作者发布页，Web 工具跳转其 HTTPS 网站，Hub 不执行 EXE/APK/DMG。投稿的 Source、Type、Distribution 与 Platforms 分开；官方角色可在本人投稿选择 Official。管理操作全部移至 Registry `/admin`，普通 Hub 不提供 Ban、角色、保护或审计操作。
