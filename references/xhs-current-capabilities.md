# 小红书 MiniTool 当前能力基线（2026-09-29）

来源：小红书官方 MiniTool 文档 `https://miniapp-sandbox.xiaohongshu.com/minitool/doc`，基线 2026-09-29。

## 1. 运行模型

- 独立沙箱中的纯 Web 应用（HTML/CSS/JS）；每个工具实例存储与运行时严格隔离。
- **强制离线自包含**：页面、脚本、图片、字体、数据全部打包交付，严禁任何外部域引用。
- 兼容基线：**Android 8.1 出厂 Chrome/WebView 61** + iOS 18.4 WKWebView；交付代码须编译到 **ES2017 / Chrome 61**。
- 容器自动注入 JS SDK（`window.xhs.miniTool`）；非小红书环境该全局为空属预期，必须判空。

## 2. 官方明确支持，可进入核心主流程

- HTML/CSS/JS、Flex/Grid、动画、媒体查询；标准 DOM 与 Canvas 2D；纯 WebGL 基础渲染；文本选择不受拦截
- 摄像头/麦克风：`getUserMedia`（需系统授权弹窗）
- `<input type=file>`：**无论 accept 如何设置，只放行图片/视频**
- `<audio>/<video>` 内联播放
- `alert/confirm` 原生对话框
- 包内图片、`data:`/`blob:` 图像、本地字体

### 数据存储（重要变化）

- **首选容器级接口**：XHS Storage（9.46+）与文件系统（9.49+），见 `xhs-jsbridge.md`。
- 浏览器内置存储（localStorage/sessionStorage/IndexedDB/Cookie/Cache）降级为**弱兼容兜底**，官方不承诺生命周期；使用时必须自建容错与迁移逻辑。

## 3. Native API 全量清单（`window.xhs.miniTool`）

| API | 最低版本 | 说明 |
|---|---|---|
| `postNote` | 基线 | 发笔记：标题 ≤20 字、正文 ≤1000 字、图 1–18 张或单视频；实况照片需 9.43+ |
| `saveImageToPhotosAlbum` | 基线 | 保存图片到相册，用户手势触发 |
| `writeTempFile` | 基线 | base64 → 临时文件（png/jpeg/webp/gif/mp4） |
| `getLaunchOptions` | 基线 | 启动参数：`miniToolEnv.buildVersion`、`miniToolEnv.userDataPath` |
| `setStorage` 等 5 个 | 9.46.0 | 容器缓存：单 key ≤1MB、总量 ≤10MB、data 为 JSON 字符串、可选 encrypt |
| `saveFile/writeFile/appendFile/readFile/readDir/statFile/unlink/mkdir/getFileStorageInfo` | 9.49.0 | 沙箱文件系统；根目录 `userDataPath`；分片按 chunk 上限 |
| `interactionOpenApi` | 9.49.0 | 发布评论（`action: "post_comment"`，仅图片，快照 ≤2KB） |

版本解析：`buildVersion` 末 3 位是编译序号，`Math.floor(buildVersion / 1000)` 得到版本数值（如 `9462004` → `9462` ≈ 9.46.2）。

未列出的 API 不可依赖；不要自行 bridge postMessage；未声明参数会被双层 Schema 校验静默丢弃。

## 4. 明确禁止，不能用 PROBE 绕过

- fetch/XMLHttpRequest/任意联网、远程资源、服务端信令通道
- WebSocket/SSE/WebRTC
- Geolocation
- Clipboard/execCommand copy/cut/paste
- Bluetooth/USB/HID/Serial
- DeviceMotion/Orientation/加速度/陀螺仪/磁力计/环境光等传感器阵列
- Worker/SharedWorker/ServiceWorker、SharedArrayBuffer、OffscreenCanvas 离屏作业
- requestFullscreen/屏幕共享
- Battery/Network Information/enumerateDevices
- Persistent Storage/Cross-origin storage
- Credentials/WebAuthn/Web Locks
- window.open/window.prompt
- eval/new Function
- WebAssembly（含 WASM 加速矩阵/重度 AI 推理）
- iframe/object、遗留插件体系
- form 跳转提交
- a[download]/blob 下载/浏览器原生下载流
- 外链、站外导航、跳其他小工具、长按菜单
- **内联 `<script>` 与行内事件属性**（必须外置 .js + addEventListener）
- 移动 WebView：PaymentRequest、系统通知/推送、NFC、MIDI、XR/AR/VR、PWA、后台同步/下载、输入锁定等

## 5. 包内文件类型

官方 allowlist：`.html .css .js .png .jpg .jpeg .gif .webp .svg .woff .woff2 .json`。

资源加载规则：

- 脚本必须外置为独立 `.js`，剔除行内事件属性；
- 样式支持内联 `<style>` 与外链 `.css`；
- 图像允许包内文件、Data URI、Blob；
- 字体仅限本地引入；
- 严禁 iframe 嵌套与任何外部域引用。

文档同时声明 `<audio>/<video>` 支持播放，但文件扩展表没有列 `.mp3/.mp4`。因此：

- 不把“直接塞 mp3/mp4 ZIP”写成官方保证；
- validator 对媒体扩展保持 WARNING；
- 最大可用 fallback 可把小媒体转成 JS data URI，但运行时仍需 PROBE + 无媒体 fallback；
- 运行时音视频媒体载荷只认 base64/data URI 或容器内本地句柄。

## 6. WebGL / 图形计算边界

- 允许纯本地像素渲染管线（Canvas 2D / 内存级 WebGL）；
- 禁止把外部域名贴图载入纹理缓冲；
- WASM 加速矩阵、OffscreenCanvas、SharedArrayBuffer 并发均违规；
- 重度 AI 推理场景无法部署（构建期预计算除外）。

## 7. 发布流程与“改写口令”

- 上传页提供标准化“改写口令”（提示词）：粘贴到 AI 工作区后自动拉取官方 skill kit、执行语法降级、合规校验、修复并生成 ZIP；
- 官方明确该口令**不可被能力清单代替**，正式发布应走上传页两步流程（先处理 AI 指令、再上传 ZIP）；
- 本 Skill 与官方口令互补：本 Skill 负责微信语义 → 最大可用迁移，官方口令负责交付前容器合规校验。

## 8. 三层能力规则

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
