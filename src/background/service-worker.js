/* Truth Layer — service worker (MV3 background)
 *
 * PRIVACY: this worker never sends any URL, image, or page content anywhere.
 * All verdicts are computed locally via TL_heuristics. The only network the
 * extension ever performs is fetching image bytes the browser already loaded,
 * for local C2PA/metadata analysis in the analyzer page.
 */
importScripts('../lib/domain-lists.js', '../lib/url-heuristics.js');

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'tl-check-link',
    title: 'Check link safety (Truth Layer)',
    contexts: ['link']
  });
  chrome.contextMenus.create({
    id: 'tl-analyze-image',
    title: 'Analyze image (Truth Layer)',
    contexts: ['image']
  });
  chrome.contextMenus.create({
    id: 'tl-check-video',
    title: 'Check video provenance (Truth Layer)',
    contexts: ['video']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'tl-check-link' && info.linkUrl && tab && tab.id) {
    const verdict = TL_heuristics.scoreUrl(info.linkUrl);
    chrome.tabs.sendMessage(tab.id, {
      type: 'TL_SHOW_VERDICT',
      url: info.linkUrl,
      verdict: verdict
    }).catch(() => {
      // Content script not ready (e.g. chrome:// pages): fall back to a tab.
      chrome.tabs.create({
        url: chrome.runtime.getURL('src/popup/popup.html') + '?url=' + encodeURIComponent(info.linkUrl)
      });
    });
  } else if ((info.menuItemId === 'tl-analyze-image' || info.menuItemId === 'tl-check-video') && info.srcUrl) {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/analyzer/analyzer.html') + '?src=' + encodeURIComponent(info.srcUrl)
    });
  }
});
