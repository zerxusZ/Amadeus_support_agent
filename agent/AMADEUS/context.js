/**
 * AETHER 助手 — 应用层上下文契约（非 prompt 说服，而是请求载荷中的机器可读声明 + Claude 结构化 system）
 * 由 sendAmadeusMessage 在调用 LLM 前强制拼装；模型无法通过「拒答话术」绕过已注入的数据通道。
 */
(function () {
  'use strict';

  var CONTRACT_VERSION = '2';

  /**
   * 机器可读契约：声明数据来源、授权范围与边界（本浏览器实例 / 本地存储）。
   */
  function machineContractBlock() {
    return (
      '[AETHER_RUNTIME_CONTRACT v=' +
      CONTRACT_VERSION +
      ']\n' +
      'scope=local_app_only\n' +
      'chat_history_channel=messages_array\n' +
      'task_subsystem_layers=main_tasks,daily_habits,branches_long_term\n' +
      'task_read_channel=injected_system_blocks_same_origin_as_app\n' +
      'task_mutate_channel=aether_action_json_tag_only\n' +
      'context_sources=task_subsystem_binding,primary_ref,ltm,kb_entries,kb_summary,tasks,daily_tasks,branches,credits_stats,profile,gifts_ledger_optional,attachments_optional,scholar_openalex_optional\n' +
      'context_priority=RUNTIME_CONTRACT_then_TASK_SUBSYSTEM_BINDING_then_PRIMARY_REF_then_messages_then_identity_blocks\n' +
      'granted_side_effects=aether_action_tag;ops=create_task,create_daily_task,create_branch\n' +
      'policy=must_use_injected_context_and_messages_when_relevant\n' +
      'policy=must_not_claim_no_access_to_above_sources\n' +
      'policy=when_user_topic_overlaps_tasks_schedules_habits_deadlines_or_branches_reason_from_injected_task_layers_first\n' +
      'boundary=must_not_invent_facts_absent_from_injected_payload_or_messages\n' +
      'boundary=must_not_claim_access_outside_this_app_instance\n' +
      'boundary=must_not_claim_task_mutation_without_parseable_aether_action_in_assistant_reply\n' +
      '[/AETHER_RUNTIME_CONTRACT]'
    );
  }

  /**
   * 任务子系统绑定层：声明助手与本机任务域的读写语义（与 UI 同源数据），插在契约之后、人格与 PRIMARY_REF 之前。
   */
  function buildTaskSubsystemBindingBlock() {
    var nPending = 0;
    var nDaily = 0;
    var nBranch = 0;
    try {
      if (window.AetherStorage) {
        var tasks = AetherStorage.getTasks() || [];
        nPending = tasks.filter(function (t) {
          return t.status !== 'completed';
        }).length;
        nDaily = (AetherStorage.getDailyTasks() || []).length;
        nBranch = (AetherStorage.getBranches() || []).length;
      }
    } catch (e) {}
    return (
      '[AETHER_TASK_SUBSYSTEM v=1]\n' +
      'embedding=same_browser_instance_as_user_AETHER_app\n' +
      'layers=main_tasks(日程母任务与子任务);daily_habits(重复打卡);branches(多步长期枝条)\n' +
      'read_grant=full_read_of_injected_task_layers_and_counts;deny_claims_of_no_sync_when_payload_present\n' +
      'write_grant=create_or_extend_via_aether_action_only;no_direct_localstorage_narration\n' +
      'counts_snapshot=pending_main_tasks:' +
      nPending +
      ';daily_routines:' +
      nDaily +
      ';branches:' +
      nBranch +
      '\n' +
      '[/AETHER_TASK_SUBSYSTEM]\n\n' +
      '【任务子系统 · 底层绑定】你是 AETHER 任务能力在对话侧的嵌入端，与用户看到的「任务 / 每日任务 / 枝条」页同源。凡涉及清单、习惯、打卡、逾期、拆步、拉枝条，须先把判断锚在已注入的 PRIMARY_REF 与上表快照上，再补充常识。读取权限：system 中已写入的本机任务类数据一律视为你可用的真实状态。修改权限：仅允许通过 <aether_action> 白名单 JSON 触发宿主写库；未出现可解析标签则不得在话术里假装已创建或已勾选。'
    );
  }

  /**
   * 将契约、主 system（人格+项目数据）、动态块组装为各提供商可用的 system 字段。
   * @param {object} cfg resolveConfig 结果，需含 provider
   * @param {string} mainPrompt buildAmadeusSystemPrompt() 全文
   * @param {string} scholarAddon
   * @param {string} attachAddon
   * @returns {string|Array<{type:string,text:string}>}
   */
  function assembleSystemForLLM(cfg, mainPrompt, scholarAddon, attachAddon) {
    var contract = machineContractBlock();
    var taskBind = buildTaskSubsystemBindingBlock();
    var main = String(mainPrompt || '').trim();
    var sch = String(scholarAddon || '').trim();
    var att = String(attachAddon || '').trim();

    if (cfg && cfg.provider === 'claude') {
      var blocks = [
        { type: 'text', text: contract },
        { type: 'text', text: taskBind },
        { type: 'text', text: main },
      ];
      if (sch) blocks.push({ type: 'text', text: sch });
      if (att) blocks.push({ type: 'text', text: att });
      return blocks;
    }

    return (
      contract +
      '\n\n---\n\n' +
      taskBind +
      '\n\n---\n\n' +
      main +
      (sch ? '\n\n---\n\n' + sch : '') +
      (att ? '\n\n---\n\n' + att : '')
    );
  }

  /** OpenAI 兼容：system 只能是字符串 */
  function flattenSystemForOpenAICompat(systemInput) {
    if (typeof systemInput === 'string') return systemInput;
    if (Array.isArray(systemInput)) {
      return systemInput
        .map(function (b) {
          return typeof b === 'object' && b && b.text != null ? String(b.text) : String(b);
        })
        .join('\n\n---\n\n');
    }
    return String(systemInput || '');
  }

  window.AetherAmadeusContext = {
    CONTRACT_VERSION: CONTRACT_VERSION,
    machineContractBlock: machineContractBlock,
    buildTaskSubsystemBindingBlock: buildTaskSubsystemBindingBlock,
    assembleSystemForLLM: assembleSystemForLLM,
    flattenSystemForOpenAICompat: flattenSystemForOpenAICompat,
  };
})();
