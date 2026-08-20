#!/usr/bin/env python3
"""Turn migration-audit.json into an implementation-focused maximum-availability plan."""
from __future__ import annotations
import argparse, json
from pathlib import Path
from collections import defaultdict

ORDER = ['PRESERVE','ADAPT','LOCALIZE','SNAPSHOT','EMULATE_LOCAL','PRECOMPUTE','PRODUCT_REWRITE','PROBE','REVIEW','HARD_BLOCK']

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('audit_json', type=Path)
    ap.add_argument('-o','--output', type=Path, default=Path('maximum-use-plan.md'))
    a=ap.parse_args()
    data=json.loads(a.audit_json.read_text('utf-8'))
    groups=defaultdict(list)
    for i in data.get('issues',[]): groups[i['status']].append(i)
    lines=['# 最大可用迁移执行计划','',
           '执行优先级：Web 等价 → XHS Bridge → 构建期本地化/快照/预计算 → 本地模拟 → 产品重写 → 可探测增强 → HARD_BLOCK。','']
    for s in ORDER:
        items=groups.get(s,[])
        if not items: continue
        lines += [f'## {s}（{len(items)}）','']
        for i in items:
            lines.append(f"- `{i['file']}:{i['line']}` **{i['symbol']}** — {i['advice']}")
        lines.append('')
    hb=len(groups.get('HARD_BLOCK',[]))
    lines += ['## 交付判定','',
              f'- HARD_BLOCK 命中：{hb}。逐项确认它是否影响核心用户目标；如果只是原平台入口/商业化/社交壳层，可删除后继续迁移。',
              '- PROBE 不允许成为唯一主流程。',
              '- 最终 dist 必须通过 `validate_xhs_minitool.py`，且断网完整运行。']
    a.output.write_text('\n'.join(lines),'utf-8')
    print(a.output)
if __name__=='__main__': main()
