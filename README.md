# wechat-miniprogram-to-xhs-minitool

版本：**v1.0.0**（最大可用修订版，2026-08-20）

把原生微信小程序 / Canvas 微信小游戏迁移为小红书 MiniTool 离线 H5 ZIP。

## 本版原则

不是“严格阻断优先”，而是：

> Web 等价 → XHS Bridge → OSS 本地化 → 构建期快照 → 预计算 → 本地模拟 → 产品语义重写 → 标准 Web 可探测增强 → 最后才 HARD_BLOCK。

不会伪造登录、支付、广告、实时服务端或平台身份。

## 推荐命令

```bash
# 1. 扫描
python3 scripts/scan_wechat_miniprogram.py ./project --out /tmp/audit

# 2. 生成最大可用执行计划
python3 scripts/generate_max_use_plan.py /tmp/audit/migration-audit.json -o /tmp/max-plan.md

# 3. OSS/CDN 静态资源本地化
python3 scripts/localize_remote_assets.py ./project \
  --host your-bucket.oss-cn-shanghai.aliyuncs.com \
  --output-root /tmp/xhs-work --apply

# 4. 固定远程 JSON 构建期快照（显式白名单）
python3 scripts/snapshot_remote_json.py 'https://example.com/config.json' \
  --host example.com -o ./xhs-dist/assets/data/config.js --key config

# 5. 已有 JSON 转 classic JS
python3 scripts/materialize_static_json.py ./config.json \
  -o ./xhs-dist/assets/data/config.js --key config

# 6. 媒体扩展被上传器拒绝时的实验 fallback（需 PROBE + fallback）
python3 scripts/embed_media_as_js.py ./tap.mp3 \
  -o ./xhs-dist/assets/data/media.js --key tap

# 7. 验包
python3 scripts/analyze_assets.py ./xhs-dist
python3 scripts/validate_xhs_minitool.py ./xhs-dist
python3 scripts/build_xhs_zip.py ./xhs-dist -o ./tool.zip
```

详见 `SKILL.md`。


## MiniTool 原生体验适配

- 自动迁移时不要重复绘制左上角返回键；MiniTool 容器自带返回控件。内部 SPA 用 History API 维护回退语义。
- 微信 `picker mode=selector` 默认使用 `templates/wheel-picker.js` + `wheel-picker.css` 实现底部滚轮。
- 微信 `picker mode=date` 默认使用年/月/日三列滚轮，避免系统 `<input type=date>` 与微信体验差异。
## Picker 视觉基线

迁移微信 selector/date picker 时默认使用 `templates/wheel-picker.*`：底部 5 行滚轮、56px 工具栏、左右 18px 安全内边距、无拖拽条、取消/确定 44px 点击热区、克制选中 indicator。不得用贴边按钮或系统原生 `<select>/<input type=date>` 作为最终主交互。

