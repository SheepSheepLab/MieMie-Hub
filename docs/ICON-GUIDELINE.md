# MieMie Launcher Icon Guideline v1

作者提供自己有权使用的矩形 PNG、JPEG 或 WebP，建议正方形至少256×256，主体留出约10%安全边距。透明或实色背景均可。无需自己裁圆；不要求使用 MieMie 品牌或角色素材。

Hub负责44px圆形mask、统一间距/边框/阴影、hover及加载失败fallback。独立Launcher可按作者自己的设计；Polisher参考实现为64px圆形球。

优先级：标准 Manifest icon → Catalog 投稿icon → 默认🧩。Manifest相对路径按对应作者仓库Release Tag解析，不能猜测仓库里哪张图片是图标。Runtime原有launcher.icon仍是短文本/emoji；深度适配面板可通过attachPanel的presentation.icon向Hub提供运行期图片。

Registry首版不提供图片上传，不保存用户上传文件。投稿只接受受限GitHub HTTPS图片URL；不接受SVG、data URL、私网URL或Discord临时CDN附件。Discord头像由服务器受限拉取并通过随机公开key输出，头像URL不泄露Discord用户ID。所有图片使用无referrer加载，失败回退，不把作者图片作为HTML执行。

Icon归作者所有，作者负责内容和授权；Catalog收录不转让所有权。Hub自带指定视觉资产单独遵循ASSETS-LICENSE.md。
