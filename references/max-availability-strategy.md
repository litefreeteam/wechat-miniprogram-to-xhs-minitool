# 最大可用迁移策略

## 核心原则

迁移的优化目标是“保住用户价值”，不是“保住微信 API 名字”。

### 优先顺序

1. 标准 Web 等价
2. XHS Bridge
3. 构建期资源本地化
4. 构建期数据快照
5. 构建期预计算/预解码/预渲染
6. 本地存储/本地身份模拟
7. 用户手动输入/本地选图替代平台授权数据
8. 产品语义重写
9. 标准 Web PROBE 增强
10. HARD_BLOCK

## 什么时候“本地模拟”是诚实的

可以：

- openid 只用于本机存档 key → 本地 installId；
- 云数据库只保存游戏进度 → IndexedDB；
- 在线排行只用于激励 → 本机最好成绩/预置挑战目标；
- 云配置很少变化 → 构建期 snapshot；
- 用户头像只是装饰 → 用户本地选图。

不可以：

- installId 冒充账号登录；
- 静态排行冒充全球实时排行；
- 快照价格冒充实时价格；
- 本地按钮冒充支付成功；
- 任务解锁冒充广告播放完成。

## 构建期是最大可用的重要“第二运行时”

MiniTool 运行时不能联网/WASM/Worker，但迁移/构建阶段可以做大量工作：

- 下载有授权 OSS 图片；
- 调远程固定配置接口得到 snapshot；
- 将 Draco/Basis/特殊图片预解码为普通本地资产；
- 把固定 PDF/文档转图片/HTML；
- 把有限输入的计算结果预生成查表；
- 把远程网页的固定内容迁成本地 HTML（需有授权）；
- 把动态 URL 可枚举集合生成 asset map。

这类方案能显著减少 HARD_BLOCK。

## PROBE 的使用纪律

PROBE 不是“猜支持”。

例如振动：

```js
if (typeof navigator.vibrate === 'function') {
  try { navigator.vibrate(20); } catch (_) {}
}
```

页面不振动仍应完全可用。

同理 MediaRecorder、requestIdleCallback 等只能增强体验。
