# 原生微信小程序 / Canvas 项目框架迁移规则

## 1. 目标架构

```text
xhs-dist/
├── index.html
└── assets/
    ├── app.css
    ├── runtime.js
    ├── xhs-bridge.js
    ├── data/*.js
    ├── images/...
    └── app.js
```

MiniTool 是一个根 `index.html` 的离线 Web 应用。微信多页面/分包需要收敛为单入口 SPA。

## 2. 工程根目录

如果仓库有 `project.config.json`，先解析 `miniprogramRoot`，不要默认仓库根目录就是 `app.json` 所在目录。

如果是：

- `app.json`：走原生小程序 WXML/Page 迁移；
- `game.json`：走 Canvas 小游戏迁移，不套 WXML 规则；
- uni-app/Taro/Remax：优先从框架 H5 构建产物收敛，不要手工逐个 WXML 改。

## 3. app.json / 页面 / 分包

### pages / subPackages

统一生成 SPA route table：

```js
const routes = {
  home: renderHome,
  detail: renderDetail,
};
```

微信分包只是一种原平台加载/体积机制，目标 MiniTool 不保留分包运行模型。

### tabBar

把 tabBar 视觉复制成 HTML 底部导航；点击切换 view/state。

### window / navigationStyle

MiniTool 容器已有原生左上角返回控件，因此**不要复制微信的宿主级自绘导航栏**。

- `navigationStyle: custom` 中仅为微信状态栏/胶囊服务的返回键、状态栏占位、胶囊避让布局应删除；
- 页面标题若仍有业务价值，可下沉为正文标题/hero 标题；
- SPA 内部路由用 History API (`pushState/replaceState/popstate`) 维护，页面内不要再固定绘制左上角返回箭头；
- 删除自绘导航后要同步收回原先的顶部占位，按“小红书壳层 + 内容区”重新做视觉 QA。

### picker

- `mode=selector`：默认转底部滚轮 Sheet，不直接暴露 `<select>`；
- `mode=date`：默认转年/月/日三列滚轮，不把 `<input type=date>` 当最终 UI；
- 使用 `templates/wheel-picker.js` / `wheel-picker.css`，保持 `bindchange` 的 `detail.value` 语义；
- Picker 工具栏左右内容必须有 16–20px 内边距，取消/确定不能贴边；默认不展示 drag handle；选中区使用微信式克制 indicator 与上下渐隐。

### permission / requiredPrivateInfos / networkTimeout / plugins

- 微信权限声明不能直接沿用；
- `networkTimeout` 删除；
- plugins 必须本地替代或判 blocker；
- 微信专属开放能力不能伪造。

## 4. WXML → HTML / Render

### 基础标签

```xml
<view class="card"><text>{{title}}</text></view>
```

→

```html
<div class="card"><span data-bind="title"></span></div>
```

```js
function render(state) {
  document.querySelector('[data-bind="title"]').textContent = state.title;
}
```

### 条件 / 循环

- `wx:if/elif/else` → JS 条件 render / `hidden`；
- `wx:for` → JS `forEach/map` 生成 DOM；
- `wx:key` → 保留稳定 key 的业务概念，不保留语法。

### 事件

```xml
<button bindtap="onStart">开始</button>
```

→

```js
startButton.addEventListener('click', onStart);
```

`catchtap` 等需要按原语义 `stopPropagation()`，需要时再 `preventDefault()`。禁止生成 `onclick=`。

### open-type

`share/getPhoneNumber/getUserInfo/contact/launchApp/...` 是微信宿主语义，不是普通 button 属性。扫描后逐个降级/删除/重构。

## 5. Page / 生命周期

微信：

- `onLoad(options)`
- `onShow()`
- `onReady()`
- `onHide()`
- `onUnload()`

建议：

```js
function createPageController() {
  let mounted = false;
  return {
    mount(params) {
      if (!mounted) {
        mounted = true;
        // onLoad + onReady 类工作
      }
      // onShow 类工作
    },
    hide() {},
    destroy() { mounted = false; }
  };
}
```

`onPullDownRefresh/onReachBottom` 改 Web 手势/滚动事件；如果原逻辑依赖服务端分页，仍属于网络 blocker。

应用前后台只在确有必要时用 `visibilitychange` 近似，不宣称与微信生命周期完全等价。

## 6. Component

- `properties` → 参数/state；
- `data` → local state；
- `methods` → 函数；
- `observers` → setter/effect；
- `attached/detached` → mount/unmount；
- `triggerEvent` → `CustomEvent`；
- slots → DOM 子节点/模板函数。

不要为了“兼容”写一个庞大的微信运行时 polyfill。

## 7. setData

```js
state.score = nextScore;
renderScore();
```

或：

```js
function setState(patch) {
  Object.assign(state, patch);
  render();
}
```

`setData({'list[0].name': ...})` 优先改成真实 JS 对象操作。

## 8. WXSS / rpx

`750rpx ≈ 100vw` 只适合机械初稿：

```text
1rpx = 100/750vw
```

建议：

- 横向布局：vw/%/flex/grid；
- 字号：rem/clamp；
- 圆角/细边：px；
- 关键容器：max-width；
- 视觉最终必须真机 QA。

`page {}` → `html, body, #app {}`。

安全区：

```css
.top { padding-top: env(safe-area-inset-top, 0px); }
.bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }
```

viewport 使用 `viewport-fit=cover`。

## 9. WXS

WXS 不是浏览器模块。迁移到 classic `.js`，格式化/计算逻辑在 render 前调用。不要把 WXS `require/module.exports` 原样留给浏览器。

## 10. 资源

所有远程资源先按 [`asset-localization.md`](asset-localization.md) 分类。

- 图片/字体：包内相对路径；
- 动态 OSS URL：本地 asset map；
- `wxfile://`/`USER_DATA_PATH`：File/Blob/data/XHS temp file；
- 固定远程 JSON：静态化成 classic JS；
- CDN JS/CSS：通过本地依赖/bundler 构建，不盲下载。

## 11. 第三方依赖 / 构建

开发阶段可用 Vite/Webpack/Rollup，但最终必须是本地 classic script；不要依赖：

- `type="module"`；
- runtime import/dynamic chunks；
- 未处理 CommonJS；
- 外部 CDN；
- network/eval/WASM/Worker。

## 12. 微信小游戏 / Canvas 项目

若输入是 `game.json/game.js`：

- 建一个 `index.html` + `<canvas>` 壳；
- `wx.createCanvas()` → DOM canvas；
- `wx.createImage()` → `new Image()`，src 必须本地/data/blob；
- 微信 touch 回调 → Pointer/Touch Events；
- 游戏循环可用 `requestAnimationFrame`；
- DPR/backing store 重新适配；
- 资源预加载全部走本地路径，不用 downloadFile；
- 开放数据域、微信登录、广告、支付、网络排行榜等另行降级；
- 依赖 Worker/WASM 的物理/解码/AI 库不可沿用。
