/* AETHER — UI 文案（zh / en / ja） */
(function () {
  'use strict';

  var STR = {
    zh: {
      'nav.dashboard': '仪表盘',
      'nav.tasks': '任务',
      'nav.calendar': '日历',
      'nav.daily': '每日任务',
      'nav.branches': '长期任务',
      'nav.knowledge': '知识库',
      'nav.chat': 'AI 助手',
      'nav.rewards': '积分中心',
      'nav.profile': '个人档案',
      'nav.settings': '设置',
      'view.dashboard': '仪表盘',
      'view.tasks': '任务管理',
      'view.calendar': '任务日历',
      'view.daily': '每日任务',
      'view.branches': '长期任务',
      'view.knowledge': '知识库',
      'view.chat': 'AI 助手 · AMADEUS',
      'view.rewards': '积分中心',
      'view.profile': '个人档案',
      'view.settings': '设置',
      'theme.cozy': '温馨风格',
      'theme.scifi': '科幻风格',
      'theme.pressure': '压力风格',
      'toast.firstRun': '欢迎使用 AETHER！请在设置中选择 AI 提供商并填写对应 API Key 以启用对话与智能功能',
      'toast.ttsPreviewing': '正在按当前朗读通道试听…',
      'toast.voiceOn': '已开启自动朗读',
      'toast.voiceOff': '已关闭自动朗读',
      'toast.speechLangSaved': '朗读语种已保存',
      'tts.preview': '这是 AETHER 的试听语音，用于确认当前通道是否按预期工作。',
      'role.assistant': '助手',
      'role.butler': '管家',
      'role.teacher': '老师',
      'role.partner': '陪伴',
      'role.assistant.desc': '平衡、专业、易协作',
      'role.butler.desc': '优雅严谨，专注效率',
      'role.teacher.desc': '博学耐心，循循善诱',
      'role.partner.desc': '情绪支持与生活节奏陪伴',
      'common.user': '用户',
      'header.remainingCredits': '剩余积分',
      'amadeus.state.idle': '待机中',
      'amadeus.state.thinking': '思考中…',
      'amadeus.state.talking': '表达中…',
      'amadeus.state.happy': '完成',
      'amadeus.voiceOn': '朗读开',
      'amadeus.voiceOff': '朗读关',
      'amadeus.taskEval': '进展评估',
      'amadeus.clearChat': '清空对话',
      'amadeus.inputPh': '和 {name} 说点什么…',
      'amadeus.l2dLoading': '正在加载 Live2D…',
      'amadeus.attachAdd': '添加附件',
      'amadeus.pickFiles': '选择文件',
      'amadeus.pickFolder': '选择文件夹',
      'amadeus.attachDrop': '拖放添加附件',
      'amadeus.attachLoading': '加载中…',
      'amadeus.attachFail': '附件列表加载失败',
      'amadeus.todayTodo': '今日待办',
      'amadeus.gotoTasks': '任务',
      'amadeus.speechLang': '朗读语种（语音引擎）',
      'amadeus.speechLangHint':
        '「跟随系统」与界面/助手正文语种一致。另选语种时使用 config/tts-config.js 中对应 byLocale；若与系统语言不同，朗读前会自动翻译后再 TTS，气泡内仍显示原文。',
      'amadeus.speechFollow': '跟随系统语言',
      'amadeus.time.justNow': '刚刚',
      'amadeus.memory.empty': '暂无长期记忆。与 AMADEUS 对话后，重要事实将自动保存。',
      'amadeus.memory.clearAll': '清空所有记忆',
      'amadeus.memory.expand': '展开',
      'amadeus.memory.collapse': '收起',
      'amadeus.memory.title': '长期记忆',
      'settings.section.lang': '界面与语言',
      'settings.aetherLang': '系统语言',
      'settings.aetherLangHint': '影响侧栏与主要界面文案，并在系统提示中要求 AMADEUS 使用该语言回复。',
      'settings.ttsChannel': '朗读通道',
      'settings.ttsConfigHint':
        'Fish / SiliconFlow 的 API Key、克隆 reference、声线与模型等请在 <code>config/tts-config.js</code> 配置；根级为共用密钥与 Fish 地址，<code>byLocale.zh/en/ja</code> 按助手页「朗读语种」合并。',
      'settings.ttsAutoRead': '自动朗读回复',
      'settings.ttsAutoReadHint': '开启后，在「朗读语种与系统语言一致」时，气泡文字会与 Fish 整段音频或各段 TTS 同步披露。',
      'settings.previewTts': '试听当前通道',
      'settings.saved': '设置已保存',
      'settings.save': '保存设置',
      'settings.saveCaption': '以下内容可滚动查阅，请务必保存后再离开本页。',
      'settings.profileHint': '称呼与自我介绍请在侧栏「个人档案」中维护，AI 会使用档案内容。',
      'settings.goProfile': '去编辑档案',
      'settings.section.appearance': '界面风格',
      'settings.appearanceHint': '选择界面主题风格',
      'theme.cozy.name': '温馨', 'theme.cozy.desc': '暖色调 · 圆润 · 舒适',
      'theme.scifi.name': '科幻', 'theme.scifi.desc': '霓虹 · 棱角 · 科技',
      'theme.pressure.name': '压力', 'theme.pressure.desc': '紧迫 · 高对比 · 专注',
      'settings.section.role': 'AI 助手角色',
      'settings.roleHint': '选择 AI 助手的默认角色风格',
      'settings.section.model': 'AI 模型配置',
      'settings.modelProvider': '当前使用的 AI 提供商',
      'settings.model': '模型',
      'settings.openaiBase': '兼容 API 基础地址（可选）',
      'settings.section.amadeus': 'AI形象设置',
      'settings.amadeus.name': '助手显示名称',
      'settings.amadeus.nameHint': '用于助手页标题与欢迎语。',
      'settings.amadeus.profile': '助手人格包（agent 目录）',
      'settings.amadeus.kb': '助手知识库访问',
      'settings.amadeus.scholar': '学术文献检索（OpenAlex）',
      'settings.amadeus.scholarOff': '关闭（不检索）',
      'settings.amadeus.scholarAuto': '自动（含学术触发词时检索）',
      'settings.amadeus.scholarAlways': '始终（每轮检索，慎用额度）',
      'settings.tts.auto': '自动（Fish 优先，失败再 SiliconFlow / 浏览器）',
      'settings.tts.fish': '仅 Fish（失败时改用浏览器）',
      'settings.tts.siliconflow': '仅 SiliconFlow',
      'settings.tts.browser': '仅浏览器语音',
      'settings.section.log': '诊断日志',
      'settings.log.export': '导出诊断日志 (.txt)',
      'settings.section.github': 'GitHub 同步',
      'settings.github.upload': '↑ 上传至 GitHub',
      'settings.github.download': '↓ 从 GitHub 下载',
      'settings.section.advanced': '高级设置',
      'settings.section.danger': '危险区域',
      'settings.danger.hint': '以下操作均不可恢复，重置前建议先同步至 GitHub 备份。',
      'settings.danger.resetTasks': '重置任务数据',
      'settings.danger.resetCredits': '重置积分记录',
      'settings.danger.resetKb': '重置知识库',
      'settings.danger.clearChat': '清空对话记录',
      'settings.danger.clearAll': '清除所有本地数据',
      'chat.noApiKey': '请先在设置中配置 AI API Key',
      'chat.todayEmpty': '今日暂无待办。去任务页添加日程吧。',
    },
    en: {
      'nav.dashboard': 'Dashboard',
      'nav.tasks': 'Tasks',
      'nav.calendar': 'Calendar',
      'nav.daily': 'Daily',
      'nav.branches': 'Branches',
      'nav.knowledge': 'Knowledge',
      'nav.chat': 'AI Assistant',
      'nav.rewards': 'Rewards',
      'nav.profile': 'Profile',
      'nav.settings': 'Settings',
      'view.dashboard': 'Dashboard',
      'view.tasks': 'Tasks',
      'view.calendar': 'Calendar',
      'view.daily': 'Daily habits',
      'view.branches': 'Long-term branches',
      'view.knowledge': 'Knowledge base',
      'view.chat': 'AI Assistant · AMADEUS',
      'view.rewards': 'Rewards',
      'view.profile': 'Profile',
      'view.settings': 'Settings',
      'theme.cozy': 'Cozy theme',
      'theme.scifi': 'Sci-fi theme',
      'theme.pressure': 'Pressure theme',
      'toast.firstRun': 'Welcome to AETHER! Pick an AI provider in Settings and add its API key to enable chat and smart features.',
      'toast.ttsPreviewing': 'Playing TTS preview…',
      'toast.voiceOn': 'Read aloud enabled',
      'toast.voiceOff': 'Read aloud disabled',
      'toast.speechLangSaved': 'Speech language saved',
      'tts.preview': 'This is an AETHER voice preview to check the current TTS channel.',
      'role.assistant': 'Assistant',
      'role.butler': 'Butler',
      'role.teacher': 'Teacher',
      'role.partner': 'Support companion',
      'role.assistant.desc': 'Balanced, professional, easy to work with',
      'role.butler.desc': 'Elegant, rigorous, efficiency-focused',
      'role.teacher.desc': 'Patient, knowledgeable, guiding',
      'role.partner.desc': 'Emotional support and steady companionship',
      'common.user': 'User',
      'header.remainingCredits': 'Remaining credits',
      'amadeus.state.idle': 'Idle',
      'amadeus.state.thinking': 'Thinking…',
      'amadeus.state.talking': 'Speaking…',
      'amadeus.state.happy': 'Done',
      'amadeus.voiceOn': 'Read aloud: on',
      'amadeus.voiceOff': 'Read aloud: off',
      'amadeus.taskEval': 'Task review',
      'amadeus.clearChat': 'Clear chat',
      'amadeus.inputPh': 'Message {name}…',
      'amadeus.l2dLoading': 'Loading Live2D…',
      'amadeus.attachAdd': 'Attachments',
      'amadeus.pickFiles': 'Files',
      'amadeus.pickFolder': 'Folder',
      'amadeus.attachDrop': 'Drop files to attach',
      'amadeus.attachLoading': 'Loading…',
      'amadeus.attachFail': 'Failed to load attachments',
      'amadeus.todayTodo': 'Today',
      'amadeus.gotoTasks': 'Tasks',
      'amadeus.speechLang': 'Speech language (TTS)',
      'amadeus.speechLangHint':
        '“Same as system” follows UI language. Another speech language uses the matching block in config/tts-config.js; if it differs from the UI language, text is translated for TTS only while the bubble stays in the system language.',
      'amadeus.speechFollow': 'Same as system',
      'amadeus.time.justNow': 'Just now',
      'amadeus.memory.empty': 'No long-term memories yet. Important facts will be saved as you chat.',
      'amadeus.memory.clearAll': 'Clear all memories',
      'amadeus.memory.expand': 'Expand',
      'amadeus.memory.collapse': 'Collapse',
      'amadeus.memory.title': 'Long-term memory',
      'settings.section.lang': 'UI & language',
      'settings.aetherLang': 'System language',
      'settings.aetherLangHint': 'Controls UI strings and instructs AMADEUS to reply in this language.',
      'settings.ttsChannel': 'TTS channel',
      'settings.ttsConfigHint':
        'Configure Fish / SiliconFlow API keys, clone reference, voices and models in <code>config/tts-config.js</code>; root holds shared keys and Fish base URL; <code>byLocale.zh/en/ja</code> merges by the assistant “speech language”.',
      'settings.ttsAutoRead': 'Read replies aloud',
      'settings.ttsAutoReadHint':
        'When on and speech language matches the system language, the bubble text reveals in sync with Fish audio or per-segment TTS.',
      'settings.previewTts': 'Preview TTS',
      'settings.saved': 'Settings saved',
      'settings.save': 'Save Settings',
      'settings.saveCaption': 'Scroll to review all settings. Please save before leaving.',
      'settings.profileHint': 'Manage your name and bio in Profile — AI uses this content.',
      'settings.goProfile': 'Edit Profile',
      'settings.section.appearance': 'Appearance',
      'settings.appearanceHint': 'Choose interface theme',
      'theme.cozy.name': 'Cozy', 'theme.cozy.desc': 'Warm · Rounded · Comfortable',
      'theme.scifi.name': 'Sci-fi', 'theme.scifi.desc': 'Neon · Angular · Tech',
      'theme.pressure.name': 'Pressure', 'theme.pressure.desc': 'Urgent · High contrast · Focus',
      'settings.section.role': 'AI Role',
      'settings.roleHint': 'Choose the default AI assistant role',
      'settings.section.model': 'AI Model',
      'settings.modelProvider': 'Current AI Provider',
      'settings.model': 'Model',
      'settings.openaiBase': 'Compatible API base URL (optional)',
      'settings.section.amadeus': 'AI avatar',
      'settings.amadeus.name': 'Display Name',
      'settings.amadeus.nameHint': 'Used for the assistant page title and greeting.',
      'settings.amadeus.profile': 'Agent Profile',
      'settings.amadeus.kb': 'Knowledge Base Access',
      'settings.amadeus.scholar': 'Academic Search (OpenAlex)',
      'settings.amadeus.scholarOff': 'Off',
      'settings.amadeus.scholarAuto': 'Auto (trigger on academic keywords)',
      'settings.amadeus.scholarAlways': 'Always (every turn, use sparingly)',
      'settings.tts.auto': 'Auto (Fish first, fallback chain)',
      'settings.tts.fish': 'Fish only (browser on failure)',
      'settings.tts.siliconflow': 'SiliconFlow only',
      'settings.tts.browser': 'Browser only',
      'settings.section.log': 'Diagnostic Log',
      'settings.log.export': 'Export Diagnostic Log (.txt)',
      'settings.section.github': 'GitHub Sync',
      'settings.github.upload': '↑ Upload to GitHub',
      'settings.github.download': '↓ Download from GitHub',
      'settings.section.advanced': 'Advanced settings',
      'settings.section.danger': 'Danger Zone',
      'settings.danger.hint': 'These actions are irreversible. Back up to GitHub first.',
      'settings.danger.resetTasks': 'Reset Task Data',
      'settings.danger.resetCredits': 'Reset Credits',
      'settings.danger.resetKb': 'Reset Knowledge Base',
      'settings.danger.clearChat': 'Clear Chat History',
      'settings.danger.clearAll': 'Clear All Local Data',
      'chat.noApiKey': 'Please configure an AI API Key in Settings first',
      'chat.todayEmpty': 'No tasks for today. Add some in the Tasks view.',
    },
    ja: {
      'nav.dashboard': 'ダッシュボード',
      'nav.tasks': 'タスク',
      'nav.calendar': 'カレンダー',
      'nav.daily': '毎日のタスク',
      'nav.branches': '長期ブランチ',
      'nav.knowledge': 'ナレッジ',
      'nav.chat': 'AI アシスタント',
      'nav.rewards': 'リワード',
      'nav.profile': 'プロフィール',
      'nav.settings': '設定',
      'view.dashboard': 'ダッシュボード',
      'view.tasks': 'タスク管理',
      'view.calendar': 'カレンダー',
      'view.daily': '毎日のタスク',
      'view.branches': '長期ブランチ',
      'view.knowledge': 'ナレッジベース',
      'view.chat': 'AI アシスタント · AMADEUS',
      'view.rewards': 'リワード',
      'view.profile': 'プロフィール',
      'view.settings': '設定',
      'theme.cozy': 'コージー',
      'theme.scifi': 'SF',
      'theme.pressure': 'プレッシャー',
      'toast.firstRun': 'AETHER へようこそ。設定で AI プロバイダーと API キーを入力するとチャットと各機能が使えます。',
      'toast.ttsPreviewing': '試聴を再生中…',
      'toast.voiceOn': '読み上げをオンにしました',
      'toast.voiceOff': '読み上げをオフにしました',
      'toast.speechLangSaved': '読み上げ言語を保存しました',
      'tts.preview': 'これは AETHER の読み上げ試聴です。現在のチャネルが正しく動いているか確認してください。',
      'role.assistant': 'アシスタント',
      'role.butler': '執事',
      'role.teacher': '先生',
      'role.partner': '寄り添い',
      'role.assistant.desc': 'バランス・プロフェッショナル・協働しやすい',
      'role.butler.desc': '上品で厳密、効率重視',
      'role.teacher.desc': '博学で忍耐強く、導き上手',
      'role.partner.desc': '気持ちに寄り添い、生活リズムを支える',
      'common.user': 'ユーザー',
      'header.remainingCredits': '残りポイント',
      'amadeus.state.idle': '待機中',
      'amadeus.state.thinking': '考え中…',
      'amadeus.state.talking': '発話中…',
      'amadeus.state.happy': '完了',
      'amadeus.voiceOn': '読み上げ：オン',
      'amadeus.voiceOff': '読み上げ：オフ',
      'amadeus.taskEval': '進捗レビュー',
      'amadeus.clearChat': '履歴を消去',
      'amadeus.inputPh': '{name} にメッセージ…',
      'amadeus.l2dLoading': 'Live2D を読み込み中…',
      'amadeus.attachAdd': '添付',
      'amadeus.pickFiles': 'ファイル',
      'amadeus.pickFolder': 'フォルダ',
      'amadeus.attachDrop': 'ドロップで添付',
      'amadeus.attachLoading': '読み込み中…',
      'amadeus.attachFail': '添付一覧の読み込みに失敗',
      'amadeus.todayTodo': '今日の ToDo',
      'amadeus.gotoTasks': 'タスク',
      'amadeus.speechLang': '読み上げ言語（音声）',
      'amadeus.speechLangHint':
        '「システムに合わせる」は UI / 本文と同じ。別言語は config/tts-config.js の byLocale を使用。システム言語と異なる場合は TTS のみ翻訳し、吹き出しは原文のまま。',
      'amadeus.speechFollow': 'システムに合わせる',
      'amadeus.time.justNow': 'たった今',
      'amadeus.memory.empty': '長期記憶はまだありません。会話が進むと重要な事実が保存されます。',
      'amadeus.memory.clearAll': '記憶をすべて消去',
      'amadeus.memory.expand': '開く',
      'amadeus.memory.collapse': '閉じる',
      'amadeus.memory.title': '長期記憶',
      'settings.section.lang': '表示と言語',
      'settings.aetherLang': 'システム言語',
      'settings.aetherLangHint': 'UI の文言と、AMADEUS の返答言語の指定に使います。',
      'settings.ttsChannel': '読み上げチャネル',
      'settings.ttsConfigHint':
        'Fish / SiliconFlow の API キー・クローン reference・声線・モデルは <code>config/tts-config.js</code> で設定。ルートは共通、<code>byLocale.zh/en/ja</code> は助手の読み上げ言語でマージ。',
      'settings.ttsAutoRead': '返信を自動読み上げ',
      'settings.ttsAutoReadHint':
        'オンかつ読み上げ言語＝システム言語のとき、Fish 一括音声またはセグメント TTS と吹き出し表示を同期します。',
      'settings.previewTts': 'TTS を試聴',
      'settings.saved': '設定を保存しました',
      'settings.save': '設定を保存',
      'settings.saveCaption': 'スクロールして確認してください。保存してからページを離れてください。',
      'settings.profileHint': 'お名前や自己紹介はプロフィールで管理してください。AIが参照します。',
      'settings.goProfile': 'プロフィール編集',
      'settings.section.appearance': '外観',
      'settings.appearanceHint': 'テーマを選択',
      'theme.cozy.name': 'コージー', 'theme.cozy.desc': '暖色系・ラウンド・快適',
      'theme.scifi.name': 'SF', 'theme.scifi.desc': 'ネオン・クール・テック',
      'theme.pressure.name': 'プレッシャー', 'theme.pressure.desc': '緊迫・ハイコントラスト・集中',
      'settings.section.role': 'AIロール',
      'settings.roleHint': 'デフォルトのAIロールを選択',
      'settings.section.model': 'AIモデル',
      'settings.modelProvider': '使用中のAIプロバイダー',
      'settings.model': 'モデル',
      'settings.openaiBase': '互換APIベースURL（任意）',
      'settings.section.amadeus': 'AIキャラ設定',
      'settings.amadeus.name': '表示名',
      'settings.amadeus.nameHint': 'アシスタントページのタイトルと挨拶に使用されます。',
      'settings.amadeus.profile': 'エージェントプロフィール',
      'settings.amadeus.kb': 'ナレッジベースアクセス',
      'settings.amadeus.scholar': '学術検索（OpenAlex）',
      'settings.amadeus.scholarOff': 'オフ',
      'settings.amadeus.scholarAuto': '自動（学術キーワードでトリガー）',
      'settings.amadeus.scholarAlways': '常時（毎回検索、使用注意）',
      'settings.tts.auto': '自動（Fish優先、フォールバック）',
      'settings.tts.fish': 'Fishのみ（失敗時ブラウザ）',
      'settings.tts.siliconflow': 'SiliconFlowのみ',
      'settings.tts.browser': 'ブラウザのみ',
      'settings.section.log': '診断ログ',
      'settings.log.export': '診断ログ書き出し (.txt)',
      'settings.section.github': 'GitHub同期',
      'settings.github.upload': '↑ GitHubにアップロード',
      'settings.github.download': '↓ GitHubからダウンロード',
      'settings.section.advanced': '詳細設定',
      'settings.section.danger': '危険領域',
      'settings.danger.hint': '取り消せない操作です。事前にGitHubに同期してください。',
      'settings.danger.resetTasks': 'タスクをリセット',
      'settings.danger.resetCredits': 'ポイントをリセット',
      'settings.danger.resetKb': 'ナレッジをリセット',
      'settings.danger.clearChat': '会話履歴を削除',
      'settings.danger.clearAll': '全ローカルデータを削除',
      'chat.noApiKey': '設定でAI APIキーを先に設定してください',
      'chat.todayEmpty': '今日のタスクはありません。タスクページで追加してください。',
    },
  };

  function currentLang() {
    try {
      if (window.AetherStorage && typeof window.AetherStorage.getSettings === 'function') {
        var L = String(window.AetherStorage.getSettings().aetherLang || 'zh').toLowerCase();
        if (L === 'en' || L === 'ja' || L === 'zh') return L;
      }
    } catch (e) {}
    return 'zh';
  }

  function t(key) {
    var lang = currentLang();
    var table = STR[lang] || STR.zh;
    if (table[key] != null) return table[key];
    return STR.zh[key] != null ? STR.zh[key] : key;
  }

  function htmlLangAttr() {
    var L = currentLang();
    if (L === 'en') return 'en';
    if (L === 'ja') return 'ja';
    return 'zh-CN';
  }

  function applyDocumentLang() {
    try {
      document.documentElement.lang = htmlLangAttr();
    } catch (e) {}
  }

  function applyNavLabels() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (!k) return;
      var text = t(k);
      if (el.classList && el.classList.contains('nav-label')) el.textContent = text;
      else el.textContent = text;
      var tip = el.closest('button') || el.closest('[title]');
      if (tip && tip.tagName === 'BUTTON' && !tip.getAttribute('data-title-fixed')) tip.title = text;
    });
  }

  function amadeusWelcomeText(settings, profile) {
    var lang = currentLang();
    var assistantName = ((settings.amadeusName || 'AMADEUS').trim() || 'AMADEUS');
    var disp = (profile.name || '').trim();
    var nameBit = disp ? (lang === 'en' ? ', ' + disp : lang === 'ja' ? '、' + disp + 'さん' : '，' + disp) : '';
    var ltm = window.AetherStorage.getLTM();
    var tasks = window.AetherStorage.getTasks().filter(function (x) {
      return x.status !== 'completed';
    });
    var completed = window.AetherStorage.getCompletedToday();
    if (lang === 'en') {
      var w = 'Hello' + nameBit + ". I'm " + assistantName + '.';
      if (ltm.length > 0) w += '\n\nI keep ' + ltm.length + ' long-term memories about you—you do not need to reintroduce yourself every time.';
      if (tasks.length > 0) w += '\n\nYou have ' + tasks.length + ' open tasks and finished ' + completed.length + ' today. What would you like to work on?';
      else w += '\n\nYour task list is clear for today—nice. Any new goals to talk through?';
      return w;
    }
    if (lang === 'ja') {
      var j = 'こんにちは' + nameBit + '。私は ' + assistantName + ' です。';
      if (ltm.length > 0) j += '\n\nあなたについての長期記憶が ' + ltm.length + ' 件あります。毎回自己紹介しなくて大丈夫です。';
      if (tasks.length > 0) j += '\n\n未完了タスクが ' + tasks.length + ' 件、今日完了したのは ' + completed.length + ' 件です。何から手を付けますか？';
      else j += '\n\n今日のタスクは空です。新しい目標について話しましょうか？';
      return j;
    }
    var z = '你好' + nameBit + '。我是 ' + assistantName + '。';
    if (ltm.length > 0) z += '\n\n我保存着 ' + ltm.length + ' 条关于你的长期记忆——你不需要每次都重新介绍自己。';
    if (tasks.length > 0) z += '\n\n你目前有 ' + tasks.length + ' 项待处理任务，今天已完成 ' + completed.length + ' 项。有什么我可以帮你的吗？';
    else z += '\n\n今天任务列表清空了——不错的状态。有什么新的目标想讨论吗？';
    return z;
  }

  function previewTtsPhrase() {
    return t('tts.preview');
  }

  window.AetherI18n = {
    t: t,
    currentLang: currentLang,
    htmlLangAttr: htmlLangAttr,
    applyDocumentLang: applyDocumentLang,
    applyNavLabels: applyNavLabels,
    amadeusWelcomeText: amadeusWelcomeText,
    previewTtsPhrase: previewTtsPhrase,
    viewTitle: function (viewId) {
      return t('view.' + viewId);
    },
  };
})();
