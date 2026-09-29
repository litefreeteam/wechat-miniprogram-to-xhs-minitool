(function (global) {
  'use strict';
  // ES5 模板：交付代码必须可在 Chrome 61（ES2017）运行。
  var KEY_PREFIX = 'wxm2xhs:';
  function encode(v) { return JSON.stringify({v:v}); }
  function decode(v) { if (v == null) return undefined; try { return JSON.parse(v).v; } catch (_) { return v; } }
  function hex(n) { var s = n.toString(16); while (s.length < 8) s = '0' + s; return s; }
  function installId() {
    var k=KEY_PREFIX+'installId', v=localStorage.getItem(k); if (v) return v;
    if (global.crypto && crypto.getRandomValues) { var a=new Uint32Array(4); crypto.getRandomValues(a); v=Array.prototype.map.call(a,function(x){return hex(x);}).join(''); }
    else v='local-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    localStorage.setItem(k,v); return v;
  }
  function chooseMedia(accept) {
    // 容器限制：无论 accept 如何设置，系统选择器只放行图片/视频
    return new Promise(function(resolve,reject){
      var input=document.createElement('input'); input.type='file'; input.accept=accept||'image/*,video/*';
      input.onchange=function(){ var f=input.files&&input.files[0]; if(f) resolve(f); else reject(new Error('no file selected')); };
      input.click();
    });
  }
  function toast(text, ms) {
    var n=document.createElement('div'); n.textContent=text; n.setAttribute('role','status');
    n.style.cssText='position:fixed;left:50%;bottom:12vh;transform:translateX(-50%);z-index:99999;background:rgba(0,0,0,.78);color:#fff;padding:10px 14px;border-radius:10px;font-size:14px;max-width:80vw;';
    document.body.appendChild(n); setTimeout(function(){n.remove();},ms||1800);
  }

  // 存储策略（官方 2026-09-29 基线）：
  // - 首选容器级 XHS Storage（客户端 9.46+，经 XhsBridge）；
  // - 浏览器 localStorage 仅作旧客户端弱兼容兜底，官方不承诺生命周期；
  // - init() 时把 localStorage 数据单向迁移进容器 Storage。
  var xhsStorageReady = false;
  function bridge() { return global.XhsBridge || null; }
  function useXhsStorage() {
    var b = bridge();
    return !!(xhsStorageReady && b && b.supportsStorage());
  }
  function migrateToXhsStorage(b) {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(KEY_PREFIX) === 0) keys.push(k);
    }
    return keys.reduce(function (chain, k) {
      return chain.then(function () {
        return b.setStorage(k, localStorage.getItem(k)).catch(function (_) { /* 单条失败不阻断 */ });
      });
    }, Promise.resolve());
  }

  global.MiniCompat = {
    identity: { kind:'local-install-only', id:installId() },

    // 启动时调用一次：经 XhsBridge.getEnv()（getLaunchOptions → miniToolEnv.buildVersion）
    // 探测客户端 9.46+（version >= 9460）容器 Storage，并迁移浏览器存储数据
    init: function () {
      var b = bridge();
      if (!b || !b.isAvailable || !b.isAvailable()) return Promise.resolve(false);
      return b.getEnv().then(function (env) {
        if (env && env.version >= 9460 && b.supportsStorage()) {
          xhsStorageReady = true;
          return migrateToXhsStorage(b).then(function () { return true; });
        }
        return false;
      }).catch(function () { return false; });
    },

    storage: {
      // 同步接口：始终写 localStorage 兜底；若容器 Storage 可用则异步镜像一份
      set:function(k,v){
        var raw = encode(v);
        localStorage.setItem(KEY_PREFIX+k, raw);
        if (useXhsStorage()) bridge().setStorage(KEY_PREFIX+k, raw).catch(function(_){});
      },
      get:function(k){return decode(localStorage.getItem(KEY_PREFIX+k));},
      remove:function(k){
        localStorage.removeItem(KEY_PREFIX+k);
        if (useXhsStorage()) bridge().removeStorage(KEY_PREFIX+k).catch(function(_){});
      },
      // 异步接口：容器 Storage 优先（9.46+），localStorage 兜底
      setAsync:function(k,v){
        var raw = encode(v);
        if (useXhsStorage()) {
          return bridge().setStorage(KEY_PREFIX+k, raw).then(function(){
            try { localStorage.setItem(KEY_PREFIX+k, raw); } catch (_) {}
          });
        }
        try { localStorage.setItem(KEY_PREFIX+k, raw); return Promise.resolve(); }
        catch (e) { return Promise.reject(e); }
      },
      getAsync:function(k){
        if (useXhsStorage()) {
          return bridge().getStorage(KEY_PREFIX+k).then(function(raw){
            if (raw == null) { raw = localStorage.getItem(KEY_PREFIX+k); }
            return decode(raw);
          }).catch(function(){ return decode(localStorage.getItem(KEY_PREFIX+k)); });
        }
        return Promise.resolve(decode(localStorage.getItem(KEY_PREFIX+k)));
      },
      removeAsync:function(k){
        if (useXhsStorage()) {
          return bridge().removeStorage(KEY_PREFIX+k).catch(function(_){})
            .then(function(){ localStorage.removeItem(KEY_PREFIX+k); });
        }
        localStorage.removeItem(KEY_PREFIX+k);
        return Promise.resolve();
      }
    },

    ui: { toast:toast, confirm:function(msg){return global.confirm(msg);} },
    chooseImage:function(){return chooseMedia('image/*');},
    chooseVideo:function(){return chooseMedia('video/*');},
    localObjectUrl:function(file){return URL.createObjectURL(file);}
  };
})(window);
