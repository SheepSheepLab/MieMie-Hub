# MieMie Ecosystem Release Hardening Audit

日期：2026-09-28。审计对象是冻结源码及其重新生成的本地产物，不是线上部署。仅修复局部异常路径和产物锁值；未提交、推送、升级版本、创建 Tag/Release、部署或修改生产数据库。

## 结论

**READY FOR RELEASE CANDIDATE**，针对包含下述未提交修复的工作树。不是宣称冻结提交本身已包含修复，也不是生产环境验收通过。

- 发现 3 个问题，均已局部修复并复测；没有遗留的已知 BLOCKER/HIGH。
- 不需要 `ARCHITECTURE FREEZE BREAK REQUIRED`。API、生命周期模型、权限、数据结构、动画与视觉均保持冻结边界。
- 可以进入 RC 准备和真实部署环境验收；本轮不执行发布。

## 基线与最终工作树

审计开始时三个 main 均 clean，HEAD 与指定冻结 SHA 完全一致。结束时 HEAD 未变，暂存区为空。

| 仓库 | HEAD | 版本 | 最终状态 |
| --- | --- | --- | --- |
| MieMie-Hub | `45fec430c5683af19c949b316e76886848d1f9f1` | 0.7.0 | 2 个修改文件、2 个新增文件，未暂存 |
| MieMie-Polisher | `74b7b0e650661a085a933881f1222df04bf83ecb` | 1.1.4 | clean；仅重新生成被忽略的 build |
| MieMie-Registry | `34155db8700e15b11dc72822da6856aa3d14e6fa` | 0.4.0 | 1 个修改文件、1 个新增文件，未暂存 |

## 问题清单

### RH-01 — HIGH：异常生命周期属性读取跳过资源清理

- 仓库 / 位置：Hub，`src/extension-runtime.js`，`teardown()`。
- 复现：Extension 通过 `api.onCleanup()` 登记 disposer，返回带抛错 `deactivate` getter 的实例；或启用成功后让该 getter 在停用时抛错。旧代码在 `try` 外读取属性，资源清理循环不会执行。再次 teardown 时 session 已撤销，不能补回遗漏的清理。
- 影响：错误第三方扩展可能遗留其已登记的 DOM、监听或计时器资源；不是单纯日志问题。
- 建议 / 已修：将生命周期属性读取纳入原有 `try/catch`，报告错误后仍执行全部清理。不增加 API 或改变 deactivate/disable/uninstall 的定义。
- 验证：两个新增用例先复现失败，再验证 creation/disable 两条路径清理按逆序且只执行一次；正常扩展仍可启用和打开。全量与实际产物组合测试通过。

### RH-02 — MEDIUM：OAuth 拒绝或兑换失败后轮询仍等待

- 仓库 / 位置：Registry，`src/app.js`，`/api/auth/callback` 与 handler 的异常出口。
- 复现：有效 state/cookie 对应的 callback 返回 `error=access_denied`，或 code 兑换失败。旧实现已删除 flow，却保留不可能完成的 handoff，Hub 的 `/api/auth/complete` 继续收到 pending，直到原期限届满。
- 影响：用户已经拒绝/失败，Hub 仍等待，重试反馈延迟；未发现因此发布错误身份或绕过权限。
- 建议 / 已修：仅在 state 与 cookie 均已验证后记录 requestId；callback 失败时删除对应 handoff，让轮询使用既有 `invalid_handoff` 终止。无新增协议字段、权限或 schema。
- 验证：拒绝和兑换失败均无 session、轮询立即终止、之后可重新登录；伪造 cookie 不得取消真实流程。3 个新增回归通过，真实浏览器模拟 OAuth 8/8 通过。

### RH-03 — HIGH：冻结源码重新构建后产物锁失配

- 仓库 / 位置：Hub，`tests/integration/artifacts.lock.json`。
- 复现：从冻结 Polisher 源码正常构建，执行显式产物集成测试；原锁值拒绝新 JSON。冻结前批准删除的行尾空白也会改变当前原样打包器生成的字节。
- 影响：冻结源码不能通过自身的严格产物集成门禁；不应跳过或放宽哈希断言来发布。
- 建议 / 已修：确认重复构建字节一致后更新 Polisher 锁值，同时更新本轮 RH-01 所改变的 Hub 锁值。仅改两个 SHA-256，版本、脚本 ID、格式和校验强度不变。
- 验证：初次集成明确因 hash mismatch 失败；锁值更新后 30/30 通过，生态 16/16、Hub ↔ Registry 13/13 通过。

## 测试结果

| 测试范围 | 结果 | 说明 |
| --- | --- | --- |
| Hub `npm test` | 325/325 PASS | 原 316 + 9；含 Native Presentation 防御、Package、自更新、Runtime、Surface、Shortcut、UI DOM 合同 |
| Polisher `npm test` | 42/42 PASS | 独立 / Hub / Native Presentation、业务与兼容数据 |
| Registry `npm test` | 176/176 PASS | 原 173 + 3；含 Admin/governance、身份、Package、网络与部署配置 |
| Hub + Polisher 产物集成 | 30/30 PASS | 两个真实完整产物，严格版本/哈希锁 |
| 生态 install/update/uninstall | 16/16 PASS | 使用真实 1.1.3 → 1.1.4 测试产物、模拟宿主树 |
| Hub ↔ Registry HTTP 合同 | 13/13 PASS | 当前 Hub 产物、隔离文件 SQLite、本地 HTTP、模拟上游 |
| Admin Console HTTP/DOM | 11/11 PASS | Owner/Admin/普通/受限、确认/取消、过期状态与审计 |
| 真实浏览器 CORS 下载 | 8/8 PASS | 跨域拒绝、受限转发、重装、篡改、Origin 拒绝、超时、取消；凭据转发为 0 |
| 真实浏览器模拟 OAuth | 8/8 PASS | sandbox iframe + detached opener；弹窗/cookie/PKCE、成员权限、注销；Discord 为本地模拟 |

以上合计 629 个通过的自动检查，无失败或跳过。该合计不把人工浏览器观察算成测试项，也不代表所有可能宿主/设备组合均覆盖。

Hub 新增存储用例还覆盖缺失/损坏/旧形状 Shortcut preference、storage 访问被拒及 quota 写失败：不挂载、不虚报 ON。生产构建模式用于 Hub 全量测试的 pretest。

复现命令（各仓库根目录，跨仓库路径使用本地实际位置代入）：

```sh
# Hub
MIEMIE_BUILD_MODE=production MIEMIE_DEFAULT_REGISTRY_URL=https://registry.sheepsheeplab.com npm test
node tests/integration/run.mjs --polisher /path/to/MieMie-Polisher/build/MieMie-Polisher-Extension-1.1.4.json
npm run test:ecosystem -- --polisher /path/to/MieMie-Polisher/build/MieMie-Polisher-Extension-1.1.4.json --metadata /path/to/MieMie-Polisher/build/MieMie-Extension-update.json --legacy-polisher /path/to/MieMie-Polisher/build/MieMie-Polisher-Extension-1.1.3.json
node tests/browser-download/run.mjs --serve
# 浏览器打开上条命令输出的本地 fixture 地址，等待 PASS 8/8。

# Polisher
npm test
npm run build

# Registry
npm test
npm run build
node tests/hub-contract.mjs --hub /path/to/MieMie-Hub/build/MieMie-Hub-0.7.0.json --sha256 d4ee3856b435a09fa98104a27c375b0aae536dd5f81d9327674b7eadf39e6330
node tests/admin-console-contract.mjs --jsdom-module /path/to/MieMie-Hub/node_modules/jsdom/lib/api.js
node tests/browser-oauth.mjs --hub /path/to/MieMie-Hub/build/MieMie-Hub-0.7.0.json --sha256 d4ee3856b435a09fa98104a27c375b0aae536dd5f81d9327674b7eadf39e6330 --auto-consent true --detach-opener true --iframe true --sandbox true
# 浏览器打开上条命令输出的本地 fixture，点击 Start，等待 PASS 8/8。
```

## 审计覆盖与边界结论

| 领域 | 审查及验证结论 |
| --- | --- |
| 安装 / 更新 / 卸载 | `extension-packages`、`hub-script-host`：不执行下载内容；fresh inspect、Release/asset 再验证、hash/identity/结构验证先于宿主写入。未知宿主树形状拒绝写入。更新保留备份、检查并发编辑与保存确认；Runtime 注销不冒充物理删除。生态覆盖重装及偏好清理。 |
| Hub 自更新 | `hub-self-update` / `hub-update-check`：404/网络失败、超时、坏 JSON、错误 product/script/version、篡改、CORS、过期任务均有拒绝写入测试；持久保存无法确认时保留交接/恢复信息，不虚报成功，也不盲目覆盖用户随后编辑。 |
| 单实例 / 双模式 | Polisher Adapter、资源控制器及产物组合测试：Hub 出现/消失、重载、Shortcut 和 Honeycomb 快速打开仍共享一个业务实例；Standalone/Shortcut 仍使用同一份 Native Floating Presentation，本轮无动画文件修改。 |
| 第三方故障隔离 | factory/activate/open/deactivate/cleanup、无效 Surface 参数、Shortcut mount 失败及 detached origin；Native place/run/cancel/release 抛错、拒绝、永不完成、迟到结果均使用既有边界收尾。RH-01 补上 getter 异常。同步无限循环仍是明确的同线程边界。 |
| 网络 / 登录 | Hub client 的 deadline、abort、epoch 与当前身份确认；Registry offline/500/坏响应/失效会话、注销与迟到回调测试通过。RH-02 补上已失败 callback 的轮询终止。重载不持久保留登录 token，属于既有设计。 |
| 身份 / 权限 | Official/Community 与安装兼容性分别验证；normal/admin/owner/banned 和 Guild ACL 由服务端执行。公开 DTO 不包含私有 Discord 凭据；测试中不使用生产账号。 |
| Type / Distribution | managed_install 必须为 GitHub + tavern_extension + 已验证包；服务端独立拒绝 standalone/web/Discord 的非法组合。管理员与 Official 不跳过包校验。GitHub Language 不作为类型依据。 |
| Storage | 保留 `meeme_timeline_dock_v1`、`miemie_hub_extensions_v1`、`miemie_hub_shortcuts_v1`、`miemie_hub_update_pending_v1`、`miemie_polisher_dock_v1` 及工具业务兼容键。不修改迁移。坏偏好尽量回退；无法保证持久化的安装/更新/开关拒绝声称成功。 |
| Cleanup | 既有多轮启停、重载、开关和产物升级测试检查重复 DOM/事件订阅；Native watchdog、动画取消及迟到任务不重启旧 Surface。未声称完成长时间 heap profiling；扩展未登记的自有资源也不由 Hub 扫描接管。 |
| Motion / 可访问性 | 既有 Reduced Motion、pointer/touch、Space/Enter switch、ESC/返回、resize/revoke/dispose 回归通过；本轮未新增视觉或无障碍系统。 |

## 浏览器功能复核

使用 `tools/ui-review.mjs` 载入本轮真实构建，宿主/目录为模拟环境；未把预览页当成真实 Tavern。

- 1280×900 的 Hub → Polisher 打开正常，面板及祖先 `filter` 均为 `none`。
- 390×844 的 Polisher 面板在视口内，返回按钮高 44px；页面无水平溢出。
- 390px 已安装页：操作按钮无水平越界；开启 Shortcut 后 `aria-checked=true`，外部 Orb 真实出现；进入面板可返回。
- Shortcut 面板从竖屏改为 844×390：面板位置 `(158,10)`、尺寸 `600×370`，返回按钮仍可见、可关闭。
- 真正 Standalone 从短横屏变为 320×568：面板仍显示，位置 `(10,10)`、尺寸 `300×548`；Orb 保留，实际点击收起成功。
- Settings、Timeline 打开/返回正常；Timeline 在 320px 下仍有返回入口，两者祖先均无 filter blur；Settings 的 ESC 返回成功。
- 未出现控制台工具运行错误。浏览器 CORS fixture 的预期跨域拒绝不计为应用崩溃。

这些检查不验证真实角色数据生成、物理触摸性能、Safari/WebView 合成或软键盘安全区。实际 Tavern 的版本/扩展环境、线上 Discord CORS 配置及真实公网失败仍应作为 RC 实机 smoke 验收。本轮未运行独立的 Playwright self-update 浏览器脚本；自更新异常由全量源码/DOM测试和真实下载 CORS fixture 覆盖，不将两者称为真实线上自更新验证。

## Build / 静态检查

- 三仓 package.json 与 lockfile 版本一致；Hub/Polisher 的包头、更新元数据、productId、scriptId、版本和 SHA-256 一致。
- Hub 正式构建显式使用 `MIEMIE_BUILD_MODE=production` 和官方 HTTPS Registry；未发现生产 localhost/占位地址回退。普通 `npm run build` 默认 development 的既有规则保持不变，RC 打包必须使用文档中的正式参数。
- Hub 与 Polisher 的 JS、安装 JSON、更新元数据重复生成逐字节一致。Registry 的 build 为源码语法/版本检查，不生成前端 secret bundle。
- 已检查三仓所有 tracked JS/MJS（Hub 49、Registry 33、Polisher 17）、新增测试和构建 JS 的语法。
- tracked + 非忽略 untracked 源文件扫描未发现个人绝对路径或真实敏感信息；凭据模式命中逐项确认仅为测试假数据。build 中个人路径、密钥签名和 localhost URL 扫描通过。
- 三仓 `git diff --check`、`git diff --cached --check` 通过；新增文件另行检查空白。未修改版本、协议身份、生产配置或用户兼容键。

本轮可重复生成的安装 JSON SHA-256：

| 产物 | SHA-256 |
| --- | --- |
| Hub 0.7.0 | `d4ee3856b435a09fa98104a27c375b0aae536dd5f81d9327674b7eadf39e6330` |
| Polisher 1.1.4 | `243f2e57b973a4b943a3ea1d2844c4ba4c34bee7e8a12ec7eb97aeb0db3ba3cb` |

## 完整 diff scope

Hub：

- `src/extension-runtime.js`：RH-01，局部 try/catch 范围修正。
- `tests/release-hardening.test.mjs`：新增 9 个故障隔离/Storage 回归。
- `tests/integration/artifacts.lock.json`：仅两个产物 SHA-256。
- `docs/RELEASE-HARDENING-AUDIT.md`：本报告。

Registry：

- `src/app.js`：RH-02，已验证但失败的 callback 清除 handoff。
- `tests/release-hardening.test.mjs`：新增 3 个 OAuth 回归。

Polisher：没有 tracked 或非忽略 untracked 改动。三仓本地 build/测试输出按既有 ignore 规则保存，不提交。

READY FOR RELEASE CANDIDATE
