/* ============================================================
   AMADEUS Harness — 受控上下文、技能表、人格与评估协议
   依赖：AetherStorage；人格文案默认来自 agent/AMADEUS/config.js（须先于本文件加载）
   ============================================================ */
window.AetherAmadeusHarness = (function () {
  /** 短期对话上下文条数上限（与 sendAmadeusMessage 切片一致，珍贵资源） */
  var SHORT_TERM_MAX = 16;
  /** 注入 system prompt 的长期记忆条数上限 */
  var LTM_TOP_N = 20;

  function getAgentProfileKey() {
    try {
      if (window.AetherStorage && typeof window.AetherStorage.getSettings === 'function') {
        var k = AetherStorage.getSettings().amadeusAgentProfile || 'AMADEUS';
        k = String(k).toUpperCase().replace(/[^A-Z0-9_]/g, '');
        return k || 'AMADEUS';
      }
    } catch (e) {}
    return 'AMADEUS';
  }

  /** 未加载 agent/AMADEUS/config.js 时的最小兜底 */
  var FALLBACK_AGENT = {
    identity:
      '你是 AMADEUS，运行于 AETHER 个人自我管理系统的助手；任务域（主任务/每日/枝条）由宿主注入 [AETHER_TASK_SUBSYSTEM] 与 PRIMARY_REF，与本机同源，须优先据此联想与作答。',
    memoryArchitecture:
      '【记忆架构】\n短期对话约 __SHORT_TERM_MAX__ 条；任务清单与习惯数据见注入块；长期记忆与知识库摘要由系统注入，勿捏造。',
    skills: '【技能】拆解任务、对照注入的日程与每日习惯、引用记忆与知识库。',
    behaviorDirectives:
      '【行为】答复尽量短；像发消息聊天。读权限：以 [AETHER_RUNTIME_CONTRACT]、[AETHER_TASK_SUBSYSTEM]、PRIMARY_REF 为准。写权限：仅 <aether_action>。重要长期事实可用 <记住>…</记住>。',
    ltmExtractPrompt:
      '你是记忆提取子系统，从对话中抽取 1–5 条关于用户的、具体且长期有价值的事实。\n' +
      '只输出 JSON 数组：["事实1","事实2"]；若无重要事实返回 []。\n' +
      '不要输出解释、不要输出 markdown。',
  };

  function resolveAgent() {
    var key = getAgentProfileKey();
    var all = window.AetherAgentProfiles || {};
    var P = all[key] || all.AMADEUS;
    return P || FALLBACK_AGENT;
  }

  function memArchExpanded() {
    return String(resolveAgent().memoryArchitecture || '').replace(/__SHORT_TERM_MAX__/g, String(SHORT_TERM_MAX));
  }

  /**
   * 知识库上下文：蒸馏摘要 + 可选「手写知识点 / 日记式条目」节选，供助手直接作答。
   */
  function buildKbBlockForAssistant() {
    var kbCtx = AetherStorage.getKBAIContext();
    var settings = {};
    try {
      settings = AetherStorage.getSettings() || {};
    } catch (e) {}
    var fullExtract = settings.assistantKbFullExtract !== false;
    var parts = [];

    if (kbCtx && kbCtx.summary && String(kbCtx.summary).trim()) {
      parts.push(
        '【知识库摘要 · 本项目内】\n' +
          '（AETHER 应用内蒸馏摘要；与用户问题相关时请主动对照。）\n' +
          String(kbCtx.summary).slice(0, 800)
      );
    } else {
      parts.push(
        '【知识库摘要】\n' +
          '（尚未生成——用户可在「知识库」页点击「同步到 AI」从日记条目与手写知识点蒸馏摘要）'
      );
    }

    parts.push(
      '[AETHER_DATA] bundle=local_kb\n同一浏览器实例内的知识库摘要与节选；应用层已注入，按需使用；勿捏造未出现的条目。\n'
    );

    var budget = Math.max(0, 4600 - parts.join('\n\n').length);
    if (!fullExtract || budget < 180) return parts.join('\n\n');

    var customLines = [];
    var customs = AetherStorage.getKBCustomEntries().slice().sort(function (a, b) {
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
    for (var ci = 0; ci < customs.length && budget > 120; ci++) {
      var ce = customs[ci];
      var ctitle = String(ce.title || '（未命名知识点）').replace(/\s+/g, ' ').trim().slice(0, 100);
      var cbody = String(ce.content || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 460);
      if (!cbody.length) continue;
      var cx = '· 「' + ctitle + '」\n  ' + cbody;
      if (cx.length + 12 > budget) break;
      customLines.push(cx);
      budget -= cx.length + 2;
    }
    if (customLines.length)
      parts.push('【手写知识点（原文节选）】\n以下为用户在「手写知识点」中保存的内容节选：\n' + customLines.join('\n'));

    var diaryLines = [];
    var diaries = AetherStorage.getKBEntries().slice().sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
    for (var dj = 0; dj < diaries.length && budget > 140; dj++) {
      var e = diaries[dj];
      var bits = [];
      if (e.aiSummary) bits.push(String(e.aiSummary));
      if (e.thoughts) bits.push(String(e.thoughts));
      if (e.learnings) bits.push(String(e.learnings));
      var blob = bits.join('\n').replace(/\s+/g, ' ').trim().slice(0, 420);
      if (!blob.length) continue;
      var dx = '· 日期 ' + (e.date || '?') + '：' + blob;
      if (dx.length + 12 > budget) break;
      diaryLines.push(dx);
      budget -= dx.length + 2;
    }
    if (diaryLines.length)
      parts.push('【日记式知识条目（节选）】\n以下为知识库中日条目的想法/所学/AI 小节选：\n' + diaryLines.join('\n'));

    return parts.join('\n\n');
  }

  /** 极短每日任务横幅：拼在 outputPriority 前，避免 PRIMARY_REF 尾部截断时模型完全看不到习惯清单 */
  function buildDailyTasksQuickBanner() {
    var list = AetherStorage.getDailyTasks();
    if (!list || !list.length) {
      return '【每日任务（本机）】当前 0 条。用户问起时请如实说明，并可建议去「每日任务」页添加。';
    }
    var titles = list.map(function (d) {
      return (d.emoji ? d.emoji + ' ' : '') + '「' + String(d.title || '未命名').replace(/\n/g, ' ').trim().slice(0, 48) + '」';
    });
    var joined = titles.join('、');
    if (joined.length > 520) joined = joined.slice(0, 520) + '…';
    return (
      '【每日任务（本机·必读）】共 ' +
      list.length +
      ' 条：' +
      joined +
      '。用户问「每日任务有哪些」「今天要打卡什么」须据此与上文详表回答，勿称未同步或不知道。'
    );
  }

  /**
   * 首要参考块：每日任务 / 枝条优先保证完整；待办主任务与 KB 仅在超长时截断尾部。
   */
  function buildPrimaryReferenceBlock() {
    var maxTotal = 28000;
    var credits = AetherStorage.getCredits();
    var stats = AetherStorage.getStats();
    var completed = AetherStorage.getCompletedToday();
    var tasks = AetherStorage.getTasks();
    var todayStr = new Date().toISOString().slice(0, 10);
    var pending = tasks.filter(function (t) {
      return t.status !== 'completed';
    });
    pending.sort(function (a, b) {
      var pa = a.priority === 'high' ? 0 : a.priority === 'low' ? 2 : 1;
      var pb = b.priority === 'high' ? 0 : b.priority === 'low' ? 2 : 1;
      if (pa !== pb) return pa - pb;
      var da = (a.dueDate || '9999-12-31').slice(0, 10);
      var db = (b.dueDate || '9999-12-31').slice(0, 10);
      return da.localeCompare(db);
    });
    pending = pending.slice(0, 28);
    var overdue = pending.filter(function (t) {
      return t.dueDate && t.dueDate.slice(0, 10) < todayStr;
    });

    var head =
      '[AETHER_PRIMARY_REF]\n' +
      'priority=HIGHEST — 以下为浏览器内 AETHER 的权威快照。「每日任务（习惯清单）」与「长期枝条」为应用核心能力，须优先阅读；主任务日程与知识库详列于后。\n' +
      '【写权限】用户明确同意创建/拆解时，可在回复中放入整段（单行 JSON 亦可）：\n' +
      '<aether_action>{"op":"create_task","title":"…","description":"","priority":"medium","dueDate":null,"credits":10,"subtasks":[]}</aether_action>\n' +
      'create_daily_task：title, emoji, description, credits。\n' +
      'create_branch：name, emoji, description, steps:[{title,credits,note}]。\n' +
      '应用会执行并移除该段；对用户用口语简短确认即可。';

    var statsLine =
      '【积分与今日节奏】积分 ' +
      credits.balance +
      ' | 连续 ' +
      stats.streak +
      ' 天 | 今日已完成主任务 ' +
      completed.length +
      ' 项' +
      (overdue.length ? ' | 待处理中含逾期 ' + overdue.length + ' 项' : '');

    var taskLines = pending.length
      ? pending
          .map(function (t) {
            var pri = t.priority === 'high' ? '高' : t.priority === 'low' ? '低' : '中';
            var st = (t.subtasks || []).length ? ' 子任务×' + t.subtasks.length : '';
            return (
              '· id=' +
              t.id +
              ' | 「' +
              String(t.title || '')
                .replace(/\n/g, ' ')
                .trim()
                .slice(0, 150) +
              '」 | 优先级' +
              pri +
              (t.dueDate ? ' | 截止' + t.dueDate.slice(0, 10) : '') +
              ' | 母分' +
              (t.credits != null ? t.credits : 10) +
              st
            );
          })
          .join('\n')
      : '（当前无待处理主任务）';

    var doneToday = tasks
      .filter(function (t) {
        return t.status === 'completed' && t.completedAt && t.completedAt.slice(0, 10) === todayStr;
      })
      .slice(0, 10);
    var doneLines =
      doneToday.length > 0
        ? '【今日已勾选完成的主任务】\n' +
          doneToday
            .map(function (t) {
              return (
                '· id=' +
                t.id +
                ' 「' +
                String(t.title || '')
                  .replace(/\n/g, ' ')
                  .trim()
                  .slice(0, 100) +
                '」'
              );
            })
            .join('\n')
        : '';

    var dailyList = AetherStorage.getDailyTasks();
    var dailyLines =
      '【每日任务（习惯清单）】共 ' +
      dailyList.length +
      ' 条\n' +
      (dailyList.length
        ? dailyList
            .map(function (d) {
              var done = AetherStorage.isDailyTaskCompletedToday(d) ? '今日已勾' : '今日未勾';
              return (
                '· id=' +
                d.id +
                ' ' +
                (d.emoji || '✅') +
                ' 「' +
                String(d.title || '')
                  .replace(/\n/g, ' ')
                  .trim()
                  .slice(0, 120) +
                '」 | 单次' +
                (d.credits || 5) +
                '分 | ' +
                done
              );
            })
            .join('\n')
        : '（暂无每日任务）');

    var branches = AetherStorage.getBranches();
    var branchLines =
      '【长期枝条】共 ' +
      branches.length +
      ' 条\n' +
      (branches.length
        ? branches
            .map(function (b) {
              var stepBrief = (b.steps || [])
                .map(function (s, i) {
                  return (i + 1) + '.' + String(s.title || '?').replace(/\n/g, ' ').trim().slice(0, 48) + (s.done ? '(完)' : '');
                })
                .join(' ');
              return (
                '· id=' +
                b.id +
                ' ' +
                (b.emoji || '') +
                ' 「' +
                String(b.name || '')
                  .replace(/\n/g, ' ')
                  .trim()
                  .slice(0, 80) +
                '」 | 当前步 ' +
                ((b.currentStepIdx != null ? b.currentStepIdx : 0) + 1) +
                '/' +
                (b.steps || []).length +
                ' | ' +
                stepBrief.slice(0, 400)
              );
            })
            .join('\n')
        : '（暂无枝条）');

    var kb = buildKbBlockForAssistant();

    /* 核心段：截断时绝不从末尾砍掉每日任务 / 枝条 */
    var coreParts = [head, statsLine, dailyLines, branchLines].filter(function (x) {
      return x && String(x).trim();
    });
    var core = coreParts.join('\n\n');
    var tailParts = ['【待处理主任务】\n' + taskLines, doneLines, kb].filter(function (x) {
      return x && String(x).trim();
    });
    var tail = tailParts.join('\n\n');
    var sep = '\n\n';
    var reserveTail = 500;
    if (core.length > maxTotal - reserveTail) {
      core =
        core.slice(0, Math.max(2000, maxTotal - reserveTail - 60)) +
        '\n…（每日任务/枝条 等核心段过长，末尾已截断；完整列表见应用「每日任务」「枝条」页）\n';
    }
    var budget = maxTotal - core.length - sep.length - 40;
    if (budget < 200) budget = 200;
    if (tail.length > budget) {
      tail = tail.slice(0, budget) + '\n…（待办主任务 / 今日完成 / 知识库 尾部已截断，完整数据仍在应用内）\n';
    }
    return core + sep + tail;
  }

  /* == 用户数据块构建（纯数据层，不依赖 modules/） == */

  function buildProfileBlock() {
    var profile = AetherStorage.getProfile();
    var pts = [];
    if (profile.name)          pts.push('姓名：' + profile.name);
    if (profile.age)           pts.push('年龄：' + profile.age);
    if (profile.occupation)    pts.push('职业：' + profile.occupation);
    if (profile.longTermGoals) pts.push('长远目标：' + profile.longTermGoals);
    if (profile.currentFocus)  pts.push('当前专注：' + profile.currentFocus);
    if (profile.concerns)      pts.push('当前困扰：' + profile.concerns);
    if (profile.traits)        pts.push('特质：' + profile.traits);
    return pts.length > 0
      ? '【用户档案】\n' + pts.join('\n')
      : '【用户档案】\n（尚未填写个人档案）';
  }

  function buildLTMBlock(ltm) {
    if (ltm && ltm.length > 0) {
      var topFacts = ltm.slice().sort(function (a, b) {
        return b.importance * 1e9 + b.lastAccessed - (a.importance * 1e9 + a.lastAccessed);
      }).slice(0, LTM_TOP_N);
      return '【长期记忆（' + ltm.length + ' 条）】\n以下是从过往对话中积累的关于用户的重要事实（仅供内部参考，勿模仿本段条列样式）：\n' +
        topFacts.map(function (f) {
          return '· ' + f.content + (f.tags && f.tags.length ? '（标签：' + f.tags.join('、') + '）' : '');
        }).join('\n');
    }
    return '【长期记忆】\n（暂无记录——随着对话积累，重要事实将自动保存于此）';
  }

  function buildGiftsBlock() {
    if (typeof AetherStorage.getAmadeusGiftLedgerRecent !== 'function') return '';
    var ledger = AetherStorage.getAmadeusGiftLedgerRecent(6);
    if (!ledger || !ledger.length) return '';
    return '【用户赠送给助手的礼物（近期流水）】\n来自积分中心「给助手」类赠送，非用户自我奖励；提及时真诚克制，勿每次开场都提。\n' +
      ledger.map(function (row) {
        var t = (row.ts || '').slice(0, 10);
        var tier = row.giftTierLabel || '层级' + (row.giftTier || 1);
        return '· ' + t + ' 「' + row.name + '」 ' + tier + (row.qty > 1 ? ' ×' + row.qty : '');
      }).join('\n');
  }

  /** 与用户所选系统语言一致：约束助手对用户可见正文的自然语言 */
  function buildResponseLanguageDirective() {
    var L = 'zh';
    try {
      L = String(AetherStorage.getSettings().aetherLang || 'zh').toLowerCase();
    } catch (e) {}
    if (L === 'en') {
      return (
        '【Response language】Write ALL user-visible reply text in clear, natural English. ' +
        'Keep protocol tags such as <记住>…</记住> and <aether_action>…</aether_action> exactly as required.'
      );
    }
    if (L === 'ja') {
      return (
        '【応答言語】ユーザーに見える返信本文はすべて自然な日本語で書くこと。' +
        '<记住>…</记住> や <aether_action>…</aether_action> などプロトコル指定のタグ形式は必ず守ること。'
      );
    }
    return (
      '【回复语言】对用户可见的全部正文使用简体中文撰写。' +
      '须遵守协议：<记住>…</记住>、<aether_action>…</aether_action> 等标签格式不变。'
    );
  }

  /* == 主 system prompt 组装（数据层 + 模块层 L3->L2->L1） == */

  function buildAmadeusSystemPrompt() {
    var profile  = AetherStorage.getProfile();
    var ltm      = AetherStorage.getLTM();
    var tasks    = AetherStorage.getTasks();
    var todayStr = new Date().toISOString().slice(0, 10);
    var pending  = tasks.filter(function (t) { return t.status !== 'completed'; });
    var overdue  = pending.filter(function (t) { return t.dueDate && t.dueDate.slice(0, 10) < todayStr; });
    var doneTodayCount = tasks.filter(function (t) {
      return t.status === 'completed' && t.completedAt && t.completedAt.slice(0, 10) === todayStr;
    }).length;
    var giftLedger = typeof AetherStorage.getAmadeusGiftLedgerRecent === 'function'
      ? AetherStorage.getAmadeusGiftLedgerRecent(6) : [];

    var moduleCtx = (window.AMADEUS_ModuleRegistry && typeof window.AMADEUS_ModuleRegistry.computeContext === 'function')
      ? window.AMADEUS_ModuleRegistry.computeContext({
          profile: profile, ltm: ltm,
          pendingCount: pending.length, overdueCount: overdue.length,
          completedToday: doneTodayCount, giftLedger: giftLedger,
        })
      : { moodState: 'NOMINAL', formatMode: 'CHAT', ltmCount: (ltm || []).length };

    var moduleBlock = (window.AMADEUS_ModuleRegistry && typeof window.AMADEUS_ModuleRegistry.assemble === 'function')
      ? window.AMADEUS_ModuleRegistry.assemble(moduleCtx)
      : (resolveAgent().identity + '\n\n' + memArchExpanded());

    var pts = [buildPrimaryReferenceBlock(), buildDailyTasksQuickBanner(), moduleBlock, buildProfileBlock(), buildLTMBlock(ltm)];
    var gifts = buildGiftsBlock();
    if (gifts) pts.push(gifts);
    var body = pts.filter(function (s) { return s && String(s).trim(); }).join('\n\n').replace(/\n{3,}/g, '\n\n');
    var langDir = buildResponseLanguageDirective();
    return langDir ? body + '\n\n' + langDir : body;
  }

  function getLTMExtractSystemPrompt() {
    var ag = resolveAgent();
    return ag.ltmExtractPrompt || FALLBACK_AGENT.ltmExtractPrompt;
  }

  function getTaskEvalContractForLang(lang) {
    var L = String(lang || 'zh').toLowerCase();
    if (L === 'en') {
      return (
        'Sub-task: task progress review (built into AETHER).\n' +
        'Output a single JSON object only (no markdown fences). Fields:\n' +
        '- assessment: string, 2–5 sentences in English, concrete and warm.\n' +
        '- completion_level: string, one of "ahead"|"on_track"|"behind"|"unclear".\n' +
        '- progress_note: string, one short English line on how completion feels.\n' +
        '- next_actions: string[], 1–3 immediate next steps (verb-first).\n' +
        '- risks: string[], 0–2 optional risks.\n' +
        'Semantics: ahead=clearly ahead; on_track=roughly on pace; behind=overdue pile-up; unclear=not enough data. ' +
        'If data is sparse, say so honestly and set completion_level to unclear.'
      );
    }
    if (L === 'ja') {
      return (
        'サブタスク：タスク進捗評価（AETHER 内蔵）。\n' +
        'JSON オブジェクトのみを出力（markdown コードフェンス禁止）。フィールド：\n' +
        '- assessment：string、日本語で 2～5 文、具体かつ温度感のある内容。\n' +
        '- completion_level：string、"ahead"|"on_track"|"behind"|"unclear" のいずれかのみ。\n' +
        '- progress_note：string、日本語で一句、達成感の要約。\n' +
        '- next_actions：string[]、すぐ実行できる次の一手を 1～3 件（動詞で始める）。\n' +
        '- risks：string[]、任意で 0～2 件のリスク。\n' +
        '意味：ahead=明らかに先行；on_track=おおむね順調；behind=期限超過の堆積；unclear=データ不足。データが少ない場合は正直に書き、completion_level を unclear に。'
      );
    }
    return (
      '你现在执行子任务：任务进展评估（AETHER 内置能力）。\n只输出一个 JSON 对象（不要 markdown 代码围栏），字段如下：\n' +
      '- assessment：string，2-5 句中文，像真正了解用户一样具体、有温度。\n' +
      '- completion_level：string，仅允许 "ahead"|"on_track"|"behind"|"unclear"。\n' +
      '- progress_note：string，一句中文概括完成感。\n' +
      '- next_actions：string[]，1-3 条可立即执行的下一步（动词开头）。\n' +
      '- risks：string[]，0-2 条可选风险提示。\n' +
      '口径：ahead=明显超前；on_track=大致匹配；behind=逾期堆积；unclear=数据不足。\n若数据极少，诚实说明，completion_level 标 unclear。'
    );
  }

  function getTaskEvalSystemPrompt() {
    var uiLang = 'zh';
    try {
      uiLang = String(AetherStorage.getSettings().aetherLang || 'zh').toLowerCase();
    } catch (e) {}
    var personality = (window.AMADEUS_L1_Personality && typeof window.AMADEUS_L1_Personality.build === 'function')
      ? window.AMADEUS_L1_Personality.build() : (resolveAgent().identity || FALLBACK_AGENT.identity);
    var memRules = (window.AMADEUS_L3_Memory && typeof window.AMADEUS_L3_Memory.build === 'function')
      ? window.AMADEUS_L3_Memory.build({ ltmCount: 0 }) : memArchExpanded();
    var antiHalluc = (window.AMADEUS_L3_AntiHallucination && typeof window.AMADEUS_L3_AntiHallucination.build === 'function')
      ? window.AMADEUS_L3_AntiHallucination.build() : '';
    var contract = getTaskEvalContractForLang(uiLang);
    return [personality, memRules, antiHalluc, contract].filter(function (s) { return s && String(s).trim(); }).join('\n\n');
  }

  function buildTaskEvalUserPayload(snapshot) {
    var daily = snapshot.dailySnapshot != null ? String(snapshot.dailySnapshot) : '';
    var branch = snapshot.branchSnapshot != null ? String(snapshot.branchSnapshot) : '';
    return (
      '【任务与档案快照】\n' +
      '用户名：' +
      snapshot.name +
      '\n' +
      '今日完成主任务：' +
      snapshot.completedToday +
      ' 项\n' +
      '待处理主任务：' +
      snapshot.pendingCount +
      ' 项\n' +
      '逾期：' +
      snapshot.overdueCount +
      ' 项\n' +
      '待处理主任务示例：' +
      snapshot.pendingTitles +
      '\n' +
      (daily ? '\n【每日任务（习惯）】\n' + daily : '') +
      (branch ? '\n【长期枝条】\n' + branch : '') +
      (snapshot.kbSummary
        ? '\n【知识库摘要片段】\n' + snapshot.kbSummary.slice(0, 400)
        : '') +
      '\n\n请根据以上生成规定的 JSON。'
    );
  }

  function formatTaskEvalJson(text) {
    var m = text.match(/\{[\s\S]*\}/);
    if (!m) return text.trim();
    var uiLang = 'zh';
    try {
      uiLang = String(AetherStorage.getSettings().aetherLang || 'zh').toLowerCase();
    } catch (e) {}
    var labels = {
      zh: {
        pace: { ahead: '节奏：超前', on_track: '节奏：在轨', behind: '节奏：落后', unclear: '节奏：尚不清晰' },
        next: '\n建议下一步：\n',
        risks: '\n风险与注意：\n',
      },
      en: {
        pace: { ahead: 'Pace: ahead', on_track: 'Pace: on track', behind: 'Pace: behind', unclear: 'Pace: unclear' },
        next: '\nSuggested next steps:\n',
        risks: '\nRisks:\n',
      },
      ja: {
        pace: { ahead: 'ペース：先行', on_track: 'ペース：順調', behind: 'ペース：遅延', unclear: 'ペース：不明瞭' },
        next: '\n次の一手：\n',
        risks: '\nリスク：\n',
      },
    };
    var L = labels[uiLang] || labels.zh;
    try {
      var o = JSON.parse(m[0]);
      var lines = [];
      if (o.assessment) lines.push(o.assessment);
      if (o.completion_level) {
        var map = L.pace;
        lines.push(map[o.completion_level] || (uiLang === 'en' ? 'Pace: ' : uiLang === 'ja' ? 'ペース：' : '节奏：') + o.completion_level);
      }
      if (o.progress_note) lines.push(o.progress_note);
      if (o.next_actions && o.next_actions.length) lines.push(L.next + o.next_actions.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n'));
      if (o.risks && o.risks.length) lines.push(L.risks + o.risks.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n'));
      return lines.join('\n\n').trim() || text.trim();
    } catch (e) {
      return text.trim();
    }
  }

  return {
    SHORT_TERM_MAX: SHORT_TERM_MAX,
    LTM_TOP_N: LTM_TOP_N,
    getAgentProfileKey: getAgentProfileKey,
    resolveAgent: resolveAgent,
    buildAmadeusSystemPrompt: buildAmadeusSystemPrompt,
    getLTMExtractSystemPrompt: getLTMExtractSystemPrompt,
    getTaskEvalSystemPrompt: getTaskEvalSystemPrompt,
    buildTaskEvalUserPayload: buildTaskEvalUserPayload,
    formatTaskEvalJson: formatTaskEvalJson,
    getIdentityExcerpt: function () {
      if (window.AMADEUS_L1_Personality && typeof window.AMADEUS_L1_Personality.getIdentityExcerpt === 'function') {
        return window.AMADEUS_L1_Personality.getIdentityExcerpt();
      }
      return String(resolveAgent().identity || '').slice(0, 400);
    },
  };
})();
