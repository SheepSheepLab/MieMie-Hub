# MieMie Hub 0.8.1

- 新的中心绽开 Launcher 展开动画，保留原有收起动画；主图标与标题直接出现。
- 改进投稿体验：GitHub URL 与“读取 GitHub 资料”同一行，支持粘贴／失焦自动检测，主题选择菜单适配窄屏。
- 分发方式由 Registry 检测结果自动确定；未提供标准 Package 的公开 GitHub 项目仍可收录并前往 GitHub 获取。
- GitHub 仓库与可选 Discord 发布帖分别展示；Discord 来源项目仅原帖所在服务器成员可见。
- 改进 Catalog 链接、主操作和简介层级，保持机器安装兼容与安全审核的区别。

Extension API v1、Runtime、Surface／Launcher Origin、Shortcut、稳定脚本 ID 和既有设置／Dock 数据保持不变。机器安装继续要求严格 Package 校验及安装时重新检测。

发布文件：`MieMie-Hub-0.8.1.json`、`MieMie-Hub-update.json`、`SHA256SUMS`。校验值以正式构建的 SHA256SUMS 为准。

从 0.8.0 更新前请保存编辑并停止生成任务，保留更新流程请求下载的恢复文件。本版本配套 Registry 0.6.0；服务端上线与公开 Release 分别受后续 Gate 控制。
