# 第三方声明

本文件记录 MieMie Hub 当前锁定的第三方依赖及其使用范围。软件代码采用 GPL-3.0-or-later；下列第三方组件保持各自许可证，不被重新授权为 SheepSheep 的代码。

## 产品代码与资源

当前产品源码未识别出复制、内嵌或修改自第三方项目的产品代码。旧版咩咩工具箱迁移代码的来源确认见 [README](README.md)，指定 AI 生成 PNG 的来源与独立使用规则见 [ASSETS-LICENSE.md](ASSETS-LICENSE.md)。

本项目未捆绑第三方字体、图标库或其他媒体库。系统字体与 Unicode emoji 不以字体／图片包形式分发。

## 直接开发／测试依赖

| 组件 | 锁定版本 | 许可证 | 用途 | 是否进入产品 JSON |
| --- | --- | --- | --- | --- |
| [jsdom](https://www.npmjs.com/package/jsdom/v/26.1.0) | 26.1.0 | MIT | Core Panel DOM 测试、Hub + Polisher 组合测试的宿主模拟 | 否 |

`tools/build.mjs` 只使用 Node.js 内置模块，读取本项目源码、样式与图片生成产物；不导入或打包 npm 依赖。Node.js 运行时、`node_modules/` 及测试报告本身也不随产品 JSON 分发。

## 锁定的完整 npm 开发依赖清单

以下共 39 个包（包括直接依赖 jsdom），全部在 `package-lock.json` 中标记为开发依赖。版本和许可证标识来自该锁文件及本地对应包的元数据；此表不取代各包随附的完整版权与许可证文本。

| 包 | 版本 | 包声明的许可证 |
| --- | --- | --- |
| `@asamuzakjp/css-color` | 3.2.0 | MIT |
| `@csstools/color-helpers` | 5.1.0 | MIT-0 |
| `@csstools/css-calc` | 2.1.4 | MIT |
| `@csstools/css-color-parser` | 3.1.0 | MIT |
| `@csstools/css-parser-algorithms` | 3.0.5 | MIT |
| `@csstools/css-tokenizer` | 3.0.4 | MIT |
| `agent-base` | 7.1.4 | MIT |
| `cssstyle` | 4.6.0 | MIT |
| `data-urls` | 5.0.0 | MIT |
| `debug` | 4.4.3 | MIT |
| `decimal.js` | 10.6.0 | MIT |
| `entities` | 6.0.1 | BSD-2-Clause |
| `html-encoding-sniffer` | 4.0.0 | MIT |
| `http-proxy-agent` | 7.0.2 | MIT |
| `https-proxy-agent` | 7.0.6 | MIT |
| `iconv-lite` | 0.6.3 | MIT |
| `is-potential-custom-element-name` | 1.0.1 | MIT |
| `jsdom` | 26.1.0 | MIT |
| `lru-cache` | 10.4.3 | ISC |
| `ms` | 2.1.3 | MIT |
| `nwsapi` | 2.2.28 | MIT |
| `parse5` | 7.3.0 | MIT |
| `punycode` | 2.3.1 | MIT |
| `rrweb-cssom` | 0.8.0 | MIT |
| `safer-buffer` | 2.1.2 | MIT |
| `saxes` | 6.0.0 | ISC |
| `symbol-tree` | 3.2.4 | MIT |
| `tldts` | 6.1.86 | MIT |
| `tldts-core` | 6.1.86 | MIT |
| `tough-cookie` | 5.1.2 | BSD-3-Clause |
| `tr46` | 5.1.1 | MIT |
| `w3c-xmlserializer` | 5.0.0 | MIT |
| `webidl-conversions` | 7.0.0 | BSD-2-Clause |
| `whatwg-encoding` | 3.1.1 | MIT |
| `whatwg-mimetype` | 4.0.0 | MIT |
| `whatwg-url` | 14.2.0 | MIT |
| `ws` | 8.21.3 | MIT |
| `xml-name-validator` | 5.0.0 | Apache-2.0 |
| `xmlchars` | 2.2.0 | MIT |

`tldts` / `tldts-core` 使用 Public Suffix List 数据；包代码声明 MIT，不代表其内含数据都重新成为 MIT。[Public Suffix List 上游数据](https://publicsuffix.org/list/public_suffix_list.dat)带有 MPL-2.0 声明。此数据仅用于本地测试依赖，不进入 Hub 产品 JSON；如以后分发这些依赖或其派生数据，应核对实际数据版本及相应声明。

`saxes` 6.0.0 的 ISC 标识来自包元数据；当前本地安装包中未发现单独的 LICENSE 文件。这里不虚构一份以该作者名义发布的许可证；若未来需要随产品或源码包一起分发该依赖，应先核实其完整上游声明。

仓库目前只记录依赖清单与锁文件，不收录第三方包源码。本文件不是用于重新分发整个 `node_modules/` 的完整许可证集合。未来如实际复制或打包依赖，应按对应版本补齐其版权、许可证和适用 NOTICE；也不能把 jsdom 的 MIT 文本视为所有传递依赖的统一授权。

## jsdom 的原始 MIT 声明

以下按当前安装的 jsdom 26.1.0 `LICENSE.txt` 原文保留：

```text
Copyright (c) 2010 Elijah Insua

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
```

## 运行环境

产品调用酒馆助手、SillyTavern 及浏览器提供的宿主接口；这些宿主实现不包含在本项目生成的 JSON 中。本文件不替宿主项目声明许可证，也不表示本项目获得了它们的官方背书。
