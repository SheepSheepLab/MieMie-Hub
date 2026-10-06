# MieMie Hub Extension Developer Guide v1

社区 Extension 作者与 Codex、Claude 等 coding agent 从这里选择适配路径。

Current compatibility baseline：

| 项目 | 当前基线 |
| --- | --- |
| MieMie Hub | [0.8.2 正式版](https://github.com/SheepSheepLab/MieMie-Hub/releases/tag/v0.8.2) |
| Extension API | v1 |
| Extension Package | v1 |
| Production Registry | 0.6.1 |

本指南只负责入口与导航，不新增 Protocol、Package Format 或 API Version；详细契约仍以各自规范为准。**Catalog 收录、Runtime Compatibility 和 Managed Package Compatibility 是不同判断。** 能在 Hub 运行，不代表可以由 Hub 在线安装更新；有安装包，也不代表其 Runtime、业务或安全性已经验收。

## 选择需要的能力

| 能力 | 是否必须 | 对应规范 |
| --- | --- | --- |
| Catalog submission | 想出现在发现页时需要；本地 Runtime 接入不要求投稿 | [ECOSYSTEM](ECOSYSTEM.md) |
| Package managed install | 想由 Hub 在线安装／更新／物理卸载时需要 | [EXTENSION-PACKAGE](EXTENSION-PACKAGE.md) |
| Runtime registration | 想由 Hub 管理运行期生命周期时需要；普通外部投稿无需接入 | [EXTENSION-API](EXTENSION-API.md) |
| Honeycomb Launcher | 可选；需要蜂窝入口时声明，后台扩展无需提供 | [EXTENSION-API](EXTENSION-API.md) |
| Surface | 可选；使用 Hub 面板展开／返回动画时接入 | [EXTENSION-API](EXTENSION-API.md) |
| Shortcut Launcher | 可选；需已挂载主面板、声明 Launcher，并提供实例 `open()` | [EXTENSION-API](EXTENSION-API.md) |
| Standalone dual-mode | 可选；承诺有无 Hub 均可运行时，需要正确处理交接 | [LAUNCHER-PROTOCOL](LAUNCHER-PROTOCOL.md) |

## 1. 我只想把作品投稿到 Hub

无需修改 Runtime，也无需先制作 Package。通过扩展中心的「我的」登录并提交作品：

- **GitHub**：提交公开 Repository；没有标准机器包的项目仍可作为外部项目收录，用户前往作者 GitHub 获取。
- **Discord**：填写作者、名称、简介和原帖链接；Hub 只提供原帖入口，不读取或安装 Discord 临时附件。

`external_release` 表示前往作者外部获取入口，不表示 Hub 可以安装或更新该作品。酒馆扩展、独立应用和 Web 工具使用不同产品类型；Web 工具使用 `open_url` 打开 HTTPS 网站。来源、类型、分发方式、平台和可见范围的完整关系见 [ECOSYSTEM](ECOSYSTEM.md)。投稿成功不等于安全审核、作者认证或官方推荐。

## 2. 我要支持 Hub 在线安装／更新／卸载

按 [Extension Package v1](EXTENSION-PACKAGE.md) 准备作者自己的 Public GitHub Repository 和 Release：

- 纯三段式 SemVer `x.y.z` 与对应 `vX.Y.Z` tag；Release 可标为 Pre-release，但版本字符串本身不带后缀。
- 标准酒馆助手单脚本 JSON，包含完整构建内容及空 `data`。
- `MieMie-Extension-update.json` 和完整 Manifest。
- 稳定的 `productId`、固定导出 `scriptId`、匹配的构建身份行与 repository identity。
- GitHub 为两个 Release Assets 提供的 digest、最终脚本附件 SHA-256，以及解析后 `content` 的 `contentSha256`。

这是 **Managed Package Compatibility**。文件格式、字段限制、版本选择、Release 复读、下载与写入边界均以 Package 规范为准，不自行增加下载 URL、跳过验证或要求用户提供 GitHub Token。

固定导出 `scriptId` 与本机安装实例 ID 不是同一个概念：Hub 安装时创建实例 ID，更新保留该实例。不能根据显示名称识别产品。物理卸载删除目标全局脚本及其 `data`，不清空工具自己的外部存储。

## 3. 我要让工具进入 Hub 蜂窝 Launcher

先完成 [Extension API v1](EXTENSION-API.md) 的 Runtime 注册与生命周期接入，再提供 `contributes.launcher` 和可调用的 `instance.open()`。Hub 负责蜂窝入口及布局，作者无需复制或实现蜂窝 UI。

Launcher 是可选运行期能力，不决定 Package 是否可安装。没有 Launcher 的后台扩展仍可运行、启停，并可按 Package 规范制作可管理的发行包。声明入口但没有可调用的 `open()`，不会获得可用 Launcher。

## 4. 我要使用 Hub Surface 打开和收回动画

按 [API 的 Surface 规范](EXTENSION-API.md) 组织已有面板：

1. 在 `activate()` 中将主面板挂载到宿主 document，然后调用 `api.attachPanel(panel)`，并登记最终资源清理。
2. 实例 `open()` 返回 `api.showPanel()`，让 Hub 从对应蜂窝入口展开面板。
3. 面板关闭／返回调用 `api.closePanel()`，回到对应入口。

Extension 保持业务内容所有权；Hub 负责已接入面板的展示、位置和过渡。关闭面板不是停用、卸载或重置设置；不要在返回时创建第二个实例。完整示例、能力检测和清理要求见 API 文档。

## 5. 我要保留自己的外部悬浮球

可选使用 `api.registerShortcutLauncher({mount})`。先 `attachPanel()`，Manifest 声明 Launcher，同一实例提供 `open()`。Shortcut 是额外入口，不替代蜂窝入口，也不创建第二份业务。

作者控制 appearance、drag、dock、位置保存和自己的 presentation。`mount` 同步接收 `{open}`，点击入口使用这个回调，以便 Hub 捕获正确的打开来源；返回符合 API 契约的 `getOrigin`、`dispose` 等句柄。不要把自己实现的私有 controller 传作 Hub Runtime。

Hub 不扫描第三方 DOM。用户在已安装页开启「显示悬浮球」后才挂载该入口，默认关闭；移除入口必须清理其 DOM 和事件。可选原生动画的完整契约见 [API 的 Shortcut 与 Native Presentation 说明](EXTENSION-API.md)。

## 6. 我要同时支持 Standalone + Hub

按 [LAUNCHER-PROTOCOL](LAUNCHER-PROTOCOL.md) 管理交接，始终保持 **single business instance**。不能让 Standalone 启动一份业务，再由 Hub 启动第二份业务或第二层 Hook。

Hub 接管前停止独立业务并完成清理，再通过 `extensions.provide()` 提供同一产品的工厂。Hub 消失时，等待来源 lease 释放及旧 Hub 的 `whenDisposed` 清理完成，再恢复 Standalone。串行处理重复事件、双启动顺序、Hub 重载和异步清理，不把 disposed 事件等同于清理已完成。

Hub 仍存在而用户已停用／注销扩展时，不得绕过用户选择自动复活独立业务。协议中的 Polisher 1.1.0 链接是固定参考快照，包含产品专用身份，不能原样复制其 ID、品牌或存储 key；当前 Shortcut 契约以 API 文档为准。

## 7. Runtime Compatibility Gate

按 [EXTENSION-API](EXTENSION-API.md) 验证；可选项未采用时记录 N/A，不把它们当成所有扩展的强制要求。

- [ ] Manifest 符合 API v1，使用项目自己的稳定 Extension ID。
- [ ] `factory(api)` 返回符合契约的实例；`activate`／`deactivate` 可选，若提供则正确管理资源。
- [ ] Hook、事件、请求、计时器、DOM 等均有清理；停用后迟到任务不会重新写入。
- [ ] `provide`／`register`、启停、Runtime 注销及重复来源处理符合 API，尊重用户状态。
- [ ] 若提供 Launcher，`contributes.launcher` 与 `open()` 配套，反复打开不新增业务实例。
- [ ] 若采用 Surface，打开／返回／停用过程中面板与资源状态正确。
- [ ] 若采用 Shortcut，开关、入口来源和 dispose 正确，与蜂窝共用实例和面板。
- [ ] 若支持 dual-mode，双启动顺序、Hub 重载和异步 handoff 均保持单实例。

**通过 Runtime Gate 不代表通过 Managed Package Gate。** 特别是 `hub.extensions.uninstall(id)` 只注销 Runtime，不物理删除酒馆助手脚本。

## 8. Managed Package Compatibility Gate

按 [EXTENSION-PACKAGE](EXTENSION-PACKAGE.md) 检查发行包，按 [TESTING](TESTING.md) 区分自动测试与真实 Tavern 验收。

- [ ] Public GitHub Repository，Release 版本为 `x.y.z`，tag 为 `vX.Y.Z`，不是 Draft。
- [ ] 标准单脚本 JSON，公开包 `data` 为空，最终附件符合文件名与大小限制。
- [ ] `productId` 稳定并与 Manifest ID 一致，固定导出 `scriptId` 稳定。
- [ ] `content` 第一行构建身份与 Manifest、repository、Release 和 metadata 一致。
- [ ] `MieMie-Extension-update.json` 字段与最终脚本包一致。
- [ ] 两个附件均有 GitHub digest；原始附件 SHA-256 和 `contentSha256` 正确。
- [ ] 正式 Package validator 接受；Release／Asset 锁定、复读和完整性校验不被跳过。
- [ ] 真实 Tavern clean install 成功，保存确认与 Runtime／业务状态分别记录。
- [ ] 使用已发布旧包验证 update，保留实例 ID、自定义名称主体和用户数据，核对保存及适用的运行版本确认。
- [ ] 物理 uninstall 删除正确条目，不影响其他脚本或外部存储；需要时验证重新安装。

首个版本没有旧包时，更新验收记录为 N/A／尚未验证，不宣称已通过；后续发布补做。**没有 Launcher 的后台 Extension 仍可成为合法 Managed Package。** 机器兼容和 hash 通过不代表安全审核。

## 9. Icon / Presentation

作者提供自己有权使用的产品视觉，按 [ICON-GUIDELINE](ICON-GUIDELINE.md) 准备资源。无需自行裁圆；Catalog 列表与蜂窝使用各自的 Hub presentation 尺寸和 mask。

兼容 Hub 不要求采用 MieMie／咩咩品牌、官方角色、Logo 或 Icon。官方视觉资产政策仍以 [BRAND](../BRAND.md) 和 [ASSETS-LICENSE](../ASSETS-LICENSE.md) 为准，本指南不重新定义授权。官方应用的显示／协议身份约定见 [PRODUCT-IDENTITY](PRODUCT-IDENTITY.md)，不要据此改名第三方项目或复制官方协议 ID。

## 10. AI / Coding Agent Quick Start

可复制以下提示词；先审计所选项目的现状，再按明确的适配范围实施：

```text
读取 MieMie Hub 的 docs/EXTENSION-DEVELOPER-GUIDE.md，以及其中链接的现行 API、Package、Launcher、Icon、身份与生态规范。不要把历史 Review / Audit 当作当前 API 或发布状态。

先审计本项目，分别报告 Catalog 投稿、Runtime Compatibility、Managed Package Compatibility、Launcher、Surface、Shortcut 和 Standalone dual-mode 的现状、所需变更与验证方法；不适用项明确标为 N/A。根据 Owner 的目标确定本次适配范围，再实施，不默认开启全部可选能力。

适配时保持既有业务行为，并保留本项目自身 author、repository、license、product identity、stable IDs、storage keys 以及真实 Contributor / Git / PR / history 归属。不得复制官方 productId、scriptId、storage key、品牌、作者或仓库地址。官方项目继续遵守既有 SheepSheep 产品作者、SheepSheepLab 官方命名空间及贡献归属规则，不把命名空间当作产品 author，不自动把 Contributor 追加到产品 author。

Runtime Compatibility 与 Managed Package Compatibility 分别实现和验证。不能把“在 Hub 可运行”当成“可在线安装更新”；Runtime uninstall 不是物理删除。可选入口共用单个业务实例。所有样例占位值必须替换为本项目的真实值，不能伪造 hash、digest 或实机验收结论。
```

## 11. Release Checklist 与文档职责

发布前分别记录两个 Gate 的适用范围和结果，确认最终包身份、字段和 hash 一致，按 [Package v1](EXTENSION-PACKAGE.md) 完成作者仓库的 Release 附件准备。保留适用的软件许可证及贡献归属，区分模拟测试与真实安装验证；发布操作仍按项目 Owner 的授权执行。Hub 产品版本、作者扩展版本、API v1 和 Package v1 不要混为同一个版本号。

| 文档 | 权威职责 |
| --- | --- |
| 本 Developer Guide | Entry / Navigation，选择路径及验收清单，不重复定义底层协议 |
| [EXTENSION-API](EXTENSION-API.md) | Runtime / Lifecycle / Surface / Shortcut public API |
| [EXTENSION-PACKAGE](EXTENSION-PACKAGE.md) | Managed install / update / physical uninstall 的包格式、验证与边界 |
| [LAUNCHER-PROTOCOL](LAUNCHER-PROTOCOL.md) | Standalone ↔ Hub dual-mode integration |
| [ICON-GUIDELINE](ICON-GUIDELINE.md) | Presentation asset guidance |
| [PRODUCT-IDENTITY](PRODUCT-IDENTITY.md) | 官方应用 Display / Protocol identity convention |
| [ECOSYSTEM](ECOSYSTEM.md) | Catalog / Submission / Distribution / Governance boundary |
| [TESTING](TESTING.md) | 当前测试运行方法；明确标注的旧版本章节保留历史结果 |
| [BRAND](../BRAND.md)、[ASSETS-LICENSE](../ASSETS-LICENSE.md) | MieMie 官方品牌／指定素材政策 |

带日期或 Historical 标记的 Review / Audit 是阶段记录，不取代上述现行规范。若发现指南摘要与详细规范冲突，先报告差异并核对当前正式实现，不自行发明兼容协议或放宽校验。
