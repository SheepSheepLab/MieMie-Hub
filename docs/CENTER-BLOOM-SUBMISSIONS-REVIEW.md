# B 中心绽开与投稿模型 · 本地验收

日期：2026-09-29。基于已发布 Hub 0.8.0 / Registry 0.5.0；版本不变，未提交、推送、部署或发布。本报告描述本地候选，不能把同版本号的候选文件当作线上发行件。

## 实现范围

- B：同一个真实 Hub 主球与标题立即显示在蜂窝中心，标题不独立淡入；子球由中心错峰舒展，配合扩散波纹。收起恢复 0.8.0 的 440ms 路径，主球回 Dock 的同时子球向移动的主球收拢。使用现有 WAAPI 与集中 Motion 参数，支持 Reduced Motion、快速反转与资源清理。
- 蜂窝布局、图标尺寸、间距、滚动、Origin、主球所有权、Extension Runtime/API、Surface/Shortcut/Native Presentation 均未改。完整重开居中、Surface 返回保留滚动的既有行为保持。
- GitHub 投稿：必填 GitHub Repository URL，可选 Discord 发布帖；public 为默认，可单独选择 Guild 范围。选择受限且依据为空时预填发布帖，但允许分别编辑；读取资料展示 Package 检测结果，不以 Package 作为收录门槛；安装验证保持。
- 发现页简介从 15px 缩小一档至 14px（行高不变）；标题、按钮、链接保持原大小。
- Discord 投稿：只保留主原帖，不提供辅助仓库/发布帖，不显示范围选择器或额外依据输入。验证按钮在原帖旁，只描述服务器成员资格，保存仍由服务端验证。
- GitHub Catalog 底部为“GitHub 仓库：查看仓库”“Discord 发布帖：查看发布帖 / 暂无”。Discord 卡片删除重复来源链接区，保留投稿者、类型等信息和按产品类型决定的主操作。Web Tool 保留网站和原始来源操作。

## 最终分发规则

分发方式恢复为独立置灰选项框，不能手动操作；GitHub Tavern 初始显示“由 Registry 检测后确定”，检测中、成功和失败分别显示当前状态。值仍由 Registry 决定，数据库/DTO 继续保留该字段。

“读取 GitHub 资料”保留原名，移到仓库 URL 右侧。粘贴或编辑后离开 URL 输入框自动检测；变更 URL/来源/类型立即作废旧结果；重复 blur 合并，同一请求可复用手动读取，晚到的旧响应无法覆盖新结果。自动检测仅更新分发显示，不覆盖展示资料；手动读取保留预填且不覆盖请求期间新输入的内容。来源、类型、可见范围使用同主题菜单，支持选中标记、方向键、Home/End、Esc、Tab、外部点击/滚动/resize 清理。

| 来源 / 类型 | 服务端结果 | Catalog 主操作 |
|---|---|---|
| GitHub Tavern，验证 installable | managed_install | 安装 |
| GitHub Tavern，无/无效 Package，但仓库合法公开 | external_release | 前往 GitHub |
| Discord Tavern | external_release | 前往 Discord |
| Standalone | external_release | 作者发布页 |
| Web Tool | open_url | 打开网站 |

读取 GitHub 资料显示检测状态；无包显示“未检测到 Hub 安装包，将作为 GitHub 外部发布项目收录。”，允许提交，来源仍为 GitHub。新客户端不发送 distribution；旧客户端发送的合法枚举提示由服务器重新推导，无法伪造安装能力，Discord/non-Tavern 的 managed_install 仍拒绝。新建/编辑 GitHub Tavern 在服务端重新 inspect，不相信 preview 或投稿内容。Catalog 非安装条目直接链接 GitHub，不显示“检查安装兼容性”。

有效 Package 的全部身份、Release/Tag/Asset/API digest、内容/hash/结构校验及安装前重新检查未放宽。GitHub Language 不参与判断。Catalog 安全刷新机制保留，包括已验证缓存遇到不可用/无效 Release 时的保留策略与 Official identity 保护；允许的刷新同步更新 distribution，安装时仍重新检查作者现状。

## 服务端、迁移与兼容

- Discord create/PATCH 在服务端强制 discord_guild，Guild 使用既有正式 parser 从 sourceUrl 解析，visibilitySourceUrl=sourceUrl。旧客户端提交 public 也无法放宽；保存必须验证当前成员资格。不引入第二套 ACL。
- 实测未登录及非同 Guild 用户的目录列表隐藏 Discord 条目、详情返回 404；同 Guild 用户可见；退出该 Guild 后编辑失败。公共 GitHub 保持公开，受限 GitHub 沿用既有 ACL。
- schema 5 链接字段：source_type、source_url、discord_post_url、website_url。github_url/discord_url 不再持久化。
- 4→5 单事务：先严格验证历史 URL，复制 GitHub 辅助发布帖、保留主 source_url，Discord 辅助发布帖为 NULL 并规范为 Guild-only，再删除旧列。同时按已有服务端 github_json.compatibility 与来源/类型规范 distribution，不凭空生成 Package 能力。其他字段、账号、治理、审计、时间戳和 GitHub ACL 保持原值。非法 URL 全事务回滚；幂等与未来 schema 拒绝已验证。
- Workbench 只读统计：生产 schema 4，1 条 github/public、0 条 Discord。本轮没有迁移生产。隔离测试包含旧 Discord 记录，不能因生产暂无而省略迁移覆盖。
- DTO 保留派生 githubUrl/discordUrl，并新增 discordPostUrl。已发布 0.8.0 客户端的 API 契约、旧表单别名及 public Discord 请求已验证。新 Hub 优先用新字段，只有字段缺失时回退旧别名。
- GitHub Official identity 不包含辅助发布帖，改变/清空发布帖不会改变 Official 项目 key。Discord 主来源仍受保护；移除已废弃的 Discord 辅助仓库 identity 输入。Owner/Admin、Hold、并发修改保护、Package/Release/Hash 安全检查未弱化。
- 迁移及恢复步骤见 Registry docs/STORAGE.md；复制库迁移工具生成 v5 候选，逐列验证允许差异与 integrity/FK，源库保持 schema 4。旧程序不能打开 v5，部署回退必须使用已验证的旧 schema 快照。

## 验证结果

| 检查 | 结果 |
|---|---:|
| Hub 全量 | 346 PASS |
| Registry 全量（含治理、迁移、ACL、类型/分发安全） | 190 PASS |
| Hub / Polisher 严格实际产物集成 | 30 PASS |
| 生态安装 / 更新 / 卸载 / 双模式 | 16 PASS |
| 本轮 Hub 构建 ↔ Registry | 13 PASS |
| 已发布 Hub 0.8.0 Registry client ↔ Registry | 13 PASS |
| Admin Console HTTP / DOM | 11 PASS |
| Hub 与 Registry build | PASS |
| 重复 Hub build 字节一致 | PASS |
| Hub / Registry JS 语法 | 52 / 37 PASS |
| git diff --check / cached --check | PASS |

最初生态测试使用未配置 Registry 的 development 构建，离线提示断言失败；改用既有正式构建参数重跑后 16/16 通过，没有修改测试预期或 Core 代码绕过。首次 legacy artifact hash 不匹配时按既有检查拒绝；最终使用精确已发布 1.1.4 字节。集成使用临时本地 lock 固定新候选 SHA，未修改 tracked 发行 lock。

最终 Hub SHA-256：`3cde0641f3e5ac91ba53cd9b34315fc5433b4941e713d571917160fdc0daf6a6`。
Polisher 1.2.0：`30cd3fe0d31b8d9e3d81a7f89a4dff3dcb6eb93e31ba488115d1451a662e4779`，源码和产物未修改。

浏览器加载真实 Hub 构建，以模拟宿主/目录测试桌面及 390px 手机宽度：卡片无水平溢出，简介计算字号 14px；无 Package 时来源仍为 GitHub、提交按钮启用、没有手动分发选择，非安装卡片为“前往 GitHub”；GitHub/Discord 字段切换、原帖验证反馈、卡片链接有无正确；单主球与波纹可见。截图和机器报告位于忽略目录 test-results/center-bloom/。浏览器工具的 MutationObserver.observe 加载日志也在无任何应用脚本的空 srcdoc iframe 对照页复现，不归因为 Hub 回归；未为此修改 Runtime。本地预览不提供真实 Discord 登录，验证结果有明确模拟标记；真实 ACL 由独立 Registry HTTP 测试覆盖。

仍需用户在实际酒馆检查：波纹亮度与绽开/吸回节奏、少量/大量入口、滚动后收起、触屏帧率、实际宿主主题影响。浏览器截图不替代实机动画验收。

## 验收入口

- 本地页面：运行中的 http://127.0.0.1:5174/?timeline=1 （真实 UI，模拟数据）。
- 真实功能测试副本：build/MieMie-Hub-Bloom-Review.json，与当前本地 build/MieMie-Hub-0.8.0.json 字节相同，仅文件名区分。备份并停用原 Hub 后在测试酒馆导入；不可与原 Hub 同时运行。线上 Registry 仍是旧模型，完整新投稿规则应配合本地 schema 5 服务验收，不要为体验新规则直接迁移生产。
- 可重复构建：MIEMIE_BUILD_MODE=production MIEMIE_DEFAULT_REGISTRY_URL=https://registry.sheepsheeplab.com npm run build。构建本身不部署。

## 修改文件

Hub：
- assets/hub-panels.css
- assets/launcher.css
- src/motion-tuning.js
- src/honeycomb-launcher.js
- src/extension-center.js
- src/submission-select.js
- tests/honeycomb-launcher.test.mjs
- tests/extension-center.test.mjs
- tests/submission-select.test.mjs
- tools/build.mjs
- tests/browser-final-ui/index.html
- docs/FINAL-UI.md
- docs/CENTER-BLOOM-SUBMISSIONS-REVIEW.md

Registry：
- src/governance.js
- src/validation.js
- src/store.js
- src/app.js
- src/extension-identity.js
- tools/migrate-verified.mjs
- tests/submission-model-v5.test.mjs
- tests/product-boundary.test.mjs
- tests/remote.test.mjs
- tests/project-links.test.mjs
- tests/registry.test.mjs
- tests/governance.test.mjs
- tests/extension-identity.test.mjs
- tests/hub-contract.mjs
- docs/GOVERNANCE.md
- docs/API.md
- docs/STORAGE.md

Architecture Freeze Break Required：NO。变更限于 Launcher Presentation、投稿/Catalog UX 和投稿数据模型；Hub Core 架构不变。保持未提交工作树，等待验收，不进行发版。
