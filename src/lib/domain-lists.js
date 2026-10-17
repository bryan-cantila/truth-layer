/* Truth Layer — domain-lists.js
 *
 * Bundled reference lists. Pure data, no chrome.* APIs, no network.
 * Loaded in the MV3 service worker (importScripts), content scripts,
 * popup/analyzer pages (<script>), and plain node for unit tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TL_lists = api;
}(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // Well-known domains attackers imitate (registrable form, no www).
  var POPULAR_DOMAINS = [
    'google.com', 'youtube.com', 'facebook.com', 'instagram.com', 'amazon.com',
    'paypal.com', 'apple.com', 'microsoft.com', 'netflix.com', 'gmail.com',
    'outlook.com', 'yahoo.com', 'ebay.com', 'walmart.com', 'target.com',
    'bestbuy.com', 'linkedin.com', 'x.com', 'twitter.com', 'tiktok.com',
    'discord.com', 'steam.com', 'roblox.com', 'epicgames.com', 'github.com',
    'gitlab.com', 'stackoverflow.com', 'reddit.com', 'pinterest.com',
    'whatsapp.com', 'telegram.org', 'binance.com', 'coinbase.com', 'kraken.com',
    'metamask.io', 'opensea.io', 'trustwallet.com', 'ledger.com',
    'shopify.com', 'etsy.com', 'aliexpress.com', 'ikea.com', 'costco.com',
    'homedepot.com', 'lowes.com', 'fedex.com', 'ups.com', 'usps.com', 'dhl.com',
    'docusign.com', 'dropbox.com', 'onedrive.com', 'icloud.com', 'zoom.us',
    'slack.com', 'trello.com', 'notion.so', 'figma.com', 'canva.com',
    'adobe.com', 'salesforce.com', 'intuit.com', 'turbotax.com',
    'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citibank.com',
    'capitalone.com', 'discover.com', 'americanexpress.com', 'barclays.com',
    'hsbc.com', 'santander.com', 'lloydsbank.com',
    'irs.gov', 'ssa.gov', 'usps.gov',
    'proton.me', 'protonmail.com', 'aol.com', 'zoho.com',
    'godaddy.com', 'namecheap.com', 'cloudflare.com',
    'booking.com', 'airbnb.com', 'expedia.com', 'delta.com', 'united.com',
    'spotify.com', 'hulu.com', 'disneyplus.com', 'hbomax.com',
    'playstation.com', 'xbox.com', 'nintendo.com',
    'cvs.com', 'walgreens.com', 'att.com', 'verizon.com', 't-mobile.com',
    'samsung.com', 'dell.com', 'hp.com', 'lenovo.com',
    'cnn.com', 'bbc.com', 'nytimes.com', 'reuters.com',
    'irs.com', 'hrblock.com',
    'venmo.com', 'cash.app', 'zellepay.com', 'wise.com', 'revolut.com',
    'stripe.com', 'square.com', 'quickbooks.com',
    'mailchimp.com', 'hubspot.com', 'zendesk.com',
    'wordpress.com', 'wix.com', 'squarespace.com',
    'coursera.org', 'udemy.com', 'duolingo.com',
    'shein.com', 'temu.com', 'wish.com',
    'nike.com', 'adidas.com', 'zara.com', 'hm.com'
  ];

  // Hosts whose only job is hiding the real destination.
  var URL_SHORTENERS = [
    'bit.ly', 'bitly.com', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly',
    'buff.ly', 'is.gd', 'cutt.ly', 'rb.gy', 'rebrand.ly', 'tiny.cc',
    'shorturl.at', 't.ly', 'cli.gs', 's.id', 'qr.ae', 'po.st', 'adf.ly',
    'bc.vc', 'soo.gd', 'tiny.one', 'short.ly', 'go2l.ink', 'v.gd'
  ];

  // TLDs disproportionately abused in phishing/malware campaigns.
  var SUSPICIOUS_TLDS = [
    'zip', 'mov', 'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz', 'buzz',
    'click', 'link', 'work', 'country', 'stream', 'download', 'review',
    'date', 'faith', 'party', 'cricket', 'science', 'webcam', 'trade',
    'loan', 'win', 'bid', 'racing', 'accountant', 'men', 'kim'
  ];

  // Substrings commonly found in AI-generated media metadata.
  var AI_GENERATOR_TAGS = [
    'midjourney', 'dall-e', 'dall·e', 'dall e', 'stable diffusion',
    'firefly', 'adobe firefly', 'leonardo', 'ideogram', 'flux',
    'imagen', 'bing image creator', 'copilot', 'nightcafe', 'runway',
    'pika', 'sora', 'lensa', 'remini', 'faceapp', 'wombo', 'starryai',
    'deepai', 'craiyon', 'artbreeder', 'playground', 'recraft',
    'ai generated', 'generated with ai', 'ai image', 'synthetic media',
    'generated image', 'diffusion'
  ];

  return {
    POPULAR_DOMAINS: POPULAR_DOMAINS,
    URL_SHORTENERS: URL_SHORTENERS,
    SUSPICIOUS_TLDS: SUSPICIOUS_TLDS,
    AI_GENERATOR_TAGS: AI_GENERATOR_TAGS
  };
}));
