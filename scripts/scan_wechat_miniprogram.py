#!/usr/bin/env python3
"""Maximum-availability migration audit for WeChat Mini Program / Mini Game -> XHS MiniTool.

The scanner prefers preserving user-visible behavior through Web equivalents, build-time
materialization, local emulation, product-semantic rewrites and feature probes. It only
uses HARD_BLOCK when the original meaning truly requires a capability that XHS MiniTool
explicitly forbids or the mobile WebView cannot provide.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlsplit

TEXT_SUFFIXES = {'.js', '.ts', '.wxml', '.wxss', '.json', '.wxs', '.html', '.css'}
SKIP_DIRS = {'node_modules', '.git', 'dist', 'build', '.next', '.output'}
STATIC_ASSET_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2'}
MEDIA_EXTS = {'.mp3', '.m4a', '.aac', '.wav', '.ogg', '.mp4', '.mov', '.webm'}
REMOTE_URL_RE = re.compile(r'https?://[^\s"\'<>`)}\]]+', re.I)

# Status semantics:
# PRESERVE        - same user goal via standard Web with little change
# ADAPT           - supported after code/model rewrite
# LOCALIZE        - move remote/static resources into the ZIP at migration time
# SNAPSHOT        - build-time capture of fixed remote data/content
# EMULATE_LOCAL   - replace platform/server state with explicit local-only semantics
# PRECOMPUTE      - perform heavy/network/WASM work at build time when input set is finite
# PRODUCT_REWRITE - preserve user goal by changing the interaction/product semantics
# PROBE           - standard Web ability is not explicitly documented; feature-detect + fallback
# HARD_BLOCK      - no honest offline replacement for the original meaning
# REVIEW          - scanner cannot classify safely

API_MAP = {
    # Network/data: don't immediately hard-block; classify by what the request means.
    'request': ('SNAPSHOT', '若是固定配置/关卡/词典：构建期快照并转本地 JS 数据；若是实时/个性化/交易数据则升级为 HARD_BLOCK 或 PRODUCT_REWRITE'),
    'uploadFile': ('PRODUCT_REWRITE', '若仅为上传后展示/分享，改成本地 File/Blob/Canvas + 保存/发笔记；若必须服务器接收/处理则 HARD_BLOCK'),
    'downloadFile': ('LOCALIZE', '固定文件在迁移期下载进包；运行时任意下载不可保留，生成图片用 writeTempFile/saveImage'),
    'connectSocket': ('HARD_BLOCK', '实时双向服务端通信不可用；若仅做本地演示可改预置脚本/回放，但不得冒充实时'),
    'sendSocketMessage': ('HARD_BLOCK', 'WebSocket 被明确禁用'),
    'closeSocket': ('HARD_BLOCK', 'WebSocket 被明确禁用'),

    # Identity: preserve local personalization when server identity is not essential.
    'login': ('EMULATE_LOCAL', '若只用于本机存档/偏好：生成本地 installId 并明确为“本机身份”；若需真实账号、跨端同步、鉴权则 HARD_BLOCK'),
    'checkSession': ('EMULATE_LOCAL', '本地模式无需微信 session；改本地状态存在性检查，不宣称平台登录'),
    'getUserProfile': ('PRODUCT_REWRITE', '改为用户自行填写昵称/选择头像；不要伪造微信/小红书官方身份'),
    'getUserInfo': ('PRODUCT_REWRITE', '改为用户自行填写昵称/选择头像；不要伪造平台身份'),
    'getPhoneNumber': ('HARD_BLOCK', '无平台手机号授权；若业务不需要验证可改手动输入，但不能声称已验证'),

    # Commerce/engagement
    'requestPayment': ('HARD_BLOCK', '真实支付不可用；若支付仅是内容门槛，可改免费/本地成就/任务解锁，但交易语义必须删除'),
    'requestSubscribeMessage': ('PRODUCT_REWRITE', '无系统推送；改启动时本地提醒、日历式页面提示或持久化待办，不得声称后台通知'),
    'createRewardedVideoAd': ('PRODUCT_REWRITE', '广告奖励改本地任务/冷却/积分/直接解锁；不得伪造“已看广告”'),
    'createBannerAd': ('PRODUCT_REWRITE', '删除广告位并重排 UI'),
    'createInterstitialAd': ('PRODUCT_REWRITE', '删除插屏或改为本地内容过渡页'),

    # Location/device
    'getLocation': ('PRODUCT_REWRITE', 'Geolocation 明确禁用；优先改手动城市/区域选择 + 本地数据；若必须实时坐标则 HARD_BLOCK'),
    'chooseLocation': ('PRODUCT_REWRITE', '改本地城市/区域/POI 静态选择器；若依赖实时地图搜索则 HARD_BLOCK'),
    'openLocation': ('PRODUCT_REWRITE', '可显示预置静态地图/地址卡；不能导航到真实地图'),
    'setClipboardData': ('PRODUCT_REWRITE', '剪贴板和长按菜单均禁；优先改“保存图片/生成结果卡/发笔记/页面直接展示”'),
    'getClipboardData': ('HARD_BLOCK', '无法读取系统剪贴板'),
    'createWorker': ('ADAPT', 'Worker 禁用；改主线程分片执行（rAF/setTimeout/requestIdleCallback 可探测）或把有限重计算前移到构建期'),
    'vibrateShort': ('PROBE', '官方未明确承诺振动；仅 navigator.vibrate 存在时增强，失败必须静默回退'),
    'vibrateLong': ('PROBE', '官方未明确承诺振动；仅 navigator.vibrate 存在时增强，失败必须静默回退'),
    'setKeepScreenOn': ('PROBE', '官方未承诺屏幕常亮；只能 feature-detect/无操作回退，不得作为主流程'),
    'scanCode': ('ADAPT', '优先相机/选图 + 纯 JS 本地二维码/条码识别；禁止依赖 WASM/Worker；有限码表可预计算'),

    # Cross app
    'navigateToMiniProgram': ('HARD_BLOCK', '平台明确禁止跳其他小工具/站外；可保留信息说明，但不要绕过限制'),
    'openEmbeddedMiniProgram': ('HARD_BLOCK', '不可嵌入/跳转其他小工具'),

    # File/storage
    'getFileSystemManager': ('ADAPT', '按用途拆分：持久业务数据→IndexedDB/localStorage；用户文件→File/Blob；生成媒体→writeTempFile；文档下载/任意文件系统不可保留'),
    'setStorageSync': ('PRESERVE', 'localStorage.setItem + JSON 序列化'),
    'getStorageSync': ('PRESERVE', 'localStorage.getItem + JSON 反序列化'),
    'removeStorageSync': ('PRESERVE', 'localStorage.removeItem'),
    'clearStorageSync': ('PRESERVE', 'localStorage.clear'),
    'setStorage': ('ADAPT', '用 localStorage/IndexedDB 包装异步接口'),
    'getStorage': ('ADAPT', '用 localStorage/IndexedDB 包装异步接口'),
    'removeStorage': ('ADAPT', 'localStorage/IndexedDB'),
    'clearStorage': ('ADAPT', 'localStorage/IndexedDB'),
    'saveFile': ('ADAPT', '若是业务持久数据改 IndexedDB；若是用户导出文件，普通下载被禁，优先转成图片并保存/发笔记'),
    'openDocument': ('PRECOMPUTE', '固定 PDF/文档可在构建期转图片/HTML；运行时任意文档打开不可保留'),

    # Media/canvas
    'chooseImage': ('PRESERVE', '<input type="file" accept="image/*"> + File/Blob'),
    'chooseMedia': ('ADAPT', '<input type="file">；容器仅让系统选择图片/视频'),
    'chooseVideo': ('ADAPT', '<input type="file" accept="video/*">；真机验证交互'),
    'saveImageToPhotosAlbum': ('PRESERVE', 'window.xhs.miniTool.saveImageToPhotosAlbum；必须用户手势'),
    'canvasToTempFilePath': ('ADAPT', 'canvas.toDataURL → xhs.miniTool.writeTempFile'),
    'createCanvasContext': ('PRESERVE', 'DOM canvas.getContext("2d")'),
    'createOffscreenCanvas': ('ADAPT', '不要依赖 Worker 组合；优先普通主线程 Canvas；仅无 Worker 方案可探测'),
    'getImageInfo': ('PRESERVE', 'Image/File/Blob + decode/load'),
    'previewImage': ('ADAPT', '自绘 lightbox/全视口预览，不调用 requestFullscreen'),
    'compressImage': ('PRESERVE', 'Canvas 缩放/重编码'),
    'createInnerAudioContext': ('ADAPT', 'HTMLAudioElement；固定媒体优先构建期嵌入为 data URI JS 模块并 PROBE，或提供无声降级'),
    'getRecorderManager': ('PROBE', '官方明确麦克风输入但未逐项承诺 MediaRecorder；存在时增强，不存在则只保留实时音频输入或禁用录制'),

    # UI/system
    'showToast': ('PRESERVE', 'DOM toast'),
    'showModal': ('PRESERVE', 'confirm() 或自绘 Modal'),
    'showLoading': ('PRESERVE', 'DOM loading overlay'),
    'hideLoading': ('PRESERVE', 'DOM loading overlay'),
    'showActionSheet': ('PRESERVE', 'DOM bottom sheet'),
    'pageScrollTo': ('PRESERVE', 'window/element.scrollTo'),
    'createSelectorQuery': ('PRESERVE', 'querySelector/getBoundingClientRect'),
    'createAnimation': ('PRESERVE', 'CSS Animation/Web Animations'),
    'getSystemInfo': ('ADAPT', 'viewport/safe-area/devicePixelRatio/matchMedia 等可获取信息；设备标识/网络/电池不可伪造'),
    'getSystemInfoSync': ('ADAPT', '同上，返回字段需按业务最小化'),
    'setNavigationBarTitle': ('ADAPT', '优先 document.title / 正文标题；MiniTool 自带容器壳层，不再自绘宿主级返回导航栏'),
    'setNavigationBarColor': ('ADAPT', '仅迁移内容区背景语义；MiniTool 容器壳层不可假设可控，不复制微信宿主导航栏'),

    # Navigation/share
    'navigateTo': ('PRESERVE', '单 index.html SPA view 切换'),
    'redirectTo': ('PRESERVE', 'SPA replace state/view'),
    'reLaunch': ('PRESERVE', '重置 SPA route/state'),
    'switchTab': ('PRESERVE', 'HTML tab + SPA route'),
    'navigateBack': ('PRESERVE', '用 History API / popstate 回退内部 SPA；MiniTool 已有左上角返回控件，不重复绘制页面左上角返回箭头'),
    'showShareMenu': ('PRODUCT_REWRITE', '若目标是传播结果：生成媒体 + postNote；否则删除微信分享入口'),
    'hideShareMenu': ('PRODUCT_REWRITE', '删除微信分享菜单状态逻辑'),
}

PREFIX_RULES = {
    'cloud.': ('PRODUCT_REWRITE', '云函数若是纯确定性计算→迁到客户端；固定数据/素材→快照/本地化；CRUD→IndexedDB 本地化；真实后端/鉴权/实时同步→HARD_BLOCK'),
    'onAccelerometer': ('HARD_BLOCK', '传感器被明确禁用；游戏可改触摸/滑杆/按钮控制'),
    'startAccelerometer': ('HARD_BLOCK', '传感器被明确禁用；改触摸/滑杆'),
    'stopAccelerometer': ('HARD_BLOCK', '传感器被明确禁用'),
    'onGyroscope': ('HARD_BLOCK', '陀螺仪被禁；改触摸/拖拽'),
    'startGyroscope': ('HARD_BLOCK', '陀螺仪被禁'),
    'stopGyroscope': ('HARD_BLOCK', '陀螺仪被禁'),
    'onCompass': ('HARD_BLOCK', '罗盘被禁；若只是方向选择改手动 UI'),
    'startCompass': ('HARD_BLOCK', '罗盘被禁'),
    'stopCompass': ('HARD_BLOCK', '罗盘被禁'),
    'openBluetoothAdapter': ('HARD_BLOCK', '蓝牙明确禁用'),
    'createBLEConnection': ('HARD_BLOCK', '蓝牙明确禁用'),
    'getConnectedBluetoothDevices': ('HARD_BLOCK', '蓝牙明确禁用'),
    'startBluetoothDevicesDiscovery': ('HARD_BLOCK', '蓝牙明确禁用'),
    'getNetworkType': ('PRODUCT_REWRITE', 'MiniTool 本身离线，删除网络分支并固定 offline 语义'),
    'onNetworkStatusChange': ('PRODUCT_REWRITE', 'MiniTool 本身离线，删除在线/离线切换逻辑'),
}

WXML_COMPONENTS = {
    'web-view': ('PRECOMPUTE', '固定/有授权页面可迁移为本地 HTML/截图/数据；依赖在线网页交互则 HARD_BLOCK'),
    'map': ('PRODUCT_REWRITE', '改静态地图/本地 POI/手动区域选择；实时地图、导航、定位则 HARD_BLOCK'),
    'live-player': ('HARD_BLOCK', '实时网络媒体不可用'),
    'live-pusher': ('HARD_BLOCK', '实时推流/WebRTC 不可用'),
    'open-data': ('PRODUCT_REWRITE', '改本地昵称/头像/统计；不要伪造微信身份'),
    'ad': ('PRODUCT_REWRITE', '移除广告或改本地奖励机制'),
    'official-account': ('HARD_BLOCK', '微信官方账号宿主组件无等价语义'),
    'camera': ('PRESERVE', 'getUserMedia(video)，用户授权'),
    'canvas': ('PRESERVE', 'HTML canvas'),
    'video': ('ADAPT', 'HTML video；若 ZIP 媒体扩展受限可尝试 data URI JS 嵌入 + PROBE，必须有静态封面降级'),
    'audio': ('ADAPT', 'HTML audio；固定音频可尝试 data URI JS 嵌入 + PROBE，必须允许无声降级'),
    'swiper': ('PRESERVE', 'CSS + JS carousel'),
    'scroll-view': ('PRESERVE', 'overflow:auto DOM'),
    'picker': ('ADAPT', 'selector/date 默认改底部滚轮 Sheet；不要把可见原生 select/input[type=date] 当最终交互'),
    'rich-text': ('ADAPT', 'DOM/安全 HTML，外部资源本地化'),
    'editor': ('ADAPT', 'contenteditable/textarea'),
    'navigator': ('ADAPT', '内部 SPA 路由；站外/其他小工具不允许'),
}

OPEN_TYPE_MAP = {
    'share': ('PRODUCT_REWRITE', '生成结果媒体 + postNote（仅在产品目标合适时）；否则移除'),
    'getPhoneNumber': ('HARD_BLOCK', '无验证手机号能力；可手动输入但不得标记为平台已验证'),
    'getUserInfo': ('PRODUCT_REWRITE', '本地昵称/头像输入'),
    'contact': ('PRODUCT_REWRITE', '改本地帮助/FAQ；无法进入微信客服会话'),
    'openSetting': ('ADAPT', '针对相机/麦克风/相册等实际权限给出失败提示；没有微信设置页'),
    'launchApp': ('HARD_BLOCK', '禁止站外/外部 App 跳转'),
    'feedback': ('PRODUCT_REWRITE', '改本地反馈说明/保存问题截图；无法联网提交'),
}

WEB_BLOCK_PATTERNS = [
    (re.compile(r'\bWebAssembly\b|\.wasm\b', re.I), 'PRECOMPUTE', 'WASM 被禁；优先换纯 JS，或把有限输入的解码/推理/变换前移到构建期；动态高算力能力才 HARD_BLOCK'),
    (re.compile(r'\bnew\s+(?:Shared)?Worker\s*\(|serviceWorker', re.I), 'ADAPT', 'Worker 被禁；改主线程分片/预计算'),
    (re.compile(r'\bfetch\s*\(|XMLHttpRequest', re.I), 'SNAPSHOT', '网络请求被禁；固定数据快照，动态数据按语义改本地/产品重构/HARD_BLOCK'),
    (re.compile(r'WebSocket\s*\(|EventSource\s*\(|RTCPeerConnection', re.I), 'HARD_BLOCK', '实时通信被明确禁用'),
    (re.compile(r'navigator\.geolocation', re.I), 'PRODUCT_REWRITE', '定位被禁；改手动选择/本地数据'),
    (re.compile(r'navigator\.clipboard', re.I), 'PRODUCT_REWRITE', '剪贴板被禁；改保存图片/发笔记/直接展示'),
    (re.compile(r'DeviceMotionEvent|DeviceOrientationEvent', re.I), 'HARD_BLOCK', '设备运动/方向传感器明确禁用'),
    (re.compile(r'\beval\s*\(|\bnew\s+Function\s*\(', re.I), 'ADAPT', '动态执行被禁；构建期 bundle/预编译模板/改静态分发表'),
]

DYNAMIC_ASSET_HINT_RE = re.compile(
    r'\b(?:OSS|CDN|ASSET|IMG|IMAGE|STATIC|RESOURCE|RES)_(?:HOST|DOMAIN|BASE|URL)\b|\b(?:cdn|asset|img|image|static|resource)(?:Host|Domain|Base|Url)\b', re.I,
)


def locate_source_root(project: Path) -> tuple[Path, str]:
    project = project.resolve()
    config = project / 'project.config.json'
    if config.is_file():
        try:
            data = json.loads(config.read_text('utf-8'))
            rel = data.get('miniprogramRoot')
            if rel:
                candidate = (project / rel).resolve()
                if candidate.is_dir():
                    return candidate, f'project.config.json:miniprogramRoot={rel}'
        except Exception:
            pass
    return project, 'input-root'


def iter_files(root: Path):
    for p in root.rglob('*'):
        if not p.is_file() or p.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if any(part in SKIP_DIRS for part in p.relative_to(root).parts):
            continue
        yield p


def line_number(text: str, pos: int) -> int:
    return text.count('\n', 0, pos) + 1


def add_issue(issues, status, kind, file, line, symbol, advice):
    issues.append({'status': status, 'kind': kind, 'file': file, 'line': line, 'symbol': symbol, 'advice': advice})


def classify_remote_url(url: str) -> tuple[str, str]:
    ext = Path(urlsplit(url).path).suffix.lower()
    if ext in STATIC_ASSET_EXTS:
        return 'LOCALIZE', '静态图片/字体：白名单域名迁移期下载、SHA 去重、改包内相对路径'
    if ext in MEDIA_EXTS:
        return 'ADAPT', '远程媒体不能运行时加载；优先迁移期转为受支持形式。若包内扩展不被后台接受，可用 embed_media_as_js.py 生成 data URI classic JS，再做运行时 PROBE'
    if ext == '.json':
        return 'SNAPSHOT', '确认固定后构建期下载，转 classic JS 数据模块；实时 JSON 不能快照冒充'
    if ext in {'.js', '.css', '.mjs'}:
        return 'ADAPT', '外部代码不可运行时加载；从 npm/源码本地 bundle，检查网络/eval/WASM/Worker'
    return 'REVIEW', '未知远程 URL：判断是静态资源、固定数据、API、用户动态资源还是签名地址，再选择 LOCALIZE/SNAPSHOT/PRODUCT_REWRITE/HARD_BLOCK'


def collect_routes(app: dict) -> list[str]:
    routes = list(app.get('pages', []) or [])
    for key in ('subPackages', 'subpackages'):
        for pkg in app.get(key, []) or []:
            r = str(pkg.get('root', '')).strip('/')
            for page in pkg.get('pages', []) or []:
                routes.append('/'.join(x for x in (r, page) if x))
    return routes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('project', type=Path)
    ap.add_argument('--out', type=Path, default=Path('xhs-migration-audit'))
    args = ap.parse_args()
    input_root = args.project.resolve()
    if not input_root.exists():
        raise SystemExit(f'Project not found: {input_root}')
    root, root_source = locate_source_root(input_root)
    args.out.mkdir(parents=True, exist_ok=True)

    issues = []
    files = list(iter_files(root))
    app_json, game_json = root/'app.json', root/'game.json'
    project_type = 'mini_program' if app_json.exists() else ('mini_game' if game_json.exists() else 'unknown')

    if project_type == 'mini_game':
        add_issue(issues, 'ADAPT', 'project-type', '.', 1, 'WeChat Mini Game', '走 HTML shell + 标准 Canvas/WebGL 路线，保留游戏循环/纯 JS 规则，本地化纹理与配置')
    elif project_type == 'unknown':
        add_issue(issues, 'REVIEW', 'structure', '.', 1, 'project type', '未发现 app.json/game.json；确认 miniprogramRoot/框架类型')

    app = None
    if app_json.exists():
        try:
            app = json.loads(app_json.read_text('utf-8'))
        except Exception as e:
            add_issue(issues, 'REVIEW', 'config', 'app.json', 1, 'app.json', f'无法解析 JSON: {e}')

    for dirname, status, advice in [
        ('cloudfunctions', 'PRODUCT_REWRITE', '逐个云函数分类：纯计算移客户端；固定数据/素材快照；本地 CRUD 用 IndexedDB；真实后端能力才 HARD_BLOCK'),
        ('workers', 'ADAPT', 'Worker 改主线程分片执行或构建期预计算'),
        ('miniprogram_npm', 'ADAPT', '从 package.json/源码重新 bundle，不直接搬微信构建产物'),
    ]:
        if (root/dirname).exists():
            add_issue(issues, status, 'structure', dirname+'/', 1, dirname, advice)

    pkg_json = input_root/'package.json'
    if pkg_json.exists():
        try:
            pkg = json.loads(pkg_json.read_text('utf-8'))
            deps = sorted(set((pkg.get('dependencies') or {})) | set((pkg.get('devDependencies') or {})))
            if deps:
                add_issue(issues, 'REVIEW', 'dependency', 'package.json', 1, ', '.join(deps[:14]) + ('…' if len(deps)>14 else ''), '检查最终 bundle：网络/eval/WASM/Worker/动态 chunk/CDN；能 bundle 的库优先保留')
        except Exception:
            pass

    if app:
        for page in collect_routes(app):
            add_issue(issues, 'ADAPT', 'route', 'app.json', 1, page, '收敛为单 index.html SPA view；页面功能尽量保留')
        if app.get('tabBar'):
            add_issue(issues, 'PRESERVE', 'ui', 'app.json', 1, 'tabBar', '重建 HTML/CSS tab bar + SPA route')
        if app.get('plugins'):
            add_issue(issues, 'REVIEW', 'plugin', 'app.json', 1, 'plugins', '先找 Web/npm/源码替代；固定输出可预计算；只有宿主专属/在线插件才 HARD_BLOCK')
        if app.get('requiredPrivateInfos'):
            add_issue(issues, 'REVIEW', 'permission', 'app.json', 1, 'requiredPrivateInfos', '逐项重映射到 Web 能力；相机/麦克风可保留，其余以官方禁用表为准')
        if app.get('networkTimeout'):
            add_issue(issues, 'ADAPT', 'config', 'app.json', 1, 'networkTimeout', '删除网络超时配置；相关数据源另做快照/本地化')

    wx_call_re = re.compile(r'\bwx\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(')
    dynamic_wx_re = re.compile(r'\bwx\s*\[')
    tag_re = re.compile(r'<\s*([a-zA-Z][\w-]*)\b')
    open_type_re = re.compile(r'\bopen-type\s*=\s*["\']([^"\']+)["\']', re.I)
    picker_re = re.compile(r'<\s*picker\b([^>]*)>', re.I | re.S)
    picker_mode_re = re.compile(r'\bmode\s*=\s*["\']([^"\']+)["\']', re.I)
    back_control_re = re.compile(r'<[^>]+(?:aria-label\s*=\s*["\']返回["\']|class\s*=\s*["\'][^"\']*(?:nav-back|back-button|back-btn)[^"\']*["\'])[^>]*>', re.I)

    for p in files:
        rel = str(p.relative_to(root))
        try:
            text = p.read_text('utf-8')
        except UnicodeDecodeError:
            continue

        for m in wx_call_re.finditer(text):
            symbol = m.group(1)
            info = API_MAP.get(symbol)
            if not info:
                for prefix, rule in PREFIX_RULES.items():
                    if symbol.startswith(prefix) or symbol.startswith(prefix.rstrip('.')):
                        info = rule; break
            if not info:
                info = ('REVIEW', '未映射 API：先查微信语义，再按“Web 等价→XHS Bridge→构建期→本地模拟→产品重写→PROBE→HARD_BLOCK”顺序处理')
            add_issue(issues, info[0], 'wx-api', rel, line_number(text, m.start()), 'wx.'+symbol, info[1])

        dm = dynamic_wx_re.search(text)
        if dm:
            add_issue(issues, 'REVIEW', 'wx-api', rel, line_number(text, dm.start()), 'wx[...]', '动态 wx API 需人工解析，禁止默认 hard-block 或默认可用')

        for pattern, status, symbol, advice in [
            (r'\bonShareAppMessage\b', 'PRODUCT_REWRITE', 'onShareAppMessage', '生成结果媒体 + postNote，或删除微信分享语义'),
            (r'\bonShareTimeline\b', 'PRODUCT_REWRITE', 'onShareTimeline', '可改小红书 postNote，但不是朋友圈等价'),
            (r'\bonPullDownRefresh\b', 'PRESERVE', 'onPullDownRefresh', '改刷新按钮/DOM 手势；若原逻辑联网，数据源另处理'),
            (r'\bonReachBottom\b', 'PRESERVE', 'onReachBottom', '改 scroll/IntersectionObserver；分页数据源另处理'),
        ]:
            mm = re.search(pattern, text)
            if mm:
                add_issue(issues, status, 'lifecycle', rel, line_number(text, mm.start()), symbol, advice)

        mm = re.search(r'\bwx\.env\.USER_DATA_PATH\b|\bwxfile://|\bhttp://tmp/', text, re.I)
        if mm:
            add_issue(issues, 'ADAPT', 'file-path', rel, line_number(text, mm.start()), mm.group(0), 'File/Blob/IndexedDB/data URL/writeTempFile 按用途拆分')
        mm = re.search(r'\bcloud://', text, re.I)
        if mm:
            add_issue(issues, 'LOCALIZE', 'cloud-resource', rel, line_number(text, mm.start()), 'cloud://', '固定公共素材迁移前导出并本地化；动态用户云资源改本地选图/占位或 HARD_BLOCK')

        for m in REMOTE_URL_RE.finditer(text):
            status, advice = classify_remote_url(m.group(0))
            add_issue(issues, status, 'remote-url', rel, line_number(text, m.start()), m.group(0)[:100], advice)

        if DYNAMIC_ASSET_HINT_RE.search(text) and ('+' in text or '${' in text):
            mm = DYNAMIC_ASSET_HINT_RE.search(text)
            add_issue(issues, 'LOCALIZE', 'dynamic-resource', rel, line_number(text, mm.start()), mm.group(0), '枚举资源集合生成本地 asset-map；若集合来自运行时服务器且不可枚举，再升级 PRODUCT_REWRITE/HARD_BLOCK')

        for pattern, status, advice in WEB_BLOCK_PATTERNS:
            for m in pattern.finditer(text):
                add_issue(issues, status, 'web-pattern', rel, line_number(text, m.start()), m.group(0)[:80], advice)

        if p.suffix.lower()=='.json':
            if re.search(r'"navigationStyle"\s*:\s*"custom"', text):
                add_issue(issues, 'ADAPT', 'native-shell', rel, 1, 'navigationStyle: custom', 'MiniTool 容器已有左上角返回控件；不要复制微信状态栏/胶囊/宿主返回键。仅保留真正属于业务内容的标题，并收回顶部占位')

        if p.suffix.lower()=='.wxml':
            for bm in back_control_re.finditer(text):
                add_issue(issues, 'PRODUCT_REWRITE', 'native-shell', rel, line_number(text, bm.start()), 'custom back control', '删除页面左上角自绘返回按钮；内部 SPA 用 history.pushState/replaceState/popstate，让 MiniTool 容器返回控件承担宿主导航。正文里的“返回计算”等 CTA 可保留')
            for pm in picker_re.finditer(text):
                attrs = pm.group(1) or ''
                mmode = picker_mode_re.search(attrs)
                mode = (mmode.group(1).lower() if mmode else 'selector')
                if mode == 'date':
                    add_issue(issues, 'ADAPT', 'picker-ui', rel, line_number(text, pm.start()), 'picker mode=date', '改底部年/月/日三列滚轮，继承 start/end/value；确定后 detail.value=YYYY-MM-DD，取消不修改；不要直接使用原生 date input 作为最终 UI')
                elif mode in ('selector', ''):
                    add_issue(issues, 'ADAPT', 'picker-ui', rel, line_number(text, pm.start()), 'picker mode=selector', '改底部单列滚轮 Sheet（约5行可视、取消/确定、scroll-snap），保持 detail.value 为选项 index；不要让原生 select 接管点击')
                else:
                    add_issue(issues, 'REVIEW', 'picker-ui', rel, line_number(text, pm.start()), 'picker mode='+mode, '按微信 picker 语义实现本地底部 Sheet；优先保持 detail.value 兼容，不直接暴露不可控系统控件')
            for m in tag_re.finditer(text):
                tag = m.group(1)
                if tag in WXML_COMPONENTS:
                    status, advice = WXML_COMPONENTS[tag]
                    add_issue(issues, status, 'component', rel, line_number(text, m.start()), f'<{tag}>', advice)
            for m in open_type_re.finditer(text):
                value = m.group(1)
                status, advice = OPEN_TYPE_MAP.get(value, ('REVIEW', '微信 open-type 宿主语义，按最大可用决策树处理'))
                add_issue(issues, status, 'open-type', rel, line_number(text, m.start()), f'open-type="{value}"', advice)
            if re.search(r'\bwx:(if|elif|else|for|key)\b', text):
                add_issue(issues, 'ADAPT', 'template', rel, 1, 'wx:* directives', '改普通 JS render/DOM')
            if re.search(r'\b(?:bind|catch)[A-Za-z]+\s*=', text):
                add_issue(issues, 'ADAPT', 'event', rel, 1, 'bind*/catch*', '改 addEventListener；catch 语义保留 stopPropagation/preventDefault')

        if p.suffix.lower()=='.wxss' and re.search(r'(?<![\w-])-?\d+(?:\.\d+)?rpx\b', text):
            add_issue(issues, 'ADAPT', 'style', rel, 1, 'rpx', '先 convert_rpx.py，再响应式/视觉 QA')
        if p.suffix.lower()=='.wxs':
            add_issue(issues, 'ADAPT', 'wxs', rel, 1, 'WXS', '改 classic JS；纯计算尽量原样保留')
        mm = re.search(r'\brequirePlugin\s*\(|\brequireMiniProgram\s*\(', text)
        if mm:
            add_issue(issues, 'REVIEW', 'plugin', rel, line_number(text, mm.start()), mm.group(0), '先找本地 Web/npm/源码等价；平台专属语义才 HARD_BLOCK')

    # exact de-dupe
    unique, seen = [], set()
    for i in issues:
        key = tuple(i[k] for k in ('status','kind','file','line','symbol','advice'))
        if key not in seen:
            seen.add(key); unique.append(i)
    issues = unique
    counts = Counter(i['status'] for i in issues)
    by_status = defaultdict(list)
    for i in issues: by_status[i['status']].append(i)

    result = {
        'input_project': str(input_root), 'source_root': str(root),
        'source_root_resolution': root_source, 'project_type': project_type,
        'files_scanned': len(files), 'counts': dict(counts), 'issues': issues,
        'decision_order': ['PRESERVE','ADAPT','LOCALIZE','SNAPSHOT','EMULATE_LOCAL','PRECOMPUTE','PRODUCT_REWRITE','PROBE','REVIEW','HARD_BLOCK']
    }
    (args.out/'migration-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), 'utf-8')

    order = ['HARD_BLOCK','REVIEW','PROBE','PRODUCT_REWRITE','PRECOMPUTE','EMULATE_LOCAL','SNAPSHOT','LOCALIZE','ADAPT','PRESERVE']
    lines = [
        '# 微信项目 → 小红书 MiniTool 最大可用迁移审计','',
        f'- 输入工程：`{input_root}`', f'- 源码根目录：`{root}`（{root_source}）',
        f'- 工程类型：`{project_type}`', f'- 扫描文本文件：{len(files)}','',
        '## 状态统计',''
    ]
    for s in order:
        lines.append(f'- {s}: {counts.get(s,0)}')
    lines += ['', '> HARD_BLOCK 只表示“原语义无法诚实保留”，不等于整个项目不能迁移。优先检查是否可改成本地模式或产品语义重写。',
              '> PROBE 只能作为增强：必须 feature-detect，并有不影响主流程的降级。','']
    for s in order:
        items=by_status.get(s,[])
        if not items: continue
        lines += [f'## {s}','','| 文件 | 行 | 类型 | 命中 | 最大可用处理 |','|---|---:|---|---|---|']
        for i in items:
            a=i['advice'].replace('|','\\|').replace('\n',' '); sym=i['symbol'].replace('|','\\|')
            lines.append(f"| `{i['file']}` | {i['line']} | {i['kind']} | `{sym}` | {a} |")
        lines.append('')
    (args.out/'migration-audit.md').write_text('\n'.join(lines), 'utf-8')
    print(json.dumps(result['counts'], ensure_ascii=False))
    print(args.out/'migration-audit.md')

if __name__=='__main__':
    main()
