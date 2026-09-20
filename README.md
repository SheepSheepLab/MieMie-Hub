# MieMie Hub · 咩咩Hub

当前版本 **0.3.2**（开发测试 Pre-release）。轻量 Core 保留时间线、Extension Runtime 与 Hub 自更新，新增 Extension Ecosystem MVP。基础构建和测试不依赖 Registry 或 Polisher 源码。

## 扩展中心

首页保留一个「扩展中心」入口，内部为 **发现 / 已安装 / 我的**。发现页始终是普通用户视角，编辑和上下架只在「我的」。Registry 未配置或离线时，Core、时间线和本地扩展照常运行。

- **发现**：从自行配置的 Registry 获取上架目录，分页、搜索及来源筛选。作者与 Discord 投稿者分别展示；机器兼容性不等于官方审核。
- **GitHub**：文件始终来自作者自己的公开 Repository / Release。符合 [Package v1](docs/EXTENSION-PACKAGE.md) 才能安装；普通 GitHub 项目仍可跳转获取。也可直接输入作者仓库预览安装兼容性。
- **Discord**：仅展示原帖入口，不缓存临时 CDN 附件或自动安装。
- **已安装**：打开、启停、检查更新、更新，以及确认后物理卸载已识别的全局 Package。未识别为 Package 的运行扩展明确标为「Runtime 注销」，不会冒称已删除助手条目。
- **我的**：Discord OAuth、公开资料、投稿、编辑、上下架。Registry 登录会话仅留在当前 Hub 内存；重载后需重新登录。管理员身份由 Registry 环境变量白名单判断。

Registry 首次需要部署或本地运行，再在扩展中心「Registry 连接设置」填写服务根地址。没有内置生产地址或 OAuth Secret。配置见 [生态使用与安全边界](docs/ECOSYSTEM.md) 及 [Registry 部署说明](https://github.com/SheepSheepLab/MieMie-Registry/blob/main/docs/DEPLOYMENT.md)。

## 安装、更新与数据

只启用 Hub 即可使用时间线与 Hello Mie。MieMie Polisher 1.1.0 可单独运行；Hub 出现后主动收纳，Hub 消失后恢复独立球。Hub 不扫描或删除第三方悬浮球。Launcher 是可选能力，后台 Extension 不需要 open()。

Extension 安装和更新先验证 Release/Asset、Manifest、产品身份、版本、大小和双 SHA-256，才写入酒馆助手全局脚本。更新只替换目标 content，保留实例 ID、名称、data、文件夹与其他脚本。公开包 data 必须为空。脚本 API 返回不等于服务器持久保存或作者代码已成功启动；界面明确提示保存/运行待确认。更新前请求导出旧脚本，作者代码启动失败时可手工恢复，第一版没有自动回滚。

物理卸载会删除目标脚本条目及其 data，仅确认删除，不自动生成备份；不清空 localStorage、酒馆变量、Polisher 历史设置或其他脚本。请保存编辑并停止正在生成的任务后更新。Hash 校验不能保证作者代码安全，软件并未运行在完整沙盒里。

GitHub Extension 下载首先直连作者 Release；浏览器因 CORS 无法读取附件时，使用用户已配置的 Registry 0.1.2+ 受限字节转发。转发无需 Discord 登录，不携带 Token、聊天、密钥或宿主凭据。Registry 必须先验证作者仓库、Release 与 Manifest，只能转发匹配的两个附件；Hub 再独立校验 digest／SHA-256／身份。Registry 不持久托管软件文件。没有配置服务、服务不可达、超时或校验失败时拒绝写入，不开启宿主 Proxy、不使用公共代理或 no-cors。详见 [浏览器下载修复与复测](docs/DOWNLOAD-TRANSPORT.md)。这次不修改 Hub 自更新的独立下载流程。

Hub 自更新继续使用设置页独立流程，仅更新自己；[既有自更新说明](docs/SELF-UPDATE.md) 中的安装实例定位、仅 content 写入、新 iframe 交接与保存读回确认保持有效。旧 alpha.4 没有更新代码，首次仍需手动引导。

## 开发与构建

Node.js 22+ 和 npm，在本项目目录执行：

```sh
npm ci
npm run build
npm test
```

输出：

```text
build/MieMie-Hub-0.3.2.json
build/咩咩Hub-0.3.2.json
build/MieMie-Hub-update.json
build/miemie-hub.js
```

中英文 JSON 字节一致，Release 使用 ASCII 文件名。版本来自 package.json，官方版本强制纯 x.x.x。node_modules、build、test-results 均不提交。

## 开发者资料

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

Copyright © 2026 SheepSheep。

本项目的软件代码采用 **GNU General Public License v3.0 or later**（SPDX：`GPL-3.0-or-later`）。你可以按照 GNU 通用公共许可证第 3 版，或自行选择自由软件基金会发布的任何后续版本，使用、研究、修改、再分发及商业使用软件。软件不提供任何担保，具体权利与义务见 [LICENSE](LICENSE)。

该授权包括本项目的 JavaScript、CSS、HTML、软件配置、构建脚本、测试及历史代码测试基线。`LICENSE` 是[GNU 官方 GPLv3 完整文本](https://www.gnu.org/licenses/gpl-3.0.txt)的原样副本；“or later”的选择由本声明及包元数据明确，不修改许可证正文。

MieMie / 咩咩官方品牌身份，以及指定角色美术资产，**不因软件采用 GPL 而获得同样授权**。当前单独说明的图片仅为 `assets/hub.png` 和 `assets/timeline.png`；`assets/` 中的 CSS / HTML 仍属于 GPL 软件代码。这是代码与指定素材分别说明许可的项目，不能将包含图片的整个发布包概括为单一 GPL 授权。

- [品牌身份与正常引用规则](BRAND.md)
- [指定 PNG 的来源与素材使用范围](ASSETS-LICENSE.md)
- [第三方依赖及其原有许可证](THIRD_PARTY_NOTICES.md)

按 SheepSheep 的来源确认，原咩咩工具箱和本项目的需求、功能设计及架构决策由 SheepSheep 提出，代码主要由 Codex 按这些需求生成、修改和迭代；当前没有其他需列出的共同版权人。当前审计未识别出复制或改写自第三方项目的产品代码。第三方开发依赖保持其原有授权，不被重新声明为 SheepSheep 的代码。

对外分发时应随附 `LICENSE`、上述品牌／素材说明及适用的第三方声明，并按 GPL 提供对应版本源码和构建材料。当前构建不会把这些文件嵌入酒馆助手 JSON；单独一个 JSON 不能替代完整的授权说明与源码提供安排。
