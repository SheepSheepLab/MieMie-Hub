# Hub 版本检查与产物兼容验证

当前版本：Hub **0.2.0-alpha.4**（Pre-release）；锁定 Polisher **1.0.1-hub.2**。本版包含 GitHub Release 版本检查及两张官方图标修正。

## 独立构建与测试

```sh
npm ci
npm run build
npm test
```

`npm test` 会先构建当前 Hub，基础测试不依赖 Polisher。当前 **56 项通过**：18 项原 Runtime 测试、4 项 Core／时间线／导出兼容测试、10 项 Core 面板 DOM 测试、24 项版本检查单元测试。

`tests/update-check.test.mjs` 使用显式 fetch 替身和模拟时钟，无真实请求，覆盖：

- `v` 前缀、严格 SemVer 格式、构建元数据、核心版本和预发布排序、大整数、前导零与非法 Tag。
- Draft 过滤、无序列表与跨页选择最高版本、分页失败和页数上限；不根据第一项宣称最新。
- 本地等于、低于、高于远程版本；HTTP 403／500、网络拒绝、异常响应、JSON 格式错误、空列表和无有效版本。
- 失败后重试、重复调用共用一次检查、15 秒总超时（包括 JSON 读取）、teardown 取消、迟到响应隔离。
- 固定 Hub API URL、无凭据／Body／Referrer、拒绝重定向、未点击时不请求、不读取 Release 附件 URL。

`tests/core-panels.test.mjs` 在酒馆助手形态的 iframe 中执行完整 Hub JSON，用模拟 Release 响应检查实际 Panel：

- 当前版本与 `package.json`、运行中 Hub 一致；最新版本初始隐藏。
- 已是最新版、发现新版本、当前版本高于远程版本、失败与重试；没有更新按钮。
- 检查中的按钮禁用及重复点击合并，失败清除过时版本显示；面板切换保留状态。
- `pagehide` 取消请求；旧回调和迟到响应不影响新 Hub。
- 原 Core 入口、时间线与 Hello Mie Launcher 共存；反复切换、返回、Escape、关闭和重载不重复 DOM／Listener。

## 锁定产物组合测试

```sh
npm run test:integration -- --polisher /absolute/path/咩咩润色工具-Extension-1.0.1-hub.2.json
```

组合测试只引用完整 JSON 产物，不导入另一仓库源码。`tests/integration/artifacts.lock.json` 锁定双方版本、脚本 ID 和 SHA-256；校验失败时拒绝执行。本次只更新 Hub 侧锁定信息，Polisher 版本及哈希保持不变：

- Hub 0.2.0-alpha.4：`880ba7b90309f4e6ba5bb5a2140a5667839cc88edef660a3c6463cfda5792585`
- Polisher 1.0.1-hub.2：`99cfdf386186be770d47e6f840da105095eaf595d4cb0bb3cc7667b7872729e4`

JSON 文件名可以是本地中文名称或 Release 的 ASCII 名称；显式传入的文件按其实际字节、版本及脚本 ID 校验。不会自动寻找另一仓库或下载附件。可用 `--hub` 和 `--lock` 显式选择另一已确认的锁定组合。

本次 **27 项组合检查通过**。Hub 的 iframe fetch 返回模拟 GitHub Release 元数据；宿主 fetch 继续模拟润色／酒馆请求，其他外部请求被拒绝。检查 Hub 查询不经过 Polisher Hook，不改变 Extension 状态；原有时间线手动／自动切换、润色／翻译、旧设置及密钥、提示词、备份恢复、发送原文、重复启停、卸载、请求取消及清理等检查保留。

结果写入被忽略的 `test-results/integration.json`。这些测试是 Node.js + jsdom 模拟，**不代表真实 GitHub 网络、浏览器 CORS 或真实酒馆已验证**，也不验证布局、动画或拖动。

## 真实酒馆人工验证

1. 停用旧 Hub 并刷新，导入 `build/咩咩Hub-0.2.0-alpha.4.json`，搭配既有 Polisher 1.0.1-hub.2。确认设置显示 alpha.4、尚未检查；打开设置或其他页面不会自动请求 GitHub。
2. 打开浏览器网络面板后点击检查，观察“正在检查…”及禁用按钮。只应请求公开的 `api.github.com/repos/SheepSheepLab/MieMie-Hub/releases` 元数据；没有 Token／Authorization、Cookie、请求 Body 或 Referrer，也不请求 Release 附件。浏览器按 CORS 协议管理的 Origin／预检应与业务数据区分。
3. 当远程最高有效版本为 alpha.4 时，应显示最新版本 alpha.4 和“已是最新版”。若远程仍为 alpha.3，应显示“当前版本高于已发布版本”；后续远程高于本地时应显示“发现新版本”。这些情形已由模拟响应覆盖，均不会出现下载／更新按钮。
4. 连续点击检查、切换面板并返回，确认没有并发重复请求、重复 DOM 或监听；检查完成后可以重新检查。
5. 用浏览器开发工具临时阻止该 GitHub API 请求，确认“检查更新失败”，恢复网络后可重试。慢速／悬挂连接应在约 15 秒后失败；HTTP 限流等错误也不能误报最新版。
6. 慢速检查期间停用 Hub 或刷新，确认请求取消、旧面板不复活；重新启用后恢复尚未检查。测试后还原浏览器的网络模拟设置。
7. 复核时间线手动与自动接续、Hello Mie 打开、润色和翻译各一次、扩展停用／重启，以及桌面与窄屏下状态文字和拖动交互；Hub 主图标应为双手比 V 的咩咩，时间线图标应为手持闹钟的咩咩。

## 图标与 Alpha 发布检查

两张修正版 PNG 均按 SheepSheep 提供的源文件原样复制，尺寸为 1254 × 1254；不重新生成、改色、缩放或压缩。构建只进行 Base64 编码，解码后应与源 PNG 逐字节一致：

- `assets/hub.png`：`c2f45f8f796777ed9c9420c66661a6f87bf01f88defd1aa245f52525732896aa`
- `assets/timeline.png`：`49d1375a30898874c8b283449a3e19bc242b10840ecdae4389b5ed218896e909`

本次 Alpha 发布允许在构建、全部自动测试、锁定产物组合测试、敏感信息及 staged 内容检查通过后直接提交和发布 Pre-release。真实酒馆的网络、视觉及交互仍需按上文人工验证，不能由模拟测试代替。Polisher 源码、版本、图标与锁定产物保持不变。
