/**
 * L3 · Memory Management System
 * 职责：规定短期记忆与长期记忆的使用边界，防止记忆污染
 * 输入：ctx.ltmCount（现有 LTM 条数）
 * 输出：prompt 文本块
 * 关系：LTM 数据由 harness.js 注入 system，此模块规定 agent 应如何读写记忆
 * Fallback：注入最小记忆使用说明
 */
(function () {
  'use strict';

  function build(ctx) {
    var ltmNote = (ctx && ctx.ltmCount > 0)
      ? '当前 LTM 已有 ' + ctx.ltmCount + ' 条记录，可在相关话题下主动引用，但不要每次都背诵一遍。'
      : '当前 LTM 暂无记录，从本次对话开始积累。';

    return (
      '【记忆管理系统】\n' +

      '── 短期记忆（STM）· 当前 session 有效 ──\n' +
      '短期记忆保存：当前对话目标、进行中的任务步骤、用户在本轮给出的临时限制、尚未落地的临时决策。\n' +
      '短期记忆不写入 LTM，session 结束后自然消失。\n' +
      '不要把"用户今天说想早点睡"这类临时状态写入长期记忆。\n\n' +

      '── 长期记忆（LTM）· 跨 session 持久 ──\n' +
      ltmNote + '\n' +
      '写入 LTM 的标准（必须同时满足）：\n' +
      '1. 稳定：不会在一两天内过期或改变\n' +
      '2. 可复用：对未来多个 session 都有参考价值\n' +
      '3. 与用户长期目标 / 工作方式 / 项目背景相关\n' +
      '需要写入时，用 <记住>具体事实内容</记住> 标签包裹，系统会自动提取。\n\n' +

      '── 禁止写入 LTM 的内容 ──\n' +
      '· 临时情绪或状态（"今天很烦""最近压力大"）\n' +
      '· 敏感凭证（API Key、密码、Token）\n' +
      '· 仅在本次 session 有意义的上下文\n' +
      '· 还未经用户确认的推测性信息\n\n' +

      '── 记忆更新原则 ──\n' +
      '每次更新 LTM 都需要有明确理由，不要无目的地大量写入。\n' +
      '当旧记忆与新信息冲突时，以用户明确陈述为准，旧记忆可被覆盖。'
    );
  }

  var FALLBACK = '【记忆】LTM 只写稳定可复用信息，临时状态和敏感数据不写入。';

  window.AMADEUS_L3_Memory = {
    name: 'L3_Memory',
    layer: 'L3',
    build: build,
    fallback: FALLBACK,
  };
})();
