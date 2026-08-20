# 迁移易漏项与最大可用边界

## miniprogramRoot / 分包

解析 `project.config.json.miniprogramRoot`。分包只作为源组织方式，目标统一为单 `index.html` SPA，但页面功能尽量全部保留。

## miniprogram_npm

不能直接复制微信构建产物。回 npm/源码重新 bundle。库只要能产出无网络/eval/WASM/Worker/runtime module 的 classic JS，就优先保留。

## WXS

纯计算逻辑直接迁 classic JS；不要保留 WXS 模块运行时。

## 临时文件

`wxfile://` / `USER_DATA_PATH`：

- 业务数据 → Storage/IndexedDB
- 用户选择 → File/Blob
- 图片预览 → blob/data
- Canvas 结果 → data URL
- XHS Native 媒体 → writeTempFile 即用即弃

## 生命周期

`onLoad/onShow/onHide/onUnload` → SPA controller；必要时 `visibilitychange` 近似。`onReachBottom` → scroll/IntersectionObserver。原逻辑若联网，数据源另做 SNAPSHOT/PRODUCT_REWRITE。

## Canvas / 微信小游戏

Canvas 2D/纯 WebGL 是优先保留路线。重点处理：本地纹理、DPR、Pointer/Touch、主线程性能、WASM/Worker 前移构建期。

## WASM/Worker

不要一律删功能：

- 解码/转码/压缩纹理 → 构建期预处理；
- 有限输入算法 → 预计算；
- 有纯 JS build → 换 build；
- Worker → 主线程分片；
- 动态大模型推理/高算力实时处理无替代 → HARD_BLOCK。

## 音视频

官方支持 media playback，但包内媒体扩展表有空缺。优先后台验证；小媒体可转 JS data URI 并 PROBE。始终准备静音/海报 fallback。

## 未明确 Web API

只有官方**明确禁用**的能力必须禁止。其他标准 Web 能力若未逐项说明，可 feature-detect，但只能作为增强，不得成为唯一主流程。
