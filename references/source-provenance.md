# 来源与版本基线

## 小红书

当前权威来源：

- 标题：小红书 MiniTool 官方文档（运行环境 / 可用能力 / 端能力 JS API / 不可用能力 / WebGL 边界 / FAQ）
- 地址：`https://miniapp-sandbox.xiaohongshu.com/minitool/doc`
- 本 Skill 基线：2026-09-29

历史来源（已被上述文档取代，仅存档）：

- 《小工具容器 · 能力清单》2026-08-11，`https://fe-video-qc.xhscdn.com/fe-platform-file/104101b8323q4m0uaga06277180ac7t8006ptl0e12ek1g`

关键事实（2026-09-29）：MiniTool 是受限纯 Web 离线容器；无网络；兼容基线 Android 8.1 / Chrome 61 + iOS 18.4，交付代码须 ES2017；Native API 含 `postNote`、`saveImageToPhotosAlbum`、`writeTempFile`、`getLaunchOptions`、Storage 系列（9.46+）、文件系统系列（9.49+）、`interactionOpenApi`（9.49+）；浏览器内置存储降级为弱兼容兜底；上传页提供不可被能力清单替代的标准化“改写口令”；资源 CSP 和禁用 Web API 以官方文档为最高基线。

## 微信

API 类型定义基线：

- GitHub：`wechat-miniprogram/api-typings`
- npm：`miniprogram-api-typings`
- 版本：5.2.2
- 2026-07-27 changelog：API definitions 更新到 3.17.0

该仓库说明 `lib.wx.api.d.ts` 随微信官方文档自动生成，适合做静态 API 扫描基线。

## 冲突规则

1. 最新官方平台文档 > 本 Skill。
2. 官方明确禁用 > 任意 feature probe/第三方经验。
3. 官方未明确的标准 Web 能力只可 PROBE + fallback，不写成平台保证。
4. 小红书后台/真机实际行为如果与 2026-09-29 文档不同，以当前后台/官方更新为准并更新 Skill。
