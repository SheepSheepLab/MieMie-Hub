# Final UI v1 · 待实机验收

这份改动直接使用正式 Hub 源码，没有沿用先前独立 Preview 的 UI 实现。版本仍为 0.7.0；未 Commit、Push 或 Release。本次 Surface 增量保持 API v1，新增可选 closePanel，并小范围适配 Polisher 双模式。Registry 本轮增加独立项目链接、Discord 服务器预验证与登录成功页自动关闭；仅本地修改，未部署。

## 打开与验收

- 本轮实机验收副本：`build/MieMie-Hub-Surface-Review-20260927.json`，与下面正式源码构建产物字节一致，仅文件名区分。它保留真实业务能力，不是模拟后端脚本。先备份并停用原 Hub、刷新酒馆，再导入该文件；同时启用旧 Hub 会被单实例保护拦截。
- 实机产物：`build/MieMie-Hub-0.7.0.json`。这是本地未发布构建，包含正式 Registry 地址；先停用原 Hub，再在测试酒馆导入，避免同时启用两个同 ID 的 Hub。
- 本机浏览器检查：在仓库执行 `node tools/ui-review.mjs`，打开 `http://127.0.0.1:5173`。先运行 build 才有可查看的产物。
- 验收页直接加载 `build/miemie-hub.js`；只模拟宿主、目录和测试 Extension，不复制生产 UI，不访问生产数据，不提供真实 Discord 登录。该页面及服务器均不进入生产构建。
- 普通开发构建：`npm run build`。实机在线构建：`MIEMIE_BUILD_MODE=production MIEMIE_DEFAULT_REGISTRY_URL=https://registry.sheepsheeplab.com npm run build`。

## Launcher 结构与算法

1. Shell 仍独占主球拖拽和 `meeme_timeline_dock_v1` 偏好。Launcher 展开时借用同一个主球 DOM，关闭后归还；没有复制主球、没有重写 Dock 数据。
2. `honeycombLayout` 沿用用户三方案 HTML 的疏朗菱形：桌面中心 `(0,0)`，六邻居 `(0,±144)`、`(±125,±72)`；所有屏宽均使用 1/2 交错列，更多入口沿同一窄列向上下延展。手机保持 1/2 交错列，水平步长最大 109px、行步长 65px，图标随宽度缩至 48–76px；桌面 94px。Hub 位于中心原点，其余入口按 Runtime 顺序分配由近及远的格。
3. 初始滚动偏移令 Hub 位于视口中心。之后 Hub 与其他图标同属原生滚动画布，不固定在视口中心。
4. 缩放为 `1 - 0.52 * min(1, abs(distance)/(height/2))^1.6`。中心为 1，边缘约 0.48；Hub 再乘 1.18。纵向位置使用该曲线的积分投影，让行距随缩放收紧；超出半屏后以 0.48 斜率继续向外移动，不把图标无限堆在边缘。横向也轻微向中心收紧。完全越界后由视口裁切。
5. 横向偏移为 `64 * dx / (abs(dx) + 160)`，阻力逐渐增大。释放后按时间指数衰减回 0，低于 0.1px 归零；Reduced Motion 立即归零。
6. 手机使用 `touch-action: pan-y`，保留浏览器纵向惯性；不 preventDefault 触摸纵向操作。鼠标 Pointer 拖动改变 scrollTop，滚轮与触控板仍由浏览器处理。拖动后抑制误点击；键盘焦点会把越界图标带回可读区域。
7. 展开 560ms、收起 440ms：主球位置使用首尾速度与加速度均为零的五次曲线；子球相对移动中的主球连续散开 / 收拢，不再分成两段停顿。Hub 名称随收起缩入图标。只在动画边界测量实际矩形，快速反向时从当前可见位置继续，结束帧保持到归还同一个真实主球。
8. 背景只在 Launcher 展开时压暗并模糊；桌面 blur 12px、手机 8px。过渡主要使用 transform / opacity，Reduced Motion 禁用复杂飞行动画和 CSS 伪元素动画。

## 扩展中心与 Settings

- Desktop 与 Mobile 均为左侧图标导航；手机侧栏收窄至 52px，不再与底部返回相邻。按钮保留标题、aria-label 与当前页语义。
- 账号位于标题栏右侧，持续显示头像、用户名和状态。判断仍是 `banned` 优先，其次 `isAdmin`，没有使用 `canSubmit` 猜测账号状态，也不改 `isOwner`。
- 发现页使用紧凑 Row Card：图标、名称、作者、简介、来源、平台及原有操作；版本紧随标题，已安装为不可点击状态，操作靠右，来源链接集中分组，投稿者头像和名称位于右下角。右上方 Badge 只消费服务端 classification，完整显示「🐑官方扩展 / 🧩社区扩展」。
- Select 使用标准原生语义，重新绘制触发器外观；键盘、系统选项菜单、触摸交互仍由浏览器提供。
- Settings 保留 Hub 版本、检查更新、更新和保存确认流程，不显示扩展服务及其服务器地址，也不挂载高级入口。原开发配置 helper 及其测试保留，但不进入用户构建；构建参数和历史服务覆盖偏好仍然有效。
- 面板适应 visualViewport 与安全区；Core 面板显示在 Dock 上方，避免悬浮球遮住卡片操作。

## 视觉与可复用边界

- `assets/theme.css` 集中背景、Surface、文字、强调色、边框、Glow、圆角、间距、控件高度、动效、Blur、安全区变量。
- `src/product-identity.js` 集中 `HUB_PRODUCT.name` / `englishName`；Shell、Core UI 和构建名称消费这些常量。协议 ID、Extension ID、全局桥接名称保持原值。
- 移除旧子球定位、旧 Legacy Menu CSS、Jelly/Wobble 及对应 SVG effects。`surface-controller.js` / `surface-motion.js` 管理所属 App Icon ↔ Surface 过渡，移除旧的统一主球原点与 splash 动画。
- Surface 是 API v1 的可选增量；未 attachPanel 的第三方 UI 不被接管。详见 `EXTENSION-API.md`。

## 前期 Final UI 验证结果（Surface 之前）

- Hub 全量：263/263；Registry 全量：170/170；Admin HTTP/DOM：11/11。
- Hub / Polisher 实际产物组合：28/28。
- 安装、更新、卸载生态流程：14/14。
- Hub ↔ Registry 契约：13/13。
- Production build、19 个 Hub 源码/工具/构建语法检查及 Registry build、`git diff --check` 通过。
- 新增针对性断言覆盖 参考菱形的精确坐标、动态扩展无重叠、所有屏宽的窄列排列与温和边缘缩放、中心 Hub、滚动、连续 scale、横向回弹、触摸不拦截、Dock 恢复、重复开关、动态入口、动画中断、展开期间点击不跳位、Reduced Motion、键盘/触摸焦点区别、标题栏账号、会话过期去重、Sidebar、Badge 和原生 Select。
- 浏览器检查 320、375、390、430px 及 1280px 桌面，没有发现页面或卡片横向溢出；本轮额外检查各宽度的图标/标题顶部对齐和实际卡片 scrollWidth。浏览器滚动后 Hub 确实离开中心；横向拖动归零且不误开应用。

仍需真实酒馆 / iPhone Safari / Android WebView 验收：Dock 飞入/飞回的手感、少量/大量扩展的视觉疏密、真实手指惯性、键盘弹起安全区、背景模糊的帧率、宿主自定义主题干扰及 Timeline/Polisher 面板观感。浏览器模拟和 DOM 测试不等同于这些实机结论。

## 本轮视觉细节调整

- 发现条目按新的排版参考调整：左上图标 / 名称 / 版本 / 作者，右上安全说明与身份标签，简介下接右侧操作，底部左侧为两个链接、右侧为来源及投稿者。保留现有背景，不采用参考图的拼接背景。
- 条目标题 17px、简介 15px、作者 / 版本 / 链接 / 来源 / 投稿者 13px、安全说明 12px；工具图标桌面 48px、窄屏 40px，投稿者头像 28px。「已安装」仍为 13px 与原有内边距。窄屏按内容容器换行，触屏链接保留 44px 点击高度。
- 移除条目重复的「查看 GitHub」入口；两个来源链接组成对齐、紧凑的信息组，触屏仍保留 44px 点击高度。安装说明降为次级注释，副标题改为「发现更多工具」。
- Hover 参考所提供 HTML：上浮 5px、放大至 1.11、6px 外圈淡入、柔和阴影；触摸按压缩至 0.95。
- 验收页默认 20 个模拟扩展（另有正式核心入口）。按最新确认仅保留上下连续缩小，边缘保留约一半尺寸，移除变暗实验入口。
- 工具 Icon 统一为圆形。GitHub / Discord 链接分别显示「点击查看」，缺少时显示「暂无」。卡片按内容容器宽度排版，窄屏图标不再跨行，标题与图标顶部对齐。
- 投稿表单拆分两个链接。选择受限可见范围后，在下方单独显示「作为可见范围依据的 Discord 帖子 / 消息链接」及「验证」按钮。公开 Discord 展示链接与此字段独立；Discord 主来源按原有规则沿用其原帖范围，GitHub 来源可单独指定范围帖子。验证通过当前认证账号查询服务器名称、头像和成员资格，修改范围链接后清空旧结果，迟到结果不覆盖新输入；保存时仍重新验证。
- 本机验收页的「Discord 登录」为本地模拟账号，可进入我的→提交扩展测试上述交互；服务器名和头像均为模拟数据，不进行真实 OAuth。
- Registry 成功回调页在发送旧协议通知后尝试自行关闭窗口，兼容 opener 被隔离的新轮询协议；浏览器拒绝自动关闭时保留返回提示。
- 新表单写入和服务器验证需要配套 Registry 更新；当前线上服务未部署本轮改动。旧 Hub 仍可使用新 Registry 的原有字段。
- 投稿者头像测试数据由本地 SVG 提供，不读取真实账号头像。

## 登录故障处理（本轮）

- 等待授权结果时，连续网络错误 / 请求超时最多尝试 3 次；成功读取 pending 后恢复正常轮询，总等待仍有截止时间。
- 授权后 `/api/me` 的短暂网络失败最多尝试 3 次，验证成功之前不发布登录身份。401/403、无效或已消费的交接结果不重试为成功；退出、切换服务和销毁不会恢复过期身份。
- 错误提示区分连接授权服务、接收授权结果、确认账号状态，不暴露 Token、PKCE 校验码或底层请求数据。修正超时先被取消事件抢先解释的问题。
- 新增回归覆盖轮询 / 账号请求短暂断网恢复、连续失败上限、请求超时、已消费结果、权限拒绝、重试期间退出。
- 实机报告来源为 `http://127.0.0.1:8000`。本轮只读访问生产 `/health` 和该来源的 OPTIONS 预检均连接超时，未获得可判断 CORS 的 HTTP 响应。因此尚未确认生产 Discord 登录恢复，不能把本地模拟通过当成生产登录通过；新构建需要再次实机登录定位具体阶段。
- 对应改动为 `src/registry-client.js` 与 `tests/registry-client.test.mjs`；未修改生产配置和服务端认证权限。

## 性能限制

滚动只排入单个 requestAnimationFrame，读取一次 scrollTop 后写各图标 transform；不逐图标测量 DOM。空闲不持续轮询。几何只在入口变化或视口变化时重算。当前未引入虚拟列表；大量扩展仍应在目标手机上观察合成层与 blur 成本。

## 本轮文件

- Core：`src/hub-root.js`、`src/hub-ui.js`、`src/extension-center.js`、新增 `src/honeycomb-launcher.js`、`src/product-identity.js`。
- 样式/标记：`assets/shell.css`、`assets/hub-panels.css`、`assets/orb.html`、新增 `assets/theme.css`、`assets/launcher.css`、`assets/panel-transitions.css`。
- Legacy：删除 `assets/legacy-menu.css`、`assets/effects.html`；`src/legacy-animations.inc.js` 被 `src/surface-motion.js` 的 Surface 过渡替代。
- 构建/验收：`tools/build.mjs`、新增 `tools/ui-review.mjs`、`tests/browser-final-ui/index.html`、`tests/browser-final-ui/avatar.svg`。
- 测试：`tests/core-panels.test.mjs`、`tests/extension-center.test.mjs`、新增 `tests/honeycomb-launcher.test.mjs`、`tests/ecosystem/run.mjs`、`tests/integration/artifacts.lock.json`。
- 文档：`README.md`、`docs/CORE-ARCHITECTURE.md`、`docs/ECOSYSTEM.md`、`docs/PRODUCTION.md`、`docs/DOWNLOAD-TRANSPORT.md`、`docs/TESTING.md`、本文件。

## Surface / Launcher Origin（本轮）

- 状态在 Hub UI 的私有闭包中，过渡串行、重复目标复用同一 Promise，附带 attachment 校验，失效会话排队请求不能控制新实例。opening / open / closing / closed 与 Extension enabled 生命周期分离。
- 点击入口时记录 identity、DOM 参考、圆形 icon viewport rect、scrollTop 与布局基准。关闭优先按同一 identity 找当前 DOM 并重新测量；布局变化时按基准补偿 Y，X 归零。原入口消失时缩小淡出，测量失败时采用快照；不把 origin 或 Runtime record 暴露给 Extension。
- 打开期间蜂窝继续挂载并保留背景，只隐藏画布且 inert。关闭开始恢复蜂窝，Panel 缩回对应入口，完成后恢复焦点并轻微高亮。关闭隐藏面板但保留业务实例，disable / uninstall / dispose 才走原清理通路。
- 使用 WAAPI transform / scale / opacity / border-radius；内容延迟淡入、提前淡出。集中复用 `--mie-motion-surface-open`（520ms）、`--mie-motion-surface-close`（460ms）和 `--mie-ease-surface`。Reduced Motion 跳过复杂动画，仍执行状态和滚动恢复。视口变化时继续使用现有 place()，不在动画帧里测量布局。
- Extension Center / Settings 直接使用 Hub 内部通路，仍是 System Module。Timeline 返回使用 closePanel。旧 showMessage 按 Extension identity 关联共享消息面板，切换也不会串 Origin。
- Polisher Hub Mode 优先 closePanel、旧 Hub 保留兼容返回；Standalone adapter 本地 closePanel，完全不依赖 Hub。未接入 Surface 的第三方继续自行管理 UI。
- 返回按钮、已支持的 ESC 共用关闭通路；本轮不劫持浏览器 history，因此没有新增手机系统返回键协议。

### Icon ↔ Window 连续变形调整

- 窗口缩回时保持不透明，圆形裁切连续过渡；在末段将窗口内容交接给对应图标图案，避免先消失再出现图标。打开时反向交接。
- 仅临时绘制 Hub 自己的图标图案，不复制 Extension 业务 DOM。衔接期间隐藏原图标，完成 / 中断时恢复；临时图案不可点击、不进入可访问树。恢复面板原有 inline 样式。
- Motion tokens 调整为打开 520ms、关闭 460ms、cubic-bezier(.32,.72,0,1)。Reduced Motion 与无 Origin fallback 保持可用。
- 新增回归断言覆盖真实图案交接、末帧不透明、圆形裁切、原图标隐藏 / 恢复、禁用中断清理。
- 最新实机副本：`build/MieMie-Hub-Surface-Morph-Review-20260927.json`。仅更新 Hub 即可；Polisher 沿用上一轮 Surface 适配包。

### 本轮修改文件

Hub：`src/hub-ui.js`、`src/honeycomb-launcher.js`、`src/panel-transitions.inc.js`、`src/extension-runtime.js`、`src/bootstrap.js`、`extensions/timeline/timeline.js`、`extensions/timeline/style.css`、`assets/theme.css`、`assets/launcher.css`、`assets/panel-transitions.css`、`tests/core-panels.test.mjs`、`tests/honeycomb-launcher.test.mjs`、`tests/runtime.test.mjs`、`tests/integration/host-fixture.js`、`tests/integration/artifacts.lock.json`、`docs/EXTENSION-API.md`、本文件。

Polisher：`launcher-adapter.js`、`legacy-tool.js`、`tests/launcher-adapter.test.mjs`、`tests/compatibility.test.mjs`、`docs/SURFACE-COMPATIBILITY.md`。

本轮不修改 Registry、权限、classification、版本号、蜂窝排列及卡片布局。额外修复宿主全局 header 定位影响 Timeline / Polisher 标题跟随面板的问题，没有重排其内容。

### 本轮验证与实机包

- Hub 273/273；Polisher 24/24；实际构建组合 29/29；安装 / 更新 / 卸载生态 14/14（含历史 Polisher 1.1.3 更新）。
- 两仓构建、22 个源文件 / 工具 / 构建语法检查、两仓 git diff --check 通过。
- 覆盖不同 Origin、当前 rect 优先、快照 / missing fallback、滚动、重建、resize、重复 open / close、关闭时禁用、dispose、过期 attachment 排队隔离、同一业务实例、System / Timeline、未适配 UI、Reduced Motion、Back / ESC。
- 浏览器检查桌面 1280×720 与手机尺寸 390×844：Settings、Timeline 和旧 showMessage 面板均可打开 / 返回。Timeline 标题保持在面板内。真实 Safari / WebView 手指交互、软键盘 / 旋转过程的手感及帧率仍需实机验收。
- `build/MieMie-Hub-Surface-Review-20260927.json` 与 Hub 0.7.0 本地构建字节一致。
- `build/MieMie-Polisher-Surface-Review-20260927.json` 是 Polisher 1.1.4 本地适配构建的副本，用于同一酒馆组合验收。先备份并停用旧脚本再导入，避免同 ID 双重启用；本轮未发布任何在线资产。
- 本地 5173 页面仍模拟宿主与服务数据；它加载实际 Hub 构建，但不模拟真实聊天 / 世界书内容，也不能代替生产 Discord 验证。

READY FOR VISUAL REVIEW
