# 可选 Launcher 双模式协议 v1

适配路径先看 [Developer Guide](EXTENSION-DEVELOPER-GUIDE.md)。本协议负责 Standalone ↔ Hub 单实例交接；蜂窝／Surface／可选外部 Shortcut 的现行契约见 [Extension API v1](EXTENSION-API.md)，物理安装与更新另按 [Package v1](EXTENSION-PACKAGE.md) 验证。

此协议对社区作者完全可选。没有Hub适配、没有open、没有Launcher的作品都可以被Catalog作为外部项目收录。原生Extension的生命周期与Launcher能力分离；是否具备机器安装包由Package规范决定，不能因为没有Launcher拒绝后台Extension。

父页面 `window.parent.__MieMieHub` 提供API v1。兼容Hub发出 `miemie:hub-ready` / `miemie:hub-disposed`，event.detail为对应Hub对象；不能把旧实例的事件误认为当前实例。`extensions.provide(manifest,factory)` 返回 `{ok,ready,release}`。`ready`等待注册/激活，`release()`撤回来源。Hub新提供可选`whenDisposed`，在整个Runtime清理结束后完成；不能把disposed事件当成异步清理已完成。

作者自己管理独立Launcher。默认收纳方式：

```js
// 概念顺序；实际应串行化并处理卸载、重复事件和错误。
await startStandalone();
async function attach(hub) {
  await stopStandalone();
  const lease = hub.extensions.provide(manifest, createExtension);
  if (!lease.ok) throw Error(lease.error);
  await lease.ready;
  return lease;
}
// Hub消失：等待lease.release及旧Hub.whenDisposed，再startStandalone。
```

独立入口最小例子使用作者自己的图标/名称：

```js
const button = parent.document.createElement('button');
button.textContent = '打开我的工具';
button.onclick = () => openMyUI();
parent.document.body.append(button);
function stopStandaloneLauncher() { button.onclick = null; button.remove(); }
```

作者可以选择Hub存在时仍保留独立球；此时球可以委托`hub.extensions.open(id)`，不要运行第二份业务或第二层Hook。Hub中停用或Runtime注销Extension后，只要Hub仍存在，适配器不能绕过用户状态立刻复活为独立业务。单个open失败不应撤销正常后台生命周期。

Polisher 1.1.0是完整参考：[launcher-adapter.js](https://github.com/SheepSheepLab/MieMie-Polisher/blob/v1.1.0/launcher-adapter.js)。支持`keepStandalone:false/true`、双启动顺序、Hub重载、异步清理、原iframe保留、重复来源拒绝和页面内临时状态交接。该文件含Polisher专用身份，社区作者应实现自己的适配，不照搬品牌或ID。

Registry和Package Manager都不抓取、模拟点击或删除第三方悬浮球。注册Extension、Launcher能力、固定到Hub是三个概念；当前没有Pinned功能。

Hub 0.8.3 源码提供可选 [Native Window Ownership](EXTENSION-API.md#optional-native-window-ownership-api-v1)
允许蜂窝和原生悬浮球同时存在，同一 Session 按入口切换展示所有权。原生窗口
模式不退出 Runtime，不等于 Hub 消失后的 Standalone 恢复；本页 `whenDisposed`
交接规则仍然有效。未采用新能力的旧 Shortcut 保持原有托管窗口行为。

双入口遵循 **Dual Entrance / Single Business Instance / Independent Presentation Ownership**。
Hub Runtime 存在不等于 Hub Surface 正在控制窗口；蜂窝打开先释放 Native lease，再调用既有实例的 `open()`，原生入口继续复用扩展自己的窗口函数。Source Lease 管理工厂来源，Native lease 管理当前窗口展示，两者不能互相代替，也不能用撤回来源来实现普通关闭。

Hub 退出后的恢复先核对旧 Hub 身份与用户启停状态，再等待清理完成；不要在旧 Session 或旧 Native lease 已失效后执行迟到写入。用户停用扩展时应保留其选择，不能借 Hub 消失自动重建已停用业务。详细 API 签名与清理边界集中在 [Extension API](EXTENSION-API.md)。
