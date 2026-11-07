# Hub 构建、更新与产物兼容验证

> **版本与记录范围。** 本文件保留 GitHub v0.8.3 的测试规范与历史记录。自下段至“0.8.3 文档一致性验证 · 2026-10-14”章节末的版本、命令、接口、成绩及 Pending 均属于对应历史阶段，不代表 0.9.0 的当前规范或验收状态；其中“当前基线”也是当时措辞。0.9.0 的方法与结果见后文 [当前候选验证](#090-开发候选验证)；当前 Runtime 契约见 [Extension API v2](EXTENSION-API.md)。

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

## 0.9.0 开发候选验证

当前契约是 Runtime API2 + Managed Package v1；Manifest、Machine Metadata 和 Build Identity Schema 均为 1。候选未发行，不能导入日常酒馆或分发给普通用户。第三方适配统一从 [Developer Guide](EXTENSION-DEVELOPER-GUIDE.md) 开始。

### 构建与自动化

Node 22+，安装依赖后执行：

```sh
npm ci
npm test
node --test tests/phase1-*.test.mjs
node --test tests/phase2-*.test.mjs
node --test tests/phase4-package.test.mjs
node --test tests/documentation.test.mjs
```

`npm test` 先构建默认 Bundled Timeline，再生成原始 49 项测试使用的无 Timeline 附加产物。主功能验收始终使用默认构建；49 项以及各聚焦 suite 已包含于完整总数，不相加。测试数量以当次日志为准。

| 测试 | 范围 |
|---|---|
| package-manager / phase4-package | 机器结构与 API 分离；对应版本证明；API1 安全管理／升级；新安装；最高不兼容版本拒绝；双 hash、身份、Release 复读、data、并发、取消、超时、备份失败、保存回读及运行版本不一致 |
| extension-center | 物理安装、API 未确认／不兼容、Runtime、更新候选、写入与保存状态；进度取消；更新后移除过期候选 |
| runtime / back-runtime / core-panels | API2 注册、生命周期、严格 Surface Lease、Back 与系统模块 |
| phase1 / phase2 / surface / lifecycle | 原始 49 项、Native 单实例、Race A/B、焦点、前景、失效请求、release 故障恢复与资源清理 |
| bundled-extensions / compatibility | 默认 Timeline、原业务 golden、迟到读取取消、世界书安全边界 |
| build / self-update / script-host / update-check | Build Identity、版本规则、字节／内容 hash、宿主树、安全写入、Hub 自更新与持久保存 |
| documentation | 现行文档相对链接／锚点、JSON 与 JS 示例；真实构建在模拟宿主中的 Surface、Native 和来源交接示例；不计为真实浏览器或生产包验收 |
| registry-client / submission-select | 现有认证、Origin/source 交接、目录 ACL 展示、投稿选择；不证明生产服务通过 |

包管理单元测试使用通用 Fixture、模拟 GitHub 与内存宿主，不能计为生产下载或真实宿主验收。API1 锁定官方产物组合只用于其对应旧客户端基线，不允许改 hash 或版本冒充 API2 正式产品验收。

### Core CI（隔离实现，远端运行待验证）

`.github/workflows/ci.yml` 为面向 main 的 Pull Request（包括 Draft）、main push 和手动触发定义最小 Core 回归。使用 Ubuntu 24.04 GitHub-hosted runner，固定 Node 22.23.3 / npm 10.9.9 与 Node 24.22.0 / npm 11.19.1；这些是本次核验的版本，不使用浮动 latest。实际 GitHub/Linux 结果以工作流运行记录为准，本地通过不能代替 Runner 验收。

本地使用相应 Node/npm，可复现：

```sh
node tools/ci-source-check.mjs --self-test
node tools/ci-source-check.mjs
npm ci --ignore-scripts --no-audit --no-fund
npm test
node --test tests/docs/back-examples.test.mjs
node tools/ci-artifact-check.mjs --self-test
node tools/ci-artifact-check.mjs --build
```

Back 入口执行 API 文档中命名的两个实际示例，保留独立 10 项行为验证；不纳入原 `tests/*.test.mjs` 的统计，也不替代已有 Back/Lease 测试。主套件基线为历史 514 项，实际数量以运行日志为准，不通过固定数量或删减断言获得通过。

Source Policy 扫描 Git tracked 与未忽略的新文件，阻断明确的凭据格式、完整私钥块、真实本机用户路径、数据库／备份、意外生成产物、缺失必要文件与符号链接；不输出命中的秘密内容。普通署名、版权、历史 API 说明、正常 Fixture 和合法新源码不按 hash 锁死。证书、Fixture 压缩文件及 npm 配置等模糊项单列人工 review；这不是完整 Secrets 检测或代码安全认证，审核者仍须检查 diff，不得用扫描结果替代 Contributor 归属核验。

Artifact Check 复用现有构建器及产品验证函数，分别生成 Development、Production Configuration、Unbundled，两次同环境输出逐文件比较。检查身份、版本、Schema、双 hash、大小、空 data、JS 语法、当前构建输入及随包 Manifest／资源。输出在忽略的 `build/ci/`；Production 仅嵌入公开 HTTPS 配置，不访问生产服务。检查当前输入和产物，不固定历史 Release hash。三模式不能互相代替，机器完整性不能证明 Runtime 或真实宿主运行成功。

工作流仅 `contents: read`，关闭 checkout 凭据保留和包缓存，官方 Action 固定完整 SHA；不使用 Secrets、特权触发器、自托管 runner、产物上传或部署。`ci-required` 要求 source-policy、两个 Node 测试结果及 build-integrity 全部成功，失败／取消／跳过均不能产生绿色汇总。运行旧任务被取消不代表新任务通过。分支保护和 Required Checks 需另行授权配置。

Core CI 不适配 API1 扩展、不放宽 Package 安全、不修改 Registry；Registry API2、Origin、官方扩展 Runtime、Native Parity、生产 Managed Package、移动、Owner 手验与发行授权继续分层独立验收。扩展迁移未完成不能被记为通用 API2 Core 回归失败，也不能由 Core 通过宣称其自身 Gate 完成。历史章节和既有成绩保持原文。

### 真实隔离 Tavern

先确认测试服务器仅监听本机，使用新建、明确命名的专用 dataRoot，并安装正式 Tavern Helper；不得指向日常角色、世界书、聊天、Key 或脚本目录。测试会替换专用宿主全局脚本树，不调用模型。允许端口 48190、48193 本身不是隔离证明。

`PLAYWRIGHT_MODULE` 指向已安装 Playwright 的 `index.mjs`。`TEST_HOST` 默认 `http://127.0.0.1:48190/`；补充宿主可用 `http://127.0.0.1:48193/`，配合 `TEST_TAVERN_VERSION=1.18.0`。

```sh
node tests/browser-host/run.mjs
node tests/browser-host/packages.mjs
```

`run.mjs` 使用真实 Tavern、Helper、默认 Hub 构建与同一 Standalone/Native Fixture，验证实际指针／键盘、WAAPI、Pointer Capture、top-layer、Back、Focus、Race A/B、Timeline 保存回读、disable/source release/Hub reload 和清理。它只创建命名为 `PHASE3_ONLY_Character` / `PHASE3_ONLY_Timeline` 的测试数据。Ctrl+Alt+N 属于 Fixture 作者自己的快捷键，不是 Core 新增入口。

`packages.mjs` 通过完整 Hub UI 和正式 Helper API 执行 API2 首次安装、更新、API1→API2 升级、用户字段保留、服务器回读、新运行版本确认、取消卸载、实际卸载与重载。**GitHub 响应由本地通用 Fixture 提供；宿主、脚本执行和同源持久保存是真实的，Registry 生产服务没有参与。** 不得将此结果称为生产 API2 Managed Package 验收。

输出在 `test-results/host-<browser>/`、`test-results/phase4-packages/`；记录实际 Tavern／Helper／浏览器版本、完整构建 SHA-256、步骤、错误和截图。证据必须与实际执行候选绑定，修改源码后重新构建和计算哈希。

资源计时保留 rawTimeouts；仅将空白页也可复现、堆栈精确匹配的 Safari WebDriver 30 秒看门狗单列为 automationTimeouts。其他计时器仍必须清零，不能用整页计数将宿主／驱动资源直接判为 Hub 泄漏。

Safari 使用 Apple 官方 safaridriver：经 Owner 允许临时启用远程自动化并启动端口 48191，设置 `TEST_BROWSER=safari` 执行 `run.mjs`，完成后恢复原设置。不得将 Playwright WebKit 当作真实 Safari。Package 专用浏览器脚本当前使用 Chromium 的网络 Fixture。

### 独立浏览器与资源测试

`tests/browser-native/run.mjs` 和 `tests/browser-back/run.mjs` 使用真实 Chromium、模拟 Tavern，分别验证 Native 输入与 Back；不计为真实宿主结果。使用相同 PLAYWRIGHT_MODULE。

`tests/fixtures/measure-phase2.mjs` 可通过 `HUB_ARTIFACT` 指定默认构建，测 0/1/4 个 Native 的相同负载与最终清理。`tests/browser-host/resource-audit.mjs` 用两个专用真实宿主测卸载及宿主保存完成边界。计数包括指定事件与 Observer/timer，真实宿主自己的残余监听不能自动归因于 Hub；不是整页 Heap 或性能提升证明。

### 独立 Release Gates

正式官方 Extension API2 适配、同版本 Native Parity、正式 API2 Managed Package 生产验收、Registry API2 Compatibility、Registry Origin Compatibility、移动 Safari、真实系统 IME、Safari OS Reduced Motion、Owner 手工验收分别记录。合成 composition、Chromium 触屏／reduced-motion 模拟、Node/jsdom、真实浏览器、真实宿主和 Owner 验收不能互相替代。

每次报告区分本轮重新执行、历史证据和 Pending。失败尝试保留，最终通过需有对应新候选证据；不删除测试换取绿色。禁止因 API2 改造绕过 CORS、Origin allowlist、认证、完整性验证或恢复 API1 Runtime。

### 性能对照与动态 Native 交互

`tests/browser-performance/run.mjs` 对固定 0.8.3 与当前候选的真实隔离 Tavern/Chromium 执行交错采样。它要求相邻 `benchmark-baseline` 的固定历史源码构建，比较零普通扩展、仅 Timeline、1 个 Native、4 个 Native；每版每负载默认预热2轮、测量12轮。记录 wrapper eval→ready、操作到动画结束与两帧的时间、CDP renderer 默认 timeTicks 的 Task/Script/Layout/RecalcStyle 持续时间、GC 后堆、DOM 及指定资源。Wrapper 不改变被测产品内容，但测试导入内容含计时器，必须分别记录原产物和夹具 hash。测量 API 响应与渲染等待，不冒充可信输入延迟或全系统 CPU 百分比。

`tests/browser-deep/run.mjs` 使用同一夹具字节分别运行 Standalone 和 Hub Native，动态创建视图、新事件路径、closed Shadow、同源 iframe，检查结构、样式、布局、真实键盘及事件阶段、滚动、动画、草稿、持久存储，随后100次交接和ON/OFF/清理。设置 `TEST_BROWSER=safari` 使用官方 Safari Driver。它不能覆盖所有未知第三方行为，也不把程序化 iframe 按钮点击记为真实指针。

性能采样期间不并行运行测试、不切换系统 Reduced Motion；先完成试跑，保存预热与异常样本，不删除离群值制造收益。统计至少包括 n/median/p95/min/max 与误差边界。实际存活监听、静态调用点、宿主资源、业务 Hook 和包装仪器分别报告。堆趋势不是无限时长无泄漏证明。

系统 IME、Safari OS Reduced Motion、移动 Safari 使用独立证据。涉及全局设置时先核查原值，取得本阶段授权，测后恢复；模拟器会话失败保留原始错误，不以浏览器模拟顶替。

`tests/browser-performance/focused.mjs` 对四个 Native 的 Surface 打开单独复测，预热2轮、正式12轮，每轮5次，交错版本。优先请求 CDP threadTicks，并在结果记录实际 timeDomain；组内重复不能视为独立机器样本。`resources.mjs` 在宿主及 iframe 库加载前插桩并记录归属，释放诊断引用后再检查 GC 和 DOM。性能结果使用独立输出目录，不能覆盖既有证据。

## 0.9.0 候选验证记录 · 2026-10-17

以下依据已交付 Phase 5、Phase 6 日志和本轮文档修正核验记录。0.9.0 仍是本地审核候选，测试成绩不构成正式发行授权。旧章节的 Pending 保留原意，不追溯改写。

| 阶段与检查 | 结果 | 证据性质与边界 |
| --- | --- | --- |
| Phase 6 完整 npm test | 514 PASS / 0 FAIL / 0 SKIP | Phase 6 当轮执行；包含 API2 Runtime、Package v1、Native、Lease、Lifecycle、Race A/B、Back / Focus / Foreground、Timeline、自更新及文档测试 |
| Phase 6 原始 Phase 1 / Phase 2 Core / 文档套件 | 49 / 9 / 7 PASS | 都是 514 的子集，不能累加；文档行为例子使用实际构建与模拟宿主 |
| 本轮文档修正完整 npm test | 514 PASS / 0 FAIL / 0 SKIP | 本轮重新执行；测试文件与生产源码未变；不计为新浏览器实测 |
| 本轮 Development / Production 配置 / Unbundled | 三种构建通过，完整 JSON SHA-256 分别与 Phase 6 相同 | 实际重新构建与计算；Production 配置通过不代表生产 Registry 通过；Unbundled 只作架构验证 |
| Phase 5 真实 ST 1.19 Chromium / ST 1.18 Chromium / ST 1.19 Safari | 25 / 25 / 24 PASS | 保留历史实测，Phase 6 与本轮均未重跑；含 Race A/B、Native / Surface、导航及 Timeline 保存回读 |
| Phase 5 动态 Native 深化 | Chromium 9 PASS / Safari 9 PASS | 同一通用 Fixture 的 Standalone 与 Native 对照；Dual Entrance / Single Business Instance、动态视图、交接与清理，不替代正式产品 Native Parity |
| Phase 5 真实 ST 1.19 Package Fixture | 8 PASS | 真实 Helper、脚本执行与服务器保存回读；GitHub 响应是 Fixture，未调用生产 Registry，不是正式 Package 生产验收 |
| Phase 5 模拟宿主真实 Chromium Native / Back | 6 / 8 PASS | 浏览器真实，宿主模拟；与真实 SillyTavern 结果分列 |
| Phase 5 本机真实拼音 IME | 已测范围 PASS | Standalone / Native 各 39 个可信事件，覆盖提交、取消、草稿；不推及所有输入法或设备 |
| Phase 5 Safari OS Reduced Motion | 已测范围 PASS | 实际系统开关、媒体查询与动画验证，测试后恢复；不是 Chromium 模拟媒体条件 |

保留实测环境为 macOS 26.6、Chromium 151.0.7922.34、Safari 26.6、Tavern Helper 4.11.3，以及 SillyTavern 1.19.0 / 1.18.0 的表中组合。本轮没有修改浏览器或系统设置，没有重新取得移动设备结果。生产构建输入逐字节未变且三种重建相同，是继续引用 Phase 5 证据的范围依据；源码清单仍须为文档修正重新生成。

性能对照保留 Phase 5 的固定 0.8.3 对当前候选实验：主实验 112 个原始样本、96 个正式样本；四 Native 专项 140 个原始样本、120 个正式样本。普通初始化基本持平，Core 模块由 21 收敛为 20，但整体源码字节未减少。快速废弃请求减少无效工作，不代表相同数量完整渲染普遍加速；资源稳定只覆盖受测负载和时长，不证明无限运行零泄漏。原始样本、异常及首次信号均应保留。

### 架构回归边界

当前架构验证继续检查一个 Runtime、一套 Hub Surface 和一个 `nativeWindows` Map；`nativeEntries` 是 UI 委托 Surface 偏好的 facade，不是独立 registry / controller。Runtime 队列负责生命周期串行化，Surface 过渡 serial 负责动画取消，ownership epoch 在请求到达时撤销旧权限；不能因合并入口而省略这些不同边界。双入口共享 Session、面板与业务 Hook，release 先撤销 Lease 再同步清理，失败保留 blocked 独占保护与显式重试；Hub 前景和浏览器 top-layer 分别检查。当前签名见 [Extension API](EXTENSION-API.md)，迁移说明见 [发行草稿](RELEASE-0.9.0-DRAFT.md)。

### 当前独立验收状态

| Gate | 状态与边界 |
| --- | --- |
| Extension Runtime API v2 | Core / 通用 Fixture 已测范围通过；不执行 API1 Runtime |
| Managed Package v1 | 客户端机器格式、安全校验和隔离流程通过；物理安装、API 声明、保存回读和新版本运行分别确认 |
| Native Window Parity / Dual Entrance / Surface Lease / Lifecycle / Transition Race | 通用 Fixture 和已测桌面环境通过，不代替各正式扩展适配 |
| Bundled Timeline | 自动化与保留的真实宿主用例通过；随 Hub 构建，不冒充独立生产 Package |
| 正式官方 Extension API2 适配及对应 Native Parity | PENDING；Polisher、Preset Manager、Story Director 分项目验收，Worldbook Manager 按实际初始项目状态处理 |
| 正式 API2 Managed Package 生产验收 | PENDING；不能由 Fixture 或 Runtime 通过推导 |
| 生产 Registry API2 Compatibility | PENDING；0.6.1 实际 Manifest validator 仅接受 API1 |
| Registry Origin Compatibility | PENDING；独立于 API2，不扩大 allowlist 或绕过 CORS |
| 移动 Safari | PENDING；官方驱动会话未建立，不以桌面或 WebKit 模拟替代 |
| 真实系统 IME / Safari OS Reduced Motion | Phase 5 本机已测范围 PASS；保留历史实测，不计为本轮重测 |
| Owner 人工验收 | PENDING |

### 报告与原始证据索引

已发布的历史文档原文见 [固定 0.8.3 源码](https://github.com/SheepSheepLab/MieMie-Hub/blob/v0.8.3/docs/TESTING.md)。0.9.0 详细审核证据尚未公开；以下是 Owner 本地审核包内的相对位置说明，不是公开下载链接或仓库内文件承诺，不用本机绝对路径充当公开证据。

| 审核包 | 包内证据 |
| --- | --- |
| Phase 6 RC 原审核包 | `审计报告.md`、`Release-Readiness-Matrix.md`、`Retained-Browser-Evidence.md`；`evidence/npm-test-final.log`、`evidence/SOURCE-SHA256SUMS.txt`、`evidence/rc-integrity.json` |
| Phase 6 RC 原审核包保留的 Phase 5 | `retained-phase5/` 内的真实宿主、Native、IME、OS Reduced Motion、性能原始证据；`prior-reports/` 保留更早阶段报告 |
| Phase 6 Documentation Correction 审核包 | `审计报告.md`、`Historical-Preservation.md`、`Other-Documents-Audit.md`；`evidence/npm-test.log`、`evidence/validation.json`、`evidence/SOURCE-SHA256SUMS.txt`；`prior-phase6/` 原样保留上表 Phase 6 审核包内容 |

原始证据必须按各阶段源码清单及构建 SHA-256 关联；本轮文档修正的源码清单不能冒用旧清单。后续若公开证据，应链接实际发布的位置，并继续保留阶段与环境边界。

## Pre-Main 验收记录（2026-10-20）

新增阶段回执，不改写上方 2026-10-17 的数字与 Pending。实测源码 `12368af0715d92210cfa716b5bc81ce896b5514a`；产物 `MieMie-Hub-0.9.0.json`，完整附件 SHA-256 `0ae01eb1052fbcf05ad420e6800ee5ccc0ae19cccc7ff9efc0977fec99f19a42`。这是默认 Development／Bundled Timeline 产物，不代表 Production 配置或线上服务。 本分支内部版本暂留，不能替换已发布同版资产。

| 检查 | 实际结果与范围 |
| --- | --- |
| Hub 主测试 | 515 PASS／0 FAIL／0 SKIP；原 Phase 1 的 49 项和 Phase 2 Core 等为子集，不累计 |
| 五仓主测试 | Hub515、Registry314、Polisher55、Preset447、Director527，共1,858；Preset build 的21项机器测试单列 |
| Linux CI | 五个 Run、九个 Job 成功；Hub [Core CI](https://github.com/SheepSheepLab/MieMie-Hub/actions/runs/39350796278) 的 source-policy、两个 Node、build-integrity、ci-required 均成功 |
| 通用真实宿主 | ST1.19／1.18 各 Chromium25、Safari24；Race A/B、Timeline／世界书回读、Back、Focus、Foreground、reload及清理 |
| 三款实际构建 | 每款×ST两版本×Chromium／Safari，每组9项；不是通用 Fixture 冒充正式产品 |
| 同 Hub 共存 | Chromium／Safari各7项；实际指针拖动、Native／Surface，单 Runtime |
| 动态 Native Fixture | 两浏览器各9项；100次交接、各25次Race A/B、20轮生命周期、5次Helper Hub reload；不替代所有产品业务矩阵 |
| 隔离 Managed | 最终三款真实包13项、通用升级18项、取消3项、身份／hash负例24项；本机Catalog／Relay与真实Helper保存回读，不是生产 |
| 独立浏览器 | 模拟宿主 Chromium Native6／Back8／SelfUpdate6；不能称为真实Tavern |
| 系统输入／动画 | 真实拼音仅Polisher Native与Standalone；其他产品用捕获事件回归。Safari OS Reduced Motion 实际开关并验证，恢复原值 |

真实环境：macOS 26.6（25G72）、Chromium 151.0.7922.34、Apple Safari 26.6，ST 1.18.0／1.19.0、Tavern Helper 4.11.3。ST 1.19 源码为 `7e8663cd9c184a550b37238218bdd32c6efc68e9`；1.18 测试副本无 Git 元数据，按完整文件 hash 锁定，不能编造 commit。公开 Default 派生测试数据、专用 dataRoot 与本机合成模型响应；未调用真实外部模型供应商。

IME 修复针对 compositionend 后 Escape 可能出现 `isComposing=false, keyCode=229`：通用 Hub opt-in Back 和各扩展自有 Escape 保留输入法消费，普通 Escape 仍正常返回。没有按产品 ID 给 Core 加分支。Native 所有权期间不接管扩展自身的 Dialog、焦点、动画或业务输入；已测产品通过不代表未知第三方全部无缺陷。

Hub 默认构建、API2 Runtime、Package v1、正常 Bundled Timeline、自更新、身份／版本、Source ready/release、whenDisposed、严格 Lease、迟到任务和资源清理均由主套件保护。生产配置构建与无Timeline架构产物分别校验，不能混用默认实测 hash。当前3款 API2 适配不再 Pending；正式发行和生产 Gate 仍独立。

Runtime API2 与 Managed Package v1 为两道 Gate：开发候选 Runtime／Native 已测范围 PASS，隔离机器包流程 PASS；**生产 Registry API2、生产 Origin／OAuth、正式新版本及 Assets、正式在线安装更新、物理移动 Safari、真实外部模型服务及 Owner 手工验收仍分别 Pending**。Standalone、Package 身份／完整性与用户数据保护继续保留，不增加旧 Hub Runtime 兼容义务。

### Pre-Main 原始证据

原始证据为 **Owner 私有审核材料，尚未公开下载**：`MieMie-Hub-0.9.0-Final-Pre-Main-Review.zip`，SHA-256 `8c06fdad93ff68c5be5699b742d98e4849000b532eaa072bc3279165ee473d73`。包内 `evidence/FINAL-INTEGRATION-LOCK.json`、`FINAL-ACCEPTANCE-RESULTS.json`、`FINAL-BUILD-AUDIT.json`、`FINAL-CI-RESULTS.json` 关联真实源码、产物和日志；不以本机路径充当公共证据。以下是该阶段的既有执行记录，本轮文档维护不声称重新运行 Safari 或宿主；本轮新 HEAD 的本地／Linux CI 回执另随 Owner 审核包交付。

包内 `evidence/host-results/`、`portable-*-MieMie-*.json`、`D-managed-host.json`、`host-upgrade.json`、`final-install-cancel.json` 与各阶段失败日志保留实际步骤；测试后专用脚本树经服务器回读为空、Helper测试设置恢复、服务停止。Safari 锁屏及驱动命中限制保留原失败，不作为产品修复通过凭证。
