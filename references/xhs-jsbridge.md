# 小红书 MiniTool JSBridge（当前官方确认）

> 基线：小红书官方《小工具容器 · 能力清单》2026-08-11。
> 只允许使用本页 3 个 API。不要自行 `postMessage` 到 Native bridge，不要猜测未公开 API。

## 通用调用约定

```js
const miniTool = window.xhs?.miniTool;
if (!miniTool) {
  // 普通浏览器调试环境：明确降级，不要伪装 Native 已成功
  return;
}
```

- 不传 `success/fail/complete`：返回 Promise。
- 传任一回调：返回 `undefined`，结果从回调取得。
- SDK 会做 Schema 校验；未声明字段不要传。

## 1. postNote

用途：唤起小红书笔记发布页并带入媒体/文本。用户仍可编辑或取消；成功回调不代表最终审核通过。

```js
await window.xhs.miniTool.postNote({
  title: "我的作品",        // 可选，最长 20 字
  content: "用小工具生成", // 可选，最长 1000 字
  tags: "测试",            // 可选
  mediaInfo: {
    image_resources: [
      { url: "data:image/png;base64,..." }
    ]
  }
});
```

字段：

- `mediaInfo` 必填。
- `image_resources`: `{url}[]`，1–18 张。
- `video_resources`: `{video_url, cover_url?}`，单个视频。
- URL 字段只应使用 data URI 或本地路径，不用 http(s)。

### 与微信分享的差异

`postNote` 是“进入笔记发布流程”，**不是** `wx.shareAppMessage` / 分享卡片 / 转发给好友的等价实现。

## 2. saveImageToPhotosAlbum

```js
await window.xhs.miniTool.saveImageToPhotosAlbum({
  filePath: canvas.toDataURL("image/png")
});
```

- `filePath`：data URI 或本地临时路径。
- 不支持网络 URL。
- 必须由用户主动操作触发；首次可能弹系统权限。

## 3. writeTempFile

```js
const { filePath } = await window.xhs.miniTool.writeTempFile({
  data: canvas.toDataURL("image/png")
});
```

- `data` 必须是完整 `data:<mime>;base64,...`。
- 不要 `.split(',')[1]` 截掉前缀。
- 返回临时路径，即用即弃，不要持久化。
- 官方文档说明常见图片/视频类型可用于临时文件（png/jpeg/webp/gif/mp4）。

## 推荐组合：Canvas → 保存 / 发笔记

```js
const dataUrl = canvas.toDataURL("image/png");
const { filePath } = await window.xhs.miniTool.writeTempFile({ data: dataUrl });

await window.xhs.miniTool.saveImageToPhotosAlbum({ filePath });

await window.xhs.miniTool.postNote({
  title: "我的结果",
  mediaInfo: { image_resources: [{ url: filePath }] }
});
```
