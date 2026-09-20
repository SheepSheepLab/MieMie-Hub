# 官方服务构建与开发设置

扩展中心只有发现、已安装、我的。普通用户无需知道 Registry；构建好的 Hub 自动使用官方在线服务，点击 Discord 登录后由官方授权窗口完成登录，回到当前 Hub 后自动刷新公开 Profile 与我的投稿。

当前没有正式公网服务地址的版本只能发布为开发测试构建，不能宣称完整生产登录已联通。代码不内置示例域名或虚构部署地址。

## 发布构建

维护者部署 Registry 并确认真实 HTTPS 根地址后，只需在构建环境配置一次公开的 `MIEMIE_DEFAULT_REGISTRY_URL`，再执行：

```sh
MIEMIE_BUILD_MODE=production npm run build
```

production 模式要求真实域名 HTTPS 根地址；空值、凭据、路径、query、fragment、示例域名、本机/私网 IP 均拒绝。构建校验不替代部署联通检查，也不证明域名由官方控制。发布前须核对域名、TLS、Registry 健康检查、允许的酒馆 Origin、Discord 回调地址和真实登录。客户端只嵌入公开地址，不能在此传入 Discord Secret、Session Secret 或管理员 ID。

默认 `npm run build` 是 development 模式：空地址允许离线使用本地扩展，或在构建时明确设置 `MIEMIE_DEFAULT_REGISTRY_URL=http://127.0.0.1:8787`。生产和开发产物都在 `build/`，发布前应按预期模式重新构建，避免上传错误产物。`HUB_BUILD_MODE` 和 `HUB_DEFAULT_REGISTRY_URL` 可用于检查实际产物。

## 可选覆盖

自定义服务仅位于 **设置 → 高级 / 开发者选项**，默认折叠。保存 HTTPS 地址（本机可 HTTP）覆盖构建默认值；留空保存恢复默认值。历史 `miemie_registry_url_v1` 偏好继续沿用，不迁移或删除用户现有配置。切换服务会退出当前登录，防止原服务的 Session 发往其他地址。

登录会话只在当前 Hub 内存中，退出登录或 Hub 重载后清除；Registry 的 OAuth Token、Discord 私人 ID 和管理员白名单不下发给 Hub。恢复默认服务不会改变已安装 Extension、Polisher 设置、时间线或 Hub 自更新逻辑。
