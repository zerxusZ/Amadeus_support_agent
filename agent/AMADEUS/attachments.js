/**
 * AMADEUS 附件库 — 浏览器 IndexedDB 持久化（纯前端无法写入磁盘项目目录，逻辑上作为「助手专属库」）。
 * 文本类会抽取正文供 system 注入；二进制仅列元数据。
 */
(function () {
  'use strict';

  var DB_NAME = 'aether_amadeus_attachments';
  var STORE = 'files';
  var DB_VERSION = 1;
  var MAX_FILES = 24;
  var MAX_FILE_BYTES = 450 * 1024;
  var MAX_TEXT_STORE = 120000;
  var _dbPromise = null;

  function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
    return _dbPromise;
  }

  function genId() {
    return 'att-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function isTextLike(file) {
    var mime = String(file.type || '').toLowerCase();
    var name = String(file.name || '').toLowerCase();
    if (/^text\//i.test(mime)) return true;
    if (/json|csv|javascript|typescript|markdown|xml|yaml/i.test(mime)) return true;
    if (/\.(txt|md|json|csv|ts|js|mjs|cjs|log|yaml|yml|xml|html|htm|css|svg)$/i.test(name)) return true;
    return false;
  }

  function readFileAsText(file) {
    return new Promise(function (resolve) {
      var fr = new FileReader();
      fr.onload = function () {
        resolve(String(fr.result || ''));
      };
      fr.onerror = function () {
        resolve('');
      };
      fr.readAsText(file, 'UTF-8');
    });
  }

  async function countFiles() {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readonly');
      var st = tx.objectStore(STORE);
      var rq = st.count();
      rq.onsuccess = function () {
        resolve(rq.result || 0);
      };
      rq.onerror = function () {
        reject(rq.error);
      };
    });
  }

  async function listFiles() {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var out = [];
      var tx = db.transaction(STORE, 'readonly');
      var st = tx.objectStore(STORE);
      var cur = st.openCursor();
      cur.onsuccess = function (e) {
        var c = e.target.result;
        if (c) {
          out.push(c.value);
          c.continue();
        } else {
          out.sort(function (a, b) {
            return String(b.addedAt).localeCompare(String(a.addedAt));
          });
          resolve(out);
        }
      };
      cur.onerror = function () {
        reject(cur.error);
      };
    });
  }

  async function saveRecord(rec) {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = function () {
        resolve(rec);
      };
      tx.onerror = function () {
        reject(tx.error);
      };
    });
  }

  async function deleteById(id) {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = function () {
        resolve();
      };
      tx.onerror = function () {
        reject(tx.error);
      };
    });
  }

  async function addFilesFromList(fileList, opts) {
    opts = opts || {};
    var useRel = !!opts.useRelativePath;
    if (!fileList || !fileList.length) return { added: 0, errors: [] };
    var n = await countFiles();
    var errors = [];
    var added = 0;
    for (var i = 0; i < fileList.length; i++) {
      var file = fileList[i];
      if (!file || !file.name) continue;
      if (file.size > MAX_FILE_BYTES) {
        errors.push(file.name + '：超过 ' + Math.floor(MAX_FILE_BYTES / 1024) + 'KB 上限');
        continue;
      }
      if (n + added >= MAX_FILES) {
        errors.push('已达附件数量上限 ' + MAX_FILES);
        break;
      }
      var displayName =
        useRel && file.webkitRelativePath ? String(file.webkitRelativePath) : String(file.name);
      var text = '';
      var textMode = 'none';
      if (isTextLike(file)) {
        text = await readFileAsText(file);
        if (text.length > MAX_TEXT_STORE) text = text.slice(0, MAX_TEXT_STORE);
        textMode = 'text';
      } else {
        textMode = 'binary';
      }
      await saveRecord({
        id: genId(),
        name: displayName,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        addedAt: new Date().toISOString(),
        textMode: textMode,
        text: text,
      });
      added++;
    }
    return { added: added, errors: errors };
  }

  /**
   * 拼入 LLM system（由 ai.sendAmadeusMessage 调用）
   */
  async function getPromptBlock(maxChars) {
    maxChars = maxChars || 4000;
    var items = await listFiles();
    if (!items.length) return '';
    var head =
      '【添加附件 · 本项目内】\n' +
      '以下为同一 AETHER 实例中用户导入的文件节选或元数据；你应当按需引用其中与问题相关的正文；勿编造片段中未出现的内容；未展开正文的条目表示未做自动解析。\n';
    var budget = Math.max(0, maxChars - head.length - 40);
    var parts = [];
    for (var j = 0; j < items.length && budget > 80; j++) {
      var it = items[j];
      var meta = '「' + String(it.name || '未命名') + '」 ' + String(it.mime || '') + ' ' + (it.size || 0) + 'B';
      var block;
      if (it.textMode === 'text' && it.text && String(it.text).trim()) {
        var slice = String(it.text).slice(0, Math.min(budget - 40, 10000));
        block = '· ' + meta + '\n' + slice;
      } else {
        block = '· ' + meta + '\n  （非文本或未抽取正文，可提示用户自行打开该文件对照）';
      }
      if (block.length + 2 > budget) break;
      parts.push(block);
      budget -= block.length + 2;
    }
    if (!parts.length) return '';
    return head + '\n' + parts.join('\n\n');
  }

  async function renderListToDom(container) {
    if (!container) return;
    var items = await listFiles();
    if (!items.length) {
      container.innerHTML = '<li class="amadeus-attach-empty">暂无附件</li>';
      return;
    }
    container.innerHTML = items
      .map(function (it) {
        var safeName = String(it.name || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/"/g, '&quot;');
        var mode = it.textMode === 'text' ? '文本' : '二进制';
        return (
          '<li class="amadeus-attach-item">' +
          '<span class="amadeus-attach-name" title="' +
          safeName +
          '">' +
          safeName +
          '</span>' +
          '<span class="amadeus-attach-meta">' +
          mode +
          '</span>' +
          '<button type="button" class="btn-icon amadeus-attach-del" data-att-id="' +
          String(it.id).replace(/"/g, '') +
          '" title="移除">✕</button></li>'
        );
      })
      .join('');
    container.querySelectorAll('.amadeus-attach-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-att-id');
        if (id && window.App && typeof window.App.removeAmadeusAttachment === 'function') {
          window.App.removeAmadeusAttachment(id);
        }
      });
    });
  }

  window.AetherAmadeusAttachments = {
    addFilesFromList: addFilesFromList,
    listFiles: listFiles,
    deleteById: deleteById,
    getPromptBlock: getPromptBlock,
    renderListToDom: renderListToDom,
    MAX_FILES: MAX_FILES,
    MAX_FILE_BYTES: MAX_FILE_BYTES,
  };
})();
