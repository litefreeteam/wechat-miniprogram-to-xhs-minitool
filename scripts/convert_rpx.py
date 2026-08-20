#!/usr/bin/env python3
"""Mechanical WXSS rpx -> vw converter.

750rpx is treated as 100vw. This is only a migration starting point; typography,
max-width and fixed visual details still require manual responsive QA.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

RPX = re.compile(r'(?<![\w-])(-?\d+(?:\.\d+)?)rpx\b')


def convert(text: str) -> str:
    def repl(m):
        n = float(m.group(1))
        vw = n * 100.0 / 750.0
        s = f'{vw:.6f}'.rstrip('0').rstrip('.')
        if s == '-0': s = '0'
        return s + 'vw'
    return RPX.sub(repl, text)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('input', type=Path)
    p.add_argument('-o', '--output', type=Path)
    args = p.parse_args()
    src = args.input.read_text('utf-8')
    out = convert(src)
    target = args.output or args.input.with_suffix('.css')
    target.write_text(out, 'utf-8')
    print(target)


if __name__ == '__main__':
    main()
