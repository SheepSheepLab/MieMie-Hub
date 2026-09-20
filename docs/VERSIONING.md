# MieMie 官方项目版本规范

SheepSheep 维护的 MieMie 官方项目，从本次发布起只使用无前导零的 `MAJOR.MINOR.PATCH`，例如 `0.2.1`、`0.2.2`、`1.0.1`。不使用 `-alpha.N`、`-beta.N`、`-hub.N`、`-build.N`、`+build` 或其他后缀。

内部快速迭代直接增加 PATCH；后续功能和兼容性变化按 SemVer 使用 MINOR / MAJOR。Hub 与 Extension 独立维护自己的版本。Hub 构建会拒绝违反格式的版本，并由 `package.json` 统一生成运行版本、设置页显示、身份标记和机器更新元数据。

Git Tag 使用 `v<version>`。GitHub 的 **Pre-release 是发布状态**，不是版本字符串的一部分，因此 `v0.2.1`、`v0.2.2`、`v1.0.1` 都可以标记为 Pre-release，不表示已完成所有真实宿主验证。

## 早期公开命名清理

经 SheepSheep 授权，早期 Release 及其本地／远程 Tag `v0.2.0-alpha.3`、`v0.2.0-alpha.4`、`v1.0.1-hub.2` 已清理。没有删除仓库、重写 `main` 提交历史或 force-push，旧版本字符串仍可能出现在源码历史与兼容测试中。

新的首次发布分别为 Hub `0.2.1` 和 Polisher `1.0.1`；Hub `0.2.2` 用于 `0.2.1 → 0.2.2` 的真实自更新验证。Hub 仍能比较合法的历史 SemVer 预发布标签，但新的官方构建及可安装更新目标必须遵守纯三段式规则。

## 发布文件

Hub Release 使用 ASCII 文件名：

- `MieMie-Hub-<version>.json`
- `MieMie-Hub-update.json`

Polisher Release 使用：

- `MieMie-Polisher-Extension-<version>.json`
- `manifest.json`
- `MieMie-Extension-update.json`（从1.1.0起）

发布附件的 hash 必须针对最终上传字节计算。机器元数据与对应版本一起构建，不从 Release Notes 自然语言解析 hash。Release Notes 可同时提供人工校验用 SHA-256。

生态MVP新增功能版本为Hub0.3.0、Polisher1.1.0和Registry0.1.0。Polisher没有收到新Icon，未制作1.0.2 Icon版本；旧1.0.1保留作为实际升级基线。
