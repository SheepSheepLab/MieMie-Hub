# MieMie Hub Extension API v2

适用于 MieMie Hub Extension API v2。这里只记录现有接口，不增加 Runtime、包管理或权限机制。

本文对应 0.9.0 本地审核候选，尚未发行；正式发布状态与附件见 [GitHub Releases](https://github.com/SheepSheepLab/MieMie-Hub/releases)。[社区开发统一入口](EXTENSION-DEVELOPER-GUIDE.md)帮助选择适配路径。**Runtime Compatibility 与 Managed Package Compatibility 是两个独立 Gate**：本文定义 Runtime、生命周期及展示能力；Package v1 独立校验机器结构，安装／更新目标还必须通过 API2 检查；正式产品与生产 Registry 安装验收仍 Pending。格式与校验见 [Package v1](EXTENSION-PACKAGE.md)。Runtime 注册成功不代表发布包可在线安装。

## 三个独立概念

- **Registered Extension**：Runtime 中的注册记录，可启用、停用、注销。`hub.extensions.uninstall(id)` 只注销 Runtime，不物理删除酒馆助手脚本。“已安装”页同时区分 Runtime 状态与可识别的 Managed Package；物理包操作不属于本页 Runtime API。
- **Launcher Capability**：可选的快捷启动能力，以 `contributes.launcher` 声明。它不决定扩展是否能注册或运行。
- **Managed Package**：物理脚本的安装、更新和卸载，按 [Package v1](EXTENSION-PACKAGE.md) 独立校验。Runtime 能力和 Launcher 显示不决定包管理资格。

## Manifest

Manifest Schema 为 1；`apiVersion` 为 2。可选 `hubApi` 的 min/max 必须是正的安全整数，min≤max，范围包含声明的 API 2。API 1 不在此开发副本的 Runtime 支持范围内，不能以更改版本声明替代实际迁移。

不支持的合法 API 声明以 `api-incompatible` 拒绝；Schema 或 API 类型／范围错误以 `manifest` 拒绝。Runtime 注册拒绝不删除物理脚本。

必填：`schemaVersion: 1`、`apiVersion: 2`、`id`、`name`、`version`。

`id` 使用 2–80 位小写字母、数字、点、下划线或连字符，首字符是小写字母或数字；`name` 是非空文本，最多 80 字符；版本使用合法 SemVer `x.y.z`，无前导零，可带 `-` 预发布后缀；预发布段非空且纯数字段也不能有前导零。当前 Runtime 校验器不支持 `+build` 后缀。此兼容校验范围不作为官方发行命名规则：MieMie 官方产品版本与 Managed Package 版本使用无前导零、无后缀的 `MAJOR.MINOR.PATCH`，只有 Git Tag 使用 `v` 前缀；见 [版本规范](VERSIONING.md)。

`description`、`entry`、`icon` 等元数据保留在 Manifest 中；Runtime 不按这些字段读取文件或下载资源。可选 Launcher 的 `title` 是非空文本、最多 60 字符；可选 `icon` 是最多 16 字符的短文本或 emoji。

```json
{
  "schemaVersion": 1,
  "apiVersion": 2,
  "id": "example.background",
  "name": "后台示例",
  "version": "1.0.0"
}
```

无需声明 Launcher，也无需提供 `open(surfaceLease)`。声明 Launcher 时可增加 `"contributes": {"launcher": {"title": "打开示例", "icon": "🐑"}}`。

## 本地源与注册

脚本访问 `window.parent.__MieMieHub`，先检查 `apiVersion === 2`。Hub 就绪时向父窗口发送 `miemie:hub-ready`，关闭时发送 `miemie:hub-disposed`；两者的 `event.detail` 是相应 Hub 对象。

`hub.whenDisposed` 是该 Hub 实例的 Runtime 有界异步清理完成 Promise。`miemie:hub-disposed` 保持同步通知，不代表所有异步清理已经完成。交接时匹配 `event.detail` 的实例并等待其 `whenDisposed`，避免旧 Session 的任务覆盖恢复后的 Standalone；详见 [Launcher 协议](LAUNCHER-PROTOCOL.md)。Hub 退出会先释放自己借用的面板根节点状态，再按既有 LIFO 顺序执行扩展清理，不归一化业务子节点或扩展自己的显隐状态。

`hub.extensions.provide(manifest, factory)` 提供已加载的本地工厂，返回 `{ok, ready, release}` 或 `{ok:false, error}`。`ready` 是初始注册／启用结果的 Promise。Hub 会按保存的注册与启用偏好处理该源，且保留工厂供 Runtime 注销后的管理页重新注册。首次提供且没有保存偏好时自动注册并启用；已保存的停用或注销选择优先。`release()` 返回 `Promise<void>`，用于源脚本结束时撤回工厂、清理 Runtime 实例，同时保留用户的注册／启用偏好。Hub 已退出时它不等待 Hub 清理，交接仍须等待该 Hub 的 `whenDisposed`。提供源不等同于安装脚本文件。

也可直接使用 `register(manifest, factory)`；它只产生默认停用的 Runtime 注册记录，不保留独立的本地源。重复 ID 被拒绝。

| 接口 | 返回与作用 |
|---|---|
| `register(manifest, factory)` | 同步结果对象，创建注册记录 |
| `enable(id)` | Promise，创建新实例并 activate |
| `disable(id)` | Promise，撤销实例能力并执行清理，保留注册 |
| `uninstall(id)` | Promise，清理并删除 Runtime 注册；不删除助手脚本和业务数据 |
| `open(id)` | Promise，尝试调用当前实例的 open |
| `list()` / `get(id)` | 状态快照；不存在时 get 返回 null |

上述结果以 `ok` 区分成功和失败；失败通常带文本 `error`，`register` 的 Schema/API 错误还带 `code`。被新意图撤销的 `open` 可返回 `{ok:false,cancelled:true}`；`open` 成功表示回调完成且请求仍有效，不证明外部业务提交成功。`disable`／`uninstall` 成功可带 `cleanupError`，应检查清理警告。

快照包含 `manifest`、`classification`、`state`、`enabled`、`busy`、`error`、`launcherAvailable`、`launcherError`，以及可选能力的 `nativeWindowAvailable` 布尔值。顶层 `classification` 来自 Host 可信元数据，独立于 Manifest 自声明。`state` 为 disabled/enabling/enabled/disabling/uninstalling/error，刚注册时为 disabled；注销通知使用 uninstalled，记录删除后 get 返回 null；`busy` 只表示启停或注销过渡，不覆盖窗口打开。`hub.ready` 表示随包扩展初始处理完成，不代表所有外部脚本已加载。

## 工厂与生命周期

`factory(api)` 返回生命周期对象，也允许异步返回。`activate()`、`deactivate()` 可选，存在时必须是函数；`open(surfaceLease)` 是可选 UI 能力。每次重新启用会创建新实例。扩展应在 activate 中获取资源，用 deactivate／onCleanup 释放，使用 signal 和 guard 阻止迟到任务继续工作。

Runtime 按普通函数调用 `factory(api)`，不提供内部记录作为 `this`。严格模式的普通 factory 收到 `undefined`；非严格函数、箭头函数或显式绑定函数遵循 JavaScript 自身的 `this` 规则。生命周期方法的接收者仍是扩展返回的 instance。扩展不能依赖或修改 Runtime 私有记录；`api.manifest`、注册结果、`get/list` 和状态事件提供副本，instance 自报的 `classification` 不改变平台身份。

| 扩展上下文 | 作用 |
|---|---|
| `api.manifest` | Manifest 副本 |
| `api.signal` | 实例取消信号；停用／卸载时立即 abort |
| `api.onCleanup(fn)` | 返回 fn；登记逆序清理，单个失败不阻止其余清理；Session 已结束时立即安排有界清理 |
| `api.guard(fn)` | 返回始终产生 Promise 的包装函数；实例失效返回 false，普通回调异常进入扩展级错误清理 |
| `api.showMessage(text)` | 仅启用实例可显示文本，成功返回 true，失效返回 false；有效实例传非文本抛错 |
| `api.attachPanel(panel, {icon})` | 登记本实例的一个主面板，成功返回 true，失效返回 false；重复或无效面板抛错 |
| `api.showPanel(surfaceLease)` | 从所属 Launcher 打开展示已挂载面板，返回 `Promise<boolean>` 或无效时的 false |
| `api.closePanel(surfaceLease)` | 关闭当前实例自己的 Surface、返回原 Launcher；不触发生命周期停用；返回 `Promise<boolean>` 或无效时的 false |

`onCleanup`／`guard` 的参数必须为函数，否则抛错。有效实例在未 attachPanel 时调用 showPanel 会抛错；closePanel 在没有面板时返回 false。

扩展自行负责事件、Hook、请求、计时器、业务 DOM、对象 URL 等资源。Hub 不会自动追踪所有宿主副作用。默认生命周期等待超时为 10 秒，单项 onCleanup 等待最多 2 秒；超时无法强制中断任意 JavaScript。这是协作式运行机制，不是沙盒。

无 Launcher 的后台扩展可以完整注册、启停和卸载。有 Launcher 但缺少可调用 open 时，扩展仍启用，快捷入口不可用，并记录警告。打开抛错或超时仅记录“扩展界面打开失败”，不停用、清理该扩展。显式停用、其他业务回调报错仍遵循原生命周期规则。

## 版本与消费者

Hub API 版本当前为 2；Hub 产品版本与扩展产品版本分别维护。扩展通过公开全局接口和事件协作，不依赖 Hub 源文件或私有 controller。实际已验证的版本组合及产物校验值见 [测试说明](TESTING.md)。各项能力按需选择；普通社区作品无需全部实现。


## 随包扩展

随包时间线使用标准 API v2 Manifest、provide 和生命周期。构建资源封装不是新的宿主权限。见 [Core 架构](CORE-ARCHITECTURE.md)。

## Surface Lease

`hub.extensions.open(id)` 是新的用户打开意图。Runtime 在接收请求时、进入实例队列前创建 Surface Lease，并传给 `instance.open(surfaceLease)`。请求出队不会重新授权。Source Lease、Session signal、Surface Lease 和 Native Lease 分别管理来源、实例生命周期、一次 Hub 展示请求和原生展示控制权。

Surface Lease 是不可变对象，包含 `signal` 与 `isCurrent()`。Runtime 核对 Session 和对象身份，Surface 再核对 Owner、面板登记和当前请求。无参数、伪造、跨 Owner、失效 Session 或旧请求调用 show/close 均返回 false。

- `api.showPanel(surfaceLease)`：有效时显示已挂载面板，使用蜂窝布局与动画；重复使用同一有效请求不创建业务实例。
- `api.closePanel(surfaceLease)`：有效时直接关闭所属 Surface、返回蜂窝，不分派 Back Handler。开始关闭即撤销请求；重复使用同一 Lease 返回 false，不复用关闭任务。
- 新的导航、Native 接管、关闭、停用、卸载、Source release、Hub dispose、打开超时会使相应旧请求失效。
- 异步代码在 await 后、DOM 写入前检查捕获的 Lease。不要在旧回调中调用 Runtime.open 来人为生成新权限。
- 业务生命周期与展示请求分离。关闭窗口不取消后台业务或清空草稿；异步业务写入仍应使用业务自己的提交/角色一致性保护。

```js
function factory(api) {
  let panel, currentSurface;
  return {
    activate() {
      panel = parent.document.createElement('section');
      const close = parent.document.createElement('button');
      close.textContent = '返回';
      close.dataset.close = '';
      panel.append(close);
      panel.hidden = true;
      parent.document.body.append(panel);
      api.attachPanel(panel);
      panel.querySelector('[data-close]').onclick = () => api.closePanel(currentSurface);
      api.onCleanup(() => panel.remove());
    },
    open(surfaceLease) {
      currentSurface = surfaceLease;
      return api.showPanel(surfaceLease);
    }
  };
}
```

Hub 只借用显式 attachPanel 根节点的展示字段，不重建业务子节点。detach 在 Session 撤销时同步发生；Hub dispose 时归还借用前的根节点字段，随后执行扩展清理。若 Native release 失败，Hub 不覆盖仍由失败控制器占用的根节点；Session 最终清理仍由扩展负责。

## Unified Native Window

`api.registerNativeWindow({mount, open, release, ownsEvent?})` 在 `attachPanel()` 后注册一次，要求 Manifest 声明 Launcher。成功返回 true，Session 失效时返回 false；缺少面板／Launcher、重复注册或回调类型错误会抛错。全部为同步协作式回调；不可使用异步 `api.guard()` 包装。实际挂载入口还要求实例处于 enabled、Launcher 可用（提供可调用的 `instance.open(surfaceLease)`）且用户偏好 ON；仅注册 Native 能力不会自动挂载。没有独立原生窗口的扩展（如 Bundled Timeline）无需注册。

下面是最小同步示例，放在上例 `activate()` 的 `attachPanel()` 后；Manifest 还需声明 Launcher。真实产品应在自己的窗口函数中实现完整原生行为；本例仅演示控制权与清理。

```js
api.registerNativeWindow({
  mount({open, signal}) {
    const orb = parent.document.createElement('button');
    orb.textContent = '打开我的工具';
    orb.onclick = () => { void open(); };
    parent.document.body.append(orb);
    signal.addEventListener('abort', () => { orb.onclick = null; }, {once:true});
    return {getOrigin: () => orb, dispose() { orb.remove(); }};
  },
  open(nativeLease) {
    if (!nativeLease.isCurrent()) return;
    panel.hidden = !panel.hidden;
    panel.inert = panel.hidden;
    // 异步动画应捕获此 Lease，在每次 await/rAF 后、写 UI 前再次检查。
  },
  release(nativeLease, reason) {
    // 此时 Lease 已失效。真实产品还须同步取消手势、动画及所有待写 UI。
    panel.hidden = true;
    panel.inert = true;
  }
});
```

本例的“返回”按钮仅用于 Hub Surface。原生模式的关闭按钮应调用扩展自己的窗口关闭函数，不能用失效的 Surface Lease 关闭 Native 展示。可选 `ownsEvent(event)` 同步返回 boolean，声明本扩展 Portal 等事件归属；只有严格 true 认领事件，异步结果不会获得归属。

`mount` 同步返回含 `getOrigin()`、`dispose()` 的句柄；`getOrigin()` 必须同步返回已连接到宿主 document 的 Element，`dispose()` 必须同步完成。回调不依赖 provider 或句柄的 `this`，需要的状态用闭包保存。挂载前必须先把入口加入 document。传入 mount 的 `open()` 返回 Promise：有效调用得到 `{ok:true}` 或 `{ok:false,error/cancelled}`，入口失效等情况得到 false；它不是 `instance.open(surfaceLease)`。Mount signal 先 abort，后调用 dispose；旧 mount 的 open 回调失效。`getOrigin` 只提供当前入口的事件归属，不再给 Hub 提供外球几何/动画或焦点恢复目的地。

`open(nativeLease)` 同步接受 Native 控制权；异步动作由扩展自行启动并校验 Lease，不返回 Promise。重复 Native 点击可以复用有效 Native Lease，但每次点击仍取消旧 Hub 请求。Lease 包含 `signal`、`isCurrent()`；失效的对象永不恢复有效。

`release(nativeLease, reason)` 必须同步完成，不得返回 Promise。reason 用于区分交接/入口关闭/生命周期撤销等，扩展清理不能仅依赖某个 reason 字符串。Hub 先撤销 Lease，再调用 release。抛错或异步返回会进入 blocked：保留独占根节点保护，不夺取窗口、不清空草稿、不重建业务。可通过后续合法 Hub/Native 操作或扩展中心“重试释放窗口”再次同步释放；失败保留可见错误，成功才交还展示权。

原生显隐、拖动、缩放、双击、右键、动画、内部 Back、IME、焦点和多视图均由提供者控制。Hub 不扫描第三方 Dialog/Portal/Shadow DOM，不建立功能白名单。普通原生窗口尊重 Hub 系统前景；浏览器 top-layer modal 遵循浏览器规则，不保证能被普通 z-index 覆盖。

### 用户偏好与生命周期

存储键继续为 `miemie_hub_shortcuts_v1`，其中 v1 是存储格式标记。默认 OFF；ON 挂载 Native 入口，OFF 撤销入口并尝试同步 release，不停止业务。release 失败时 OFF 表示入口已撤销，扩展中心同时显示窗口未完成释放及重试按钮。

挂载失败保留 ON 意图和错误，普通刷新不自动重试；用户 OFF/ON 可显式重试。disable、Source release、Hub reload 保留偏好；明确 Runtime uninstall 清除该 ID 的入口偏好。存储写入失败不会挂载或伪造已保存的 ON。

## Optional Back Navigation

`api.registerBackHandler(handler)` 允许扩展在 Hub 关闭自己的 Surface 前处理一次内部返回。它是可选的 API2 能力，官方与社区扩展使用相同契约；不增加 Manifest 字段，不改变 Package v1。没有注册处理器的 API2 扩展继续使用默认 Surface 关闭路径，不自动获得逐层 Back、长按抑制或下述 opt-in 输入保护。

### 注册与同步结果

在 `api.attachPanel(panel)` 成功后、每个 Runtime Session 内注册一次，通常放在 `activate()` 中。成功返回 `true`；Session 已撤销时返回 `false`。未挂载面板、非函数、重复注册会抛错。不要用 `api.guard()` 包装 Back Handler：guard 始终返回 Promise，且异常边界是扩展级清理；直接传入该包装函数会被拒绝。

处理器以普通函数调用，不以 Runtime 内部记录作为 `this`。参数是冻结对象，仅含：

| 字段 | 契约 |
| --- | --- |
| `request.source` | Hub 当前分派的来源为 `'escape'` 或 `'back-button'`；后者也用于恢复界面的“重试返回”。它不是浏览器或操作系统 Back 的通用枚举。 |
| `request.isCurrent()` | 同步返回该 Runtime Session 仍有效、仍启用且原 Surface／导航过渡上下文仍有效与否。它不是新的 Lease，也不是一次业务提交授权。 |

处理器必须同步返回**严格 boolean**，不能返回 `async` 函数产生的 Promise：

| 返回／异常 | Hub 行为 |
| --- | --- |
| `true` | Handled；请求已消费，Hub 不执行默认关闭。可用于关闭一个内部层级，或在应用动画／确认忙碌时保留当前界面。 |
| `false` | Unhandled；只有请求仍有效，才执行原 Surface 返回，回到蜂窝 Launcher。若处理器已切换界面或撤销 Session，不继续关闭新界面。 |
| 抛错、非 boolean、Promise | 处理失败；消费请求并保留当前界面，不按 false 关闭，不调用普通 guard 的 Runtime teardown。Promise 拒绝会被观察，但 Hub 不等待它完成。 |

Hub 不读取扩展的页面栈。下面的 `layers`、按钮和一层返回函数都属于应用；实际产品应替换成自己的业务层级。同一个应用内返回按钮可调用同一函数，只有没有内部层级时才显式关闭 Surface。

```js
function backFactory(api) {
  const doc = parent.document;
  const panel = doc.createElement('section');
  const back = doc.createElement('button');
  const layers = ['详情', '编辑'];
  let currentSurface;
  function backOneLayer() {
    if (layers.length === 0) return false;
    layers.pop();
    panel.dataset.depth = String(layers.length);
    return true;
  }
  return {
    activate() {
      back.textContent = '返回';
      panel.append(back);
      panel.hidden = true;
      panel.dataset.depth = String(layers.length);
      doc.body.append(panel);
      api.attachPanel(panel);
      api.registerBackHandler(() => backOneLayer());
      back.onclick = () => {
        if (api.signal.aborted || !currentSurface?.isCurrent()) return;
        if (!backOneLayer()) return api.closePanel(currentSurface);
      };
      api.onCleanup(() => { back.onclick = null; panel.remove(); });
    },
    open(surfaceLease) {
      currentSurface = surfaceLease;
      return api.showPanel(surfaceLease);
    }
  };
}
```

在 Hub Surface 模式下，不要同时用应用的 window capture Escape 处理器争抢同一次输入。普通 Tab、方向键及业务输入仍由扩展负责；Standalone 和 Native 模式保留各自的输入适配与内部 Back。

### 请求有效期、异步确认与 Surface Lease

Back 请求复用当前 Surface 的 owner、登记对象、导航 serial 和过渡身份，并叠加 Runtime Session 检查。关闭、切换、更新的导航意图、关闭后重开、Session 撤销或 Hub dispose 会使相应旧请求失效；失效请求不能授权后续 UI 操作。窗口 resize 取消动画不等于结束 Session，也不能一概当作 Back 请求取消。

`request.isCurrent()` 不表示“这是最后一次 Back”：在没有导航或生命周期变化的同一 Surface 上，再次 Back 不一定使前一个请求失效。应用应维护自己的 busy／操作身份，忙碌期间同步返回 true，避免重复确认；不能依靠固定冷却时间代替一层返回规则。

Runtime Session 可以跨多次打开持续存在；`api.signal` 没有 abort 不表示旧界面仍有权写入。异步确认必须立即返回 true，在完成后、写 UI 或关闭前同时检查：Session signal、原 Back request、当时捕获的 Surface Lease，以及应用自己的操作身份。不要在旧回调里重新读取最新 Lease 来代替捕获值，也不要调用 Runtime.open 为旧任务重新取得权限。

以下函数是应用的确认适配器，应在 attachPanel 后调用一次，替代上例的 registerBackHandler，而不是重复注册。`getSurfaceLease` 读取 `instance.open(surfaceLease)` 最近保存的 Lease；其余函数是应用自身提供的草稿检查、确认窗口和错误显示，不是 Hub API。确认窗口必须自行处理 signal 取消、资源释放及用户选择。

```js
function installDraftBack(api, {
  getSurfaceLease, hasUnsavedDraft, confirmDiscardDraft, showError
}) {
  let pending = null;
  api.onCleanup(() => { pending = null; });
  api.registerBackHandler(request => {
    if (pending) return true;
    if (!hasUnsavedDraft()) return false;
    const lease = getSurfaceLease(); // 捕获当前请求，不能在迟到回调中换成新 Lease。
    const operation = {};
    pending = operation;
    const valid = () => pending === operation && !api.signal.aborted &&
      request.isCurrent() && lease?.isCurrent() === true;
    void Promise.resolve().then(() => {
      if (!valid()) return false;
      return confirmDiscardDraft({signal: api.signal});
    }).then(discard => {
      if (discard === true && valid()) return api.closePanel(lease);
    }).catch(error => {
      if (valid()) showError(error);
    }).finally(() => {
      if (pending === operation) pending = null;
    });
    return true;
  });
}
```

示例不自动删除草稿；取消或无效结果保留 Surface。应用若需改变业务数据，仍须自己的事务／版本检查；展示 Lease 不是数据保存许可。异步确认自身的错误由应用处理，不能依赖同步 Back 错误恢复捕获稍后的业务异常。`showError` 应安全显示错误，不再次抛错。Hub 无法撤销任意第三方迟到 DOM 写入，也无法中断同步无限循环；这是协作式错误隔离，不是 JavaScript 沙盒。

### 错误恢复与显式关闭

处理器抛错或返回错误类型时，Hub 的恢复界面提供“保留界面”“重试返回”“关闭当前界面”；显式关闭前提示可能丢失未保存编辑。业务实例不因 Back 错误被停用，Hub 不清空草稿；这不保证能撤销处理器自身已经做出的业务修改。

Escape 或恢复 Dialog 自身的 `cancel` 只关闭恢复界面，不再次执行应用 Back。“重试返回”建立当前上下文并再次分派；“关闭当前界面”直接关闭仍有效的原 Surface。过期恢复按钮不能关闭后来打开的界面。若浏览器无法显示 modal，Hub 报告错误并保留显式导航路径。

`api.closePanel(surfaceLease)` 是显式关闭，不重新进入 Back Handler。必须传入所属 Session、当前有效且与本次打开对象身份一致的 Lease；缺失、伪造、跨 Owner 或旧 Lease 返回 false。有效调用返回关闭结果的 Promise，开始关闭就撤销该 Lease，重复关闭不能复用它。关闭 Surface 不等于停用 Runtime，也不自动删除业务数据。

Hub 主球／toggle、公开 `hub.open()` 以及已有 `__meemeCombinedUI.back()` 桥接执行直接导航，不调用 Back Handler。公开 `__MieMieHub` 没有 `back()`，其 `extensions` 也不公开 `requestBack()`。System Module 的返回按钮使用 Hub 内部协调及原来的回退目的地；System Module 不是 Runtime Extension。

### Escape、输入与原生 Dialog 边界

Hub 复用宿主 document capture 的键盘入口。对已注册 Back 的 Surface、参与协调的系统界面及错误恢复界面：

- 独立非重复 Escape keydown 处理一次。repeat keydown 被消费，不再次调用处理器；即使未观察到首个 keydown，也不把 repeat 当成新的 Back。
- 已认领的一次长按在返回 Launcher 后仍保持消费，直到 Escape keyup、宿主 blur 或新一次非重复 Escape keydown。keyup／blur 只释放认领，不触发第二次返回；新非重复 keydown 可恢复丢失 keyup 的情况。关闭 Hub 或转交 Native 事件时也清理该认领。
- Surface 打开／关闭过渡中的请求被消费，不排队补发内部 Back；等界面就绪后独立的新按键正常工作。
- 新的 `isComposing` Escape 留给输入法，不执行 Back、不取消默认行为。已被 Hub 认领的长按 repeat 优先保持消费，不能把“IME 保护”解释成所有事件顺序下的绝对放行。
- 在 Hub capture 处理前已经 `defaultPrevented` 的 Escape 不分派 Back；Hub 仍消费该事件并认领按键，避免后续 repeat 穿透。它无法预知之后才运行的处理器是否打算消费事件。

Hub 在委托前 `preventDefault()` 并停止同一事件后续传播，避免一次 Escape 同时触发应用返回和浏览器 Dialog cancel。未注册 Back 的 Surface 继续默认 capture／关闭行为，不能把上述 opt-in 保护推广到它。

扩展自己的 HTML Dialog 若独立收到 `cancel`，该事件仍归扩展；应用应按 cancelability、busy 和内部层级决定是否阻止默认关闭，并复用自己的一层返回函数。不要假设每个 cancel 都伴随 Hub 能看到的 keydown，也不要让一次已消费的 Escape 再减少一层。Hub 不为第三方 Dialog 安装统一 cancel 管理器。

### Portal、Shadow DOM 与 Native Window

Hub Surface 的 Back 分派依据**当前 Surface owner**，不从 DOM 祖先推断业务层级。到达宿主 document 的事件即使来自 body portal 或 closed Shadow DOM，也使用当前 owner 的有效处理器。Hub 不扫描第三方 DOM、推断 modal 顺序或建立应用页面栈；未传播到该 document 的 iframe／非 composed 事件不在这项分派保证内。

Native 所有权有效或释放失败仍在保护根节点时，来自声明的主面板、当前原生入口、其焦点子树，或 provider 的 `ownsEvent(event)` 严格同步返回 true 的事件，由 Native 提供者处理。`ownsEvent` 用于额外原生 Portal 等的事件归属，不是 Hub Surface Back 的注册条件，也不是业务功能白名单。Hub 正在显示自己的 Back 错误恢复界面时，优先处理该恢复界面的输入。

Native Window 的内部 Back、keydown／keyup、Dialog cancel、IME、焦点及已知、未知或未来新增交互由扩展自己的实现管理。Hub 不分派其 Hub Surface Back Handler，不要求 Core 为每一种原生功能新增分支。Hub 展开时的前景层级与指针遮罩不意味着取得 Native 键盘控制权；普通原生窗口和入口遵守系统前景，HTML modal 仍遵守浏览器 top-layer 规则。

Hub 不拦截浏览器 history／popstate，也不提供 Android System Back 或通用操作系统返回适配。浏览器和系统关闭请求不能一律等同于 Escape keydown。真实浏览器、Safari、输入法、焦点切换和 Native Dialog 必须分别验收；已覆盖测试不保证未知第三方没有缺陷。

### 生命周期清理与焦点

disable、Runtime uninstall、Source release 和 Hub dispose 会同步撤销 Session、abort signal 并清除 Back Handler 引用，然后执行既有有界异步 teardown。扩展仍负责取消自己的确认窗口、监听、计时器和待写 UI，使用 `api.signal` 与 `api.onCleanup()`；Source release 不物理卸载脚本，Runtime uninstall 不删除业务数据。重新启用建立新 Session，重新注册处理器；旧 API／请求不能控制替代实例。处理器不写入 Manifest、Package、持久状态或公开快照。

Hub dispose 移除其 keydown／keyup／blur 监听；反复打开与关闭不新增常驻键盘路由。Hub 关闭回主球；Hub Surface 返回蜂窝恢复对应图标。新焦点、pointer／keyboard 意图、新导航请求或 revoke／dispose 会取消旧的延迟焦点恢复。Native 焦点由扩展管理，Hub 不再把外球作为焦点恢复目的地。异步 Standalone 交接仍须等待原 Hub 的 `whenDisposed`，详见 [生命周期协议](LAUNCHER-PROTOCOL.md)。

## 验证与发布边界

隔离 Fixture 和 Bundled Timeline 通过不能替代官方扩展升级。Runtime Compatibility、Native Parity、Managed Package Compatibility、Registry API v2 和 Registry Origin 各自保留 Gate；Schema / Package / Machine Metadata / Build Identity 都仍为 1。验证方法见 [TESTING](TESTING.md)，升级差异见 [0.9.0 发行说明草稿](RELEASE-0.9.0-DRAFT.md)。
