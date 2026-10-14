# Hub 构建、更新与产物兼容验证

当前源码测试基线：Hub **0.8.3**，完整产物组合为 Polisher **1.2.1**，Production Registry 为 **0.6.1**。正式发布状态与附件以 [GitHub Releases](https://github.com/SheepSheepLab/MieMie-Hub/releases) 为准。适配验收先看 [Developer Guide](EXTENSION-DEVELOPER-GUIDE.md)。下文明示历史阶段的版本与验收数字保留原记录，不代替本次实际测试输出。

各次测试结果独立记录于对应版本／日期小节；本地源码测试不代表 Tag、公开附件或真实公开自更新验证已经完成。

## 独立构建与测试

Dual Entrance 使用 `tests/native-window.test.mjs` 检查所有权、单 Session、
草稿、原生 lease、动画中断、错误与撤销边界；独立测试应用位于
`tests/fixtures/native-window-extension.js`，可导出为真实 Tavern Helper 脚本包。
该通用 Fixture 的 Native Window Parity 结果不能替代 Tavern Phone 作者适配验收。
完整回归仍分别记录 Back、Focus、Lifecycle、真实 Tavern 和模拟宿主组合测试，
Managed Package 的模拟校验不代表生产安装/更新/持久卸载通过。

```sh
npm ci
npm run build
npm test
```

`npm test` 会先构建当前 Hub，基础测试不依赖 Polisher 源码。具体测试数量和结果以本次执行输出为准。

| 测试范围 | 核对内容 |
|---|---|
| 构建与版本 | 拒绝后缀、前导零、非字符串和尾部换行；ASCII／中文 JSON 字节一致；机器元数据的版本、身份、大小、原始文件 hash、content hash 与构建一致；图标解码字节不变 |
| 版本查询 | `v` 前缀、SemVer 与历史预发布排序、无效 Tag／Draft、无序列表、分页、本地等于／低于／高于远程、HTTP／JSON／超时、重复请求、teardown 与迟到响应 |
| 宿主适配 | 实际 `getScriptId()`、全局文件夹、用户改名、重复 ID／多候选拒绝、非全局拒绝、未知字段拒绝、同步 updater、写入前原 content 改变、其他条目与 `data` 保留 |
| 发布验证 | Release／Asset ID 锁定、唯一附件、机器元数据、API digest、真实字节数、包 hash、content hash、错误 JSON／产品／版本、错误地址、下载／CORS 失败与超时 |
| 更新生命周期 | 重复点击、写入前 teardown 不再写入、迟到异步任务失效、备份／storage 失败、写入后交接、新实例确认、待确认错误、记录被替换、精确旧版本恢复 |
| Core Panel | 当前构建版本、查询与安装状态、更新按钮、失败和重新确认、面板切换、关闭／返回／Escape、清理、Core 与 Extension 入口共存 |
| 既有兼容 | Runtime 生命周期与 Launcher 错误隔离、时间线静态基线、通用 Runtime 测试夹具、历史存储标识 |

测试使用显式 fetch 替身、内存脚本树、流式 Response、模拟保存读回及 Node／jsdom 环境。不会在测试过程中修改真实酒馆脚本，也不会把模拟 GitHub 数据当成远程发布结果。

## 锁定产物组合测试

```sh
MIEMIE_BUILD_MODE=production MIEMIE_DEFAULT_REGISTRY_URL=https://registry.sheepsheeplab.com \
  npm run test:integration -- --polisher /absolute/path/MieMie-Polisher-Extension-1.2.1.json
```

默认锁定的是正式生产构建；上面的环境参数使 npm 脚本重新构建时使用相同配置。默认 development 构建字节不同，不能直接拿来通过此锁。也可显式指定已下载并核验的正式 Hub JSON。

组合测试只引用完整 JSON 产物，不导入另一仓库源码。`tests/integration/artifacts.lock.json` 锁定当前 Hub 与 Polisher 1.2.1 的版本、脚本 ID 和 SHA-256；校验失败时拒绝执行。具体 hash 以该锁定文件为准，每个发布版本都重新计算最终构建字节，不在本文复制会过时的 Hub hash。

JSON 可以是中文本地文件名或 ASCII Release 文件名；校验针对实际字节、版本及脚本 ID。测试不自动寻找兄弟源码目录或下载附件。可以用 `--hub` 和 `--lock` 显式选择另一份已确认的锁定组合。

组合测试执行两份完整 JSON，核对 Hub 与 Polisher 的生命周期、事件协作、查询请求隔离、时间线、润色／翻译、旧设置及密钥、提示词、备份恢复、发送原文、启停、卸载、请求取消与清理。结果写入被忽略的 `test-results/integration.json`。

**自动测试不是实际 GitHub 网络、浏览器 CORS 或真实酒馆验收。** 它也不能验证真实布局、动画、拖动及浏览器是否成功保存恢复文件。

## 历史 Ecosystem MVP 黄金路径（0.4.1 阶段记录）

当前版本 **Hub 0.4.1 / Polisher 1.1.0 / Registry 0.2.1**。原Hub自更新回归仍保留；本阶段不把模拟HTTP或浏览器DOM测试称为真实Discord授权或Tavern验收。

- A：只启用Polisher1.1.0，独立球打开原UI，核对旧设置、Key、Prompt、备份。
- B：Polisher先运行后启动Hub；球收纳到Hub，再停用/启用Hub，球恢复/再次收纳。重复操作无重复实例。
- C：Hub首页只有扩展中心管理入口，内部发现/已安装/我的；Registry离线仍可使用时间线和本地工具。
- D：确保没有重复Polisher条目，在发现选已配置Catalog项目，或使用作者GitHub直接预览入口，点击安装；不手工导入JSON。作者仓库为SheepSheepLab/MieMie-Polisher，机器校验全部通过才执行。
- E：已发布1.0.1作为旧基线，本轮可测试原位更新至1.1.0并验证双模式及原设置保留。尚无修正版Icon，因此新Icon验收延期，不伪造1.0.2。
- F：按Registry部署说明配置真实Discord应用，使用扩展中心标题栏登录，分别提交GitHub/Discord项目，核对作者与投稿者、公开资料与来源。
- G：同一身份编辑、下架、重新上架；发现同步变化、我的保留；已安装代码不远程停用。
- H：修改Discord显示名/头像后重新登录，资料更新而旧投稿仍归同一身份。

物理卸载确认后删除该脚本条目及其data，不请求或生成备份。Runtime注销不会删除原脚本。更新作者代码启动失败时手工恢复旧content，没有自动回滚；宿主写入结果不能冒称服务器保存完成。

## 完整 Package 产物测试

```sh
npm run test:ecosystem -- --polisher /path/to/MieMie-Polisher-Extension-1.2.1.json --metadata /path/to/MieMie-Extension-update.json --legacy-polisher /path/to/MieMie-Polisher-Extension-1.0.1.json
```

显式读取 Hub 完整构建 JSON、Polisher 1.2.1 JSON 和匹配 metadata，以及已发布 1.0.1 JSON；不导入另一仓库源码。验证metadata/digest，报告记录每份产物SHA-256。只在模拟宿主中由正式树API触发创建/重载/删除iframe，执行真实构建代码，GitHub响应替身明确为Development Fixture。结果在ignored `test-results/ecosystem.json`。

Registry另有显式产物合同测试 `tests/hub-contract.mjs --hub <Hub JSON> --sha256 <锁定SHA256> --report <本地输出>`。它验证指定HubJSON的hash、使用其中实际客户端连接临时本地HTTP服务与隔离SQLite；Discord/GitHub上游是测试适配器。基础Registry测试不要求Hub目录存在。

## 失败与恢复验证

在可恢复的测试条目中分别核对：非全局安装、复制旧 Hub 后多候选、网络中断、连续点击、下载中停用、保存读回不可达、宿主保存延迟，以及旧内容被其他操作修改。自动测试覆盖损坏 hash／JSON／版本和异常交接记录；不为测试这些情况修改正式 Release 或关闭安全校验。

新版无法启动时优先在原安装条目中恢复备份 `content`，不要覆盖其他脚本或清空业务数据。有效交接记录内，恢复的旧版本、同实例 ID 和旧 content hash 全部一致时，可以识别未生效／已恢复并解除本次交接；异常、过期或不匹配的记录保留待确认，需要手工核对。第一代没有 Loader 自动回滚。

## 图标与发布完整性

Hub 与时间线图片保持 SheepSheep 提供的源 PNG 字节，构建仅 Base64 编码，不生成、改色、缩放或压缩；Polisher Icon 不由 Hub 更新修改。

发布前执行构建、全部基础测试、锁定产物组合测试、敏感信息和 staged 内容检查。正式版与候选版的 Release 状态应与 Owner 授权一致，不统一标为 Pre-release；附件只使用 ASCII 名称，并匿名重新下载核对最终字节 hash、Tag／Commit、元数据和工作区状态。正式发布不等于真实酒馆验收完成。


## 浏览器 CORS 回归（保留 0.3.2 基线）

```sh
node tests/browser-download/run.mjs --serve
```

打开输出的 localhost 页面，自动执行 8 项浏览器回归并在页面及终端输出结果。该模式不依赖 Playwright；必须保持正常浏览器安全设置。也可以安装 Playwright 后直接运行同一文件，由 `PLAYWRIGHT_MODULE` 和 `PLAYWRIGHT_BROWSERS_PATH` 指定测试运行环境；它们不属于 Hub 产品运行时依赖。

测试使用不同 localhost Origin 与没有 CORS 头的真实 HTTP 附件响应，覆盖阻断、转发成功、元数据和包篡改、错误 Origin、超时、teardown、无凭据。Registry 后端 SSRF 等边界由其独立 24 项新增测试覆盖。本地 fixture 不是社区投稿。

0.3.2 阶段另外在正常浏览器中用真实已发布 Polisher 1.1.0 附件联调：直接读取被 CORS 拦截，配置真实本地 Registry 后，预览和完整包字节双 hash 校验通过；安装写入目标是隔离内存脚本树，没有改动用户酒馆。这仍不宣称真实 Tavern 安装验收通过。部署／复测步骤见 [下载传输说明](DOWNLOAD-TRANSPORT.md)。

## 生产形态回归（0.4.1）

构建测试区分 development / production：生产缺地址、示例域名、本机地址、非 HTTPS 或带凭据的地址全部拒绝。普通扩展中心不含服务地址或保存配置控件；内置地址直接读取发现及进入 Discord 登录。设置页不再挂载高级选项；开发配置 helper 仍有独立测试，旧覆盖偏好保留。Final UI 测试确认标题栏账号、侧栏导航与蜂窝事件 teardown。真实公网部署和 Discord 授权仍需要维护者提供实际 HTTPS 地址及服务端私有凭据；测试 URL 是 Fixture，不宣称服务已上线。

## 0.6.0 Core Purification 验证

本轮使用 Polisher **1.1.3** 发布包，旧包 **1.1.0** 作为模拟更新起点，不修改 Polisher 源码或业务。

| 检查 | 结果 | 环境 |
| --- | --- | --- |
| Hub 单元 / DOM / 构建边界 | 208 / 208 | Node.js + jsdom，开发构建 |
| 正常生产产物组合 | 28 / 28 | 锁定完整 Hub / Polisher JSON；手动世界书切换、自动接续、润色业务、双模式、清理 |
| 正常包生态安装链 | 13 / 13 | 真实构建代码，模拟 GitHub 与 Tavern Helper 树 / 保存 API |
| 无时间线包生态安装链 | 13 / 13 | 与正常包相同链路；断言时间线 DOM、实例均不存在 |
| 正常包 / 无时间线包 Registry 合同 | 各 12 / 12 | 临时真实 HTTP + 隔离 SQLite；Discord/GitHub 测试适配器 |
| 无时间线包自更新 | 3 / 3 | 完整 UI → 下载校验 → 同实例写入 → 新 iframe → 保存回读；失败不写入 |
| 已发布 0.5.1 → 正常 0.6.0 | 3 / 3 | 旧产物从发布提交重建，SHA-256 与 GitHub Release digest 相同；宿主模拟，不是用户酒馆 |

7 项新增边界 / 生命周期测试包括物理删除时间线目录后构建、零随包扩展启动、标准 loader 故障隔离、世界书读请求中停用防止迟到写入、选择器关闭、反复启停和重载不重复、时间线不出现在已安装列表、固定 Launcher 与数据保留、宿主 API 缺失只影响时间线。业务区块另与原始兼容 fixture 逐字对比。

新增运行入口：

```sh
# 无时间线生产包（正常包先按 PRODUCTION.md 构建）
MIEMIE_BUILD_MODE=production MIEMIE_DEFAULT_REGISTRY_URL=https://registry.sheepsheeplab.com \
  node tools/build.mjs --bundled= --output-dir=build/without-timeline

# 同一生态套件可显式指定无时间线包，并另存结果
node tests/ecosystem/run.mjs --hub build/without-timeline/MieMie-Hub-0.6.0.json \
  --polisher /path/to/MieMie-Polisher-Extension-1.1.3.json \
  --metadata /path/to/MieMie-Extension-update.json \
  --legacy-polisher /path/to/MieMie-Polisher-Extension-1.2.0.json \
  --report test-results/ecosystem-without-timeline.json

MIEMIE_TEST_ARTIFACT=build/without-timeline/MieMie-Hub-0.6.0.json \
  node --test tests/self-update-ui.test.mjs

# 可选：使用已校验的历史完整产物验证一次跨架构更新
MIEMIE_TEST_ARTIFACT=/path/to/verified-MieMie-Hub-0.5.1.json \
  MIEMIE_TEST_UPDATE_TARGET=build/MieMie-Hub-0.6.0.json \
  node --test tests/self-update-ui.test.mjs
```

测试不声称已在真实 Safari / SillyTavern 验收 0.6.0。本机 Chromium 启动受系统沙箱限制，本轮没有新增真实浏览器通过结果。Phase A 生产 Registry 0.3.2 的 Owner/Integrity/Catalog 验证由用户 Workbench 输出确认；真实 Owner 登录由用户确认。危险角色负向测试只在隔离数据库执行，真实多账号是非阻断后续验收。


## 随包清理回归（0.6.0 工作树）

本次仅清理临时测试扩展。正式构建只声明 Timeline；通用 Runtime 夹具只由测试显式提供，不进入构建。版本仍为 0.6.0，本次本地构建未覆盖 GitHub 上已发布的同版本附件。

| 检查 | 结果 |
| --- | --- |
| Hub 单元 / DOM / 构建（含 Timeline、包管理、自更新） | 210 / 210 |
| Polisher 自身回归（源码未修改） | 23 / 23 |
| 完整 Hub / Polisher 产物组合 | 28 / 28 |
| 正常包 / 无时间线架构测试包的安装、更新、物理卸载、重装 | 各 13 / 13 |
| 正常生产包自更新 | 3 / 3 |
| 无时间线架构测试包自更新 | 3 / 3 |
| 0.5.1 历史源码构建 → 本次 0.6.0 模拟自更新 | 3 / 3 |

共 296 项检查（含不同构建组合），无失败。历史产物升级核对同 Script ID、保存回读、用户数据与偏好保留、新 iframe 的实际随包列表；已移除的来源不能由旧偏好复活。空 Core 不要求预先存在扩展偏好记录。

这些结果来自 Node.js / jsdom 与模拟宿主，不代替真实酒馆人工验收。Timeline 业务、资源、独立 Extension 生命周期和随 Hub 分发边界保持不变；Registry / Polisher 源码未修改。新产物版本、脚本 ID、字节数、SHA-256 与更新元数据一致。


## 0.6.1 发布回归

在清理工作树基础上发布独立补丁，不覆盖 v0.6.0。正常包仍固定携带 Timeline；Registry 保持 0.3.2，Polisher 保持 1.1.3。

发布验证使用 GitHub v0.6.0 附件 SHA-256 核对过的完整旧包作为起点，执行 0.6.0 → 0.6.1 下载、校验、同实例写入、保存回读、新 iframe 启动与随包列表确认。用户设置、其他脚本和旧偏好保留；已移除来源不能从旧偏好恢复入口。

Hub 全套 210 项、Polisher 23 项、正式产物组合 28 项、生态安装链 13 项、真实旧版产物模拟自更新 3 项、无 Timeline 架构测试包自更新 3 项均通过。生产构建另核对版本、机器清单、原始字节 hash、content hash 及发布配置。不将模拟宿主测试称为真实酒馆验收。

## Optional Back Navigation 回归

`npm test` 包含同步返回契约、旧 API v1 默认分支、Runtime 撤销、Surface
过渡与迟到请求、Shortcut origin、明确关闭、System Dialog／投稿 Picker 和监听清理。
`tests/fixtures/back-extension.js` 只维护通用内部层级，不含官方工具业务代码。

真实 Chromium 键盘／原生 Dialog 测试（依赖本机已安装的 Playwright 与 Chromium）：

```sh
PLAYWRIGHT_MODULE=/absolute/path/playwright/index.mjs \
HUB_ARTIFACT=/absolute/path/candidate/MieMie-Hub-0.8.3.json \
node tests/browser-back/run.mjs
```

完整 Hub 运行在隔离模拟宿主中，覆盖真实按键、长按、Native Dialog cancel、
body portal、closed Shadow DOM、草稿错误恢复和 Session 清理。
结果及截图保存在 `test-results/back-browser/`。这不是实际 Tavern 或 Safari 验收。

旧版官方 Preset Manager 可使用未修改的正式 0.5.1 产物做独立 Runtime 回归：

```sh
PLAYWRIGHT_MODULE=/absolute/path/playwright/index.mjs \
HUB_ARTIFACT=/absolute/path/candidate/MieMie-Hub-0.8.3.json \
PRESET_ARTIFACT=/absolute/path/MieMie-Preset-Manager-Extension-0.5.1.json \
node tests/browser-back/legacy-preset.mjs
```

运行器校验正式 0.5.1 文件 SHA-256，不下载、不改写该包。它使用模拟 Tavern API，
不执行预设写入，不代表 Native 数据安全或 Package 安装验收，也不声称旧版本自动获得
逐层 Escape。官方产物与通用 Fixture 不能代替真实第三方项目的零迁移验收。

Package v1 的安装、更新、卸载继续使用独立 package-manager／ecosystem Gate。
Safari、真实 Tavern 与真实第三方样本须分别记录；缺失结果必须标记 Pending。

### Surface Origin 焦点恢复回归

`node --test tests/surface-focus.test.mjs tests/shortcut-launchers.test.mjs`
检查实际 `document.activeElement`（开放 Shadow DOM 同时检查深层焦点），不以高亮或动画终点代替焦点断言。

- `surface.close()`（Esc fallback、Hub 返回、`api.closePanel()`）完成关闭过渡后，优先恢复本次 Origin：蜂窝对应入口或 Shortcut 当前有效 mount 的真实可聚焦节点。Hub 自身收起仍回到主悬浮球。
- 关闭过渡期间，用户产生新的 focusin、pointerdown 或非 Escape 键盘操作，放弃旧焦点恢复。串行导航队列已有更新请求、Session revoke、Hub dispose 同样禁止迟到恢复。resize 取消动画仍完成当前有效导航，可恢复有效 Origin。
- 恢复检查复用 Surface serial/queue。临时输入监听仅在关闭过渡存在，完成、异常、revoke、dispose 都释放；不新增常驻全局焦点管理。
- Shortcut 焦点节点来自既有 `getOrigin()`，绑定原 mount/node；只检查该声明子树及开放 Shadow DOM 内已有可聚焦节点。不改第三方 tabindex、外观、拖动、点击或 Presentation。仅提供不可聚焦外壳且内部无可聚焦节点（含不可访问的 closed Shadow DOM）的第三方，不保证能够恢复 DOM 焦点；安全放弃恢复，不错误转交 Hub orb，不要求强制迁移。
- Browser/真实 Tavern 另测内部菜单和 Native Dialog 的焦点、显式关闭不调用 Back、双入口动画终点、停用/重启与并发导航。自动化 Chromium 不替代 Owner 物理键盘验收；Safari 单独记录。

### Hub → Standalone 生命周期交接回归

`npm test` 包含 `tests/lifecycle-handoff.test.mjs`；单独执行前先 `npm run build`。

- 使用 Runtime 的现有 AbortSignal 同步释放 Panel lease，再执行原有有界异步 teardown；扩展自己的 `onCleanup()` 仍保持 LIFO 顺序。
- Hub 退出时只恢复 attach 前根节点被 Surface 借用的 hidden/inert、Surface 状态与定位尺寸。不遍历或清除业务子节点、class、data-hidden 等扩展状态；扩展后续 cleanup 对自身状态的修改继续有效。普通 disable/uninstall 仍隐藏已停用面板。
- dispose/revoke 在关闭动画完成前发生时，旧 serial 不得再次写入已交还的 DOM，也不得恢复失效 Origin 的焦点。
- `miemie:hub-disposed` 仍是同步通知，`whenDisposed` 仍是异步业务清理完成边界。新版 Hub 的继任启动复用同一个 Promise；等待期间卸载 iframe 可取消启动，多份等待脚本只建立一个 Hub。
- Runtime 原有有界操作计时器复用 Helper 已有宿主 Lodash `delay`，由宿主页面持有回调，时限不变；直接使用宿主原生 setTimeout 仍可能丢弃 iframe 回调。真实 Helper 删除旧 Hub iframe 后，不结束的 cleanup 仍会超时并允许继任启动。没有增加依赖包或常驻计时器。
- 真实宿主另做正式 Hub 0.8.2、Back-Focus RC、Lifecycle RC 三方对照，用未经修改的 Tavern Phone 2.2.0 和正式 Polisher 验证 Standalone、双向启动顺序、停用/重启、Shortcut 与关闭动画中退出。独立延迟清理 Fixture 验证旧清理不会覆盖新 Session。
- 不把模拟宿主测试当真实 Tavern，也不把 Runtime 通过当 Managed Package 生产通过。旧版本尚未完成退出时不具备新版内部等待标记，升级应等待原有 `whenDisposed` 或刷新页面；不保证任意不遵守取消/清理时限的第三方异步业务代码。

## 0.8.3 源码审核回归 · 2026-10-14

本轮从既有未提交开发成果构建。版本调整前的 Production Build 与已验收 Foreground Priority RC 原始字节相同；0.8.3 最终构建归一化版本值后也与该 RC 相同。没有重新设计 Back、Native Window 或生命周期，也没有修改第三方正式产物。更新的 `tests/integration/artifacts.lock.json` 使用最终生产构建的真实 SHA-256，Polisher 锁定仍为正式 1.2.1。

| 检查 | 本轮结果 | 范围 |
| --- | --- | --- |
| `npm test` | 485 / 485 | Node.js / jsdom / 构建与版本、Runtime、Package、Self Update、Back、Native、Lifecycle、Focus、Foreground、Legacy Shortcut |
| Production `npm run build` | PASS | 正式 HTTPS Registry、稳定 Script ID、JSON、构建身份、元数据与双 hash、原始图片字节 |
| `npm run test:integration` | 30 / 30 | 最终 Hub 与已发布 Polisher 1.2.1 的锁定完整产物；模拟宿主 |
| `npm run test:ecosystem` | 16 / 16 | 独立 Managed Package 安装／更新／卸载／保存及旧正式 Polisher 升级；模拟 GitHub 与宿主 |
| 已发布 0.8.2 → 最终 0.8.3 自更新 UI | 3 / 3 | 完整旧／新产物、恢复下载、同实例写入及保存确认；模拟网络与宿主，不是公开自更新 |
| 真实 Tavern Back | 22 PASS | 原 Back Fixture：逐层 Escape、Native Dialog、长按、连续输入、草稿错误恢复、Runtime 清理 |
| 真实 Tavern Shortcut / Focus | 16 PASS | 原 Shortcut Fixture：双入口、动画终点、真实 DOM 焦点、显式关闭、失效 Origin、Session 和 Hub 重载 |
| 真实 Tavern Native / Foreground | 8 PASS | 通用 Native Fixture：原生拖动／缩放／开关、单业务实例、草稿、Hub 前景与收起后恢复 |
| 真实 Tavern 正式 Polisher 1.2.1 | 9 PASS | 原始发布包、双启动顺序、Legacy Shortcut、Esc、Hub 退出与重载、启停、单实例 |
| 真实 Tavern 原始 Tavern Phone 2.2.0 | 12 PASS | 未注册新能力的正式包、蜂窝／Surface／原 Escape／Legacy Shortcut、启停、重载与 Standalone 恢复 |
| 最终构建 Safari 26.6 | 10 PASS（烟测） | 真实 Safari 21624.4.5.11.5：蜂窝／Shortcut 逐层返回及焦点、Enter 重开、原生拖动／缩放／开关、前景优先级和整页重载；加载内容 hash 与最终构建完全一致 |
| JavaScript syntax / JSON / `git diff --check` | PASS | 当前源码、构建及本轮修改；未嵌入私人 Phone 副本或测试扩展 |

真实宿主为独立数据目录中的 **SillyTavern 1.19.0 / Tavern Helper 4.11.3 / Chromium 151.0.7922.34**，使用浏览器产生的 trusted 输入，不是 Owner 实体键鼠验收。Back Fixture 本身没有 Shortcut，其运行器对应项目不适用；上表独立 Shortcut Fixture 的结果覆盖该能力，不把缺少测试能力记成产品通过。

Safari 使用同一隔离 Tavern / Helper，通过原生应用输入操作；记录的 22 次键盘事件均为 trusted。整页重载后 Native 仅一个活动实例、一个 Hook、一个球和一个窗口，位置尺寸保留。本轮为最终构建简短烟测，不把此前 RC 结果算作本轮通过；最终构建的实体长按自动重复、完整 Safari 第三方及生命周期矩阵未在本轮重跑，不能由这 10 项代替。未更改 Safari 安全设置。

原始 Phone 在正式 0.8.2 对照中复现 Standalone 恢复后 hidden/inert 的既有故障，最终构建的同一检查通过。原始 Phone 未接入 Native Window，以上结果不代表它自动获得完整原生拖动／缩放；私人适配副本没有进入 Hub 或官方发行附件。

本轮 Managed Package 自动回归与 Runtime 回归分别通过；它们不代表当前生产 Registry 下所有 Origin 的实际安装／更新已经通过。Registry 0.6.1 HTTPS 健康检查正常，隔离 Origin 仍被精确策略拒绝，生产配置未修改。

已知延期项保持原状：

- **HUB TRANSITION RACE**：最终构建仍可复现收起动画中点击原生球重新展开 Hub。再次正常收起后交互可恢复；本次复现保留草稿、一个实例和一个业务 Hook，没有观察到 Runtime 被卸载或不可恢复锁死。此结论限于本次检查，计划 0.8.4 处理。
- **REGISTRY ORIGIN COMPATIBILITY**：`localhost`、`127.0.0.1` 和端口差异可能拒绝目录及下载中转；这是 Registry 独立维护范围。失败不允许绕过下载／身份／hash 校验，不关闭 CORS。

Release、匿名附件复核和真实公开自更新是独立验证项目，须依据实际发布资产记录结果；以上源码回归不代替这些验证。

## 0.8.3 文档一致性验证 · 2026-10-14

本次仅整理当前开发规范，产品源码、测试、品牌身份和机器包格式未修改。重新执行 `npm test` 为 **485 / 485 PASS**，0 失败、0 跳过。7 个 JavaScript 示例语法检查、3 个 JSON 示例解析和 6 项示例行为检查通过；行为检查使用实际 Runtime 与显式模拟宿主回调，不是新增真实 Tavern 验收。修改文档的 88 个本地链接／锚点通过，Developer Guide、API 与 Launcher Protocol 的章节标题保持不变。

按 [生产构建配置](PRODUCTION.md) 重新构建后，`MieMie-Hub-0.8.3.json` 的 SHA-256 仍为：

```text
ffbca980fb2ada9055f94616a9060988463d4ba6b948a7cc3aa4d02e8ab9f2fc
```

构建与此前 0.8.3 产物完全相同。此前真实浏览器和第三方结果保留在各自记录中，本次没有把它们计为新执行结果；公开发布资产与真实公开自更新仍须独立验证。
