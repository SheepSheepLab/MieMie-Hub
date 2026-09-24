# Hub 0.6.1 · Core / System Modules / Bundled Extensions

本次是保持业务兼容的依赖整理，不修改 API v1、Package v1 或 MieMie Policy 2.0。

| 层 | 内容 | 边界 |
| --- | --- | --- |
| Core | extension-runtime、script-host、extension-packages、registry-client、hub-self-update、hub-root、通用 bundled loader | 生命周期、包校验、安装/更新/物理卸载、联网、宿主保存确认、Shell 与 Launcher primitives |
| System Modules | extension-center、registry-settings、hub-ui 中的 Settings / 系统导航 | 固定存在；不注册为 Extension，不提供卸载自身的按钮；通过 runtime、packages、registry、selfUpdater 接口操作 |
| Bundled Official Extensions | extensions/timeline | 与普通本地扩展使用相同 Manifest、provide 和 API v1 生命周期；官方默认随包提供；可仅为架构测试从构建声明移除 |
| Normal Extensions | 独立发布的 Polisher、第三方 Extension | 保持独立仓库、设置及数据所有权；Hub 不拥有其业务实现 |

“Bundled Official”在这里是发行分类，不是 Registry 自动投稿或安全认证。时间线不进入普通 Catalog、不走 Registry Submission、没有独立 GitHub Release 或独立更新通道。用户无需单独安装；它不出现在扩展中心“已安装”，不提供打开、启停、安装、更新或卸载等包管理入口，只在 Hub Launcher 作为内置工具直接打开。时间线更新随 Hub 整体 Release 和 Self Update 一起交付。

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

Settings 只操作 Hub 版本、自更新及高级 Registry 配置。没有迁入时间线或 Polisher 的设置。

## 发行声明与生命周期

`packaging/bundled-extensions.json` 是构建清单，不是第二套 Extension Manifest。每项只声明目录、导出工厂名、需要内嵌的资源文件及发行策略。时间线项的 `policy.management="hub"` 只规定产品管理入口，不改变标准 Manifest 或 API。目录内 `manifest.json` 仍使用 API v1 Manifest。

构建器将资源交给该工厂的闭包；Core 只收到 `{manifest, factory}`。没有时间线专属 API。通用 loader 逐个调用标准 `provide`，一个扩展失败不会中止其他扩展或系统模块。

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
