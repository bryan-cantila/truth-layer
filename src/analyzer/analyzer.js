/* Truth Layer — analyzer logic.
 *
 * PRIVACY: the file under analysis is fetched (same bytes the browser
 * already loaded) or read from the user's own disk, then analyzed locally.
 * Nothing is uploaded anywhere, ever.
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function setStatus(text, color) {
    var el = $('statusLine');
    el.textContent = text;
    el.style.color = color || '#e2e8f0';
  }

  function renderC2PA(res) {
    var box = $('c2paBox');
    box.textContent = '';
    var p = document.createElement('p');
    p.style.margin = '0 0 6px';
    if (res.present) {
      p.innerHTML = '';
      var strong = document.createElement('strong');
      strong.className = 'clean';
      strong.textContent = 'C2PA manifest found. ';
      p.appendChild(strong);
      p.appendChild(document.createTextNode(res.detail));
      if (res.generator) {
        var g = document.createElement('div');
        g.style.marginTop = '6px';
        var gl = document.createElement('span');
        gl.className = 'muted';
        gl.textContent = 'Claim generator hint: ';
        var gv = document.createElement('strong');
        gv.textContent = res.generator;
        g.appendChild(gl); g.appendChild(gv);
        p.appendChild(g);
      }
    } else {
      var s2 = document.createElement('strong');
      s2.textContent = 'No provenance manifest. ';
      p.appendChild(s2);
      p.appendChild(document.createTextNode(res.detail));
    }
    box.appendChild(p);
  }

  function renderMetadata(meta) {
    var box = $('metaBox');
    box.textContent = '';
    var fmt = document.createElement('p');
    fmt.style.margin = '0 0 8px';
    fmt.textContent = 'Detected format: ' + meta.format;
    box.appendChild(fmt);
    var keys = Object.keys(meta.fields);
    if (keys.length === 0) {
      var none = document.createElement('p');
      none.className = 'muted';
      none.style.margin = '0';
      none.textContent = 'No readable metadata fields.';
      box.appendChild(none);
    } else {
      var tbl = document.createElement('table');
      keys.slice(0, 12).forEach(function (k) {
        var tr = document.createElement('tr');
        var td1 = document.createElement('td');
        td1.textContent = k;
        var td2 = document.createElement('td');
        td2.textContent = String(meta.fields[k]).slice(0, 220);
        tr.appendChild(td1); tr.appendChild(td2);
        tbl.appendChild(tr);
      });
      box.appendChild(tbl);
    }
  }

  function renderAi(meta) {
    var box = $('aiBox');
    box.textContent = '';
    if (meta.aiIndicators.length === 0) {
      var p = document.createElement('p');
      p.style.margin = '0';
      var c = document.createElement('span');
      c.className = 'clean';
      c.textContent = 'No known AI-generator fingerprints found in metadata. ';
      p.appendChild(c);
      p.appendChild(document.createTextNode(
        'This is not proof of authenticity — fingerprints are trivially stripped.'));
      box.appendChild(p);
    } else {
      meta.aiIndicators.forEach(function (hit) {
        var p = document.createElement('p');
        p.style.margin = '0 0 6px';
        var h = document.createElement('strong');
        h.className = 'hit';
        h.textContent = 'AI-generator tag detected: "' + hit.match + '" ';
        p.appendChild(h);
        var d = document.createElement('div');
        d.className = 'muted';
        d.textContent = 'in ' + hit.field + ' — ' + hit.value;
        p.appendChild(d);
        box.appendChild(p);
      });
    }
  }

  function renderNotes(meta) {
    var ul = $('notesList');
    ul.textContent = '';
    var notes = meta.notes.slice();
    notes.push('Metadata can be edited or stripped by anyone; treat it as a clue, not a verdict.');
    if (meta.format === 'unknown') {
      notes.push('Only JPEG and PNG metadata are analyzed in v1.');
    }
    notes.forEach(function (n) {
      var li = document.createElement('li');
      li.textContent = n;
      ul.appendChild(li);
    });
  }

  function analyzeBuffer(buffer, label) {
    $('resultsCard').classList.remove('hidden');
    setStatus('Analyzing…');
    try {
      var meta = TL_metadata.analyzeImageMetadata(buffer);
      var c2pa = TL_c2pa.detectC2PA(buffer);
      renderC2PA(c2pa);
      renderMetadata(meta);
      renderAi(meta);
      renderNotes(meta);
      var flagged = c2pa.present || meta.aiIndicators.length > 0;
      setStatus(
        flagged ? 'Analysis complete — see findings below.' : 'Analysis complete — no provenance or AI fingerprints found.',
        flagged ? '#fcd34d' : '#e2e8f0'
      );
    } catch (e) {
      setStatus('Analysis failed: ' + e.message, '#fca5a5');
    }
    if (label) {
      var si = $('sourceInfo');
      si.textContent = '';
      si.appendChild(document.createTextNode('Analyzing: '));
      var code = document.createElement('code');
      code.textContent = String(label).slice(0, 120);
      si.appendChild(code);
    }
  }

  function loadFromUrl(srcUrl) {
    var isVideo = /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(srcUrl);
    var prev = isVideo ? $('previewVideo') : $('preview');
    var other = isVideo ? $('preview') : $('previewVideo');
    other.classList.add('hidden');
    prev.classList.remove('hidden');
    prev.src = srcUrl;

    $('lensLink').href = 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(srcUrl);
    $('tineyeLink').href = 'https://tineye.com/search?url=' + encodeURIComponent(srcUrl);

    fetch(srcUrl).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      analyzeBuffer(buf, srcUrl);
    }).catch(function (e) {
      $('resultsCard').classList.remove('hidden');
      setStatus('Could not fetch the file (' + e.message + ').', '#fcd34d');
      var si = $('sourceInfo');
      si.textContent = 'The site blocks cross-origin reads. Save the file, then use the file picker below — analysis stays on your device.';
      renderC2PA({ present: false, detail: 'Not checked — file bytes unavailable.' });
      renderMetadata({ format: 'unknown', fields: {}, aiIndicators: [], notes: [] });
      renderAi({ aiIndicators: [] });
      renderNotes({ notes: [], format: 'unknown' });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('fileInput').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var isVideo = f.type.indexOf('video') === 0;
      var prev = isVideo ? $('previewVideo') : $('preview');
      var other = isVideo ? $('preview') : $('previewVideo');
      other.classList.add('hidden');
      prev.classList.remove('hidden');
      var objUrl = URL.createObjectURL(f);
      prev.src = objUrl;
      var rd = new FileReader();
      rd.onload = function () { analyzeBuffer(rd.result, f.name); };
      rd.onerror = function () { setStatus('Could not read the file.', '#fca5a5'); };
      rd.readAsArrayBuffer(f);
    });

    var m = /[?&]src=([^&]+)/.exec(location.search);
    if (m) {
      loadFromUrl(decodeURIComponent(m[1]));
    } else {
      $('sourceInfo').textContent = 'Pick a file to analyze, or open this page from the right-click menu on an image or video.';
    }
  });
})();
