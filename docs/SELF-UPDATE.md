# Hub 第一代自更新

当前首个具备自更新能力的版本是 **0.2.1**。实现边界依据酒馆助手 **4.9.3** 与 SillyTavern **1.18.0** 的已审计结构；其他宿主结构不明时拒绝写入或保留“保存待确认”，不猜测内部字段。

## 支持范围与首次升级

只支持安装在酒馆助手**全局脚本**中的 Hub，包括其受支持的文件夹。角色脚本、预设脚本、未知树结构、重复 ID、多个 Hub 候选或无法确认实例时拒绝自动更新。酒馆助手 4.9.3 文件夹内是脚本数组；未知嵌套结构不会被强行展平写回。

发布 JSON 的固定 ID `e85cd9a3-6352-4b23-938a-6c94d826b4d3` 仅校验包身份。普通导入可能重新分配安装 ID，因此实际更新使用当前 iframe 正式 `getScriptId()`，不使用名称或发布 UUID 猜测用户条目。

旧 `0.2.0-alpha.4` 只有版本查询，没有更新代码。首次需要手动升级到 `0.2.1`，之后才能测试更新至 `0.2.2`：

1. 先保存正在编辑的内容、停止生成，导出旧 Hub 条目作为恢复材料。
2. 手动导入 `MieMie-Hub-0.2.1.json` 并放在全局脚本中，只保留一个 Hub 候选。单纯停用旧 Hub 仍可能留下重复候选，需核对后将旧条目移出脚本列表并保存其备份。
3. 如果旧 Hub `data` 含自定义信息，优先保留原条目并在助手编辑器内只替换下载 JSON 的 `content`，避免删除这些字段。
4. 不清空 localStorage、世界书、Polisher 设置、密钥或其他脚本数据。刷新后确认设置显示 `0.2.1`，再开始更新检查。

## 下载与校验

固定官方仓库为 `SheepSheepLab/MieMie-Hub`。版本检查使用包含 Pre-release 的公开 Release 列表，不要求登录或 Token。点击更新后，锁定目标 Release ID、Tag、版本，再从官方 API 的该 Release 记录取得唯一的附件：

- `MieMie-Hub-<version>.json`
- `MieMie-Hub-update.json`

`MieMie-Hub-update.json` 包含 `schemaVersion`、`productId: "miemie.hub"`、`version`、`tag`、`format: "tavern-helper-script"`、固定 `scriptId`、`asset.name`／`size`／`sha256` 和 `contentSha256`。地址由固定 GitHub API 的附件记录取得，不接受元数据指定任意第三方 URL，不解析 Release Notes 的自然语言 hash。

读取过程核对 GitHub Asset API 的 `digest`、实际字节数和 SHA-256。下载包还需通过 UTF-8／JSON、单脚本结构、产品／固定包 ID、版本标记、Tag 和 content hash 校验。结束下载后再次读取 Release，确认 Release／Asset ID、大小和 hash 没有变化，才进入本地写入阶段。验证期间不会执行下载代码。

元数据上限 64 KiB，Hub JSON 上限 16 MiB；元数据请求默认 15 秒，附件下载默认 60 秒。流式读取同时限制真实字节数，不仅检查响应头。版本检查、下载与校验可在 Hub teardown 时取消，重复点击共用当前操作。

GitHub 请求使用无凭据的 CORS fetch，不发送聊天、Polisher 配置、密钥或本地宿主请求头。二进制下载允许官方附件服务的 HTTPS 重定向，并检查最终地址。若浏览器不能读取响应，显示网络／CORS 失败，**不会安装未校验内容**。不使用 `no-cors`、第三方公共代理，不自动启用 SillyTavern Proxy，也不要求 GitHub Token。

浏览器能打开附件下载链接，不代表 JavaScript 能跨域读取附件字节。真实酒馆仍需验证完整链路，单元测试不能证明 GitHub CDN 的 CORS 策略适用于所有部署。

SHA-256 证明字节与发布记录一致，不证明发布账号未被入侵或代码绝对安全。

## 写入、重新加载与保存确认

所有网络操作与包校验完成后，调用正式 `updateScriptTreesWith()`，同步处理最新完整 Global Script Tree：再次确认当前实例和原 content 未变，用共用 `applyScriptUpdate()` 同时更新该实例的 `content` 与名称末尾版本号，返回完整树。

保留 `id`、用户自定义名称主体、`enabled`、`info`、`button`、`export_with`、`data`、文件夹位置、排序以及其他脚本。不用下载 JSON 的 `data: {}` 或其他默认元数据覆盖用户条目。助手列表直接显示 `Script.name`，没有单独的 version 字段。末尾旧版本（即使早已落后于当前代码）会替换为已校验的目标版本；没有版本后缀时追加目标版本。身份判断仍只依据内容中的构建标记。

Hub 主球位置、Extension 注册／启用偏好、时间线变量与世界书、Polisher 的 `meeme_translation_v1` 和 `meeme_translation_key_v1`、其他扩展数据均不属于此次写入目标。重新加载可能取消正在运行的扩展任务；未保存编辑与临时内存状态不保证跨重载保留。

三个阶段分别处理：

1. **写入 API 返回**：只确认宿主内存中的脚本内容与名称。
2. **新 iframe 加载**：新 Hub 完成 Core 初始化后接手更新确认。
3. **持久保存确认**：通过当前宿主同源 `/api/settings/get` 读回保存记录，核对同一实例 ID、目标 content hash 与同步后的名称，才显示“更新完成，已确认保存”。

旧 iframe 写入前仅向父页面 sessionStorage 保存小型交接记录 `miemie_hub_update_pending_v1`，包括当前实例、版本、Release／Asset ID、目标 hash、旧 content hash 和时间；不把完整 Hub 代码放入浏览器存储。新版启动时读取记录并确认实例、运行版本、代码与基础启动状态。无法确认时显示“更新保存状态待确认”，可以重新确认，不通过固定等待一秒伪称保存成功。

保存读回是 SillyTavern 1.18 的版本限定适配，不是酒馆助手通用 flush API。请求仅发往本地同源宿主；响应只在内存中提取所需脚本 ID、名称和内容，不记录或上传整份设置。不同宿主、保存错误、网络异常和并发修改都可能使确认失败，不能凭空标记完成。该方案没有跨浏览器页面的原子事务保证。

## 恢复与限制

真正写入前，Hub 会请求浏览器下载旧脚本恢复 JSON。**触发下载不保证文件已永久保存**，应检查浏览器下载结果；备份可能包含该脚本的自定义 `data`，应保存在本地，不上传公开仓库。

新版无法启动时，在酒馆助手中找到原实例，优先从恢复文件取出旧 `content` 和对应 `name`，恢复原条目的代码及显示版本，保留其他当前用户字段。直接导入备份通常会生成新安装 ID，不等同于原地恢复；不得通过清空其他脚本或整个浏览器存储来恢复 Hub。

交接记录包含 `previousContentSha256`：在有效记录期间，若重新启动的版本、安装实例及旧代码 hash 精确匹配，Hub 能识别“更新未生效或已恢复原版本”，清除该次交接并允许重新检查。记录异常、过期、实例不同或代码不符时保持待确认，需要手工核对；不能为了消除提示直接宣称成功。必要时仅处理已经核对过的 `miemie_hub_update_pending_v1` 交接记录，不删除用户业务存储。

第一代没有独立 Loader、IndexedDB A/B Core 或自动回滚。新代码完全不能启动时，应依赖宿主编辑器和恢复材料；自动保存确认也不代表所有功能在所有酒馆版本上都已验证。

## 对应模块

- `src/hub-update-check.js`：版本查询与目标 Release 选择。
- `src/hub-self-update.js`：下载、验证、交接与保存确认。
- `src/hub-script-host.js`：实例定位、结构边界、同步 content 与名称版本写入。
- `src/bootstrap.js`：当前 iframe API、恢复下载、sessionStorage、新实例接续。
- `src/hub-ui.js`：更新进度、失败、等待确认和重试操作。
- `tools/build.mjs`：严格版本、构建身份、ASCII 附件及机器更新元数据。

本文件记录Hub自更新边界。Hub0.3.0另有独立Extension Package和Registry模块，详见ECOSYSTEM.md；未来Loader/Core仍未实现。
# Hub 0.5.1 download transport

Hub Release metadata still comes from the fixed official GitHub API. If a binary
download fails due to browser CORS/network restrictions, the Hub can POST only
`releaseId` and `assetId` to the configured Registry `/api/hub/releases/asset`.
Registry 0.3.1 or later is required. The server fixes the repository to
`SheepSheepLab/MieMie-Hub`; clients cannot supply another repository or URL.

Both ends retain size, digest/SHA-256, product, version, script identity, content
hash and Release lock checks. No cookies, Discord sessions or Tavern credentials
are sent. Redirects, opaque responses, corruption, timeouts, cancellation and a
changed Registry configuration cannot bypass verification. Host writes, recovery
downloads, iframe handoff and persistence confirmation are unchanged.

Versions 0.4.3 and 0.5.0 do not contain this fallback. Users blocked by CORS must
manually import 0.5.1 once. Future versions can use the corrected download path.
Do not enable two Hub instances simultaneously.

`tests/browser-self-update/run.mjs` exercises native Chromium CORS and the real
Registry HTTP handler with isolated SQLite and a mocked GitHub upstream. Configure
`MIEMIE_REGISTRY_PROJECT`, `PLAYWRIGHT_MODULE` and, if needed,
`PLAYWRIGHT_BROWSERS_PATH`. It never changes real Tavern scripts.


## 0.6.0 架构迁移

0.5.1 可以沿用已实现的安全转发、原实例写入及保存回读流程升级到 0.6.0。正常包附带时间线；时间线业务数据不迁移也不清空。无时间线验收包与正常包同版本，需要手动恢复正常包，不能靠版本比较自动切换。旧 0.4.3 / 0.5.0 若仍受 CORS 阻断，可直接手动导入正常 0.6.0 一次。

## 0.6.1 补丁

0.6.0 可沿用原有更新流程升级至 0.6.1。下载与 hash 校验、同 Script ID 写入、保存回读及新实例确认保持不变；Timeline 随完整 Hub 包更新，用户数据与扩展 API 行为不变。旧版本 Release 不覆盖。

## 0.6.2 名称版本同步

Hub 自更新与 Managed Extension 更新共用 `src/script-update-fields.js`。保存回读同时检查内容和名称，不能仅凭新版代码已运行就宣称更新完成。备份保留完整旧脚本，不覆盖最新用户配置或其他脚本。

从旧更新器升级时，仍读取兼容的 schema 1 交接记录。只有有效期内的同实例、运行版本及目标内容 hash 全部匹配，且存在保存核验接口时，才补齐此次交接的名称版本并确认持久保存；没有交接记录的普通启动不会改名。新记录增加 `scriptFieldsVersion: 1`，新写入丢失名称时直接保留待确认，不自动修补掩盖失败；原版本仍能读取此记录并识别从备份恢复的旧内容。
