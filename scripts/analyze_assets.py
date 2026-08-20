#!/usr/bin/env python3
"""Inventory a MiniTool directory: sizes, duplicates, extensions and large files."""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('root', type=Path)
    ap.add_argument('--out', type=Path)
    ap.add_argument('--large-kb', type=int, default=512)
    ap.add_argument('--budget-mb', type=float, help='Optional project-specific budget; no platform limit is assumed by default')
    args = ap.parse_args()

    root = args.root.resolve()
    if not root.is_dir():
        raise SystemExit(f'Not a directory: {root}')

    rows = []
    ext_counts = Counter()
    ext_bytes = Counter()
    by_hash = defaultdict(list)
    total = 0
    for p in sorted(root.rglob('*')):
        if not p.is_file():
            continue
        rel = p.relative_to(root).as_posix()
        size = p.stat().st_size
        total += size
        ext = p.suffix.lower() or '<none>'
        ext_counts[ext] += 1
        ext_bytes[ext] += size
        digest = sha256_file(p)
        by_hash[digest].append(rel)
        rows.append({'path': rel, 'size': size, 'ext': ext, 'sha256': digest})

    duplicates = [paths for paths in by_hash.values() if len(paths) > 1]
    large = sorted([r for r in rows if r['size'] >= args.large_kb * 1024], key=lambda r: r['size'], reverse=True)
    over_budget = bool(args.budget_mb is not None and total > args.budget_mb * 1024 * 1024)
    report = {
        'root': str(root),
        'files': len(rows),
        'total_bytes': total,
        'budget_mb': args.budget_mb,
        'over_budget': over_budget,
        'extension_counts': dict(ext_counts),
        'extension_bytes': dict(ext_bytes),
        'large_files': large,
        'duplicate_groups': duplicates,
        'largest_files': sorted(rows, key=lambda r: r['size'], reverse=True)[:30],
    }

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
    print(f'FILES={len(rows)} TOTAL={total} bytes ({total / 1024 / 1024:.2f} MiB)')
    print(f'LARGE={len(large)} DUP_GROUPS={len(duplicates)}' + (f' OVER_BUDGET={over_budget}' if args.budget_mb is not None else ''))
    for r in report['largest_files'][:10]:
        print(f"{r['size']/1024:.1f} KiB\t{r['path']}")


if __name__ == '__main__':
    main()
