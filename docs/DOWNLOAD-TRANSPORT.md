# GitHub Extension 浏览器下载修复（Hub 0.3.2 / Registry 0.1.2）

## 根因与路径

GitHub REST Release Asset 的 302 响应有 `Access-Control-Allow-Origin: *`，但当前最终 `release-assets.githubusercontent.com` 附件响应没有该头。浏览器可以读取 Release 列表，却不能读取安装机器元数据。`browser_download_url` 的 GitHub 重定向同样不能解决这个问题。Node/curl 下载成功不是浏览器 CORS 成功。

Hub 保留直接公开 GitHub API 查询及正常附件下载。只有附件网络读取失败时，才尝试用户配置的 Registry；HTTP 错误、opaque 响应或 hash 失败不会降级为不校验安装。

```text
Hub → 作者 GitHub API（锁定 Release / Asset / digest）
    → 附件可读：直接校验
    → 附件 CORS / 网络读取失败：
       POST Registry /api/packages/github/asset
       {repository, releaseId, assetId}
       → Registry 验证公开作者仓库、标准 Manifest、Release 和附件
       → 从作者 GitHub 官方附件链读取，逐跳验证重定向
       → 返回有长度限制的原始字节，不持久托管
    → Hub 独立执行已有大小 / digest / SHA-256 / JSON / 版本 / 身份校验
    → 写入前再次锁定 Release，仅修改确定的目标脚本
```

Registry 不是软件文件的权威来源，也不是普通 URL 代理。未收录的直接 GitHub 预览可以使用此传输，但服务器必须完成 Manifest 验证；客户端不能请求任意附件。安装来源仍显示“作者 GitHub”。更新和安装共用该路径。Hash 一致不等于作者代码经过安全审核。

客户端请求不发送 Cookie、Authorization、Discord Session、聊天或酒馆密钥。生产 Registry 使用 HTTPS，本机允许 localhost HTTP；服务端 CORS 必须列出真实酒馆 Origin。客户端不允许 Registry 下载重定向；超时、Hub teardown 或传输期间 Registry 地址变化会阻止安装。现有元数据 64 KiB / 15 秒及包 16 MiB / 60 秒限制继续生效。

## 复测准备

1. 手动导入 Hub 0.3.2，停用旧 Hub，避免两个实例。
2. 启动或部署 Registry 0.1.2。只验证下载不需要 Discord OAuth Client ID / Secret，也不需要登录。
3. Registry 的 `CORS_ORIGINS` 必须精确包含酒馆地址的协议、主机、端口。在 Hub 扩展中心“Registry 连接设置”保存此服务根地址。默认本地服务为 `http://127.0.0.1:8787`；其他设备访问时需可达的 HTTPS 部署。
4. 在“从作者 GitHub 查看安装兼容性”输入 `https://github.com/SheepSheepLab/MieMie-Polisher`，预览应显示可安装版本和作者来源。确保没有重复 Polisher 后安装；不手动导入 Polisher JSON。
5. 已安装旧 Polisher 的用户检查更新，保存请求下载的恢复文件，更新后核对实例、设置、Key、Prompt 和其他扩展。不要为了测试删除现有用户数据。
6. 停掉 Registry 后重复预览应明确失败，Hub、时间线和本地扩展仍可用。

没有生产 Registry 地址被写死到 Hub。这次没有改用户的 SillyTavern 代理配置，也没有修改 Hub 自更新、Polisher 或页面布局。

## 测试边界

基础测试覆盖 fallback 契约、无凭据、篡改字节、无 Registry、错误服务地址、地址变化、超时及 teardown。另有真实 Chromium 多源 HTTP 回归，真实触发无 CORS 头的附件失败再走转发；不关闭浏览器安全、不使用拦截响应冒充 CORS。Registry 测试负责服务器 Manifest / SSRF / digest / 限流等边界。

真实浏览器测试仍不等于在用户酒馆中改写脚本，最终安装／更新与 UI 由上述步骤确认。


## 0.3.2 重复安装与 GitHub 配额

匿名 GitHub REST API 有访问配额。Registry 上游 403 且 remaining=0（或 429）会转为 `github_rate_limited` / HTTP 429，提供 `retryAt` 和 `Retry-After`；Hub 显示恢复时间，并在冷却期避免反复访问转发接口。网络故障和 Origin 配置错误分别提示，不能将所有 502 归咎于 CORS。

Hub 在当前 iframe 内最多缓存 8 个、合计 32 MiB、有效期 2 分钟的已校验附件；缓存键包含作者仓库、Release ID、Asset ID、大小和 digest。重复安装仍重新读取 Release，并重复完整字节、content、身份与写入前校验。更换 Asset 或过期会重新下载，Hub teardown 清空缓存。不会写入 localStorage 或磁盘。

Registry 仅对公开仓库信息及已验证机器元数据做短期有界内存复用；不缓存软件包。每次转发仍前后读取 Release 并检查锁，不通过旧缓存绕过上游限流或权限变化。减少请求并不意味着无限配额；已耗尽的配额必须等待 GitHub 恢复，不要求用户提供 Token。

卸载现在只确认删除，不下载备份；更新操作的恢复备份保持原行为。
