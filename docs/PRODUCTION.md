# 官方服务构建与开发设置

扩展中心只有发现、已安装、我的。普通用户无需知道 Registry；构建好的 Hub 自动使用官方在线服务，点击 Discord 登录后由官方授权窗口完成登录，回到当前 Hub 后自动刷新公开 Profile 与我的投稿。

当前没有正式公网服务地址的版本只能发布为开发测试构建，不能宣称完整生产登录已联通。代码不内置示例域名或虚构部署地址。

## 发布构建

维护者部署 Registry 并确认真实 HTTPS 根地址后，只需在构建环境配置一次公开的 `MIEMIE_DEFAULT_REGISTRY_URL`，再执行：

```sh
MIEMIE_BUILD_MODE=production npm run build
```

production 模式要求真实域名 HTTPS 根地址；空值、凭据、路径、query、fragment、示例域名、本机/私网 IP 均拒绝。构建校验不替代部署联通检查，也不证明域名由官方控制。发布前须核对域名、TLS、Registry 健康检查、允许的酒馆 Origin、Discord 回调地址和真实登录。客户端只嵌入公开地址，不能在此传入 Discord Secret、Session Secret 或管理员 ID。

当前官方公开根地址为 `https://registry.sheepsheeplab.com`。精确 Origin 比对包含主机、协议和端口，`localhost` 与 `127.0.0.1` 是两个来源。允许的登录来源由 Registry 独立维护。在线访问失败时拒绝写入未校验的软件包，本地 Runtime 可离线运行。[Registry 0.7.0](https://github.com/SheepSheepLab/MieMie-Registry/releases/tag/v0.7.0) 发布时已实测生产目录、既有正式附件 Relay、精确 Origin 与 Registry 治理页的 Discord 登录，并保留 API2 Catalog／Relay 与 Origin 的独立验收。

从 Registry 0.7.2 起，公开目录和经过校验的公开安装包支持未登记的浏览器来源。登录、投稿和成员专属内容继续使用精确 Origin 与身份校验。Hub 1.0.1 在 GitHub API 直连失败时可以通过此版本的 Registry 查询公开 Release，安装前仍独立验证附件身份与哈希。浏览器须能连接 Registry。

默认 `npm run build` 是 development 模式：空地址允许离线使用本地扩展，或在构建时明确设置 `MIEMIE_DEFAULT_REGISTRY_URL=http://127.0.0.1:8787`。生产和开发产物都在 `build/`，发布前应按预期模式重新构建，避免上传错误产物。`HUB_BUILD_MODE` 和 `HUB_DEFAULT_REGISTRY_URL` 可用于检查实际产物。

## 可选覆盖

用户设置不再显示高级配置入口。开发者使用 `MIEMIE_DEFAULT_REGISTRY_URL` 配置 HTTPS 服务地址（development 构建允许本机 HTTP）。历史 `miemie_registry_url_v1` 偏好继续沿用，不迁移或删除用户现有配置。切换服务会退出当前登录，防止原服务的 Session 发往其他地址。

登录会话只在当前 Hub 内存中，退出登录或 Hub 重载后清除；Registry 的 OAuth Token、Discord 私人 ID 和管理员白名单不下发给 Hub。恢复默认服务不会改变已安装 Extension、Polisher 设置、时间线或 Hub 自更新逻辑。
