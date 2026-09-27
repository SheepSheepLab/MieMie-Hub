# MieMie Ecosystem RC 验收记录

日期：2026-09-28。仅本地候选，尚未提交、推送、打 Tag、发布或部署。

AUTOMATED RC CHECKS: PASS。本轮 Final RC Refresh 重新执行全部正式 suite：637 PASS、0 FAIL、0 skipped；未沿用此前 633/635 项结果。
MANUAL RC VALIDATION: 用户已确认完成，最后两处 Timeline 修复实机操作后未发现新问题。本轮只建议下方六项最终抽查，不重跑整套人工流程。具体设备覆盖不作额外推断；浏览器 OAuth 仍明确为模拟 Discord。

## 版本决定

| 产品 | 开发版本 → 候选 | 理由 |
|---|---|---|
| Hub | 0.7.0 → 0.8.0 | 冻结代码包含蜂窝、Surface/Origin、Shortcut、Native Presentation、安装和生命周期增强；兼容性 MINOR，无 API v2。 |
| Polisher | 1.1.4 → 1.2.0 | 冻结代码完善 Native Floating Presentation、双模式、Shortcut 与单实例交接；业务数据格式不变。 |
| Registry | 0.4.0 → 0.5.0 | REGISTRY VERSION DECISION: 0.5.0。相对 0.4.0 功能提交 13c09fa477bb391fadccbd95e2470ef38a971a1d，增加独立 GitHub/Discord 链接、服务器可见范围预验证 API、公开 DTO 字段和 SQLite v3→v4 迁移，超出补丁范围。权限模型不变。 |

Registry GitHub 最新公开条目是 0.3.2 Pre-release，未找到公开 0.4.0 Release/tag；0.4.0 比较基线为仓库功能提交，不能据此断言生产部署版本。本轮未连接生产数据库。现有迁移在隔离临时数据库测试，生产升级/备份恢复仍需另行授权。

版本均为纯 x.y.z。Hub 从 package.json 生成全部活跃元数据；Polisher package/manifest 构建时强制一致；Registry service version、/health、GitHub User-Agent、启动日志统一读取 package.json。活跃产物不含旧 Hub 0.7.0 / Polisher 1.1.4 元数据。历史发布记录、旧包升级测试和历史治理文档保留旧版本；旧部署记录已明确标为历史。

## Hardening 基线

最初 RC Preparation 开始时均为 main，HEAD = origin/main，worktree clean。本轮刷新从已审计的 RC dirty tree 开始；结束时 HEAD 未变化，没有 staged changes。

| 仓库 | Hardening HEAD |
|---|---|
| Hub | 26cfea129d7829341315da65e688ff3458820397 |
| Polisher | 74b7b0e650661a085a933881f1222df04bf83ecb |
| Registry | 1ebc9f3bcdff61e2b6901f46acb21432525e151f |

## 最终候选产物与两次干净构建

完整 637 项测试通过后，每个仓库分别保存旧 build，再从空 build 目录执行 build #1；保存第一次结果，再从空目录执行 build #2。所有正式产物逐字节 SHA-256 一致，最终交付 build #2。备份与证明位于各仓库被忽略的 test-results/final-rc-refresh，不纳入源码。

Registry 的 build 验证服务版本和源码语法；每次通过后，按现有 Dockerfile 显式源码输入加部署文档生成确定性 tar.gz。它是源码归档，不是 Tavern 脚本、不是已构建 Docker image。没有部署，不含 .env、数据库、测试、node_modules。

下列路径相对于对应仓库；两列独立记录本轮两次结果。

| 产品 | 文件 | bytes | Build #1 SHA-256 | Build #2 SHA-256 | 结果 |
|---|---|---:|---|---|---|
| hub | `build/MieMie-Hub-0.8.0.json` | 5295484 | `9bfd9d53085a0f29e23eb25299914a92c334a554c8c45a24da962fc7f818cf95` | `9bfd9d53085a0f29e23eb25299914a92c334a554c8c45a24da962fc7f818cf95` | MATCH |
| hub | `build/MieMie-Hub-update.json` | 429 | `7fa8b74116d59fd3d9743e749f66263bd902cb6b527a9c48890cf77cacc1b68e` | `7fa8b74116d59fd3d9743e749f66263bd902cb6b527a9c48890cf77cacc1b68e` | MATCH |
| hub | `build/miemie-hub.js` | 5290392 | `22906b9da5271898fb27942c13d2b559bc6c14a661cbd5563b81e3fb069d3fea` | `22906b9da5271898fb27942c13d2b559bc6c14a661cbd5563b81e3fb069d3fea` | MATCH |
| hub | `build/咩咩Hub-0.8.0.json` | 5295484 | `9bfd9d53085a0f29e23eb25299914a92c334a554c8c45a24da962fc7f818cf95` | `9bfd9d53085a0f29e23eb25299914a92c334a554c8c45a24da962fc7f818cf95` | MATCH |
| polisher | `build/MieMie-Extension-update.json` | 1155 | `e8b3a0467bc8496575fd5f68ec97c27346df8de2d35ea5527f0a317c142cfe0b` | `e8b3a0467bc8496575fd5f68ec97c27346df8de2d35ea5527f0a317c142cfe0b` | MATCH |
| polisher | `build/MieMie-Polisher-Extension-1.2.0.json` | 2626279 | `30cd3fe0d31b8d9e3d81a7f89a4dff3dcb6eb93e31ba488115d1451a662e4779` | `30cd3fe0d31b8d9e3d81a7f89a4dff3dcb6eb93e31ba488115d1451a662e4779` | MATCH |
| polisher | `build/manifest.json` | 645 | `61ce3038c365f793633b8e5c5688b97e61e50dd3ccaf0c2682fd86f8f5bc067e` | `61ce3038c365f793633b8e5c5688b97e61e50dd3ccaf0c2682fd86f8f5bc067e` | MATCH |
| polisher | `build/miemie-polisher.js` | 2623562 | `23c4f9a0271852cf7cd659a53f8a4c69f0c39aa86d2c2edfe4a96d2f2b0e61e6` | `23c4f9a0271852cf7cd659a53f8a4c69f0c39aa86d2c2edfe4a96d2f2b0e61e6` | MATCH |
| polisher | `build/咩咩润色工具-Extension-1.2.0.json` | 2626279 | `30cd3fe0d31b8d9e3d81a7f89a4dff3dcb6eb93e31ba488115d1451a662e4779` | `30cd3fe0d31b8d9e3d81a7f89a4dff3dcb6eb93e31ba488115d1451a662e4779` | MATCH |
| registry | `build/MieMie-Registry-0.5.0-source.tar.gz` | 82646 | `b511c1f4896884dc10149afce1401ca27dae6d22e815ae4482ef09c569973abe` | `b511c1f4896884dc10149afce1401ca27dae6d22e815ae4482ef09c569973abe` | MATCH |

真实 Tavern 最终抽查使用 MieMie-Hub-0.8.0.json 与 MieMie-Polisher-Extension-1.2.0.json；中英文 JSON 字节相同，只选择一种，不重复导入。已有脚本沿用原实例与数据；候选尚未公开发布。update JSON、manifest 和 Registry 归档不是 Tavern 脚本。

严格组合锁已是这两个最终 hash，无需再次修改；可重复构建确认后，用最终 build #2 再跑组合验证，30/30 PASS（不重复加入 637 总数）。

## Timeline Fix Scope / Architecture Freeze

实际生产修改仅在 extensions/timeline/timeline.js 的 mountTimeline → upgradeSelect → show()：

- 不可见选择框：picker 从低层 root 移至 panel 同级，使用 panel 当前 z-index + 1，避免 Surface 抬升层级后遮挡，也不受 panel 滚动裁切。
- 向上展开间距：先设置宽度/maxHeight，再按实际渲染高度定位；不再误用 maxHeight 当实际高度。上下与按钮保持 5px，沿用 viewport 边界。

没有 CSS 修改，没有改 Timeline 切换/世界书业务、动画或持久数据。相关 tests/bundled-extensions.test.mjs 增加四项回归；tests/browser-final-ui/index.html 仅添加 ?timeline=1 隔离样例，不读取真实世界书。

Architecture Freeze Break Required: NO。
Timeline fixes are presentation-only and do not break Architecture Freeze.

Runtime lifecycle、manifest/Extension identity、API v1、Launcher/Surface/Shortcut contract、单实例和 install/update/uninstall semantics 未变。legacy key meeme_timeline_dock_v1 完全不变。Polisher Native Presentation / Adapter 与 Registry schema/权限/业务源码均无本轮逻辑修改。

专项自动化覆盖层级、实际选择保存、键盘、resize/scroll/outside dismiss、Surface close/dispose 清理、短/长列表实际高度以及窄屏边界。本轮真实浏览器使用实际构建：1280×720、390×500、390×844，向上/下均测得 5px；选项可见、点击命中、选择后接续状态保存。窄短屏打开/关闭、Hub reopen 后 Timeline 与其他 launcher 正常；自动 suite 继续保护 reopen center 和 Surface scroll restore。

## 本轮完整验证

| Suite | PASS | FAIL |
|---|---:|---:|
| Hub | 329 | 0 |
| Polisher | 42 | 0 |
| Registry | 177 | 0 |
| Hub / Polisher locked artifacts | 30 | 0 |
| Ecosystem / published upgrades | 19 | 0 |
| Hub ↔ Registry | 13 | 0 |
| Admin Console | 11 | 0 |
| Browser CORS | 8 | 0 |
| Browser OAuth simulation | 8 | 0 |
| 合计 | 637 | 0 |

没有跳过、取消或复用前轮结果。JS/MJS 语法检查：Hub 51、Polisher 18、Registry 36，共 105 个（含构建 JS）；git diff --check、git diff --cached --check 和 untracked 行尾检查通过。

完整 suite 保护 Honeycomb open/close/recenter/scroll、Surface origin/cleanup、Shortcut OFF/ON/open/close/disable/re-enable/uninstall、第三方 deactivate getter throw、Native place/run reject/timeout/cancel/release fault isolation。Polisher Standalone/Hub/Shortcut 保持同一 Native Floating Presentation、一个业务实例/Panel，覆盖 blur、hero、Dock、Reduced Motion 和 resize。

Registry OAuth 拒绝/交换失败结束清理、防伪 callback、包验证、managed_install、角色边界和 migration 均通过。Browser CORS 使用真实浏览器跨域；Browser OAuth 使用本地 mock Discord，不推导生产 OAuth/生产迁移已验收。没有连接生产数据库。

## 公开包 → Candidate 升级

RC Preparation 已从 GitHub 发布 API 下载并校验公开原始附件；本轮再次校验原始 hash，重跑实际旧包 → 候选升级，未重建旧包。

| 原始包 | 公开来源 | SHA-256 |
|---|---|---|
| Hub 0.7.0 | [v0.7.0 Release](https://github.com/SheepSheepLab/MieMie-Hub/releases/tag/v0.7.0) | `3629059f7b615ffb88f943ebb708ae06564ff812be2d193c4c18ff7f41bb8248` |
| Polisher 1.1.4 | [v1.1.4 Pre-release](https://github.com/SheepSheepLab/MieMie-Polisher/releases/tag/v1.1.4) | `bd4c78cbf83ddbd586cc7b0b6682c9f04ebd65ba8f12d68ac4aa8f5247577059` |

在隔离模拟宿主中执行完整旧脚本，mock GitHub 仅提供本地候选附件：

- Hub 0.7.0 真实 self-updater 识别 0.8.0、替换脚本并重启；脚本实例 ID、业务设置、Extension 状态、两种 Dock、Shortcut preference 保留；再次读回/重载无重复 Runtime/Panel。
- Polisher 1.1.4 → 1.2.0 经 Hub 的实际安装/更新流程；用户自定义名称同步新版本，实例 ID、宿主 metadata、API 设置/已记住 Key、Prompt、备份、世界书保留；Shortcut 恢复，无重复监听。
- Fresh Hub + Polisher 安装、检查同版本、disable/enable、uninstall/reinstall、Hub 消失/恢复、Standalone/Shortcut 共用 Native Motion、损坏包及网络失败无部分写入均通过。

可重跑命令（路径占位由执行者替换）：

```sh
MIEMIE_BUILD_MODE=production MIEMIE_DEFAULT_REGISTRY_URL=https://registry.sheepsheeplab.com npm test
node tests/integration/run.mjs --polisher <polisher-candidate-json>
node tests/ecosystem/run.mjs --polisher <polisher-candidate-json> --metadata <polisher-update-json> --legacy-polisher <published-1.1.4-json> --legacy-hub <published-hub-0.7.0-json> --hub-metadata build/MieMie-Hub-update.json
```

旧 Hub 参数是可选但必须成对提供；旧包严格锁定公开 hash，不接受未经确认的替代包。其余 suite 运行命令沿用各仓测试文档。日志和机器报告保留在本地临时验收目录，仓库只维护此结果摘要。

## Identity / 安全

- Hub：productId `miemie.hub`，script ID `e85cd9a3-6352-4b23-938a-6c94d826b4d3`。
- Polisher：productId/manifest ID `miemie.polisher`，script ID `4dd658f1-9d4b-4f74-bba8-305c4ef2a9c8`。
- Timeline `miemie.timeline` / 1.0.0 独立版本不动；Extension API v1、`__MieMieHub`、协议事件名不变。
- Product Identity / UI Copy 机制未改；Polisher 标题显示 1.2.0，Hub build/runtime/update metadata 为 0.8.0。
- `meeme_timeline_dock_v1`、`miemie_hub_extensions_v1`、`miemie_hub_shortcuts_v1`、`miemie_polisher_dock_v1`、`meeme_translation_v1`、`meeme_translation_key_v1` 等原存储键未改。
- 源码与最终产物扫描：无个人绝对路径、真实 OAuth/client/session/API secret、GitHub token 或私钥。命中的 11 处 credential 字面量均位于测试，为明确 fake fixture。cookie/session 处理标识符本身不是泄漏凭据。
- Hub 为 production 构建，唯一内置默认 Registry 为 `https://registry.sheepsheeplab.com`。最终 JS/JSON 无 active localhost、127.0.0.1、fixture.invalid 或 example.com 服务地址；校验器中的禁止 hostname/URL 规则保留。测试数据只在隔离 fixture。

## FINAL MANUAL SPOT CHECK

此前完整实机验收已由用户确认通过；以下仅针对最终重新构建文件快速抽查，不要求再跑整套人工清单：

1. Hub 打开 / 完整收起 / 再打开。
2. Timeline 选择框可见；向上、向下展开均紧贴按钮。
3. Timeline 打开 / 返回，无遮挡或残留。
4. Polisher 从 Honeycomb 打开 / 返回原 Icon。
5. Shortcut Orb 打开 / 收回，Orb 始终可见。
6. Tavern refresh 后检查基本状态与原有设置。

真实设备上的最终动画观感由这次短抽查确认。生产 Registry 部署、生产迁移和备份恢复不在本轮授权内。

## 修改范围

### MieMie-Hub

- `README.md`
- `docs/RC-VALIDATION.md`
- `docs/TESTING.md`
- `extensions/timeline/timeline.js`
- `package-lock.json`
- `package.json`
- `tests/browser-final-ui/index.html`
- `tests/bundled-extensions.test.mjs`
- `tests/ecosystem/run.mjs`
- `tests/integration/artifacts.lock.json`

### MieMie-Polisher

- `README.md`
- `docs/COMPATIBILITY.md`
- `docs/LAUNCHER-PROTOCOL.md`
- `docs/PACKAGE.md`
- `docs/TESTING.md`
- `docs/VERSIONING.md`
- `manifest.json`
- `package-lock.json`
- `package.json`
- `packaging/script-template.json`

### MieMie-Registry

- `README.md`
- `docs/GOVERNANCE-ACCEPTANCE.md`
- `docs/HUB-UPDATE-RELAY.md`
- `package-lock.json`
- `package.json`
- `src/app.js`
- `src/github-relay.js`
- `src/remote.js`
- `src/server.js`
- `src/version.js`
- `tests/version.test.mjs`

本轮 RC 修改涉及版本/活跃元数据、发布说明、候选产物锁、升级测试与验收文档；实机回归另修复 Timeline picker 层级及向上定位，并增加对应测试与浏览器 fixture。本轮刷新没有新增源码修复。Registry 的小版本模块仅消除 service version 重复值；没有改变路由、权限、数据库或业务行为。

Architecture Freeze Break Required: NO。
Commit: NO。Push: NO。Tag: NO。GitHub Release: NO。Production Deploy: NO。Production SQLite mutation: NO。Force Push: NO。

FINAL RC READY FOR RELEASE
