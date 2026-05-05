/**
 * AMADEUS — 解析助手回复中的 <aether_action>…</aether_action>，白名单落库（任务 / 每日任务 / 枝条）。
 * 依赖：AetherStorage（须先于 ai.js 加载；本文件在 ai.js 之前）。
 */
(function () {
  'use strict';

  function safeStr(x, max) {
    var s = String(x == null ? '' : x).trim();
    if (s.length > max) s = s.slice(0, max);
    return s;
  }

  function applyOne(j) {
    if (!j || typeof j !== 'object') return { ok: false, msg: '动作不是对象' };
    var op = safeStr(j.op, 40).toLowerCase();
    var S = window.AetherStorage;
    if (!S) return { ok: false, msg: '存储未就绪' };

    if (op === 'create_task') {
      var title = safeStr(j.title, 200);
      if (!title) return { ok: false, msg: 'create_task 缺少 title' };
      var pri = safeStr(j.priority, 10).toLowerCase();
      if (pri !== 'high' && pri !== 'low' && pri !== 'medium') pri = 'medium';
      var due = j.dueDate != null && String(j.dueDate).trim() ? String(j.dueDate).slice(0, 10) : null;
      var credits = parseInt(j.credits, 10);
      if (isNaN(credits) || credits < 1) credits = 10;
      if (credits > 500) credits = 500;
      var subs = [];
      if (Array.isArray(j.subtasks)) {
        j.subtasks.slice(0, 24).forEach(function (st) {
          if (!st || typeof st !== 'object') return;
          var stt = safeStr(st.title, 160);
          if (!stt) return;
          var sc = parseInt(st.credits, 10);
          if (isNaN(sc) || sc < 0) sc = 5;
          if (sc > 200) sc = 200;
          subs.push({ title: stt, credits: sc });
        });
      }
      var task = S.createTask({
        title: title,
        description: safeStr(j.description, 4000),
        priority: pri,
        dueDate: due,
        credits: credits,
        subtasks: subs,
      });
      S.saveTask(task);
      return { ok: true, msg: '已创建主任务：「' + title + '」' };
    }

    if (op === 'create_daily_task') {
      var dtitle = safeStr(j.title, 160);
      if (!dtitle) return { ok: false, msg: 'create_daily_task 缺少 title' };
      var emoji = safeStr(j.emoji, 8) || '✅';
      var dc = parseInt(j.credits, 10);
      if (isNaN(dc) || dc < 1) dc = 5;
      if (dc > 200) dc = 200;
      var dt = S.createDailyTask({
        title: dtitle,
        emoji: emoji,
        description: safeStr(j.description, 2000),
        credits: dc,
      });
      S.saveDailyTask(dt);
      return { ok: true, msg: '已创建每日任务：「' + dtitle + '」' };
    }

    if (op === 'create_branch') {
      var name = safeStr(j.name, 120);
      if (!name) return { ok: false, msg: 'create_branch 缺少 name' };
      var stepsIn = Array.isArray(j.steps) ? j.steps : [];
      var steps = [];
      stepsIn.slice(0, 40).forEach(function (s) {
        if (!s || typeof s !== 'object') return;
        var t = safeStr(s.title, 200);
        if (!t) return;
        var c = parseInt(s.credits, 10);
        if (isNaN(c) || c < 1) c = 30;
        if (c > 500) c = 500;
        steps.push({
          title: t,
          credits: c,
          note: safeStr(s.note, 800),
        });
      });
      if (!steps.length) steps.push({ title: '第一步', credits: 30, note: '' });
      S.createBranch({
        name: name,
        emoji: safeStr(j.emoji, 8),
        description: safeStr(j.description, 4000),
        steps: steps,
      });
      return { ok: true, msg: '已创建长期枝条：「' + name + '」' };
    }

    return { ok: false, msg: '未知 op：' + (op || '（空）') };
  }

  /**
   * 从正文中移除所有 <aether_action>…</aether_action>，并依次执行合法 JSON。
   * @returns {{ cleanedText: string, results: string[], hadAny: boolean }}
   */
  function extractAndExecute(text) {
    var raw = String(text || '');
    var re = /<aether_action>\s*([\s\S]*?)\s*<\/aether_action>/gi;
    var results = [];
    var cleaned = raw.replace(re, function (_full, inner) {
      var body = String(inner || '').trim();
      if (!body) return '';
      try {
        var j = JSON.parse(body);
        var r = applyOne(j);
        results.push(r.ok ? r.msg : '未执行：' + r.msg);
      } catch (e) {
        results.push('未执行：JSON 解析失败');
      }
      return '';
    });
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
    return { cleanedText: cleaned, results: results, hadAny: results.length > 0 };
  }

  window.AetherAmadeusActions = {
    extractAndExecute: extractAndExecute,
  };
})();
