# Extension Ecosystem

当前正式基线：Hub **0.8.2**，Production Registry **0.6.1**；各项目独立维护依赖、构建、测试与版本。开发适配从 [Developer Guide](EXTENSION-DEVELOPER-GUIDE.md) 开始。Registry是可选在线目录服务，不是Core启动依赖，不托管社区软件包。目录失效不会停用已安装代码。

## 社区作者的三种参与方式

1. **普通投稿／外部项目**：公开 GitHub 项目填写 Repository，无需改业务或 UI，缺少机器包时跳转作者 GitHub。Discord 作品填写作者、名称、简介和原帖链接，只跳转原帖，不自动读取或永久缓存附件。
2. **GitHub Managed Package**：酒馆扩展在作者自己的公开 Release 提供标准 [Package v1](EXTENSION-PACKAGE.md)，通过校验后由 Hub 安装、更新和物理卸载。仓库布局不受要求。
3. **Hub-native Runtime Integration**：通过 [Extension API v1](EXTENSION-API.md) 接入生命周期，并按需选择蜂窝 Launcher、Surface 和外部 Shortcut；这是运行期协作，不会自动产生机器安装包。

三种路径可以组合。**能被 Catalog 收录 ≠ 支持 Managed Install；Runtime Compatibility ≠ Managed Package Compatibility。** Launcher 和双模式可选，后台 Extension 无需 `open()`。

## 来源、产品类型与分发

Source（GitHub／Discord）、Product Type、Distribution、Platforms 和 Visibility 分别表达不同信息。分发方式由 Registry 根据类型、来源和 GitHub 包检测结果确定，不由作者自报“兼容”获得安装资格。

| Product Type | Distribution | 用户操作 |
| --- | --- | --- |
| `tavern_extension` | GitHub 包检测兼容时为 `managed_install`，否则为 `external_release` | 有效 Package 才能安装；其他项目跳转作者 GitHub 或 Discord 原帖 |
| `standalone_app` | `external_release` | 前往作者发布入口；Hub 不执行 EXE／APK／DMG |
| `web_tool` | `open_url` | 打开作者提供的 HTTPS 网站 |

`external_release` 表示外部获取入口，不承诺 Hub 安装、更新或卸载。GitHub 与 Discord 是来源，不等于产品类型；Discord 附件不参与 Managed Install。

所有代码和文件仍由作者维护，MieMie不取得社区作品所有权。软件许可证在Manifest声明并由作者负责；MieMie官方项目使用GPL-3.0-or-later并单独声明官方视觉资产。

## 目录与身份

扩展中心三个分页：发现永远是普通用户视角；已安装管理本机实例；我的提供投稿和管理；登录和账号状态常驻标题栏右上角。Author是作品作者文本；Submitter是Discord OAuth确认的投稿者，不等于经过认证的作者。

Registry仅使用Discord `identify guilds`（不读取消息），内部以不可变Snowflake绑定所有权，重新登录同步Display Name/Username/Avatar。公开资料不返回用户ID、邮箱、OAuth Token、Guild 列表或管理员名单。即使Display Name同名也不能管理别人的投稿。

OAuth 使用弹窗进行 Discord 授权；当前 `poll-v1` 交接通过 `/api/auth/complete` 轮询完成，以原 Origin、requestId 和 PKCE verifier 绑定一次性结果，不依赖弹窗消息或第三方 Cookie。旧消息／exchange 路径仅用于兼容旧服务。OAuth Token永远留在服务器且不持久保存。Hub Session只在内存，换Registry、注销或Hub重载后需重新登录。会话过期或退出时立即清除已显示的受限目录，旧请求不能将私有卡片重新放回页面。发现使用可选的 Registry Session，由服务器过滤权限；浏览器不自行判断 Guild Membership。

目录只来自用户主动投稿；读取 GitHub Manifest 不会自动创建记录，官方 Polisher 也必须走同一条登录、预填、确认投稿路径。投稿成功默认上架，不代表安全审核、作者认证或官方推荐。投稿者只能编辑自己的信息，不能改变owner。更改来源时服务器重新验证，不沿用旧仓库版本/hash。管理员使用同一 Discord 身份登录，权限由服务端持久角色及 Owner 规则决定，治理操作位于 Registry 独立 `/admin`；环境变量旧管理员白名单仅用于一次性导入，不是日常角色管理入口。不存在另一套账号密码。

下架是owner_status=unlisted，不物理删记录；管理员moderation另行记录hidden/unlisted和原因。管理员恢复不会替用户撤销主动下架。封禁阻止继续投稿/编辑/重新上架，后台有审计记录。

## 服务器限定可见

投稿默认 `visibility=public`。选择 `discord_guild` 时，Discord 来源使用原帖链接，GitHub 来源另外填写 `visibilitySourceUrl`（Discord 社区帖子/消息链接）。服务端解析不可变 Guild ID 并确认投稿者本人也是成员，不接受客户端直接传 Guild ID。修改原帖、来源或可见范围会重新校验；Hub 不保存服务器列表。

未登录、非成员或无法确认成员资格时，服务端不返回受限作品；列表、详情、搜索、分页计数使用相同权限过滤。作者/投稿者严格分开，成员限定不是作者认证或代码安全审核。Catalog ACL 只限制目录信息，不会让一个公开 GitHub Repository 变成私有仓库。

## Registry离线与下架边界

Catalog下架只影响发现及Catalog新安装，不远程删除、禁用或重写已安装代码。已安装Extension仍可从原来记录的作者GitHub检查更新；管理员隐藏目前也不充当远程kill switch。新的来源URL不会改动本机既有来源绑定。直接输入作者GitHub获取是用户独立选择，不冒充目录仍上架。

Catalog 保存 GitHub 检测快照，投稿／编辑及目录读取时的有界刷新会更新它；这不保证每次展示都实时对应作者最新 Release。安装／更新仍重新读取作者 Release 并独立校验。Registry不可用时发现/我的提示错误，本地Runtime、时间线、Polisher和已安装管理照常使用。

## 安装与信任

Hub仅管理可识别的全局脚本及支持的文件夹。角色/预设位置、重复ID、多候选、未知宿主字段时安全拒绝。安装前全部网络、metadata/Manifest、双hash、版本和身份校验通过后才同步写树；不会执行未验证下载代码。更新同时写入 content 与名称末尾版本号，保留原实例 ID、自定义名称主体和 data，其他脚本不变；准确写入边界以 [Package v1](EXTENSION-PACKAGE.md) 为准。

Package已写入不代表作者代码运行成功或服务器已保存。列表同时显示物理版本和Runtime状态；更新前导出恢复文件，运行失败需用旧content手工恢复。物理卸载只需确认删除，不生成备份；它会移除该条目data，但不清空工具自己的外部存储。不要把Runtime注销和真正删除混用。

GitHub API 与 Release 是权威来源。Extension 附件直连被 CORS 拦截时，可以通过内置官方服务（或开发者显式覆盖的 Registry）受限转发：只接受仓库、Release ID、Asset ID，并在服务器验证 Manifest／digest，不接受任意 URL、不持久保存附件。Hub 再独立校验原始字节。Hub 客户端不要求用户提供 GitHub Token，也不向 Relay 发送 Registry Session 或宿主凭据；Registry 0.6.1 的 GitHub App 凭据仅在服务端使用。不使用公共代理、no-cors、Hub 镜像或 Discord 附件安装。没有可用转发服务时明确失败。Hash证明内容一致，不证明代码安全或账号可信；扩展和其他酒馆脚本具有宿主脚本权限，当前不是沙盒。发布元数据仍可能由不可信作者提供，安装前应核对作者来源和许可证。

## 本地联调

Registry需要Node24+。在Registry目录`npm ci`后`npm start`可以读取空Catalog；没有Discord凭据时登录清楚返回未配置，不提供假登录后门。按Registry部署文档在本机.env配置Client ID/Secret、准确Callback URL、随机SESSION_SECRET、CORS_ORIGINS、数据库路径。

生产构建使用 `MIEMIE_BUILD_MODE=production` 和真实 `MIEMIE_DEFAULT_REGISTRY_URL`，缺失或假地址会阻止构建。普通开发构建可使用空默认值离线运行。用户界面不显示高级配置入口；开发者通过 `MIEMIE_DEFAULT_REGISTRY_URL` 配置服务根地址（HTTPS，本机可 HTTP），历史本地覆盖偏好继续保留。该地址是公开服务地址，不是 Secret。Registry服务端CORS必须明确列出Tavern实际origin（含协议/端口）。不要把Client Secret、管理员ID名单、数据库或Session复制到Hub脚本。没有真实凭据的自动测试仅用明确Development Fixture/Test Adapter。
