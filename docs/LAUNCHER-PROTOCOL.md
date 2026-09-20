# 可选 Launcher 双模式协议 v1

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
