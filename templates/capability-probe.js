(function (global) {
  'use strict';
  // These probes do not call XHS-explicitly-blocked APIs. "true" only means the Web symbol
  // exists; optional features still need a real, user-triggered smoke test and fallback.
  function exists(v) { return typeof v !== 'undefined' && v !== null; }
  function canPlay(kind, mime) {
    try {
      var el = document.createElement(kind);
      return !!(el && el.canPlayType && el.canPlayType(mime));
    } catch (_) { return false; }
  }
  function miniToolFn(name) {
    return !!(global.xhs && global.xhs.miniTool && typeof global.xhs.miniTool[name] === 'function');
  }
  // buildVersion 末 3 位是编译序号；同步降级读 window.xhs.launchOptions，权威值应走 getLaunchOptions()
  var launchEnv = (global.xhs && global.xhs.launchOptions && global.xhs.launchOptions.miniToolEnv) || {};
  var buildVersion = Number(launchEnv.buildVersion || 0);
  global.MiniToolCapabilities = {
    xhsBridge: !!(global.xhs && global.xhs.miniTool),
    xhsBuildVersion: buildVersion ? Math.floor(buildVersion / 1000) : 0,
    xhsStorageApi: miniToolFn('setStorage') && miniToolFn('getStorage'),          // 9.46+
    xhsFileSystemApi: miniToolFn('writeFile') && miniToolFn('readFile'),          // 9.49+
    xhsInteractionApi: miniToolFn('interactionOpenApi'),                          // 9.49+
    canvas2d: (function(){ try { var c=document.createElement('canvas'); return !!c.getContext('2d'); } catch(_){ return false; } })(),
    webgl: (function(){ try { var c=document.createElement('canvas'); return !!(c.getContext('webgl')||c.getContext('webgl2')); } catch(_){ return false; } })(),
    getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    mediaRecorderSymbol: exists(global.MediaRecorder),
    vibrateSymbol: typeof navigator.vibrate === 'function',
    visualViewport: exists(global.visualViewport),
    intersectionObserver: exists(global.IntersectionObserver),
    requestIdleCallback: typeof global.requestIdleCallback === 'function',
    cryptoSubtle: !!(global.crypto && global.crypto.subtle),
    prefersColorScheme: !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)')),
    audioMpeg: canPlay('audio','audio/mpeg'),
    videoMp4: canPlay('video','video/mp4')
  };
})(window);
