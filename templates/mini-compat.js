(function (global) {
  'use strict';
  var KEY_PREFIX = 'wxm2xhs:';
  function encode(v) { return JSON.stringify({v:v}); }
  function decode(v) { if (v == null) return undefined; try { return JSON.parse(v).v; } catch (_) { return v; } }
  function installId() {
    var k=KEY_PREFIX+'installId', v=localStorage.getItem(k); if (v) return v;
    if (global.crypto && crypto.getRandomValues) { var a=new Uint32Array(4); crypto.getRandomValues(a); v=Array.prototype.map.call(a,function(x){return x.toString(16).padStart(8,'0');}).join(''); }
    else v='local-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    localStorage.setItem(k,v); return v;
  }
  function chooseMedia(accept) {
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
  global.MiniCompat = {
    identity: { kind:'local-install-only', id:installId() },
    storage: {
      set:function(k,v){localStorage.setItem(KEY_PREFIX+k,encode(v));},
      get:function(k){return decode(localStorage.getItem(KEY_PREFIX+k));},
      remove:function(k){localStorage.removeItem(KEY_PREFIX+k);}
    },
    ui: { toast:toast, confirm:function(msg){return global.confirm(msg);} },
    chooseImage:function(){return chooseMedia('image/*');},
    chooseVideo:function(){return chooseMedia('video/*');},
    localObjectUrl:function(file){return URL.createObjectURL(file);}
  };
})(window);
