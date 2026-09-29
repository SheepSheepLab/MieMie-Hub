# 0.8.1 / 1.2.1 / 0.6.0 发布验证

日期：2026-09-29。用户已确认真实 Tavern Manual Validation PASS；本次仅做发布工程，不重新调整已验收的 UI、动画、Runtime 或 schema。正式版本源：Hub 0.8.1、Polisher 1.2.1、Registry 0.6.0。Architecture Freeze Break Required：NO。

## Version bump 后的完整回归

| Suite | PASS | FAIL | SKIP |
| --- | ---: | ---: | ---: |
| Hub full | 346 | 0 | 0 |
| Polisher full | 42 | 0 | 0 |
| Registry full，含 governance / schema migration | 190 | 0 | 0 |
| Hub / Polisher artifact integration | 30 | 0 | 0 |
| Ecosystem install / update / uninstall | 16 | 0 | 0 |
| Hub 0.8.1 ↔ Registry 0.6.0 | 13 | 0 | 0 |
| 已发布 Hub 0.8.0 client ↔ Registry 0.6.0 | 13 | 0 | 0 |
| Admin Console | 11 | 0 | 0 |
| Browser Package CORS | 8 | 0 | 0 |
| Browser OAuth / ACL（sandbox iframe、断 opener） | 8 | 0 | 0 |
| Browser self-update CORS | 6 | 0 | 0 |
| 合计 | **683** | **0** | **0** |

以上为本次实际重跑，不沿用 Final Review 计数。OAuth / GitHub upstream 为明确 fixture；数据库均为本地隔离实例。迁移测试在 Registry full 中，未重复累计。生产 preflight、迁移和真实登录属于后续 Gate。

## 构建、身份与扫描

三仓先保存原本地产物，分别执行 clean → build → SHA-256 两次；两次全部生成文件的 size / SHA-256 完全一致，包含 SHA256SUMS。Registry 沿用既有白名单、固定元数据的源码归档流程；不是 Docker image 或可执行二进制。

| 正式主产物 | SHA-256 |
| --- | --- |
| MieMie-Hub-0.8.1.json | 19b9b0fead371c77c81e29ff899d2d5e8078b0ab858cd6935bf2842016ed2023 |
| MieMie-Polisher-Extension-1.2.1.json | a15a2fc63b295871a9ffef6654fed36eb9323d6f3ab9bb8a345bdc3d91104126 |
| MieMie-Registry-0.6.0-source.tar.gz | fd167a55418182972916ee9525ec07c870bf0f4c62a3160a35b9eb535cd5dc8c |

更新 metadata 的 version / tag / productId / scriptId / asset size / asset SHA-256 / content SHA-256 均与最终字节一致。Polisher manifest 仅升 version，共享标题为“咩咩润色工具 1.2.1”，脚本列表格式一致。Hub 正式构建仍内置原有公开 Registry URL。

稳定身份 miemie.hub、miemie.polisher、miemie.timeline、两个 script ID、Extension API v1、Shortcut API、Native Presentation、meeme_timeline_dock_v1 及既有 Runtime / Package 安全实现未修改。组合测试 artifact lock 已同步到两次重建一致的正式新产物。

源码／文档全部受版本管理及新增文件，加全部正式产物（含归档成员）完成个人绝对路径、私钥、常见真实 token 模式扫描，未命中；归档不含环境文件、数据库、备份或 node_modules。fixture secret 不作为生产凭据，配置文档只保留变量名与示例。JS/MJS 语法检查：Hub 53、Polisher 18、Registry 37 个受管源码／工具／测试及当前生成 JS 文件通过。三仓 working / cached diff whitespace 检查通过。

## Gate 边界

本记录只确认 Release Commit 的前置验证；不宣称 Tag、GitHub Release、生产部署或迁移已完成。三仓普通 fast-forward Push 后在 Gate A 暂停，等待用户 GATE A VERIFIED。后续生产 Registry 0.5.0/schema 4 → 0.6.0/schema 5 必须重新做生产一致性备份、完整性和副本迁移验证，并等待明确部署授权。
