---
name: wechat-miniprogram-to-xhs-minitool
description: >-
  将原生微信小程序（WXML/WXSS/JS/TS/JSON）、微信小游戏（Canvas/WebGL）或可输出 H5 的跨端项目迁移为
  小红书 MiniTool 小工具离线 H5 ZIP。采用“最大可用”原则：优先保留用户目标，通过标准 Web 等价、XHS Bridge、
  OSS/CDN 本地化、构建期快照/预计算、本地数据模拟、手动输入替代、产品语义重写与可探测 Web 增强尽量保住功能；
  只有原语义确实依赖小红书明确禁用能力时才 HARD_BLOCK。最终必须断网自包含、只使用官方当前 3 个 Native API、
  严格验包，不伪造登录/支付/实时服务端/平台身份。
metadata:
  version: "1.0.0"
  revision_date: "2026-08-20"
  strategy: "maximum-availability"
  xhs_capability_baseline: "2026-08-11"
  wechat_api_baseline: "miniprogram-api-typings 5.2.2 / API definitions 3.17.0"
---

# 微信小程序 / 小游戏 → 小红书 MiniTool（最大可用版）

## 目标

把微信项目迁移成小红书 MiniTool 当前容器可运行的：

```text
一个 index.html
+ 包内 HTML/CSS/classic JS
+ 包内图片/字体/静态数据
+ 标准 Web Canvas/WebGL/DOM/Storage/Media
+ window.xhs.miniTool 的官方端能力
```

核心原则不是“API 一一替换”，而是：**尽最大可能保住用户能完成的事情。**

---

# 0. 权威基线

按以下优先级做判断：

1. 用户提供/当前最新的小红书官方《小工具容器 · 能力清单》；本 Skill 基线为 **2026-08-11**。
2. `references/xhs-current-capabilities.md`。
3. `references/wechat-to-xhs-capability-matrix.md`。
4. 本 Skill 其他 reference、脚本与模板。
5. 历史 Skill/第三方资料仅可补充，不可覆盖官方禁用项。

当前官方明确的 XHS Native API 只有：

- `postNote`
- `saveImageToPhotosAlbum`
- `writeTempFile`

不得调用未列出的 Native API，不得绕过 SDK 直接向 bridge 发消息。

微信 API 基线使用 `wechat-miniprogram/api-typings` 的 `miniprogram-api-typings 5.2.2`，其 2026-07-27 changelog 对应 API definitions 3.17.0。

---

# 1. 最大可用决策树（必须遵守）

每个微信能力按下面顺序找方案，**不要一看到不等价就 HARD_BLOCK**：

```text
1. PRESERVE
   标准 Web 可直接完成同一用户目标
        ↓ 否
2. ADAPT
   改 API / DOM / Canvas / SPA / Storage 模型后可完成
        ↓ 否
3. XHS BRIDGE
   postNote / saveImageToPhotosAlbum / writeTempFile 是否能保住目标
        ↓ 否
4. LOCALIZE
   远程静态图片/字体/固定文件能否在迁移阶段放进 ZIP
        ↓ 否
5. SNAPSHOT
   服务端内容是否其实是固定配置/关卡/词典，可构建期快照
        ↓ 否
6. PRECOMPUTE
   WASM/Worker/在线处理是否输入有限，可构建期提前算好/转码/解压
        ↓ 否
7. EMULATE_LOCAL
   账号/云存档/CRUD 是否只为本机体验，可改本地 installId + IndexedDB
        ↓ 否
8. PRODUCT_REWRITE
   能否换一种交互达到相近用户目标：定位→手动城市；广告→任务解锁；分享→postNote
        ↓ 否
9. PROBE
   官方未明确禁止的标准 Web 能力，可 feature-detect 后作为“增强”，必须有 fallback
        ↓ 否
10. HARD_BLOCK
   原语义确实要求实时联网、真实支付、平台验证身份、蓝牙/传感器等被禁能力
```

**HARD_BLOCK 是最后一级，不是默认级。**

---

# 2. 三层 Web 能力模型

### A. 官方明确支持

可以进入主流程：HTML/CSS/JS、Canvas 2D、纯 WebGL、`getUserMedia` 摄像头/麦克风、图片/视频选择、`<audio>/<video>` 播放、localStorage/sessionStorage/IndexedDB/Cookie/Cache、`alert/confirm` 等。

### B. 官方明确禁用

不能调用，不能探测后强行绕过：网络请求、WebSocket/SSE/WebRTC、Geolocation、Clipboard、蓝牙/USB/HID/串口、DeviceMotion/Orientation、Worker 系、WASM、`eval/new Function`、iframe/object、文件下载、外链、新窗口、跨小工具、支付/推送等。

### C. 标准 Web 但官方未逐项承诺

例如某些 WebView 中可能存在的 `navigator.vibrate`、MediaRecorder、`requestIdleCallback` 等：

- 只可 `feature detection`；
- 只作为增强；
- 不得作为完成核心任务的唯一方案；
- 必须有无该能力时的 fallback；
- 最终真机验证结果优先。

使用 `templates/capability-probe.js` 辅助探测。

---

# 3. 必须执行的迁移工作流

## Phase 0 — 复制工作区，不直接破坏原项目

优先在迁移副本工作：

```bash
cp -R /path/wechat-project /tmp/xhs-migration-workspace
```

OSS 自动脚本也优先使用 `--output-root`。

## Phase 1 — 扫描能力与工程结构

```bash
python3 scripts/scan_wechat_miniprogram.py /path/to/project \
  --out /tmp/xhs-migration-audit
```

必须阅读：

- `migration-audit.md`
- `migration-audit.json`

然后生成执行计划：

```bash
python3 scripts/generate_max_use_plan.py \
  /tmp/xhs-migration-audit/migration-audit.json \
  -o /tmp/maximum-use-plan.md
```

扫描状态：`PRESERVE / ADAPT / LOCALIZE / SNAPSHOT / EMULATE_LOCAL / PRECOMPUTE / PRODUCT_REWRITE / PROBE / REVIEW / HARD_BLOCK`。

## Phase 2 — 先最大化静态资源可用性

微信项目中的 OSS/CDN 静态图片和字体不要删除，**迁移期下载到本地**：

```bash
python3 scripts/localize_remote_assets.py /path/to/project \
  --host your-bucket.oss-cn-shanghai.aliyuncs.com \
  --host '*.your-cdn.com' \
  --output-root /tmp/xhs-migration-workspace \
  --apply
```

规则：

- 只允许显式白名单域名；
- 图片/woff/woff2 自动下载；
- OSS query（如 `x-oss-process`）保留；
- 按内容 SHA-256 去重；
- 路径改为包内相对路径；
- API/用户动态图/临时签名/远程 SDK 不盲抓；
- 动态 `OSS_HOST + id` 优先枚举为 `asset-map.js`。

详见 `references/asset-localization.md`。

## Phase 3 — 固定服务端数据最大化保留

`wx.request` 不等于一定删功能。

若数据是固定的关卡、配置、词典、题库、静态商品展示、离线地图索引等：

```bash
python3 scripts/snapshot_remote_json.py \
  'https://allowed.example.com/config.json' \
  --host allowed.example.com \
  -o ./xhs-dist/assets/data/config.js \
  --key config
```

或者已有本地 JSON：

```bash
python3 scripts/materialize_static_json.py ./config.json \
  -o ./xhs-dist/assets/data/config.js \
  --key config
```

最终 classic script 加载，不使用 `fetch('./config.json')`。

**禁止把实时价格、登录用户数据、订单、排行、实时活动用快照冒充在线。**

## Phase 4 — 云函数拆解，而不是整体删除

对于 `wx.cloud.callFunction` / cloudfunctions，逐个分类：

- 纯计算/格式化/规则引擎 → 移到客户端纯 JS；
- 固定读取 → SNAPSHOT；
- 固定素材 → LOCALIZE；
- 简单 CRUD/进度/收藏 → IndexedDB/localStorage 本地化；
- 上传后只为生成分享图 → 本地 File/Canvas + XHS 保存/发笔记；
- 私密密钥、真实鉴权、跨设备同步、动态服务端计算 → HARD_BLOCK。

不要因为“它叫云函数”就把可迁逻辑一起删掉。

## Phase 5 — 架构转换

### 原生小程序

1. `app.json pages/subPackages/tabBar` → 单 `index.html` SPA。
2. WXML → DOM/HTML render。
3. WXSS → CSS；`rpx` 先机械转换再视觉 QA。
4. `App/Page/Component` → 普通 JS controller/state。
5. `setData` → JS state + render。
6. WXS → classic JS。
7. 最后处理 `wx.*`。

### 微信小游戏

- HTML 壳 + `<canvas>`；
- `wx.createCanvas/createImage` → DOM Canvas/Image；
- 触摸 → Pointer/Touch；
- 游戏循环继续用 `requestAnimationFrame`；
- Canvas 2D/纯 WebGL 尽量原样保留；
- 纹理、关卡、配置全部本地化。

## Phase 6 — 平台能力最大化替代

必须按 `references/wechat-to-xhs-capability-matrix.md`。

典型策略：

- 登录只用于本机进度 → `MiniCompat.identity` 本地 installId；明确不是平台账号。
- 用户昵称头像 → 本地文本输入 + `<input type=file>`。
- 云存档 → IndexedDB/localStorage；提示“仅本机”。
- 排行榜 → 本机最好成绩 / 预置挑战目标；不要伪造在线排行。
- 广告奖励 → 本地任务、冷却、积分、成就或直接开放。
- 定位 → 手动城市/区域/POI 选择 + 本地数据。
- 地图 → 预置静态地图图/本地 POI 图层；真实地图导航不可保留。
- 剪贴板 → 直接展示、生成卡片、保存相册、postNote。
- 文档 → 固定文档构建期转 HTML/图片；任意 PDF 打开不可保留。
- Worker → 主线程分片；重计算有限集合时 PRECOMPUTE。
- WASM 解码/压缩纹理 → 构建期转普通 PNG/WebP/未压缩模型；动态模型推理才 HARD_BLOCK。
- 微信分享 → 产品目标合适时生成媒体 + `postNote`，不是 API 等价替换。

## Phase 6.5 — MiniTool 原生壳层与 Picker 交互（强制）

### A. 不重复绘制左上角返回按钮

MiniTool 容器自身提供左上角返回控件。迁移微信 `navigationStyle: custom` 页面时：

- **不要**把微信自绘的 `nav-back / back-button / aria-label="返回"` 原样搬进 MiniTool；
- 纯宿主导航栏（状态栏占位 + 返回键 + 页面标题）优先整体移除；若标题属于业务内容，可下沉为页面正文标题；
- 页面正文里的“返回计算 / 返回首页 / 上一步”等业务 CTA 可以保留，但不要做成左上角系统返回键外观；
- 内部多视图 SPA 必须用 `history.pushState / replaceState / popstate` 维护历史，使容器返回动作有机会按 WebView 历史回退；
- 禁止为了兼容再次叠一层固定左上角箭头。

扫描器发现 `aria-label="返回"`、常见 `*-nav-back/*-back-button` 且绑定 `wx.navigateBack` 时，应标记 `PRODUCT_REWRITE`：删除宿主级返回 UI，保留内部 history 语义。

可先用自动脚本处理大部分机械删除：

```bash
python3 scripts/transform_native_shell.py /path/to/project --output-root /tmp/xhs-migration-workspace
```

该脚本会：
- 删除 WXML/WXSS 里的自绘返回按钮、自定义导航栏、状态栏占位；
- 移除 JSON 里的 `navigationStyle: custom`、`navigationBarBackgroundColor`、`navigationBarTextStyle`；
- 把 `wx.navigateBack` 替换为 `history.back()`；
- 保留业务级“返回首页 / 返回计算”等 CTA。

### B. 微信 selector picker → 底部滚轮 Sheet

不要直接把 `<picker mode="selector">` 转成可见 `<select>`。移动 WebView 的原生 `<select>` 高度、样式和系统差异不可控，且与微信体验差异明显。

默认转换为：

```text
点击字段
  ↓
底部半屏 Sheet
  ↓
5 行可视滚轮（scroll-snap）
  ↓
中间选中线
  ↓
取消 / 确定
  ↓
回传原 bindchange 的 detail.value(index)
```

优先复用 `templates/wheel-picker.js` + `templates/wheel-picker.css`。可以保留隐藏 `<select>` 仅作为兼容状态容器，但必须 `pointer-events:none`，不得让系统原生下拉接管点击。

**Picker 视觉基线也属于迁移规范，不允许随意做成普通 Bottom Sheet：**

- 顶部工具栏约 52–56px，高度稳定；左右按钮至少有 **16–20px 水平安全内边距**，文字不得贴 Sheet 边缘；
- “取消”左对齐、“确定”右对齐，中间标题严格视觉居中；按钮点击热区至少 44px；
- 默认**不显示拖拽 grabber**，避免与微信原生 Picker 视觉混淆；
- 选中行使用克制的上下分隔线/浅色 indicator，不使用夸张卡片、阴影或大色块；
- 非选中行用渐隐处理，选中项字号/字重略增强；
- 保留 5 行滚轮语义与 safe-area，但整体高度应克制，不能因为系统 `<select>` 或过大 padding 形成高大的空白面板；
- 颜色优先继承产品主题色作为“确定”强调色，其余结构保持微信/iOS Picker 的中性视觉。

### C. 微信 date picker → 年 / 月 / 日三列滚轮

`<picker mode="date">` 不直接转换成 `<input type="date">` 作为主交互。默认实现微信式底部日期滚轮：

- 三列：年 / 月 / 日；
- 月或年份变化时动态修正当月天数和闰年；
- 默认范围按微信常见语义 `1970-01-01 ~ 2100-12-31`，原 WXML 有 `start/end` 时必须继承；
- “确定”后仍向原页面处理函数提供 `detail.value = YYYY-MM-DD`；
- “取消”不修改状态；
- Sheet 高度控制在约 300–360px + safe-area，不允许全屏巨大选择列表。

### D. 原生壳层视觉补偿

删除微信自绘导航后，不机械保留原来为状态栏/胶囊预留的 80–140rpx 空白。需要重新核对页面顶部 padding、hero 图定位和首屏节奏：**视觉目标是“小红书原生壳层 + Web 内容”组合后接近原微信页面，而不是 Web 内容单独复制一份微信导航。**

## Phase 7 — 可探测增强

把 `templates/capability-probe.js` 放入开发版本并引用：

```html
<script src="./assets/capability-probe.js"></script>
```

例如：

```js
if (MiniToolCapabilities.vibrateSymbol) {
  try { navigator.vibrate(20); } catch (_) {}
}
```

必须保证不振动也能完成主流程。

音视频固定资源如果后台拒绝 `.mp3/.mp4` 包内扩展，可**实验性**使用：

```bash
python3 scripts/embed_media_as_js.py ./tap.mp3 \
  -o ./xhs-dist/assets/data/media.js \
  --key tap
```

得到 `window.EmbeddedMedia.tap = 'data:audio/...base64,...'`。这是最大可用 fallback，不属于官方保证；必须 `PROBE + 无声/封面降级`。大媒体会增加约 33% base64 体积，不应滥用。

## Phase 8 — 依赖与构建

开发期可 Vite/Rollup/Webpack，但最终必须：

- classic local JS；
- 无 runtime module/dynamic chunk；
- 无未处理 CommonJS；
- 无 CDN；
- 无网络；
- 无 `eval/new Function`；
- 无 WASM；
- 无 Worker；
- 无 Node runtime 变量。

第三方库不能只看名字，必须看**最终 bundle**。

## Phase 9 — 最终严格验包

```bash
python3 scripts/analyze_assets.py ./xhs-dist
python3 scripts/validate_xhs_minitool.py ./xhs-dist
python3 scripts/build_xhs_zip.py ./xhs-dist -o ./tool.zip
```

validator 是目标产物的硬边界：最大可用策略只发生在迁移阶段，**不能降低 MiniTool 最终安全/离线要求**。

---

# 4. HARD_BLOCK 的定义

只有以下情况才最终判 HARD_BLOCK：

1. 原用户目标必须与服务端**实时**通信；
2. 必须是真实平台账号/手机号验证/跨设备身份；
3. 必须发生真实支付/订单闭环；
4. 必须使用 Geolocation、蓝牙、USB/HID/串口、被禁传感器等硬件能力；
5. 必须 WebSocket/SSE/WebRTC；
6. 输入是运行时无限/不可预知的，而处理又依赖网络/WASM/Worker 且无纯 JS 可行替代；
7. 必须跳站外/其他小工具/外部 App；
8. 真实业务语义不能通过本地模式或产品重写诚实保留。

即使 HARD_BLOCK，也先判断：该功能是否只是商业化/平台壳层而非核心体验。如果删除它后主产品仍成立，继续迁移。

---

# 5. 不允许的“假迁移”

禁止：

- 假 `login success`；
- 随机 ID 冒充 openid/小红书账号；
- 假支付成功；
- 假广告观看；
- 静态数字冒充实时排行榜；
- 缓存快照冒充实时价格/订单；
- 把 `postNote` 说成微信好友分享等价能力；
- 通过 QR/特殊 URI 等方式绕过官方“禁止外链/跨小工具”限制；
- 对官方明确禁用 API 做所谓 feature-probe 后继续调用。

本地 installId 仅可作为**本机数据分区键**，UI/文档必须避免把它称为账号登录。

---

# 6. Done Definition

转换完成必须同时满足：

- 核心用户流程在断网下可完成；
- 远程静态素材已本地化；
- 固定服务端数据已快照/预计算；
- 可转纯 JS 的云函数已迁；
- 本地个性化/进度使用 Storage/IndexedDB；
- HARD_BLOCK 已逐项决定“删除/产品重写/明确缺失”；
- PROBE 能力都有 fallback；
- 不残留 `wx.*`、微信 App/Page/Component 运行时；
- 无外部 URL、网络、WASM、Worker、eval、iframe、外链、文件下载；
- 只使用 3 个当前官方 XHS Native API；
- 根目录只有一个 `index.html`；
- 资源引用真实存在；
- MiniTool 页面内无重复左上角返回键；微信自绘宿主导航已移除或内容化；
- selector/date picker 已使用底部滚轮 Sheet，不以可见原生 select/date input 作为主交互；
- `validate_xhs_minitool.py` ERROR=0；
- ZIP 根直接可见 `index.html`；
- iOS/Android 小红书真机完成核心 smoke test。

---

# 7. 参考文件

- `references/xhs-current-capabilities.md`：官方能力基线与三层模型
- `references/max-availability-strategy.md`：最大可用策略详解
- `references/wechat-to-xhs-capability-matrix.md`：微信能力迁移矩阵
- `references/fallback-catalog.md`：常见阻断功能的最大可用 fallback
- `references/asset-localization.md`：OSS/CDN 本地化
- `references/static-data-migration.md`：服务端固定数据离线化
- `references/framework-conversion.md`：WXML/Page/Canvas/SPA
- `references/edge-cases.md`：依赖/分包/WXS/媒体等边界
- `references/xhs-jsbridge.md`：3 个 Native API
- `references/source-provenance.md`：资料来源与版本
