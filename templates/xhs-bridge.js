(function (global) {
  'use strict';

  function getMiniTool() {
    return global.xhs && global.xhs.miniTool ? global.xhs.miniTool : null;
  }

  function unavailable(apiName) {
    const error = new Error(apiName + ':fail MiniTool bridge unavailable in current environment');
    error.code = 'XHS_BRIDGE_UNAVAILABLE';
    return Promise.reject(error);
  }

  function call(apiName, options) {
    const bridge = getMiniTool();
    if (!bridge || typeof bridge[apiName] !== 'function') {
      return unavailable(apiName);
    }
    try {
      return Promise.resolve(bridge[apiName](options || {}));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  const XhsBridge = {
    isAvailable: function () {
      return !!getMiniTool();
    },

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
      return call('saveImageToPhotosAlbum', { filePath: filePath });
    },

    postImageNote: function (options) {
      options = options || {};
      const urls = Array.isArray(options.urls) ? options.urls : [];
      if (urls.length < 1 || urls.length > 18) {
        return Promise.reject(new Error('postImageNote requires 1-18 image urls'));
      }
      const payload = {
        mediaInfo: {
          image_resources: urls.map(function (url) { return { url: url }; })
        }
      };
      if (options.title) payload.title = String(options.title).slice(0, 20);
      if (options.content) payload.content = String(options.content).slice(0, 1000);
      if (options.tags) payload.tags = String(options.tags);
      return call('postNote', payload);
    },

    postVideoNote: function (options) {
      options = options || {};
      if (!options.videoUrl) {
        return Promise.reject(new Error('postVideoNote requires videoUrl'));
      }
      const video = { video_url: options.videoUrl };
      if (options.coverUrl) video.cover_url = options.coverUrl;
      const payload = { mediaInfo: { video_resources: video } };
      if (options.title) payload.title = String(options.title).slice(0, 20);
      if (options.content) payload.content = String(options.content).slice(0, 1000);
      if (options.tags) payload.tags = String(options.tags);
      return call('postNote', payload);
    }
  };

  global.XhsBridge = XhsBridge;
})(window);
