# MieMie Hub 开发规范

## Documentation Maintenance Policy

### Document Purpose Preservation

修改任何已有文档前，必须完整阅读原文，确认其原始用途、目标读者、章节结构、写作方式、技术详细程度、历史内容及与其他文档的职责边界。未经 Owner 授权不得改变文档定位：不能把历史设计记录改成当前功能摘要，不能把测试历史文档改成只有命令的指南，也不能把完整 API 参考改成缺少必要细节的速查表。

### Incremental Maintenance

默认以原文为基础进行增量维护。不得为统一风格、压缩篇幅或突出当前版本，删除有效技术说明、历史记录或测试证据。行数减少不是优化目标，行数增加也不代表问题；判断依据是文档职责和技术准确性。需要大规模重写时，必须先报告 Owner 并获得授权。

### Historical Record Preservation

历史设计、测试记录、架构审计和版本验收必须保留当时真实的版本、技术状态、结果及结论。不得将过去改成当前状态，不得追溯将 Pending 改成 PASS，也不得因接口退役而删除真实历史记录。旧接口不再有效时，应增加清晰版本说明并链接当前正式规范，不覆盖原文。需要迁移历史内容时，先取得 Owner 授权，并提供可追溯的归档和导航。

### Document-Specific Writing Style

遵循各文档既有职责和写作方式。docs/EXTENSION-DEVELOPER-GUIDE.md 面向第三方 Extension 作者，应直接介绍当前能力、API、接入方式、生命周期、Manifest、兼容要求、示例和必要技术注意事项；正文无需展开旧架构原因、Shortcut 删除过程、内部阶段或方案讨论。此要求不能推广到 TESTING、APPLICATION-PRESENTATION、CORE-ARCHITECTURE、历史审计、设计记录及其他职责不同的文档，不能把所有 GitHub 文档统一改为简短功能介绍。

### Technical Accuracy

新增或修改的技术内容必须核对实际源码和有效契约，不得凭记忆编写 API。核对函数签名、参数、返回值、错误状态、生命周期、Manifest、版本关系及 Package 格式。当前示例不得把退役接口当作现行接口；历史旧接口示例可以保留，但必须明确适用版本，并指向当前规范。

### Owner Review Required

改变文档定位、大规模删除历史、重建章节结构、迁移历史审计记录或改变产品身份与贡献归属，必须先报告 Owner，未经批准不得实施。完成文档维护后必须提供可审阅 Diff，以及修改前后内容与职责的说明。身份、署名、版权和真实贡献记录继续遵守项目适用的既有规范；本政策不替代这些规范。
