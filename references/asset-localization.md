# 外部 OSS / CDN 资源最大化本地化

MiniTool 运行时不联网，因此远程资源必须在**迁移/构建阶段**处理。目标不是删掉远程依赖，而是尽量把它们变成包内资源。

## 分类

| 类型 | 状态 | 处理 |
|---|---:|---|
| 静态图片 | LOCALIZE | 白名单下载、保留 OSS query、SHA 去重、改相对路径 |
| woff/woff2 | LOCALIZE | 本地化并修正 `@font-face` |
| 固定 JSON | SNAPSHOT | 构建期抓取 → classic JS 数据模块 |
| CDN JS/CSS | ADAPT | 从 npm/源码重新 bundle，不能运行时 CDN |
| 动态可枚举资源 | LOCALIZE | 枚举所有 key → asset-map.js |
| 用户动态图 | PRODUCT_REWRITE | 本地选图/占位/用户当前会话 Blob；远程用户库不可 |
| API | SNAPSHOT/PRODUCT_REWRITE/HARD_BLOCK | 按数据是否固定判断 |
| 音视频 | ADAPT/PROBE | 直接包内需后台验证；小媒体可 JS data URI 实验 |
| `cloud://` 固定公共素材 | LOCALIZE | 迁移前导出 |

## 自动脚本

```bash
python3 scripts/localize_remote_assets.py ./project \
  --host your-bucket.oss-cn-shanghai.aliyuncs.com \
  --host '*.your-cdn.com' \
  --output-root /tmp/xhs-work \
  --apply
```

要求：

- `--host` 必须显式白名单；
- 不直接修改原项目；
- 保留 `x-oss-process` 等 query，请求微信实际使用的缩图/格式；
- 按内容 SHA-256 去重；
- manifest 不进入最终 ZIP；
- 签名 URL 不应被提交。

## 动态 URL

```js
OSS_HOST + '/items/' + id + '.webp'
```

优先：

1. 找出 id 枚举；
2. 批量下载；
3. 生成：

```js
window.AssetMap = {
  teddy: './assets/items/teddy.webp',
  car: './assets/items/car.webp'
};
```

4. 业务改 `AssetMap[id]`。

只有资源集合本身由运行时服务端动态决定且不可枚举时，才升级为 PRODUCT_REWRITE/HARD_BLOCK。

## 远程代码

不要“wget CDN JS 然后直接塞包”。应回到 npm/源码，构建成 classic JS，并检查最终 bundle 无网络、eval、WASM、Worker、动态 chunk。

## 媒体

官方声明 `<audio>/<video>` 可播放，但包内扩展白名单未列媒体。最大可用策略：

1. 后台允许对应扩展 → 正常本地化；
2. 后台拒绝，且文件很小 → `embed_media_as_js.py` 转 data URI classic JS；
3. 运行时 PROBE；
4. 失败时静音/海报/文字 fallback；
5. 大媒体不要 base64，体积会增加约 33%。

## 验收

最终 dist：

- `http://` / `https://` 运行时引用 = 0；
- 外部图片/字体/CDN = 0；
- 动态 host 常量应消失或只存在迁移开发文件中；
- 断网仍完整显示；
- validator ERROR=0。
