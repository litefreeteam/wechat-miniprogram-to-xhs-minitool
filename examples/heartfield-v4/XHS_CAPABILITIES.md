# 小红书小工具原生能力矩阵（V4.0）

官方文档：https://miniapp-sandbox.xiaohongshu.com/minitool/doc

| 功能 | 接入点 | 条件和回退 |
| --- | --- | --- |
| Storage | 本机续局、历史战绩、相邻格行走位置 | 9.46+ 使用原生 Storage，浏览器使用 localStorage |
| getWindowInfo | 游戏界面顶部和底部原生按钮避让 | 9.49+，失败使用 CSS 安全区 |
| writeTempFile / saveImageToPhotosAlbum | 战报生成与保存 | 图片经临时文件路径交给原生相册保存 |
| postNote | 用户主动发小红书笔记 | 跳转编辑页，由用户自行决定是否发布 |
| interactionOpenApi | 同挑战码评论区 PK | 9.49+，不宣称已自动成功发表 |
| getFollowStatus / followAuthor | 首页关注作者 | 9.51+，无能力时隐藏 |
| 陀螺仪 | 用户主动开启的背景视差 | 9.50+，仅影响装饰，不能改变棋盘触控坐标 |

V4 的路径判定、扫雷、角色移动和奖励逻辑完全离线。真人头像仅在设备内存裁切，不自动上传或持久化。

不接入 AI、支付、外部网络、WebSocket 或真正远程联机。挑战码只复现地雷布局，不表示多人房间。

**上传审核前仍需使用小红书上传页最新改写口令完成官方校验，并在真实手机端验证。** SDK 模拟通过不能代替审核。
