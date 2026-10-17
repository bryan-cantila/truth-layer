/* Truth Layer — media-scanner content script.
 *
 * Enumerates <video> and in-viewport <img> elements on the page and can
 * capture a video's current frame to a JPEG data URL. All work is local;
 * nothing is uploaded anywhere.
 *
 * Messages (chrome.runtime.onMessage):
 *   {cmd:'tl-scan-media'}        -> {ok, items:[...], embedded:n}
 *   {cmd:'tl-capture-frame', idx} -> {ok, dataUrl} | {ok:false, error}
 *     idx is the video's index in scan order (item.vidx).
 */
(function () {
  'use strict';

  var videoEls = []; // document-order <video> refs, refreshed on every scan

  function inViewport(rect) {
    return TL_mediaUtils.rectInViewport(rect, window.innerWidth, window.innerHeight);
  }

  function scanAll() {
    videoEls = [];
    var items = [];
    var embedded = 0;

    var vids = document.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) {
      var v = vids[i];
      videoEls.push(v);
      var rect = v.getBoundingClientRect();
      items.push({
        type: 'video',
        vidx: i,
        src: TL_mediaUtils.absolutize(v.currentSrc || v.getAttribute('src') || '', document.baseURI),
        playing: !v.paused && !v.ended && v.readyState >= 2,
        width: v.videoWidth || 0,
        height: v.videoHeight || 0,
        inViewport: inViewport(rect),
        alt: ''
      });
    }

    var imgs = document.querySelectorAll('img');
    for (var j = 0; j < imgs.length; j++) {
      var img = imgs[j];
      if ((img.naturalWidth || 0) < 200) continue; // thumbnails, icons, spacers
      var raw = img.currentSrc || img.getAttribute('src') || '';
      if (/^\s*data:/i.test(raw)) { embedded++; continue; } // inline blobs: counted, not listed
      var r = img.getBoundingClientRect();
      if (!inViewport(r)) continue;
      items.push({
        type: 'image',
        src: TL_mediaUtils.absolutize(raw, document.baseURI),
        playing: false,
        width: img.naturalWidth || 0,
        height: img.naturalHeight || 0,
        inViewport: true,
        alt: img.alt || ''
      });
    }
    return { items: items, embedded: embedded };
  }

  var TLMedia = {
    scan: function () { return scanAll().items; },
    // Returns {dataUrl} on success, {error:'tainted'} for cross-origin
    // canvases, {error:'no-frame'} when nothing is loaded, and never throws.
    captureFrame: function (videoEl) {
      try {
        if (!videoEl || !videoEl.isConnected) return { error: 'no-video' };
        var w = videoEl.videoWidth, h = videoEl.videoHeight;
        if (!w || !h) return { error: 'no-frame' };
        var c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(videoEl, 0, 0, w, h);
        return { dataUrl: c.toDataURL('image/jpeg', 0.85) };
      } catch (e) {
        if (e && e.name === 'SecurityError') return { error: 'tainted' };
        return { error: 'capture-failed' };
      }
    }
  };
  window.TLMedia = TLMedia; // exposed for debugging; messages are the real API

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || (msg.cmd !== 'tl-scan-media' && msg.cmd !== 'tl-capture-frame')) return;
    if (msg.cmd === 'tl-scan-media') {
      var all = scanAll();
      sendResponse({ ok: true, items: all.items, embedded: all.embedded });
    } else {
      scanAll(); // refresh element refs before capturing
      var out = TLMedia.captureFrame(videoEls[msg.idx]);
      out.ok = !out.error;
      sendResponse(out);
    }
    return true;
  });
})();
