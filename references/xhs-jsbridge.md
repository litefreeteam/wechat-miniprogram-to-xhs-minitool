# 小红书 MiniTool JSBridge（当前官方确认）

> 基线：小红书官方 MiniTool 文档 `https://miniapp-sandbox.xiaohongshu.com/minitool/doc`，2026-09-29。
> 只允许使用本页列出的 API。不要自行 `postMessage` 到 Native bridge，不要猜测未公开 API。
> 所有 API 挂载于 `window.xhs.miniTool`，参数均为**单个 object**；未声明字段会被 SDK/Native 双层 Schema 校验**静默丢弃**。

## 通用调用约定

```js
var miniTool = window.xhs && window.xhs.miniTool;
if (!miniTool) {
  // 普通浏览器调试环境：window.xhs 为空属预期。明确降级，不要伪装 Native 已成功
  return;
}
```

- 不传 `success/fail/complete`：返回 Promise。
- 传任一回调：返回 `undefined`，结果从回调取得。
- 成功：`{ errMsg: "<api>:ok", ...业务字段 }`；失败：`{ errMsg: "<api>:fail ...", errCode? }`。

## 0. getLaunchOptions（版本探测，所有门槛 API 的前置）

```js
var res = await window.xhs.miniTool.getLaunchOptions();
var buildVersion = res.miniToolEnv.buildVersion;   // 数值，如 9462004
var version = Math.floor(buildVersion / 1000);     // 末 3 位是编译序号，判断时忽略 → 9462 ≈ 9.46.2
var hasStorage = version >= 9460;                  // Storage 系列
var hasFileSystem = version >= 9490;               // 文件系统 + interactionOpenApi
var userDataPath = res.miniToolEnv.userDataPath;   // 文件系统根目录
```

- 同步降级：可直接读 `window.xhs.launchOptions`。
- 版本探测之外仍须 `typeof miniTool.xxx === 'function'` 双重判断。

## 1. postNote

用途：唤起小红书笔记发布页并带入媒体/文本。用户仍可编辑或取消；成功回调不代表最终审核通过。**需用户点击触发。**

```js
await window.xhs.miniTool.postNote({
  title: "我的作品",            // 可选，最长 20 字
  content: "用小工具生成",       // 可选，最长 1000 字
  pageType: "photo_publish",    // video_publish / photo_publish / slides_edit
  mediaInfo: {
    image_resources: [{ url: "data:image/png;base64,..." }]
    // 或 video_resources: { video_url, cover_url? }（单个视频）
    // 或 live_photo_sources: [...]（实况照片，客户端 9.43+，≤18 组）
  }
});
```

字段：

- `mediaInfo` 必填；图集 1–18 张，视频单支投递。
- URL 字段只应使用 data URI（base64）或容器内本地路径，不用 http(s)。

### 与微信分享的差异

`postNote` 是“进入笔记发布流程”，**不是** `wx.shareAppMessage` / 分享卡片 / 转发给好友的等价实现。

## 2. saveImageToPhotosAlbum

```js
await window.xhs.miniTool.saveImageToPhotosAlbum({
  filePath: "data:image/png;base64,..."  // 或 writeTempFile 返回的临时路径
});
```

- 必须由用户主动操作触发；首次调用可能弹系统权限窗。
- 高体积图像建议先 `writeTempFile` 落盘再递交路径，规避 base64 传输开销。
- 不支持网络 URL。

## 3. writeTempFile

```js
var res = await window.xhs.miniTool.writeTempFile({
  data: canvas.toDataURL("image/png")   // 完整 data: URI，不要截掉前缀
});
res.filePath;  // 临时路径，具备时效性，即用即弃，不要持久化
```

- 仅支持 png/jpeg/webp/gif/mp4。

## 4. Storage 系列（客户端 9.46.0+）

容器级缓存。**单 key ≤1MB、总空间 ≤10MB**；`data` 仅限 JSON 字符串；`encrypt` 读写必须一致。

```js
await window.xhs.miniTool.setStorage({
  key: "profile",
  data: JSON.stringify({ nickname: "小红书" }),
  encrypt: false            // 可选
});

var res = await window.xhs.miniTool.getStorage({ key: "profile", encrypt: false });
JSON.parse(res.data);

await window.xhs.miniTool.getStorageInfo();   // { keys, currentSize, limitSize }（KB）
await window.xhs.miniTool.removeStorage({ key: "profile" });
await window.xhs.miniTool.clearStorage();
```

- 旧版客户端回退到 localStorage/IndexedDB 时，须捕获写入异常并自建迁移逻辑（浏览器存储不承诺生命周期）。

## 5. 文件系统（客户端 9.49.0+）

根目录来自 `launchOptions.miniToolEnv.userDataPath`，相对路径基于它拼接。**不可硬编码/长期固化句柄**；工作区属本地缓存性质，卸载或清档可能遗失，核心资产需支持重建。

```js
await window.xhs.miniTool.saveFile({ tempFilePath: "...", filePath: null });   // → { savedFilePath }
await window.xhs.miniTool.writeFile({ filePath: "a/b.json", data: "{}", encoding: "utf8" });   // → { writtenBytes }
await window.xhs.miniTool.appendFile({ filePath: "a/log.txt", data: "...", encoding: "utf8" });
await window.xhs.miniTool.readFile({ filePath: "a/b.json", encoding: "utf8", position: 0, length: 4096 });
// → { data, bytesRead, eof }
await window.xhs.miniTool.readDir({ dirPath: "a" });        // → { files, truncated }
await window.xhs.miniTool.statFile({ filePath: "a/b.json" });  // → { size, lastModified, isDir }
await window.xhs.miniTool.unlink({ filePath: "a/b.json" });
await window.xhs.miniTool.mkdir({ dirPath: "a/c", recursive: true });
var info = await window.xhs.miniTool.getFileStorageInfo();
// → { usedBytes, limitBytes, fileCount, tmpUsedBytes, writeChunkMaxBytes, readChunkMaxBytes }
```

- `encoding`：`"utf8"` 或 `"base64"`。
- 大文件分片读写必须按 `getFileStorageInfo()` 返回的 `writeChunkMaxBytes / readChunkMaxBytes` 执行。

## 6. interactionOpenApi（客户端 9.49.0+）

用途：唤起小红书发布评论视图（草稿带图文）。**需用户主动操作触发。**

```js
var res = await window.xhs.miniTool.interactionOpenApi({
  payload: {
    action: "post_comment",                  // 目前固定取值
    content: "评论内容",                      // 可选
    media_bean: [                            // 可选，现阶段仅图片
      { media_type: "image", cover_image_url: "<容器内本地路径>" }
    ],
    miniToolSnapshotInfo: "{...}"            // 可选，状态桥接快照，≤2KB，超出截断
  },
  saveToAlbum: false                          // 可选
});
// → { routed, savedToAlbum, albumFailReason? }
```

- 媒体路径必须是容器本地句柄（writeTempFile/saveFile 产物），不支持网络 URL。
- 相册落盘失败可通过 `albumFailReason` 归因。

## 推荐组合：Canvas → 保存 / 发笔记

```js
var dataUrl = canvas.toDataURL("image/png");
var tmp = await window.xhs.miniTool.writeTempFile({ data: dataUrl });

await window.xhs.miniTool.saveImageToPhotosAlbum({ filePath: tmp.filePath });

await window.xhs.miniTool.postNote({
  title: "我的结果",
  pageType: "photo_publish",
  mediaInfo: { image_resources: [{ url: tmp.filePath }] }
});
```

内容导出遵循官方范式：**编码落盘（writeTempFile）→ 传递路径**，避免直接把大 base64 塞给 save/post 接口。
