# 微信小程序 / 小游戏 → XHS MiniTool 最大可用能力矩阵

状态含义：`PRESERVE / ADAPT / LOCALIZE / SNAPSHOT / EMULATE_LOCAL / PRECOMPUTE / PRODUCT_REWRITE / PROBE / HARD_BLOCK`。

## 网络与服务端

| 微信能力 | 状态 | 最大可用处理 |
|---|---:|---|
| `wx.request` 固定配置/关卡 | SNAPSHOT | 构建期拉取，转本地 classic JS |
| `wx.request` 实时/用户/订单 | HARD_BLOCK 或 PRODUCT_REWRITE | 本地模式可重写；不能冒充在线 |
| `wx.downloadFile` 固定资产 | LOCALIZE | 迁移期下载进 ZIP |
| `wx.uploadFile` | PRODUCT_REWRITE | 本地 File/Canvas → 保存/发笔记；服务器上传不可 |
| WebSocket/SSE/WebRTC | HARD_BLOCK | 无诚实实时替代 |
| `wx.cloud.callFunction` 纯计算 | ADAPT | 移纯 JS 客户端 |
| 云数据库简单本机 CRUD | EMULATE_LOCAL | IndexedDB/localStorage |
| 云存储固定公共资源 | LOCALIZE | 构建期导出 |

## 身份与用户资料

| 微信 | 状态 | 处理 |
|---|---:|---|
| `wx.login/checkSession` 只为本机存档 | EMULATE_LOCAL | 本地 installId；明确不是账号 |
| 真实 openid/unionid/跨端账号 | HARD_BLOCK | 无等价平台身份 |
| 用户昵称头像 | PRODUCT_REWRITE | 用户手填/本地选图 |
| 手机号授权/验证 | HARD_BLOCK | 可手填字段，但不能声称已验证 |

## 支付/广告/消息

| 微信 | 状态 | 处理 |
|---|---:|---|
| requestPayment | HARD_BLOCK | 真实支付不可；内容门槛可改本地解锁 |
| RewardedVideoAd | PRODUCT_REWRITE | 任务/成就/冷却/积分/免费 |
| Banner/Interstitial | PRODUCT_REWRITE | 删除并重排 UI |
| SubscribeMessage/Push | PRODUCT_REWRITE | 启动时本地提醒；后台通知不可 |

## Storage/文件

| 微信 | 状态 | 处理 |
|---|---:|---|
| storage sync | PRESERVE | localStorage |
| 大对象/查询 | ADAPT | IndexedDB |
| FileSystemManager | ADAPT | 按用途拆 File/Blob/IDB/writeTempFile |
| `openDocument` 固定文档 | PRECOMPUTE | 构建期转 HTML/图片 |
| 任意文件下载 | HARD_BLOCK | 浏览器下载明确禁用 |

## 图片/Canvas/媒体

| 微信 | 状态 | 处理 |
|---|---:|---|
| chooseImage | PRESERVE | `<input type=file>` |
| Canvas 2D | PRESERVE | 标准 Canvas |
| WebGL 纯渲染 | PRESERVE | 本地纹理 |
| saveImageToPhotosAlbum | PRESERVE | XHS Bridge |
| canvasToTempFilePath | ADAPT | toDataURL → writeTempFile |
| compressImage | PRESERVE | Canvas 重采样 |
| Camera/Mic | PRESERVE | getUserMedia |
| RecorderManager | PROBE | MediaRecorder 存在时增强 |
| Audio/Video | ADAPT/PROBE | HTML media；包内扩展限制需验证；小媒体可 JS data URI 实验 |

## 定位/设备

| 微信 | 状态 | 处理 |
|---|---:|---|
| getLocation | PRODUCT_REWRITE/HARD_BLOCK | 手动区域选择；必须坐标则硬阻断 |
| map | PRODUCT_REWRITE | 静态地图/本地 POI |
| Clipboard write | PRODUCT_REWRITE | 保存/发笔记/展示 |
| Clipboard read | HARD_BLOCK | 明确禁用 |
| Bluetooth/USB/HID/Serial | HARD_BLOCK | 明确禁用 |
| Accelerometer/Gyroscope/Compass | HARD_BLOCK | 改触摸控制可保产品目标 |
| Vibrate | PROBE | 可用则增强，无则静默 |
| Worker | ADAPT | 主线程分片/预计算 |
| WASM | PRECOMPUTE/ADAPT | 纯 JS 或构建期处理；动态重算才硬阻断 |

## UI/导航

| 微信 | 状态 | 处理 |
|---|---:|---|
| navigateTo/redirect/reLaunch/switchTab/back | PRESERVE | 单页 SPA route/state |
| showToast/modal/loading/actionSheet | PRESERVE | DOM/confirm |
| SelectorQuery | PRESERVE | DOM API |
| animation | PRESERVE | CSS/Web Animations |
| NavigationBar / custom nav | ADAPT | MiniTool 自带左上角返回；删除微信宿主级自绘返回/状态栏，标题转正文或 document.title，内部路由接 History API |
| web-view | PRECOMPUTE/HARD_BLOCK | 固定内容本地化；在线页面不可 |

## 分享与平台入口

| 微信 | 状态 | 处理 |
|---|---:|---|
| onShareAppMessage/showShareMenu | PRODUCT_REWRITE | 生成媒体 + postNote（语义合适时） |
| 微信好友/群/朋友圈原语义 | HARD_BLOCK | XHS MiniTool 无等价 |
| navigateToMiniProgram/launchApp | HARD_BLOCK | 禁止跨工具/站外 |
| 客服 contact | PRODUCT_REWRITE | 本地帮助/FAQ；真实客服会话不可 |

## 第三方依赖

不要按“库名”硬阻断。优先：

1. 重新 bundle；
2. 替换使用 WASM/Worker 的构建；
3. 预计算/预解码资源；
4. 使用纯 JS 分支；
5. 最后才 HARD_BLOCK。

最终 bundle 仍必须无网络/eval/WASM/Worker/runtime module/CDN。

| picker(selector/date) | ADAPT | selector→底部单列滚轮 Sheet；date→年/月/日三列滚轮；禁止可见原生 select/date input 作为最终主交互 |
