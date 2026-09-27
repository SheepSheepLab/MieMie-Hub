# Final Architecture Polish · 2026-09-27

> 后续 Application Presentation & Shortcut 工作已扩展此基线；当前状态与验证以 [APPLICATION-PRESENTATION.md](APPLICATION-PRESENTATION.md) 为准。尚未进入 Release Hardening。

结论：ARCHITECTURE READY FOR FREEZE。Hub 0.7.0 / Polisher 1.1.4，未升级版本，未 Commit / Push / Release。本报告针对本轮架构收口；已有 Final UI 和 Registry 未提交改动仍保留，不表示本轮重新实现了它们。

## 最终边界

| 层 | 所有权 | 不负责 |
| --- | --- | --- |
| Runtime | Extension 验证、单实例、生命周期、私有 record、API capability、错误隔离 | CSS、面板坐标、动画、Registry 安装流程 |
| Shell | 根节点、Dock 主球、原位置存储、宿主视口通知 | 扩展业务 |
| Launcher | Icon、布局、原生 Y 滚动、X 阻尼、Origin capture/current rect/snapshot | Registry、安装、权限与身份推断 |
| Hub UI | System Module 与 Extension panel 登记、页面布局、业务界面 wiring | Surface 队列和动画 keyframes |
| Surface Controller | 当前 Surface、串行切换、请求去重、撤销、返回 Launcher、取消与清理 | Registry、Package、Runtime record、视觉数值 |
| Surface Motion | Icon ↔ Panel 图层、transform/clip/opacity、临时图层恢复 | Extension deactivate/uninstall、导航、业务数据 |
| Skin | theme.css 与 Shell / Launcher / Panel CSS、图标资产 | Runtime / Client / Installer / Update / Permission / Manifest |

`createSurfaceController` 是闭包函数，不是新框架。原 `createHubUI` 已含独立队列、pending entry、serial、origin 和取消职责，抽出能实质降低混合职责。`createSurfaceMotion` 单独管理动画资源。没有 Theme Engine、Motion DSL、第二套导航或 Runtime。

## 调参与 Skin

- `src/motion-tuning.js`：冻结的内部 `LAUNCHER_TUNING`、`SURFACE_TUNING`。Launcher 包含 Hub 权重、边缘曲线、横向压缩、阻尼、回中衰减、手势阈值、展开/收拢节奏。纵向位置压缩继续由 scale 曲线积分得到，避免两个互相漂移的调参来源。
- 一/二列交错顺序、动态数量、结构性尺寸仍留在布局函数；没有配置化整个结构。
- Launcher 开关时长由同一 tuning 写入内部 CSS 变量，同步 overlay。Hover/press 使用 theme.css 的 scale/lift/motion tokens。
- Surface open/close duration/easing 继续读取 CSS tokens；内容/图标交接比例、无 Origin 的 scale/offset 集中在 `SURFACE_TUNING`。
- Skin 提取主要 Surface/Control/Sidebar/Icon/Badge/状态色、shadow、圆角、常用字阶和控件高度，保持原值。没有提取 1px、100%、display 等结构值。
- Timeline 和独立 Polisher 的内容 Skin 仍由各自视觉资产拥有，不强制继承 Hub 或接管第三方 CSS。以后统一换外观可能还要调整这些视觉资产，无需改业务 Runtime。

## Surface 安全与异常

- 私有 origin 保存 owner identity、DOM 引用、viewport rect snapshot、scrollTop/hubY；不通过 Extension API 暴露。
- 关闭依次选择：现有同 identity 图标真实矩形 → 打开时 snapshot → 缩小淡出。snapshot 限制在当前 visual viewport 边界；即使 Launcher 已移除也可使用。
- 实际 viewport geometry 改变时取消旧 flight、同步清理 face 与 icon visibility，再按最新面板布局完成打开/关闭。普通 Dock/layout 通知不取消动画；避免排队请求提前执行。
- 旋转期间状态正确优先，可能直接完成过渡，不模拟连续物理路径。
- 保留蜂窝 scroll；X 临时偏移归零。正常 close 只隐藏并 inert，不 deactivate、不删除业务数据。
- 按 entry 引用校验排队请求，旧实例不能打开重新启用后的替代面板。关闭时检查所属 entry，A 不能关闭 B。
- revoke/dispose 同步取消动画和临时图层。System Module 使用私有导航；Timeline 使用标准 showPanel/closePanel。
- API v1 不变。attachPanel/showPanel/closePanel 是 opt-in；未接入的第三方 UI 不扫描、不改 DOM、不重写 handler。
- Extension 只得到安全 capability 返回值与副本；未添加 origin/context/controller/Runtime record 的公开引用。factory 仍通过脱离 record 的 `factory(api)` 调用。

## Product Identity / UI Copy / Legacy

- `src/product-identity.js` 是当前用户可见中英文 Hub 名称来源。UI、构建显示名和带产品名的消息/日志读取它。
- `src/ui-copy.js` 集中扩展中心、设置、返回、发现/已安装/我的、三种账号状态和 official/community 完整 Badge 文案。页面独有说明留在页面；没有编号化所有文案。
- `hub-script-host.js` 旧“咩咩Hub”脚本头正则是历史识别契约，明确注释并保留，不能随显示名变化而失去旧包识别。
- 保留 `meeme_timeline_dock_v1`（既有 Dock 位置）、`__meemeCombinedUI`（旧 bridge）、`meeme-combined-menu`（当前 DOM/CSS 配对）、Timeline 历史数据/DOM 名字、Polisher `meeme_translation_v1` / `meeme_translation_key_v1` 等兼容键。
- `miemie.hub`、`miemie.timeline`、`miemie.polisher`、`__MieMieHub`、脚本 ID、API v1、Manifest 协议均未改名。
- 旧 `panel-transitions.inc.js` 由正式 `surface-motion.js` 与 controller 取代，build 明确组装模块；没有保留两份动画实现。

## Polisher 双模式

- Hub Mode：Launcher → attach/show/close → 原 Polisher Icon，关闭保留同一业务面板和设置；旧隐藏开关也统一经过 adapter capability。
- Standalone：adapter 自己实现 showPanel/closePanel，Back/Escape 统一关闭，无 Hub 依赖。
- 新 Hub 优先 closePanel；旧 Hub 通过能力检测保留历史兼容 fallback，不调用私有 go。
- 已验证 Hub 出现/消失、反复重载、单实例、内存凭据与配置保存。没有重构翻译/润色算法、修改模板或升级版本。

## 验证

| 验证 | 结果 |
| --- | --- |
| Hub 全量 | 278 / 278 |
| Polisher 全量 | 25 / 25 |
| 锁定实际 artifact 的 Hub/Polisher integration | 29 / 29 |
| 安装/更新/卸载 ecosystem | 14 / 14 |
| 两仓 build / JavaScript syntax / git diff --check | 通过 |

新增/加强断言：Product Identity 与固定语义来源、私有 tuning 不可变、旧 Dock 实际恢复、入口消失后的 snapshot/视口约束、opening resize、closing orientation、opening revoke、closing dispose、Standalone ESC/Back/旧 session 隔离、实际 Polisher 遗留控件 show/close 路径。原有 Runtime 防伪、单实例、动态 Launcher、Reduced Motion、队列旧实例、不同 Origin、未适配第三方、Timeline 和业务兼容测试继续通过。

浏览器冒烟使用真实 Hub build + 模拟宿主/目录，确认扩展中心和 Timeline 打开、返回/ESC 后 Launcher 恢复；不代表真实 Discord/生产端到端验证。手机 Safari/WebView 动画帧率、软键盘/旋转实机手感留到 Release Hardening。

本轮没有发现阻挡 Release Hardening 的架构债务。合作式 Extension 不是代码沙箱，这是已有模型，未扩大公开权限。

## 本轮文件

Hub：

- `src/surface-controller.js`、`src/surface-motion.js`、`src/motion-tuning.js`、`src/ui-copy.js`。
- `src/hub-ui.js`、`src/honeycomb-launcher.js`、`src/extension-center.js`。
- `src/extension-runtime.js`、`src/hub-self-update.js`（产品名引用）、`src/hub-script-host.js`（历史名称注释）。
- `assets/theme.css`、`assets/shell.css`、`assets/launcher.css`、`assets/hub-panels.css`、`assets/panel-transitions.css`。
- `tools/build.mjs`。
- `tests/architecture.test.mjs`、`tests/core-panels.test.mjs`、`tests/honeycomb-launcher.test.mjs`、`tests/integration/host-fixture.js`、`tests/integration/artifacts.lock.json`。
- `docs/EXTENSION-API.md`、`docs/FINAL-UI.md`、本文。
- 删除旧 `src/panel-transitions.inc.js`（之前尚未提交的文件）。

Polisher：`launcher-adapter.js`、`legacy-tool.js`、`tests/launcher-adapter.test.mjs`、`docs/SURFACE-COMPATIBILITY.md`。

本轮新增验收副本：Hub `build/MieMie-Hub-Architecture-Review-20260927.json`，Polisher `build/MieMie-Polisher-Architecture-Review-20260927.json`，与实际测试构建字节一致。版本沿用原值，只供本地手动验收，不是发布。原有历史验收副本不代表本轮最终构建。
