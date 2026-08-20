# 固定服务端数据离线化

## 可 SNAPSHOT 的数据

- 关卡配置
- 固定题库/词典
- 静态商品/内容展示
- 规则参数
- 城市/地区/POI 静态列表
- 很少变化且允许随版本更新的数据

## 不可冒充快照

- 用户身份/隐私
- 订单
- 实时价格/库存
- 实时排行榜
- 个性化推荐
- 在线活动实时状态
- 支付/鉴权

## 工具

已有 JSON：

```bash
python3 scripts/materialize_static_json.py ./items.json \
  -o ./xhs-dist/assets/data/items.js --key items
```

显式允许的远程固定 JSON：

```bash
python3 scripts/snapshot_remote_json.py \
  'https://example.com/items.json' \
  --host example.com \
  -o ./xhs-dist/assets/data/items.js \
  --key items
```

输出形态：

```js
window.AppStaticData = window.AppStaticData || {};
window.AppStaticData.items = [...];
```

不要 `fetch('./items.json')`，因为网络请求整体被禁。

## 最大可用升级

如果接口不只是返回数据，还做简单计算：

- 纯确定性逻辑 → 搬客户端；
- 有限输入 → 构建期 PRECOMPUTE 为 lookup table；
- 用户本机 CRUD → IndexedDB；
- 必须私密密钥/服务端权限/实时数据 → HARD_BLOCK。
