#!/usr/bin/env python3
"""Validate then build an XHS MiniTool upload zip with index.html at zip root."""
from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys
import zipfile
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('dist', type=Path)
    parser.add_argument('-o', '--output', type=Path, required=True)
    parser.add_argument('--skip-analyze', action='store_true')
    args = parser.parse_args()

    root = args.dist.resolve()
    validator = Path(__file__).with_name('validate_xhs_minitool.py')
    rc = subprocess.call([sys.executable, str(validator), str(root)])
    if rc != 0:
        raise SystemExit('Validation failed; zip was not created.')

    if not args.skip_analyze:
        analyzer = Path(__file__).with_name('analyze_assets.py')
        subprocess.call([sys.executable, str(analyzer), str(root)])

    out = args.output.resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()

    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for p in sorted(root.rglob('*')):
            if p.is_file():
                zf.write(p, p.relative_to(root).as_posix())

    with zipfile.ZipFile(out) as zf:
        names = zf.namelist()
        if 'index.html' not in names:
            out.unlink(missing_ok=True)
            raise SystemExit('Internal error: index.html is not at zip root')
        htmls = [n for n in names if n.lower().endswith('.html')]
        if htmls != ['index.html']:
            out.unlink(missing_ok=True)
            raise SystemExit(f'Internal error: expected only root index.html, got {htmls}')

    size = out.stat().st_size
    print(f'Built: {out} ({size / 1024:.1f} KiB)')
    print(f'SHA256: {sha256_file(out)}')


if __name__ == '__main__':
    main()
