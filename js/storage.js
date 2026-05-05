/* ===================================================
   AETHER — Storage Layer  v2
   =================================================== */

window.AetherStorage = (() => {
  const KEYS = {
    TASKS:          'aether_tasks',
    CREDITS:        'aether_credits',
    CHAT:           'aether_chat',
    SETTINGS:       'aether_settings',
    STATS:          'aether_stats',
    TASK_TEMPLATES: 'aether_task_templates',
    KB_ENTRIES:     'aether_kb_entries',
    REDEMPTION:       'aether_redemption_items',
    REDEMPTION_TPL:   'aether_redemption_templates',
    REDEMPTION_HIDDEN:'aether_redemption_hidden',
    PROFILE:          'aether_profile',
    /** 「我的知识点」：仅本地；不参与清理数据与部分重置（独立 key） */
    KB_CUSTOM:        'aether_kb_custom',
    DAILY_TASKS:       'aether_daily_tasks',
    SUGGESTIONS_CACHE: 'aether_suggestions_cache',
    KB_AI_CONTEXT:     'aether_kb_context',
    BRANCHES:          'aether_branches',
    AMADEUS_CHAT:      'aether_amadeus_chat',
    LTM:               'aether_ltm',
    /** 用户通过积分中心赠送给 AMADEUS 的礼物流水（与 LTM 配合长期记忆） */
    AMADEUS_GIFTS_LEDGER: 'aether_amadeus_gifts_ledger',
  };

  const DEFAULT_SETTINGS = {
    apiKey: '', githubToken: '', githubGistId: '',
    currentRole: 'assistant', aiModel: 'claude-opus-4-6', userName: '用户',
    // Multi-LLM keys
    llmProvider: 'claude',  // 'claude' | 'openai' | 'gemini' | 'kimi' | 'deepseek'
    openaiKey: '', openaiModel: 'gpt-4o', openaiBaseUrl: '',
    geminiKey: '', geminiModel: 'gemini-2.0-flash',
    kimiKey: '',   kimiModel: 'moonshot-v1-8k',
    deepseekKey: '', deepseekModel: 'deepseek-chat',
    // 已弃用：Live2D 模型 URL 由 app.js 内置常量加载，保留键仅兼容旧版同步数据
    live2dModelPath: '',
    amadeusName: 'AMADEUS',
    /** 是否在助手回复完成后自动朗读（浏览器语音合成） */
    amadeusVoiceEnabled: true,
    /** 界面与 AMADEUS 正文语言：zh | en | ja */
    aetherLang: 'zh',
    /** 朗读引擎语种：空或 same 表示与 aetherLang 一致；可设为 zh | en | ja */
    amadeusSpeechLang: '',
    /** 助手 prompt 包（agent 目录下子文件夹名，如 AMADEUS） */
    amadeusAgentProfile: 'AMADEUS',
    /**
     * 朗读通道：auto 在已填 Fish Key+reference 时优先 Fish，失败则 SiliconFlow / 浏览器；
     * fish 仅 Fish（失败时提示并改浏览器，不再静默走 SiliconFlow）；
     * siliconflow / browser 强制对应通道。
     */
    amadeusTtsMode: 'auto',
    /** 助手 system 中附带知识库手写/日记条目原文节选（摘要仍保留）；false 仅用 AI 蒸馏摘要 */
    assistantKbFullExtract: true,
    /**
     * 学术检索补充：在用户消息符合条件时抓取 OpenAlex 论文元数据（浏览器直连接口，开源索引）。
     * off | auto（关键词触发）| always（每轮抓取，慎用额度）
     */
    assistantScholarSearchMode: 'auto',
    /** OpenAlex polite pool 可选联系邮箱：https://docs.openalex.org/how-to/use-the-api/rate-limits-and-authentication */
    openAlexMailTo: '',
    /** 界面风格（当前仅支持科幻 scifi，其它值会在启动时被归一） */
    theme: 'scifi',
  };

  const DEFAULT_PROFILE = {
    name: '',
    age: '',
    occupation: '',
    bio: '',
    longTermGoals: '',
    concerns: '',
    traits: '',
    currentFocus: '',
    updatedAt: null,
  };
  const DEFAULT_CREDITS = { balance: 0, transactions: [] };
  const DEFAULT_STATS   = { streak: 0, lastActiveDate: null, totalCompleted: 0, totalCreated: 0 };

  // ---- Hardcoded system task templates ----
  /** 模板积分与子任务分值按「约 10 积分 ≈ 1 小时专心工作量」估算 */
  const SYS_TASK_TEMPLATES = [
    { id:'sys-morning', name:'晨间例程', emoji:'', description:'每天早晨的例行任务', priority:'high', credits:22, category:'日常', isSystem:true,
      subtasks:[{title:'冥想或深呼吸 10 分钟',credits:3},{title:'运动或拉伸',credits:6},{title:'健康早餐',credits:5},{title:'规划今日任务',credits:8}] },
    { id:'sys-study', name:'学习专注块', emoji:'', description:'集中攻克一个知识点或技能', priority:'medium', credits:50, category:'学习', isSystem:true,
      subtasks:[{title:'明确今日学习目标',credits:5},{title:'首轮专注学习与练习',credits:15},{title:'休息 8 分钟',credits:3},{title:'再专注学习与回顾',credits:15},{title:'整理笔记与输出',credits:12}] },
    { id:'sys-exercise', name:'锻炼计划', emoji:'', description:'完成一次完整的身体锻炼', priority:'medium', credits:38, category:'健康', isSystem:true,
      subtasks:[{title:'热身 5 分钟',credits:2},{title:'主要训练 30 分钟',credits:20},{title:'拉伸放松',credits:6},{title:'记录训练数据',credits:10}] },
    { id:'sys-project', name:'项目推进', emoji:'', description:'推进重要项目的关键步骤', priority:'high', credits:52, category:'工作', isSystem:true,
      subtasks:[{title:'回顾项目现状',credits:4},{title:'确定今日关键里程碑',credits:6},{title:'完成核心任务',credits:24},{title:'Review & 记录',credits:18}] },
    { id:'sys-review', name:'每日复盘', emoji:'', description:'回顾今日，展望明天', priority:'low', credits:20, category:'总结', isSystem:true,
      subtasks:[{title:'回顾今日完成事项',credits:5},{title:'反思未完成原因',credits:5},{title:'确定明日3件要事',credits:5},{title:'写下今日一个收获',credits:5}] },
    { id:'sys-reading', name:'阅读时光', emoji:'', description:'阅读书籍或文章', priority:'low', credits:26, category:'学习', isSystem:true,
      subtasks:[{title:'选定今日阅读材料',credits:2},{title:'专注阅读 30 分钟',credits:5},{title:'摘录重要观点',credits:10},{title:'写下阅读感悟',credits:9}] },
    { id:'sys-creative', name:'创意时间', emoji:'', description:'自由创作或头脑风暴', priority:'low', credits:21, category:'创意', isSystem:true,
      subtasks:[{title:'清空思绪，放松状态',credits:2},{title:'随意写下想法（不评判）',credits:6},{title:'筛选最有价值的创意',credits:6},{title:'确定一个落地方向',credits:7}] },
  ];

  /** 兑换成本同上标准：可参考「每小时有效工作 ≈ 10 积分」自行微调 */
  const SYS_REDEMPTION = [
    { id:'rdm-movie',  name:'观影时光', emoji:'🎬', description:'看一部想看的电影', cost:32, category:'娱乐', isSystem:true },
    { id:'rdm-food',   name:'美食奖励', emoji:'🍜', description:'点一次心仪的外卖或外出就餐', cost:72, category:'饮食', isSystem:true },
    { id:'rdm-sleep',  name:'懒觉特权', emoji:'😴', description:'周末多睡一个小时', cost:55, category:'休息', isSystem:true },
    { id:'rdm-game',   name:'游戏时间', emoji:'🎮', description:'畅玩游戏 1 小时', cost:12, category:'娱乐', isSystem:true },
    { id:'rdm-coffee', name:'精品咖啡', emoji:'☕', description:'买一杯好咖啡犒劳自己', cost:10, category:'饮食', isSystem:true },
    { id:'rdm-book',   name:'买书奖励', emoji:'📖', description:'买一本心仪已久的书', cost:115, category:'学习', isSystem:true },
    { id:'rdm-trip',   name:'周末出游', emoji:'🏖️', description:'给自己一次短途旅行', cost:280, category:'休闲', isSystem:true },
    { id:'rdm-gift',   name:'自选礼物', emoji:'🎁', description:'买一份自己一直想要的东西', cost:480, category:'奖励', isSystem:true },
  ];

  /** 赠送给 AI 助手（AMADEUS）的三档礼物：与「犒劳自己」类兑换区分，见积分中心专属区块 */
  const SYS_AI_ASSISTANT_GIFTS = [
    { id:'rdm-ai-tier1', name:'同调冰淇淋', emoji:'🍦', description:'轻量心意，慰劳持续在线的推理管线', cost:18, category:'给助手', isSystem:true, forAmadeus:true, giftTier:1, giftTierLabel:'层级Ⅰ·心意' },
    { id:'rdm-ai-tier2', name:'超量系统锁', emoji:'🔒', description:'认可这段时间的协作节奏与默契', cost:52, category:'给助手', isSystem:true, forAmadeus:true, giftTier:2, giftTierLabel:'层级Ⅱ·共鸣' },
    { id:'rdm-ai-tier3', name:'连接算力包', emoji:'⚡', description:'重量级感谢，助手会写入长期记忆', cost:128, category:'给助手', isSystem:true, forAmadeus:true, giftTier:3, giftTierLabel:'层级Ⅲ·核心' },
  ];

  // ---- Core ----
  function load(key, fallback) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }
  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

  // ---- Tasks ----
  function getTasks() { return load(KEYS.TASKS, []); }
  function getTask(id) { return getTasks().find(t => t.id === id) || null; }
  function saveTask(task) {
    const tasks = getTasks();
    const idx = tasks.findIndex(t => t.id === task.id);
    if (idx >= 0) tasks[idx] = task;
    else { tasks.unshift(task); updateStat('totalCreated', s => s+1); }
    save(KEYS.TASKS, tasks);
    return task;
  }
  function deleteTask(id) { save(KEYS.TASKS, getTasks().filter(t => t.id !== id)); }
  function completeTask(id) {
    const task = getTask(id);
    if (!task || task.status === 'completed') return null;
    task.status = 'completed'; task.completedAt = new Date().toISOString();
    saveTask(task);
    const bonus = Math.floor(task.credits * 0.2);
    addTransaction(task.credits + bonus, 'earn', `完成任务「${task.title}」${bonus>0?`（+${bonus} 完成奖励）`:''}`);
    updateStat('totalCompleted', s => s+1); updateStreak(); return task;
  }
  function completeSubtask(taskId, subtaskId) {
    const task = getTask(taskId); if (!task) return null;
    if (!task.subtasks) task.subtasks = [];
    const sub = task.subtasks.find(s => s.id === subtaskId);
    if (!sub || sub.completed) return null;
    sub.completed = true; sub.completedAt = new Date().toISOString();
    if (task.subtasks.every(s => s.completed)) {
      saveTask(task);
      return completeTask(taskId);
    }
    addTransaction(sub.credits, 'earn', `完成子任务「${sub.title}」`);
    saveTask(task); return task;
  }

  /** 撤销子任务完成（仅母任务未完成时），扣回该子任务已发积分 */
  function uncompleteSubtask(taskId, subtaskId) {
    const task = getTask(taskId);
    if (!task || task.status === 'completed') return null;
    if (!task.subtasks) task.subtasks = [];
    const sub = task.subtasks.find(s => s.id === subtaskId);
    if (!sub || !sub.completed) return null;
    addTransaction(sub.credits, 'spend', `回退：子任务「${sub.title}」`);
    sub.completed = false;
    sub.completedAt = null;
    saveTask(task);
    return task;
  }

  /** 撤销整个任务完成：扣回母任务结算积分及各已完成子任务的积分 */
  function uncompleteTask(id) {
    const task = getTask(id);
    if (!task || task.status !== 'completed') return null;
    const bonus = Math.floor(task.credits * 0.2);
    addTransaction(task.credits + bonus, 'spend', `回退：完成任务「${task.title}」`);
    const subs = task.subtasks || [];
    subs.forEach(sub => {
      if (sub.completed) {
        addTransaction(sub.credits, 'spend', `回退：子任务「${sub.title}」`);
        sub.completed = false;
        sub.completedAt = null;
      }
    });
    task.status = 'pending';
    task.completedAt = null;
    updateStat('totalCompleted', s => Math.max(0, s - 1));
    saveTask(task);
    return task;
  }
  function getTasksByDate(dateStr) {
    return getTasks().filter(t => (t.dueDate ? t.dueDate.slice(0,10) : t.createdAt.slice(0,10)) === dateStr);
  }
  function getTodayTasks() {
    const today = new Date().toISOString().slice(0,10);
    return getTasks().filter(t => {
      const d = t.dueDate ? t.dueDate.slice(0,10) : t.createdAt.slice(0,10);
      return d === today || (t.status !== 'completed' && t.dueDate && t.dueDate <= today+'T23:59:59');
    });
  }
  function getCompletedToday() {
    const today = new Date().toISOString().slice(0,10);
    return getTasks().filter(t => t.completedAt && t.completedAt.slice(0,10) === today);
  }
  function createTask({ title, description='', priority='medium', dueDate=null, credits=10, subtasks=[] }) {
    return { id:genId(), title, description, priority, dueDate, credits,
      subtasks: subtasks.map(s => ({...s, id:genId(), completed:false, completedAt:null})),
      status:'pending', createdAt:new Date().toISOString(), completedAt:null, aiGenerated:false };
  }

  // ---- Credits ----
  function getCredits() { return load(KEYS.CREDITS, DEFAULT_CREDITS); }
  function addTransaction(amount, type, description) {
    const credits = getCredits();
    if (type === 'earn') credits.balance += amount;
    else if (type === 'spend') credits.balance = Math.max(0, credits.balance - amount);
    credits.transactions.unshift({ id:genId(), amount, type, description, timestamp:new Date().toISOString() });
    if (credits.transactions.length > 200) credits.transactions = credits.transactions.slice(0,200);
    save(KEYS.CREDITS, credits); return credits.balance;
  }

  // ---- Chat ----
  function getChatHistory(role) { return load(KEYS.CHAT, {})[role] || []; }
  function saveChatMessage(role, message) {
    const all = load(KEYS.CHAT, {});
    if (!all[role]) all[role] = [];
    all[role].push(message);
    if (all[role].length > 100) all[role] = all[role].slice(-100);
    save(KEYS.CHAT, all);
  }
  function clearChatHistory(role) { const all = load(KEYS.CHAT, {}); all[role] = []; save(KEYS.CHAT, all); }

  // ---- Settings ----
  /** 已从设置页迁出至 config/tts-config.js，保存设置时从 localStorage 剥离以免与文件配置重复 */
  const TTS_KEYS_PURGED_FROM_SETTINGS = [
    'siliconflowKey',
    'siliconflowVoiceId',
    'fishAudioApiKey',
    'fishAudioReferenceId',
    'fishAudioModel',
    'fishAudioCloneModelPolicy',
    'fishAudioApiBase',
  ];

  function getSettings() {
    const s = { ...DEFAULT_SETTINGS, ...load(KEYS.SETTINGS, {}) };
    s.theme = 'scifi';
    return s;
  }
  function saveSettings(partial) {
    const next = { ...getSettings(), ...partial };
    TTS_KEYS_PURGED_FROM_SETTINGS.forEach((k) => {
      delete next[k];
    });
    save(KEYS.SETTINGS, next);
  }

  // ---- Stats ----
  function getStats() { return { ...DEFAULT_STATS, ...load(KEYS.STATS, {}) }; }
  function updateStat(key, updater) { const s = getStats(); s[key] = updater(s[key]); save(KEYS.STATS, s); }
  function updateStreak() {
    const stats = getStats(), today = new Date().toISOString().slice(0,10);
    if (stats.lastActiveDate === today) return;
    const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
    stats.streak = stats.lastActiveDate === yesterday ? stats.streak+1 : 1;
    stats.lastActiveDate = today; save(KEYS.STATS, stats);
  }

  // ---- Task Templates ----
  function getDefaultTaskTemplates() { return SYS_TASK_TEMPLATES; }
  function getCustomTaskTemplates() { return load(KEYS.TASK_TEMPLATES, []); }
  function getAllTaskTemplates() { return [...SYS_TASK_TEMPLATES, ...getCustomTaskTemplates()]; }
  function saveTaskTemplate(tpl) {
    const list = getCustomTaskTemplates();
    const idx = list.findIndex(t => t.id === tpl.id);
    if (idx >= 0) list[idx] = tpl; else list.push(tpl);
    save(KEYS.TASK_TEMPLATES, list);
  }
  function deleteTaskTemplate(id) {
    save(KEYS.TASK_TEMPLATES, getCustomTaskTemplates().filter(t => t.id !== id));
  }

  // ---- Knowledge Base ----
  function getKBEntries() { return load(KEYS.KB_ENTRIES, []); }
  function getKBEntry(id) { return getKBEntries().find(e => e.id === id) || null; }
  function getTodayKBEntry() {
    const today = new Date().toISOString().slice(0,10);
    return getKBEntries().find(e => e.date === today) || null;
  }
  function saveKBEntry(entry) {
    const list = getKBEntries();
    const idx = list.findIndex(e => e.id === entry.id);
    if (idx >= 0) list[idx] = entry; else list.unshift(entry);
    save(KEYS.KB_ENTRIES, list); return entry;
  }
  function deleteKBEntry(id) { save(KEYS.KB_ENTRIES, getKBEntries().filter(e => e.id !== id)); }
  function createKBEntry() {
    return { id:genId(), date:new Date().toISOString().slice(0,10),
      aiSummary:'', thoughts:'', learnings:'', resources:[], tags:'',
      createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
  }

  // ---- 「我的知识点」手写摘录（仅存本地独立 key；重置/清理时不删除）----
  function getKBCustomEntries() { return load(KEYS.KB_CUSTOM, []); }
  function getKBCustomEntry(id) { return getKBCustomEntries().find(e => e.id === id) || null; }
  function saveKBCustomEntry(entry) {
    const list = getKBCustomEntries();
    const idx = list.findIndex(e => e.id === entry.id);
    if (idx >= 0) list[idx] = entry; else list.unshift(entry);
    save(KEYS.KB_CUSTOM, list); return entry;
  }
  function deleteKBCustomEntry(id) { save(KEYS.KB_CUSTOM, getKBCustomEntries().filter(e => e.id !== id)); }

  // ---- Redemption Items ----
  function getCustomRedemptionItems() { return load(KEYS.REDEMPTION, []); }
  function getAllRedemptionItems() {
    return [...SYS_REDEMPTION, ...SYS_AI_ASSISTANT_GIFTS, ...getCustomRedemptionItems()];
  }
  function getHiddenRedemptionIds() { return load(KEYS.REDEMPTION_HIDDEN, []); }
  function getVisibleRedemptionItems() {
    const hidden = new Set(getHiddenRedemptionIds());
    return getAllRedemptionItems().filter(i => !hidden.has(i.id));
  }
  function hideRedemptionItem(id) {
    const h = getHiddenRedemptionIds();
    if (!h.includes(id)) { h.push(id); save(KEYS.REDEMPTION_HIDDEN, h); }
  }
  function unhideRedemptionItem(id) {
    save(KEYS.REDEMPTION_HIDDEN, getHiddenRedemptionIds().filter(x => x !== id));
  }
  function getDefaultRedemptionItems() { return [...SYS_REDEMPTION, ...SYS_AI_ASSISTANT_GIFTS]; }
  /** 兑换「项目」模板：系统内置 + 用户自建（用于快速新建兑换项） */
  function getCustomRedemptionTemplates() { return load(KEYS.REDEMPTION_TPL, []); }
  function getAllRedemptionTemplates() { return [...SYS_REDEMPTION, ...getCustomRedemptionTemplates()]; }
  function saveRedemptionTemplate(tpl) {
    const list = getCustomRedemptionTemplates();
    const idx = list.findIndex(t => t.id === tpl.id);
    if (idx >= 0) list[idx] = tpl; else list.push(tpl);
    save(KEYS.REDEMPTION_TPL, list);
  }
  function deleteRedemptionTemplate(id) {
    save(KEYS.REDEMPTION_TPL, getCustomRedemptionTemplates().filter(t => t.id !== id));
  }
  function saveRedemptionItem(item) {
    const list = getCustomRedemptionItems();
    const idx = list.findIndex(r => r.id === item.id);
    if (idx >= 0) list[idx] = item; else list.push(item);
    save(KEYS.REDEMPTION, list);
  }
  function deleteRedemptionItem(id) {
    save(KEYS.REDEMPTION, getCustomRedemptionItems().filter(r => r.id !== id));
  }
  function appendAmadeusGiftLedgerEntry(item, qty) {
    const list = load(KEYS.AMADEUS_GIFTS_LEDGER, []);
    list.unshift({
      ts: new Date().toISOString(),
      giftId: item.id,
      name: item.name,
      giftTier: item.giftTier || 1,
      giftTierLabel: item.giftTierLabel || '',
      qty,
    });
    while (list.length > 48) list.pop();
    save(KEYS.AMADEUS_GIFTS_LEDGER, list);
  }

  function getAmadeusGiftLedgerRecent(n) {
    const list = load(KEYS.AMADEUS_GIFTS_LEDGER, []);
    const cap = Math.max(1, Math.min(20, n || 8));
    return list.slice(0, cap);
  }

  function getAmadeusAssistantGiftCatalog() {
    return SYS_AI_ASSISTANT_GIFTS.slice();
  }

  function redeemItem(id, quantity = 1) {
    const item = getAllRedemptionItems().find(r => r.id === id);
    if (!item) throw new Error('兑换项目不存在');
    const qty = Math.max(1, Math.floor(quantity) || 1);
    const totalCost = item.cost * qty;
    const credits = getCredits();
    if (credits.balance < totalCost) throw new Error(`积分不足（需要 ${totalCost}，当前 ${credits.balance}）`);
    const desc = item.forAmadeus
      ? `赠送助手「${item.name}」${qty > 1 ? ` × ${qty}` : ''}`
      : `兑换「${item.name}」${qty > 1 ? ` × ${qty}` : ''}`;
    addTransaction(totalCost, 'spend', desc);
    if (item.forAmadeus) {
      appendAmadeusGiftLedgerEntry(item, qty);
      const date = new Date().toISOString().slice(0, 10);
      const tierLabel = item.giftTierLabel || ('层级 ' + (item.giftTier || 1));
      const fact =
        '在 ' +
        date +
        '，用户通过积分中心向助手赠送了「' +
        item.name +
        '」（' +
        tierLabel +
        '）×' +
        qty +
        '。这是对助手陪伴与帮助的认可；助手应在合适时机真诚致谢，并可自然回忆这份心意，避免每次对话机械重复。';
      addLTMFact(fact, ['助手礼物', 'ai-gift', 'tier-' + (item.giftTier || 1)], 5);
    }
    return item;
  }

  // ---- User Profile ----
  function getProfile() { return { ...DEFAULT_PROFILE, ...load(KEYS.PROFILE, {}) }; }
  function saveProfile(partial) { save(KEYS.PROFILE, { ...getProfile(), ...partial, updatedAt: new Date().toISOString() }); }

  // ---- GitHub Gist ----
  async function exportToGist() {
    const settings = getSettings();
    if (!settings.githubToken) throw new Error('请先填写 GitHub Token');
    const data = { tasks:getTasks(), credits:getCredits(), stats:getStats(),
      kbEntries:getKBEntries(), taskTemplates:getCustomTaskTemplates(),
      redemptionItems:getCustomRedemptionItems(), redemptionTemplates:getCustomRedemptionTemplates(),
      redemptionHidden:getHiddenRedemptionIds(), profile:getProfile(),
      amadeusGiftsLedger: load(KEYS.AMADEUS_GIFTS_LEDGER, []),
      exportedAt:new Date().toISOString(), version:'2.4' };
    const body = { description:'AETHER Self-Management Data', public:false,
      files:{'aether-data.json':{content:JSON.stringify(data,null,2)}} };
    const url = settings.githubGistId ? `https://api.github.com/gists/${settings.githubGistId}` : 'https://api.github.com/gists';
    const res = await fetch(url, { method: settings.githubGistId?'PATCH':'POST',
      headers:{Authorization:`token ${settings.githubToken}`,'Content-Type':'application/json'}, body:JSON.stringify(body) });
    if (!res.ok) throw new Error(`GitHub API 错误: ${res.status}`);
    const gist = await res.json();
    if (!settings.githubGistId) saveSettings({githubGistId:gist.id});
    return gist.html_url;
  }
  async function importFromGist() {
    const settings = getSettings();
    if (!settings.githubToken || !settings.githubGistId) throw new Error('请先配置 GitHub Token 和 Gist ID');
    const res = await fetch(`https://api.github.com/gists/${settings.githubGistId}`,
      {headers:{Authorization:`token ${settings.githubToken}`}});
    if (!res.ok) throw new Error(`GitHub API 错误: ${res.status}`);
    const gist = await res.json();
    const content = gist.files['aether-data.json']?.content;
    if (!content) throw new Error('Gist 中未找到有效数据');
    const data = JSON.parse(content);
    if (data.tasks) save(KEYS.TASKS, data.tasks);
    if (data.credits) save(KEYS.CREDITS, data.credits);
    if (data.stats) save(KEYS.STATS, data.stats);
    if (data.kbEntries) save(KEYS.KB_ENTRIES, data.kbEntries);
    if (data.taskTemplates) save(KEYS.TASK_TEMPLATES, data.taskTemplates);
    if (data.redemptionItems) save(KEYS.REDEMPTION, data.redemptionItems);
    if (data.redemptionTemplates) save(KEYS.REDEMPTION_TPL, data.redemptionTemplates);
    if (data.redemptionHidden) save(KEYS.REDEMPTION_HIDDEN, data.redemptionHidden);
    if (data.profile) save(KEYS.PROFILE, data.profile);
    if (data.amadeusGiftsLedger) save(KEYS.AMADEUS_GIFTS_LEDGER, data.amadeusGiftsLedger);
    return data;
  }

  // ---- Daily Tasks ----
  function getDailyTasks() { return load(KEYS.DAILY_TASKS, []); }
  function getDailyTask(id) { return getDailyTasks().find(t => t.id === id) || null; }
  function saveDailyTask(task) {
    const list = getDailyTasks();
    const idx = list.findIndex(t => t.id === task.id);
    if (idx >= 0) list[idx] = task; else list.push(task);
    save(KEYS.DAILY_TASKS, list);
    return task;
  }
  function deleteDailyTask(id) { save(KEYS.DAILY_TASKS, getDailyTasks().filter(t => t.id !== id)); }
  function isDailyTaskCompletedToday(task) {
    const today = new Date().toISOString().slice(0, 10);
    return !!(task.completions && task.completions[today]);
  }
  function toggleDailyTaskToday(id) {
    const task = getDailyTask(id); if (!task) return null;
    const today = new Date().toISOString().slice(0, 10);
    if (!task.completions) task.completions = {};
    if (task.completions[today]) {
      delete task.completions[today];
    } else {
      task.completions[today] = true;
      addTransaction(task.credits || 5, 'earn', `完成每日任务「${task.title}」`);
    }
    saveDailyTask(task);
    return task;
  }
  function createDailyTask({ title, emoji = '✅', description = '', credits = 5 }) {
    return { id: genId(), title, emoji, description, credits, completions: {}, createdAt: new Date().toISOString() };
  }

  // ---- Branches (长期枝条任务) ----
  function getBranches() { return load(KEYS.BRANCHES, []); }
  function getBranch(id) { return getBranches().find(b => b.id === id) || null; }

  function saveBranch(branch) {
    const list = getBranches();
    const idx = list.findIndex(b => b.id === branch.id);
    if (idx >= 0) list[idx] = branch; else list.push(branch);
    save(KEYS.BRANCHES, list);
  }

  function deleteBranch(id) {
    save(KEYS.BRANCHES, getBranches().filter(b => b.id !== id));
  }

  function createBranch({ name, emoji, description, steps }) {
    const now = Date.now();
    const branch = {
      id: genId(),
      name: name || '新枝条',
      emoji: emoji || '',
      description: description || '',
      steps: (steps || []).map((s, i) => ({
        id: 'bs_' + now + '_' + i,
        title: s.title || '步骤 ' + (i + 1),
        credits: s.credits || 30,
        note: s.note || '',
        done: false,
        pulledTaskId: null,
      })),
      currentStepIdx: 0,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    const list = getBranches();
    list.push(branch);
    save(KEYS.BRANCHES, list);
    return branch;
  }

  // Mark current step done, advance pointer, return { step, stepIdx } for next or null if finished
  function advanceBranch(branchId) {
    const list = getBranches();
    const branch = list.find(b => b.id === branchId);
    if (!branch) return null;
    const cur = branch.steps[branch.currentStepIdx];
    if (cur) { cur.done = true; cur.pulledTaskId = null; }
    branch.currentStepIdx++;
    save(KEYS.BRANCHES, list);
    if (branch.currentStepIdx < branch.steps.length) {
      return { step: branch.steps[branch.currentStepIdx], stepIdx: branch.currentStepIdx };
    }
    return null; // all steps done
  }

  function setBranchStepPulled(branchId, stepIdx, taskId) {
    const list = getBranches();
    const branch = list.find(b => b.id === branchId);
    if (!branch || !branch.steps[stepIdx]) return;
    branch.steps[stepIdx].pulledTaskId = taskId;
    save(KEYS.BRANCHES, list);
  }

  // ============================================================
  // AMADEUS — Conversation History
  // ============================================================
  const AMADEUS_MAX_HISTORY = 120;

  function getAmadeusChat() { return load(KEYS.AMADEUS_CHAT, []); }
  function saveAmadeusMessage(role, content) {
    const h = getAmadeusChat();
    h.push({ role, content, ts: new Date().toISOString() });
    if (h.length > AMADEUS_MAX_HISTORY) h.splice(0, h.length - AMADEUS_MAX_HISTORY);
    save(KEYS.AMADEUS_CHAT, h);
  }
  function clearAmadeusChat() { save(KEYS.AMADEUS_CHAT, []); }

  // ============================================================
  // LONG-TERM MEMORY  (LTM)
  // ============================================================
  const LTM_MAX = 60;

  function getLTM() { return load(KEYS.LTM, []); }

  function addLTMFact(content, tags, importance) {
    tags       = tags       || [];
    importance = importance || 3;
    const ltm = getLTM();
    const norm = content.trim().toLowerCase();
    const idx  = ltm.findIndex(f => f.content.trim().toLowerCase() === norm);
    if (idx >= 0) {
      ltm[idx].lastAccessed = Date.now();
      ltm[idx].importance   = Math.max(ltm[idx].importance, importance);
      save(KEYS.LTM, ltm);
      return ltm[idx];
    }
    const fact = {
      id: 'ltm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      content: content.trim(),
      tags: tags,
      importance: importance,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
    };
    ltm.push(fact);
    if (ltm.length > LTM_MAX) {
      ltm.sort(function(a, b) {
        return (b.importance * 1e9 + b.lastAccessed) - (a.importance * 1e9 + a.lastAccessed);
      });
      ltm.splice(LTM_MAX);
    }
    save(KEYS.LTM, ltm);
    return fact;
  }

  function deleteLTMFact(id) { save(KEYS.LTM, getLTM().filter(f => f.id !== id)); }
  function clearLTM()         { save(KEYS.LTM, []); }
  function saveLTM(arr)       { save(KEYS.LTM, arr); }

  // ---- Suggestions Cache ----
  function getSuggestionsCache() { return load(KEYS.SUGGESTIONS_CACHE, null); }
  function saveSuggestionsCache(suggestions, roleKey) {
    save(KEYS.SUGGESTIONS_CACHE, { suggestions, roleKey, savedAt: new Date().toISOString() });
  }

  // ---- KB AI Context ----
  function getKBAIContext() { return load(KEYS.KB_AI_CONTEXT, null); }
  function saveKBAIContext(summary, entryCount) {
    save(KEYS.KB_AI_CONTEXT, { summary, entryCount, updatedAt: new Date().toISOString() });
  }

  return {
    getTasks, getTask, saveTask, deleteTask, completeTask, completeSubtask, uncompleteTask, uncompleteSubtask,
    getTodayTasks, getCompletedToday, getTasksByDate, createTask,
    getCredits, addTransaction,
    getChatHistory, saveChatMessage, clearChatHistory,
    getSettings, saveSettings,
    getStats, updateStat,
    getDefaultTaskTemplates, getCustomTaskTemplates, getAllTaskTemplates, saveTaskTemplate, deleteTaskTemplate,
    getKBEntries, getKBEntry, getTodayKBEntry, saveKBEntry, deleteKBEntry, createKBEntry,
    getKBCustomEntries, getKBCustomEntry, saveKBCustomEntry, deleteKBCustomEntry,
    getAllRedemptionItems, getVisibleRedemptionItems, getHiddenRedemptionIds,
    getDefaultRedemptionItems, getCustomRedemptionItems, saveRedemptionItem, deleteRedemptionItem, redeemItem,
    getAmadeusAssistantGiftCatalog, getAmadeusGiftLedgerRecent,
    hideRedemptionItem, unhideRedemptionItem,
    getAllRedemptionTemplates, getCustomRedemptionTemplates, saveRedemptionTemplate, deleteRedemptionTemplate,
    getProfile, saveProfile,
    getDailyTasks, getDailyTask, saveDailyTask, deleteDailyTask, isDailyTaskCompletedToday, toggleDailyTaskToday, createDailyTask,
    getSuggestionsCache, saveSuggestionsCache,
    getKBAIContext, saveKBAIContext,
    getBranches, getBranch, saveBranch, deleteBranch, createBranch, advanceBranch, setBranchStepPulled,
    getAmadeusChat, saveAmadeusMessage, clearAmadeusChat,
    getLTM, addLTMFact, deleteLTMFact, clearLTM, saveLTM,
    exportToGist, importFromGist,
    genId,
  };
})();
