# Hub 构建、更新与产物兼容验证

当前版本：Hub **0.4.1**（GitHub Pre-release）；组合测试锁定 Polisher **1.1.0**。保留Hub自更新回归，新增生态UI、Registry客户端和Extension Package安装更新测试。

## 独立构建与测试

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
| 既有兼容 | Runtime 生命周期与 Launcher 错误隔离、时间线静态基线、Hello Mie、历史存储标识 |

测试使用显式 fetch 替身、内存脚本树、流式 Response、模拟保存读回及 Node／jsdom 环境。不会在测试过程中修改真实酒馆脚本，也不会把模拟 GitHub 数据当成远程发布结果。

## 锁定产物组合测试

```sh
npm run test:integration -- --polisher /absolute/path/MieMie-Polisher-Extension-1.1.0.json
```

组合测试只引用完整 JSON 产物，不导入另一仓库源码。`tests/integration/artifacts.lock.json` 锁定当前 Hub 与 Polisher 1.1.0 的版本、脚本 ID 和 SHA-256；校验失败时拒绝执行。具体 hash 以该锁定文件为准，每个发布版本都重新计算最终构建字节，不在本文复制会过时的 Hub hash。

JSON 可以是中文本地文件名或 ASCII Release 文件名；校验针对实际字节、版本及脚本 ID。测试不自动寻找兄弟源码目录或下载附件。可以用 `--hub` 和 `--lock` 显式选择另一份已确认的锁定组合。

组合测试执行两份完整 JSON，核对 Hub 与 Polisher 的生命周期、事件协作、查询请求隔离、时间线、润色／翻译、旧设置及密钥、提示词、备份恢复、发送原文、启停、卸载、请求取消与清理。结果写入被忽略的 `test-results/integration.json`。

**自动测试不是实际 GitHub 网络、浏览器 CORS 或真实酒馆验收。** 它也不能验证真实布局、动画、拖动及浏览器是否成功保存恢复文件。

## Ecosystem MVP 黄金路径

当前版本 **Hub 0.4.1 / Polisher 1.1.0 / Registry 0.2.1**。原Hub自更新回归仍保留；本阶段不把模拟HTTP或浏览器DOM测试称为真实Discord授权或Tavern验收。

- A：只启用Polisher1.1.0，独立球打开原UI，核对旧设置、Key、Prompt、备份。
- B：Polisher先运行后启动Hub；球收纳到Hub，再停用/启用Hub，球恢复/再次收纳。重复操作无重复实例。
- C：Hub首页只有扩展中心管理入口，内部发现/已安装/我的；Registry离线仍可使用时间线和本地工具。
- D：确保没有重复Polisher条目，在发现选已配置Catalog项目，或使用作者GitHub直接预览入口，点击安装；不手工导入JSON。作者仓库为SheepSheepLab/MieMie-Polisher，机器校验全部通过才执行。
- E：已发布1.0.1作为旧基线，本轮可测试原位更新至1.1.0并验证双模式及原设置保留。尚无修正版Icon，因此新Icon验收延期，不伪造1.0.2。
- F：按Registry部署说明配置真实Discord应用，使用我的登录，分别提交GitHub/Discord项目，核对作者与投稿者、公开资料与来源。
- G：同一身份编辑、下架、重新上架；发现同步变化、我的保留；已安装代码不远程停用。
- H：修改Discord显示名/头像后重新登录，资料更新而旧投稿仍归同一身份。

物理卸载确认后删除该脚本条目及其data，不请求或生成备份。Runtime注销不会删除原脚本。更新作者代码启动失败时手工恢复旧content，没有自动回滚；宿主写入结果不能冒称服务器保存完成。

## 完整 Package 产物测试

```sh
npm run test:ecosystem -- --polisher /path/to/MieMie-Polisher-Extension-1.1.0.json --metadata /path/to/MieMie-Extension-update.json --legacy-polisher /path/to/MieMie-Polisher-Extension-1.0.1.json
```

显式读取Hub完整构建JSON、Polisher1.1.0 JSON和metadata以及已发布1.0.1 JSON；不导入另一仓库源码。验证metadata/digest，报告记录每份产物SHA-256。只在模拟宿主中由正式树API触发创建/重载/删除iframe，执行真实构建代码，GitHub响应替身明确为Development Fixture。结果在ignored `test-results/ecosystem.json`。

Registry另有显式产物合同测试 `tests/hub-contract.mjs --hub <Hub JSON> --sha256 <锁定SHA256> --report <本地输出>`。它验证指定HubJSON的hash、使用其中实际客户端连接临时本地HTTP服务与隔离SQLite；Discord/GitHub上游是测试适配器。基础Registry测试不要求Hub目录存在。

## 失败与恢复验证

在可恢复的测试条目中分别核对：非全局安装、复制旧 Hub 后多候选、网络中断、连续点击、下载中停用、保存读回不可达、宿主保存延迟，以及旧内容被其他操作修改。自动测试覆盖损坏 hash／JSON／版本和异常交接记录；不为测试这些情况修改正式 Release 或关闭安全校验。

新版无法启动时优先在原安装条目中恢复备份 `content`，不要覆盖其他脚本或清空业务数据。有效交接记录内，恢复的旧版本、同实例 ID 和旧 content hash 全部一致时，可以识别未生效／已恢复并解除本次交接；异常、过期或不匹配的记录保留待确认，需要手工核对。第一代没有 Loader 自动回滚。

## 图标与发布完整性

Hub 与时间线图片保持 SheepSheep 提供的源 PNG 字节，构建仅 Base64 编码，不生成、改色、缩放或压缩；Polisher Icon 不由 Hub 更新修改。

发布前执行构建、全部基础测试、锁定产物组合测试、敏感信息和 staged 内容检查。发布均标记 GitHub Pre-release；附件只使用 ASCII 名称，并匿名重新下载核对最终字节 hash、Tag／Commit、元数据和工作区状态。正式发布不等于真实酒馆验收完成。


## 浏览器 CORS 回归（保留 0.3.2 基线）

```sh
node tests/browser-download/run.mjs --serve
```

打开输出的 localhost 页面，自动执行 8 项浏览器回归并在页面及终端输出结果。该模式不依赖 Playwright；必须保持正常浏览器安全设置。也可以安装 Playwright 后直接运行同一文件，由 `PLAYWRIGHT_MODULE` 和 `PLAYWRIGHT_BROWSERS_PATH` 指定测试运行环境；它们不属于 Hub 产品运行时依赖。

测试使用不同 localhost Origin 与没有 CORS 头的真实 HTTP 附件响应，覆盖阻断、转发成功、元数据和包篡改、错误 Origin、超时、teardown、无凭据。Registry 后端 SSRF 等边界由其独立 24 项新增测试覆盖。本地 fixture 不是社区投稿。

0.3.2 阶段另外在正常浏览器中用真实已发布 Polisher 1.1.0 附件联调：直接读取被 CORS 拦截，配置真实本地 Registry 后，预览和完整包字节双 hash 校验通过；安装写入目标是隔离内存脚本树，没有改动用户酒馆。这仍不宣称真实 Tavern 安装验收通过。部署／复测步骤见 [下载传输说明](DOWNLOAD-TRANSPORT.md)。

## 生产形态回归（0.4.1）

构建测试区分 development / production：生产缺地址、示例域名、本机地址、非 HTTPS 或带凭据的地址全部拒绝。普通扩展中心不含服务地址或保存配置控件；内置地址直接读取发现及进入 Discord 登录。设置页高级选项默认折叠，仅创建一次，旧覆盖偏好保留、留空恢复默认值，teardown 清理按钮处理器。真实公网部署和 Discord 授权仍需要维护者提供实际 HTTPS 地址及服务端私有凭据；测试 URL 是 Fixture，不宣称服务已上线。
