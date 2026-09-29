# MieMie Ecosystem Final Review — 2026-09-29

状态：FINAL REVIEW PASS — READY FOR MANUAL VALIDATION

范围：正式发布 Hub 0.8.0 / Polisher 1.2.0 / Registry 0.5.0 后的当前未提交迭代。版本源保持原值；本报告不是新版 Release 或生产验收证明。

## 1. 本轮审查结论

- Architecture Freeze Break Required：**NO**。Launcher Presentation、投稿领域模型和展示文案变更没有改变 Hub Runtime、Surface Controller、Origin、Shortcut API、单实例或 Package 安装安全边界。
- Hub 动画沿用已确认的 **B 中心绽开展开 + 0.8.0 原 Dock 收起**。附件中笼统的“展开／收起”不用于覆盖此前明确的“新展开、旧收起”。主图标与标题直接出现，子图标从中心展开并伴随波纹；收起时子图标汇入移动的主球，主球回原 Dock。
- 当前未发现代码层面的发布 BLOCKER。仍须完成用户真实 Tavern／手机实机验收，之后才能决定版本并进入发布 Gate。
- 未 Commit、Push、Tag、Release、Deploy 或运行生产数据库迁移；没有增加宿主适配版本字段。

## 2. Hub Launcher 技术审查

变化限于 honeycomb-launcher、内部 motion tuning 和 Launcher CSS；布局、ownership、Surface、Extension API 与业务 Runtime 未改。WAAPI flight 仍由现有 generation/cancel 路径清理，新增波纹在 dispose 时移除。resize 取消当前 flight 并重算位置；Reduced Motion 直接完成状态。

测试覆盖重复／中途开关、resize、清理、唯一主球、中心标题即时可见、完整收起后重新居中。Surface 返回保留 scroll 的测试和实际构建集成仍通过。关闭路径的时长、quintic 曲线、moving-Hub 汇合和 Dock 目标保留；不继续审美调参。

## 3. Submission UX 与 Catalog

GitHub 表单：Repository URL 必填，右侧保持“读取 GitHub 资料”；粘贴／失焦触发 Registry 检测，换 URL、来源或产品类型清除旧结果。请求序号防止迟到结果覆盖新 URL；退出／换页使待处理结果失效。自动检测只更新分发状态；手动读取可预填 manifest 中的名称、作者、简介、Icon，期间用户新编辑的字段不被覆盖。没有可用 manifest 展示资料时仍可手填并收录。

分发方式是独立、变暗、不可编辑的选择框。GitHub Tavern 初始文案为“由 Registry 检测后确定”；检测中、失败、最终结果分别显示。没有 Package 不是提交错误。提交时服务端重新 inspect，UI 状态不授予安装权限。

GitHub 可选 Discord 发布帖独立于 visibility；公开和 Guild-only 仍可选择。选 Guild-only 时可以预填发布帖作为范围依据，但服务端分别保存两种语义。

Discord 表单：仅主原帖 URL 和成员资格验证，没有辅助 GitHub、额外发布帖或可见范围 selector。准确说明只验证 Guild 成员资格，不验证作者身份／帖子内容。

来源、产品类型、GitHub visibility 使用局部主题菜单，保留 native form value；键盘方向键、Home/End、ESC、Tab 和外部点击关闭均有测试。菜单向上展开以 bottom 定位，避免高度估计产生间隔。桌面和 390×844 浏览器检查无横向溢出，选项有效高度至少 44px。

Catalog：GitHub 底部显示仓库和可选 Discord 发布帖；可安装条目显示安装／已安装，普通外部 Tavern 显示“前往 GitHub”。Discord 卡片不再重复底部链接；Tavern CTA 为“前往 Discord”，Standalone 为作者发布页，Web 为网站。发现页简介字号由 15px 调为 14px。独立手动 GitHub 安装预览入口保留，普通 Catalog 卡片不再以“检查安装兼容性”作为长期 CTA。

## 4. Distribution 与 Package 安全

| Source / Type | Registry 检测 | canonical distribution |
| --- | --- | --- |
| GitHub / Tavern | installable Package | managed_install |
| GitHub / Tavern | 无 Package／无效 Package，仓库合法公开 | external_release |
| Discord / Tavern | 成员验证 | external_release |
| 任意合法来源 / Standalone | 类型声明 | external_release |
| 任意合法来源 / Web | 合法网站 | open_url |

投稿 distribution 是兼容 hint，不是权限。Registry 在读取真实 GitHub 结果后 canonicalize，再由 governance 独立验证，store 写入也按相同规则推导。Discord／非 Tavern 伪造 managed_install 被拒绝；GitHub Tavern 伪造该 hint 不会提升无 Package 项目的能力。

GitHub Language 使用：**NO**。语言与产品类型／安装能力无关，已有专门测试。

Release、tag、asset、API digest、manifest、productId、scriptId、version、repository identity、JSON 结构、content identity、SHA-256 和安装时重新 inspect 均保持原标准。Hub 点击安装会重新检查作者源，且核对 Catalog 已知 Extension ID；缓存不是安装权威。损坏／改换包的生态与合约测试仍拒绝写入。

保留既有 Catalog cache 策略：后台 refresh 遇到之前 installable、当前 external 的结果时不会立刻覆写旧 verified cache；这可能暂时保留安装 CTA，但安装时重新检查必然拒绝失效包。此次未改此策略或降低安全性；新建／编辑 Tavern 总是 fresh inspect，不能由投稿预览缓存授予能力。

## 5. Discord ACL

服务端将所有 Discord source 强制为 discord_guild；Guild 和 visibilitySourceUrl 均来自主 sourceUrl。POST 声明 public、PATCH 尝试 public 均不能绕过。提交者必须是成员；匿名／非成员的 list、search、counts、details 不泄露记录。会话有效但成员资格丢失也会拒绝。辅助 GitHub Discord 发布帖不触发 ACL，公开 GitHub 项目仍可匿名发现。

## 6. Registry schema 5 与迁移

主模型保留 source_type、source_url、website_url，新增 discord_post_url，移除数据库冗余 github_url／discord_url。GitHub source_url 是仓库、discord_post_url 是可选发布帖；Discord source_url 是主原帖、discord_post_url 为 null。原有身份、owner／submitter、治理、分类、保护、审核、security hold、缓存、时间戳和 retention 字段不重建。

v4→v5 在单个事务内验证旧链接、复制可选发布帖、规范 Discord ACL 和 distribution、删除冗余列。非法历史链接会整体回滚；重复打开不重复迁移；未来 schema 拒绝打开。

隔离迁移测试覆盖公共／受限 GitHub、无 Package GitHub、旧 public Discord，以及代表当前产品身份的 miemie.hub / miemie.polisher 官方 fixture。后者不是生产数据库导出。增加了不同 owner／submitter、非空头像／Session、治理 bootstrap、角色／audit、保护、hold、隐藏／下架和 retention 数据。所有允许变化之外的列和相关表逐项比较；官方 GitHub identity key 不变。

7 项 submission-model-v5 测试通过，包含 integrity_check=ok、foreign_key_check 为空、事务回滚、幂等／future-schema guard、离线 candidate 工具验证及源库不变。相关 v2/v3 migration、governance 也在 Registry 全量测试内通过。生产数据库本轮未读取、未迁移。

发布操作仍需正式备份、备份完整性、当前生产副本 dry run 和回滚计划。旧 Registry 二进制不可打开 schema 5；回滚应配套升级前数据库快照，不能仅切旧代码。

## 7. Hub 0.8.0 与 Official Identity

DTO 派生兼容 githubUrl／discordUrl，同时提供 discordPostUrl；旧输入别名在边界处理，不重复存储。以已发布 Hub commit 的原始 registry-client.js 运行新 Registry 合约，13 项通过，其 SHA-256 为 fe4d6c1a0cacccf98c853009730c5937f4472c92c46f91ed9396396757de76ab；当前 Hub 构建合约另 13 项通过。

兼容不代表恢复已废止的产品语义：旧客户端 Discord public 声明会被收紧为 Guild-only，旧辅助 GitHub 链接请求会明确拒绝。旧客户端 GitHub／Discord 基本登录、目录、投稿／编辑、权限流程可用。

GitHub 可选 Discord 发布帖不纳入 projectIdentityKey；修改新字段或旧 alias 均不触发 official mismatch。真正的 source type／canonical repository／manifest ID／product type／website 等身份约束保留。Discord 主 sourceUrl 仍是核心身份。Official 修改和后台 refresh 继续使用同一身份保护、并发与审计路径。

## 8. Polisher 标题

唯一实现变化：polisher.js 共享面板标题从 `${name} - ${version}` 改为 `${name} ${version}`。当前显示“咩咩润色工具 1.2.0”。脚本列表原本已经是这个格式。Product Identity、manifest、协议 ID、storage、Runtime、Native Floating Presentation 和面板结构均未改。

factory 与 Standalone artifact 测试同步预期；真实 Hub／Polisher artifact 集成增加 Honeycomb 和 Shortcut 标题断言。Standalone、Hub Runtime、Hub Shortcut 共用同一标题实现，三种路径通过。浏览器实际独立面板标题已截图核对。

## 9. 本次重新执行的测试

| Suite | PASS | FAIL | SKIP |
| --- | ---: | ---: | ---: |
| Hub full | 346 | 0 | 0 |
| Polisher full | 42 | 0 | 0 |
| Registry full（含 governance / migration） | 190 | 0 | 0 |
| Hub / Polisher artifact integration | 30 | 0 | 0 |
| Ecosystem install / update / uninstall | 16 | 0 | 0 |
| 当前 Hub ↔ Registry | 13 | 0 | 0 |
| 已发布 Hub 0.8.0 client ↔ Registry | 13 | 0 | 0 |
| Admin Console HTTP / DOM | 11 | 0 | 0 |
| Browser Package CORS | 8 | 0 | 0 |
| Browser OAuth / ACL（sandbox iframe、断 opener） | 8 | 0 | 0 |
| Browser Hub self-update CORS | 6 | 0 | 0 |
| **合计** | **683** | **0** | **0** |

迁移 7 项属于 Registry 190 项，不重复累计。Browser 测试使用真实浏览器与隔离本机 HTTP；Discord／GitHub upstream 为明确 fixture，不能代替真实 OAuth／Tavern 手动验收。

初跑发现并修复两类过时测试夹具：OAuth 的“公开项目”原用 Discord，与新 Guild-only 规则冲突；现改为公开 GitHub fixture，并新增 Discord public hint 强制收紧断言。旧 self-update 浏览器夹具漏了正式脚本 button／export_with 字段和同步写入返回值；补齐测试数据／返回后 6 路径通过，未修改业务安全校验。自动浏览器运行器初次缺失，补齐临时运行器后完成重跑。

## 10. Build 与静态检查

- Hub production-configured 本地 build 通过，仅嵌入原有公开 Registry URL；没有实际访问生产。Polisher build、Registry source/version build 通过。
- Hub 与 Polisher 分别重复构建，字节哈希一致。
- 全部源码／测试／工具 JS/MJS syntax：Hub 62、Polisher 23、Registry 37 文件，共 122 文件通过。
- 三仓 git diff --check 和 git diff --cached --check 通过。
- 当前变更文件的个人路径／常见真实凭据模式扫描未命中；测试 secret 均为显式 fixture。没有修改已发布 artifact lock；此次组合验证使用临时锁定文件校验新产物。

本地导入包（位于 Hub build，已忽略，不是已发布资产）：

| 文件 | 内部版本 | SHA-256 |
| --- | --- | --- |
| build/MieMie-Hub-Final-Review.json | 0.8.0 | 3cde0641f3e5ac91ba53cd9b34315fc5433b4941e713d571917160fdc0daf6a6 |
| build/MieMie-Polisher-Final-Review.json | 1.2.0 | 9a9c78a3820b0bd9f43a9007e7885cbf14aee98ef689f463205e469e9c60f44c |

相同内部版本仅用于本轮手动导入验证，不代表覆盖旧 Release，也不能作为正式 updater 新版本发布。

## 11. 风险与版本建议

| 等级 | 结论／后续 |
| --- | --- |
| BLOCKER | 未发现未解决代码阻断；本报告不授权发布。 |
| HIGH | 无未解决高风险缺陷。正式 schema 5 发布必须完成当时生产快照的备份／副本迁移／回滚 Gate。 |
| MEDIUM | Registry 旧服务与 schema 5 不能混用；旧 Discord 公共语义有意收紧，发布说明需明确。GitHub 预览有限频，连续改地址可能提示重试，不能宣称已检测成功。 |
| LOW | 实际 Tavern、手机 Safari 的动画手感、长文案菜单和标题仍需用户验收。浏览器工具在 srcdoc fixture 上有既知 MutationObserver 注入异常，之前在无应用的空 iframe 也可复现；实际 UI 与隔离浏览器功能测试可用，未据此改业务。 |
| POST-RELEASE | 观察 GitHub preview 频率、外部项目比例和 cache CTA 体验；不在本轮扩架构或放宽 Package。 |

推荐 Hub **0.8.1**：Presentation / Submission / Catalog 非 Runtime breaking 调整。Polisher **1.2.1**：单行正式标题修正。Registry **0.6.0**：已真实包含 schema 4→5、投稿主／辅助来源模型、ACL 和 canonical distribution 语义演进，超过单纯 patch；不建议机械 0.5.1。当前三仓版本未升。

## 12. 修改文件清单

本轮累计未提交文件（包括先前实现和本次 Review 补充）：

**Hub**：assets/hub-panels.css；assets/launcher.css；docs/FINAL-UI.md；docs/CENTER-BLOOM-SUBMISSIONS-REVIEW.md；docs/ECOSYSTEM-FINAL-REVIEW.md；src/extension-center.js；src/honeycomb-launcher.js；src/motion-tuning.js；src/submission-select.js；tests/browser-final-ui/index.html；tests/browser-self-update/run.mjs；tests/extension-center.test.mjs；tests/honeycomb-launcher.test.mjs；tests/integration/host-fixture.js；tests/submission-select.test.mjs；tools/build.mjs。

**Polisher**：polisher.js；tests/factory.test.mjs；tests/standalone-artifact.test.mjs。

**Registry**：docs/API.md；docs/GOVERNANCE.md；docs/STORAGE.md；src/app.js；src/extension-identity.js；src/governance.js；src/store.js；src/validation.js；tests/browser-oauth.mjs；tests/extension-identity.test.mjs；tests/governance.test.mjs；tests/hub-contract.mjs；tests/product-boundary.test.mjs；tests/project-links.test.mjs；tests/registry.test.mjs；tests/remote.test.mjs；tests/submission-model-v5.test.mjs；tools/migrate-verified.mjs。

本次 Review 新增实际产品修改只有 Polisher 标题；另补充标题断言、迁移 fixture、两处过时浏览器夹具、迁移工具说明注释和本报告。未新增功能或更改 Native Motion。

下一步仅用户手动验收：新展开／旧收起、完整重开居中与 Surface 返回 scroll、三种 Polisher 入口标题、URL 自动检测／换地址防过期结果、自定义菜单和手机布局。未以自动化替代真实设备观感结论。
