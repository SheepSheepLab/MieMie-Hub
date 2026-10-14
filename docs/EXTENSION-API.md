# MieMie Hub Extension API v1

适用于 MieMie Hub Extension API v1。这里只记录现有接口，不增加 Runtime、包管理或权限机制。

本文对应 Hub 0.8.3 源码的 API v1 契约；0.8.3 等待 Owner 发布审核，当前公开正式版仍为 0.8.2。[社区开发统一入口](EXTENSION-DEVELOPER-GUIDE.md)帮助选择适配路径。**Runtime Compatibility 与 Managed Package Compatibility 是两个独立 Gate**：本文定义 Runtime、生命周期及展示能力；物理安装、更新和卸载已由 Hub Package Manager 提供，格式与校验见 [Package v1](EXTENSION-PACKAGE.md)。Runtime 注册成功不代表发布包可在线安装。

## 三个独立概念

- **Registered Extension**：Runtime 中的注册记录，可启用、停用、注销。`hub.extensions.uninstall(id)` 只注销 Runtime，不物理删除酒馆助手脚本。“已安装”页同时区分 Runtime 状态与可识别的 Managed Package；物理包操作不属于本页 Runtime API。
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

`hub.whenDisposed` 是该 Hub 实例的 Runtime 有界异步清理完成 Promise。`miemie:hub-disposed` 保持同步通知，不代表所有异步清理已经完成。交接时匹配 `event.detail` 的实例并等待其 `whenDisposed`，避免旧 Session 的任务覆盖恢复后的 Standalone；详见 [Launcher 协议](LAUNCHER-PROTOCOL.md)。Hub 退出会先释放自己借用的面板根节点状态，再按既有 LIFO 顺序执行扩展清理，不归一化业务子节点或扩展自己的显隐状态。

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

快照包含 `manifest`、`classification`、`state`、`enabled`、`busy`、`error`、`launcherAvailable`、`launcherError`，以及可选能力的 `shortcutLauncherAvailable`、`nativeWindowAvailable` 布尔值。顶层 `classification` 来自 Host 可信元数据，独立于 Manifest 自声明。`hub.ready` 表示随包扩展初始处理完成，不代表所有外部脚本已加载。

## 工厂与生命周期

`factory(api)` 返回生命周期对象，也允许异步返回。`activate()`、`deactivate()` 可选，存在时必须是函数；`open()` 是可选 UI 能力。每次重新启用会创建新实例。扩展应在 activate 中获取资源，用 deactivate／onCleanup 释放，使用 signal 和 guard 阻止迟到任务继续工作。

Runtime 按普通函数调用 `factory(api)`，不提供内部记录作为 `this`。严格模式的普通 factory 收到 `undefined`；非严格函数、箭头函数或显式绑定函数遵循 JavaScript 自身的 `this` 规则。生命周期方法的接收者仍是扩展返回的 instance。扩展不能依赖或修改 Runtime 私有记录；`api.manifest`、注册结果、`get/list` 和状态事件提供副本，instance 自报的 `classification` 不改变平台身份。

| 扩展上下文 | 作用 |
|---|---|
| `api.manifest` | Manifest 副本 |
| `api.signal` | 实例取消信号；停用／卸载时立即 abort |
| `api.onCleanup(fn)` | 登记清理函数；按逆序执行，单个失败不阻止其余清理 |
| `api.guard(fn)` | 实例失效后不再调用；普通回调异常进入扩展级错误清理 |
| `api.showMessage(text)` | 显示 Hub 文本窗口 |
| `api.attachPanel(panel, {icon})` | 挂载本实例的一个主面板，绑定 Hub 的展示与解绑逻辑 |
| `api.showPanel()` | 从所属 Launcher 打开展示已挂载面板，返回过渡任务 |
| `api.closePanel()` | 关闭当前实例自己的 Surface、返回原 Launcher；不触发生命周期停用 |

扩展自行负责事件、Hook、请求、计时器、业务 DOM、对象 URL 等资源。Hub 不会自动追踪所有宿主副作用。默认生命周期等待超时为 10 秒，单项 onCleanup 等待最多 2 秒；超时无法强制中断任意 JavaScript。这是协作式运行机制，不是沙盒。

无 Launcher 的后台扩展可以完整注册、启停和卸载。有 Launcher 但缺少可调用 open 时，扩展仍启用，快捷入口不可用，并记录警告。打开抛错或超时仅记录“扩展界面打开失败”，不停用、清理该扩展。显式停用、其他业务回调报错仍遵循原生命周期规则。

## 版本与消费者

Hub API 版本当前为 1；Hub 产品版本与扩展产品版本分别维护。MieMie Polisher 通过上述全局接口和事件协作，没有导入 Hub 的源文件。实际已验证的版本组合及产物校验值见 [测试说明](TESTING.md)。本协议不要求普通社区作品全部改成原生 MieMie Extension。


## 随包扩展

Hub 0.6.1 的时间线使用标准 API v1 Manifest、provide 和生命周期。构建资源封装不是新的宿主权限。见 [Core 架构](CORE-ARCHITECTURE.md)。

## 可选 Surface API：Launcher Icon → Panel → 原 Icon

这是 API v1 的向后兼容能力扩展。Surface 是推荐的协作式 UI 适配，**不是强制接管第三方界面**。不调用 `attachPanel` 的扩展可以继续维护自己的悬浮球、面板、动画和关闭逻辑，Hub 不查找或改写其 DOM。

- `api.attachPanel(panel, {icon})`：在 activate 中登记当前实例已挂载到宿主 document 的一个主面板。Hub 负责该面板的显示、位置与过渡；Extension 仍负责业务内容与最终资源清理。重复挂载被拒绝。
- `api.showPanel()`：显示该面板，返回过渡完成的 Promise（失效上下文返回 false）。Hub 根据 Extension ID 关联 Launcher，保留蜂窝滚动位置，并从对应图标展开。重复打开正在打开 / 已打开的面板不新增实例。
- `api.closePanel()`：请求关闭**当前实例自己的**面板，返回 Promise<boolean> 或 false。过渡后面板保持挂载但隐藏、inert，可以再次 showPanel。它不 deactivate、不卸载、不重置设置。关闭中的重复请求复用同一任务；不能关闭另一个 Extension 的面板。

```js
function factory(api) {
  let panel;
  return {
    activate() {
      panel = window.parent.document.createElement('section');
      const back = window.parent.document.createElement('button');
      back.textContent = '返回';
      back.onclick = () => api.closePanel();
      panel.append(back);
      window.parent.document.body.append(panel);
      api.onCleanup(() => { back.onclick = null; panel.remove(); });
      api.attachPanel(panel);
    },
    open() { return api.showPanel(); }
  };
}
```

Hub 私有保存图标 identity、DOM 引用、打开时矩形及蜂窝 scroll snapshot；它们不作为 Runtime record 或可写权威对象传给 Extension。关闭优先重测当前对应图标，重建后按 identity 找新节点；测量不可用或图标消失时使用经过当前视口边界约束的 snapshot；snapshot 也无效才缩小淡出。resize / orientation / visualViewport 变化时取消旧坐标动画并清理临时图标图层，以最新布局完成当前状态；无法回原点不会阻止关闭。

System Module（扩展中心 / 设置）使用内部导航，复用同一个私有 Surface Controller，但不注册为 Extension。已接入的 Surface 顺序切换，不同时叠放两个全尺寸窗口。返回与 Hub 的 Escape 处理进入同一关闭路径；不拦截浏览器系统历史返回。Reduced Motion 跳过复杂动画，仍恢复蜂窝位置。

关闭完成后，焦点优先回到本次真实 Origin：蜂窝对应 App Icon，或 Shortcut 原 mount 声明子树内的已有可聚焦节点；Hub 主界面收起回到 Hub 主球。关闭期间出现新的用户输入、焦点意图、导航、撤销或 dispose 时，旧请求不再恢复焦点。Origin 已移除或没有可聚焦节点时安全放弃，不改第三方 tabindex，也不以主球替代失效的 Extension Origin。原生 Native Window 的焦点由扩展负责。

Polisher 以能力检测兼容旧 Hub：新 Hub 走 `api.closePanel()`，旧 Hub 保留原 `hub.open()` 返回方式；Standalone adapter 自己提供 showPanel / closePanel，没有 Hub 也能独立工作。

## Optional native Shortcut Launcher (API v1 additive capability)

`api.registerShortcutLauncher({ mount })` registers **presentation only** after
`attachPanel()`. The manifest must contribute a Launcher and the same instance must
implement `open()`. It returns `true`; a revoked session returns `false`. Duplicate
registration is rejected. An enabled Runtime snapshot exposes only the boolean
`shortcutLauncherAvailable`, never the provider, origin or controller.

```js
activate() {
  api.attachPanel(panel, {icon: productIcon});
  if (api.registerShortcutLauncher) api.registerShortcutLauncher({
    mount({open}) {
      // Synchronous mount. Reuse the application's standalone launcher component.
      const native = createNativeLauncher({onOpen: open});
      return {
        getOrigin: () => native.element, // connected Element in host document
        setActive: active => native.setActive(active), // optional flight feedback
        highlight: () => native.highlight(),           // optional return feedback
        presentation: native.presentation,             // optional shared native motion
        dispose: () => native.dispose(),               // required; remove all resources
      };
    },
  });
}
open() { return api.showPanel(); }
// Close / Back -> api.closePanel(); closing is not deactivation.
```

Hub calls mount only when the local Installed-page “显示悬浮球” preference is on
(default off). `mount` receives a frozen object with **only `open()`**. Use this
callback for shortcut clicks rather than `showPanel()` directly: it captures the
shortcut origin and requests `open()` on the existing Extension instance. No
second factory, settings store, task or main panel is created. Treat `open()` as
an asynchronous request; its result is the existing Runtime `{ok, ...}` result
(or `false` once revoked). Do not rely on a callback `this` receiver.

The Extension owns appearance, hover/press, pointer/drag/dock, position storage,
and DOM cleanup. `dispose()` must synchronously detach the entry and its UI handlers;
register asynchronous business cleanup separately with `api.onCleanup`. `getOrigin()` supplies an explicit node; Hub measures it but
never scans third-party DOM or rewrites handlers. Native entries stay visible
through opening and closing; `setActive` is press/glow feedback, not replacement
of the entry. A non-round native launcher is supported.

### Shared Native Floating Presentation

Presentation is selected by **entrance**, not by the presence of Hub. An optional
`presentation` on the mounted handle lets an application reuse exactly its own
Standalone floating presentation for Hub Shortcut. Polisher is the reference.
All four methods must be supplied:

- `place(panel)`: synchronously fit the attached panel beside the native entry.
- `run(panel, opening)`: animate open (`true`) or close (`false`), returning a
  Promise that settles after animation. Keep the orb visible; own native drag /
  follow and visual cleanup. Do not change navigation or business state.
- `cancel()`: synchronously cancel flights, clean temporary visuals and settle
  outstanding animations. The lifecycle still completes at its current endpoint.
- `release()`: cancel and stop following the panel after close/revoke; keep the
  native entry mounted. Must be safe after cancellation/disposal.

Callbacks receive only the Extension's own attached panel and the opening
boolean, with no `this` receiver, Runtime record, origin object or Hub controller.
Hub owns hidden/inert state, focus, transition serialization, origin return and
Extension lifecycle. Native presentation owns geometry, motion, splash, and
drag-follow. It must not independently hide/remove a Hub-owned panel when the
Shortcut is toggled off. Dispose only its presentation resources and entry.

Honeycomb opens always use Hub Surface Motion, even when that Extension also has
a native presentation. Repeated opens retain the first entrance. A removed mount
is never rebound to a new mount; close falls back to its captured origin. Older
Shortcut providers without this optional object retain the existing Hub fallback.
There is no change to `attachPanel/showPanel/closePanel` or API v1 identity.

Provider failure is isolated within the current Surface. A synchronous `place()`
exception is reported and falls through to Hub geometry. A thrown/rejected `run()`
or a `run()` Promise still pending after **5000ms** triggers cancel/release and the
existing Hub Surface Motion fallback, completing the requested open/close. The
failed presentation is not called again for that Surface's close; a new explicit
open may retry. The 5-second bound is a liveness deadline, not an animation token.
Cleanup errors are reported without blocking navigation; cleanup Promises are not
awaited. Success, resize, revoke and dispose clear the deadline. Late settlement
cannot change Hub's completed transition or start another fallback.

Providers must return control promptly and clean up their own temporary DOM and
effects. As with other API v1 callbacks, they execute in the page's JavaScript
realm: a timeout can bound an awaited Promise, but cannot preempt a synchronous
infinite loop or undo arbitrary DOM mutations made later by third-party code.

Honeycomb always keeps its own entry. Both entrances share one panel. Reopening
an already visible panel focuses it and retains its original opening origin.
Shortcut close uses current native rect, then viewport-clamped snapshot, then
safe fade/scale. It returns to the pre-open Hub visibility and scroll state;
explicitly asking to open Hub still opens Honeycomb. Resize cancels stale flights
and completes the lifecycle. Disabling or unmounting an origin cannot prevent
closing an already open panel.

`miemie_hub_shortcuts_v1` is Hub-local UI preference keyed by Extension ID.
Disable retains it, re-enable restores it, source replacement/update retains it,
confirmed package uninstall or explicit Runtime uninstall removes it. A missing
capability ignores old preference. Hub disposal unmounts all shortcuts. Polisher
shares `miemie_polisher_dock_v1` between native Standalone and Shortcut modes;
this is separate from the Hub legacy Dock key.

This capability is optional for official **and third-party** extensions. No
capability means no switch and no behavior change. It is unrelated to Catalog
Product Type, Distribution or Official/Community classification.

## Optional Native Window Ownership (API v1)

This optional additive capability is available in the Hub 0.8.3 source. API and
Package identity remain v1. Feature-detect `api.registerNativeWindow` before opting in.
It does not change legacy Shortcut semantics above: legacy `{open}` still calls
Runtime `open()` and uses a Hub-owned Surface, even with native geometry/motion.

After attaching the main panel, register once per session:

```js
if (typeof api.registerNativeWindow === 'function') {
  api.registerNativeWindow({
    open(lease) {
      presentationMode = 'native';
      // Same business instance, original toggle/layout/drag/resize/keyboard.
      // Async animation completions must also check lease.isCurrent().
      toggleMyNativeWindow(lease);
    },
    release() {
      cancelMyNativeAnimationAndPointerGesture(); // synchronous
      presentationMode = 'hub';
    },
    // Optional: only explicitly owned portalled UI outside the attached panel.
    ownsEvent: event => myPortal?.contains(event.target) === true,
  });
}
api.registerShortcutLauncher({mount: ({open}) => mountMyNativeOrb(open)});
// The existing business instance open() continues to use api.showPanel().
```

Requires an attached panel, Manifest Launcher and synchronous `open` / `release`
functions. Registration returns `true`; duplicate/invalid registration throws and
revoked contexts return `false`. Do not wrap these callbacks or `ownsEvent` in
asynchronous `api.guard()`; directly guarded callbacks are rejected. If supplied,
`ownsEvent(event)` must synchronously return a boolean.
The enabled snapshot adds `nativeWindowAvailable`, a boolean only. No provider,
Session, Runtime record, Surface Controller or Hub Origin crosses the API.

The existing Shortcut switch controls one external entry; Honeycomb remains.
Without this capability its explanation is “快捷入口，窗口仍由 Hub 管理”. With
the capability it is “原生窗口，保留扩展自己的操作”. No second preference is added.

For opt-in extensions the mount's existing `open()` callback instead synchronously
hands the attached root to `provider.open(lease)`, returning a Promise containing
`{ok:true}`, `{ok:false,error}`, or false after revocation. Success acknowledges the
callback, not completion of third-party animation. It does not call the factory,
activate, or business Runtime open a second time. Repeated native clicks call the
same provider with the same lease so the original application can toggle itself.

The frozen lease contains only `signal` and `isCurrent()`. It remains valid until
Honeycomb/Runtime open, Shortcut off, disable, withdrawal or Hub disposal. All
native late work checks the lease and Session signal; release synchronously cancels
animations, pending DOM writes, pointer captures/gestures and presentation-only
resources. It must not reinitialize business, clear drafts, remove the main panel
or unmount the orb. Async business cleanup stays in the existing `onCleanup` stack.
Returning a Promise from either callback is a contract error: the root cannot be
safely handed to another owner while its previous owner is still cleaning up.

Honeycomb and public Runtime open first abort the native lease and call release,
then run the existing instance open with Hub layout, motion, Back and focus. The
Hub cancels its active/queued Surface operations before native takeover. Only root
hidden/inert, Surface marker and the eight borrowed layout properties are restored
at handoff; descendants and application business state are never normalized.
Native root layout is retained for a later native open. A release exception blocks
the Hub open and reports the error; normal navigation does not seize that root.
Final Session revocation still removes its capability and proceeds with cleanup.

While native owns the root, Hub hide/layout/viewport handling does not write it.
Native owns visibility, layout, dragging, resizing, toggle, motion, Esc and focus.
Runtime still owns enable/disable/uninstall; the Hub's `whenDisposed` remains the
completion boundary for Hub disposal. These modes do not
change Package identity, install/update/uninstall, hashes or persistence checks.

Opening Hub brings its Launcher/system content above native windows and orbs.
Its own foreground shield prevents pointer input through the backdrop, including
outside a system panel. Closing Hub restores native pointer access without changing
native hidden/inert, geometry, drafts or the lease. Coexisting entrances do not
mean a native orb must float over an open Hub. Native HTML modal dialogs retain
the browser's top-layer rules; this stacking policy is for regular windows/orbs.

`showPanel` and `closePanel` are Hub presentation requests. While a native lease is
active they do not take back the native root; show returns false and close does not
close it. To switch to Hub intentionally use the existing public Runtime open.
An opt-in adapter must distinguish presentation mode from “Hub API exists”, and
guard deferred business open work against a mode change. The lease is cooperative,
not a sandbox that can undo arbitrary unguarded third-party DOM writes.

The existing Hub key handler delegates events from the native root, current orb,
their focused descendants or explicitly declared portals. No global keyboard router
or new resident key listener is installed. Unrelated Hub controls retain their
existing key handling. An extension's native cancel/keydown/keyup implementation
must preserve its own one-press policy; Hub Back handlers run only for Hub Surface.

This is optional migration: old consumers keep existing Runtime/Surface/Shortcut
behavior. It cannot restore private controls in an old adapter that explicitly
disables dragging/resizing whenever `hubApi` exists. Such products need author
adaptation to obtain full Native Window Parity; passing a generic fixture does not
certify an unadapted release. Standalone restoration after Hub disposal continues
to follow [LAUNCHER-PROTOCOL](LAUNCHER-PROTOCOL.md), including `whenDisposed`.

## Optional Back Navigation Capability (API v1)

`api.registerBackHandler(handler)` lets an attached Extension handle an application
Back request before Hub closes its Surface. It is optional for official and
community extensions. **Zero mandatory migration:** an existing API v1 extension
without this capability retains its original Escape, Launcher, Surface, Shortcut
and lifecycle behavior. No Manifest field, API version, Package v1 change,
rebuild or new release is required for those existing consumers.

Register once per Runtime session, after `attachPanel()`, normally in `activate()`.
The method returns `true`; a revoked session returns `false`. A non-function,
duplicate registration or registration before panel attachment throws. Do not wrap
the handler in `api.guard()`: that API is asynchronous and has a different error
boundary. Directly guarded handlers are rejected at registration.

```js
function factory(api) {
  let panel, busy = false;
  // Application-owned state and functions; Hub never sees the internal stack.
  return {
    activate() {
      panel = createMyPanel();
      window.parent.document.body.append(panel);
      api.onCleanup(() => panel.remove());
      api.attachPanel(panel);
      if (typeof api.registerBackHandler === 'function') {
        api.registerBackHandler(request => {
          if (busy) return true;
          if (!hasInternalBackLayer()) return false;
          closeTopmostInternalLayer();
          return true;
        });
      }
    },
    open() { return api.showPanel(); },
  };
}
```

The example's panel/state functions belong to the application. Standalone mode
keeps its own input adapter. On a Hub without the capability, capability detection
leaves the extension's previous behavior intact; it does not grant layered Back.
In capability mode, route internal Back actions to the same application function
and avoid simultaneously claiming Escape in a window capture handler. Ordinary
local key handling (Tab, arrows, etc.) remains the extension's responsibility.

### Synchronous result and request lifetime

- Exactly `true` means **Handled**: the extension consumed the request. Hub keeps
  the Surface open, including while an internal animation or confirmation is busy.
- Exactly `false` means **Unhandled**: there is no internal layer to handle. Hub
  uses the original Surface close and restores the original entrance. A Shortcut
  opened with Hub hidden returns to that hidden state; it need not open Honeycomb.
- Throwing or returning anything else, including a Promise, is a handler fault.
  Hub does not await it or close the draft-containing Surface. Promise rejections
  are observed; ordinary Runtime teardown is not invoked. Hub-owned recovery UI
  offers keeping the interface, retrying Back, or explicitly closing with a warning
  that unsaved editing may be lost. Escape dismisses the recovery UI only.

The frozen request contains only `source` (`'escape'` or `'back-button'`) and
`isCurrent()`. The handler is called as a plain function, not with a Runtime record
as its receiver. `isCurrent()` checks both the Runtime session and the original
Surface/transition identity. After a close, switch, queued navigation, revocation,
or close/reopen cycle, the old request must not authorize more UI work.

An asynchronous confirmation must return `true` immediately. Before its completion
changes UI or calls `api.closePanel()`, check `api.signal.aborted`,
`request.isCurrent()` and the application's own operation identity. Keep internal
busy/closing state until the operation settles; further Back requests should be
consumed while busy. `api.signal` alone is insufficient for close/reopen within one
Runtime session. Hub cannot undo arbitrary late DOM mutations by cooperative code.

```js
api.registerBackHandler(request => {
  if (busy) return true;
  if (!hasUnsavedDraft()) return false;
  busy = true;
  void confirmDiscardDraft().then(discard => {
    if (discard && !api.signal.aborted && request.isCurrent()) {
      return api.closePanel(); // Explicit Close, never re-enters this handler.
    }
  }).catch(showMyError).finally(() => { busy = false; });
  return true;
});
```

The extension owns confirmation, operation identity, cancellation and resources.
Use `api.signal` and `api.onCleanup()` for that work. Runtime clears its handler
reference synchronously on disable, uninstall, source release and Hub disposal,
before asynchronous teardown. Re-enable creates a fresh session and registration.
No handler is stored in the Manifest, package, persistent state or public snapshot.

### Back, explicit close and input boundaries

Hub keeps its document capture keyboard entry. It delegates only to the current
Surface owner's valid handler, irrespective of where the extension's owned dialog
is mounted (including a body portal or Shadow DOM). It does not scan third-party
DOM, infer modal order or maintain an application page stack.

For participating Surfaces, repeated Escape keydowns are consumed without invoking
the handler. The claimed physical press remains consumed after returning to the
Launcher until keyup/blur or a fresh non-repeat keydown. Surface opening/closing
requests are consumed without queuing an internal Back. Independent subsequent
presses work normally, with no time-based cooldown. IME composition is left to the
input system. Unregistered extensions retain the legacy keyboard branch.

Hub consumes the keyboard event and cancels its default before delegation, to
avoid both an application Back and a native dialog cancel from the same Escape.
A `cancel` delivered independently to an extension-owned HTML dialog belongs to
that extension; reuse its own internal one-layer return function and honor
cancelability/busy state. Browser and operating-system close requests are not
universally equivalent to keydown. Browser-specific real-host validation is still
required, especially Safari, focus changes and native dialogs.

`api.closePanel()`, Hub Orb/toggle, explicit `hub.open()` and the historical
`__meemeCombinedUI.back()` bridge retain their original direct navigation behavior;
they do not call a Back handler. Public `__MieMieHub` has no `back()` method.
Extension-owned Back buttons can call the application's own one-layer function
and use `closePanel()` only when that function leaves nothing to handle. Hub's
System Module Back buttons use internal coordination and preserve their original
fallback destinations. System Modules are not Runtime extensions.

No browser history/popstate interception or Android System Back adapter is provided.
This capability does not change Surface/Launcher ownership, native presentation,
factory lifecycle, product identity or Managed Package Compatibility. It is
cooperative error isolation, not a JavaScript sandbox: a synchronous infinite loop
cannot be preempted by a timeout.
