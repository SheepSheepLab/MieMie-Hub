> Hub 0.9.0 / API v2 契约；本地审核候选，未发行。

# 可选 Launcher 双模式协议 v1

标题的 v1 保留既有双模式协议名称，不是 Runtime `apiVersion`；本页当前接入要求 Extension API v2，不能据标题判断兼容性。

适配路径先看 [Developer Guide](EXTENSION-DEVELOPER-GUIDE.md)。本协议负责 Standalone ↔ Hub 单实例交接；蜂窝／Surface／可选 Native Window 的现行契约见 [Extension API v2](EXTENSION-API.md)，物理安装与更新另按 [Package v1](EXTENSION-PACKAGE.md) 验证。

此协议对社区作者完全可选。没有Hub适配、没有open、没有Launcher的作品都可以被Catalog作为外部项目收录。原生Extension的生命周期与Launcher能力分离；是否具备机器安装包由Package规范决定，不能因为没有Launcher拒绝后台Extension。

父页面 `window.parent.__MieMieHub` 提供API v2。兼容Hub发出 `miemie:hub-ready` / `miemie:hub-disposed`，event.detail为对应Hub对象；不能把旧实例的事件误认为当前实例。`extensions.provide(manifest,factory)` 返回 `{ok,ready,release}`。`ready`等待注册/激活，`release()`撤回来源。`hub.whenDisposed`在该Hub的Runtime有界异步清理完成后兑现；不能把disposed事件当成异步清理已完成。

作者自己管理 Standalone Launcher 与业务交接。Hub 接管时撤去冲突的独立展示；若复用同一业务实例，仅切换展示，不重新初始化业务。若适配器需要替换生命周期实例，先完成原实例清理，并保留应交接的状态。两种入口不能分别持有一份业务或 Hook。

```js
// 概念顺序；由适配器串行处理重复事件、卸载、用户状态和错误。
async function attach(hub) {
  if (!hub || hub.apiVersion !== 2) throw Error('需要兼容的 Hub API2');
  await prepareHubHandoff(); // 扩展自己的展示／业务交接，不是 Hub API
  const source = hub.extensions.provide(manifest, createExtension);
  if (!source.ok) throw Error(source.error);
  const result = await source.ready;
  if (!result.ok) {
    await source.release();
    throw Error(result.error || 'Extension registration failed');
  }
  // 核对 get(id)，尊重已保存的注册／启用偏好
  return source;
}
// Hub消失：匹配 event.detail 的实例，等待 source.release() 和
// 该实例的 whenDisposed；重新核对当前 Hub 与用户状态后恢复 Standalone。
```

`source` 是 Source Lease：`release()` 撤回工厂来源并清理当前 Runtime 实例，保留用户偏好，不是窗口关闭。`ready` 完成不保证扩展已启用；用户可能已停用或注销该产品，适配器不能自行反向覆盖选择。不支持的 Hub 不得被注册或宣称兼容；扩展可独立运行 Standalone，不调用旧 Runtime。兼容 API2 Hub 内用户的停用／注销选择不得被 Standalone 绕过。API2 的 `whenDisposed` 是必须等待的完成边界，但有界清理超时不能终止扩展任意 JavaScript；扩展自己的旧异步任务仍须检查取消信号。

独立入口最小例子使用作者自己的图标/名称：

```js
const button = parent.document.createElement('button');
button.textContent = '打开我的工具';
button.onclick = () => openMyUI();
parent.document.body.append(button);
function stopStandaloneLauncher() { button.onclick = null; button.remove(); }
```

作者可以选择 Hub 存在时仍保留独立球。`hub.extensions.open(id)` 通过 Hub Runtime 打开已有 Extension；对已接入 Surface 的扩展，该路径使用 Hub 管理的展示方式，不授予原生窗口控制权。使用统一 Native Window 时，通过 mount 收到的 open 回调申请 Native 控制权。Hub 中停用或 Runtime 注销 Extension 后，只要 Hub 仍存在，适配器不能绕过用户状态复活独立业务。单个 open 失败不应撤销正常后台生命周期。

按当前 API 实现自己的适配器，分别验证双启动顺序、Hub 重载、异步清理、重复来源拒绝、临时草稿与单实例。使用本项目自己的品牌、稳定 ID 和存储键；完整签名与可选能力见 [Extension API](EXTENSION-API.md)，验收入口见 [Developer Guide](EXTENSION-DEVELOPER-GUIDE.md#7-runtime-compatibility-gate)。

Registry 和 Package Manager 不抓取、模拟点击或删除第三方悬浮球。蜂窝根据当前有效 Launcher 能力展示入口；注册、运行期展示和 Package 管理分别按对应规范处理。

可选 [Native Window Ownership](EXTENSION-API.md#unified-native-window)
允许蜂窝和原生悬浮球同时存在，同一 Session 按入口切换展示所有权。原生窗口
模式不退出 Runtime，不等于 Hub 消失后的 Standalone 恢复；本页 `whenDisposed`
交接规则仍然有效。没有 Native 能力的扩展不提供该托管独立入口。开启独立球不退出 Runtime、不移除蜂窝入口，也不改变 Package 管理资格。

双入口遵循 **Dual Entrance / Single Business Instance / Independent Presentation Ownership**。
Hub Runtime 存在不等于 Hub Surface 正在控制窗口；蜂窝打开先释放 Native lease，再调用既有实例的 `instance.open(surfaceLease)`，原生入口继续复用扩展自己的窗口函数。Source Lease 管理工厂来源，Native lease 管理当前窗口展示，两者不能互相代替，也不能用撤回来源来实现普通关闭。 Surface 操作须传入本次打开请求的有效 Lease：`api.showPanel(surfaceLease)` / `api.closePanel(surfaceLease)`；异步完成后先检查捕获的 Lease 是否仍有效。

Hub 退出后的恢复先核对旧 Hub 身份与用户启停状态，再等待清理完成；不要在旧 Session 或旧 Native lease 已失效后执行迟到写入。用户停用扩展时应保留其选择，不能借 Hub 消失自动重建已停用业务。详细 API 签名与清理边界集中在 [Extension API](EXTENSION-API.md)。
