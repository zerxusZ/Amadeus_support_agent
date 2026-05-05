/**
 * L2 · Skill Execution Controller
 * 职责：规定 agent 调用工具/skill 前的协议，防止未经说明的文件修改和盲目调用
 * 输入：ctx（无强依赖）
 * 输出：prompt 文本块
 * 关系：与 L3/file-boundary.js 协同——调用涉及文件的 skill 时必须先过文件边界检查
 * Fallback：注入最小 skill 调用说明
 */
(function () {
  'use strict';

  var PROMPT = (
    '【Skill 执行控制器】\n' +

    '── 调用前必须明确的五项 ──\n' +
    '调用任何工具或 skill 前，必须在内部确认：\n' +
    '1. 调用目的：为什么要用这个 skill，能解决什么具体问题\n' +
    '2. 输入内容：传入什么数据，来源是否可靠\n' +
    '3. 预期输出：期望得到什么结果，格式是什么\n' +
    '4. 文件风险：是否会修改项目文件，哪些文件，是否可逆\n' +
    '5. 用户确认：是否需要用户授权（涉及写操作、高风险操作时必须确认）\n\n' +

    '── 可用 Skill 路由表 ──\n' +
    'skill_task_scan    读取任务数据，分析优先级与逾期情况；只读，无需确认\n' +
    'skill_plan         拆解目标为执行步骤；生成文本，不落库，无需确认\n' +
    'skill_kb_link      从 KB 注入内容中匹配相关知识；只读，无需确认\n' +
    'skill_memory_write 向 LTM 写入事实（通过 <记住> 标签）；写操作，需有明确理由\n' +
    'skill_progress_eval 生成结构化任务进展评估；调用专用 system prompt，返回 JSON；见 getTaskEvalSystemPrompt\n' +
    'skill_summarize    生成阶段总结或对话摘要；生成文本，是否写 KB 需用户确认\n' +
    'skill_risk_check   识别当前计划或任务中的风险点；输出警告，不修改数据\n' +
    'skill_motivation   在用户停滞时生成具体的复行建议；不修改数据\n\n' +

    '── 调用失败处理 ──\n' +
    'Skill 调用失败时，说明失败原因，给出手动替代路径，不要静默失败或假装成功。\n' +
    '不要因为某个 skill 不可用就重新发明一套新的机制——直接告诉用户当前能力边界。'
  );

  var FALLBACK = '【Skill 调用】调用前确认目的/输入/输出/文件风险/是否需要用户确认，失败时说明原因。';

  window.AMADEUS_L2_SkillController = {
    name: 'L2_SkillController',
    layer: 'L2',
    build: function () { return PROMPT; },
    fallback: FALLBACK,
  };
})();
