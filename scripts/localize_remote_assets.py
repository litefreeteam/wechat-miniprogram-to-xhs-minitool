#!/usr/bin/env python3
"""Localize literal remote static assets into a project tree and rewrite references.

Designed for WeChat Mini Program -> XHS MiniTool migrations. MiniTool cannot load
remote resources at runtime, so image/font assets must be bundled locally.

Safety defaults:
- scans only text source files;
- downloads only from explicitly allowlisted hosts;
- auto-localizes images/fonts only;
- never auto-localizes remote JS/CSS or arbitrary API JSON;
- preserves URL query when downloading (important for OSS x-oss-process);
- redacts common signed-URL credentials in the manifest;
- dry-run unless --apply is supplied.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable

TEXT_SUFFIXES = {'.html', '.css', '.js', '.ts', '.json', '.wxml', '.wxss', '.wxs'}
SKIP_DIRS = {'.git', 'node_modules', '__MACOSX'}
IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}
FONT_EXTS = {'.woff', '.woff2'}
CODE_EXTS = {'.js', '.mjs', '.cjs', '.css'}
DATA_EXTS = {'.json'}
MEDIA_EXTS = {'.mp3', '.m4a', '.aac', '.wav', '.ogg', '.mp4', '.mov', '.webm'}
SUPPORTED_PACKAGE_EXTS = IMAGE_EXTS | FONT_EXTS
URL_RE = re.compile(r'https?://[^\s"\'<>`)}\]]+', re.I)
SENSITIVE_QUERY_KEYS = {
    'signature', 'ossaccesskeyid', 'accesskeyid', 'token', 'security-token',
    'x-oss-signature', 'x-oss-credential', 'x-oss-security-token',
    'x-amz-signature', 'x-amz-credential', 'x-amz-security-token',
}
CONTENT_TYPE_EXT = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'font/woff': '.woff',
    'font/woff2': '.woff2',
    'application/font-woff': '.woff',
    'application/json': '.json',
    'text/json': '.json',
    'text/css': '.css',
    'text/javascript': '.js',
    'application/javascript': '.js',
    'video/mp4': '.mp4',
    'audio/mpeg': '.mp3',
}


@dataclass
class AssetRecord:
    source_file: str
    line: int
    original_url: str
    manifest_url: str
    host: str
    category: str
    status: str
    advice: str
    local_path: str | None = None
    size: int | None = None
    sha256: str | None = None
    content_type: str | None = None


def iter_text_files(root: Path) -> Iterable[Path]:
    for p in root.rglob('*'):
        if not p.is_file() or p.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if any(part in SKIP_DIRS for part in p.relative_to(root).parts):
            continue
        yield p


def normalize_host_pattern(pattern: str) -> str:
    return pattern.strip().lower().rstrip('.')


def host_allowed(host: str, patterns: list[str]) -> bool:
    host = (host or '').lower().rstrip('.')
    for raw in patterns:
        p = normalize_host_pattern(raw)
        if not p:
            continue
        if p.startswith('*.'):
            suffix = p[1:]  # .example.com
            if host.endswith(suffix) and host != suffix[1:]:
                return True
        elif host == p:
            return True
    return False


def sanitize_url(url: str) -> str:
    try:
        u = urllib.parse.urlsplit(url)
        pairs = urllib.parse.parse_qsl(u.query, keep_blank_values=True)
        clean = []
        for k, v in pairs:
            clean.append((k, '<redacted>' if k.lower() in SENSITIVE_QUERY_KEYS else v))
        return urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, urllib.parse.urlencode(clean), ''))
    except Exception:
        return url


def classify_url(url: str) -> tuple[str, str]:
    path = urllib.parse.urlsplit(url).path
    ext = Path(path).suffix.lower()
    if ext in IMAGE_EXTS:
        return 'image', ext
    if ext in FONT_EXTS:
        return 'font', ext
    if ext in CODE_EXTS:
        return 'code', ext
    if ext in DATA_EXTS:
        return 'data', ext
    if ext in MEDIA_EXTS:
        return 'media', ext
    return 'unknown', ext


def line_number(text: str, pos: int) -> int:
    return text.count('\n', 0, pos) + 1


def safe_suffix(content_type: str | None, url: str) -> str | None:
    if content_type:
        ct = content_type.split(';', 1)[0].strip().lower()
        if ct in CONTENT_TYPE_EXT:
            return CONTENT_TYPE_EXT[ct]
    path_ext = Path(urllib.parse.urlsplit(url).path).suffix.lower()
    if path_ext in IMAGE_EXTS | FONT_EXTS | CODE_EXTS | DATA_EXTS | MEDIA_EXTS:
        return path_ext
    return None


def download(url: str, timeout: int, user_agent: str, max_bytes: int) -> tuple[bytes, str | None]:
    req = urllib.request.Request(url, headers={'User-Agent': user_agent})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        content_type = resp.headers.get('Content-Type')
        length = resp.headers.get('Content-Length')
        if length and int(length) > max_bytes:
            raise ValueError(f'remote file too large ({int(length)} bytes > {max_bytes})')
        chunks = []
        total = 0
        while True:
            chunk = resp.read(min(1024 * 1024, max_bytes - total + 1))
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise ValueError(f'remote file exceeds max size {max_bytes} bytes')
            chunks.append(chunk)
        return b''.join(chunks), content_type


def rel_reference(from_file: Path, to_file: Path) -> str:
    rel = os.path.relpath(to_file, from_file.parent).replace(os.sep, '/')
    if not rel.startswith('.'):
        rel = './' + rel
    return rel


def main() -> None:
    ap = argparse.ArgumentParser(description='Localize remote image/font assets and rewrite literal URLs.')
    ap.add_argument('root', type=Path, help='Project/source tree to scan.')
    ap.add_argument('--output-root', type=Path, help='Optional migration working copy. With --apply, copy root here first and rewrite the copy instead of the original.')
    ap.add_argument('--host', action='append', default=[], help='Allowlisted host, repeatable; supports *.example.com')
    ap.add_argument('--assets-dir', default='assets/remote', help='Destination directory relative to root')
    ap.add_argument('--manifest', type=Path, help='Manifest output path (default: <root>/asset-localization-manifest.json)')
    ap.add_argument('--apply', action='store_true', help='Actually download and rewrite. Default is dry-run.')
    ap.add_argument('--timeout', type=int, default=20)
    ap.add_argument('--max-file-mb', type=float, default=12.0)
    ap.add_argument('--max-total-mb', type=float, default=120.0)
    ap.add_argument('--allow-http', action='store_true', help='Allow plain HTTP downloads; not recommended for production assets')
    ap.add_argument('--user-agent', default='xhs-minitool-migration/1.0')
    args = ap.parse_args()

    source_root = args.root.resolve()
    if not source_root.is_dir():
        raise SystemExit(f'Root not found: {source_root}')
    root = source_root
    if args.output_root:
        if not args.apply:
            raise SystemExit('--output-root is only meaningful with --apply')
        out_root = args.output_root.resolve()
        if out_root.exists():
            raise SystemExit(f'--output-root already exists: {out_root}')
        shutil.copytree(source_root, out_root, ignore=shutil.ignore_patterns('.git', 'node_modules', '__MACOSX'))
        root = out_root
    if args.apply and not args.host:
        raise SystemExit('--apply requires at least one explicit --host allowlist entry')

    assets_dir = (root / args.assets_dir).resolve()
    try:
        assets_dir.relative_to(root)
    except ValueError:
        raise SystemExit('--assets-dir must stay inside root')

    max_file = int(args.max_file_mb * 1024 * 1024)
    max_total = int(args.max_total_mb * 1024 * 1024)
    manifest_path = (args.manifest or (root.parent / (root.name + '-asset-localization-manifest.json'))).resolve()
    records: list[AssetRecord] = []
    replacements: dict[Path, dict[str, str]] = {}
    digest_to_path: dict[str, Path] = {}
    total_downloaded = 0

    occurrences: list[tuple[Path, str, int]] = []
    for p in iter_text_files(root):
        try:
            text = p.read_text('utf-8')
        except UnicodeDecodeError:
            continue
        for m in URL_RE.finditer(text):
            occurrences.append((p, m.group(0), line_number(text, m.start())))

    # Cache each exact URL so repeated references only download once.
    url_result: dict[str, tuple[str, Path | None, int | None, str | None, str | None, str]] = {}
    # status, path, size, sha, content_type, advice

    for p, url, line in occurrences:
        parsed = urllib.parse.urlsplit(url)
        host = parsed.hostname or ''
        category, ext = classify_url(url)
        status = 'FOUND'
        advice = ''
        local_path: Path | None = None
        size = None
        sha = None
        content_type = None

        if parsed.scheme == 'http' and not args.allow_http:
            status = 'BLOCKED_INSECURE_SCHEME'
            advice = '迁移下载阶段默认只允许 HTTPS；如确为受控内网测试资源可显式 --allow-http。'
        elif not host_allowed(host, args.host):
            status = 'BLOCKED_HOST' if args.apply else 'NEEDS_HOST_ALLOWLIST'
            advice = '仅允许显式白名单域名自动下载，避免把 API、第三方或无授权内容误打包。'
        elif category == 'code':
            status = 'ADAPT_REMOTE_CODE'
            advice = '远程 JS/CSS 不自动下载；应由项目依赖/bundler 本地构建并检查其运行时行为。'
        elif category == 'data':
            status = 'SNAPSHOT_REQUIRED'
            advice = '远程 JSON 可能是服务端数据；先确认是否静态配置，再快照并转换为经典 JS 数据模块，禁止运行时 fetch。'
        elif category == 'media':
            status = 'PROBE_MEDIA'
            advice = '容器支持 audio/video 播放，但当前官方包内文件类型白名单未列常见媒体扩展；不要自动宣称可上传。'
        elif category in {'image', 'font', 'unknown'}:
            if not args.apply:
                status = 'READY_TO_LOCALIZE'
                advice = '静态资源可在迁移阶段下载并改为包内相对路径。'
            else:
                if url in url_result:
                    status, local_path, size, sha, content_type, advice = url_result[url]
                else:
                    try:
                        data, content_type = download(url, args.timeout, args.user_agent, max_file)
                        suffix = safe_suffix(content_type, url)
                        if suffix not in SUPPORTED_PACKAGE_EXTS:
                            detected = suffix or '<unknown>'
                            raise ValueError(f'downloaded content type/extension not auto-localizable: {detected}')
                        if total_downloaded + len(data) > max_total:
                            raise ValueError(f'total localized assets would exceed {max_total} bytes')
                        sha = hashlib.sha256(data).hexdigest()
                        if sha in digest_to_path:
                            local_path = digest_to_path[sha]
                            status = 'LOCALIZED_DEDUPED'
                            advice = '内容与已下载资源相同，复用同一包内文件。'
                        else:
                            assets_dir.mkdir(parents=True, exist_ok=True)
                            local_path = assets_dir / f'{sha[:16]}{suffix}'
                            local_path.write_bytes(data)
                            digest_to_path[sha] = local_path
                            total_downloaded += len(data)
                            status = 'LOCALIZED'
                            advice = '已下载并改写为包内相对路径；下载请求保留原 URL query（含 OSS 图片处理参数）。'
                        size = len(data)
                        url_result[url] = (status, local_path, size, sha, content_type, advice)
                    except Exception as e:
                        status = 'FAILED'
                        advice = f'自动本地化失败：{e}'
                        url_result[url] = (status, None, None, None, content_type, advice)
        else:
            status = 'MANUAL_REVIEW'
            advice = '无法安全分类，人工确认是否为静态资源、API 或用户动态内容。'

        if local_path is not None and status.startswith('LOCALIZED'):
            replacements.setdefault(p, {})[url] = rel_reference(p, local_path)

        records.append(AssetRecord(
            source_file=str(p.relative_to(root)),
            line=line,
            original_url=sanitize_url(url),
            manifest_url=sanitize_url(url),
            host=host,
            category=category,
            status=status,
            advice=advice,
            local_path=str(local_path.relative_to(root)).replace(os.sep, '/') if local_path else None,
            size=size,
            sha256=sha,
            content_type=content_type,
        ))

    if args.apply:
        for p, mapping in replacements.items():
            text = p.read_text('utf-8')
            # Exact literal replacement. Do longest first to avoid prefix collisions.
            for old in sorted(mapping, key=len, reverse=True):
                text = text.replace(old, mapping[old])
            p.write_text(text, 'utf-8')

    summary: dict[str, int] = {}
    for r in records:
        summary[r.status] = summary.get(r.status, 0) + 1
    manifest = {
        'source_root': str(source_root),
        'root': str(root),
        'mode': 'apply' if args.apply else 'dry-run',
        'allowlisted_hosts': args.host,
        'assets_dir': str(assets_dir.relative_to(root)).replace(os.sep, '/'),
        'total_downloaded_bytes': total_downloaded,
        'summary': summary,
        'records': [asdict(r) for r in records],
        'notes': [
            'Only literal http(s) URLs are rewritten automatically.',
            'Dynamic URL construction, API-returned URLs, cloud:// and wxfile:// require separate migration decisions.',
            'Remote JS/CSS is never auto-downloaded by this tool.',
            'Remote JSON is snapshot-required rather than auto-treated as a static asset.',
            'Common signed URL credentials are redacted in the manifest. The downloader still uses the exact source literal in memory so signed OSS URLs can be fetched.'
        ],
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), 'utf-8')

    print(json.dumps(summary, ensure_ascii=False))
    print(manifest_path)
    if args.apply:
        unresolved = sum(v for k, v in summary.items() if not k.startswith('LOCALIZED'))
        if unresolved:
            print(f'WARNING: {unresolved} remote URL occurrence(s) remain unresolved; review manifest.', file=sys.stderr)


if __name__ == '__main__':
    main()
