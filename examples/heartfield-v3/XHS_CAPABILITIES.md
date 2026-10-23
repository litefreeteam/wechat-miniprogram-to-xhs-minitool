# 平台能力集成矩阵

文档来源：https://miniapp-sandbox.xiaohongshu.com/minitool/doc （最后更新 2026-10-22）

| 功能 | 版本门槛 | 游戏用途 | 异常/无 SDK 降级 |
|---|---|---|---|
| `getLaunchOptions` | SDK 可用时 | `buildVersion` 末三位忽略 | 版本视为 0 |
| `postNote` | 已提供方法 | 图片+短标题+挑战码带入笔记编辑页 | 隐藏按钮，浏览器可下载 PNG |
| `saveImageToPhotosAlbum` | 已提供方法 | 保存战报 | 本地下载尝试，提示用户权限失败 |
| `writeTempFile` | 已提供方法 | 大图先换临时 filePath | 笔记/相册回退 data:；评论禁用 |
| `interactionOpenApi` | 9.49+ | 评论区 PK 图+草稿+挑战参数快照 | 不显示评论按钮 |
| `getStorage/setStorage/removeStorage` | 9.46+ | 续局和历史（JSON 字符串） | 低版本带异常处理的 localStorage |
| `getWindowInfo` | 9.49+ | 顶部原生按钮+底部安全区 | 原 CSS 固定操作栏 |
| `vibrateShort` | 9.50+ | 踩雷/插旗/安全格轻触反馈 | 静默跳过 |
| `start/stopGyroscope` + `on/offGyroscopeChange` | 9.50+ | 可选背景视差，不影响点选 | 隐藏体感按钮 |
| `getFollowStatus/followAuthor` | 9.51+ | 游戏作者关注/返回前台刷新 | 隐藏关注入口 |
| 定位、AI、文件系统 | — | 对这款游戏无必要 | **不调用** |

注意：评论里的 `miniToolSnapshotInfo` 是轻量的上下文信息，并不等于实时同步，也不保证评论回流的系统启动字段形式；用户可凭评论正文的挑战码在首页手动重新输入同题挑战。