> 版本范围：下方原有 0.6.x／0.8.3 章节保留 [v0.8.3 正式原文](https://github.com/SheepSheepLab/MieMie-Hub/blob/v0.8.3/docs/CORE-ARCHITECTURE.md)的历史架构、迁移与验收记录；其中 API v1、Shortcut、无参 Surface 调用及当时的发行／恢复说明仅适用于对应旧版本。当前未发行的 0.9.0 候选见文末 [0.9.0 当前候选架构](#090-当前候选架构)，接口以 [Extension API v2](EXTENSION-API.md) 为准。历史版本号、测试结论与状态不追溯修改。

# Hub 0.6.1 · Core / System Modules / Bundled Extensions

本次是保持业务兼容的依赖整理，不修改 API v1、Package v1 或 MieMie Policy 2.0。

## 0.8.3 运行期能力

以双入口、单业务实例、独立窗口控制权为基准。Runtime 仍是唯一业务生命周期；
蜂窝入口继续使用现有 Surface；可选 `registerNativeWindow` 在同一 Session 中
借出已声明主面板的展示控制权。Surface Controller 保留一个按 Extension ID 登记
的能力表及短期 ownership lease，Hub UI 复用原 borrowed-root 状态保存与恢复。
没有第二套 Runtime、Window Manager、键盘路由器、轮询或 DOM 扫描。

原生所有权期间 Hub 不写该根节点的显隐、inert、布局、动画或焦点。切回蜂窝先
同步取消原生展示，再进入原 Surface；业务实例与草稿保持。旧 Shortcut 未接入
时继续原来的 Hub 托管流程。具体契约以 [Extension API](https://github.com/SheepSheepLab/MieMie-Hub/blob/v0.8.3/docs/EXTENSION-API.md#optional-native-window-ownership-api-v1) 为准。
Back Navigation 复用现有 Runtime Session 与 Surface 导航，仅在 opt-in Surface 中同步委托内部返回；焦点恢复复用当前 Origin 和过渡有效性。Lifecycle Handoff 复用 AbortSignal、cleanup stack 和 `whenDisposed`，不改变公开事件时序。Foreground Priority 由现有 Shell 层级和展开期间的前景遮罩处理。
历史 ARCHITECTURE-FREEZE / APPLICATION-PRESENTATION 文档作为历史保留；本轮
增量属于 Owner 授权的可选能力，不改变 API v1 身份、Package v1 或已发布产物。

| 层 | 内容 | 边界 |
| --- | --- | --- |
| Core | extension-runtime、script-host、extension-packages、registry-client、hub-self-update、hub-root、通用 bundled loader | 生命周期、包校验、安装/更新/物理卸载、联网、宿主保存确认、Shell 与 Launcher primitives |
| System Modules | extension-center、registry-settings、hub-ui 中的 Settings / 系统导航 | 固定存在；不注册为 Extension，不提供卸载自身的按钮；通过 runtime、packages、registry、selfUpdater 接口操作 |
| Bundled Official Extensions | extensions/timeline | 与普通本地扩展使用相同 Manifest、provide 和 API v1 生命周期；官方默认随包提供；可仅为架构测试从构建声明移除 |
| Normal Extensions | 独立发布的 Polisher、第三方 Extension | 保持独立仓库、设置及数据所有权；Hub 不拥有其业务实现 |

Bundled 是发行方式，Official 是独立的扩展身份；两者不合并成一个枚举，也不代表 Registry 自动投稿或安全认证。时间线不进入普通 Catalog、不走 Registry Submission、没有独立 GitHub Release 或独立更新通道。用户无需单独安装；它不出现在扩展中心“已安装”，不提供打开、启停、安装、更新或卸载等包管理入口，只在 Hub Launcher 作为内置工具直接打开。时间线更新随 Hub 整体 Release 和 Self Update 一起交付。

## 时间线迁移

旧 `src/timeline-builtin.js` 已删除。唯一业务实现为 `extensions/timeline/timeline.js`。旧 `assets/legacy-timeline.css` 拆成 Shell 通用样式和扩展自己的 `style.css`；旧时间线 PNG 按原始字节移动到 `extensions/timeline/icon.png`。素材政策仅同步路径，授权条款不变。

旧 Core 直接读取时间线全局对象，拥有固定菜单项、面板开关、图标和关闭选择器的特例。现在 Core 不读取任何时间线对象：

- 标准 Manifest ID：`miemie.timeline`，独立版本 `1.0.0`，`schemaVersion=apiVersion=1`。
- 工厂实现 `activate / open / deactivate`；通过 `onCleanup` 和 `signal` 撤销事件、定时器、DOM 和未提交的操作。
- 使用 `contributes.launcher`、`attachPanel(panel, {icon})`、`showPanel()`；返回入口只调用公开 `window.parent.__MieMieHub.open()`。
- 自有根节点 `miemie-timeline-extension`。选择器跟随自己面板的关闭和移动清理，不访问 Core 私有变量。
- 原 `__timelineSwitcherV1` 兼容桥仅由 Extension 自己管理。Core 不依赖它；已有独立时间线冲突只阻止该 Extension，其他 Hub 能力仍可启动。
- 原业务块逐字保持：时间线识别、日期解析、完整生成事件、世界书并发检查及保存后回读均未改写。
- 设置继续由 Extension 通过 Tavern Helper 变量 `timeline_switcher_v2` 保存。世界书仍归酒馆。停用、开发者 Runtime 生命周期测试和不含时间线的架构测试包均不清空这些数据。
- Hub 的 `meeme_timeline_dock_v1` 是历史遗留的**主球位置**键；为保留用户位置仍沿用，里面没有时间线业务数据。

Settings 只展示 Hub 版本、自更新及当前 Registry 服务信息；高级配置不再作为用户入口。没有迁入时间线或 Polisher 的设置。

## 发行声明与生命周期

`packaging/bundled-extensions.json` 是构建清单，不是第二套 Extension Manifest。每项声明目录、导出工厂名、需要内嵌的资源文件、发行策略及平台身份 `classification`（默认 community）。时间线项的 `policy.management="hub"` 只规定产品管理入口，不改变标准 Manifest 或 API。目录内 `manifest.json` 仍使用 API v1 Manifest。

构建器将资源交给该工厂的闭包；Core 收到 `{manifest, factory, policy, classification}`，身份和发行策略位于普通 Manifest 之外。没有时间线专属 API。通用 loader 逐个调用标准 `provide`，一个扩展失败不会中止其他扩展或系统模块。

Timeline 的 `classification:"official"` 只由受信任的 Hub 构建清单赋予。Host 私有 resolver 按构建时实际 factory 引用和 Manifest ID 共同匹配；相同 ID、Author、普通 Manifest 的 `official`/`classification`、公开 register/provide 的额外参数均不能获得官方身份。Runtime `get/list` 快照中的顶层 `classification` 供 Hub 数据模型消费，生命周期和 Extension API v1 不变。随包但未显式标为 official 的扩展仍为 community。

Registry Catalog 的顶层 `classification` 由服务端治理负责；client 归一化列表/详情/投稿响应，缺失或未知值按 community，忽略嵌套 Manifest 的身份声明。扩展中心沿用现有文本位置显示完整的「🐑官方扩展 / 🧩社区扩展」，投稿表单移除身份选择，治理留在 Registry。身份与 GitHub/Discord 来源、产品类型及分发方式独立。

本地运行登记/直接 GitHub 安装不携带 Registry 身份授权；不把目录身份永久写入扩展代码或安装元数据。当前已安装页没有新增身份标签。Final UI 若需要在该位置展示 Registry 身份，应按可信目录记录重新解析，不能从 Manifest 或仅凭扩展 ID 推断。可配置 Registry 的权威范围仍是用户选择的服务；这不是代码签名或对恶意同页脚本的隔离机制。

官方默认加载时间线。时间线不出现在已安装管理列表，官方 Hub 启动时固定注册并启用，在 Launcher 直接打开；历史开发测试中的启停/注销偏好不改变这个产品边界。开发者仍可通过标准 runtime 做生命周期测试，下一次 Hub 载入恢复固定工具。独立 Package 的物理卸载保持原逻辑。

```sh
# 正常发行，包含所有声明项
MIEMIE_BUILD_MODE=production MIEMIE_DEFAULT_REGISTRY_URL=https://registry.sheepsheeplab.com npm run build

# 不含时间线代码、CSS、PNG；输出到独立目录
MIEMIE_BUILD_MODE=production MIEMIE_DEFAULT_REGISTRY_URL=https://registry.sheepsheeplab.com \
  node tools/build.mjs --bundled= --output-dir=build/without-timeline

# 测试：不加载任何随包扩展，固定扩展中心和 Settings 仍存在
node tools/build.mjs --bundled= --output-dir=build/without-bundles
```

架构测试也可以从构建清单删除对应项并物理删除目录；无需修改 Core。官方发行默认始终携带时间线，此测试不代表产品分发拆分。测试对此有实际构建和运行覆盖。清单是维护者的构建输入，不接受社区网页的任意文件路径。

历史 v0.6.0 Release 中的 `MieMie-Hub-0.6.0-without-timeline-test.json` 只是移除时间线的验收产物；产品版本仍为纯 `0.6.0`，不是版本后缀。它保留同一个 Hub Script ID。它的更新元数据不发布，官方自动更新始终指向包含时间线的正常包。

## 升级与人工验收

0.5.1 已包含自更新 CORS fallback；Registry 0.3.2 保持该入口。可以通过 Hub 设置检查更新到 0.6.1。先停止生成并保存编辑。下载、校验、宿主写入和保存确认任何一步失败都不得视为更新成功；不要卸载重装来测试数据保留。

无时间线测试包建议放在独立测试酒馆配置中。若用当前配置，请先用助手导出 Hub 恢复文件，并在同一个 Hub 条目中替换导入包，保持只启用一个 Hub；不要同时运行正常版和测试版。测试结束手动恢复正常 0.6.0 包（版本相同，检查更新不会把测试包当成更旧版本）。不得删除 Polisher 或其数据。

1. 无时间线测试包：菜单没有时间线，扩展中心与设置可开，Discord 登录和 Polisher 正常。
2. 恢复正常包：时间线入口恢复，原配置存在；手动切换 / 自动接续按原规则工作。
3. 重载 Hub：时间线 Launcher 单实例、无重复入口，已安装页没有时间线管理卡片，Polisher 正常自动收纳。

自动证据见 [TESTING.md](TESTING.md)。jsdom 检查不等同于真实酒馆或 Safari 的视觉、宿主持久化验收。

0.6.1 仅发布包含 Timeline 的正常 Hub 包及自更新清单、校验文件。无时间线构建继续仅用于本地架构回归，不作为 0.6.1 的普通用户下载项。

---

> Hub 0.9.0 开发候选：Runtime API v2 / Package v1；未发行，生产 Registry Gates 独立。

## 0.9.0 当前候选架构

API v2 管理运行期契约，Package v1 管理机器安装契约；产品身份与两者分别维护。

### 运行期能力

以双入口、单业务实例、独立窗口控制权为基准。Runtime 仍是唯一业务生命周期；
蜂窝入口继续使用现有 Surface；可选 `registerNativeWindow` 在同一 Session 中
借出已声明主面板的展示控制权。Surface Controller 保留一个按 Extension ID 登记
的能力表及短期 ownership lease，Hub UI 复用原 borrowed-root 状态保存与恢复。
没有第二套 Runtime、Window Manager、键盘路由器、轮询或 DOM 扫描。

原生所有权期间 Hub 不写该根节点的显隐、inert、布局、动画或焦点。切回蜂窝先
同步取消原生展示，再进入原 Surface；业务实例与草稿保持。具体契约以 [Extension API](EXTENSION-API.md#unified-native-window) 为准。
Back Navigation 复用现有 Runtime Session 与 Surface 导航，仅在 opt-in Surface 中同步委托内部返回；焦点恢复复用当前 Origin 和过渡有效性。Lifecycle Handoff 复用 AbortSignal、cleanup stack 和 `whenDisposed`，不改变公开事件时序。Foreground Priority 由现有 Shell 层级和展开期间的前景遮罩处理。
ARCHITECTURE-FREEZE 是历史记录；当前运行期签名以 EXTENSION-API 为准。Package v1 的机器格式独立于 Runtime API2，安装及更新前验证目标运行兼容性。

| 层 | 内容 | 边界 |
| --- | --- | --- |
| Core | extension-runtime、script-host、extension-packages、registry-client、hub-self-update、hub-root、通用 bundled loader | 生命周期、包校验、安装/更新/物理卸载、联网、宿主保存确认、Shell 与 Launcher primitives |
| System Modules | extension-center、registry-settings、hub-ui 中的 Settings / 系统导航 | 固定存在；不注册为 Extension，不提供卸载自身的按钮；通过 runtime、packages、registry、selfUpdater 接口操作 |
| Bundled Official Extensions | extensions/timeline | 与普通本地扩展使用相同 Manifest、provide 和 API v2 生命周期；官方默认随包提供；可仅为架构测试从构建声明移除 |
| Normal Extensions | 独立发布的 Polisher、第三方 Extension | 保持独立仓库、设置及数据所有权；Hub 不拥有其业务实现 |

Bundled 是发行方式，Official 是独立的扩展身份；两者不合并成一个枚举，也不代表 Registry 自动投稿或安全认证。时间线不进入普通 Catalog、不走 Registry Submission、没有独立 GitHub Release 或独立更新通道。用户无需单独安装；它不出现在扩展中心“已安装”，不提供打开、启停、安装、更新或卸载等包管理入口，只在 Hub Launcher 作为内置工具直接打开。时间线更新随 Hub 整体 Release 和 Self Update 一起交付。

### 随包时间线

业务实现、样式和图片位于 `extensions/timeline/`；Shell 通用样式位于 `assets/shell.css`。Core 通过通用 loader 加载工厂与资源，不读取时间线业务对象：

- 标准 Manifest ID：`miemie.timeline`，独立版本 `1.0.0`，`schemaVersion=1, apiVersion=2`。
- 工厂实现 `activate / open / deactivate`；通过 `onCleanup` 和 `signal` 撤销事件、定时器、DOM 和未提交的操作。
- 使用 `contributes.launcher`、`attachPanel(panel, {icon})`、`showPanel(surfaceLease)`；返回使用当前 `closePanel(surfaceLease)`，内部选择器通过可选 Back Handler 返回。
- 自有根节点 `miemie-timeline-extension`。选择器跟随自己面板的关闭和移动清理，不访问 Core 私有变量。
- 原 `__timelineSwitcherV1` 兼容桥仅由 Extension 自己管理。Core 不依赖它；已有独立时间线冲突只阻止该 Extension，其他 Hub 能力仍可启动。
- 业务模块负责时间线识别、日期解析、完整生成事件、世界书并发检查及保存后回读；展示刷新检查当前 Lease。
- 设置继续由 Extension 通过 Tavern Helper 变量 `timeline_switcher_v2` 保存。世界书仍归酒馆。停用、开发者 Runtime 生命周期测试和不含时间线的架构测试包均不清空这些数据。
- Hub 的 `meeme_timeline_dock_v1` 是历史遗留的**主球位置**键；为保留用户位置仍沿用，里面没有时间线业务数据。

Settings 只展示 Hub 版本、自更新及当前 Registry 服务信息；高级配置不再作为用户入口。没有迁入时间线或 Polisher 的设置。

### 发行声明与生命周期

`packaging/bundled-extensions.json` 是构建清单，不是第二套 Extension Manifest。每项声明目录、导出工厂名、需要内嵌的资源文件、发行策略及平台身份 `classification`（默认 community）。时间线项的 `policy.management="hub"` 只规定产品管理入口，不改变标准 Manifest 或 API。目录内 `manifest.json` 使用 Schema1、API2 Manifest。

构建器将资源交给该工厂的闭包；Core 收到 `{manifest, factory, policy, classification}`，身份和发行策略位于普通 Manifest 之外。没有时间线专属 API。通用 loader 逐个调用标准 `provide`，一个扩展失败不会中止其他扩展或系统模块。

Timeline 的 `classification:"official"` 只由受信任的 Hub 构建清单赋予。Host 私有 resolver 按构建时实际 factory 引用和 Manifest ID 共同匹配；相同 ID、Author、普通 Manifest 的 `official`/`classification`、公开 register/provide 的额外参数均不能获得官方身份。Runtime `get/list` 快照中的顶层 `classification` 供 Hub 数据模型消费，此可信身份判定不改变 API2 生命周期。随包但未显式标为 official 的扩展仍为 community。

Registry Catalog 的顶层 `classification` 由服务端治理负责；client 归一化列表/详情/投稿响应，缺失或未知值按 community，忽略嵌套 Manifest 的身份声明。扩展中心沿用现有文本位置显示完整的「🐑官方扩展 / 🧩社区扩展」，投稿表单移除身份选择，治理留在 Registry。身份与 GitHub/Discord 来源、产品类型及分发方式独立。

本地运行登记/直接 GitHub 安装不携带 Registry 身份授权；不把目录身份永久写入扩展代码或安装元数据。当前已安装页不展示 Registry 身份标签，不能从 Manifest 或仅凭扩展 ID 推断官方身份。可配置 Registry 的权威范围仍是用户选择的服务；这不是代码签名或对恶意同页脚本的隔离机制。

官方默认加载时间线。时间线不出现在已安装管理列表，官方 Hub 启动时固定注册并启用，在 Launcher 直接打开；历史开发测试中的启停/注销偏好不改变这个产品边界。开发者仍可通过标准 runtime 做生命周期测试，下一次 Hub 载入恢复固定工具。独立 Package 的物理卸载保持原逻辑。

```sh
# 正常发行，包含所有声明项
MIEMIE_BUILD_MODE=production MIEMIE_DEFAULT_REGISTRY_URL=https://registry.sheepsheeplab.com npm run build

# 不含时间线代码、CSS、PNG；输出到独立目录
MIEMIE_BUILD_MODE=production MIEMIE_DEFAULT_REGISTRY_URL=https://registry.sheepsheeplab.com \
  node tools/build.mjs --bundled= --output-dir=build/without-timeline

# 测试：不加载任何随包扩展，固定扩展中心和 Settings 仍存在
node tools/build.mjs --bundled= --output-dir=build/without-bundles
```

架构测试也可以从构建清单删除对应项并物理删除目录；无需修改 Core。官方发行默认始终携带时间线，此测试不代表产品分发拆分。测试对此有实际构建和运行覆盖。清单是维护者的构建输入，不接受社区网页的任意文件路径。

无 Timeline 构建保留同一个 Hub Script ID，仅用于架构测试；其包和更新元数据不能作为正式更新目标。官方自更新使用包含时间线的正常包。

### 隔离构建与验收

0.9.0 候选只用于明确隔离的测试酒馆 dataRoot，不替换日常安装。正常验收使用默认 Bundled Timeline 构建；无 Timeline 构建仅用于同负载架构与性能对照。

验证默认 Timeline 的 Launcher、读写及服务器回读、状态保留、reload 和资源清理；无 Timeline 构建验证系统模块仍可工作。API1 官方消费者不作为当前 API2 成功凭证，各正式产品另行适配和验收。

测试方法见 [TESTING.md](TESTING.md)。Node/jsdom、真实浏览器、真实 Tavern、生产服务及 Owner 人工验收分别记录。受控 Fixture 不证明所有未知第三方行为完全等价；Native 所有权期间默认不干预其业务交互的架构要求保持不变。

### 展示所有权与交接边界

Dual Entrance / Single Business Instance / Independent Presentation Ownership 表示：蜂窝和独立原生入口共用一个 Runtime Session、业务实例与主面板，展示控制权按当前入口交接。Unified Native Window 由现有 Surface Controller 维护通用能力表；Core 不包含第三方产品专属窗口实现。

Surface Lease 对应一次 Hub 打开请求；Native Lease 对应原生展示控制权；两者都不能替代 Runtime Session 的取消信号。新 Hub 打开意图在进入 Runtime 队列前建立 Lease，旧排队任务出队不重新取得权限。切入 Native 会撤销旧 Hub 展示请求；切回 Hub 则先撤销 Native Lease 并要求 provider 同步 release，成功后才借用主面板。release 失败进入 blocked 并保留根节点保护及重试入口，不以强行改写第三方 DOM 完成交接。

Lifecycle Handoff 在停用、来源撤回和 Hub 退出时先同步撤销能力，再进行有界异步清理；`miemie:hub-disposed` 的同步通知与 `whenDisposed` 的异步完成边界分别保留。Hub 退出只交还自己借用的根节点状态；业务资源、草稿和独立存储由扩展管理。Back Navigation 只在 Hub Surface 中委托可选处理器；返回与显式关闭不同，内部层级由扩展自己维护。

Native Behavior Non-Interference 是展示所有权的架构要求：获得 Native 所有权后，第三方已有、未知及未来新增的原生交互不应无故被 Hub 改变。Hub 不需要枚举这些功能，也不因第三方增加交互而要求 Core 增加适配分支；它只管理必要的展示所有权、生命周期和系统边界。原生事件按声明的根节点、入口、焦点子树或 provider 的 `ownsEvent` 交还扩展，不扫描业务 DOM。Hub 系统前景和指针遮罩不等于获得 Native 键盘／内部 Back 的控制权；浏览器 top-layer 仍遵循浏览器规则。测试结果只证明已覆盖的产品与环境，不承诺未知第三方实现没有缺陷。
