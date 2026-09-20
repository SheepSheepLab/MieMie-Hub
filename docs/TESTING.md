# Hub 测试与产物兼容验证

本次系统入口验证：Hub **0.2.0-alpha.3**，Polisher **1.0.1-hub.2**。基础测试 `npm test` 共 **28 项通过**：18 项原 Runtime 测试、4 项 Core／时间线／导出身份兼容测试、6 项新增 Core 面板 DOM 测试。

## 独立运行

```sh
npm ci
npm run build
npm test
```

不需要另一个项目的目录、源码或 JSON。`pretest` 自动生成当前 Hub 产物，不依赖已提交的 build。测试夹具只包含原工具箱的时间线业务区段和导出元数据，来源见 `tests/fixtures/README.md`。

`tests/core-panels.test.mjs` 使用项目锁定的 `jsdom`，在模拟的酒馆助手 iframe 中执行本次完整 Hub 产物，覆盖：

- 扩展中心、设置、时间线、扩展管理与 Hello Mie 入口共存；新增 Core 入口不进入 Runtime 注册列表。
- 设置页版本同时等于 `package.json` 和运行中 Hub 的版本，初始更新状态为「尚未检查」。
- 多次点击检查更新仅显示「在线更新服务尚未接入」；宿主与脚本 iframe 的 fetch、XHR、Beacon、WebSocket、EventSource 均被测试替身阻止并记录，断言请求为零。
- 时间线与 Hello Mie 的 Launcher 仍可打开，停用／启用 Hello 不影响 Core 入口。
- 反复打开、返回、主球关闭、Escape 和快速切换不新增面板或重复监听。
- 移除脚本后清理 DOM、宿主监听、事件订阅及检查更新回调；重新载入只创建一份新实例。

## 组合测试

```sh
npm run test:integration -- --polisher /absolute/path/咩咩润色工具-Extension-1.0.1-hub.2.json
```

组合测试是显式单独执行的验收步骤，不属于基础 `npm test`。`tests/integration/artifacts.lock.json` 锁定双方的产品版本、助手脚本 ID、文件名与 SHA-256。输入必须是构建产物；默认使用本项目 build 中的 Hub JSON，也可通过 `--hub` 提供同一锁定版本的 JSON。任一校验值不符会在执行脚本前失败，不会自动接受或下载新版本。

默认组合的 SHA-256：

- Hub：`a0140f5f05ed0722e356e9c77a11bbf665d87da47543c738dc8e3abb49d5b300`
- Polisher：`99cfdf386186be770d47e6f840da105095eaf595d4cb0bb3cc7667b7872729e4`

将来测试其他已确认版本时，可评审更新锁定文件，或通过 `--lock /path/to/approved-pair.lock.json` 明确选择其他锁定组合。固定产物来自本地构建或人工获取的对应版本文件；不要把另一仓库源码作为依赖、子模块或相邻路径导入。

测试使用锁定的 `jsdom@26.1.0`，在内存 DOM 中运行两份完整 JSON 脚本，模拟酒馆的角色、变量、世界书、事件和 API。无 HTTP 服务器、真实 API 或真实用户数据读写，也不调用浏览器。额外 URL 请求直接拒绝。结果输出到被忽略的 `test-results/integration.json`。

本次 **27 项组合测试通过**：保留原 25 项，新增两项 Core 入口及更新占位检查，覆盖：

- 新增 Core 入口与锁定的 Polisher Launcher 共存，设置显示实际 Hub 版本；检查更新无请求且不改变扩展状态。
- 旧数据、身份、Launcher 与管理页行为。
- Hello Mie、无 Launcher 后台扩展、Launcher 异常隔离。
- 时间线手动切换、生成事件自动接续，以及其他功能报错后的可用性。
- 润色写回、备份恢复、发送原文；两种模式；提示词编辑和 JSON 导入导出。
- 模型、连接测试、术语、前后置提示词、标签保护、调试与自动处理。
- 重复启停、卸载／重新注册、持久偏好、独立脚本撤回与重载。
- 请求取消、迟到结果隔离、部分初始化失败、Hook 共存与资源清理。
- Hub 单独运行、扩展先加载、Hub 单独重载。

组合测试只读取 Polisher **1.0.1-hub.2** 的既有 JSON，并保持其锁定 SHA-256 不变；未构建或修改 Polisher 项目。Hub 的 Runtime、Launcher 错误隔离、时间线与 Hello Mie 产品源码保持不变。

## 真实酒馆人工检查

jsdom 不验证实际布局、动画、指针拖拽、操作系统文件选择器或真实酒馆助手版本差异。本次模拟测试不能替代真实酒馆验收，建议依次检查：

1. 导入本次 Hub JSON 并搭配既有 Polisher，确认全部子悬浮球出现，桌面与窄屏下文字不遮挡；左右停靠、拖动、缩放后位置正常。
2. 分别打开扩展中心和设置，确认深色／Neon 样式、展开／收起动画、返回和主球关闭正常；快速切换没有残影或多个窗口同时显示。
3. 设置显示 `0.2.0-alpha.3`；点击检查更新只出现未接入提示，浏览器网络面板无该操作产生的请求；重新载入后恢复「尚未检查」。
4. 时间线手动切换及自动接续、润色和翻译各一次、Hello Mie 打开，以及扩展停用／再启用均正常。
5. 在设置或扩展中心打开时停用 Hub，再启用或刷新，确认没有残留面板、重复主球或重复快捷入口。

此前用户完成的 Phase 2 酒馆验收与本次模拟测试是两份不同的证据；当前新 UI 的真实酒馆验收仍待用户执行。
