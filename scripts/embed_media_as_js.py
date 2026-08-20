#!/usr/bin/env python3
"""Embed a local media file into an allowed classic .js file as a data URI.

Use only as a maximum-availability fallback when the MiniTool uploader rejects media file
extensions. Runtime audio/video data-URI behavior is not explicitly guaranteed by XHS docs,
so consumers must feature-test and provide a no-media/poster fallback.
"""
from __future__ import annotations
import argparse, base64, json, mimetypes
from pathlib import Path

DEFAULT_MIME={'.mp3':'audio/mpeg','.m4a':'audio/mp4','.aac':'audio/aac','.wav':'audio/wav','.ogg':'audio/ogg','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime'}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('input', type=Path)
    ap.add_argument('-o','--output', type=Path, required=True)
    ap.add_argument('--key', required=True)
    ap.add_argument('--namespace', default='EmbeddedMedia')
    ap.add_argument('--max-mib', type=float, default=3.0)
    ap.add_argument('--force', action='store_true')
    a=ap.parse_args(); p=a.input
    size=p.stat().st_size
    if size>a.max_mib*1024*1024 and not a.force:
        raise SystemExit(f'{size/1024/1024:.2f} MiB exceeds --max-mib; base64 adds ~33% overhead. Use --force only intentionally.')
    mime=DEFAULT_MIME.get(p.suffix.lower()) or mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
    uri=f"data:{mime};base64,"+base64.b64encode(p.read_bytes()).decode('ascii')
    a.output.parent.mkdir(parents=True, exist_ok=True)
    js=f"window.{a.namespace}=window.{a.namespace}||{{}};\nwindow.{a.namespace}[{json.dumps(a.key)}]={json.dumps(uri)};\n"
    a.output.write_text(js,'utf-8')
    print(json.dumps({'input_bytes':size,'js_bytes':a.output.stat().st_size,'mime':mime,'warning':'runtime media data URI requires PROBE + fallback'},ensure_ascii=False))
if __name__=='__main__': main()
