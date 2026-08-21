#!/usr/bin/env python3
"""
Remove WeChat native-shell UI that conflicts with XiaoHongShu MiniTool container.

MiniTool provides its own top-left back button, so we must delete:
- custom navigation bars / back buttons / status-bar placeholders
- navigationStyle: custom in JSON configs
- wx.navigateBack calls (replace with History API)

Business-level CTA like "返回首页 / 返回计算" are preserved, but must NOT
look like the system top-left back arrow.
"""

import argparse
import json
import re
import shutil
from pathlib import Path


# Patterns for standalone back button elements in WXML/HTML
BACK_PATTERNS = [
    re.compile(r'<[^>]+\baria-label\s*=\s*["\']返回["\'][^>]*>', re.I),
    re.compile(r'<[^>]+\bclass\s*=\s*["\'][^"\']*(?:nav-back|back-button|back-btn|nav-back-button)[^"\']*["\'][^>]*>', re.I),
    re.compile(r'<[^>]+\bid\s*=\s*["\'][^"\']*(?:nav-back|back-button|back-btn|nav-back-button)[^"\']*["\'][^>]*>', re.I),
]

# Class/id fragments that identify a host navigation container (to remove entirely)
NAV_CONTAINER_FRAGMENTS = [
    'custom-nav', 'custom-navigation', 'navbar', 'nav-bar',
    'status-bar', 'capsule', 'navigation-bar'
]

# CSS class/id patterns to strip
CSS_CLASS_PATTERNS = [
    'nav-back', 'back-button', 'back-btn', 'nav-back-button',
    'custom-nav', 'custom-navigation', 'navbar', 'nav-bar',
    'status-bar', 'capsule', 'navigation-bar'
]


def log(msg):
    print(msg)


def find_matching_close_tag(text, open_start):
    """Find the index just after the matching close tag for an opening tag."""
    tag_match = re.match(r'<(\w+)[^>]*>', text[open_start:])
    if not tag_match:
        return None
    tag_name = tag_match.group(1)
    stack = 1
    pos = open_start + tag_match.end()
    pattern = re.compile(r'<(/?)' + re.escape(tag_name) + r'\b[^>]*>')
    while True:
        m = pattern.search(text, pos)
        if not m:
            return None
        if m.group(1) == '/':
            stack -= 1
            if stack == 0:
                return m.end()
        else:
            stack += 1
        pos = m.end()


def is_nav_container_tag(tag_text):
    cls_match = re.search(r'\bclass\s*=\s*["\']([^"\']*)["\']', tag_text, re.I)
    id_match = re.search(r'\bid\s*=\s*["\']([^"\']*)["\']', tag_text, re.I)
    classes = (cls_match.group(1) if cls_match else '') + ' ' + (id_match.group(1) if id_match else '')
    classes_lower = classes.lower()
    return any(frag in classes_lower for frag in NAV_CONTAINER_FRAGMENTS)


def remove_back_controls_in_xml(text, rel_path):
    removed = []

    # Remove entire nav containers (balanced tags)
    for m in list(re.finditer(r'<(\w+)[^>]*>', text))[::-1]:
        tag_text = m.group(0)
        if not is_nav_container_tag(tag_text):
            continue
        close_end = find_matching_close_tag(text, m.start())
        if close_end is None:
            continue
        block = text[m.start():close_end]
        text = text[:m.start()] + text[close_end:]
        removed.append(f"removed nav container in {rel_path}: {block[:80].replace(chr(10), ' ')}...")

    # Remove simple standalone back button tags
    for pat in BACK_PATTERNS:
        for m in list(pat.finditer(text))[::-1]:
            tag = m.group(0)
            business_terms = ['返回首页', '返回计算', '上一步', '上页']
            if any(t in tag for t in business_terms):
                continue
            text = text[:m.start()] + text[m.end():]
            removed.append(f"removed back control tag in {rel_path}: {tag[:80]}")

    return text, removed


def remove_nav_styles_in_css(text, rel_path):
    removed = []
    fragments = '|'.join(re.escape(c) for c in CSS_CLASS_PATTERNS)
    # Match selector + { ... } block, do NOT consume surrounding braces
    pat = re.compile(r'[.#](?:' + fragments + r')[^\{]*\{[^\}]*\}', re.I | re.M)

    for m in list(pat.finditer(text))[::-1]:
        block = m.group(0)
        text = text[:m.start()] + text[m.end():]
        removed.append(f"removed nav style rule in {rel_path}: {block[:100]}")

    # Cleanup: collapse multiple blank lines and fix dangling braces
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'\}\s*\}', '}', text)
    text = text.strip()
    if text and not text.endswith('}'):
        text += '\n'

    return text, removed


def clean_json_config(path, rel_path):
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return []

    changed = []

    if data.get('navigationStyle') == 'custom':
        del data['navigationStyle']
        changed.append(f"removed navigationStyle:custom in {rel_path}")

    if 'navigationBarBackgroundColor' in data:
        del data['navigationBarBackgroundColor']
        changed.append(f"removed navigationBarBackgroundColor in {rel_path}")

    if 'navigationBarTextStyle' in data:
        del data['navigationBarTextStyle']
        changed.append(f"removed navigationBarTextStyle in {rel_path}")

    if changed:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    return changed


def transform_js_navigate_back(text, rel_path):
    removed = []
    text, n = re.subn(
        r'wx\.navigateBack\s*\(\s*(?:\{[^\}]*\})?\s*\)',
        'history.back()',
        text
    )
    if n:
        removed.append(f"replaced wx.navigateBack with history.back() in {rel_path} ({n}x)")
    return text, removed


def transform_project(project_root, output_root=None):
    root = Path(project_root).resolve()
    if output_root:
        out = Path(output_root).resolve()
        if out.exists():
            shutil.rmtree(out)
        shutil.copytree(root, out)
        work_root = out
    else:
        work_root = root

    log(f"Transforming native shell in: {work_root}")

    all_changes = []

    for p in work_root.rglob('*'):
        if not p.is_file():
            continue
        rel = str(p.relative_to(work_root))

        if any(part.startswith('.git') or part in ['node_modules', 'xhs-dist'] for part in p.parts):
            continue

        suffix = p.suffix.lower()

        if suffix in ('.wxml', '.html', '.axml', '.ttml'):
            text = p.read_text(encoding='utf-8', errors='ignore')
            new_text, changes = remove_back_controls_in_xml(text, rel)
            if new_text != text:
                p.write_text(new_text, encoding='utf-8')
                all_changes.extend(changes)

        elif suffix in ('.wxss', '.css', '.acss', '.ttss'):
            text = p.read_text(encoding='utf-8', errors='ignore')
            new_text, changes = remove_nav_styles_in_css(text, rel)
            if new_text != text:
                p.write_text(new_text, encoding='utf-8')
                all_changes.extend(changes)

        elif suffix == '.json':
            changes = clean_json_config(p, rel)
            all_changes.extend(changes)

        elif suffix in ('.js', '.ts', '.jsx', '.tsx'):
            text = p.read_text(encoding='utf-8', errors='ignore')
            new_text, changes = transform_js_navigate_back(text, rel)
            if new_text != text:
                p.write_text(new_text, encoding='utf-8')
                all_changes.extend(changes)

    if all_changes:
        log(f"\nTotal changes: {len(all_changes)}")
        for c in all_changes[:50]:
            log(f"  - {c}")
        if len(all_changes) > 50:
            log(f"  ... and {len(all_changes) - 50} more")
    else:
        log("No native shell elements found.")

    summary_path = work_root / 'xhs-transform-native-shell.md'
    summary_path.write_text(
        '# Native Shell Transformation Summary\n\n' +
        f'Total changes: {len(all_changes)}\n\n' +
        '\n'.join(f'- {c}' for c in all_changes) +
        '\n',
        encoding='utf-8'
    )
    log(f"\nSummary written to: {summary_path}")


def main():
    parser = argparse.ArgumentParser(description='Remove WeChat native shell UI for XHS MiniTool')
    parser.add_argument('project', help='Path to WeChat mini program / game project')
    parser.add_argument('--output-root', help='Output directory; if omitted, transform in place')
    args = parser.parse_args()

    transform_project(args.project, args.output_root)


if __name__ == '__main__':
    main()
