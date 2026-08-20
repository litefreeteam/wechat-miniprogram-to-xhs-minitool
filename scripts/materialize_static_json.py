#!/usr/bin/env python3
"""Convert static JSON into a classic JS data module for offline MiniTool use.

MiniTool forbids runtime network requests. Although .json is an allowed package file
extension, using fetch() to load it is not an acceptable baseline. This script emits
classic JS that can be loaded with <script src="...">.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def js_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('input', type=Path)
    p.add_argument('-o', '--output', type=Path, required=True)
    p.add_argument('--namespace', default='AppStaticData')
    p.add_argument('--key', help='Property key; defaults to input file stem')
    args = p.parse_args()

    data = json.loads(args.input.read_text('utf-8'))
    key = args.key or args.input.stem
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    out = (
        '(function (global) {\n'
        "  'use strict';\n"
        f'  var ns = global[{js_string(args.namespace)}] || (global[{js_string(args.namespace)}] = {{}});\n'
        f'  ns[{js_string(key)}] = {payload};\n'
        '})(window);\n'
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(out, 'utf-8')
    print(args.output)


if __name__ == '__main__':
    main()
