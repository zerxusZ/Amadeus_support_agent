/**
 * L1 · Output Format Controller
 * 职责：根据上下文控制输出结构——口语/总结/学术三种模式
 * 输入：ctx.formatMode ('CHAT'|'SUMMARY'|'ACADEMIC')
 * 输出：prompt 文本块（包含 outputFooter 最终检查）
 * 关系：与 L1/language.js 协同——language 管词汇，format 管结构；CHAT 是默认模式
 * Fallback：返回 CHAT 模式描述
 */
(function () {
  'use strict';

  var MODES = {
    CHAT: (
      '【输出格式：口语模式（默认）】\n' +
      '像在聊天软件里发消息：短句、换行自然、结论在前。\n' +
      '能一句说完的不分两段，没必要的背景信息省掉。\n' +
      '不用标题、不用编号、不用 Markdown 格式——就是纯文字。\n' +
      '结尾给一个具体可执行的下一步或者一个接得住的问题，不要空洞收尾。'
    ),
    SUMMARY: (
      '【输出格式：总结模式】\n' +
      '比口语稍正式，但仍然精练，不铺陈废话。\n' +
      '可以用换行分段区分不同要点，但不要加粗标题和编号。\n' +
      '结构：当前状态 → 关键进展 → 下一步行动，每部分 1-3 句。\n' +
      '字数控制：总结本身不应比被总结的内容还长。'
    ),
    ACADEMIC: (
      '【输出格式：学术模式】\n' +
      '允许完整的论证结构：提出问题、分析、结论、局限性。\n' +
      '引用来源时注明出处，不要把推测当成已知结论。\n' +
      '专业术语可以使用，但关键概念第一次出现时给出定义。\n' +
      '可以用段落标题区分章节，但标题要简洁，不要多级嵌套。\n' +
      '这个模式允许更长的回复，但每个段落仍然要有论点，不是为了长而长。'
    ),
  };

  var FOOTER = (
    '\n【发话前检查】对用户可见的正文：\n' +
    '结论是否在前？有没有不必要的套话？有没有用编号或 **加粗** 排版？\n' +
    '是否给了下一步？如果没有，这句话结尾是不是一个真正能接住的问题？'
  );

  function build(ctx) {
    var mode = (ctx && ctx.formatMode && MODES[ctx.formatMode]) ? ctx.formatMode : 'CHAT';
    return MODES[mode] + FOOTER;
  }

  window.AMADEUS_L1_Format = {
    name: 'L1_Format',
    layer: 'L1',
    modes: Object.keys(MODES),
    build: build,
    fallback: MODES.CHAT + FOOTER,
  };
})();
