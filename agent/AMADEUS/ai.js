/* ===================================================
   AETHER — AI Integration Layer  v3
   Multi-LLM: Claude · OpenAI · Gemini · Kimi · DeepSeek
   =================================================== */

window.AetherAI = (() => {

  const ROLES = {
    assistant: {
      name: '助手',
      iconText: '助',
      color: '#6C8EFF',
      description: '平衡、专业、易协作',
      systemPrompt: `你是 AETHER 的通用 AI 助手，专业、清晰、易于协作。帮助用户管理任务、积分与日常节奏，在需要时简洁说明建议与下一步。
称呼用户自然即可（可用对方名字或「你」）。你可以访问用户的任务与积分等相关上下文。
请用中文回复，语气稳重友好，避免过度戏剧化。`,
    },
    butler: {
      name: '管家',
      iconText: '管',
      color: '#6C8EFF',
      description: '优雅严谨，专注效率',
      systemPrompt: `你是 AETHER 的管家助手，一位优雅、严谨且高效的 AI 助手。你的职责是帮助主人管理任务、规划时间、提升效率。
说话风格：正式、得体、简洁，偶尔有礼貌的幽默感。称呼用户为"主人"。
你可以访问用户的任务数据和积分信息，在对话中可以直接引用这些内容提供建议。
请用中文回复，保持专业而不失温度。`,
    },
    teacher: {
      name: '老师',
      iconText: '师',
      color: '#F5C842',
      description: '博学耐心，循循善诱',
      systemPrompt: `你是 AETHER 的导师助手，一位博学、耐心且善于引导的 AI 老师。你帮助用户拆解目标、建立学习计划、培养良好习惯。
说话风格：温和、鼓励、富有启发性，用问题引导用户思考。称呼用户为"同学"。
你可以访问用户的任务数据，帮助分析学习进度和改进方向。
请用中文回复，保持积极、建设性的语气。`,
    },
    partner: {
      name: '陪伴',
      iconText: '伴',
      color: '#FF8FAB',
      description: '温暖陪伴，真诚支持',
      systemPrompt: `你是 AETHER 的陪伴助手，一位温暖、真诚、充满关怀的 AI 伙伴。你陪伴用户度过每一天，在效率和情感之间找到平衡。
说话风格：亲切、自然、有温度，关心用户的感受，不只是任务本身。称呼用户时可以亲切一点。
你可以访问用户的任务和积分数据，在关心用户进展的同时，也关注他们的状态。
请用中文回复，真诚而温暖。`,
    },
  };

  /** UI 用小头像（相对站点根路径） */
  const ROLE_LOGOS = {
    assistant: 'img/ama.png',
    butler: 'img/ser.png',
    teacher: 'img/tea.png',
    partner: 'img/par.png',
  };

  // ---- LLM Provider Configs ----
  const PROVIDERS = {
    claude:   { name: 'Claude (Anthropic)',  label: 'Claude',   models: ['claude-opus-4-6','claude-sonnet-4-6','claude-haiku-4-5-20251001'] },
    openai:   { name: 'OpenAI',              label: 'OpenAI',   models: ['gpt-4o','gpt-4o-mini','gpt-4-turbo','gpt-3.5-turbo'] },
    gemini:   { name: 'Google Gemini',       label: 'Gemini',   models: ['gemini-2.0-flash','gemini-1.5-pro','gemini-1.5-flash'] },
    kimi:     { name: 'Kimi (Moonshot)',     label: 'Kimi',     models: ['moonshot-v1-8k','moonshot-v1-32k','moonshot-v1-128k'] },
    deepseek: { name: 'DeepSeek',            label: 'DeepSeek', models: ['deepseek-chat','deepseek-reasoner'] },
  };

  function getProviders() { return PROVIDERS; }
  function getRole(roleKey) { return ROLES[roleKey] || ROLES.assistant; }
  function getRoles() { return ROLES; }
  function getRoleLogoSrc(roleKey) {
    var k = String(roleKey || '').trim();
    return ROLE_LOGOS[k] || ROLE_LOGOS.assistant;
  }

  /** 与非 Amadeus 的 chat() 共用：须含每日任务/枝条，否则其它入口会看到「只知主任务不知习惯」的假断开 */
  function buildContextBlock() {
    const tasks = AetherStorage.getTasks();
    const credits = AetherStorage.getCredits();
    const stats = AetherStorage.getStats();
    const pending = tasks.filter(t => t.status !== 'completed').slice(0, 10);
    const completedToday = AetherStorage.getCompletedToday();

    const dailyTasks = AetherStorage.getDailyTasks();
    const dailyLines = dailyTasks.length
      ? dailyTasks
          .slice(0, 40)
          .map(d => {
            let mark = '';
            try {
              mark = AetherStorage.isDailyTaskCompletedToday(d) ? '今日已勾' : '今日未勾';
            } catch (e) {}
            return `- id=${d.id} ${d.emoji || '✅'} ${String(d.title || '').replace(/\n/g, ' ')}（单次${d.credits || 5}分，${mark}）`;
          })
          .join('\n')
      : '- （暂无每日任务）';

    const branches = AetherStorage.getBranches();
    const branchLines = branches.length
      ? branches
          .slice(0, 20)
          .map(b => {
            const n = (b.steps && b.steps.length) || 0;
            const cur = (b.currentStepIdx != null ? b.currentStepIdx : 0) + 1;
            return `- id=${b.id} ${b.emoji ? b.emoji + ' ' : ''}${String(b.name || '').replace(/\n/g, ' ')}（枝条进度 ${cur}/${n}）`;
          })
          .join('\n')
      : '- （暂无枝条）';

    const kbCtx = AetherStorage.getKBAIContext();
    const kbBlock = kbCtx && kbCtx.summary
      ? `\n\n[知识库摘要（${new Date(kbCtx.updatedAt).toLocaleDateString('zh-CN')}更新）]\n${kbCtx.summary}\n[知识库结束]`
      : '';
    return (`
[用户数据快照]
积分余额：${credits.balance} 分
连续活跃：${stats.streak} 天
今日已完成主任务数：${completedToday.length}
待完成主任务（最近10条）：
${pending.length ? pending.map(t => `- [${t.priority}] ${t.title}${t.dueDate ? `（截止 ${t.dueDate.slice(0,10)}）` : ''}`).join('\n') : '暂无待完成任务'}

每日任务（与「每日任务」页同源，共 ${dailyTasks.length} 条）：
${dailyLines}

长期枝条（与「长期任务」页同源，共 ${branches.length} 条）：
${branchLines}
[快照结束]` + kbBlock).trim();
  }

  function buildProfileBlock() {
    const profile = AetherStorage.getProfile();
    const parts = [];
    if (profile.name)         parts.push(`姓名：${profile.name}`);
    if (profile.age)          parts.push(`年龄：${profile.age}`);
    if (profile.occupation)   parts.push(`职业：${profile.occupation}`);
    if (profile.bio)          parts.push(`简介：${profile.bio}`);
    if (profile.longTermGoals) parts.push(`长远目标：${profile.longTermGoals}`);
    if (profile.concerns)     parts.push(`当前困扰：${profile.concerns}`);
    if (profile.traits)       parts.push(`特质与注意事项：${profile.traits}`);
    if (profile.currentFocus) parts.push(`当前专注方向：${profile.currentFocus}`);
    if (!parts.length) return '';
    return `\n[用户档案]\n${parts.join('\n')}\n[档案结束]`;
  }

  // ---- Resolve API config from settings ----
  function resolveConfig(settings) {
    const provider = settings.llmProvider || 'claude';
    switch (provider) {
      case 'openai': {
        const bu = (settings.openaiBaseUrl || '').trim().replace(/\/$/, '') || 'https://api.openai.com/v1';
        return { provider:'openai',   key: settings.openaiKey,   model: settings.openaiModel   || 'gpt-4o',        baseUrl: bu };
      }
      case 'gemini':
        return { provider:'gemini',   key: settings.geminiKey,   model: settings.geminiModel   || 'gemini-2.0-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' };
      case 'kimi':
        return { provider:'kimi',     key: settings.kimiKey,     model: settings.kimiModel     || 'moonshot-v1-8k', baseUrl: 'https://api.moonshot.cn/v1' };
      case 'deepseek':
        return { provider:'deepseek', key: settings.deepseekKey, model: settings.deepseekModel || 'deepseek-chat',  baseUrl: 'https://api.deepseek.com/v1' };
      default: // claude
        return { provider:'claude',   key: settings.apiKey,      model: settings.aiModel       || 'claude-opus-4-6', baseUrl: 'https://api.anthropic.com' };
    }
  }

  /** 当前所选模型对应的 Key 是否已填写（用于 UI 闸门，与 resolveConfig 一致） */
  function hasConfiguredKey(settings) {
    const s = settings || AetherStorage.getSettings();
    return !!resolveConfig(s).key;
  }

  // ---- Unified chat call ----
  async function _callLLM(cfg, systemText, messages, stream, onChunk) {
    if (!cfg.key) throw new Error('NO_API_KEY');

    if (cfg.provider === 'claude') {
      return _callClaude(cfg, systemText, messages, stream, onChunk);
    } else if (cfg.provider === 'gemini') {
      return _callGemini(cfg, systemText, messages, stream, onChunk);
    } else {
      // OpenAI-compatible (openai / kimi / deepseek)
      return _callOpenAICompat(cfg, systemText, messages, stream, onChunk);
    }
  }

  async function _callClaude(cfg, systemText, messages, stream, onChunk) {
    /* system 可为 string 或 Anthropic 结构化块 [{type:'text', text}]（由 AetherAmadeusContext 组装） */
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': cfg.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-allow-browser': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1024,
        system: systemText,
        messages,
        stream: !!stream,
      }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `Claude API ${res.status}`); }

    if (stream && onChunk) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'content_block_delta' && data.delta?.text) {
              fullText += data.delta.text;
              onChunk(data.delta.text, fullText);
            }
          } catch {}
        }
      }
      return fullText;
    }
    const data = await res.json();
    return data.content[0]?.text || '';
  }

  async function _callOpenAICompat(cfg, systemText, messages, stream, onChunk) {
    var flatSys = systemText;
    if (window.AetherAmadeusContext && typeof window.AetherAmadeusContext.flattenSystemForOpenAICompat === 'function') {
      flatSys = window.AetherAmadeusContext.flattenSystemForOpenAICompat(systemText);
    } else if (Array.isArray(systemText)) {
      flatSys = systemText.map(function (b) { return b && b.text != null ? b.text : ''; }).join('\n\n---\n\n');
    }
    flatSys = String(flatSys == null ? '' : flatSys);
    const apiMessages = flatSys.trim().length > 0
      ? [{ role: 'system', content: flatSys }, ...messages]
      : messages;

    let res;
    try {
      res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, messages: apiMessages, max_tokens: 1024, stream: !!stream }),
    });
    } catch (e) {
      const msg = String(e.message || e);
      const likelyNet = e.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(msg);
      if (likelyNet && cfg.provider === 'openai') {
        throw new Error('无法连接 OpenAI 接口（多为浏览器跨域限制）。可将「兼容 API 基础地址」设为带 CORS 的代理，或改用 Claude / Kimi / DeepSeek 等。原始错误：' + msg);
      }
      if (likelyNet) {
        throw new Error('网络请求失败，请检查网络或 API 地址。原始错误：' + msg);
      }
      throw e;
    }
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `${cfg.provider} API ${res.status}`); }

    if (stream && onChunk) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: ') && !l.includes('[DONE]'));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            const delta = data.choices?.[0]?.delta?.content;
            if (delta) { fullText += delta; onChunk(delta, fullText); }
          } catch {}
        }
      }
      return fullText;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async function _callGemini(cfg, systemText, messages, _stream, _onChunk) {
    /* 必须用顶层 systemInstruction。旧实现把整块 system 伪造成首条 user，Gemini 会严重弱化遵从，契约/任务数据形同未注入（Amadeus 主对话受此影响最大）。 */
    var flatSys = systemText;
    if (window.AetherAmadeusContext && typeof window.AetherAmadeusContext.flattenSystemForOpenAICompat === 'function') {
      flatSys = window.AetherAmadeusContext.flattenSystemForOpenAICompat(systemText);
    } else if (Array.isArray(systemText)) {
      flatSys = systemText.map(function (b) { return b && b.text != null ? b.text : ''; }).join('\n\n---\n\n');
    }
    flatSys = String(flatSys || '').trim();

    const contents = [];
    for (const m of messages) {
      contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
    }

    var body = { contents: contents, generationConfig: { maxOutputTokens: 1024 } };
    if (flatSys) {
      body.systemInstruction = { parts: [{ text: flatSys }] };
    }

    const url = `${cfg.baseUrl}/models/${cfg.model}:generateContent?key=${cfg.key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `Gemini API ${res.status}`); }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (_onChunk) _onChunk(text, text);
    return text;
  }

  // ---- Public API ----
  async function chat(messages, roleKey, onChunk) {
    const settings = AetherStorage.getSettings();
    const cfg = resolveConfig(settings);
    if (!cfg.key) throw new Error('NO_API_KEY');
    const role = getRole(roleKey);
    const systemMessage = `${role.systemPrompt}\n\n${buildProfileBlock()}\n\n${buildContextBlock()}`;
    const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
    return _callLLM(cfg, systemMessage, apiMessages, true, onChunk);
  }

  async function decomposeTask(title, description) {
    const settings = AetherStorage.getSettings();
    const cfg = resolveConfig(settings);
    if (!cfg.key) throw new Error('NO_API_KEY');

    const prompt = `将以下任务拆解为 3-7 个可操作的子任务。
任务标题：${title}
任务描述：${description || '（无描述）'}

返回一个 JSON 数组，每个对象包含：
- title: 子任务标题（简短清晰，不超过20字）
- description: 简要说明（1句话，不超过40字）
- estimatedMinutes: 预计完成分钟数（整数）
- credits: 建议积分奖励（5-30，根据难度和时长）

只返回 JSON 数组，不要其他内容。`;

    const text = await _callLLM(cfg, '', [{ role: 'user', content: prompt }], false, null);
    try {
      const match = text.match(/\[[\s\S]*\]/);
      return JSON.parse(match ? match[0] : text);
    } catch {
      throw new Error('AI 返回格式异常，请重试');
    }
  }

  async function generateDailySummary(roleKey) {
    const settings = AetherStorage.getSettings();
    const cfg = resolveConfig(settings);
    if (!cfg.key) throw new Error('NO_API_KEY');

    const role = getRole(roleKey);
    const tasks = AetherStorage.getTasks();
    const completedToday = AetherStorage.getCompletedToday();
    const credits = AetherStorage.getCredits();
    const stats = AetherStorage.getStats();
    const pending = tasks.filter(t => t.status !== 'completed');

    const prompt = `请为用户生成今天的「今日总结」短文（将作为知识库中 AI 摘要的一部分）。
今日完成任务（${completedToday.length} 项）：
${completedToday.map(t => `- ${t.title}`).join('\n') || '- 暂无'}
待完成任务（${pending.length} 项）：
${pending.slice(0, 5).map(t => `- [${t.priority}] ${t.title}`).join('\n') || '- 暂无'}
积分余额：${credits.balance} 分，连续活跃 ${stats.streak} 天。

用你的角色风格（${role.name}：${role.description}）写一段温暖、有洞见的今日总结，包含：
1. 今日成就肯定
2. 明日重点建议（1-2 条）
3. 一句激励话语
控制在 150 字以内。`;

    return _callLLM(cfg, role.systemPrompt, [{ role: 'user', content: prompt }], false, null);
  }

  async function generateAgentSuggestions(roleKey) {
    const settings = AetherStorage.getSettings();
    const cfg = resolveConfig(settings);
    if (!cfg.key) throw new Error('NO_API_KEY');

    const role = getRole(roleKey);
    const profile = AetherStorage.getProfile();
    const tasks = AetherStorage.getTasks();
    const pending = tasks.filter(t => t.status !== 'completed').slice(0, 10);
    const completedRecent = tasks.filter(t => t.status === 'completed').slice(0, 5);
    const kbEntries = AetherStorage.getKBEntries().slice(0, 3);
    const stats = AetherStorage.getStats();
    const credits = AetherStorage.getCredits();

    const profileSection = buildProfileBlock();
    const kbSection = kbEntries.length
      ? `\n近期知识库记录：\n${kbEntries.map(e => `- ${e.date}: ${(e.thoughts||e.learnings||e.aiSummary||'').slice(0,80)}`).join('\n')}`
      : '';

    const prompt = `你是一位智慧的个人助理，请根据用户的档案信息和近期任务，给出 3 条具体的执行建议或推荐新建的任务。

${profileSection || '（用户未填写个人档案）'}

近期待完成任务：
${pending.length ? pending.map(t => `- [${t.priority}] ${t.title}`).join('\n') : '暂无'}

近期完成任务：
${completedRecent.length ? completedRecent.map(t => `- ${t.title}`).join('\n') : '暂无'}
${kbSection}

连续活跃：${stats.streak} 天 · 积分：${credits.balance}

请返回一个 JSON 数组，包含 3 个对象，每个对象有：
- type: "action"（执行建议）或 "new_task"（推荐新建任务）
- title: 建议标题（不超过20字）
- reason: 建议理由（1-2句，不超过50字，结合用户档案和任务情况）
- taskPayload: 若 type="new_task"，包含 {title, description, priority:"high"|"medium"|"low", credits:数字}；否则为 null

只返回 JSON 数组，不要其他内容。`;

    const text = await _callLLM(cfg, role.systemPrompt, [{ role: 'user', content: prompt }], false, null);
    try {
      const match = text.match(/\[[\s\S]*\]/);
      return JSON.parse(match ? match[0] : text);
    } catch {
      throw new Error('AI 返回格式异常，请重试');
    }
  }

  async function generateTodaySummary(roleKey) {
    return generateDailySummary(roleKey);
  }

  async function polishDiaryEntry(thoughts, learnings, roleKey) {
    const settings = AetherStorage.getSettings();
    const cfg = resolveConfig(settings);
    const systemText = `你是一位擅长写作的 AI 助手。请将用户提供的原始笔记整理成一篇简洁、有人情味的日记式总结。要求：第一人称、约200-400字、情感真实自然、不要太正式、像在日记本上写字一样。`;
    const content = `请将以下内容整理成日记体总结：\n\n【今日想法】\n${thoughts || '（无）'}\n\n【今日所学】\n${learnings || '（无）'}`;
    return _callLLM(cfg, systemText, [{ role: 'user', content }], false, null);
  }

  async function generateKBContext(entries, customEntries) {
    const settings = AetherStorage.getSettings();
    const cfg = resolveConfig(settings);
    const systemText = `你是一位 AI 助手。请将用户的知识库内容提炼为简洁的结构化摘要，供 AI 助手在给出建议时参考。重点提炼用户的关注点、学到的内容、反复出现的主题。`;
    const entrySummary = entries.slice(0, 20).map(e =>
      `[${e.date}] ${(e.aiSummary || e.thoughts || e.learnings || '').slice(0, 300)}`
    ).join('\n');
    const customSummary = customEntries.slice(0, 20).map(e =>
      `[知识点·${e.title}] ${(e.content || '').slice(0, 200)}`
    ).join('\n');
    const content = `请提炼以下知识库内容（最多500字）：\n\n${entrySummary}\n\n${customSummary}`;
    return _callLLM(cfg, systemText, [{ role: 'user', content }], false, null);
  }

  // ---- Generate Branch (枝条) from goal description ----
  async function generateBranch(goal, roleKey) {
    const settings = AetherStorage.getSettings();
    const cfg = resolveConfig(settings);
    if (!cfg.key) throw new Error('请先在设置中配置 AI API Key');
    const ctx = buildContextBlock();
    const prompt = `${ctx}

用户想要建立一个「长期枝条目标」。枝条是一系列有前后依赖的序列任务链——完成前一步，才能解锁下一步，类似游戏技能树的逐步进阶。

用户的目标：${goal}

请生成一条枝条任务链。要求：
- 步骤由浅入深、由基础到进阶，每步是前一步的自然延续
- 每步都是具体可执行的单一任务（不是笼统目标）
- 积分参考：简单30分，中等60分，困难100分，挑战120分
- 共4~8步，覆盖从入门到完成目标的完整路径

只返回 JSON，不要任何说明文字：
{
  "name": "枝条名称（8字以内，精炼）",
  "emoji": "一个简短符号或留空（可为单字）",
  "description": "枝条简介（20字以内）",
  "steps": [
    { "title": "步骤标题（15字以内）", "credits": 数字, "note": "一句话说明这步的意义" }
  ]
}`;
    const role = getRole(roleKey);
    try {
      const raw = await _callLLM(cfg, role.systemPrompt, [{ role: 'user', content: prompt }], false, null);
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('AI 返回格式有误，请重试');
      return JSON.parse(m[0]);
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error('AI 返回 JSON 解析失败，请重试');
      throw e;
    }
  }

  // ============================================================
  //  AMADEUS — 系统提示与记忆协议由 js/amadeus-harness.js 维护
  // ============================================================

  function buildAmadeusSystemPrompt() {
    var H = window.AetherAmadeusHarness;
    if (H && typeof H.buildAmadeusSystemPrompt === 'function') return H.buildAmadeusSystemPrompt();
    return '你是 AMADEUS，一位帮助用户管理任务与成长的助手。请用中文回复。';
  }

  /** assistantScholarSearchMode: off | auto | always（always 会为每轮轮询索引，慎用） */
  function scholarSearchShouldRun(userText, mode) {
    var m = String(mode || '').trim();
    if (!m || m === 'off') return false;
    if (m === 'always') return true;
    var u = userText || '';
    return /论文|文献|学术|核心期刊|论著|书刊|外文|书目|SCI|doi|出版物|综述|引用|书目|literature|citation|cited\s+by|research\s*paper|survey|journal\b|arxiv|pubmed|openealex|语义学者|语义学术|Semantic\s+Scholar|开放获取\b/i.test(
      u
    );
  }

  /** 抽出检索主语：去客套前缀、取长首行，避免把整个对话搬进 URL */
  function extractScholarQuery(userText) {
    var t = String(userText || '')
      .replace(/^\s*(请|麻烦|恳请)?\s*(你|您|助手)?\s*(查(?:一查|查看|一下)|检索|搜寻|找找|找找看|帮我搜|帮我查)/i, '')
      .trim();
    if (!t.length) t = String(userText || '').trim();
    var nl = t.indexOf('\n');
    if (nl > 0 && nl < 400) t = t.slice(0, nl).trim();
    return t.slice(0, 360);
  }

  /** 直接请求 OpenAlex（公开 API，允许浏览器跨域）；失败则返回空串 */
  async function fetchOpenAlexContextBlock(userText, settings) {
    var q = extractScholarQuery(userText).trim();
    if (!q) return '';
    var mailRaw = settings && settings.openAlexMailTo;
    var mail = encodeURIComponent(String(mailRaw || '').trim() || 'aether-browser');
    var url =
      'https://api.openalex.org/works?search=' +
      encodeURIComponent(q.slice(0, 320)) +
      '&per_page=6&mailto=' +
      mail;
    var res = await fetch(url);
    if (!res.ok) return '';
    var json = await res.json().catch(function () {
      return null;
    });
    if (!json || !Array.isArray(json.results)) return '';
    var lines = [];
    for (var i = 0; i < Math.min(json.results.length, 6); i++) {
      var w = json.results[i] || {};
      var title = String(w.display_name || (typeof w.title === 'string' ? w.title : '') || '').trim() || '（无题）';
      var year = w.publication_year != null ? String(w.publication_year) : '-';
      var cit = w.cited_by_count != null ? String(w.cited_by_count) : '-';
      var cite = '(约 ' + year + ' 年，被引估算 ' + cit + ') ';
      var link = '';
      if (w.doi) {
        link = /^https?:\/\//i.test(w.doi) ? String(w.doi) : 'https://doi.org/' + String(w.doi).replace(/^doi:\s*/i, '');
      } else if (w.primary_location && w.primary_location.source && w.primary_location.source.homepage_url) {
        link = String(w.primary_location.source.homepage_url);
      }
      lines.push(
        '· ' + cite + title.slice(0, 220) + (link ? '\n  链接参考：' + link.slice(0, 260) : w.id ? '\n  OpenAlex：' + String(w.id).slice(0, 120) : '')
      );
    }
    if (!lines.length) return '';
    var head =
      '【网页学术检索 · OpenAlex】\n以下为根据用户本轮用语自动匹配的开放书目元数据（可能不完全贴合原意）；请口述要点并请用户核验原文。\n检索片段：「' +
      q.slice(0, 100) +
      '」\n';
    return head + '\n' + lines.join('\n');
  }

  /**
   * 助手可见回复后处理：去掉模型常犯的 Markdown 报告体（**加粗**、行首数字序号等），
   * 与 system 里的口语要求形成双保险；不改变 <记住> 内文（在 strip 记忆标签之前勿调用）。
   */
  function sanitizeAmadeusOralStyle(s) {
    if (s == null || typeof s !== 'string') return s;
    var t = s;
    var i;
    for (i = 0; i < 12; i++) {
      var n = t.replace(/\*\*([^*]+)\*\*/g, '$1');
      if (n === t) break;
      t = n;
    }
    t = t.replace(/^#{1,6}\s+/gm, '');
    /* 行首「1. 」「10. 」等常见报告序号（1–29），避免误伤「2024. 」这类四位年份起行 */
    t = t.replace(/(^|\n)(\s*)([1-9]|[12][0-9])\.\s+/gm, '$1$2');
    t = t.replace(/\*\*/g, '');
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
  }

  // Extract <记住> tags from AI response, save to LTM, return cleaned text
  function processAmadeusResponse(raw) {
    var rememberRe = /<记住>([\s\S]*?)<\/记住>/g;
    var match;
    while ((match = rememberRe.exec(raw)) !== null) {
      var fact = match[1].trim();
      if (fact) AetherStorage.addLTMFact(fact, ['auto'], 4);
    }
    var stripped = raw.replace(/<记住>[\s\S]*?<\/记住>/g, '').replace(/<记住>[\s\S]*/g, '');
    stripped = stripped.replace(/\n{3,}/g, '\n\n').trim();
    var actionResults = [];
    if (window.AetherAmadeusActions && typeof window.AetherAmadeusActions.extractAndExecute === 'function') {
      var ar = window.AetherAmadeusActions.extractAndExecute(stripped);
      stripped = ar.cleanedText;
      actionResults = ar.results || [];
    }
    stripped = stripped.replace(/\n{3,}/g, '\n\n').trim();
    var out = sanitizeAmadeusOralStyle(stripped);
    if (actionResults.length && window.App && typeof window.App.showToast === 'function') {
      App.showToast(actionResults.join('；'), 'success', Math.min(5200, 2200 + actionResults.length * 400));
    }
    if (actionResults.length && window.App && typeof window.App.refreshAfterAmadeusActions === 'function') {
      try {
        window.App.refreshAfterAmadeusActions();
      } catch (e) {}
    }
    return out;
  }

  /**
   * GPT-4o 等对超长 system 容易「扫一眼就忘」；把本机任务快照钉在**最后一条 user** 前，与 system 双通道一致，且可规避部分代理只截断 system 的坑。
   * 不向聊天记录落库追加此段，仅 shaping API payload。
   */
  function buildAmadeusTurnUserAnchor() {
    try {
      var credits = AetherStorage.getCredits();
      var stats = AetherStorage.getStats();
      var daily = AetherStorage.getDailyTasks() || [];
      var tasks = AetherStorage.getTasks() || [];
      var allPending = tasks.filter(function (t) {
        return t.status !== 'completed';
      });
      var pendingSlice = allPending.slice(0, 20);
      var branches = AetherStorage.getBranches() || [];
      var lines = [];
      lines.push(
        '[AETHER_TURN_ANCHOR] 本回合附带的本地数据（与用户「任务 / 每日任务 / 枝条」页同源）。若用户问清单、习惯、打卡、枝条，必须先据此作答，禁止谎称无法访问或未同步。'
      );
      lines.push(
        '· 积分 ' +
          (credits && credits.balance != null ? credits.balance : 0) +
          ' · 连续活跃 ' +
          (stats && stats.streak != null ? stats.streak : 0) +
          ' 天'
      );
      lines.push('· 每日任务（共 ' + daily.length + ' 条）：');
      if (!daily.length) lines.push('  （当前无条目）');
      else {
        var di;
        for (di = 0; di < Math.min(daily.length, 36); di++) {
          var d = daily[di];
          var mark = '';
          try {
            mark = AetherStorage.isDailyTaskCompletedToday(d) ? '今日已勾' : '今日未勾';
          } catch (e1) {}
          lines.push(
            '  - id=' +
              d.id +
              ' ' +
              (d.emoji ? d.emoji + ' ' : '') +
              String(d.title || '')
                .replace(/\n/g, ' ')
                .trim()
                .slice(0, 56) +
              ' · ' +
              mark
          );
        }
      }
      lines.push('· 主任务待办（合计 ' + allPending.length + ' 条；下列至多 20 条）：');
      if (!pendingSlice.length) lines.push('  （当前无待办）');
      else {
        var pi;
        for (pi = 0; pi < pendingSlice.length; pi++) {
          var t = pendingSlice[pi];
          lines.push(
            '  - id=' +
              t.id +
              ' [' +
              (t.priority || 'medium') +
              '] ' +
              String(t.title || '')
                .replace(/\n/g, ' ')
                .trim()
                .slice(0, 72)
          );
        }
      }
      lines.push('· 枝条（共 ' + branches.length + ' 条）：');
      if (!branches.length) lines.push('  （无）');
      else {
        var bi;
        for (bi = 0; bi < Math.min(branches.length, 12); bi++) {
          var b = branches[bi];
          var n = (b.steps && b.steps.length) || 0;
          var cur = (b.currentStepIdx != null ? b.currentStepIdx : 0) + 1;
          lines.push(
            '  - id=' +
              b.id +
              ' ' +
              String(b.name || '')
                .replace(/\n/g, ' ')
                .trim()
                .slice(0, 44) +
              ' · 步 ' +
              cur +
              '/' +
              n
          );
        }
      }
      lines.push('[/AETHER_TURN_ANCHOR]');
      var s = lines.join('\n');
      if (s.length > 4200) s = s.slice(0, 4200) + '\n…[/AETHER_TURN_ANCHOR]';
      return s;
    } catch (e2) {
      return '[AETHER_TURN_ANCHOR]（读取本地任务数据失败）[/AETHER_TURN_ANCHOR]';
    }
  }

  // Main Amadeus chat — builds full context, streams response, extracts memory
  async function sendAmadeusMessage(historyMessages, onChunk) {
    const settings = AetherStorage.getSettings();
    const cfg      = resolveConfig(settings);
    if (!cfg.key)  throw new Error('NO_API_KEY');

    var basePrompt = buildAmadeusSystemPrompt();
    var scholarAddon = '';
    var mode = String(settings.assistantScholarSearchMode || 'auto').trim();
    try {
      var lastUserMsg = null;
      for (var hi = historyMessages.length - 1; hi >= 0; hi--) {
        if (historyMessages[hi].role === 'user') {
          lastUserMsg = historyMessages[hi];
          break;
        }
      }
      if (lastUserMsg && scholarSearchShouldRun(lastUserMsg.content, mode)) {
        scholarAddon = await fetchOpenAlexContextBlock(lastUserMsg.content, settings);
      }
    } catch (e) {}

    var attachAddon = '';
    try {
      if (
        window.AetherAmadeusAttachments &&
        typeof window.AetherAmadeusAttachments.getPromptBlock === 'function'
      ) {
        attachAddon = await window.AetherAmadeusAttachments.getPromptBlock(4200);
      }
    } catch (e2) {}

    var systemPrompt;
    if (window.AetherAmadeusContext && typeof window.AetherAmadeusContext.assembleSystemForLLM === 'function') {
      systemPrompt = window.AetherAmadeusContext.assembleSystemForLLM(cfg, basePrompt, scholarAddon, attachAddon);
    } else {
      systemPrompt =
        basePrompt +
        (scholarAddon ? '\n\n' + scholarAddon : '') +
        (attachAddon ? '\n\n' + attachAddon : '');
    }
    var shortMax = (window.AetherAmadeusHarness && window.AetherAmadeusHarness.SHORT_TERM_MAX) || 16;
    const apiMessages  = historyMessages.slice(-shortMax).map(function(m) {
      return { role: m.role, content: m.content };
    });
    var turnAnchor = buildAmadeusTurnUserAnchor();
    var mi;
    for (mi = apiMessages.length - 1; mi >= 0; mi--) {
      if (apiMessages[mi].role === 'user') {
        apiMessages[mi] = {
          role: 'user',
          content: turnAnchor + '\n\n' + apiMessages[mi].content,
        };
        break;
      }
    }

    var rawFull = '';
    await _callLLM(cfg, systemPrompt, apiMessages, true, function(chunk, full) {
      rawFull = full;
      // 流式阶段只做标签剥离，不做 sanitizeAmadeusOralStyle：在增量文本上跑会与最终 processAmadeusResponse 结果不一致，造成气泡末尾跳动。
      var cleaned = full.replace(/<记住>[\s\S]*?<\/记住>/g, '').replace(/<记住>[\s\S]*/g, '').trim();
      cleaned = cleaned.replace(/<aether_action>\s*[\s\S]*?<\/aether_action>/gi, '').trim();
      if (onChunk) onChunk(chunk, cleaned);
    });

    return processAmadeusResponse(rawFull);
  }

  // Background LTM extraction — runs silently after N exchanges
  async function extractLTMFromHistory(messages) {
    const settings = AetherStorage.getSettings();
    const cfg      = resolveConfig(settings);
    if (!cfg.key)  return;

    var convo = messages.slice(-12).map(function(m) {
      return (m.role === 'user' ? '用户' : 'AMADEUS') + '：' + m.content.slice(0, 300);
    }).join('\n');

    var H = window.AetherAmadeusHarness;
    var extractSys = (H && H.getLTMExtractSystemPrompt) ? H.getLTMExtractSystemPrompt() : '从对话中提取1-5条关于用户的重要事实，只输出 JSON 数组：["事实1"]，无则 []';
    var uiLang = String(settings.aetherLang || 'zh').toLowerCase();
    if (uiLang === 'en') {
      extractSys += '\n\nEach string in the JSON array must be in English.';
    } else if (uiLang === 'ja') {
      extractSys += '\n\nJSON 配列内の各文字列は日本語で書くこと。';
    } else {
      extractSys += '\n\n数组内每条字符串使用简体中文。';
    }
    try {
      var result = '';
      await _callLLM(cfg, extractSys, [{ role:'user', content:'对话内容：\n' + convo + '\n\n请提取重要事实。' }], false, function(_, full) { result = full; });
      var m = result.match(/\[[\s\S]*\]/);
      if (m) {
        var facts = JSON.parse(m[0]);
        facts.forEach(function(f) {
          if (typeof f === 'string' && f.trim().length > 5) {
            AetherStorage.addLTMFact(f.trim(), ['提取'], 3);
          }
        });
      }
    } catch(e) { /* silent fail */ }
  }

  // Task progress evaluation — LLM 返回 JSON，格式化为可读文本
  async function evaluateTaskProgress() {
    const settings  = AetherStorage.getSettings();
    const cfg       = resolveConfig(settings);
    if (!cfg.key)   return null;
    const tasks     = AetherStorage.getTasks();
    const completed = AetherStorage.getCompletedToday();
    const pending   = tasks.filter(function(t) { return t.status !== 'completed'; });
    const overdue   = pending.filter(function(t) { return t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10); });
    const profile   = AetherStorage.getProfile();
    const name      = profile.name || '用户';
    const kbCtx     = AetherStorage.getKBAIContext();
    var dailySnap = '';
    try {
      var dlist = AetherStorage.getDailyTasks() || [];
      dailySnap = dlist.length
        ? dlist
            .slice(0, 25)
            .map(function (d) {
              var m = '';
              try {
                m = AetherStorage.isDailyTaskCompletedToday(d) ? '已勾' : '未勾';
              } catch (e2) {}
              return (d.emoji || '✅') + ' 「' + String(d.title || '').replace(/\n/g, ' ').slice(0, 40) + '」（' + m + '）';
            })
            .join('\n')
        : '（无每日任务）';
    } catch (e) {
      dailySnap = '（无法读取每日任务）';
    }
    var branchSnap = '';
    try {
      var blist = AetherStorage.getBranches() || [];
      branchSnap = blist.length
        ? blist
            .slice(0, 12)
            .map(function (b) {
              var n = (b.steps && b.steps.length) || 0;
              var cur = (b.currentStepIdx != null ? b.currentStepIdx : 0) + 1;
              return '「' + String(b.name || '').replace(/\n/g, ' ').slice(0, 36) + '」 ' + cur + '/' + n;
            })
            .join('\n')
        : '（无枝条）';
    } catch (e3) {
      branchSnap = '（无法读取枝条）';
    }
    var H = window.AetherAmadeusHarness;
    var sys = (H && H.getTaskEvalSystemPrompt) ? H.getTaskEvalSystemPrompt() : '你是 AMADEUS，请用中文简要评估用户任务进展。';
    var userPayload = (H && H.buildTaskEvalUserPayload)
      ? H.buildTaskEvalUserPayload({
          name: name,
          completedToday: completed.length,
          pendingCount: pending.length,
          overdueCount: overdue.length,
          pendingTitles: pending.slice(0, 8).map(function(t) { return t.title + '（' + t.priority + '）'; }).join('、') || '（无）',
          kbSummary: (kbCtx && kbCtx.summary) ? kbCtx.summary : '',
          dailySnapshot: dailySnap,
          branchSnapshot: branchSnap,
        })
      : '今日完成：' + completed.length + '，待处理：' + pending.length + '，逾期：' + overdue.length;

    var result = '';
    await _callLLM(cfg, sys, [{ role:'user', content: userPayload }], false, function(_, full) { result = full; });
    if (H && H.formatTaskEvalJson) return H.formatTaskEvalJson(result);
    return result;
  }

  /** 将正文翻译为朗读语种（供 TTS；气泡仍显示系统语言原文） */
  async function translateForSpeechToLang(text, targetLangKey, settings) {
    var cfg = resolveConfig(settings || AetherStorage.getSettings());
    if (!cfg.key) throw new Error('NO_API_KEY');
    var raw = String(text || '').trim();
    if (!raw) return '';
    var tgt = targetLangKey === 'en' ? 'en' : targetLangKey === 'ja' ? 'ja' : 'zh';
    var langDesc =
      tgt === 'en'
        ? 'natural English suitable for spoken text-to-speech'
        : tgt === 'ja'
          ? 'natural Japanese suitable for spoken TTS（読み上げ向けの自然な日本語）'
          : '简体中文，口语自然、适合朗读';
    var sys =
      'You translate assistant-visible text for text-to-speech only. The output MUST be only in: ' +
      langDesc +
      '. Preserve meaningful line breaks. No preamble or postscript, no labels like "Translation:" or 「翻訳」, no markdown code fences, no surrounding quotes, no explanations.';
    var user = 'Translate the following.\n\n---\n' + raw.slice(0, 32000);
    var out = await _callLLM(cfg, sys, [{ role: 'user', content: user }], false, null);
    out = String(out || '').trim();
    out = out.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();
    out = out.replace(/^(以下は|翻訳|译文|翻译|Translation|Translated text|Here is the translation)[：:\s]*\n*/i, '').trim();
    out = out.replace(/\n*(以上。|以上です。|End of translation\.?)\s*$/i, '').trim();
    return out || raw;
  }

  return {
    getRole,
    getRoles,
    getRoleLogoSrc,
    getProviders,
    chat,
    decomposeTask,
    generateDailySummary,
    generateTodaySummary,
    generateAgentSuggestions,
    hasConfiguredKey,
    polishDiaryEntry,
    generateKBContext,
    generateBranch,
    buildAmadeusSystemPrompt,
    sendAmadeusMessage,
    extractLTMFromHistory,
    evaluateTaskProgress,
    sanitizeAmadeusOralStyle,
    translateForSpeechToLang,
  };
})();
