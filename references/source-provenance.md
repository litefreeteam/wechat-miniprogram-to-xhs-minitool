# 来源与版本基线

## 小红书

用户提供官方文档：

- 标题：小工具容器 · 能力清单
- 最后更新：2026-08-11
- 地址：`https://fe-video-qc.xhscdn.com/fe-platform-file/104101b8323q4m0uaga06277180ac7t8006ptl0e12ek1g`

关键事实：MiniTool 是受限纯 Web 离线容器；无网络；官方 Native API 一览只有 `postNote`、`saveImageToPhotosAlbum`、`writeTempFile`；资源 CSP 和禁用 Web API 以该文档为最高基线。

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
4. 小红书后台/真机实际行为如果与 2026-08-11 文档不同，以当前后台/官方更新为准并更新 Skill。
