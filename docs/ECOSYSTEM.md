# Extension Ecosystem MVP

Hub 0.3.2、Polisher 1.1.0、Registry 0.1.2 独立安装依赖、构建、测试与版本。Registry是可选在线目录服务，不是Core启动依赖，不托管社区软件包。目录失效不会停用已安装代码。

## 社区作者的三种参与方式

1. Discord作品：填写作者、名称、简介、原帖链接；按钮跳转原帖，不自动读取或永久缓存附件。
2. 普通公开GitHub项目：投稿Repository，无需改业务或UI；缺少机器包时显示“查看GitHub”。
3. 可安装GitHub Extension：在作者自己的Release提供标准[Package v1](EXTENSION-PACKAGE.md)，才能一键安装/更新。仓库布局不受要求。Launcher双模式仍可选，后台Extension无需open。

所有代码和文件仍由作者维护，MieMie不取得社区作品所有权。软件许可证在Manifest声明并由作者负责；MieMie官方项目使用GPL-3.0-or-later并单独声明官方视觉资产。

## 目录与身份

扩展中心三个分页：发现永远是普通用户视角；已安装管理本机实例；我的才提供登录、投稿和管理。Author是作品作者文本；Submitter是Discord OAuth确认的投稿者，不等于经过认证的作者。

Registry仅使用Discord `identify`，内部以不可变Snowflake绑定所有权，重新登录同步Display Name/Username/Avatar。公开资料不返回用户ID、邮箱、OAuth Token、管理员名单。即使Display Name同名也不能管理别人的投稿。

OAuth使用popup。Registry先设置第一方HttpOnly state cookie，再转Discord；回调将短期一次性桥接code发给精确来源窗口，Hub核对origin/source/requestId，并用内存verifier交换不透明Registry Session。OAuth Token永远留在服务器且不持久保存。Hub Session只在内存，换Registry、注销或Hub重载后需重新登录。

投稿成功默认上架，不代表安全审核、作者认证或官方推荐。投稿者只能编辑自己的信息，不能改变owner。更改来源时服务器重新验证，不沿用旧仓库版本/hash。管理员通过环境变量DiscordID白名单登录，不存在另一套账号密码。

下架是owner_status=unlisted，不物理删记录；管理员moderation另行记录hidden/unlisted和原因。管理员恢复不会替用户撤销主动下架。封禁阻止继续投稿/编辑/重新上架，后台有审计记录。

## Registry离线与下架边界

Catalog下架只影响发现及Catalog新安装，不远程删除、禁用或重写已安装代码。已安装Extension仍可从原来记录的作者GitHub检查更新；管理员隐藏目前也不充当远程kill switch。新的来源URL不会改动本机既有来源绑定。直接输入作者GitHub获取是用户独立选择，不冒充目录仍上架。

Catalog版本是最近投稿/编辑发现的快照；安装/更新会重新读取作者Release并重新校验。Registry不可用时发现/我的提示错误，本地Runtime、时间线、Polisher和已安装管理照常使用。

## 安装与信任

Hub仅管理可识别的全局脚本及支持的文件夹。角色/预设位置、重复ID、多候选、未知宿主字段时安全拒绝。安装前全部网络、metadata/Manifest、双hash、版本和身份校验通过后才同步写树；不会执行未验证下载代码。更新仅content，保留原实例ID和data，其他脚本不变。

Package已写入不代表作者代码运行成功或服务器已保存。列表同时显示物理版本和Runtime状态；更新前导出恢复文件，运行失败需用旧content手工恢复。物理卸载只需确认删除，不生成备份；它会移除该条目data，但不清空工具自己的外部存储。不要把Runtime注销和真正删除混用。

GitHub API 与 Release 是权威来源。Extension 附件直连被 CORS 拦截时，可以通过已配置的 Registry 0.1.2+ 受限转发：只接受仓库、Release ID、Asset ID，并在服务器验证 Manifest／digest，不接受任意 URL、不持久保存附件。Hub 再独立校验原始字节。不使用 Token、公共代理、no-cors、Hub 镜像或 Discord 附件安装。没有可用转发服务时明确失败。Hash证明内容一致，不证明代码安全或账号可信；扩展和其他酒馆脚本具有宿主脚本权限，当前不是沙盒。发布元数据仍可能由不可信作者提供，安装前应核对作者来源和许可证。

## 本地联调

Registry需要Node24+。在Registry目录`npm ci`后`npm start`可以读取空Catalog；没有Discord凭据时登录清楚返回未配置，不提供假登录后门。按Registry部署文档在本机.env配置Client ID/Secret、准确Callback URL、随机SESSION_SECRET、CORS_ORIGINS、数据库路径。

Hub扩展中心的Registry连接设置输入服务根地址（生产HTTPS，本机可HTTP），该地址是公开服务地址，不是Secret。Registry服务端CORS必须明确列出Tavern实际origin（含协议/端口）。不要把Client Secret、管理员ID名单、数据库或Session复制到Hub脚本。没有真实凭据的自动测试仅用明确Development Fixture/Test Adapter。
