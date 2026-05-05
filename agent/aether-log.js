/* ===================================================
   AETHER — 本地诊断日志（localStorage + 导出 .txt）
   记录异常与告警，便于排查 Fish TTS、API、脚本错误等。
   =================================================== */
(function () {
  'use strict';
  var KEY = 'aether_diag_log';
  var MAX = 800;

  function loadRaw() {
    try {
      var j = localStorage.getItem(KEY);
      if (!j) return [];
      var a = JSON.parse(j);
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }

  function save(entries) {
    try {
      localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX)));
    } catch (e) {}
  }

  function push(level, tag, message, extra) {
    var entries = loadRaw();
    entries.push({
      ts: new Date().toISOString(),
      level: level,
      tag: tag || 'app',
      message: String(message || '').slice(0, 4000),
      extra: extra != null ? String(extra).slice(0, 1500) : undefined,
    });
    save(entries);
  }

  function downloadFile() {
    var rows = loadRaw().map(function (e) {
      var x = e.extra ? ' | ' + e.extra : '';
      return e.ts + ' [' + e.level + '] ' + e.tag + ' | ' + e.message + x;
    });
    var text = 'AETHER 诊断日志（导出时间 ' + new Date().toISOString() + '）\n' + rows.join('\n');
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aether-log-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  window.AetherLog = {
    info: function (tag, msg, extra) { push('INFO', tag, msg, extra); },
    warn: function (tag, msg, extra) { push('WARN', tag, msg, extra); },
    error: function (tag, msg, extra) { push('ERROR', tag, msg, extra); },
    download: downloadFile,
  };

  window.addEventListener('error', function (ev) {
    var stack = ev.error && ev.error.stack ? String(ev.error.stack) : '';
    push(
      'ERROR',
      'window.onerror',
      String(ev.message || 'error'),
      (ev.filename || '') + ':' + (ev.lineno || '') + ' ' + stack
    );
  });

  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    var msg = r && r.message ? String(r.message) : String(r);
    var stack = r && r.stack ? String(r.stack) : '';
    push('ERROR', 'unhandledrejection', msg, stack);
  });
})();
