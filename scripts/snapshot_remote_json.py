#!/usr/bin/env python3
"""Build-time snapshot of explicitly approved static JSON endpoints/files.

This script is intentionally explicit: URLs must be passed by the user and their hosts must
match --host allowlists. It is for immutable/config-like data, never for auth/private/real-time data.
"""
from __future__ import annotations
import argparse, json, urllib.request, fnmatch
from pathlib import Path
from urllib.parse import urlsplit


def host_ok(host, patterns): return any(fnmatch.fnmatch(host, p) for p in patterns)

def js_assign(namespace, key, obj):
    payload=json.dumps(obj, ensure_ascii=False, separators=(',',':'))
    return f"window.{namespace}=window.{namespace}||{{}};\nwindow.{namespace}[{json.dumps(key)}]={payload};\n"

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('url')
    ap.add_argument('--host', action='append', required=True, help='Allowed host or glob; repeatable')
    ap.add_argument('-o','--output', type=Path, required=True)
    ap.add_argument('--namespace', default='AppStaticData')
    ap.add_argument('--key', required=True)
    ap.add_argument('--timeout', type=int, default=20)
    a=ap.parse_args()
    u=urlsplit(a.url)
    if u.scheme not in ('http','https') or not u.hostname or not host_ok(u.hostname,a.host):
        raise SystemExit('URL host is not explicitly allowlisted')
    req=urllib.request.Request(a.url, headers={'User-Agent':'xhs-minitool-migration/1.0'})
    with urllib.request.urlopen(req, timeout=a.timeout) as r:
        raw=r.read(); ctype=r.headers.get('content-type','')
    try: obj=json.loads(raw.decode('utf-8'))
    except Exception as e: raise SystemExit(f'Not valid UTF-8 JSON: {e}')
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text(js_assign(a.namespace,a.key,obj),'utf-8')
    print(json.dumps({'bytes':len(raw),'content_type':ctype,'output':str(a.output)},ensure_ascii=False))
if __name__=='__main__': main()
