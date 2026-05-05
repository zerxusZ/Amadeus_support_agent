/**
 * AMADEUS Module Registry
 * 职责：汇总所有 L1/L2/L3 模块，根据运行时上下文计算 moodState / formatMode，组装 system prompt 片段
 *
 * 依赖加载顺序（须在本文件之前加载）：
 *   L3: anti-hallucination.js, file-boundary.js, memory.js, attention.js
 *   L2: task-decomp.js, ltask-manager.js, summarization.js, kb-sync.js, skill-controller.js
 *   L1: personality.js, language.js, mood.js, format.js
 *
 * 输出：window.AMADEUS_ModuleRegistry
 *   .assemble(ctx)      → string，L3→L2→L1 顺序拼接的完整 agent 指令块
 *   .computeContext(data) → ctx 对象，由 harness.js 调用
 */
(function () {
  'use strict';

  /** 模块注册表（执行顺序即 prompt 中的顺序：L3 → L2 → L1） */
  var REGISTRY = [
    // ── L3 核心约束层（权威最高，先写入） ──
    { key: 'L3_AntiHallucination', ref: function () { return window.AMADEUS_L3_AntiHallucination; } },
    { key: 'L3_FileBoundary',      ref: function () { return window.AMADEUS_L3_FileBoundary; } },
    { key: 'L3_Memory',            ref: function () { return window.AMADEUS_L3_Memory; } },
    { key: 'L3_Attention',         ref: function () { return window.AMADEUS_L3_Attention; } },
    // ── L2 行为层 ──
    { key: 'L2_TaskDecomp',        ref: function () { return window.AMADEUS_L2_TaskDecomp; } },
    { key: 'L2_LTaskManager',      ref: function () { return window.AMADEUS_L2_LTaskManager; } },
    { key: 'L2_Summarization',     ref: function () { return window.AMADEUS_L2_Summarization; } },
    { key: 'L2_KBSync',            ref: function () { return window.AMADEUS_L2_KBSync; } },
    { key: 'L2_SkillController',   ref: function () { return window.AMADEUS_L2_SkillController; } },
    // ── L1 输出层（最接近生成侧，最后写入） ──
    { key: 'L1_Personality',       ref: function () { return window.AMADEUS_L1_Personality; } },
    { key: 'L1_Language',          ref: function () { return window.AMADEUS_L1_Language; } },
    { key: 'L1_Mood',              ref: function () { return window.AMADEUS_L1_Mood; } },
    { key: 'L1_Format',            ref: function () { return window.AMADEUS_L1_Format; } },
  ];

  /**
   * 根据运行时数据推断 moodState 和 formatMode
   * @param {object} data  { profile, ltm, pendingCount, overdueCount, completedToday, giftLedger }
   * @returns {object} ctx { moodState, formatMode, ltmCount, pendingCount, overdueCount, completedToday, hasGift }
   */
  function computeContext(data) {
    data = data || {};
    var profile      = data.profile || {};
    var ltm          = Array.isArray(data.ltm) ? data.ltm : [];
    var pendingCount  = data.pendingCount  || 0;
    var overdueCount  = data.overdueCount  || 0;
    var completedToday = data.completedToday || 0;
    var giftLedger   = Array.isArray(data.giftLedger) ? data.giftLedger : [];

    // 判断是否今日有礼物
    var today = new Date().toISOString().slice(0, 10);
    var hasGift = giftLedger.some(function (g) {
      return g && g.ts && String(g.ts).slice(0, 10) === today;
    });

    // Mood state 优先级：HIGH_RISK（外部显式设置）> POSITIVE > URGENT > INFO_SPARSE > NOMINAL
    var moodState;
    if (data.forceMoodState && window.AMADEUS_L1_Mood &&
        window.AMADEUS_L1_Mood.states.indexOf(data.forceMoodState) !== -1) {
      moodState = data.forceMoodState;
    } else if (hasGift || (completedToday >= 3)) {
      moodState = 'POSITIVE';
    } else if (overdueCount >= 3) {
      moodState = 'URGENT';
    } else if (!profile.name && ltm.length < 2) {
      moodState = 'INFO_SPARSE';
    } else {
      moodState = 'NOMINAL';
    }

    // Format mode 默认 CHAT；外部可显式覆盖
    var formatMode = data.forceFormatMode || 'CHAT';

    // Read system language so L1/Language module can output the right habits
    var aetherLang = 'zh';
    try {
      if (window.AetherStorage && typeof window.AetherStorage.getSettings === 'function') {
        var _l = String(window.AetherStorage.getSettings().aetherLang || 'zh').toLowerCase();
        if (_l === 'en' || _l === 'ja' || _l === 'zh') aetherLang = _l;
      }
    } catch (e) {}

    return {
      moodState:      moodState,
      formatMode:     formatMode,
      ltmCount:       ltm.length,
      pendingCount:   pendingCount,
      overdueCount:   overdueCount,
      completedToday: completedToday,
      hasGift:        hasGift,
      profile:        profile,
      aetherLang:     aetherLang,
    };
  }

  /**
   * 组装所有模块的 prompt 文本块
   * @param {object} ctx  由 computeContext() 生成
   * @returns {string}
   */
  function assemble(ctx) {
    ctx = ctx || {};
    var parts = [];

    for (var i = 0; i < REGISTRY.length; i++) {
      var entry = REGISTRY[i];
      var mod = null;
      try { mod = entry.ref(); } catch (e) {}

      var text = '';
      if (mod && typeof mod.build === 'function') {
        try { text = mod.build(ctx); } catch (e) {
          text = (mod.fallback || '');
        }
      } else if (mod && mod.fallback) {
        text = mod.fallback;
      }

      if (text && String(text).trim()) {
        parts.push(String(text).trim());
      }
    }

    return parts.join('\n\n');
  }

  window.AMADEUS_ModuleRegistry = {
    REGISTRY: REGISTRY,
    computeContext: computeContext,
    assemble: assemble,
  };
})();
