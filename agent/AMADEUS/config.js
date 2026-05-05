/**
 * AMADEUS Agent — 身份元数据注册表
 * 职责：仅保存 agent 的可切换身份标识（key / displayName / ltmExtractPrompt）
 *       人格、语言、记忆、行为、技能、约束规则均已拆入 modules/ 各层模块
 *
 * 在 index.html 中须早于 modules/index.js 和 harness.js 加载
 * 如需添加第二个 agent profile（如 MAKISE_PURE），在此文件中注册新 key 即可
 */
(function () {
  'use strict';
  window.AetherAgentProfiles = window.AetherAgentProfiles || {};

  window.AetherAgentProfiles.AMADEUS = {
    key: 'AMADEUS',
    displayName: 'AMADEUS',

    /**
     * LTM 提取专用 prompt（独立调用，不参与主 system 组装）
     * 调用者：agent/AMADEUS/ai.js → extractLTMFromHistory()
     */
    ltmExtractPrompt:
      '你是记忆提取子系统，从对话中抽取 1–5 条关于用户的、具体且长期有价值的事实。\n' +
      '只输出 JSON 数组：["事实1","事实2"]；若无重要事实返回 []。\n' +
      '不要输出解释、不要输出 markdown。',
  };
})();
