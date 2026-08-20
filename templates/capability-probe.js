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
  global.MiniToolCapabilities = {
    xhsBridge: !!(global.xhs && global.xhs.miniTool),
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
