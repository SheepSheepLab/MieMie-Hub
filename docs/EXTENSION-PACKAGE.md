# MieMie GitHub Extension Package v1

这是一份机器安装兼容规范，不是安全审核或作者认证。社区作者保留软件、仓库和 Release 的所有权与维护权；Registry 只保存目录元数据及投稿身份，不镜像软件文件。未适配本规范的公开 GitHub 项目仍可收录，按钮显示“查看 GitHub”；Discord 项目只跳转作者原帖，不保存附件地址，不自动安装。

## 最小发布要求

作者无需采用 MieMie 的源码目录结构。公开 GitHub Repository 的每个可安装 Release 提供：

1. Tag `vMAJOR.MINOR.PATCH`，例如 `v1.2.3`；允许将 Release 标记为 Pre-release，但版本本身没有后缀。
2. 一个 ASCII 文件名的酒馆助手单脚本 JSON，最大 16 MiB。
3. `MieMie-Extension-update.json`，最大 64 KiB。
4. GitHub Release Asset API 为以上两个文件提供 `sha256:<hex>` digest。缺失 digest 时拒绝安装。

下载来自作者自己仓库的官方 GitHub API/Release，不接受机器元数据中另行指定的任意下载 URL。最高有效三段式 SemVer Release 作为当前候选；忽略 draft 和无效 tag，包含 Pre-release。第一版最多扫描 1,000 个 Release，超出时失败而不猜测。最新版缺少机器元数据时按外部项目处理，不默默安装旧版。

## Manifest

以下 `Development Fixture` 是示例，不代表真实社区作者或项目：

```json
{
  "schemaVersion": 1,
  "apiVersion": 1,
  "id": "example.background-helper",
  "name": "Development Fixture",
  "version": "1.2.3",
  "author": "Example Author",
  "description": "Example only; not a real community submission.",
  "entry": "extension.js",
  "repository": "https://github.com/ExampleAuthor/ExampleRepository",
  "homepage": "https://github.com/ExampleAuthor/ExampleRepository",
  "license": "MIT",
  "icon": "assets/icon.png",
  "hubApi": {"min": 1, "max": 1}
}
```

必填：schemaVersion、apiVersion、稳定 id、name、version、author、description、entry、repository、license。`entry` 说明作者入口，第一版实际执行的是发布 JSON 中已经构建的完整 `content`，不会从元数据动态 import。`hubApi` 可选，若提供则须包含 API v1。仓库和作者不必使用 MieMie 品牌视觉或 GPL；作者声明自身许可证。

`id` 使用小写字母/数字开头、其余小写字母/数字/点/下划线/短横线，共 2～80 字符；名称最多 80 字符。`contributes.launcher` 若提供则标题为 1～60 字符，`launcher.icon` 仍是最多 16 字符的短文本/emoji，图片使用顶层 `icon`，与 Runtime v1 既有校验一致。

`icon`、`homepage` 和 `contributes.launcher` 均可选。没有 Launcher 的后台 Extension 仍可安装、启停和卸载。不要求 `open()`；Runtime 单独处理无效 Launcher。`icon` 可使用 HTTPS URL 或指向固定 Release tag 对应源码的相对路径，不使用 `javascript:`、`data:`、上级目录或协议相对 URL。Hub 按 Manifest → Catalog → 默认图标选择资源，并使用统一圆形容器；不猜测仓库图片。

## 构建身份行

单脚本 JSON 的 `content` 第一行必须是：

```text
// MieMie-Extension-Build: {"schemaVersion":1,"productId":"example.background-helper","version":"1.2.3","scriptId":"author-fixed-export-uuid","repository":"https://github.com/ExampleAuthor/ExampleRepository"}
```

后续内容是完整可运行脚本。JSON 的固定 `id` 等于 `scriptId`，用于校验包身份。Hub 安装时生成新的安装实例 ID；升级时保留当前实例 ID，不能根据脚本显示名判断身份。产品 ID 不得为 `miemie.hub`，也不得使用 Hub 固定包 ID。身份行必须与 Manifest、更新元数据及 Release 一致。

## 机器更新元数据

```json
{
  "schemaVersion": 1,
  "format": "tavern-helper-script",
  "productId": "example.background-helper",
  "version": "1.2.3",
  "tag": "v1.2.3",
  "scriptId": "author-fixed-export-uuid",
  "manifest": {},
  "asset": {
    "name": "Example-Extension-1.2.3.json",
    "size": 12345,
    "sha256": "<64 lowercase hexadecimal characters>"
  },
  "contentSha256": "<64 lowercase hexadecimal characters>"
}
```

`manifest` 填写上方完整 Manifest，不能实际使用空对象。`asset.sha256` 对最终上传 JSON 原始字节计算，`contentSha256` 对 JSON 解析后 `content` 字符串的 UTF-8 字节计算。以上占位值不是有效发行包。不得把下载 URL 放进元数据；来源只能来自指定作者仓库的 Release API。元数据只列声明字段，未知顶层字段会拒绝。

包采用酒馆助手标准 `type: "script"` 对象，包含 `enabled/name/id/content/info/button/data/export_with`。公开包的 `data` 必须为空对象，不接受携带用户设置的发行包。`button` 和 `export_with` 也按酒馆助手 4.9.3 已审计结构校验。

## 安装与更新

Hub 验证仓库为公开、Release ID、tag、Asset ID、上传状态、文件名、大小、API digest、机器元数据、JSON、身份、Manifest 和两层 SHA-256。下载前锁定候选，写入前再次查询 Release，发生任何变化则拒绝。

更新在所有下载及校验通过后、写入前请求导出包含旧 `content` 和当前脚本 `data` 的恢复 JSON；不以触发下载冒充已永久保存。请保留该文件。作者新版代码若在启动时出错，第一版没有自动回滚，需手工恢复；网络/Hash/身份校验失败不会覆盖旧代码。

所有下载及校验完成后，调用正式全局 `updateScriptTreesWith()`；同步 updater 只新增一个脚本或替换目标脚本 `content` 并同步名称末尾版本号。更新不替换目标 `id/enabled/info/button/export_with/data`，也不改变文件夹、排序、其他脚本或其他 Extension 的数据。当前内容被用户编辑或存在重复产品 ID 时拒绝。当前宿主只支持一层脚本文件夹，未知树字段/嵌套文件夹被安全拒绝，避免 schema 丢弃用户数据。

第一版仅管理全局脚本。物理停用/启用通过正式 API 修改目标 `enabled`；禁用文件夹须先由用户启用。物理卸载会移除目标脚本条目和其 `data`，确认删除后直接卸载，不生成备份。确认期间脚本字段变化会中止删除。脚本之外的 localStorage、世界书和其他 Extension 数据不会清理。仅存在于 Runtime 的临时扩展仍只能“注销”，不能冒充物理卸载。

同步 API 返回仅确认当前内存树写入，不等于服务器已经持久保存；安装与启停返回 `persistence: "unconfirmed"`；在线更新必须经过下方的保存及运行确认，请保留恢复文件并通过刷新验证宿主保存结果。宿主负责启动/停止脚本 iframe，Hub Runtime 仍负责原生命周期清理；管理器不会自行执行下载代码。更新开始前建议停止该扩展正在进行的工作。

## 旧版 Polisher

官方已公开的 Polisher 1.0.1 无标准身份行。只认可其完整 `content` SHA-256：

```text
ec6266a8cb4038dadf20c357ef1acb9b7d8239036467c8d13e6ec98ed3a000f4
```

该白名单绑定 `miemie.polisher`、固定发布 UUID `4dd658f1-9d4b-4f74-bba8-305c4ef2a9c8` 及 `SheepSheepLab/MieMie-Polisher`。安装实例可被宿主分配不同 ID，脚本可改名；修改过内容的旧副本不按名字猜测身份。旧 1.0.1 Release 不补写或重发，之后的标准包可以原地升级它。

## 网络与安全边界

公开读取不要求 Token，不发送聊天、设置、API Key、宿主 Cookie 或 Authorization。查询/元数据默认 15 秒，脚本附件默认 60 秒；流式限制字节数。teardown 取消请求，重复写操作拒绝并行。

浏览器使用正常 CORS，从 GitHub API 下载附件，并仅接受官方 GitHub/CDN 重定向。浏览器 CORS 阻止读取、超时或 digest 缺失时失败，不使用公共代理、`no-cors`、Token 或未校验安装。自动测试验证这些失败路径，不能替代真实酒馆网络测试。

Hash 只验证完整性和一致性，不证明作者身份、代码善意或安全。安装脚本拥有酒馆助手赋予的宿主能力；MVP 不提供代码沙盒。Catalog 上架、可安装状态及 Discord 投稿身份都不是官方审核安全或原作者认证。作者主动下架仅影响发现和新安装，不删除用户本地代码；已安装用户仍可从其原作者 GitHub 检查更新。

## 更新完成的确认

更新同时写入原全局脚本的 content 和名称末尾版本号，保留实例 ID、用户自定义名称主体、data、启用状态和文件夹位置。与 Hub 自更新共用同一字段写入函数；名称没有版本时追加，有旧版本时替换（无需与当前运行版本一致）。名称只用于展示，安装版本与身份仍来自严格校验的构建标记。

写入前确认内存内容及名称与 SillyTavern 服务器已保存记录一致。写入后重新读取宿主树和同源保存接口，只有实例 ID、完整内容与目标包一致，且保存后的名称与写入目标一致，且原本运行中的原生 Extension 已注册目标版本，才显示更新完成。保存延迟期间等待确认；超时、拒绝保存或内容不一致均不宣称成功。保存版本与运行版本不一致时分别显示，不自动刷新、不回滚覆盖并发编辑。没有保存核验接口时拒绝写入更新。宿主设置只在本机同源接口读取，不发送给 GitHub 或 Registry。
