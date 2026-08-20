#!/usr/bin/env python3
"""Strict static validator for an XHS MiniTool distribution directory."""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

STRICT_EXTENSIONS = {'.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.json'}
MEDIA_EXTENSIONS = {'.mp3', '.m4a', '.aac', '.wav', '.ogg', '.mp4', '.mov', '.webm'}
TRASH_NAMES = {'.DS_Store', 'Thumbs.db'}
TRASH_PARTS = {'node_modules', '.git', '__MACOSX', '.idea', '.vscode'}
TRASH_SUFFIXES = {'.map'}
TEXT_EXTS = {'.html', '.css', '.js', '.json'}
XHS_ALLOWED_APIS = {'postNote', 'saveImageToPhotosAlbum', 'writeTempFile'}

CHECKS = [
    ('ERROR', r'\bfetch\s*\(', '禁止 fetch/网络请求'),
    ('ERROR', r'\bXMLHttpRequest\b', '禁止 XMLHttpRequest'),
    ('ERROR', r'\bWebSocket\s*\(', '禁止 WebSocket'),
    ('ERROR', r'\bEventSource\s*\(', '禁止 SSE/EventSource'),
    ('ERROR', r'\bRTCPeerConnection\b', '禁止 WebRTC'),
    ('ERROR', r'navigator\.geolocation', '禁止 Geolocation'),
    ('ERROR', r'navigator\.clipboard|execCommand\s*\(\s*["\'](?:copy|cut|paste)', '禁止 Clipboard'),
    ('ERROR', r'navigator\.(?:bluetooth|usb|hid|serial)', '禁止硬件连接 API'),
    ('ERROR', r'DeviceMotionEvent|DeviceOrientationEvent|\b(?:Accelerometer|Gyroscope|Magnetometer)\s*\(', '禁止传感器 API'),
    ('ERROR', r'\bnew\s+(?:Shared)?Worker\s*\(|serviceWorker', '禁止 Worker/ServiceWorker'),
    ('ERROR', r'\bWebAssembly\b|\.wasm\b', '禁止 WebAssembly/WASM'),
    ('ERROR', r'\beval\s*\(|\bnew\s+Function\s*\(', '禁止动态执行代码'),
    ('ERROR', r'window\.open\s*\(|window\.prompt\s*\(', '禁止新窗口/prompt'),
    ('ERROR', r'requestFullscreen\s*\(', '禁止 requestFullscreen'),
    ('ERROR', r'navigator\.credentials|navigator\.locks|navigator\.storage\.persist', '禁止凭据/锁/持久化存储 API'),
    ('ERROR', r'\bwx\.[A-Za-z_$]', '目标产物仍包含 wx.*，说明微信宿主 API 未清理'),
    ('ERROR', r'(^|[^\w$])(?:App|Page|Component)\s*\(\s*\{', '目标产物疑似仍包含微信 App/Page/Component 注册模型'),
]

REMOTE_URL_RE = re.compile(r'https?://[^\s"\'<>`)}\]]+', re.I)
ESCAPED_REMOTE_URL_RE = re.compile(r'https?:\\/\\/[^\s"\'<>`)}\]]+', re.I)
HTML_REF_RE = re.compile(r'\b(?:src|href)\s*=\s*["\']([^"\']+)["\']', re.I)
CSS_URL_RE = re.compile(r'url\(\s*["\']?([^"\')]+)["\']?\s*\)', re.I)
JS_LITERAL_ASSET_RE = re.compile(r'["\'](\.?\.?/[^"\']+\.(?:png|jpe?g|gif|webp|svg|woff2?|json))["\']', re.I)


def iter_text_files(root: Path):
    for p in root.rglob('*'):
        if p.is_file() and p.suffix.lower() in TEXT_EXTS:
            yield p


def is_ignored_ref(ref: str) -> bool:
    ref = ref.strip()
    return (
        not ref
        or ref.startswith(('#', 'data:', 'blob:', 'mailto:', 'tel:'))
        or ref.startswith('javascript:')
        or ref.startswith(('http://', 'https://', '//'))
    )


def resolve_local_ref(source: Path, ref: str) -> Path:
    # Strip query/hash from local package path; browsers resolve these to same file.
    clean = ref.split('#', 1)[0].split('?', 1)[0]
    return (source.parent / clean).resolve()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('dist', type=Path)
    parser.add_argument('--quiet', action='store_true')
    args = parser.parse_args()
    root = args.dist.resolve()

    errors = []
    warnings = []

    def add(level, path, msg):
        (errors if level == 'ERROR' else warnings).append((str(path), msg))

    if not root.is_dir():
        add('ERROR', root, '目标目录不存在')
    else:
        index = root / 'index.html'
        if not index.is_file():
            add('ERROR', root, '根目录缺少 index.html')

        html_files = [p for p in root.rglob('*.html') if p.is_file()]
        if len(html_files) != 1 or (html_files and html_files[0].resolve() != index.resolve()):
            add('ERROR', root, f'必须只有一个 HTML 入口且位于根目录；当前 HTML 数={len(html_files)}')

        for p in root.rglob('*'):
            if not p.is_file():
                continue
            rel = p.relative_to(root)
            if p.name in TRASH_NAMES or any(part in TRASH_PARTS for part in rel.parts) or p.suffix.lower() in TRASH_SUFFIXES:
                add('ERROR', rel, '开发/垃圾文件不应进入上传包')
                continue
            ext = p.suffix.lower()
            if ext in MEDIA_EXTENSIONS:
                add('WARNING', rel, '官方文档支持 audio/video 播放，但包内文件类型 allowlist 未列该扩展名；需后台/真机验证')
            elif ext not in STRICT_EXTENSIONS:
                add('ERROR', rel, f'扩展名 {ext or "<none>"} 不在官方当前文件类型 allowlist')
            if p.stat().st_size > 4 * 1024 * 1024:
                add('WARNING', rel, f'单文件较大：{p.stat().st_size / 1024 / 1024:.1f} MiB；建议检查是否可压缩/裁切')

        for p in iter_text_files(root):
            rel = p.relative_to(root)
            try:
                text = p.read_text('utf-8')
            except UnicodeDecodeError:
                add('ERROR', rel, '文本文件不是 UTF-8')
                continue

            for m in REMOTE_URL_RE.finditer(text):
                add('ERROR', rel, f'发现外部 URL：{m.group(0)[:120]}')
            if ESCAPED_REMOTE_URL_RE.search(text):
                add('ERROR', rel, '发现 JSON/字符串转义形式的外部 URL（http:\\/\\/ 或 https:\\/\\/）')

            for level, pattern, msg in CHECKS:
                if re.search(pattern, text, re.I | re.M):
                    add(level, rel, msg)

            if p.suffix.lower() == '.html':
                if re.search(r'<script\b(?![^>]*\bsrc\s*=)[^>]*>\s*[^<\s]', text, re.I | re.S):
                    add('ERROR', rel, '禁止内联 <script>；JS 必须放包内 .js')
                if re.search(r'\son[a-z]+\s*=', text, re.I):
                    add('ERROR', rel, '禁止 onclick/onload 等行内事件属性')
                if re.search(r'javascript\s*:', text, re.I):
                    add('ERROR', rel, '禁止 javascript: URI')
                if re.search(r'<script\b[^>]*\btype\s*=\s*["\']module["\']', text, re.I):
                    add('ERROR', rel, 'Skill 安全基线不允许运行时 ES module；请 bundle 为经典脚本')
                if re.search(r'<(?:iframe|object)\b', text, re.I):
                    add('ERROR', rel, '禁止 iframe/object')
                if re.search(r'<base\b', text, re.I):
                    add('ERROR', rel, '不要使用 <base>，避免离线路径异常')
                if re.search(r'<form\b[^>]*(?:action\s*=)', text, re.I):
                    add('ERROR', rel, '禁止表单跳转提交；用 JS preventDefault 本地处理')
                if re.search(r'<a\b[^>]*\bdownload\b', text, re.I):
                    add('ERROR', rel, '禁止文件下载')
                if re.search(r'target\s*=\s*["\']_blank["\']', text, re.I):
                    add('ERROR', rel, '禁止 target=_blank/打开外链')
                if re.search(r'(?:src|href)\s*=\s*["\']/(?!/)', text, re.I):
                    add('ERROR', rel, '资源应使用 ./ 相对路径，不要根绝对路径 /...')
                if 'viewport-fit=cover' not in text:
                    add('WARNING', rel, '建议 viewport meta 使用 viewport-fit=cover 并处理 safe-area')

                for m in HTML_REF_RE.finditer(text):
                    ref = m.group(1).strip()
                    if is_ignored_ref(ref):
                        continue
                    target = resolve_local_ref(p, ref)
                    try:
                        target.relative_to(root)
                    except ValueError:
                        add('ERROR', rel, f'本地资源引用逃出包根目录：{ref}')
                        continue
                    if not target.is_file():
                        add('ERROR', rel, f'本地资源不存在：{ref}')

            if p.suffix.lower() == '.css':
                if re.search(r'@import\s+(?:url\()?\s*["\']?https?://', text, re.I):
                    add('ERROR', rel, '禁止外部 @import CSS')
                for m in CSS_URL_RE.finditer(text):
                    ref = m.group(1).strip()
                    if is_ignored_ref(ref):
                        continue
                    target = resolve_local_ref(p, ref)
                    try:
                        target.relative_to(root)
                    except ValueError:
                        add('ERROR', rel, f'CSS 资源引用逃出包根目录：{ref}')
                        continue
                    if not target.is_file():
                        add('ERROR', rel, f'CSS 本地资源不存在：{ref}')

            if p.suffix.lower() == '.js':
                if re.search(r'^\s*(?:import|export)\b|\bimport\s*\(', text, re.M):
                    add('ERROR', rel, '禁止运行时 import/export/dynamic import；bundle 为经典脚本')
                if re.search(r'\brequire\s*\(\s*["\'][^"\']+["\']\s*\)', text):
                    add('WARNING', rel, '发现 CommonJS require()；普通 WebView 不原生支持，确认已由 bundler 处理或运行时提供兼容层')
                if re.search(r'\bprocess\.env\b|\b__dirname\b|\b__filename\b', text):
                    add('WARNING', rel, '发现 Node.js 环境变量/路径符号；确认已在构建期替换')
                if re.search(r'\b(?:location\.href\s*=|location\.(?:assign|replace)\s*\()', text):
                    add('ERROR', rel, '禁止页面跳转/站外导航；MiniTool 应保持单入口 SPA')
                for m in re.finditer(r'(?:window\.)?xhs\.miniTool\.([A-Za-z_$][\w$]*)', text):
                    api = m.group(1)
                    if api not in XHS_ALLOWED_APIS:
                        add('ERROR', rel, f'当前官方未确认的 MiniTool Native API：{api}')
                if 'window.xhs.miniTool' in text and not re.search(r'window\.xhs\?|window\.xhs\s*&&|global\.xhs', text):
                    add('WARNING', rel, '直接访问 window.xhs.miniTool；普通浏览器环境可能 undefined，建议包装判空')
                for m in JS_LITERAL_ASSET_RE.finditer(text):
                    ref = m.group(1)
                    target = resolve_local_ref(p, ref)
                    try:
                        target.relative_to(root)
                    except ValueError:
                        add('ERROR', rel, f'JS 静态资源引用逃出包根目录：{ref}')
                        continue
                    if not target.is_file():
                        add('ERROR', rel, f'JS 静态资源不存在：{ref}')

        # Package-wide advisory: no official package-size ceiling is assumed here.
        total = sum(p.stat().st_size for p in root.rglob('*') if p.is_file())
        if total > 25 * 1024 * 1024:
            add('WARNING', root, f'包内资源总量较大：{total / 1024 / 1024:.1f} MiB；官方能力文档未给出本 Skill 可确认的包体上限，请按当前后台限制和真机性能复核')

    if not args.quiet:
        print(f'ERROR={len(errors)} WARNING={len(warnings)}')
        for level, items in [('ERROR', errors), ('WARNING', warnings)]:
            for path, msg in items:
                print(f'[{level}] {path}: {msg}')

    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
