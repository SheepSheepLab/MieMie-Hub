# MieMie Hub Extension API v1

适用于 MieMie Hub Extension API v1。这里只记录现有接口，不增加 Runtime、包管理或权限机制。

## 三个独立概念

- **Registered Extension**：Runtime 中的注册记录，可启用、停用、注销。当前没有真正的 Extension 包安装器；“已安装扩展”管理页展示的是本地注册状态。
- **Launcher Capability**：可选的快捷启动能力，以 `contributes.launcher` 声明。它不决定扩展是否能注册或运行。
- **Pinned to Hub**：未来用户偏好，本版本没有实现。当前菜单根据可用 Launcher 展示入口，不是固定偏好。

## Manifest

必填：`schemaVersion: 1`、`apiVersion: 1`、`id`、`name`、`version`。

`id` 使用 2–80 位小写字母、数字、点、下划线或连字符，首字符是小写字母或数字；`name` 是非空文本，最多 80 字符；版本使用 `x.y.z`，可带 `-` 预发布后缀。当前校验器不支持 `+build` 后缀。

`description`、`entry`、`icon` 等元数据保留在 Manifest 中；Runtime 不按这些字段读取文件或下载资源。可选 Launcher 的 `title` 是非空文本、最多 60 字符；可选 `icon` 是最多 16 字符的短文本或 emoji。

```json
{
  "schemaVersion": 1,
  "apiVersion": 1,
  "id": "example.background",
  "name": "后台示例",
  "version": "1.0.0"
}
```

无需声明 Launcher，也无需提供 `open()`。声明 Launcher 时可增加 `"contributes": {"launcher": {"title": "打开示例", "icon": "🐑"}}`。

## 本地源与注册

脚本访问 `window.parent.__MieMieHub`，先检查 `apiVersion === 1`。Hub 就绪时向父窗口发送 `miemie:hub-ready`，关闭时发送 `miemie:hub-disposed`；两者的 `event.detail` 是相应 Hub 对象。

`hub.extensions.provide(manifest, factory)` 提供已加载的本地工厂，返回 `{ok, ready, release}` 或 `{ok:false, error}`。`ready` 是初始注册／启用结果的 Promise。Hub 会按保存的注册与启用偏好处理该源，且保留工厂供卸载后的管理页重新注册。`release()` 用于源脚本结束时撤回工厂、清理 Runtime 实例，同时保留用户的注册／启用偏好。提供源不等同于安装脚本文件。

也可直接使用 `register(manifest, factory)`；它只产生默认停用的 Runtime 注册记录，不保留独立的本地源。重复 ID 被拒绝。

| 接口 | 返回与作用 |
|---|---|
| `register(manifest, factory)` | 同步结果对象，创建注册记录 |
| `enable(id)` | Promise，创建新实例并 activate |
| `disable(id)` | Promise，撤销实例能力并执行清理，保留注册 |
| `uninstall(id)` | Promise，清理并删除 Runtime 注册；不删除助手脚本和业务数据 |
| `open(id)` | Promise，尝试调用当前实例的 open |
| `list()` / `get(id)` | 状态快照；不存在时 get 返回 null |

快照包含 `manifest`、`state`、`enabled`、`busy`、`error`、`launcherAvailable`、`launcherError`。`hub.ready` 表示内置 Hello Mie 初始处理完成，不代表所有外部脚本已加载。

## 工厂与生命周期

`factory(api)` 返回生命周期对象，也允许异步返回。`activate()`、`deactivate()` 可选，存在时必须是函数；`open()` 是可选 UI 能力。每次重新启用会创建新实例。扩展应在 activate 中获取资源，用 deactivate／onCleanup 释放，使用 signal 和 guard 阻止迟到任务继续工作。

| 扩展上下文 | 作用 |
|---|---|
| `api.manifest` | Manifest 副本 |
| `api.signal` | 实例取消信号；停用／卸载时立即 abort |
| `api.onCleanup(fn)` | 登记清理函数；按逆序执行，单个失败不阻止其余清理 |
| `api.guard(fn)` | 实例失效后不再调用；普通回调异常进入扩展级错误清理 |
| `api.showMessage(text)` | 显示 Hub 文本窗口 |
| `api.attachPanel(panel, {icon})` | 挂载本实例的一个主面板，绑定 Hub 的展示与解绑逻辑 |
| `api.showPanel()` | 展示已挂载面板 |

扩展自行负责事件、Hook、请求、计时器、业务 DOM、对象 URL 等资源。Hub 不会自动追踪所有宿主副作用。默认生命周期等待超时为 10 秒，单项 onCleanup 等待最多 2 秒；超时无法强制中断任意 JavaScript。这是协作式运行机制，不是沙盒。

无 Launcher 的后台扩展可以完整注册、启停和卸载。有 Launcher 但缺少可调用 open 时，扩展仍启用，快捷入口不可用，并记录警告。打开抛错或超时仅记录“扩展界面打开失败”，不停用、清理该扩展。显式停用、其他业务回调报错仍遵循原生命周期规则。

## 版本与消费者

Hub API 版本当前为 1；Hub 产品版本与扩展产品版本分别维护。MieMie Polisher 通过上述全局接口和事件协作，没有导入 Hub 的源文件。实际已验证的版本组合及产物校验值见 [测试说明](TESTING.md)。本协议不要求普通社区作品全部改成原生 MieMie Extension。
