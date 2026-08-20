# 小红书 MiniTool 当前能力基线（2026-08-11）

来源：小红书官方《小工具容器 · 能力清单》，最后更新 2026-08-11。

## 1. 运行模型

受限沙箱中的纯 Web 应用（HTML/CSS/JS）；iOS/Android；每个工具隔离；**纯本地运行、不联网**；页面、脚本、图片、字体、数据等需自包含。

## 2. 官方明确支持，可进入核心主流程

- HTML/CSS/JS、Flex/Grid、动画、媒体查询
- Canvas 2D
- 纯 WebGL/WebGL2
- 摄像头/麦克风：`getUserMedia`
- `<input type=file>`，系统选择图片/视频
- `<audio>/<video>` 内联播放
- localStorage/sessionStorage/IndexedDB/Cookie/Cache API
- `alert/confirm`
- 包内图片，图片 `data:` / `blob:`（图片 data/blob 需客户端 9.37+）

## 3. Native API 全量清单

当前只允许：

- `window.xhs.miniTool.postNote`
- `window.xhs.miniTool.saveImageToPhotosAlbum`
- `window.xhs.miniTool.writeTempFile`

未列出 API 不可依赖；不要自行 bridge postMessage。

`postNote`：图片 1–18 张或单视频，媒体只接受 base64/data URI 或本地路径；标题最长 20 字、正文最长 1000 字。

## 4. 明确禁止，不能用 PROBE 绕过

- fetch/XMLHttpRequest/任意联网、远程资源
- WebSocket/SSE/WebRTC
- Geolocation
- Clipboard/execCommand copy/cut/paste
- Bluetooth/USB/HID/Serial
- DeviceMotion/Orientation/加速度/陀螺仪/磁力计/环境光
- Worker/SharedWorker/ServiceWorker
- requestFullscreen/屏幕共享
- Battery/Network Information/enumerateDevices
- Persistent Storage/Cross-origin storage
- Credentials/WebAuthn/Web Locks
- window.open/window.prompt
- eval/new Function
- WebAssembly
- iframe/object
- form 跳转提交
- a[download]/blob 下载
- 外链、新窗口、跳其他小工具、长按菜单
- 移动 WebView：PaymentRequest、系统通知/推送、NFC、MIDI、XR/AR/VR、后台同步/下载、PWA 等

## 5. 包内文件类型

官方表列出：`.html .css .js .png .jpg .jpeg .gif .webp .svg .woff .woff2 .json`。

文档同时声明 `<audio>/<video>` 支持播放，但文件扩展表没有列 `.mp3/.mp4`。因此：

- 不把“直接塞 mp3/mp4 ZIP”写成官方保证；
- validator 对媒体扩展保持 WARNING；
- 最大可用 fallback 可把小媒体转成 JS data URI，但运行时仍需 PROBE + 无媒体 fallback。

## 6. 三层能力规则

### DOCUMENTED_SUPPORTED
官方明确支持，可做主流程。

### DOCUMENTED_BLOCKED
官方明确禁用，绝不能通过 feature detect 强行调用。

### STANDARD_WEB_PROBE
标准 Web API 且官方未逐项说明时，只可：

1. 判断符号存在；
2. 用户触发下 smoke test；
3. 失败静默回退；
4. 不作为唯一主路径。

这条规则用于最大可用，但不扩大官方能力承诺。
