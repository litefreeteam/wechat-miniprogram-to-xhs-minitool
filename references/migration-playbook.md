# 最大可用迁移执行手册

## Step 1：扫描

```bash
python3 scripts/scan_wechat_miniprogram.py ./project --out ./migration-audit
python3 scripts/generate_max_use_plan.py ./migration-audit/migration-audit.json -o ./maximum-use-plan.md
```

先看 HARD_BLOCK，但不要直接删：先按 `SKILL.md` 的十级决策树尝试替代。

## Step 2：保静态资源

```bash
python3 scripts/localize_remote_assets.py ./project \
  --host your.oss.host \
  --output-root /tmp/xhs-work --apply
```

动态 OSS 可枚举时生成 asset map。

## Step 3：保固定数据

固定远程 JSON：`snapshot_remote_json.py`。
已有 JSON：`materialize_static_json.py`。

## Step 4：拆云函数

逐个函数标：

- PURE_CLIENT
- SNAPSHOT
- LOCALIZE
- LOCAL_CRUD
- HARD_SERVER

前四类尽量迁，最后一类才硬阻断。

## Step 5：转 UI/路由/状态

WXML → DOM，WXSS → CSS，Page/Component → controller，微信多页 → SPA，小游戏 → Canvas shell。

## Step 6：平台能力重写

优先：Storage、File/Blob、Canvas、getUserMedia、postNote/saveImage/writeTempFile、手动输入、本地选择器、产品语义重写。

## Step 7：PROBE 增强

引入 `templates/capability-probe.js`。只能增强，失败不影响主流程。

## Step 8：构建/依赖收敛

最终 classic local JS，无网络/eval/WASM/Worker/runtime module/CDN。

## Step 9：严格验包

```bash
python3 scripts/analyze_assets.py ./xhs-dist
python3 scripts/validate_xhs_minitool.py ./xhs-dist
python3 scripts/build_xhs_zip.py ./xhs-dist -o ./tool.zip
```

## 最终检查

- [ ] 核心流程断网可完成
- [ ] 远程静态资源本地化
- [ ] 固定服务端数据 snapshot
- [ ] 云函数可迁逻辑已前移/本地化
- [ ] HARD_BLOCK 都有明确产品决策
- [ ] PROBE 都有 fallback
- [ ] 不伪造登录/支付/广告/实时排行
- [ ] validator ERROR=0
- [ ] ZIP 根为 index.html
