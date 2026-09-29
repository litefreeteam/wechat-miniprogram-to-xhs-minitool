(function (global) {
  'use strict';
  // ES5 模板：交付代码必须可在 Chrome 61（ES2017）运行，勿在本文件引入 ES2018+ 语法。

  function getMiniTool() {
    return global.xhs && global.xhs.miniTool ? global.xhs.miniTool : null;
  }

  function unavailable(apiName) {
    var error = new Error(apiName + ':fail MiniTool bridge unavailable in current environment');
    error.code = 'XHS_BRIDGE_UNAVAILABLE';
    return Promise.reject(error);
  }

  function call(apiName, options) {
    var bridge = getMiniTool();
    if (!bridge || typeof bridge[apiName] !== 'function') {
      return unavailable(apiName);
    }
    try {
      return Promise.resolve(bridge[apiName](options || {}));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function hasApi(apiName) {
    var bridge = getMiniTool();
    return !!(bridge && typeof bridge[apiName] === 'function');
  }

  var XhsBridge = {
    isAvailable: function () {
      return !!getMiniTool();
    },

    hasApi: hasApi,

    // getLaunchOptions → { version, buildVersion, userDataPath }
    // buildVersion 末 3 位是编译序号：Math.floor(9462004 / 1000) = 9462 ≈ 9.46.2
    getEnv: function () {
      var bridge = getMiniTool();
      if (!bridge) return Promise.resolve(null);
      var launch = global.xhs.launchOptions;
      if (typeof bridge.getLaunchOptions === 'function') {
        return Promise.resolve(bridge.getLaunchOptions({})).then(function (res) {
          var env = (res && res.miniToolEnv) || (launch && launch.miniToolEnv) || {};
          var buildVersion = Number(env.buildVersion || 0);
          return {
            buildVersion: buildVersion,
            version: buildVersion ? Math.floor(buildVersion / 1000) : 0,
            userDataPath: env.userDataPath || ''
          };
        }).catch(function () { return null; });
      }
      var fallbackEnv = (launch && launch.miniToolEnv) || {};
      var fb = Number(fallbackEnv.buildVersion || 0);
      return Promise.resolve({
        buildVersion: fb,
        version: fb ? Math.floor(fb / 1000) : 0,
        userDataPath: fallbackEnv.userDataPath || ''
      });
    },

    // 版本门槛能力探测（同时校验 API 符号存在）
    supportsStorage: function () { return hasApi('setStorage') && hasApi('getStorage'); },        // 9.46+
    supportsFileSystem: function () { return hasApi('writeFile') && hasApi('readFile'); },        // 9.49+
    supportsInteraction: function () { return hasApi('interactionOpenApi'); },                    // 9.49+

    writeTempFile: function (dataUri) {
      if (typeof dataUri !== 'string' || !/^data:[^;]+;base64,/.test(dataUri)) {
        return Promise.reject(new Error('writeTempFile requires a complete data: URI'));
      }
      return call('writeTempFile', { data: dataUri });
    },

    saveImage: function (filePath) {
      if (typeof filePath !== 'string' || !filePath) {
        return Promise.reject(new Error('saveImage requires filePath'));
      }
      // 大图推荐先落盘再递交路径，规避 base64 传输开销
      if (/^data:[^;]+;base64,/.test(filePath) && hasApi('writeTempFile')) {
        return call('writeTempFile', { data: filePath }).then(function (res) {
          return call('saveImageToPhotosAlbum', { filePath: res.filePath });
        });
      }
      return call('saveImageToPhotosAlbum', { filePath: filePath });
    },

    postImageNote: function (options) {
      options = options || {};
      var urls = Array.isArray(options.urls) ? options.urls : [];
      if (urls.length < 1 || urls.length > 18) {
        return Promise.reject(new Error('postImageNote requires 1-18 image urls'));
      }
      var payload = {
        pageType: 'photo_publish',
        mediaInfo: {
          image_resources: urls.map(function (url) { return { url: url }; })
        }
      };
      if (options.title) payload.title = String(options.title).slice(0, 20);
      if (options.content) payload.content = String(options.content).slice(0, 1000);
      return call('postNote', payload);
    },

    postVideoNote: function (options) {
      options = options || {};
      if (!options.videoUrl) {
        return Promise.reject(new Error('postVideoNote requires videoUrl'));
      }
      var video = { video_url: options.videoUrl };
      if (options.coverUrl) video.cover_url = options.coverUrl;
      var payload = { pageType: 'video_publish', mediaInfo: { video_resources: video } };
      if (options.title) payload.title = String(options.title).slice(0, 20);
      if (options.content) payload.content = String(options.content).slice(0, 1000);
      return call('postNote', payload);
    },

    // Storage（9.46+）：data 必须是 JSON 字符串；单 key ≤1MB、总量 ≤10MB；encrypt 读写一致
    setStorage: function (key, value, encrypt) {
      return call('setStorage', { key: key, data: JSON.stringify(value), encrypt: !!encrypt });
    },

    getStorage: function (key, encrypt) {
      return call('getStorage', { key: key, encrypt: !!encrypt }).then(function (res) {
        if (!res || res.data == null) return undefined;
        try { return JSON.parse(res.data); } catch (_) { return res.data; }
      });
    },

    getStorageInfo: function () { return call('getStorageInfo', {}); },
    removeStorage: function (key) { return call('removeStorage', { key: key }); },
    clearStorage: function () { return call('clearStorage', {}); },

    // 文件系统（9.49+）：相对路径基于 launchOptions.miniToolEnv.userDataPath
    // 大文件分片须按 getFileStorageInfo() 的 writeChunkMaxBytes/readChunkMaxBytes
    writeFile: function (filePath, data, encoding) {
      return call('writeFile', { filePath: filePath, data: data, encoding: encoding || 'utf8' });
    },

    readFile: function (filePath, encoding, position, length) {
      var options = { filePath: filePath, encoding: encoding || 'utf8' };
      if (typeof position === 'number') options.position = position;
      if (typeof length === 'number') options.length = length;
      return call('readFile', options);
    },

    appendFile: function (filePath, data, encoding) {
      return call('appendFile', { filePath: filePath, data: data, encoding: encoding || 'utf8' });
    },

    saveFile: function (tempFilePath, filePath) {
      var options = { tempFilePath: tempFilePath };
      if (filePath) options.filePath = filePath;
      return call('saveFile', options);
    },

    readDir: function (dirPath) { return call('readDir', { dirPath: dirPath }); },
    statFile: function (filePath) { return call('statFile', { filePath: filePath }); },
    unlink: function (filePath) { return call('unlink', { filePath: filePath }); },
    mkdir: function (dirPath, recursive) { return call('mkdir', { dirPath: dirPath, recursive: recursive !== false }); },
    getFileStorageInfo: function () { return call('getFileStorageInfo', {}); },

    // interactionOpenApi（9.49+）：唤起小红书发布评论；imagePaths 必须是容器本地句柄
    postComment: function (options) {
      options = options || {};
      var payload = { action: 'post_comment' };
      if (options.content) payload.content = String(options.content);
      if (options.imagePaths && options.imagePaths.length) {
        payload.media_bean = options.imagePaths.map(function (p) {
          return { media_type: 'image', cover_image_url: p };
        });
      }
      if (options.snapshotInfo) {
        // 快照字段超过 2KB 会被截断，仅用于状态桥接
        payload.miniToolSnapshotInfo = String(options.snapshotInfo).slice(0, 2048);
      }
      return call('interactionOpenApi', {
        payload: payload,
        saveToAlbum: !!options.saveToAlbum
      });
    }
  };

  global.XhsBridge = XhsBridge;
})(window);
