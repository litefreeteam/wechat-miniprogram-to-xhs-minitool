/* Heartfield MiniTool bridge, 2026-10-22 documented public API only.
 * Never guesses version from mere method presence. No network, AI or location calls.
 * Every API is guarded and retains a browser/local fallback when appropriate.
 */
(function (win) {
  'use strict';
  var cachedLaunch = null, launchPromise = null;
  function tool() { return win.xhs && win.xhs.miniTool; }
  function launch() {
    if (cachedLaunch) return Promise.resolve(cachedLaunch);
    if (launchPromise) return launchPromise;
    var x = win.xhs;
    if (x && x.launchOptions && x.launchOptions.miniToolEnv) {
      cachedLaunch = x.launchOptions;
      return Promise.resolve(cachedLaunch);
    }
    var m = tool();
    if (!m || typeof m.getLaunchOptions !== 'function') return Promise.resolve(null);
    launchPromise = Promise.resolve().then(function () { return m.getLaunchOptions(); }).then(function (r) {
      cachedLaunch = r || null;
      return cachedLaunch;
    }).catch(function () { return null; });
    return launchPromise;
  }
  function version() {
    return launch().then(function (opts) { return Math.floor((Number(opts && opts.miniToolEnv && opts.miniToolEnv.buildVersion) || 0) / 1000); });
  }
  function has(name, minimum) {
    var m = tool();
    if (!m || typeof m[name] !== 'function') return Promise.resolve(false);
    return version().then(function (v) { return v >= minimum; });
  }
  function run(name, minimum, options) {
    return has(name, minimum).then(function (ok) {
      if (!ok) throw new Error(name + ' unsupported');
      var m = tool();
      // Do not pass empty fake argument objects when the API has no business args.
      return options === undefined ? m[name]() : m[name](options);
    });
  }
  function browserGet(key) {
    try { var data = win.localStorage.getItem(key); return data === null ? null : JSON.parse(data); } catch (e) { return null; }
  }
  function browserSet(key, data) {
    try { win.localStorage.setItem(key, JSON.stringify(data)); return true; } catch (e) { return false; }
  }
  function browserRemove(key) {
    try { win.localStorage.removeItem(key); return true; } catch (e) { return false; }
  }
  function getJson(key) {
    return has('getStorage', 9460).then(function (native) {
      if (!native) return browserGet(key);
      return run('getStorage', 9460, { key:key }).then(function (r) {
        return r && r.data !== null && r.data !== undefined ? JSON.parse(r.data) : null;
      }).catch(function () { return null; });
    });
  }
  function setJson(key, data) {
    var serialized;
    try { serialized = JSON.stringify(data); if (typeof serialized !== 'string') return Promise.resolve(false); } catch (e) { return Promise.resolve(false); }
    return has('setStorage', 9460).then(function (native) {
      if (!native) return browserSet(key, data);
      return run('setStorage', 9460, { key:key, data:serialized }).then(function () { return true; }).catch(function () { return false; });
    });
  }
  function removeJson(key) {
    return has('removeStorage', 9460).then(function (native) {
      if (!native) return browserRemove(key);
      return run('removeStorage', 9460, { key:key }).then(function () { return true; }).catch(function () { return false; });
    });
  }
  function tempImage(dataUrl) {
    return has('writeTempFile', 0).then(function (yes) {
      // For unavailable writeTempFile, postNote and album save permit data: URI.
      if (!yes) return dataUrl;
      return run('writeTempFile', 0, { data:dataUrl }).then(function (r) {
        if (!r || !r.filePath) throw new Error('Temp image path missing');
        return r.filePath;
      }).catch(function () { return dataUrl; });
    });
  }
  function note(dataUrl, title, content) {
    return tempImage(dataUrl).then(function (path) {
      return run('postNote', 0, { title:title.slice(0,20), content:content.slice(0,1000), pageType:'photo_publish', mediaInfo:{ image_resources:[{url:path}] } });
    });
  }
  function album(dataUrl) {
    return tempImage(dataUrl).then(function (path) { return run('saveImageToPhotosAlbum', 0, {filePath:path}); });
  }
  function comment(dataUrl, content, snapshot) {
    // Comment media rejects a data: URI: writeTempFile is strictly required.
    return Promise.all([has('interactionOpenApi', 9490), has('writeTempFile', 0)]).then(function (cap) {
      if (!cap[0] || !cap[1]) throw new Error('Comment/image bridge unsupported');
      return run('writeTempFile', 0, {data:dataUrl});
    }).then(function (res) {
      if (!res || !res.filePath) throw new Error('Comment image file missing');
      var snap = JSON.stringify(snapshot || {});
      if (snap.length > 2000) throw new Error('Snapshot exceeds 2 KB');
      return run('interactionOpenApi', 9490, {
        payload:{action:'post_comment', content:content.slice(0,800), media_bean:[{media_type:'image',cover_image_url:res.filePath}], miniToolSnapshotInfo:snap},
        saveToAlbum:false
      });
    });
  }
  function safeWindow() {
    return run('getWindowInfo', 9490).then(function (info) {
      if (!info) return null;
      var safe = info.safeArea || {};
      var top = Math.max(0, Number(safe.top) || 0);
      var buttons = info.menuButtons || {};
      ['back','me','share'].forEach(function (name) { var b=buttons[name]; if(b && Number.isFinite(b.bottom)) top=Math.max(top,b.bottom+6); });
      var bottom = Number.isFinite(safe.bottom) && Number.isFinite(info.windowHeight) ? Math.max(8, info.windowHeight-safe.bottom+8) : 8;
      // Safe-area rectangles use container-local coordinates; do not add screenTop.
      win.document.documentElement.style.setProperty('--xhs-avoid-top', Math.min(120,top)+'px');
      win.document.documentElement.style.setProperty('--xhs-avoid-bottom', Math.min(80,bottom)+'px');
      return info;
    }).catch(function () { return null; });
  }
  var gyroOn=false, gyroHandler=null;
  function startGyro(onData) {
    return Promise.all(['onGyroscopeChange','offGyroscopeChange','startGyroscope','stopGyroscope'].map(function(n){return has(n,9500);})).then(function (caps) {
      if (caps.some(function (x) { return !x; })) return false;
      if (gyroOn) return true;
      var m=tool();gyroHandler=onData;
      try {m.onGyroscopeChange(gyroHandler);}catch (e) {gyroHandler=null;return false;}
      return run('startGyroscope',9500,{interval:'ui'}).then(function () {gyroOn=true;return true;}).catch(function(){
        try {m.offGyroscopeChange(gyroHandler);}catch(e){} gyroHandler=null;return false;
      });
    });
  }
  function stopGyro() {
    if (!gyroHandler) return Promise.resolve();
    var h=gyroHandler;gyroHandler=null;gyroOn=false;
    return run('stopGyroscope',9500).catch(function(){}).then(function(){
      var m=tool();if(m && typeof m.offGyroscopeChange==='function') {try{m.offGyroscopeChange(h);}catch(e){}}
    });
  }
  win.HeartfieldXHS = { tool:tool, launch:launch, version:version, has:has, getJson:getJson, setJson:setJson, removeJson:removeJson,
    note:note, album:album, comment:comment, safeWindow:safeWindow, startGyro:startGyro, stopGyro:stopGyro };
})(window);
