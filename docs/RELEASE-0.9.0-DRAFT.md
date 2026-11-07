# MieMie Hub 0.9.0 — Release Notes 草稿

仅供本地候选审核，未发布、未批准公开分发。未来版本名称为 `MieMie Hub 0.9.0`，Tag 为 `v0.9.0`；本草稿不提供未发布版本的下载链接。

- Extension Runtime 使用 API v2；Manifest Schema、Managed Package、Machine Metadata 与 Build Identity Schema 保持 1。
- Unified Native Window 通过同一套 mount/open/release 管理独立入口与原生展示。蜂窝和原生入口共享一个业务实例；原生交互由扩展负责。
- Hub Surface 使用严格请求 Lease；保留蜂窝动画、Back、焦点恢复、系统前景与有界生命周期清理。
- Package 安装和更新在写入前验证目标 API2，分别呈现物理安装、API 声明、保存确认和 Runtime 状态。
- Bundled Timeline 使用 API2，仍随 Hub 更新，通过 Launcher 打开；没有独立安装、更新或 Native 入口。

## Breaking Change 与适配

API1 Runtime、`registerShortcutLauncher()`、Shortcut → Hub Surface fallback、Shared Native Floating Presentation 及旧 provider 动画适配不再可用。API1 扩展不能仅改版本字段就视为适配完成；作者从 [Developer Guide](EXTENSION-DEVELOPER-GUIDE.md) 按当前契约改造并验证。

未适配的扩展可继续使用其支持的 Hub 0.8.x；不承诺旧线永久维护或安全支持。旧安装不会因 Runtime 不兼容而自动删除或清空 data；安全升级／卸载按 [Package v1](EXTENSION-PACKAGE.md) 独立验证。身份行不包含 API 版本，无法核验对应已安装版本时保持“未确认”。

独立入口仍默认 OFF，既有 `miemie_hub_shortcuts_v1` 偏好保留；它是存储格式标记，不表示仍提供 API1 Shortcut。开启入口须由扩展注册 Native Window 能力。释放失败时保留保护和重试提示，不强夺窗口或重建业务。

## 升级与恢复

当前候选仅用于专用测试酒馆，不替换日常安装。正式升级前需先完成官方扩展、生产 Registry 与 Package 的独立兼容验收，并保存编辑、停止生成、核对 Hub 和扩展的恢复文件。

Hub 自更新保留安装实例 ID、用户字段和业务存储；成功写入、载入新版、服务器保存回读分别确认。0.9.0 的 API Breaking Change 不由自更新器自动迁移其他扩展，也不保证新版扩展可在回退后的 API1 Hub 运行。

恢复遵循 [Self Update](SELF-UPDATE.md#恢复与限制)：在原条目恢复经过核验的旧 content 和名称，保留当前用户数据。不要同时启用两份 Hub，不清空其他脚本或整个存储；没有自动回滚。无 Timeline 架构测试包不能用于正式更新。

## 验证与发行前条件

Core 控制路径已收敛，但不宣称全面性能提升；普通初始化表现基本持平，源码字节未下降。通用 Fixture 的 Native 行为验证不替代正式产品的业务一致性验收。

三款官方 Extension 开发候选的 Runtime API2、Native Parity 及隔离 Managed Package 已通过已测范围；正式新版本／资产、生产 Registry API2、Registry Origin、生产安装更新、物理移动 Safari、真实外部模型服务和 Owner 人工验收仍分别 Pending。桌面简体拼音 IME 与 Safari 系统 Reduced Motion 的既有本机证据不泛化到所有设备或输入法。技术审核通过不等于生产放行，正式发行仍需 Owner 独立授权。

预期正常发布附件为 `MieMie-Hub-0.9.0.json`、`MieMie-Hub-update.json` 与最终字节的 SHA-256 清单；还须按既有许可提供对应源码、构建材料和许可／品牌／素材说明。审核包中的夹具、日志、测试工具和无 Timeline 构建不是正式 Release Assets。

## 官方 Extension 最低 Runtime 与候选证据

新版 Polisher、Preset Manager、Story Director 最低要求 **Hub Runtime API2**；Standalone 独立运行、Package v1 校验和用户数据保护保留。旧 Hub Runtime 向后兼容不是新版的开发、测试或发行要求，不添加自动降级或旧 Runtime 分支。

2026-10-20 Pre-Main 已完成五仓 1,858 项主测试、五个 Linux CI Run／九个 Job、ST 1.18.0／1.19.0 与 Chromium／真实 Safari 的隔离验收。当前构建、范围及私有原始证据索引见 [TESTING](TESTING.md#pre-main-验收记录2026-10-20)。这些结果不等于生产或正式发行批准；本草稿仍不提供未发行附件下载。
