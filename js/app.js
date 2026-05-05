/* ===================================================
   AETHER — Main Application Controller  v2
   =================================================== */

(function () {
  'use strict';

  // ---- State ----
  let currentView   = 'dashboard';
  let taskFilter    = 'active';
  let chatStreaming  = false;
  let calendarDate  = new Date();
  let selectedCalDate = null;
  let rewardsTab    = 'redeem';        // 'records' | 'redeem' — 默认展示积分兑换
  let kbResources   = [];              // temp resources while editing KB entry
  let kbCurrentEntry = null;           // temp entry being edited
  /** 固定单一界面风格：科幻（scifi） */
  const LOCKED_THEME = 'scifi';
  let currentTheme = LOCKED_THEME;
  /** AI 拆解弹窗中待应用的子任务数组（避免在 HTML onclick 内嵌 JSON 导致引号损坏） */
  let pendingAIDecompose = null;

  /** 个人档案未保存改动 */
  let dirtyProfile = false;
  /** 设置页未保存改动 */
  let dirtySettings = false;

  // ---- Live2D state ----
  let _l2dApp   = null;   // PIXI.Application instance
  let _l2dModel = null;   // Live2D model instance
  let _l2dReady = false;  // successfully loaded
  let _l2dResizeObs = null;
  let _l2dMouthInterval = null;  // mouth animation timer
  let _bgRainRaf        = null;  // background rain animation frame id (character panel)
  let _layoutTechBgRaf  = null;  // full chat layout tech background canvas
  // Track background LTM extraction trigger
  let _amadeusMsgCount = 0;

  /** 编辑中的独立知识点条目 id（用于「我的知识点」） */
  let kbCustomDraftId = null;

  function getDisplayName() {
    const p = AetherStorage.getProfile();
    const s = AetherStorage.getSettings();
    const n = ((p.name || '').trim() || (s.userName || '').trim());
    const defUser = window.AetherI18n && typeof window.AetherI18n.t === 'function' ? AetherI18n.t('common.user') : '用户';
    return n || defUser;
  }

  /** 侧栏顶部：当前角色 logo（ama/tea/ser/par）；加载失败则回退为首字占位 */
  function bindSidebarRoleAvatar(roleKey) {
    const wrap = document.getElementById('sidebar-role-avatar');
    if (!wrap) return;
    const img = wrap.querySelector('.sidebar-role-avatar-img');
    const fb = wrap.querySelector('.sidebar-role-avatar-fallback');
    if (!img) return;
    const role = AetherAI.getRole(roleKey || 'assistant');
    const ch = (role.iconText || (role.name && role.name.charAt(0)) || '·').trim();
    if (fb) fb.textContent = ch;
    const src = typeof AetherAI.getRoleLogoSrc === 'function' ? AetherAI.getRoleLogoSrc(roleKey) : 'img/ama.png';
    img.onload = function () {
      img.style.display = 'block';
      if (fb) fb.style.display = 'none';
    };
    img.onerror = function () {
      img.style.display = 'none';
      if (fb) fb.style.display = 'flex';
    };
    img.src = src;
  }

  /** 任务模板缩略：无图标字符时用名称首字（积分中心兑换项不使用此函数，保留其 emoji） */
  function taskTplGlyph(t) {
    const e = t && t.emoji != null ? String(t.emoji).trim() : '';
    if (e) return e;
    const n = t && t.name ? String(t.name).trim() : '';
    return n ? n.charAt(0) : '·';
  }

  function branchGlyph(b) {
    const e = b && b.emoji != null ? String(b.emoji).trim() : '';
    if (e) return e;
    const n = b && b.name ? String(b.name).trim() : '';
    return n ? n.charAt(0) : '枝';
  }

  /** 将旧版「设置里的用户名」迁入个人档案（一次性数据） */
  function migrateLegacyUserNameIntoProfile() {
    const s = AetherStorage.getSettings();
    const p = AetherStorage.getProfile();
    if ((p.name || '').trim()) return;
    const un = (s.userName || '').trim();
    if (un && un !== '用户') AetherStorage.saveProfile({ name: un });
  }

  const VIEWS = {
    dashboard: { title: '仪表盘'  },
    tasks:     { title: '任务管理' },
    calendar:  { title: '任务日历' },
    daily:     { title: '每日任务' },
    branches:  { title: '长期任务' },
    chat:      { title: 'AI 助手 · AMADEUS' },
    knowledge: { title: '知识库'  },
    rewards:   { title: '积分中心' },
    profile:   { title: '个人档案' },
    settings:  { title: '设置'    },
  };

  function resolveSpeechBCP47(settings) {
    const s = settings || AetherStorage.getSettings();
    let speech = String(s.amadeusSpeechLang || '').trim().toLowerCase();
    if (!speech || speech === 'same') speech = String(s.aetherLang || 'zh').toLowerCase();
    const m = { zh: 'zh-CN', en: 'en-US', ja: 'ja-JP' };
    return m[speech] || 'zh-CN';
  }

  function resolveEffectiveSpeechLangKey(settings) {
    const s = settings || AetherStorage.getSettings();
    let speech = String(s.amadeusSpeechLang || '').trim().toLowerCase();
    if (!speech || speech === 'same') speech = String(s.aetherLang || 'zh').toLowerCase();
    if (speech === 'en' || speech === 'ja' || speech === 'zh') return speech;
    return 'zh';
  }

  function resolveSystemLangKey(settings) {
    const v = String((settings || AetherStorage.getSettings()).aetherLang || 'zh').toLowerCase();
    if (v === 'en' || v === 'ja' || v === 'zh') return v;
    return 'zh';
  }

  /**
   * 朗读与 TTS：按朗读语种合并 tts-config 的 byLocale；translate = 朗读语种 ≠ 系统语言。
   */
  function resolveAmadeusVoiceTtsState(settings) {
    const s = settings || AetherStorage.getSettings();
    const systemLangKey = resolveSystemLangKey(s);
    const speechLangKey = resolveEffectiveSpeechLangKey(s);
    const speechBcp = resolveSpeechBCP47(s);
    const translate = speechLangKey !== systemLangKey;
    const merged =
      window.AetherAmadeusVoice && typeof window.AetherAmadeusVoice.peekMergedTtsConfig === 'function'
        ? window.AetherAmadeusVoice.peekMergedTtsConfig(speechBcp)
        : {};
    return {
      systemLangKey,
      speechLangKey,
      speechBcp,
      translate,
      siliconflowVoiceId: merged.siliconflowVoiceId,
      fishAudioReferenceId: merged.fishAudioReferenceId,
      fishAudioModel: merged.fishAudioModel,
      fishAudioCloneModelPolicy: merged.fishAudioCloneModelPolicy,
    };
  }

  // ---- Image clock helpers ----
  function buildTimeDigitHtml(timeStr) {
    // timeStr e.g. "14:35" — each char maps to an image
    return timeStr.split('').map(function(ch) {
      if (ch === ':') {
        return '<img src="img/colon.png" class="time-digit time-colon" alt=":">';
      }
      return '<img src="img/numbers-' + ch + '.png" class="time-digit" alt="' + ch + '">';
    }).join('');
  }

  function updateDashboardClock() {
    var el = document.getElementById('dash-time-digits');
    if (!el) return;
    var now = new Date();
    var hh = now.getHours().toString().padStart(2, '0');
    var mm = now.getMinutes().toString().padStart(2, '0');
    el.innerHTML = buildTimeDigitHtml(hh + ':' + mm);
  }

  // ---- Boot ----
  document.addEventListener('DOMContentLoaded', () => {
    const savedSettings = AetherStorage.getSettings();
    currentTheme = LOCKED_THEME;
    applyTheme();
    renderShell();
    bindNav();
    navigateTo('dashboard');
    migrateLegacyUserNameIntoProfile();
    if (window.AetherI18n) {
      AetherI18n.applyDocumentLang();
      AetherI18n.applyNavLabels();
    }
    checkFirstRun();
    // Live clock: update time digits every 10 s without re-rendering whole dashboard
    setInterval(updateDashboardClock, 10000);
    window.addEventListener('beforeunload', (e) => {
      if (!dirtyProfile && !dirtySettings) return;
      e.preventDefault();
      e.returnValue = '';
    });
  });

  function renderShell() {
    document.getElementById('top-header').innerHTML = `
      <div class="header-left" aria-hidden="true"></div>
      <div class="header-right">
        <div class="credit-chip">
          <span class="credit-chip-label" data-i18n="header.remainingCredits">剩余积分</span>
          <span class="star" aria-hidden="true">✦</span>
          <span id="header-credits">0</span>
        </div>
        <div class="role-badge" onclick="App.openRoleModal()">
          <img class="role-badge-logo" id="role-badge-logo" src="img/ama.png" alt="" width="26" height="26" decoding="async">
          <span id="role-badge-name">助手</span>
        </div>
      </div>`;
    updateHeaderCredits();
    updateRoleBadge();
  }

  function updateHeaderCredits() {
    const { balance } = AetherStorage.getCredits();
    const el = document.getElementById('header-credits');
    if (el) el.textContent = balance >= 10000 ? (balance/1000).toFixed(1)+'k' : balance.toLocaleString();
  }

  function updateRoleBadge() {
    const settings = AetherStorage.getSettings();
    const role = AetherAI.getRole(settings.currentRole);
    const logo = document.getElementById('role-badge-logo');
    const n = document.getElementById('role-badge-name');
    if (logo) {
      logo.src =
        typeof AetherAI.getRoleLogoSrc === 'function'
          ? AetherAI.getRoleLogoSrc(settings.currentRole)
          : 'img/ama.png';
      logo.alt = role.name || '';
    }
    if (n) n.textContent = role.name;
    bindSidebarRoleAvatar(settings.currentRole);
  }

  function applyTheme() {
    currentTheme = LOCKED_THEME;
    document.documentElement.dataset.theme = LOCKED_THEME;
  }

  function setTheme() {
    applyTheme();
    AetherStorage.saveSettings({ theme: LOCKED_THEME });
  }

  function bindNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => { if (btn.dataset.view) navigateTo(btn.dataset.view); });
    });
  }

  function openUnsavedChangesModal(which, targetView) {
    const label = which === 'profile' ? '个人档案' : '系统设置';
    openModal('未保存的修改',
      `<p style="color:var(--text-secondary)">${label}尚有未写入的改动。</p>
       <p style="color:var(--text-muted);font-size:.82rem;margin-top:10px">选择「保存并离开」会保存后再跳转；「不保存」则丢弃本轮编辑。</p>`,
      [
        { label: '留在此页', class: 'btn btn-ghost', action: closeModal },
        { label: '不保存离开', class: 'btn btn-danger', action: () => {
          closeModal();
          if (which === 'profile') dirtyProfile = false;
          else dirtySettings = false;
          navigateTo(targetView, { bypassDirtyGuard: true });
        }},
        { label: '保存并离开', class: 'btn btn-primary', action: () => {
          closeModal();
          if (which === 'profile') {
            saveProfileWithoutToast(); dirtyProfile = false;
            showToast('档案已保存', 'success');
          } else {
            saveSettingsQuiet(); dirtySettings = false;
            showToast('设置已保存', 'success');
          }
          navigateTo(targetView, { bypassDirtyGuard: true });
        }},
      ]);
  }

  /** 供「保存并离开」：不弹出重复 Toast，最后统一 toast */
  function saveProfileWithoutToast() {
    const name = document.getElementById('p-name')?.value.trim()||'';
    AetherStorage.saveProfile({
      name,
      age: document.getElementById('p-age')?.value.trim()||'',
      occupation: document.getElementById('p-occupation')?.value.trim()||'',
      bio: document.getElementById('p-bio')?.value.trim()||'',
      longTermGoals: document.getElementById('p-goals')?.value.trim()||'',
      currentFocus: document.getElementById('p-focus')?.value.trim()||'',
      concerns: document.getElementById('p-concerns')?.value.trim()||'',
      traits: document.getElementById('p-traits')?.value.trim()||'',
    });
    AetherStorage.saveSettings({ userName: name || '用户' });
  }

  /** 同上：不写 Toast，供离开确认链路 */
  function saveSettingsQuiet() {
    AetherStorage.saveSettings({
      apiKey:   document.getElementById('s-apikey')?.value.trim()||'',
      aiModel:  document.getElementById('s-model')?.value||'claude-opus-4-6',
      githubToken: document.getElementById('s-ghtoken')?.value.trim()||'',
      githubGistId: document.getElementById('s-gistid')?.value.trim()||'',
      currentRole: document.querySelector('.role-card.active')?.dataset.role||'assistant',
      theme: LOCKED_THEME,
      llmProvider:   document.querySelector('.llm-provider-card.active')?.dataset.provider || 'claude',
      openaiKey:     document.getElementById('s-openai-key')?.value.trim()||'',
      openaiModel:   document.getElementById('s-openai-model')?.value||'gpt-4o',
      openaiBaseUrl: document.getElementById('s-openai-base')?.value.trim()||'',
      geminiKey:     document.getElementById('s-gemini-key')?.value.trim()||'',
      geminiModel:   document.getElementById('s-gemini-model')?.value||'gemini-2.0-flash',
      kimiKey:       document.getElementById('s-kimi-key')?.value.trim()||'',
      kimiModel:     document.getElementById('s-kimi-model')?.value||'moonshot-v1-8k',
      deepseekKey:   document.getElementById('s-deepseek-key')?.value.trim()||'',
      deepseekModel: document.getElementById('s-deepseek-model')?.value||'deepseek-chat',
      amadeusName:     document.getElementById('s-amadeus-name')?.value?.trim()||'AMADEUS',
      amadeusVoiceEnabled: (() => {
        const el = document.getElementById('s-amadeus-voice');
        if (el) return !!el.checked;
        return AetherStorage.getSettings().amadeusVoiceEnabled !== false;
      })(),
      aetherLang: document.getElementById('s-aether-lang')?.value || AetherStorage.getSettings().aetherLang || 'zh',
      amadeusTtsMode:        document.getElementById('s-amadeus-tts-mode')?.value||'auto',
      amadeusAgentProfile:   document.getElementById('s-amadeus-agent-profile')?.value?.trim() || 'AMADEUS',
      assistantKbFullExtract: (() => {
        const el = document.getElementById('s-amadeus-kb-full');
        if (el) return !!el.checked;
        return AetherStorage.getSettings().assistantKbFullExtract !== false;
      })(),
      assistantScholarSearchMode:
        document.getElementById('s-amadeus-scholar-mode')?.value || 'auto',
      openAlexMailTo: (() => {
        const el = document.getElementById('s-openalex-mail');
        if (el) return el.value.trim();
        return (AetherStorage.getSettings().openAlexMailTo || '').trim();
      })(),
    });
    updateRoleBadge();
  }

  function navigateTo(view, opts) {
    const bypass = opts && opts.bypassDirtyGuard;
    if (!VIEWS[view]) return;
    if (!bypass) {
      if (dirtyProfile && currentView === 'profile' && view !== 'profile') {
        openUnsavedChangesModal('profile', view);
        return;
      }
      if (dirtySettings && currentView === 'settings' && view !== 'settings') {
        openUnsavedChangesModal('settings', view);
        return;
      }
    }
    // Destroy Live2D when leaving chat view
    if (currentView === 'chat' && view !== 'chat') {
      destroyLive2D();
      stopChatTechBg();
      if (_bgRainRaf) { cancelAnimationFrame(_bgRainRaf); _bgRainRaf = null; }
      if (window.AetherAmadeusVoice) window.AetherAmadeusVoice.cancel();
    }
    currentView = view;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
    switch (view) {
      case 'dashboard': renderDashboard(); break;
      case 'tasks':     renderTasks();     break;
      case 'calendar':  renderCalendar();  break;
      case 'daily':     renderDaily();     break;
      case 'branches':  renderBranches();  break;
      case 'chat':      renderChat();      break;
      case 'knowledge': renderKnowledge(); break;
      case 'rewards':   renderRewards();   break;
      case 'profile':   renderProfile();   break;
      case 'settings':  renderSettings();  break;
    }
  }

  function checkFirstRun() {
    const s = AetherStorage.getSettings();
    if (!AetherAI.hasConfiguredKey(s)) {
      setTimeout(() => {
        const msg =
          window.AetherI18n && typeof window.AetherI18n.t === 'function'
            ? AetherI18n.t('toast.firstRun')
            : '欢迎使用 AETHER！请在设置中选择 AI 提供商并填写对应 API Key 以启用对话与智能功能';
        showToast(msg, 'info', 5200);
      }, 800);
    }
  }

  // ============================================================
  // DASHBOARD
  // ============================================================

  function renderDashboard() {
    const view = document.getElementById('view-dashboard');
    const settings = AetherStorage.getSettings();
    const completedToday = AetherStorage.getCompletedToday();
    const stats = AetherStorage.getStats();
    const credits = AetherStorage.getCredits();
    const tasks = AetherStorage.getTasks();
    const todayTasks = AetherStorage.getTodayTasks();
    const recentTasks = getRecentPendingTasks();
    const recentTx = credits.transactions.slice(0, 6);
    const hour = new Date().getHours();
    const pendingCount = todayTasks.filter(t => t.status !== 'completed').length;
    const todayKB = AetherStorage.getTodayKBEntry();
    // Daily habits stats
    const dailyTasks = AetherStorage.getDailyTasks();
    const dailyDoneCount = dailyTasks.filter(t => AetherStorage.isDailyTaskCompletedToday(t)).length;
    const kbCtx = AetherStorage.getKBAIContext();

    const THEME_HERO = {
      cozy: {
        greeting: hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好',
        subtitle: pendingCount > 0
          ? `今天还有 ${pendingCount} 件事，慢慢来`
          : '今日任务全部完成，好好休息吧',
      },
      scifi: {
        greeting: `<span class="hero-time-label">SYSTEM ONLINE&ensp;·&ensp;</span><span class="hero-time-digits" id="dash-time-digits">${buildTimeDigitHtml(hour.toString().padStart(2,'0') + ':' + new Date().getMinutes().toString().padStart(2,'0'))}</span>`,
        subtitle: pendingCount > 0
          ? `PENDING TASKS: ${pendingCount} · MISSION IN PROGRESS`
          : 'ALL TASKS COMPLETE · MISSION ACCOMPLISHED',
      },
      pressure: {
        greeting: hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好',
        subtitle: pendingCount > 0
          ? `还有 ${pendingCount} 项任务未完成，别拖延。`
          : '今日任务清零，保持住。',
      },
    };
    const heroText = THEME_HERO[currentTheme] || THEME_HERO.cozy;

    view.innerHTML = `
      <div class="dashboard-hero">
        <div class="hero-text">
          <h1 class="hero-greeting">${heroText.greeting}${currentTheme !== 'scifi' ? `，${getDisplayName()}` : ''}</h1>
          <p class="hero-subtitle">${heroText.subtitle}</p>
        </div>
        <div class="dashboard-hero-actions">
          <div class="dashboard-quick-actions">
            <button type="button" class="dash-quick-btn" onclick="App.openAddTaskModal()" title="新建任务">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>新建任务</span>
            </button>
            <button type="button" class="dash-quick-btn" onclick="App.navigateTo('chat')" title="AI 对话">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 0 2 2z"/></svg>
              <span>对话 AI</span>
            </button>
            <button type="button" class="dash-quick-btn" onclick="App.navigateTo('rewards')" title="积分中心">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <span>积分中心</span>
            </button>
            <button type="button" class="dash-quick-btn" id="btn-daily-summary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              <span>${todayKB ? '编辑总结' : '今日总结'}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card glass-card">
          <div class="stat-value">${completedToday.length}</div>
          <div class="stat-label">今日完成</div>
        </div>
        <div class="stat-card glass-card">
          <div class="stat-value gold">${credits.balance >= 10000 ? (credits.balance/1000).toFixed(1)+'k' : credits.balance.toLocaleString()}</div>
          <div class="stat-label">积分余额</div>
        </div>
        <div class="stat-card glass-card">
          <div class="stat-value blue">${stats.streak || 0}</div>
          <div class="stat-label">连续天数</div>
        </div>
        <div class="stat-card glass-card ${dailyTasks.length && dailyDoneCount === dailyTasks.length ? 'stat-complete' : ''}">
          <div class="stat-value ${dailyTasks.length > 0 && dailyDoneCount === dailyTasks.length ? 'green' : ''}">${dailyTasks.length > 0 ? dailyDoneCount + '/' + dailyTasks.length : '—'}</div>
          <div class="stat-label">今日习惯</div>
        </div>
      </div>
      ${renderOverdueBanner()}

      <div class="dashboard-grid">
        <div class="dashboard-panel glass-card">
          <div class="panel-header">
            <h2>近期任务</h2>
            <button class="btn-icon" onclick="App.openAddTaskModal()" title="添加">+</button>
          </div>
          ${renderMiniTaskList(recentTasks)}
        </div>
        <div class="agent-suggestions-section glass-card" id="agent-suggestions-card">
          <div class="panel-header">
            <div>
              <h2>执行建议</h2>
              <div class="section-subtitle" style="font-size:.68rem;margin-top:2px">基于档案与近期任务 · AI${kbCtx ? ` · 知识库${kbCtx.entryCount}条` : ''}</div>
            </div>
            <button class="btn btn-ghost btn-sm" id="btn-refresh-suggestions" onclick="App.refreshAgentSuggestions()">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              刷新
            </button>
          </div>
          <div id="agent-suggestions-body">
            ${renderAgentSuggestionsInit()}
          </div>
        </div>
      </div>

      <div class="dashboard-activity-strip glass-card">
        <div class="panel-header"><h2>近期动态</h2></div>
        <div class="dashboard-activity-body">${renderActivityFeed(recentTx)}</div>
      </div>`;

    document.getElementById('btn-daily-summary').addEventListener('click', openTodaySummary);
  }

  function renderOverdueBanner() {
    const today = new Date().toISOString().slice(0, 10);
    const twoDaysLater = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const pending = AetherStorage.getTasks().filter(t => t.status !== 'completed' && t.dueDate);
    const overdue = pending.filter(t => t.dueDate.slice(0, 10) < today);
    const urgentSoon = pending.filter(t => {
      const d = t.dueDate.slice(0, 10);
      return d >= today && d <= twoDaysLater && t.priority === 'high';
    });
    if (!overdue.length && !urgentSoon.length) return '';
    const parts = [];
    if (overdue.length) {
      parts.push(`<div class="overdue-banner overdue-critical">
        <div class="ob-icon">⚠</div>
        <div class="ob-content">
          <div class="ob-title">逾期任务 · ${overdue.length} 项</div>
          <div class="ob-items">${overdue.map(t=>`<span class="ob-tag ${t.priority==='high'?'ob-tag-high':''}" onclick="App.navigateTo('tasks')">${escHtml(t.title)}</span>`).join('')}</div>
        </div>
      </div>`);
    }
    if (urgentSoon.length) {
      parts.push(`<div class="overdue-banner overdue-urgent">
        <div class="ob-icon">!</div>
        <div class="ob-content">
          <div class="ob-title">紧迫任务即将到期 · 请立即处理！</div>
          <div class="ob-items">${urgentSoon.map(t=>`<span class="ob-tag ob-tag-fire" onclick="App.navigateTo('tasks')">${escHtml(t.title)} · ${t.dueDate.slice(0,10)===today?'今天到期':'明天到期'}</span>`).join('')}</div>
        </div>
      </div>`);
    }
    return parts.join('');
  }

  function getRecentPendingTasks() {
    const prRank = { high: 3, medium: 2, low: 1 };
    const sevenDaysLater = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const all = AetherStorage.getTasks().filter(t => t.status !== 'completed');
    const withDue = all.filter(t => t.dueDate && t.dueDate.slice(0, 10) <= sevenDaysLater);
    const highNoDue = all.filter(t => !t.dueDate && t.priority === 'high');
    const combined = [...new Map([...withDue, ...highNoDue].map(t => [t.id, t])).values()];
    return combined.sort((a, b) => {
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      if (a.dueDate && b.dueDate) { const dd = a.dueDate.localeCompare(b.dueDate); if (dd !== 0) return dd; }
      return (prRank[b.priority] || 1) - (prRank[a.priority] || 1);
    }).slice(0, 8);
  }

  function renderMiniTaskList(tasks) {
    if (!tasks.length) return `<div class="empty-state"><div class="empty-state-icon empty-state-dot"></div>暂无任务，点击 + 添加</div>`;
    return tasks.map(t => `
      <div class="task-mini-item ${t.status==='completed'?'completed':''}" onclick="App.quickToggleTask('${t.id}')">
        <div class="task-mini-check"></div>
        <div class="priority-dot ${t.priority}"></div>
        <span class="task-mini-title">${escHtml(t.title)}</span>
        <span style="font-size:.7rem;color:var(--gold);font-family:var(--font-mono)">${t.credits}✦</span>
      </div>`).join('');
  }

  function renderAgentSuggestionsInit() {
    const cache = AetherStorage.getSuggestionsCache();
    if (cache && Array.isArray(cache.suggestions) && cache.suggestions.length) {
      if (Date.now() - new Date(cache.savedAt).getTime() < 24 * 60 * 60 * 1000) {
        window.__aetherLastSuggestions = cache.suggestions;
        return `<div style="font-size:.7rem;color:var(--text-muted);margin-bottom:6px;padding:0 2px">上次生成：${formatTime(cache.savedAt)}</div>` + renderAgentSuggestionsList(cache.suggestions);
      }
    }
    return renderAgentSuggestionsPlaceholder();
  }

  function renderAgentSuggestionsPlaceholder() {
    const settings = AetherStorage.getSettings();
    const hasKey = AetherAI.hasConfiguredKey(settings);
    if (!hasKey) {
      return `<div class="agent-hint">配置 API Key 后，AI 将根据你的档案和任务给出个性化建议</div>`;
    }
    const profile = AetherStorage.getProfile();
    const hasProfile = !!(profile.longTermGoals || profile.concerns || profile.bio || profile.occupation);
    if (!hasProfile) {
      return `<div class="agent-hint">
        完善<button class="btn-link" onclick="App.navigateTo('profile')">个人档案</button>后，AI 可以给出更贴合你目标的建议
        <button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="App.refreshAgentSuggestions()">仍然生成建议</button>
      </div>`;
    }
    return `<div class="agent-hint">点击「刷新」让 AI 分析你的当前状态并给出建议</div>`;
  }

  async function refreshAgentSuggestions() {
    const body = document.getElementById('agent-suggestions-body');
    const btn  = document.getElementById('btn-refresh-suggestions');
    if (!body) return;
    const settings = AetherStorage.getSettings();
    if (!AetherAI.hasConfiguredKey(settings)) { showToast('请先为当前选择的提供商配置 API Key', 'error'); return; }
    body.innerHTML = `<div class="agent-loading"><div class="loading-spinner"></div><span>AI 分析中…</span></div>`;
    if (btn) { btn.disabled = true; }
    try {
      const roleKey = AetherStorage.getSettings().currentRole;
      const suggestions = await AetherAI.generateAgentSuggestions(roleKey);
      AetherStorage.saveSuggestionsCache(suggestions, roleKey);
      body.innerHTML = renderAgentSuggestionsList(suggestions);
    } catch (e) {
      body.innerHTML = `<div class="agent-hint" style="color:var(--danger)">${escHtml(e.message === 'NO_API_KEY' ? '请先配置 API Key' : '生成失败：' + e.message)}</div>`;
    } finally {
      if (btn) { btn.disabled = false; }
    }
  }

  function renderAgentSuggestionsList(suggestions) {
    if (!Array.isArray(suggestions) || !suggestions.length) return `<div class="agent-hint">暂无建议</div>`;
    window.__aetherLastSuggestions = suggestions;
    return `<div class="agent-suggestions-list">${suggestions.map((s, i) => `
      <div class="agent-suggestion-item">
        <div class="agent-suggestion-tag ${s.type === 'new_task' ? 'tag-task' : 'tag-action'}">${s.type === 'new_task' ? '推荐任务' : '执行建议'}</div>
        <div class="agent-suggestion-title">${escHtml(s.title)}</div>
        <div class="agent-suggestion-reason">${escHtml(s.reason)}</div>
        ${s.type === 'new_task' && s.taskPayload ? `
        <button class="btn btn-ghost btn-sm agent-create-btn" onclick="App.createSuggestedTask(${i})">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          创建此任务
        </button>` : ''}
      </div>`).join('')}</div>`;
  }

  let _lastSuggestions = [];
  function createSuggestedTask(idx) {
    const body = document.getElementById('agent-suggestions-body');
    if (!body) return;
    // Re-parse from DOM is fragile — use cached data
    const items = body.querySelectorAll('.agent-suggestion-item');
    // We'll store suggestions on window for simplicity
    const suggestions = window.__aetherLastSuggestions || [];
    const s = suggestions[idx];
    if (!s || !s.taskPayload) return;
    const task = AetherStorage.createTask({
      title: s.taskPayload.title || s.title,
      description: s.taskPayload.description || s.reason || '',
      priority: s.taskPayload.priority || 'medium',
      credits: s.taskPayload.credits || 10,
    });
    AetherStorage.saveTask(task);
    showToast(`任务「${task.title}」已创建`, 'success');
    renderTasks();
    renderDashboard();
  }

  function renderActivityFeed(transactions) {
    if (!transactions.length) return `<div class="empty-state"><div class="empty-state-icon empty-state-dot"></div>完成任务后这里会有记录</div>`;
    return transactions.map(tx => `
      <div class="activity-item">
        <div class="activity-icon ${tx.type}">${tx.type==='earn'?'✦':'↑'}</div>
        <div class="activity-text">
          <div class="activity-desc">${escHtml(tx.description)}</div>
          <div class="activity-time">${formatTime(tx.timestamp)}</div>
        </div>
        <div class="activity-amount ${tx.type}">${tx.type==='earn'?'+':'-'}${tx.amount}</div>
      </div>`).join('');
  }

  function quickToggleTask(id) {
    const task = AetherStorage.getTask(id);
    if (!task) return;
    if (task.subtasks && task.subtasks.length) { navigateTo('tasks'); return; }
    if (task.status === 'completed') {
      AetherStorage.uncompleteTask(id);
      showToast('已撤销完成，积分已按规则扣回', 'info', 3500);
      updateHeaderCredits(); renderDashboard();
      return;
    }
    const completed = AetherStorage.completeTask(id);
    if (completed) {
      showCreditPop(completed.credits, document.querySelector(`[onclick="App.quickToggleTask('${id}')"]`));
      showToast(`已完成「${completed.title}」，获得 ${completed.credits} 积分`, 'gold');
      if (completed.branchId) tryAdvanceBranch(completed.branchId);
      updateHeaderCredits(); renderDashboard();
    }
  }

  // ============================================================
  // TODAY'S SUMMARY → KNOWLEDGE BASE
  // ============================================================

  async function openTodaySummary() {
    const existing = AetherStorage.getTodayKBEntry();
    kbCurrentEntry = existing ? { ...existing } : AetherStorage.createKBEntry();
    kbResources = [...(kbCurrentEntry.resources || [])];

    openLargeModal('今日总结', buildKBModalBody(kbCurrentEntry), [
      { label: '取消', class: 'btn btn-ghost', action: closeModal },
      { label: '保存到知识库', class: 'btn btn-primary', action: saveKBFromModal },
    ]);

    // Auto-generate AI summary if empty
    const settings = AetherStorage.getSettings();
    if (!kbCurrentEntry.aiSummary && AetherAI.hasConfiguredKey(settings)) {
      const summaryEl = document.getElementById('kb-ai-output');
      if (summaryEl) summaryEl.innerHTML = '<span class="loading-spinner"></span> 正在生成…';
      try {
        const summary = await AetherAI.generateTodaySummary(settings.currentRole);
        kbCurrentEntry.aiSummary = summary;
        if (summaryEl) summaryEl.textContent = summary;
      } catch (e) {
        if (summaryEl) summaryEl.innerHTML = `<span style="color:var(--danger);font-size:.82rem">生成失败：${escHtml(e.message)}</span>`;
      }
    }
  }

  function buildKBModalBody(entry) {
    const hasLlm = AetherAI.hasConfiguredKey(AetherStorage.getSettings());
    const aiPlaceholder = entry.aiSummary
      ? escHtml(entry.aiSummary)
      : (!hasLlm
        ? '<span style="color:var(--text-muted);font-size:.82rem">未配置 API Key，可手动填写下方内容。</span>'
        : '<span style="color:var(--text-muted);font-size:.82rem"><span class="loading-spinner"></span> 准备生成…</span>');
    return `
      <div class="kb-section">
        <div class="kb-section-label">AI 今日总结</div>
        <div id="kb-ai-output" class="kb-ai-content">${aiPlaceholder}</div>
      </div>
      <div class="form-group">
        <label class="form-label">我的想法</label>
        <textarea class="form-textarea" id="kb-thoughts" placeholder="今天的感悟、思考…" style="min-height:80px">${escHtml(entry.thoughts||'')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">今日所学</label>
        <textarea class="form-textarea" id="kb-learnings" placeholder="学到了哪些新知识、技能或观点？" style="min-height:80px">${escHtml(entry.learnings||'')}</textarea>
      </div>
      ${hasLlm ? `
      <div class="kb-polish-row">
        <button type="button" class="btn btn-ghost btn-sm kb-polish-btn" id="btn-kb-polish" onclick="App.polishKBEntry()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 8v4l3 3"/><path d="M22 2L12 12"/></svg>
          AI 梳理为日记
        </button>
        <span class="settings-hint" style="font-size:.72rem">将想法和所学整理为日记体，填入「AI 今日总结」</span>
      </div>` : ''}
      <div class="form-group">
        <label class="form-label">资源链接</label>
        <div id="kb-res-list" class="kb-res-list">${renderKBResList()}</div>
        <div class="kb-add-res">
          <input type="text" class="form-input" id="kb-res-title" placeholder="链接标题（如：XX 文章）">
          <input type="url"  class="form-input" id="kb-res-url"   placeholder="https://…">
          <button class="btn btn-ghost btn-sm" onclick="App.addKBResource()">+ 添加</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">标签</label>
        <input type="text" class="form-input" id="kb-tags" value="${escHtml(entry.tags||'')}" placeholder="学习, 工作, 生活（逗号分隔）">
      </div>`;
  }

  function renderKBResList() {
    if (!kbResources.length) return '<div style="color:var(--text-muted);font-size:.78rem;padding:4px 0">暂无链接</div>';
    return kbResources.map((r, i) => `
      <div class="kb-res-item">
        <span class="kb-res-title">${escHtml(r.title)}</span>
        <a href="${escHtml(r.url)}" target="_blank" class="kb-res-url" title="${escHtml(r.url)}">${escHtml(r.url.length>40 ? r.url.slice(0,40)+'…' : r.url)}</a>
        <button class="btn-icon" onclick="App.removeKBResource(${i})" style="font-size:.7rem;color:var(--danger)">✕</button>
      </div>`).join('');
  }

  function addKBResource() {
    const title = document.getElementById('kb-res-title')?.value.trim();
    const url   = document.getElementById('kb-res-url')?.value.trim();
    if (!url) { showToast('请填写链接地址', 'error'); return; }
    kbResources.push({ id: AetherStorage.genId(), title: title || url, url });
    document.getElementById('kb-res-title').value = '';
    document.getElementById('kb-res-url').value = '';
    const list = document.getElementById('kb-res-list');
    if (list) list.innerHTML = renderKBResList();
  }

  function removeKBResource(idx) {
    kbResources.splice(idx, 1);
    const list = document.getElementById('kb-res-list');
    if (list) list.innerHTML = renderKBResList();
  }

  function saveKBFromModal() {
    const aiSummary = document.getElementById('kb-ai-output')?.textContent?.trim() || kbCurrentEntry.aiSummary;
    const entry = {
      ...kbCurrentEntry,
      aiSummary: kbCurrentEntry.aiSummary || aiSummary,
      thoughts:  document.getElementById('kb-thoughts')?.value.trim() || '',
      learnings: document.getElementById('kb-learnings')?.value.trim() || '',
      resources: [...kbResources],
      tags:      document.getElementById('kb-tags')?.value.trim() || '',
      updatedAt: new Date().toISOString(),
    };
    AetherStorage.saveKBEntry(entry);
    closeModal();
    showToast('已保存到知识库', 'success');
    if (currentView === 'knowledge') renderKnowledge();
    if (currentView === 'dashboard') renderDashboard();
    // Silent background AI sync
    const settings = AetherStorage.getSettings();
    if (AetherAI.hasConfiguredKey(settings)) {
      const entries = AetherStorage.getKBEntries();
      const customs = AetherStorage.getKBCustomEntries();
      AetherAI.generateKBContext(entries, customs)
        .then(summary => AetherStorage.saveKBAIContext(summary, entries.length + customs.length))
        .catch(() => {}); // silent — no toast, no error
    }
  }

  async function polishKBEntry() {
    const btn = document.getElementById('btn-kb-polish');
    const thoughts = document.getElementById('kb-thoughts')?.value.trim() || '';
    const learnings = document.getElementById('kb-learnings')?.value.trim() || '';
    if (!thoughts && !learnings) { showToast('请先填写想法或所学内容', 'info'); return; }
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loading-spinner" style="width:10px;height:10px;border-width:1.5px;display:inline-block"></span> 生成中…'; }
    try {
      const settings = AetherStorage.getSettings();
      const polished = await AetherAI.polishDiaryEntry(thoughts, learnings, settings.currentRole);
      kbCurrentEntry.aiSummary = polished;
      const outEl = document.getElementById('kb-ai-output');
      if (outEl) outEl.textContent = polished;
      showToast('日记已生成', 'success');
    } catch (e) {
      showToast('生成失败：' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 8v4l3 3"/><path d="M22 2L12 12"/></svg> AI 梳理为日记'; }
    }
  }

  // ============================================================
  // TASKS VIEW
  // ============================================================

  function renderTasks() {
    const view = document.getElementById('view-tasks');
    view.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">任务管理</div>
          <div class="section-subtitle">TASK MANAGEMENT</div>
        </div>
        <button class="btn btn-primary" onclick="App.openAddTaskModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新建任务
        </button>
      </div>
      <div class="tasks-toolbar">
        <div class="filter-tabs">
          <button class="filter-tab ${taskFilter==='all'?'active':''}"       onclick="App.setFilter('all')">全部</button>
          <button class="filter-tab ${taskFilter==='active'?'active':''}"    onclick="App.setFilter('active')">进行中</button>
          <button class="filter-tab ${taskFilter==='completed'?'active':''}" onclick="App.setFilter('completed')">已完成</button>
        </div>
      </div>
      <div class="tasks-list" id="tasks-list">${renderTaskCards()}</div>`;
  }

  function sortTasksForDisplay(arr) {
    const prRank = { high: 3, medium: 2, low: 1 };
    return [...arr].sort((a, b) => {
      const aActive = a.status !== 'completed' ? 1 : 0;
      const bActive = b.status !== 'completed' ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;
      const pd = (prRank[b.priority] || 1) - (prRank[a.priority] || 1);
      if (pd !== 0) return pd;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }

  function renderTaskCards() {
    let tasks = AetherStorage.getTasks();
    if (taskFilter === 'active')    tasks = tasks.filter(t => t.status !== 'completed');
    if (taskFilter === 'completed') tasks = tasks.filter(t => t.status === 'completed');
    tasks = sortTasksForDisplay(tasks);
    if (!tasks.length) {
      const emptyMsg = taskFilter === 'completed' ? '暂无已完成的任务'
        : taskFilter === 'active' ? '暂无进行中的任务'
          : '没有任务，点击新建开始吧';
      return `<div class="empty-state" style="padding:48px 0"><div class="empty-state-icon empty-state-dot"></div>${emptyMsg}</div>`;
    }
    return tasks.map(renderTaskCard).join('');
  }

  function getTaskUrgencyInfo(task) {
    if (task.status === 'completed' || !task.dueDate) return null;
    const today = new Date().toISOString().slice(0, 10);
    const due = task.dueDate.slice(0, 10);
    const twoDays = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    if (due < today) return { type: 'overdue', label: `逾期 ${Math.round((Date.now() - new Date(due + 'T00:00:00').getTime()) / 86400000)} 天` };
    if (due <= twoDays && task.priority === 'high') return { type: 'fire', label: due === today ? '今天截止！' : '明天截止！' };
    if (due <= twoDays) return { type: 'soon', label: due === today ? '今天到期' : '明天到期' };
    return null;
  }

  function renderTaskCard(task) {
    const subs = task.subtasks || [];
    const done = subs.filter(s => s.completed).length;
    const total = subs.length;
    const pct = total ? Math.round(done/total*100) : 0;
    const incompleteSubs = total > 0 && done < total;
    const urgency = getTaskUrgencyInfo(task);
    return `
      <div class="task-card ${task.status} ${urgency ? 'task-card-'+urgency.type : ''}" id="tc-${task.id}" data-priority="${task.priority}">
        ${urgency?.type === 'fire' ? `<div class="task-fire-banner">${urgency.label} — 紧迫任务，请立即处理</div>` : ''}
        <div class="task-card-header">
          <div class="task-check" onclick="App.handleCompleteTask('${task.id}')" title="${task.status==='completed'?'撤销完成':'完成 / 勾选'}"></div>
          <div class="task-info" onclick="App.handleCompleteTask('${task.id}')" title="点击勾选或撤销完成">
            <div class="task-title">${escHtml(task.title)}</div>
            <div class="task-meta">
              <span class="priority-badge ${task.priority}">${{high:'紧急',medium:'普通',low:'轻松'}[task.priority]}</span>
              ${task.dueDate ? `<span class="task-meta-item">${task.dueDate.slice(0,10)}</span>` : ''}
              ${urgency ? `<span class="task-overdue-badge task-overdue-${urgency.type}">${urgency.label}</span>` : ''}
              ${total ? `<span class="task-meta-item">${done}/${total} 子任务</span>` : ''}
              ${task.branchId ? (() => { const _b = AetherStorage.getBranch(task.branchId); return _b ? `<span class="task-branch-badge">枝条 · ${_b.name}</span>` : ''; })() : ''}
            </div>
          </div>
          <div class="task-card-trailing">
            <div class="task-credits"><span>✦</span>${task.credits}</div>
            <div class="task-actions">
            <button class="btn-icon btn-sm" onclick="App.openEditTaskModal('${task.id}')" title="编辑">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon btn-sm" onclick="App.openAIDecompose('${task.id}')" title="AI 拆解" style="color:var(--ai-blue)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 8v4l3 3"/><path d="M22 2L12 12"/></svg>
            </button>
            <button class="btn-icon btn-sm" onclick="App.deleteTask('${task.id}')" title="删除" style="color:var(--danger)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            </button>
            ${total ? `<button class="task-expand-btn ${incompleteSubs ? 'open' : ''}" onclick="App.toggleSubtasks('${task.id}',this)">▼</button>` : ''}
            </div>
          </div>
        </div>
        ${total ? `
        <div class="task-subtasks ${incompleteSubs ? 'open' : ''}" id="subs-${task.id}">
          <div class="task-progress-bar"><div class="task-progress-fill" style="width:${pct}%"></div></div>
          <div class="task-subtasks-header">${done}/${total} 完成 · ${pct}%</div>
          ${subs.map(s => `
            <div class="subtask-item ${s.completed?'completed':''}" onclick="App.toggleSubtaskCompletion('${task.id}','${s.id}')">
              <div class="subtask-check"></div>
              <span class="subtask-title">${escHtml(s.title)}</span>
              <span class="subtask-credits">✦${s.credits}</span>
            </div>`).join('')}
        </div>` : ''}
      </div>`;
  }

  function setFilter(f) { taskFilter = f; renderTasks(); }
  function handleCompleteTask(id) {
    const task = AetherStorage.getTask(id);
    if (!task) return;
    if (task.status === 'completed') {
      AetherStorage.uncompleteTask(id);
      showToast('已撤销任务完成，相关积分已从余额扣回（含子任务已发积分）', 'info', 4500);
      updateHeaderCredits(); renderTasks();
      if (currentView === 'dashboard') renderDashboard();
      if (currentView === 'calendar') renderCalendar();
      return;
    }
    const subs = task.subtasks || [];
    if (subs.length && subs.some(s => !s.completed)) {
      showToast('请先完成所有子任务，或逐项点击子任务', 'info', 3800);
      return;
    }
    const completed = AetherStorage.completeTask(id);
    if (completed) {
      const popAnchor = document.getElementById(`tc-${id}`)?.querySelector('.task-check');
      showCreditPop(completed.credits, popAnchor);
      showToast(`已完成「${completed.title}」，获得 ${completed.credits} 积分`, 'gold');
      if (completed.branchId) tryAdvanceBranch(completed.branchId);
      updateHeaderCredits(); renderTasks();
      if (currentView === 'dashboard') renderDashboard();
      if (currentView === 'calendar') renderCalendar();
      if (currentView === 'branches') renderBranches();
    }
  }

  function toggleSubtaskCompletion(taskId, subId) {
    const task = AetherStorage.getTask(taskId);
    if (!task) return;
    if (task.status === 'completed') {
      AetherStorage.uncompleteTask(taskId);
      showToast('已撤销整个任务完成状态，积分已扣回', 'info', 4500);
      updateHeaderCredits(); renderTasks();
      if (currentView === 'dashboard') renderDashboard();
      if (currentView === 'calendar') renderCalendar();
      return;
    }
    const sub = (task.subtasks || []).find(s => s.id === subId);
    if (!sub) return;
    if (sub.completed) {
      AetherStorage.uncompleteSubtask(taskId, subId);
      showToast('已撤销子任务完成，对应积分已扣回', 'info', 3200);
    } else {
      AetherStorage.completeSubtask(taskId, subId);
    }
    updateHeaderCredits(); renderTasks();
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'calendar') renderCalendar();
  }
  function toggleSubtasks(taskId, btn) {
    const el = document.getElementById(`subs-${taskId}`);
    if (el) { el.classList.toggle('open'); btn.classList.toggle('open'); }
  }
  function deleteTask(id) {
    const task = AetherStorage.getTask(id); if (!task) return;
    openModal('删除任务',
      `<p style="color:var(--text-secondary)">确认删除「<strong style="color:var(--text-primary)">${escHtml(task.title)}</strong>」？</p>`,
      [{ label:'取消', class:'btn btn-ghost', action:closeModal },
       { label:'删除', class:'btn btn-danger', action:() => { AetherStorage.deleteTask(id); closeModal(); renderTasks(); showToast('任务已删除','info'); }}]);
  }

  // ---- Task Modal (Add / Edit) with Templates ----
  function appendManualSubtaskRow(partial = null) {
    const list = document.getElementById('m-subtasks-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'manual-sub-row';
    if (partial && partial.id) row.dataset.subId = partial.id;
    const title = partial?.title ?? '';
    const credits = partial?.credits != null ? partial.credits : 10;
    row.innerHTML = `
      <input type="text" class="form-input m-sub-title" placeholder="子任务标题" value="${escHtml(String(title))}">
      <input type="number" class="form-input m-sub-credits" min="1" max="500" title="完成后奖励积分" value="${credits}">
      <button type="button" class="btn btn-ghost btn-sm manual-sub-remove" aria-label="移除此项">✕</button>`;
    row.querySelector('.manual-sub-remove').addEventListener('click', () => { row.remove(); });
    list.appendChild(row);
  }

  function fillManualSubtasksFromSubs(subs, clearFirst = true) {
    const list = document.getElementById('m-subtasks-list');
    if (!list) return;
    if (clearFirst) list.innerHTML = '';
    (subs || []).forEach(s => appendManualSubtaskRow(s));
  }

  function collectManualSubtasksFromModal(editingTask) {
    const rows = document.querySelectorAll('#m-subtasks-list .manual-sub-row');
    const existing = editingTask?.subtasks || [];
    const out = [];
    rows.forEach(row => {
      const title = row.querySelector('.m-sub-title')?.value.trim();
      if (!title) return;
      const credits = parseInt(row.querySelector('.m-sub-credits')?.value, 10) || 10;
      const sid = row.dataset.subId;
      const prev = sid ? existing.find(s => s.id === sid) : null;
      out.push({
        id: sid || AetherStorage.genId(),
        title,
        description: prev?.description || '',
        credits,
        estimatedMinutes: prev?.estimatedMinutes != null ? prev.estimatedMinutes : 15,
        completed: prev ? !!prev.completed : false,
        completedAt: prev?.completedAt || null,
      });
    });
    return out;
  }

  function openAddTaskModal(prefill = {}) {
    const isEdit = !!prefill.id;
    const templates = AetherStorage.getAllTaskTemplates();
    openModal(isEdit ? '编辑任务' : '新建任务', `
      ${!isEdit ? `
      <div class="template-picker-wrap">
        <div class="template-picker-toggle" onclick="App.toggleTemplatePicker(this)">
          <span>从模板快速创建</span>
          <span class="tpl-arrow">▼</span>
        </div>
        <div class="template-grid" id="task-template-grid" style="display:none">
          ${templates.map(t => `
            <div class="tpl-card" onclick="App.applyTaskTemplate('${t.id}')">
              <div class="tpl-emoji">${escHtml(taskTplGlyph(t))}</div>
              <div class="tpl-name">${escHtml(t.name)}</div>
              <div class="tpl-meta">${t.category} · ${t.credits}✦</div>
              ${!t.isSystem ? `<button class="tpl-del" onclick="App.deleteTaskTemplate('${t.id}',event)" title="删除模板">✕</button>` : ''}
            </div>`).join('')}
          <div class="tpl-card tpl-add-new" onclick="App.openSaveTemplateModal()">
            <div class="tpl-emoji">+</div>
            <div class="tpl-name">新建模板</div>
          </div>
        </div>
      </div>` : ''}
      <div class="form-group">
        <label class="form-label">任务名称 *</label>
        <input type="text" class="form-input" id="m-title" placeholder="例：完成项目报告" value="${escHtml(prefill.title||'')}">
      </div>
      <div class="form-group">
        <label class="form-label">任务描述</label>
        <textarea class="form-textarea" id="m-desc" placeholder="描述任务详情，有助于 AI 更好地拆解…">${escHtml(prefill.description||'')}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">优先级</label>
          <select class="form-select" id="m-priority">
            <option value="high"   ${prefill.priority==='high'?'selected':''}>紧急</option>
            <option value="medium" ${(!prefill.priority||prefill.priority==='medium')?'selected':''}>普通</option>
            <option value="low"    ${prefill.priority==='low'?'selected':''}>轻松</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">截止日期</label>
          <div class="date-picker-wrap">
            <input type="date" class="form-input" id="m-due" value="${prefill.dueDate?prefill.dueDate.slice(0,10):''}">
            <div class="date-chips">
              <button type="button" class="date-chip" data-offset="0" onclick="App.setDueDateShortcut(0)">今天</button>
              <button type="button" class="date-chip" data-offset="1" onclick="App.setDueDateShortcut(1)">明天</button>
              <button type="button" class="date-chip" data-offset="3" onclick="App.setDueDateShortcut(3)">+3天</button>
              <button type="button" class="date-chip" data-offset="7" onclick="App.setDueDateShortcut(7)">+1周</button>
              <button type="button" class="date-chip date-chip-clear" onclick="App.setDueDateShortcut(-1)">清除</button>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">积分奖励</label>
          <input type="number" class="form-input" id="m-credits" min="1" max="500" value="${prefill.credits ?? 10}">
        </div>
      </div>
      <div class="form-group manual-subtasks-block">
        <label class="form-label">子任务（可选）</label>
        <div id="m-subtasks-list" class="manual-subtasks-list"></div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="App.addManualSubtaskRow()">+ 添加子任务</button>
      </div>
      ${!isEdit ? `
      <label class="form-check">
        <input type="checkbox" id="m-ai-decompose" name="m-ai-decompose">
        <span>创建后使用 <strong style="color:var(--text-primary)">AI 自动拆解</strong>子任务（需配置 API Key；若已手写或从模板填入子任务则不会触发）</span>
      </label>` : ''}
    `, [
      { label:'取消', class:'btn btn-ghost', action:closeModal },
      { label: isEdit ? '保存' : '创建任务', class:'btn btn-primary', action:() => { void saveTaskFromModal(prefill.id); } },
    ]);
    setTimeout(() => {
      if (isEdit && prefill.subtasks?.length) {
        fillManualSubtasksFromSubs(prefill.subtasks, true);
      }
    }, 0);
  }

  function addManualSubtaskRow() {
    appendManualSubtaskRow(null);
  }

  /**
   * Set the #m-due date input via a quick shortcut chip.
   * @param {number} daysOffset  0=today, 1=tomorrow, 3=+3 days, 7=+1 week, -1=clear
   */
  function setDueDateShortcut(daysOffset) {
    var el = document.getElementById('m-due');
    if (!el) return;
    if (daysOffset < 0) { el.value = ''; el.dispatchEvent(new Event('change')); return; }
    var d = new Date();
    d.setDate(d.getDate() + daysOffset);
    var yyyy = d.getFullYear();
    var mm   = String(d.getMonth() + 1).padStart(2, '0');
    var dd   = String(d.getDate()).padStart(2, '0');
    el.value = yyyy + '-' + mm + '-' + dd;
    el.dispatchEvent(new Event('change'));
    // highlight chips to reflect selection
    var chips = document.querySelectorAll('.date-chip[data-offset]');
    chips.forEach(function(c) {
      c.classList.toggle('date-chip-active', parseInt(c.dataset.offset, 10) === daysOffset);
    });
  }

  function toggleTemplatePicker(toggleEl) {
    const wrap = toggleEl.closest('.template-picker-wrap');
    const grid = wrap?.querySelector('.template-grid');
    if (!grid) return;
    const open = grid.style.display !== 'none';
    grid.style.display = open ? 'none' : 'grid';
    const arrow = toggleEl.querySelector('.tpl-arrow');
    if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)';
  }

  function applyTaskTemplate(id) {
    const tpl = AetherStorage.getAllTaskTemplates().find(t => t.id === id);
    if (!tpl) return;
    const title = document.getElementById('m-title');
    const desc  = document.getElementById('m-desc');
    const pri   = document.getElementById('m-priority');
    const cred  = document.getElementById('m-credits');
    if (title) title.value = tpl.name;
    if (desc)  desc.value  = tpl.description || '';
    if (pri)   pri.value   = tpl.priority || 'medium';
    if (tpl.subtasks && tpl.subtasks.length) {
      const mapped = tpl.subtasks.map(s => ({
        title: s.title || '',
        description: s.description || '',
        credits: s.credits != null ? s.credits : 10,
        estimatedMinutes: s.estimatedMinutes != null ? s.estimatedMinutes : 15,
      }));
      const sumCredits = mapped.reduce((a, s) => a + (s.credits || 10), 0);
      if (cred) cred.value = String(sumCredits);
      fillManualSubtasksFromSubs(mapped, true);
    } else {
      fillManualSubtasksFromSubs([], true);
      if (cred) cred.value = String(tpl.credits ?? 10);
    }
    const grid = document.getElementById('task-template-grid');
    if (grid) grid.style.display = 'none';
    showToast(`已应用模板「${tpl.name}」${tpl.subtasks?.length ? '（含子任务）' : ''}`, 'info', 1800);
  }

  function deleteTaskTemplate(id, e) {
    e.stopPropagation();
    AetherStorage.deleteTaskTemplate(id);
    // Re-render the grid
    const grid = document.getElementById('task-template-grid');
    if (grid) {
      const templates = AetherStorage.getAllTaskTemplates();
      grid.innerHTML = templates.map(t => `
        <div class="tpl-card" onclick="App.applyTaskTemplate('${t.id}')">
          <div class="tpl-emoji">${escHtml(taskTplGlyph(t))}</div>
          <div class="tpl-name">${escHtml(t.name)}</div>
          <div class="tpl-meta">${t.category} · ${t.credits}✦</div>
          ${!t.isSystem ? `<button class="tpl-del" onclick="App.deleteTaskTemplate('${t.id}',event)">✕</button>` : ''}
        </div>`).join('') + `<div class="tpl-card tpl-add-new" onclick="App.openSaveTemplateModal()"><div class="tpl-emoji">+</div><div class="tpl-name">新建模板</div></div>`;
      showToast('模板已删除', 'info', 1500);
    }
  }

  function openSaveTemplateModal() {
    openModal('新建任务模板', `
      <div class="form-group">
        <label class="form-label">模板名称 *</label>
        <input type="text" class="form-input" id="st-name" placeholder="例：深度工作">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">图标（可选，留空则用名称首字）</label>
          <input type="text" class="form-input" id="st-emoji" placeholder="·" maxlength="4">
        </div>
        <div class="form-group">
          <label class="form-label">分类</label>
          <input type="text" class="form-input" id="st-category" placeholder="工作">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">描述</label>
        <input type="text" class="form-input" id="st-desc" placeholder="模板的简短描述">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">默认优先级</label>
          <select class="form-select" id="st-priority">
            <option value="high">紧急</option>
            <option value="medium" selected>普通</option>
            <option value="low">轻松</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">默认积分</label>
          <input type="number" class="form-input" id="st-credits" value="10" min="1">
        </div>
      </div>
    `, [
      { label:'取消', class:'btn btn-ghost', action:closeModal },
      { label:'保存模板', class:'btn btn-primary', action:saveNewTemplate },
    ]);
  }

  function saveNewTemplate() {
    const name = document.getElementById('st-name')?.value.trim();
    if (!name) { showToast('请填写模板名称', 'error'); return; }
    const tpl = {
      id: AetherStorage.genId(),
      name,
      emoji:    document.getElementById('st-emoji')?.value.trim() || '',
      category: document.getElementById('st-category')?.value.trim() || '自定义',
      description: document.getElementById('st-desc')?.value.trim() || '',
      priority: document.getElementById('st-priority')?.value || 'medium',
      credits:  parseInt(document.getElementById('st-credits')?.value) || 10,
      subtasks: [],
      isSystem: false,
    };
    AetherStorage.saveTaskTemplate(tpl);
    closeModal();
    showToast('模板已保存', 'success');
  }

  function openEditTaskModal(id) { const t = AetherStorage.getTask(id); if (t) openAddTaskModal(t); }

  async function saveTaskFromModal(existingId) {
    const prior = existingId ? AetherStorage.getTask(existingId) : null;
    if (existingId && !prior) { showToast('任务不存在或已删除', 'error'); return; }
    const editingTask = prior;
    const manualSubs = collectManualSubtasksFromModal(editingTask);
    const wantAiDecompose = !existingId && !!document.getElementById('m-ai-decompose')?.checked;
    const title = document.getElementById('m-title')?.value.trim();
    if (!title) { showToast('请填写任务名称', 'error'); return; }
    const common = {
      title,
      description: document.getElementById('m-desc')?.value.trim() || '',
      priority: document.getElementById('m-priority')?.value || 'medium',
      dueDate: document.getElementById('m-due')?.value || null,
      credits: parseInt(document.getElementById('m-credits')?.value, 10) || 10,
    };
    let task;
    if (existingId) {
      task = { ...editingTask, ...common };
      if (manualSubs.length) {
        task.subtasks = manualSubs;
        task.credits = manualSubs.reduce((sum, s) => sum + (s.credits || 10), 0);
      } else {
        task.subtasks = [];
        task.credits = common.credits;
      }
      task.aiGenerated = false;
    } else {
      task = AetherStorage.createTask(common);
      if (manualSubs.length) {
        task.subtasks = manualSubs;
        task.credits = manualSubs.reduce((sum, s) => sum + (s.credits || 10), 0);
      }
    }
    AetherStorage.saveTask(task);
    closeModal();
    showToast(existingId ? '任务已更新' : '任务已创建', 'success');
    if (currentView === 'tasks') renderTasks();
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'calendar') renderCalendar();

    const subCount = (task.subtasks || []).length;
    if (!existingId && wantAiDecompose && subCount === 0) {
      const settings = AetherStorage.getSettings();
      if (!AetherAI.hasConfiguredKey(settings)) {
        showToast('已创建任务。未为当前提供商配置 Key，无法 AI 拆解', 'info', 4500);
        return;
      }
      try {
        showToast('AI 正在拆解子任务…', 'info', 2800);
        const raw = await AetherAI.decomposeTask(task.title, task.description);
        if (applyDecomposeFromArray(task.id, raw)) {
          showToast('已自动生成子任务', 'success');
          if (currentView === 'tasks') renderTasks();
          if (currentView === 'dashboard') renderDashboard();
          if (currentView === 'calendar') renderCalendar();
        }
      } catch (e) {
        showToast('AI 拆解失败：' + (e.message || String(e)), 'error', 5000);
      }
    }
  }

  /** 将 AI 返回的子任务数组写入任务（不弹窗） */
  function applyDecomposeFromArray(taskId, subtasks) {
    const task = AetherStorage.getTask(taskId);
    if (!task || !Array.isArray(subtasks) || !subtasks.length) return false;
    task.subtasks = subtasks.map(s => ({
      id: AetherStorage.genId(),
      title: s.title,
      description: s.description || '',
      credits: s.credits || 10,
      estimatedMinutes: s.estimatedMinutes || 15,
      completed: false,
      completedAt: null,
    }));
    task.credits = subtasks.reduce((sum, s) => sum + (s.credits || 10), 0);
    task.aiGenerated = true;
    AetherStorage.saveTask(task);
    return true;
  }

  // ---- AI Decompose ----
  async function openAIDecompose(taskId) {
    const task = AetherStorage.getTask(taskId); if (!task) return;
    const settings = AetherStorage.getSettings();
    if (!AetherAI.hasConfiguredKey(settings)) { showToast('请先为当前提供商填写 API Key', 'error'); return; }
    openModal('AI 任务拆解', `
      <p style="color:var(--text-secondary);font-size:.88rem">正在为「<strong style="color:var(--text-primary)">${escHtml(task.title)}</strong>」生成子任务…</p>
      <div style="display:flex;justify-content:center;padding:24px"><div class="loading-spinner" style="width:32px;height:32px;border-width:3px"></div></div>`, []);
    try {
      const subtasks = await AetherAI.decomposeTask(task.title, task.description);
      if (!subtasks || !subtasks.length) {
        pendingAIDecompose = null;
        const mb = document.querySelector('.modal-body');
        if (mb) mb.innerHTML = `<p style="color:var(--text-muted);font-size:.88rem">AI 未返回有效子步骤，请重试或稍后在任务上使用「AI 拆解」</p>`;
        return;
      }
      pendingAIDecompose = { taskId, subtasks };
      const modalBody = document.querySelector('.modal-body');
      if (modalBody) {
        modalBody.innerHTML = `
          <p style="color:var(--text-secondary);font-size:.85rem">AI 建议将任务拆分为以下子步骤：</p>
          <div class="decompose-list">
            ${subtasks.map((s,i) => `
              <div class="decompose-item">
                <div class="decompose-num">${i+1}</div>
                <div class="decompose-info">
                  <div class="decompose-title">${escHtml(s.title)}</div>
                  <div class="decompose-desc">${escHtml(s.description||'')}</div>
                  <div class="decompose-meta">
                    <span class="decompose-tag">⏱ ${s.estimatedMinutes||15}min</span>
                    <span class="decompose-tag">✦ ${s.credits||10}</span>
                  </div>
                </div>
              </div>`).join('')}
          </div>`;
        const footer = document.querySelector('.modal-footer');
        if (footer) footer.innerHTML = `
          <button class="btn btn-ghost" onclick="App.closeModal()">取消</button>
          <button class="btn btn-primary" onclick="App.applyAIDecomposeStored()">应用子任务</button>`;
      }
    } catch (e) {
      pendingAIDecompose = null;
      const mb = document.querySelector('.modal-body');
      if (mb) mb.innerHTML = `<p style="color:var(--danger)">${escHtml(e.message==='NO_API_KEY'?'请先配置 API Key':e.message)}</p>`;
    }
  }

  function applyAIDecomposeStored() {
    const p = pendingAIDecompose;
    pendingAIDecompose = null;
    if (!p || !p.taskId || !Array.isArray(p.subtasks) || !p.subtasks.length) {
      showToast('拆解数据已失效，请重新打开 AI 拆解', 'error');
      return;
    }
    applyDecompose(p.taskId, p.subtasks);
  }

  function applyDecompose(taskId, subtasksJson) {
    let subtasks;
    try { subtasks = typeof subtasksJson === 'string' ? JSON.parse(subtasksJson) : subtasksJson; }
    catch { showToast('数据解析错误', 'error'); return; }
    if (!applyDecomposeFromArray(taskId, subtasks)) { showToast('应用失败', 'error'); return; }
    closeModal();
    showToast('子任务已应用！', 'success');
    renderTasks();
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'calendar') renderCalendar();
  }

  // ============================================================
  // CALENDAR VIEW
  // ============================================================

  function renderCalendar() {
    const view = document.getElementById('view-calendar');
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const today = new Date().toISOString().slice(0,10);
    const tasks = AetherStorage.getTasks();

    // Build a map: date → tasks
    const tasksByDate = {};
    tasks.forEach(t => {
      const d = t.dueDate ? t.dueDate.slice(0,10) : t.createdAt.slice(0,10);
      if (!tasksByDate[d]) tasksByDate[d] = [];
      tasksByDate[d].push(t);
    });

    // Calendar grid cells
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const monthName = new Date(year, month, 1).toLocaleDateString('zh-CN', {year:'numeric', month:'long'});

    let cells = '';
    for (let i = 0; i < firstDay; i++) cells += `<div class="cal-cell cal-empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayTasks = tasksByDate[dateStr] || [];
      const isToday = dateStr === today;
      const isSelected = dateStr === selectedCalDate;
      const total = dayTasks.length;

      // Up to 3 task preview chips
      const preview = dayTasks.slice(0, 3);
      const extra   = total - 3;
      const taskChips = preview.map(t => {
        const raw   = t.title || '';
        const label = raw.length > 14 ? raw.slice(0, 14) + '…' : raw;
        const cls   = t.status === 'completed' ? 'done' : (t.priority === 'high' ? 'high' : 'normal');
        return `<div class="cal-cell-task ${cls}">${escHtml(label)}</div>`;
      }).join('');

      cells += `
        <div class="cal-cell ${isToday?'today':''} ${isSelected?'selected':''} ${total?'has-tasks':''}"
             onclick="App.selectCalDay('${dateStr}')">
          <div class="cal-day-header">
            <span class="cal-day-num">${d}</span>
            ${total > 0 ? `<span class="cal-day-count">${total}</span>` : ''}
          </div>
          ${taskChips}
          ${extra > 0 ? `<div class="cal-cell-more">+${extra} 项</div>` : ''}
        </div>`;
    }

    // Selected day tasks panel
    const selTasks = selectedCalDate ? (tasksByDate[selectedCalDate] || []) : [];
    const selLabel = selectedCalDate ? new Date(selectedCalDate+'T12:00:00').toLocaleDateString('zh-CN',{month:'long',day:'numeric'}) : '';

    view.innerHTML = `
      <div class="cal-layout">
        <div class="cal-main glass-card">
          <div class="cal-nav">
            <button class="btn-icon" onclick="App.calPrevMonth()">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span class="cal-month-label">${monthName}</span>
            <button class="btn-icon" onclick="App.calNextMonth()">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="App.calGoToday()">今天</button>
          </div>
          <div class="cal-weekdays">
            ${['日','一','二','三','四','五','六'].map(d=>`<div class="cal-wday">${d}</div>`).join('')}
          </div>
          <div class="cal-grid">${cells}</div>
          <div class="cal-legend">
            <span><span class="cal-legend-chip high"></span> 紧急</span>
            <span><span class="cal-legend-chip normal"></span> 普通</span>
            <span><span class="cal-legend-chip done"></span> 已完成</span>
          </div>
        </div>

        <div class="cal-side glass-card">
          ${selectedCalDate ? `
            <div class="cal-side-header">
              <span class="cal-side-date">${selLabel}</span>
              <button class="btn btn-primary btn-sm" onclick="App.openAddTaskWithDate('${selectedCalDate}')">+ 添加</button>
            </div>
            ${selTasks.length ? selTasks.map(t => `
              <div class="cal-task-item ${t.status}">
                <div class="priority-dot ${t.priority}"></div>
                <span class="cal-task-title">${escHtml(t.title)}</span>
                <span class="cal-task-credits">✦${t.credits}</span>
              </div>`).join('')
            : `<div class="empty-state" style="padding:32px 0"><div class="empty-state-icon empty-state-dot"></div>这天没有任务</div>`}
          ` : `
            <div style="text-align:center;padding:40px 16px;color:var(--text-muted)">
              <div class="empty-state-icon empty-state-dot" style="margin:0 auto 10px"></div>
              <div style="font-size:.94rem">点击日期查看当天任务</div>
            </div>`}
        </div>
      </div>`;
  }

  function selectCalDay(dateStr) { selectedCalDate = selectedCalDate === dateStr ? null : dateStr; renderCalendar(); }
  function calPrevMonth() { calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth()-1, 1); renderCalendar(); }
  function calNextMonth() { calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth()+1, 1); renderCalendar(); }
  function calGoToday()   { calendarDate = new Date(); selectedCalDate = new Date().toISOString().slice(0,10); renderCalendar(); }
  function openAddTaskWithDate(dateStr) { openAddTaskModal({ dueDate: dateStr }); }

  // ============================================================
  // ============================================================
  //  AI 助手 · AMADEUS
  // ============================================================

  /** 内置 Live2D 模型（与 amadeus-system-new-main/src/constants/live2d.ts 一致），不依赖设置项 */
  const DEFAULT_LIVE2D_MODEL_URL =
    'https://static.amadeus-web.top/live2dmodels/steinsGateKurisuNew/红莉栖.model3.json';

  // ---- Live2D lifecycle ----
  function setL2dStatus(visible, text) {
    const el = document.getElementById('amadeus-l2d-status');
    if (!el) return;
    el.textContent = text || '';
    el.style.display = visible ? 'flex' : 'none';
  }

  function stopChatTechBg() {
    if (_layoutTechBgRaf) { cancelAnimationFrame(_layoutTechBgRaf); _layoutTechBgRaf = null; }
  }

  /** 助手页底图已取消：不再绘制 Canvas 叠加层（避免与主栏 back.png 重复，并消除毛玻璃/重绘带来的迟滞感） */
  function initChatTechBg() {
    stopChatTechBg();
    const canvas = document.getElementById('amadeus-chat-tech-bg');
    if (!canvas) return;
    canvas.style.display = 'none';
    try {
      const ctx = canvas.getContext('2d');
      if (ctx && canvas.width) ctx.clearRect(0, 0, canvas.width, canvas.height);
    } catch (e) {}
  }

  /** Circuit-board background with digital rain behind Live2D */
  function initBgRain() {
    if (_bgRainRaf) { cancelAnimationFrame(_bgRainRaf); _bgRainRaf = null; }
    const bgCanvas = document.getElementById('amadeus-bg-canvas');
    if (!bgCanvas) return;
    const inner = document.getElementById('amadeus-character-inner');
    if (!inner) return;

    const W = inner.clientWidth  || 280;
    const H = inner.clientHeight || 480;
    bgCanvas.width  = W;
    bgCanvas.height = H;

    const ctx = bgCanvas.getContext('2d');
    if (!ctx) return;

    // --- Step 1: draw static PCB circuit traces ---
    const GRID = 24;
    ctx.fillStyle = '#020c18';
    ctx.fillRect(0, 0, W, H);

    // Horizontal traces (sparse, with gaps to mimic real PCB routing)
    for (let gy = GRID; gy < H; gy += GRID) {
      let gx = 0;
      while (gx < W) {
        const segLen = GRID * (1 + Math.floor(Math.random() * 5));
        const end = Math.min(gx + segLen, W);
        ctx.strokeStyle = `rgba(0,200,240,${0.07 + Math.random() * 0.07})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(end, gy); ctx.stroke();
        gx = end + GRID * (0.4 + Math.random() * 2.2);
      }
    }
    // Vertical traces
    for (let gx = GRID; gx < W; gx += GRID) {
      let gy = 0;
      while (gy < H) {
        const segLen = GRID * (1 + Math.floor(Math.random() * 4));
        const end = Math.min(gy + segLen, H);
        ctx.strokeStyle = `rgba(0,180,230,${0.05 + Math.random() * 0.06})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, end); ctx.stroke();
        gy = end + GRID * (0.5 + Math.random() * 2.5);
      }
    }
    // Vias (pads at grid intersections)
    for (let gx = GRID; gx < W; gx += GRID) {
      for (let gy = GRID; gy < H; gy += GRID) {
        if (Math.random() > 0.60) {
          ctx.fillStyle = `rgba(0,220,255,${0.15 + Math.random() * 0.15})`;
          ctx.beginPath(); ctx.arc(gx, gy, 1.6, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // Save static PCB as base layer
    const staticBg = ctx.getImageData(0, 0, W, H);

    // --- Step 2: animated digital rain on top ---
    const COLS  = Math.floor(W / 14);
    const drops = new Array(COLS).fill(0).map(() => Math.random() * -H / 12);
    const CHARS = '01アイウエ∇∆∑∫λ√∞≡≠';

    function frame() {
      ctx.putImageData(staticBg, 0, 0);
      ctx.fillStyle = 'rgba(2, 8, 20, 0.52)';
      ctx.fillRect(0, 0, W, H);

      ctx.font = '11px "Consolas", monospace';
      for (let i = 0; i < COLS; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)];
        const x    = i * 14 + 4;
        const y    = drops[i] * 12;

        // Bright head character
        ctx.fillStyle = 'rgba(0, 230, 255, 0.72)';
        ctx.fillText(char, x, y);

        // Dim trail
        if (drops[i] > 1) {
          ctx.fillStyle = 'rgba(0, 150, 210, 0.25)';
          ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], x, y - 12);
        }

        drops[i]++;
        if (drops[i] * 12 > H && Math.random() > 0.97) {
          drops[i] = Math.random() * -8;
        }
      }
      _bgRainRaf = requestAnimationFrame(frame);
    }
    frame();
  }

  function refitLive2D() {
    if (!_l2dReady || !_l2dApp || !_l2dModel) return;
    const inner  = document.getElementById('amadeus-character-inner');
    const canvas = document.getElementById('amadeus-l2d-canvas');
    if (!inner || !canvas) return;
    const card = inner.closest('.amadeus-character-card');
    const w = Math.max(120, (card && card.clientWidth)  || inner.clientWidth  || 280);
    const h = Math.max(120, (card && card.clientHeight) || inner.clientHeight || 300);
    try { _l2dApp.renderer.resize(w, h); } catch (e) {}

    const cW = _l2dApp.screen.width;
    const cH = _l2dApp.screen.height;

    // Reset scale to 1 first — guarantees accurate natural canvas dimensions
    // (avoids any cumulative scale drift from previous calls)
    _l2dModel.scale.set(1);
    const naturalW = Math.max(1, _l2dModel.width);
    const naturalH = Math.max(1, _l2dModel.height);

    // Half-body portrait strategy:
    //   scW = fill card width exactly (character spans full horizontal span)
    //   scH = make top 65% of model height fill card height (crops lower body/legs)
    //   sc  = max of the two → zoom in enough to show head + upper body
    //   y   = 0 → anchor to top so the head is the first thing shown
    const scW = cW / naturalW;
    const scH = cH / (naturalH * 0.65);
    const sc  = Math.max(scW, scH);

    _l2dModel.scale.set(sc);
    _l2dModel.x = (cW - naturalW * sc) / 2;   // center horizontally
    _l2dModel.y = 0;                            // show from top of model canvas
  }

  /** 按状态尝试多组 motion 名（不同 model3 命名不一致，参考 amadeus-system-new 的 speaking/thinking） */
  const _L2D_MOTION_GROUPS = {
    idle: ['idle', 'Idle', 'Tap', 'tap'],
    thinking: ['thinking', 'think', 'Think', 'Tap'],
    talking: ['speaking', 'talk', 'talking', 'Tap', 'idle', 'Idle'],
    happy: ['happy', 'Tap', 'idle', 'Idle'],
  };

  function l2dPlayMotionGroup(stateKey) {
    if (!_l2dReady || !_l2dModel) return;
    const groups = _L2D_MOTION_GROUPS[stateKey] || _L2D_MOTION_GROUPS.idle;
    for (let i = 0; i < groups.length; i++) {
      try {
        _l2dModel.motion(groups[i], undefined, 2);
        return;
      } catch (e) { /* try next */ }
    }
  }

  /** 与 amadeus-system-new-main 情感枚举大致对齐的启发式（无服务端时本地推断） */
  function inferAmadeusEmotion(userText, replyText) {
    const t = ((replyText || '') + '\n' + (userText || '')).slice(-800);
    if (/恭喜|好耶|不错|搞定|太好了|真棒|顺利|挺好/.test(t)) return 'joy';
    if (/抱歉|遗憾|麻烦|逾期|有点累|难受|崩溃|糟/.test(t)) return 'sadness';
    if (/可恶|烦死了|气死|别这样|过分|离谱/.test(t)) return 'anger';
    if (/那个…|嗯…|害羞|不说|算了/.test(t)) return 'shy';
    return 'neutral';
  }

  function inferEmotionFromSegment(segment) {
    return inferAmadeusEmotion('', segment || '');
  }

  function applyL2dExpression(emotion) {
    if (!_l2dReady || !_l2dModel) return;
    const m = _l2dModel;
    const map = {
      neutral: ['neutral', 'normal', 'default', 'F01'],
      joy: ['smile1', 'smile2', 'joy', 'smile', 'happy'],
      sadness: ['sadness', 'sad', 'unhappy'],
      anger: ['anger', 'angry'],
      shy: ['shy', 'shy2', 'Shy'],
    };
    const ids = map[emotion] || map.neutral;
    function tryOne(id) {
      try {
        const em =
          m.internalModel &&
          m.internalModel.motionManager &&
          m.internalModel.motionManager.expressionManager;
        if (em && typeof em.setExpression === 'function') {
          em.setExpression(id);
          return true;
        }
      } catch (e) {}
      try {
        if (typeof m.expression === 'function') {
          m.expression(id);
          return true;
        }
      } catch (e2) {}
      return false;
    }
    for (let i = 0; i < ids.length; i++) {
      if (tryOne(ids[i])) return;
    }
  }

  /** Drive ParamMouthOpenY with natural sine oscillation while speaking */
  function startMouthAnimation() {
    stopMouthAnimation();
    if (!_l2dReady || !_l2dModel) return;
    let t = 0;
    _l2dMouthInterval = setInterval(function () {
      if (!_l2dReady || !_l2dModel) { stopMouthAnimation(); return; }
      t += 0.22;
      // Layered sine for natural-looking mouth movement
      const v = Math.max(0, Math.min(1, Math.sin(t * 3.0) * 0.55 + Math.sin(t * 5.3) * 0.35 + 0.1));
      _setL2dParam('ParamMouthOpenY', v);
    }, 50);
  }

  function stopMouthAnimation() {
    if (_l2dMouthInterval) { clearInterval(_l2dMouthInterval); _l2dMouthInterval = null; }
    _setL2dParam('ParamMouthOpenY', 0);
  }

  /**
   * pixi-live2d-display：autoInteract 为 true 时会在每帧 registerInteraction，
   * 用 pointermove 驱动 focus（目光跟随）。朗读时关闭，结束后恢复。
   */
  function l2dSetGazeFollow(on) {
    if (!_l2dReady || !_l2dModel) return;
    try {
      _l2dModel.autoInteract = !!on;
    } catch (e) {}
  }

  /** Low-level helper: set a single Cubism parameter by id */
  function _setL2dParam(paramId, value) {
    if (!_l2dReady || !_l2dModel) return;
    try {
      const im = _l2dModel.internalModel;
      if (!im) return;
      // pixi-live2d-display ≥0.3: coreModel.setParameterValueById
      const cm = im.coreModel;
      if (cm) {
        if (typeof cm.setParameterValueById === 'function') {
          cm.setParameterValueById(paramId, value);
          return;
        }
        // Cubism 4 SDK direct
        if (typeof cm.setParamFloat === 'function') {
          cm.setParamFloat(paramId, value);
          return;
        }
      }
      // pixi-live2d-display high-level API
      if (typeof _l2dModel.internalModel.setParameterValueById === 'function') {
        _l2dModel.internalModel.setParameterValueById(paramId, value);
      }
    } catch (e) {}
  }

  async function initLive2D(modelPath) {
    destroyLive2D();
    const canvas = document.getElementById('amadeus-l2d-canvas');
    if (!canvas) return false;
    if (!window.PIXI) {
      setL2dStatus(true, 'Live2D 脚本未加载');
      return false;
    }
    try {
      const inner = document.getElementById('amadeus-character-inner');
      const card  = inner && inner.closest('.amadeus-character-card');
      // Card has a CSS fixed height (430px). Read from card first, then fallbacks.
      const w = Math.max(120, (card && card.clientWidth)  || (inner && inner.clientWidth)  || 280);
      const h = Math.max(360, (card && card.clientHeight) || (inner && inner.clientHeight) || 430);
      _l2dApp = new window.PIXI.Application({
        view: canvas,
        backgroundAlpha: 0,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        width: w,
        height: h,
      });
      const Live2DModel = window.PIXI.live2d && window.PIXI.live2d.Live2DModel;
      if (!Live2DModel) { destroyLive2D(); setL2dStatus(true, 'Live2D 脚本未加载'); return false; }
      _l2dModel = await Live2DModel.from(modelPath);
      _l2dApp.stage.addChild(_l2dModel);
      _l2dReady = true;   // ← must be true BEFORE refitLive2D() which guards on this flag
      refitLive2D();
      l2dPlayMotionGroup('idle');
      const innerEl = document.getElementById('amadeus-character-inner');
      const wrapEl = document.querySelector('.amadeus-l2d-stage-wrap');
      if (typeof ResizeObserver !== 'undefined') {
        _l2dResizeObs = new ResizeObserver(() => { refitLive2D(); });
        if (wrapEl) _l2dResizeObs.observe(wrapEl);
        else if (innerEl) _l2dResizeObs.observe(innerEl);
      }
      setL2dStatus(false, '');
      canvas.style.display = 'block';
      return true;
    } catch (e) {
      console.warn('[Live2D] init failed:', e.message);
      destroyLive2D();
      setL2dStatus(true, '模型加载失败（请检查网络或跨域）');
      return false;
    }
  }

  function destroyLive2D() {
    stopMouthAnimation();
    if (_bgRainRaf) { cancelAnimationFrame(_bgRainRaf); _bgRainRaf = null; }
    if (_l2dResizeObs) {
      try { _l2dResizeObs.disconnect(); } catch (e) {}
      _l2dResizeObs = null;
    }
    if (_l2dModel) { try { _l2dModel.destroy(); } catch (e) {} _l2dModel = null; }
    if (_l2dApp) { try { _l2dApp.destroy(true); } catch (e) {} _l2dApp = null; }
    _l2dReady = false;
  }

  /** 今日待办（未完成且计入「今日任务」集合） */
  function renderAmadeusTodayTodoHtml() {
    const today = new Date().toISOString().slice(0, 10);
    const list = AetherStorage.getTodayTasks().filter(function (t) {
      return t.status !== 'completed';
    });
    const prOrder = { high: 0, medium: 1, low: 2 };
    list.sort(function (a, b) {
      const pa = prOrder[a.priority] !== undefined ? prOrder[a.priority] : 1;
      const pb = prOrder[b.priority] !== undefined ? prOrder[b.priority] : 1;
      return pa - pb;
    });
    const slice = list.slice(0, 10);
    if (!slice.length) {
      return `<li class="amadeus-today-empty">${window.AetherI18n ? AetherI18n.t('chat.todayEmpty') : '今日暂无待办。去任务页添加日程吧。'}</li>`;
    }
    return slice
      .map(function (t) {
        const pri = t.priority === 'high' ? 'high' : t.priority === 'low' ? 'low' : 'medium';
        const priLabel = pri === 'high' ? '高' : pri === 'low' ? '低' : '中';
        const due = t.dueDate ? t.dueDate.slice(0, 10) : '';
        let tag = '';
        if (due) {
          if (due < today) tag = '<span class="amadeus-today-tag amadeus-today-tag-warn">逾期</span>';
          else if (due === today) tag = '<span class="amadeus-today-tag">今日</span>';
        }
        return (
          '<li class="amadeus-today-item">' +
          '<span class="amadeus-today-pri amadeus-today-pri-' +
          pri +
          '">' +
          priLabel +
          '</span>' +
          '<span class="amadeus-today-title-text">' +
          escHtml(t.title || '未命名') +
          '</span>' +
          tag +
          '</li>'
        );
      })
      .join('');
  }

  /** 助手通过 <aether_action> 写入任务/每日/枝条后，刷新侧栏与当前视图列表 */
  function refreshAfterAmadeusActions() {
    const todayUl = document.getElementById('amadeus-today-list');
    if (todayUl) todayUl.innerHTML = renderAmadeusTodayTodoHtml();
    if (currentView === 'tasks') renderTasks();
    if (currentView === 'daily') renderDaily();
    if (currentView === 'branches') renderBranches();
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'calendar') renderCalendar();
  }

  function setAmadeusState(state) {
    // state: 'idle' | 'thinking' | 'talking' | 'happy'
    const indicator = document.getElementById('amadeus-state-label');
    const labels = { idle: '待机中', thinking: '思考中…', talking: '表达中…', happy: '完成' };
    const L = window.AetherI18n && typeof window.AetherI18n.t === 'function' ? AetherI18n : null;
    const map = L
      ? {
          idle: L.t('amadeus.state.idle'),
          thinking: L.t('amadeus.state.thinking'),
          talking: L.t('amadeus.state.talking'),
          happy: L.t('amadeus.state.happy'),
        }
      : labels;
    if (indicator) indicator.textContent = map[state] || '';
    const motionKey = state === 'thinking' ? 'thinking' : state === 'talking' ? 'talking' : state === 'happy' ? 'happy' : 'idle';
    l2dPlayMotionGroup(motionKey);
  }

  // ---- Render ----
  function renderChat() {
    stopChatTechBg();
    if (_bgRainRaf) { cancelAnimationFrame(_bgRainRaf); _bgRainRaf = null; }
    const view = document.getElementById('view-chat');
    if (!view) return;
    const settings = AetherStorage.getSettings();
    const history  = AetherStorage.getAmadeusChat();
    const amadeusLabel = escHtml((settings.amadeusName || 'AMADEUS').trim() || 'AMADEUS');
    const ti = window.AetherI18n && typeof window.AetherI18n.t === 'function' ? AetherI18n : null;
    const speechRaw = String(settings.amadeusSpeechLang || '').trim().toLowerCase();
    const speechSelectVal =
      !speechRaw || speechRaw === 'same' ? 'same' : ['zh', 'en', 'ja'].includes(speechRaw) ? speechRaw : 'same';
    const phRaw = ti ? ti.t('amadeus.inputPh').replace(/\{name\}/g, (settings.amadeusName || 'AMADEUS').trim() || 'AMADEUS') : `和 ${amadeusLabel} 说点什么…`;
    const inputPh = escHtml(phRaw);

    view.innerHTML = `
      <div class="amadeus-layout">
        <canvas id="amadeus-chat-tech-bg" class="amadeus-chat-tech-bg" aria-hidden="true"></canvas>

        <!-- LEFT: Chat panel -->
        <div class="amadeus-chat-panel glass-card">
          <div class="amadeus-chat-header">
            <div class="amadeus-header-title">
              <span class="amadeus-name-badge">${amadeusLabel}</span>
              <span id="amadeus-state-label" class="amadeus-state-label">${ti ? ti.t('amadeus.state.idle') : '待机中'}</span>
            </div>
            <div class="amadeus-header-actions" style="flex-wrap:wrap;justify-content:flex-end;gap:6px">
              <div class="amadeus-speech-lang-row" style="display:flex;align-items:center;gap:6px;width:100%;justify-content:flex-end;margin-bottom:2px">
                <label style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap">${ti ? ti.t('amadeus.speechLang') : '朗读语种'}</label>
                <select id="amadeus-speech-lang" class="form-select amadeus-speech-lang-select" title="${ti ? escHtml(ti.t('amadeus.speechLangHint')) : ''}" style="max-width:11rem;font-size:0.72rem;padding:4px 8px;height:auto" onchange="App.onAmadeusSpeechLangChange(event)">
                  <option value="same" ${speechSelectVal === 'same' ? 'selected' : ''}>${ti ? ti.t('amadeus.speechFollow') : '跟随系统'}</option>
                  <option value="zh" ${speechSelectVal === 'zh' ? 'selected' : ''}>中文</option>
                  <option value="en" ${speechSelectVal === 'en' ? 'selected' : ''}>English</option>
                  <option value="ja" ${speechSelectVal === 'ja' ? 'selected' : ''}>日本語</option>
                </select>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" id="amadeus-voice-toggle" onclick="App.toggleAmadeusVoiceQuick()" title=""></button>
              <button class="btn btn-ghost btn-sm" onclick="App.triggerTaskEval()">${ti ? ti.t('amadeus.taskEval') : '进展评估'}</button>
              <button class="btn btn-ghost btn-sm" onclick="App.clearAmadeusChat()">${ti ? ti.t('amadeus.clearChat') : '清空对话'}</button>
            </div>
          </div>

          <div class="amadeus-messages" id="amadeus-messages">
            ${history.length === 0 ? renderAmadeusWelcome() : history.map(renderAmadeusBubble).join('')}
          </div>

          <div class="amadeus-input-area">
            <textarea id="amadeus-input" rows="1"
              placeholder="${inputPh}"
              onkeydown="App.handleChatKey(event)"></textarea>
            <button id="amadeus-send-btn" class="amadeus-send-btn" onclick="App.sendChatMessage()">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- RIGHT: Live2D + 今日待办 -->
        <div class="amadeus-right-panel">

          <div class="amadeus-character-shell">
            <div class="amadeus-character-card">
              <div class="amadeus-character-inner" id="amadeus-character-inner">
                <canvas id="amadeus-bg-canvas" class="amadeus-bg-canvas"></canvas>
                <div class="amadeus-l2d-stage-wrap">
                  <canvas id="amadeus-l2d-canvas"></canvas>
                  <div id="amadeus-l2d-status" class="amadeus-l2d-status" style="display:flex">${ti ? ti.t('amadeus.l2dLoading') : '正在加载 Live2D…'}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="amadeus-attach-panel glass-card" id="amadeus-attach-panel">
            <div class="amadeus-attach-head">
              <span class="amadeus-attach-title">${ti ? ti.t('amadeus.attachAdd') : '添加附件'}</span>
              <div class="amadeus-attach-actions">
                <button type="button" class="btn btn-ghost btn-sm" onclick="App.pickAmadeusAttachments()">${ti ? ti.t('amadeus.pickFiles') : '选择文件'}</button>
                <button type="button" class="btn btn-ghost btn-sm" onclick="App.pickAmadeusAttachmentFolder()">${ti ? ti.t('amadeus.pickFolder') : '选择文件夹'}</button>
              </div>
            </div>
            <div class="amadeus-attach-drop" id="amadeus-attach-drop" tabindex="0" role="button" aria-label="${ti ? escHtml(ti.t('amadeus.attachDrop')) : '拖放添加附件'}"></div>
            <input type="file" id="amadeus-attach-input" multiple style="display:none" onchange="App.onAmadeusAttachInput(event,false)" />
            <input type="file" id="amadeus-attach-dir-input" webkitdirectory multiple style="display:none" onchange="App.onAmadeusAttachInput(event,true)" />
            <ul class="amadeus-attach-list" id="amadeus-attach-list"><li class="amadeus-attach-empty">${ti ? ti.t('amadeus.attachLoading') : '加载中…'}</li></ul>
          </div>

          <div class="amadeus-today-panel glass-card">
            <div class="amadeus-today-header">
              <span class="amadeus-today-heading">${ti ? ti.t('amadeus.todayTodo') : '今日待办'}</span>
              <button type="button" class="btn btn-ghost btn-sm" onclick="App.navigateTo('tasks')">${ti ? ti.t('amadeus.gotoTasks') : '任务'}</button>
            </div>
            <ul id="amadeus-today-list" class="amadeus-today-list">${renderAmadeusTodayTodoHtml()}</ul>
          </div>

        </div><!-- /right -->
      </div><!-- /layout -->
    `;

    scrollAmadeusToBottom();
    autoGrowTextarea(document.getElementById('amadeus-input'));

    // Use requestAnimationFrame + slight delay so the flex layout has fully settled
    // before we read clientWidth/clientHeight for PIXI canvas sizing.
    requestAnimationFrame(() => {
      setTimeout(() => {
        initChatTechBg();
        initBgRain();
        initLive2D(DEFAULT_LIVE2D_MODEL_URL);
        initAmadeusAttachmentsPanel();
      }, 120);
    });
    refreshAmadeusVoiceToggleLabel();
  }

  function initAmadeusAttachmentsPanel() {
    const drop = document.getElementById('amadeus-attach-drop');
    if (!drop || drop.dataset.bound === '1') {
      void refreshAmadeusAttachmentList();
      return;
    }
    drop.dataset.bound = '1';
    ['dragenter', 'dragover'].forEach((evName) => {
      drop.addEventListener(evName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        drop.classList.add('is-dragover');
      });
    });
    drop.addEventListener('dragleave', (e) => {
      if (e.target === drop) drop.classList.remove('is-dragover');
    });
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      drop.classList.remove('is-dragover');
      void onAmadeusAttachDrop(e);
    });
    void refreshAmadeusAttachmentList();
  }

  async function refreshAmadeusAttachmentList() {
    if (!window.AetherAmadeusAttachments || typeof AetherAmadeusAttachments.renderListToDom !== 'function') return;
    const list = document.getElementById('amadeus-attach-list');
    if (!list) return;
    try {
      await AetherAmadeusAttachments.renderListToDom(list);
    } catch (e) {
      list.innerHTML = `<li class="amadeus-attach-empty">${window.AetherI18n && typeof window.AetherI18n.t === 'function' ? AetherI18n.t('amadeus.attachFail') : '附件列表加载失败'}</li>`;
    }
  }

  function pickAmadeusAttachments() {
    document.getElementById('amadeus-attach-input')?.click();
  }

  function pickAmadeusAttachmentFolder() {
    document.getElementById('amadeus-attach-dir-input')?.click();
  }

  async function onAmadeusAttachInput(ev, isDir) {
    const inp = ev.target;
    const files = inp?.files;
    if (!files?.length || !window.AetherAmadeusAttachments) return;
    const r = await AetherAmadeusAttachments.addFilesFromList(files, { useRelativePath: !!isDir });
    if (r.added) showToast(`已添加 ${r.added} 个附件`, 'success', 2200);
    if (r.errors?.length) showToast(r.errors[0], 'warning', 5200);
    inp.value = '';
    await refreshAmadeusAttachmentList();
  }

  async function onAmadeusAttachDrop(ev) {
    const dt = ev.dataTransfer;
    const files = dt?.files;
    if (!files?.length || !window.AetherAmadeusAttachments) return;
    const r = await AetherAmadeusAttachments.addFilesFromList(files, {});
    if (r.added) showToast(`已添加 ${r.added} 个附件`, 'success', 2200);
    if (r.errors?.length) showToast(r.errors[0], 'warning', 5200);
    await refreshAmadeusAttachmentList();
  }

  async function removeAmadeusAttachment(id) {
    if (!id || !window.AetherAmadeusAttachments) return;
    await AetherAmadeusAttachments.deleteById(id);
    showToast('已移除附件', 'info', 1400);
    await refreshAmadeusAttachmentList();
  }

  function renderAmadeusWelcome() {
    const profile = AetherStorage.getProfile();
    const settings = AetherStorage.getSettings();
    const welcome =
      window.AetherI18n && typeof window.AetherI18n.amadeusWelcomeText === 'function'
        ? AetherI18n.amadeusWelcomeText(settings, profile)
        : (() => {
            const assistantName = (settings.amadeusName || 'AMADEUS').trim() || 'AMADEUS';
            const name = profile.name ? `，${profile.name}` : '';
            const ltm = AetherStorage.getLTM();
            const tasks = AetherStorage.getTasks().filter((t) => t.status !== 'completed');
            const completed = AetherStorage.getCompletedToday();
            let w = `你好${name}。我是 ${assistantName}。`;
            if (ltm.length > 0) w += `\n\n我保存着 ${ltm.length} 条关于你的长期记忆——你不需要每次都重新介绍自己。`;
            if (tasks.length > 0) {
              w += `\n\n你目前有 ${tasks.length} 项待处理任务，今天已完成 ${completed.length} 项。有什么我可以帮你的吗？`;
            } else w += `\n\n今天任务列表清空了——不错的状态。有什么新的目标想讨论吗？`;
            return w;
          })();
    const justNow = window.AetherI18n && typeof window.AetherI18n.t === 'function' ? AetherI18n.t('amadeus.time.justNow') : '刚刚';
    return `<div class="amadeus-bubble amadeus">${renderAmadeusAvatar()}<div class="amadeus-bubble-body"><div class="amadeus-bubble-text">${escHtml(welcome).replace(/\n/g,'<br>')}</div><div class="amadeus-bubble-time">${justNow}</div></div></div>`;
  }

  function renderAmadeusAvatar() {
    const rk = AetherStorage.getSettings().currentRole;
    const src =
      typeof AetherAI.getRoleLogoSrc === 'function' ? AetherAI.getRoleLogoSrc(rk) : 'img/ama.png';
    const role = AetherAI.getRole(rk);
    const altAttr = escHtml(role.name || '');
    return `<div class="amadeus-bubble-avatar amadeus-bubble-avatar--img"><img src="${escHtml(src)}" alt="${altAttr}" class="amadeus-avatar-img" onerror="this.style.display='none'"></div>`;
  }

  function renderAmadeusBubble(msg) {
    const isUser = msg.role === 'user';
    const time   = msg.ts ? formatTime(msg.ts) : '';
    const text   = escHtml(msg.content || '').replace(/\n/g, '<br>');
    if (isUser) {
      return `<div class="amadeus-bubble user"><div class="amadeus-bubble-body user"><div class="amadeus-bubble-text">${text}</div><div class="amadeus-bubble-time">${time}</div></div></div>`;
    }
    return `<div class="amadeus-bubble amadeus">${renderAmadeusAvatar()}<div class="amadeus-bubble-body"><div class="amadeus-bubble-text">${text}</div><div class="amadeus-bubble-time">${time}</div></div></div>`;
  }

  function renderLTMPanel(ltm) {
    const emptyHint =
      window.AetherI18n && typeof window.AetherI18n.t === 'function'
        ? AetherI18n.t('amadeus.memory.empty')
        : '暂无长期记忆。与 AMADEUS 对话后，重要事实将自动保存。';
    if (!ltm || !ltm.length) {
      return `<div style="color:var(--text-muted);font-size:0.75rem;padding:8px 0">${emptyHint}</div>`;
    }
    const sorted = ltm.slice().sort((a,b) => b.lastAccessed - a.lastAccessed);
    const clearLbl = window.AetherI18n && typeof window.AetherI18n.t === 'function' ? AetherI18n.t('amadeus.memory.clearAll') : '清空所有记忆';
    return `<div class="amadeus-ltm-list">
      ${sorted.map(f => `
        <div class="amadeus-ltm-item">
          <span class="amadeus-ltm-text">${escHtml(f.content)}</span>
          <button class="amadeus-ltm-del" onclick="App.deleteLTMFact('${f.id}')" title="删除">✕</button>
        </div>`).join('')}
      <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:6px;font-size:0.72rem" onclick="App.clearLTM()">${clearLbl}</button>
    </div>`;
  }

  // ---- Message sending ----
  function refreshAmadeusVoiceToggleLabel() {
    const btn = document.getElementById('amadeus-voice-toggle');
    if (!btn) return;
    const on = AetherStorage.getSettings().amadeusVoiceEnabled !== false;
    const L = window.AetherI18n && typeof window.AetherI18n.t === 'function' ? AetherI18n : null;
    btn.textContent = on ? (L ? L.t('amadeus.voiceOn') : '朗读开') : L ? L.t('amadeus.voiceOff') : '朗读关';
    btn.title = on ? (L ? L.t('settings.ttsAutoRead') : '自动朗读') : '';
  }

  function toggleAmadeusVoiceQuick() {
    const cur = AetherStorage.getSettings().amadeusVoiceEnabled !== false;
    AetherStorage.saveSettings({ amadeusVoiceEnabled: !cur });
    const box = document.getElementById('s-amadeus-voice');
    if (box) box.checked = !cur;
    refreshAmadeusVoiceToggleLabel();
    const L = window.AetherI18n && typeof window.AetherI18n.t === 'function' ? AetherI18n : null;
    showToast(
      !cur ? (L ? L.t('toast.voiceOn') : '已开启自动朗读') : L ? L.t('toast.voiceOff') : '已关闭自动朗读',
      'info'
    );
  }

  function onAmadeusSpeechLangChange(ev) {
    const raw = ev.target?.value || 'same';
    AetherStorage.saveSettings({ amadeusSpeechLang: raw === 'same' ? '' : raw });
    const msg =
      window.AetherI18n && typeof window.AetherI18n.t === 'function'
        ? AetherI18n.t('toast.speechLangSaved')
        : '朗读语种已保存';
    showToast(msg, 'info', 1400);
  }

  async function sendChatMessage() {
    if (chatStreaming) return;
    const input   = document.getElementById('amadeus-input');
    const content = input?.value.trim();
    if (!content) return;
    const settings = AetherStorage.getSettings();
    if (!AetherAI.hasConfiguredKey(settings)) { showToast(window.AetherI18n ? AetherI18n.t('chat.noApiKey') : '请先在设置中配置 AI API Key', 'error'); return; }
    if (window.AetherAmadeusVoice) window.AetherAmadeusVoice.cancel();
    input.value = ''; input.style.height = 'auto';

    // Save + display user message
    AetherStorage.saveAmadeusMessage('user', content);
    appendAmadeusBubble(renderAmadeusBubble({ role:'user', content, ts: new Date().toISOString() }));

    // Typing indicator
    const typingId = 'typing-' + Date.now();
    appendAmadeusBubble(`<div class="amadeus-bubble amadeus" id="${typingId}">${renderAmadeusAvatar()}<div class="amadeus-bubble-body"><div class="amadeus-bubble-text typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div></div>`);

    const sendBtn = document.getElementById('amadeus-send-btn');
    if (sendBtn) sendBtn.disabled = true;
    chatStreaming = true;
    setAmadeusState('thinking');

    try {
      const history = AetherStorage.getAmadeusChat();
      let fullClean = '', responseEl = null;
      const voiceOn = settings.amadeusVoiceEnabled !== false;
      const V = window.AetherAmadeusVoice;
      const voiceSupported = !!(voiceOn && V && typeof V.isSupported === 'function' && V.isSupported());
      const voiceState = resolveAmadeusVoiceTtsState(settings);
      const syncVoiceReveal = voiceSupported && !voiceState.translate;  // exact segment-based sync
      const syncByProgress = voiceSupported && !!voiceState.translate;  // approx progress-based sync (non-system lang)

      const finalReply = await AetherAI.sendAmadeusMessage(history, (chunk, cleanedFull) => {
        fullClean = cleanedFull;
        if (syncVoiceReveal || syncByProgress) return;
        const el = document.getElementById(typingId);
        if (!el) return;
        if (!responseEl) {
          el.querySelector('.amadeus-bubble-body').innerHTML =
            `<div class="amadeus-bubble-text">${escHtml(cleanedFull).replace(/\n/g,'<br>')}</div>`;
          responseEl = el;
        } else {
          const textEl = responseEl.querySelector('.amadeus-bubble-text');
          if (textEl) textEl.innerHTML = escHtml(cleanedFull).replace(/\n/g,'<br>');
        }
        scrollAmadeusToBottom();
      });

      const replyText = typeof finalReply === 'string' && finalReply.length ? finalReply : fullClean;
      AetherStorage.saveAmadeusMessage('assistant', replyText);

      const el = document.getElementById(typingId);
      const timeStr = formatTime(new Date().toISOString());
      let textEl = null;

      if (el) {
        if (syncVoiceReveal || syncByProgress) {
          el.querySelector('.amadeus-bubble-body').innerHTML =
            `<div class="amadeus-bubble-text"></div><div class="amadeus-bubble-time">${timeStr}</div>`;
        } else {
          el.querySelector('.amadeus-bubble-body').innerHTML =
            `<div class="amadeus-bubble-text">${escHtml(replyText).replace(/\n/g,'<br>')}</div>
             <div class="amadeus-bubble-time">${timeStr}</div>`;
        }
        textEl = el.querySelector('.amadeus-bubble-text');
      }

      function setBubbleVisibleSlice(visible) {
        if (!textEl) return;
        textEl.innerHTML = escHtml(visible).replace(/\n/g, '<br>');
        scrollAmadeusToBottom();
      }

      if (voiceSupported && replyText) {
        applyL2dExpression(inferAmadeusEmotion(content, replyText));
        setAmadeusState('talking');
        const speechBcp = voiceState.speechBcp;
        let ttsPayload = replyText;
        if (voiceState.translate && window.AetherAI && typeof AetherAI.translateForSpeechToLang === 'function') {
          try {
            ttsPayload = await AetherAI.translateForSpeechToLang(replyText, voiceState.speechLangKey, settings);
          } catch (e) {
            showToast(
              '朗读翻译失败，将使用原文朗读：' + (e && e.message ? e.message : String(e)),
              'warning',
              4800
            );
            ttsPayload = replyText;
          }
        }
        V.speak(ttsPayload, {
          speechLang: speechBcp,
          onPlaybackStart: function () {
            l2dSetGazeFollow(false);
            startMouthAnimation();
          },
          onPlaybackEnd: function () {
            stopMouthAnimation();
            l2dSetGazeFollow(true);
          },
          onProgress: function (p) {
            if (!textEl) return;
            if (syncVoiceReveal || syncByProgress) {
              const n = Math.max(0, Math.floor(replyText.length * (typeof p === 'number' ? p : 0)));
              setBubbleVisibleSlice(replyText.slice(0, n));
            }
          },
          onSegment: function (idx, chunk, cumulative) {
            if (syncVoiceReveal && textEl && cumulative != null) {
              setBubbleVisibleSlice(cumulative);
            } else if (idx > 0 && chunk && idx % 2 === 0) {
              applyL2dExpression(inferEmotionFromSegment(chunk));
            }
          },
          onEnd: function () {
            if (textEl) setBubbleVisibleSlice(replyText);
            applyL2dExpression('neutral');
            setAmadeusState('idle');
          },
        });
      } else {
        setAmadeusState('idle');
      }

      // Background LTM extraction every 10 messages
      _amadeusMsgCount++;
      if (_amadeusMsgCount % 10 === 0) {
        const h = AetherStorage.getAmadeusChat();
        AetherAI.extractLTMFromHistory(h).catch(() => {});
      }

      refreshMemoryStats();
      const todayUl = document.getElementById('amadeus-today-list');
      if (todayUl) todayUl.innerHTML = renderAmadeusTodayTodoHtml();

    } catch(e) {
      if (window.AetherAmadeusVoice) window.AetherAmadeusVoice.cancel();
      stopMouthAnimation();
      l2dSetGazeFollow(true);
      setAmadeusState('idle');
      const el = document.getElementById(typingId);
      if (el) el.querySelector('.amadeus-bubble-body').innerHTML =
        `<div style="color:var(--danger);font-size:.82rem">${e.message==='NO_API_KEY'?'请先配置 API Key':'出错了：'+escHtml(e.message)}</div>`;
    } finally {
      chatStreaming = false;
      if (sendBtn) sendBtn.disabled = false;
      scrollAmadeusToBottom();
    }
  }

  function appendAmadeusBubble(html) {
    const c = document.getElementById('amadeus-messages');
    if (c) { c.insertAdjacentHTML('beforeend', html); scrollAmadeusToBottom(); }
  }
  function scrollAmadeusToBottom() {
    const c = document.getElementById('amadeus-messages');
    if (c) c.scrollTop = c.scrollHeight;
  }
  function autoGrowTextarea(ta) {
    if (!ta) return;
    ta.addEventListener('input', () => { ta.style.height='auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
  }

  function handleChatKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  }

  function clearAmadeusChat() {
    if (window.AetherAmadeusVoice) window.AetherAmadeusVoice.cancel();
    AetherStorage.clearAmadeusChat();
    renderChat();
    showToast('对话已清空', 'info');
  }

  // ---- Memory management ----
  function toggleMemoryPanel() {
    const panel = document.getElementById('amadeus-ltm-panel');
    const btn   = document.getElementById('memory-toggle-btn');
    if (!panel) return;
    const hidden = panel.classList.toggle('hidden');
    if (btn) {
      const L = window.AetherI18n && typeof window.AetherI18n.t === 'function' ? AetherI18n : null;
      btn.textContent = hidden ? (L ? L.t('amadeus.memory.expand') : '展开') : L ? L.t('amadeus.memory.collapse') : '收起';
    }
    if (!hidden) {
      panel.innerHTML = renderLTMPanel(AetherStorage.getLTM());
    }
  }

  function deleteLTMFact(id) {
    AetherStorage.deleteLTMFact(id);
    const panel = document.getElementById('amadeus-ltm-panel');
    if (panel && !panel.classList.contains('hidden')) {
      panel.innerHTML = renderLTMPanel(AetherStorage.getLTM());
    }
    refreshMemoryStats();
    showToast('记忆已删除', 'info', 1500);
  }

  function clearLTM() {
    AetherStorage.clearLTM();
    const panel = document.getElementById('amadeus-ltm-panel');
    if (panel) panel.innerHTML = renderLTMPanel([]);
    refreshMemoryStats();
    showToast('所有长期记忆已清除', 'info');
  }

  function refreshMemoryStats() {
    const ltm  = AetherStorage.getLTM();
    const hist = AetherStorage.getAmadeusChat();
    const kb   = AetherStorage.getKBAIContext();
    const shortMax = (window.AetherAmadeusHarness && window.AetherAmadeusHarness.SHORT_TERM_MAX) || 16;
    const vals = document.querySelectorAll('.amadeus-mem-val');
    if (vals[0]) vals[0].textContent = ltm.length;
    if (vals[1]) vals[1].textContent = `${Math.min(hist.length, shortMax)} / ${shortMax}`;
    if (vals[2]) vals[2].textContent = kb?.entryCount || 0;
  }

  // ---- Task evaluation (triggers AI analysis + shows result as message) ----
  async function triggerTaskEval() {
    if (chatStreaming) return;
    if (window.AetherAmadeusVoice) window.AetherAmadeusVoice.cancel();
    chatStreaming = true;
    setAmadeusState('thinking');
    const typingId = 'eval-' + Date.now();
    appendAmadeusBubble(`<div class="amadeus-bubble amadeus" id="${typingId}">${renderAmadeusAvatar()}<div class="amadeus-bubble-body"><div class="amadeus-bubble-text typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div></div>`);
    try {
      const result = await AetherAI.evaluateTaskProgress();
      AetherStorage.saveAmadeusMessage('assistant', result || '');
      const el = document.getElementById(typingId);
      if (el && result) {
        el.querySelector('.amadeus-bubble-body').innerHTML =
          `<div class="amadeus-bubble-text">${escHtml(result).replace(/\n/g,'<br>')}</div>
           <div class="amadeus-bubble-time">${formatTime(new Date().toISOString())}</div>`;
      }
      setAmadeusState('idle');
    } catch(e) {
      setAmadeusState('idle');
      const el = document.getElementById(typingId);
      if (el) el.querySelector('.amadeus-bubble-body').innerHTML =
        `<div style="color:var(--danger);font-size:.82rem">评估失败：${escHtml(e.message)}</div>`;
    } finally {
      chatStreaming = false;
      scrollAmadeusToBottom();
    }
  }

  // Legacy stubs (keep other code working)
  function switchChatRole(roleKey) { AetherStorage.saveSettings({currentRole:roleKey}); updateRoleBadge(); }
  function clearChat() { clearAmadeusChat(); }

  // ============================================================
  // KNOWLEDGE BASE VIEW
  // ============================================================

  function renderKBCustomCard(e) {
    const preview = (e.content || '（暂无正文）').replace(/\s+/g, ' ').slice(0, 160);
    const tags = e.tags ? e.tags.split(',').map(t=>t.trim()).filter(Boolean) : [];
    const tstr = new Date(e.updatedAt || e.createdAt).toLocaleDateString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    return `
      <div class="kb-entry-card glass-card kb-custom-card">
        <div class="kb-entry-header">
          <span class="kb-entry-date kb-custom-badge">本地知识点 · ${tstr}</span>
          <div class="kb-entry-tags">${tags.map(t=>`<span class="kb-tag">${escHtml(t)}</span>`).join('')}</div>
          <div class="kb-entry-actions">
            <button class="btn-icon btn-sm" onclick="App.openKBCustomModal('${e.id}')" title="编辑">✎</button>
            <button class="btn-icon btn-sm" onclick="App.deleteKBCustomEntryPrompt('${e.id}')" title="删除" style="color:var(--danger)">✕</button>
          </div>
        </div>
        <div class="kb-custom-title">${escHtml(e.title || '未命名')}</div>
        <div class="kb-entry-preview">${escHtml(preview)}${preview.length>=160?'…':''}</div>
      </div>`;
  }

  function openKBCustomModal(editId) {
    kbCustomDraftId = editId || null;
    const ex = editId ? AetherStorage.getKBCustomEntry(editId) : null;
    openModal(ex ? '编辑知识点' : '添加知识（本地保存）',
      `<div class="form-group">
        <label class="form-label">标题</label>
        <input type="text" class="form-input" id="kbc-title" value="${escHtml(ex?.title||'')}" placeholder="简短标题">
      </div>
      <div class="form-group">
        <label class="form-label">正文</label>
        <textarea class="form-textarea" id="kbc-body" rows="8" placeholder="摘录、读书笔记、灵光一现…">${escHtml(ex?.content||'')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">标签（逗号分隔）</label>
        <input type="text" class="form-input" id="kbc-tags" value="${escHtml(ex?.tags||'')}" placeholder="学习, 金句">
      </div>`,
      [
        { label: '取消', class: 'btn btn-ghost', action: closeModal },
        { label: ex ? '保存' : '添加', class: 'btn btn-primary', action: () => void saveKBCustomFromModal() },
      ]);
  }

  function saveKBCustomFromModal() {
    const rawTitle = document.getElementById('kbc-title')?.value.trim() || '';
    const body  = document.getElementById('kbc-body')?.value.trim() || '';
    if (!rawTitle && !body) { showToast('请填写标题或正文', 'error'); return; }
    const title = rawTitle || '（无标题）';
    const tags  = document.getElementById('kbc-tags')?.value.trim() || '';
    const now = new Date().toISOString();
    let entry;
    if (kbCustomDraftId) {
      const prev = AetherStorage.getKBCustomEntry(kbCustomDraftId);
      entry = {
        ...(prev || {}),
        id: kbCustomDraftId,
        title,
        content: body,
        tags,
        updatedAt: now,
      };
    } else {
      entry = {
        id: AetherStorage.genId(),
        title,
        content: body,
        tags,
        createdAt: now,
        updatedAt: now,
      };
    }
    AetherStorage.saveKBCustomEntry(entry);
    closeModal(); kbCustomDraftId = null;
    showToast('知识点已保存', 'success');
    if (currentView === 'knowledge') renderKnowledge();
  }

  function deleteKBCustomEntryPrompt(id) {
    openModal('删除知识点',
      `<p style="color:var(--text-secondary)">将从本地<strong>手写知识</strong>中删除，不影响每日总结记录。</p>`,
      [
        { label: '取消', class: 'btn btn-ghost', action: closeModal },
        { label: '删除', class: 'btn btn-danger', action: () => {
          AetherStorage.deleteKBCustomEntry(id);
          closeModal();
          renderKnowledge();
          showToast('已删除', 'info');
        }},
      ]);
  }

  function renderKnowledge() {
    const view = document.getElementById('view-knowledge');
    const entries = AetherStorage.getKBEntries();
    const customs = AetherStorage.getKBCustomEntries().slice().sort((a,b)=> new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));

    view.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">知识库</div>
          <div class="section-subtitle">KNOWLEDGE BASE · ${entries.length} 条每日记录 · ${customs.length} 条手写知识</div>
        </div>
        <div class="section-header-actions">
          <button class="btn btn-ghost" type="button" onclick="App.openKBCustomModal()">＋ 添加知识</button>
          <button class="btn btn-ghost" type="button" id="btn-kb-sync" onclick="App.syncKBToAI()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            AI 同步
          </button>
          <button class="btn btn-primary" type="button" onclick="App.openTodaySummary()">
            <span>✦</span> 今日总结
          </button>
        </div>
      </div>

      ${customs.length ? `
      <div class="kb-section-label-row"><span class="kb-section-chip">我的知识点</span><span class="kb-section-hint">仅本机 · 独立于每日总结 · 不参与「重置知识库」</span></div>
      <div class="kb-entries-list kb-custom-entries">${customs.map(renderKBCustomCard).join('')}</div>` : `
      <div class="glass-card kb-custom-empty"><div class="empty-state-inner">手写知识点可在此归档，不会在清理数据时被删除。<button type="button" class="btn btn-primary btn-sm" style="margin-top:14px" onclick="App.openKBCustomModal()">＋ 添加第一条知识</button></div></div>`}

      <div class="kb-section-label-row kb-daily-split"><span class="kb-section-chip">每日记录</span><span class="kb-section-hint">来自「今日总结」</span></div>
      ${!entries.length ? `
        <div class="empty-state" style="padding:48px 0">
          <div class="empty-state-icon empty-state-dot"></div>
          <div>点击上方「今日总结」开始第一条每日归档</div>
        </div>` : `
      <div class="kb-entries-list">
        ${entries.map(e => renderKBEntryCard(e)).join('')}
      </div>`}`;
  }

  function renderKBEntryCard(entry) {
    const dateLabel = new Date(entry.date+'T12:00:00').toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'});
    const tags = entry.tags ? entry.tags.split(',').map(t=>t.trim()).filter(Boolean) : [];
    const preview = entry.aiSummary || entry.thoughts || entry.learnings || '（无内容）';
    return `
      <div class="kb-entry-card glass-card">
        <div class="kb-entry-header">
          <span class="kb-entry-date">${dateLabel}</span>
          <div class="kb-entry-tags">${tags.map(t=>`<span class="kb-tag">${escHtml(t)}</span>`).join('')}</div>
          <div class="kb-entry-actions">
            <button class="btn-icon btn-sm" onclick="App.editKBEntry('${entry.id}')" title="编辑">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon btn-sm" onclick="App.deleteKBEntry('${entry.id}')" title="删除" style="color:var(--danger)">✕</button>
          </div>
        </div>
        <div class="kb-entry-preview">${escHtml(preview.slice(0,120))}${preview.length>120?'…':''}</div>
        <div class="kb-entry-meta">
          ${entry.thoughts ? '<span class="kb-meta-tag">想法</span>' : ''}
          ${entry.learnings ? '<span class="kb-meta-tag">所学</span>' : ''}
          ${entry.resources?.length ? `<span class="kb-meta-tag">${entry.resources.length} 链接</span>` : ''}
        </div>
        ${entry.resources?.length ? `
        <div class="kb-res-display">
          ${entry.resources.map(r=>`<a href="${escHtml(r.url)}" target="_blank" class="kb-res-chip">${escHtml(r.title)}</a>`).join('')}
        </div>` : ''}
      </div>`;
  }

  function editKBEntry(id) {
    const entry = AetherStorage.getKBEntry(id); if (!entry) return;
    kbCurrentEntry = { ...entry };
    kbResources = [...(entry.resources || [])];
    openLargeModal('编辑知识条目', buildKBModalBody(kbCurrentEntry), [
      { label:'取消', class:'btn btn-ghost', action:closeModal },
      { label:'保存', class:'btn btn-primary', action:saveKBFromModal },
    ]);
  }

  function deleteKBEntry(id) {
    openModal('删除条目', `<p style="color:var(--text-secondary)">确认删除这条知识记录？</p>`, [
      { label:'取消', class:'btn btn-ghost', action:closeModal },
      { label:'删除', class:'btn btn-danger', action:() => { AetherStorage.deleteKBEntry(id); closeModal(); renderKnowledge(); showToast('已删除','info'); } },
    ]);
  }

  async function syncKBToAI() {
    const btn = document.getElementById('btn-kb-sync');
    const settings = AetherStorage.getSettings();
    if (!AetherAI.hasConfiguredKey(settings)) { showToast('请先配置 API Key', 'error'); return; }
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loading-spinner" style="width:10px;height:10px;border-width:1.5px;display:inline-block;margin-right:4px"></span> 同步中…'; }
    try {
      const entries = AetherStorage.getKBEntries();
      const customs = AetherStorage.getKBCustomEntries();
      if (!entries.length && !customs.length) { showToast('知识库暂无内容', 'info'); return; }
      const summary = await AetherAI.generateKBContext(entries, customs);
      AetherStorage.saveKBAIContext(summary, entries.length + customs.length);
      showToast(`已同步 ${entries.length + customs.length} 条知识，AI 建议将更准确`, 'success', 4500);
    } catch (e) {
      showToast('同步失败：' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> AI 同步'; }
    }
  }

  // ============================================================
  // REWARDS VIEW (tabs: records | redeem)
  // ============================================================

  function renderRewards() {
    const view = document.getElementById('view-rewards');
    const credits = AetherStorage.getCredits();

    view.innerHTML = `
      <div class="rewards-hero">
        <div class="credits-big">${credits.balance >= 10000 ? (credits.balance/1000).toFixed(1)+'k' : credits.balance.toLocaleString()}</div>
        <div class="credits-big-label">当前积分余额</div>
        <div class="credits-hours-equiv">≈ <strong>${(credits.balance / 10).toFixed(1)}</strong> 小时专注工作量</div>
      </div>
      <div class="rewards-body-layout">
        <div class="rewards-tabs-col">
          <button class="rewards-tab-v ${rewardsTab==='redeem'?'active':''}"  onclick="App.setRewardsTab('redeem')">
            <span class="rtab-icon rtab-icon-svg" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span><span class="rtab-label">兑换项目</span>
          </button>
          <button class="rewards-tab-v ${rewardsTab==='records'?'active':''}" onclick="App.setRewardsTab('records')">
            <span class="rtab-icon rtab-icon-svg" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span><span class="rtab-label">积分记录</span>
          </button>
          <button class="rewards-tab-v ${rewardsTab==='custom'?'active':''}"  onclick="App.setRewardsTab('custom')">
            <span class="rtab-icon rtab-icon-svg" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span><span class="rtab-label">自定义奖励</span>
          </button>
        </div>
        <div class="rewards-tab-panel">
          ${rewardsTab === 'redeem'  ? renderRedemptionTab()          : ''}
          ${rewardsTab === 'records' ? renderTransactionsTab(credits)  : ''}
          ${rewardsTab === 'custom'  ? renderCustomRewardsTab()        : ''}
        </div>
      </div>`;
  }

  function renderTransactionsTab(credits) {
    if (!credits.transactions.length) return `<div class="empty-state" style="padding:40px 0"><div class="empty-state-icon empty-state-dot"></div>完成任务后积分记录会在这里显示</div>`;
    return credits.transactions.slice(0,40).map(tx => {
      const isAiGift = tx.type === 'spend' && tx.description.startsWith('赠送助手');
      const isRedeem = tx.type === 'spend' && (tx.description.startsWith('兑换') || isAiGift);
      return `
      <div class="transaction-item ${isRedeem ? 'transaction-redeem' : ''} ${isAiGift ? 'transaction-ai-gift' : ''}">
        <div class="transaction-icon ${tx.type}"><span class="tx-letter">${isAiGift ? '赠' : isRedeem ? '兑' : tx.type==='earn'?'收':'出'}</span></div>
        <div class="transaction-info">
          <div class="transaction-desc">${escHtml(tx.description)}</div>
          <div class="transaction-time">${formatTime(tx.timestamp)}</div>
        </div>
        <div class="transaction-amount ${tx.type}">${tx.type==='earn'?'+':'-'}${tx.amount}</div>
      </div>`;
    }).join('');
  }

  function renderAiAssistantGiftCards(balance) {
    const hidden = new Set(AetherStorage.getHiddenRedemptionIds());
    const gifts = AetherStorage.getAmadeusAssistantGiftCatalog().filter(g => !hidden.has(g.id));
    if (!gifts.length) return '';
    return `
      <div class="rewards-block rewards-block--ai">
        <div class="rewards-block-title">送给 AI 助手的礼物</div>
        <div class="redemption-grid redemption-ai-gifts-grid">
          ${gifts.map(item => `
            <div class="redeem-card glass-card redeem-card-ai-gift ${balance < item.cost ? 'insufficient' : ''}">
              <div class="redeem-emoji">${item.emoji}</div>
              <div class="redeem-name">${escHtml(item.name)}</div>
              <div class="redeem-desc">${escHtml(item.description)}</div>
              <div class="redeem-cost"><span>✦</span>${item.cost}</div>
              <div class="redeem-actions">
                <button class="btn btn-sm ${balance >= item.cost ? 'btn-primary' : 'btn-ghost'}"
                        ${balance < item.cost ? 'disabled title="积分不足"' : ''}
                        onclick="App.confirmRedeem('${item.id}')">
                  ${balance >= item.cost ? '赠送' : '不足'}
                </button>
                <button type="button" class="btn-icon btn-sm" onclick="App.promptRemoveRedemptionItem('${item.id}')" title="从列表移除" style="color:var(--danger);font-size:.7rem">✕</button>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function renderRedemptionTab() {
    const items = AetherStorage.getVisibleRedemptionItems().filter(i => !i.forAmadeus);
    const balance = AetherStorage.getCredits().balance;
    return `
      <div class="redeem-intro">
        <p class="redeem-balance-line">可用积分 <strong class="gold">${balance.toLocaleString()}</strong></p>
      </div>
      ${renderAiAssistantGiftCards(balance)}
      <div class="rewards-block rewards-block--self">
        <div class="rewards-block-title">犒劳自己的礼物</div>
        <div class="redemption-grid redemption-ai-gifts-grid">
        ${items.map(item => `
          <div class="redeem-card glass-card redeem-card-ai-gift ${balance < item.cost ? 'insufficient' : ''}">
            <div class="redeem-emoji">${item.emoji}</div>
            <div class="redeem-name">${escHtml(item.name)}</div>
            <div class="redeem-desc">${escHtml(item.description)}</div>
            <div class="redeem-cost"><span>✦</span>${item.cost}</div>
            <div class="redeem-actions">
              <button class="btn btn-sm ${balance >= item.cost ? 'btn-primary' : 'btn-ghost'}"
                      ${balance < item.cost ? 'disabled title="积分不足"' : ''}
                      onclick="App.confirmRedeem('${item.id}')">
                ${balance >= item.cost ? '兑换' : '不足'}
              </button>
              <button type="button" class="btn-icon btn-sm" onclick="App.promptRemoveRedemptionItem('${item.id}')" title="${item.isSystem ? '从列表移除' : '删除'}" style="color:var(--danger);font-size:.7rem">✕</button>
            </div>
          </div>`).join('')}
        </div>
      </div>`;
  }

  function renderCustomRewardsTab() {
    const customItems = AetherStorage.getCustomRedemptionItems();
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <span style="font-size:.8rem;color:var(--text-muted)">${customItems.length} 个自定义奖励</span>
        <button class="btn btn-primary btn-sm" onclick="App.openAddRedemptionModal()">＋ 新建奖励</button>
      </div>
      ${!customItems.length
        ? `<div class="empty-state" style="padding:40px 0"><div class="empty-state-icon empty-state-dot"></div><div>创建专属奖励激励自己</div></div>`
        : `<div class="custom-rewards-list">
            ${customItems.map(item => `
              <div class="custom-reward-item glass-card">
                <div class="custom-reward-emoji">${item.emoji}</div>
                <div class="custom-reward-info">
                  <div class="custom-reward-name">${escHtml(item.name)}</div>
                  <div class="custom-reward-meta">✦${item.cost} · ${escHtml(item.category||'自定义')}</div>
                </div>
                <div class="custom-reward-actions">
                  <button class="btn-icon btn-sm" onclick="App.promptRemoveRedemptionItem('${item.id}')" title="删除" style="color:var(--danger)">✕</button>
                </div>
              </div>`).join('')}
          </div>`}`;
  }

  function setRewardsTab(tab) { rewardsTab = tab; renderRewards(); }

  /** 赠送助手礼物后的即时正反馈（对话气泡 + Live2D + 可选朗读） */
  async function handleAmadeusGiftFeedback(item, qty) {
    const tier = item.giftTier || 1;
    const lines = [
      '嗯…这份是给我的？那我可不客气地收下了。',
      '谢了。我会记得的——不是客套，是真的写进长期记忆那种。',
      '有心了。你这边要是接下来卡在哪，我也会多盯一眼。',
    ];
    const big = tier >= 3
      ? '这份份量不轻…我会认真当作「核心支援」记在心里的。谢谢你。'
      : tier === 2
        ? '同步率好像真的涨了一点。开玩笑的——但谢谢你记得给我留一份。'
        : '小小棒冰也很解暑。算我欠你一声谢谢。';
    const thanks = [big, lines[Math.floor(Math.random() * lines.length)]].join('\n\n');
    showToast(`助手已收到你的心意「${item.name}」`, 'gold', 5200);
    AetherStorage.saveAmadeusMessage('assistant', thanks);
    const box = document.getElementById('amadeus-messages');
    if (box) {
      appendAmadeusBubble(renderAmadeusBubble({ role: 'assistant', content: thanks, ts: new Date().toISOString() }));
      scrollAmadeusToBottom();
    }
    applyL2dExpression('joy');
    const V = window.AetherAmadeusVoice;
    const settings = AetherStorage.getSettings();
    const endJoy = function () {
      applyL2dExpression('neutral');
    };
    if (currentView === 'chat' && V && typeof V.isSupported === 'function' && V.isSupported() && settings.amadeusVoiceEnabled !== false) {
      try {
        const voiceState = resolveAmadeusVoiceTtsState(settings);
        let toSpeak = thanks;
        if (voiceState.translate && window.AetherAI && typeof AetherAI.translateForSpeechToLang === 'function') {
          try {
            toSpeak = await AetherAI.translateForSpeechToLang(thanks, voiceState.speechLangKey, settings);
          } catch (e) {
            toSpeak = thanks;
          }
        }
        V.speak(toSpeak, {
          speechLang: voiceState.speechBcp,
          onPlaybackStart: function () {
            l2dSetGazeFollow(false);
            startMouthAnimation();
          },
          onPlaybackEnd: function () {
            stopMouthAnimation();
            l2dSetGazeFollow(true);
          },
          onEnd: endJoy,
        });
      } catch (e) {
        setTimeout(endJoy, 2400);
      }
    } else {
      setTimeout(endJoy, currentView === 'chat' ? 2400 : 1800);
    }
  }

  function confirmRedeem(id) {
    const item = AetherStorage.getAllRedemptionItems().find(r => r.id === id); if (!item) return;
    const balance = AetherStorage.getCredits().balance;
    const maxQty = Math.max(1, Math.floor(balance / item.cost));
    const isGift = !!item.forAmadeus;
    openModal(isGift ? `向助手赠送「${item.name}」` : `兑换「${item.name}」`,
      `<div style="text-align:center;padding:8px 0 16px">
        <div style="font-size:2.5rem;margin-bottom:8px">${item.emoji}</div>
        <p style="color:var(--text-secondary)">${escHtml(item.description)}</p>
        ${isGift ? `<p style="margin-top:10px;font-size:.78rem;color:#00d4ff;border:1px solid rgba(0,200,255,0.25);border-radius:4px;padding:8px 10px;display:inline-block">标签：<strong>给助手</strong> · ${escHtml(item.giftTierLabel || '')}</p>` : ''}
        <p style="margin-top:8px;font-size:.88rem">单次消耗 <strong style="color:var(--gold)">${item.cost} 积分</strong></p>
      </div>
      <div class="form-group" style="max-width:200px;margin:0 auto">
        <label class="form-label" style="text-align:center;display:block">兑换数量</label>
        <div style="display:flex;align-items:center;gap:8px">
          <button type="button" class="btn btn-ghost btn-sm" style="width:34px;padding:0;flex-shrink:0" onclick="var i=document.getElementById('rdm-qty');i.value=Math.max(1,+i.value-1);document.getElementById('rdm-total').textContent=(+i.value*${item.cost}).toLocaleString()">−</button>
          <input type="number" class="form-input" id="rdm-qty" value="1" min="1" max="${maxQty}" style="text-align:center" oninput="document.getElementById('rdm-total').textContent=(Math.max(1,+this.value||1)*${item.cost}).toLocaleString()">
          <button type="button" class="btn btn-ghost btn-sm" style="width:34px;padding:0;flex-shrink:0" onclick="var i=document.getElementById('rdm-qty');i.value=Math.min(${maxQty},+i.value+1);document.getElementById('rdm-total').textContent=(+i.value*${item.cost}).toLocaleString()">＋</button>
        </div>
        <p style="text-align:center;font-size:.82rem;margin-top:8px;color:var(--text-secondary)">共消耗 <strong style="color:var(--gold)" id="rdm-total">${item.cost.toLocaleString()}</strong> 积分</p>
      </div>`, [
      { label:'取消', class:'btn btn-ghost', action:closeModal },
      { label: isGift ? '确认赠送' : '确认兑换', class:'btn btn-gold', action:() => {
        const qty = Math.max(1, parseInt(document.getElementById('rdm-qty')?.value, 10) || 1);
        try {
          AetherStorage.redeemItem(id, qty);
          closeModal();
          showConfetti();
          if (isGift) {
            handleAmadeusGiftFeedback(item, qty);
          } else {
            showToast(`已兑换「${item.name}」${qty > 1 ? ` × ${qty}` : ''}`, 'gold', 4000);
          }
          showCreditPop(-(item.cost * qty), document.getElementById('header-credits'));
          updateHeaderCredits(); renderRewards();
        } catch (e) { showToast(e.message, 'error'); }
      }},
    ]);
  }

  function promptRemoveRedemptionItem(id) {
    const item = AetherStorage.getAllRedemptionItems().find(r => r.id === id);
    if (!item) return;
    if (item.isSystem) {
      openModal(`从列表移除「${item.name}」`,
        `<p style="color:var(--text-secondary);font-size:.88rem;line-height:1.6">系统默认奖励将从兑换列表中<strong style="color:var(--text-primary)">隐藏</strong>，可随时在「已移除的默认奖励」中恢复显示。</p>`,
        [{ label: '取消', class: 'btn btn-ghost', action: closeModal },
         { label: '移除', class: 'btn btn-primary', action: () => {
           AetherStorage.hideRedemptionItem(id);
           closeModal();
           renderRewards();
           showToast('已从列表移除', 'info');
         }}]);
    } else {
      openModal(`删除自定义兑换「${item.name}」`,
        `<p style="color:var(--text-secondary)">确认删除？此操作不可恢复。</p>`,
        [{ label: '取消', class: 'btn btn-ghost', action: closeModal },
         { label: '删除', class: 'btn btn-danger', action: () => {
           AetherStorage.deleteRedemptionItem(id);
           closeModal();
           renderRewards();
           showToast('已删除兑换项', 'info');
         }}]);
    }
  }

  function openHiddenRedemptionsModal() {
    const hidden = AetherStorage.getHiddenRedemptionIds();
    if (!hidden.length) {
      showToast('当前没有已移除的系统默认奖励', 'info');
      return;
    }
    const defaults = AetherStorage.getDefaultRedemptionItems();
    const rows = hidden.map(hid => {
      const item = defaults.find(x => x.id === hid);
      if (!item) return '';
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:.88rem">${item.emoji} ${escHtml(item.name)}</span>
        <button type="button" class="btn btn-ghost btn-sm" onclick="App.restoreHiddenRedemption('${hid}')">恢复显示</button>
      </div>`;
    }).join('');
    openModal('已移除的默认奖励', `<p style="font-size:.78rem;color:var(--text-muted);margin-bottom:8px">以下为从兑换列表中隐藏的系统项，恢复后将重新出现在网格中。</p><div>${rows}</div>`, [
      { label: '关闭', class: 'btn btn-primary', action: closeModal },
    ]);
  }

  function restoreHiddenRedemption(id) {
    AetherStorage.unhideRedemptionItem(id);
    showToast('已恢复显示', 'success');
    renderRewards();
    const remaining = AetherStorage.getHiddenRedemptionIds().length;
    closeModal();
    if (remaining) setTimeout(() => openHiddenRedemptionsModal(), 80);
  }

  // ---- Add Custom Redemption Item ----
  function htmlRedemptionTemplateGrid() {
    const list = AetherStorage.getAllRedemptionTemplates();
    return list.map(t => `
      <div class="tpl-card" onclick="App.applyRedemptionTemplate('${t.id}')">
        <div class="tpl-emoji">${t.emoji}</div>
        <div class="tpl-name">${escHtml(t.name)}</div>
        <div class="tpl-meta">${escHtml(t.category)} · ${t.cost}✦</div>
        ${!t.isSystem ? `<button type="button" class="tpl-del" onclick="App.deleteRedemptionUserTemplate('${t.id}',event)" title="删除模板">✕</button>` : ''}
      </div>`).join('') + `
      <div class="tpl-card tpl-add-new" onclick="App.openSaveRedemptionTemplateModal()">
        <div class="tpl-emoji">+</div>
        <div class="tpl-name">新建兑换模板</div>
      </div>`;
  }

  const EMOJI_PRESETS = ['🎬','🍜','😴','🎮','☕','📖','🏖️','🎁','🎵','🎯','🍕','🍣','🍦','🎂','🥳','✈️','🏋️','💆','🛒','💻','📱','👗','🎪','🎭','🎨','🎤','🎸','🏊','🚴','🧘','🌸','⭐','🦋','🌈','🎉','💎','👑','🏆','🍺','🏠','🌮'];

  function openAddRedemptionModal() {
    openModal('新建兑换项目', `
      <div class="template-picker-wrap" style="margin-bottom:16px">
        <div class="template-picker-toggle" onclick="App.toggleTemplatePicker(this)">
          <span>从模板选择（系统 + 我的）</span><span class="tpl-arrow">▼</span>
        </div>
        <div class="template-grid" id="rdm-template-grid" style="display:none">
          ${htmlRedemptionTemplateGrid()}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start">
        <div class="form-group" style="margin:0">
          <label class="form-label">图标</label>
          <div class="emoji-picker-wrap">
            <input type="text" class="form-input emoji-input" id="rdm-emoji" placeholder="🎬" maxlength="4" value="🎁">
            <button type="button" class="btn btn-ghost btn-sm emoji-picker-toggle" onclick="App.toggleEmojiPicker('rdm-emoji-grid')">▼</button>
          </div>
          <div class="emoji-picker-grid hidden" id="rdm-emoji-grid">
            ${EMOJI_PRESETS.map(e=>`<button type="button" class="emoji-btn" onclick="App.pickEmoji('rdm-emoji','rdm-emoji-grid','${e}')">${e}</button>`).join('')}
          </div>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">名称 *</label>
          <input type="text" class="form-input" id="rdm-name" placeholder="我的奖励">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">描述</label>
        <input type="text" class="form-input" id="rdm-desc" placeholder="奖励内容说明">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">积分消耗 *</label>
          <input type="number" class="form-input" id="rdm-cost" value="40" min="1">
        </div>
        <div class="form-group">
          <label class="form-label">分类</label>
          <input type="text" class="form-input" id="rdm-category" placeholder="娱乐">
        </div>
      </div>
    `, [
      { label:'取消', class:'btn btn-ghost', action:closeModal },
      { label:'创建', class:'btn btn-primary', action:saveRedemptionItem },
    ]);
  }

  function toggleEmojiPicker(gridId) {
    const grid = document.getElementById(gridId);
    if (grid) grid.classList.toggle('hidden');
  }

  function pickEmoji(inputId, gridId, emoji) {
    const input = document.getElementById(inputId);
    if (input) input.value = emoji;
    const grid = document.getElementById(gridId);
    if (grid) grid.classList.add('hidden');
  }

  function applyRedemptionTemplate(id) {
    const tpl = AetherStorage.getAllRedemptionTemplates().find(t => t.id === id);
    if (!tpl) return;
    const map = {
      'rdm-emoji': tpl.emoji || '🎁',
      'rdm-name': tpl.name || '',
      'rdm-desc': tpl.description || '',
      'rdm-cost': tpl.cost != null ? String(tpl.cost) : '40',
      'rdm-category': tpl.category || '',
    };
    Object.entries(map).forEach(([fid, val]) => {
      const el = document.getElementById(fid);
      if (el) el.value = val;
    });
    const grid = document.getElementById('rdm-template-grid');
    if (grid) grid.style.display = 'none';
    showToast('已填入模板数据', 'info', 1500);
  }

  function deleteRedemptionUserTemplate(id, e) {
    e.stopPropagation();
    e.preventDefault();
    AetherStorage.deleteRedemptionTemplate(id);
    const grid = document.getElementById('rdm-template-grid');
    if (grid) grid.innerHTML = htmlRedemptionTemplateGrid();
    showToast('兑换模板已删除', 'info', 1500);
  }

  function openSaveRedemptionTemplateModal() {
    openModal('新建兑换模板', `
      <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:8px">保存后可在「新建兑换项目」的模板区反复选用。</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">图标</label>
          <input type="text" class="form-input" id="rtpl-emoji" placeholder="🎬" maxlength="4" value="🎁">
        </div>
        <div class="form-group">
          <label class="form-label">名称 *</label>
          <input type="text" class="form-input" id="rtpl-name" placeholder="例如：奶茶一杯">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">描述</label>
        <input type="text" class="form-input" id="rtpl-desc" placeholder="兑换说明">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">参考积分 *</label>
          <input type="number" class="form-input" id="rtpl-cost" value="40" min="1">
        </div>
        <div class="form-group">
          <label class="form-label">分类</label>
          <input type="text" class="form-input" id="rtpl-category" placeholder="娱乐">
        </div>
      </div>
    `, [
      { label: '取消', class: 'btn btn-ghost', action: closeModal },
      { label: '保存模板', class: 'btn btn-primary', action: saveRedemptionTemplateFromModal },
    ]);
  }

  function saveRedemptionTemplateFromModal() {
    const name = document.getElementById('rtpl-name')?.value.trim();
    if (!name) { showToast('请填写模板名称', 'error'); return; }
    const cost = parseInt(document.getElementById('rtpl-cost')?.value, 10) || 0;
    if (cost < 1) { showToast('积分至少为 1', 'error'); return; }
    AetherStorage.saveRedemptionTemplate({
      id: AetherStorage.genId(),
      name,
      emoji: document.getElementById('rtpl-emoji')?.value.trim() || '🎁',
      description: document.getElementById('rtpl-desc')?.value.trim() || '',
      cost,
      category: document.getElementById('rtpl-category')?.value.trim() || '自定义',
      isSystem: false,
    });
    closeModal();
    showToast('兑换模板已保存', 'success');
  }

  function saveRedemptionItem() {
    const name = document.getElementById('rdm-name')?.value.trim();
    const cost = parseInt(document.getElementById('rdm-cost')?.value) || 0;
    if (!name) { showToast('请填写名称', 'error'); return; }
    if (cost < 1) { showToast('积分消耗至少为 1', 'error'); return; }
    AetherStorage.saveRedemptionItem({
      id: AetherStorage.genId(),
      name,
      emoji:    document.getElementById('rdm-emoji')?.value.trim() || '🎁',
      description: document.getElementById('rdm-desc')?.value.trim() || '',
      cost,
      category: document.getElementById('rdm-category')?.value.trim() || '自定义',
      isSystem: false,
    });
    closeModal(); showToast('兑换项已创建', 'success'); renderRewards();
  }

  // ============================================================
  // DAILY TASKS VIEW
  // ============================================================

  function renderDaily() {
    const view = document.getElementById('view-daily');
    if (!view) return;
    const tasks = AetherStorage.getDailyTasks();
    const today = new Date().toISOString().slice(0, 10);
    const completedCount = tasks.filter(t => AetherStorage.isDailyTaskCompletedToday(t)).length;
    const pct = tasks.length ? Math.round(completedCount / tasks.length * 100) : 0;

    // Build past-5-days overview
    const pastDays = [];
    for (let i = 1; i <= 5; i++) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
      const dayLabel = ['日','一','二','三','四','五','六'][d.getDay()];
      const doneCount = tasks.filter(t => t.completions && t.completions[dateStr]).length;
      pastDays.push({ dateStr, label, dayLabel, doneCount });
    }

    view.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">每日任务</div>
          <div class="section-subtitle">DAILY HABITS · 今日 ${completedCount}/${tasks.length} 完成</div>
        </div>
        <button class="btn btn-primary" onclick="App.openAddDailyTaskModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          添加每日任务
        </button>
      </div>

      ${tasks.length ? `
      <div class="daily-progress glass-card">
        <div class="daily-progress-bar-wrap">
          <div class="daily-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="daily-progress-label">${pct}% · 今日进度</div>
      </div>

      <div class="daily-history-strip glass-card">
        <div class="daily-history-title">近 5 天记录</div>
        <div class="daily-history-days">
          ${pastDays.map(d => `
            <div class="daily-history-day" onclick="App.openDailyHistoryModal('${d.dateStr}')">
              <div class="dhd-label">${d.label}</div>
              <div class="dhd-weekday">周${d.dayLabel}</div>
              <div class="dhd-pct ${d.doneCount === tasks.length && tasks.length > 0 ? 'full' : d.doneCount > 0 ? 'partial' : 'empty'}">
                ${tasks.length > 0 ? Math.round(d.doneCount / tasks.length * 100) + '%' : '—'}
              </div>
              <div class="dhd-count">${d.doneCount}/${tasks.length}</div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      ${!tasks.length ? `
        <div class="empty-state" style="padding:64px 0">
          <div class="empty-state-icon empty-state-dot"></div>
          <div>设置每天固定要完成的习惯任务</div>
          <div style="font-size:.78rem;color:var(--text-muted);margin-top:6px">完成后获得积分，每天重置</div>
          <button class="btn btn-primary" style="margin-top:18px" onclick="App.openAddDailyTaskModal()">添加第一个每日任务</button>
        </div>` : `
      <div class="daily-tasks-list">
        ${tasks.map(renderDailyTaskItem).join('')}
      </div>`}`;
  }

  function openDailyHistoryModal(dateStr) {
    const tasks = AetherStorage.getDailyTasks();
    const d = new Date(dateStr + 'T12:00:00');
    const dateLabel = d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    const rows = tasks.map(t => {
      const done = !!(t.completions && t.completions[dateStr]);
      return `
        <div class="daily-hist-row ${done ? 'done' : ''}">
          <div class="daily-task-check ${done ? 'checked' : ''}" onclick="App.toggleDailyTaskForDate('${t.id}','${dateStr}',this)"></div>
          <div class="daily-task-emoji">${escHtml((t.emoji || '').trim() || '·')}</div>
          <div class="daily-task-info">
            <div class="daily-task-title">${escHtml(t.title)}</div>
          </div>
          <div class="daily-task-credits ${done ? '' : 'muted'}">✦${t.credits || 5}</div>
        </div>`;
    }).join('');
    openModal(`${dateLabel} 任务回顾`,
      `<p style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">可在此补签或取消当日任务完成状态（补签不额外发放积分）。</p>
       <div class="daily-hist-list">${rows || '<div class="empty-state" style="padding:24px 0">暂无每日任务</div>'}</div>`,
      [{ label: '关闭', class: 'btn btn-primary', action: () => { closeModal(); renderDaily(); } }]
    );
  }

  function toggleDailyTaskForDate(id, dateStr, checkEl) {
    const task = AetherStorage.getDailyTask(id); if (!task) return;
    if (!task.completions) task.completions = {};
    const wasDone = !!task.completions[dateStr];
    if (wasDone) {
      delete task.completions[dateStr];
    } else {
      task.completions[dateStr] = true;
      //补签不发积分，只静默记录
    }
    AetherStorage.saveDailyTask(task);
    // Update the check UI in-place
    const row = checkEl?.closest('.daily-hist-row');
    if (row) {
      row.classList.toggle('done', !wasDone);
      checkEl.classList.toggle('checked', !wasDone);
      const credEl = row.querySelector('.daily-task-credits');
      if (credEl) credEl.classList.toggle('muted', wasDone);
    }
    showToast(wasDone ? '已取消补签' : '已补签', 'info', 1800);
  }

  function renderDailyTaskItem(task) {
    const done = AetherStorage.isDailyTaskCompletedToday(task);
    return `
      <div class="daily-task-item glass-card ${done ? 'done' : ''}">
        <div class="daily-task-check ${done ? 'checked' : ''}" onclick="App.toggleDailyTask('${task.id}')"></div>
        <div class="daily-task-emoji" onclick="App.toggleDailyTask('${task.id}')">${escHtml((task.emoji || '').trim() || '·')}</div>
        <div class="daily-task-info" onclick="App.toggleDailyTask('${task.id}')">
          <div class="daily-task-title">${escHtml(task.title)}</div>
          ${task.description ? `<div class="daily-task-desc">${escHtml(task.description)}</div>` : ''}
        </div>
        <div class="daily-task-credits">✦${task.credits || 5}</div>
        <div class="daily-task-actions">
          <button class="btn-icon btn-sm" onclick="App.openEditDailyTaskModal('${task.id}')" title="编辑">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon btn-sm" onclick="App.deleteDailyTaskPrompt('${task.id}')" title="删除" style="color:var(--danger)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </div>`;
  }

  function toggleDailyTask(id) {
    const task = AetherStorage.getDailyTask(id); if (!task) return;
    const wasDone = AetherStorage.isDailyTaskCompletedToday(task);
    AetherStorage.toggleDailyTaskToday(id);
    if (!wasDone) {
      showToast(`已完成「${task.title}」，获得 ${task.credits || 5} 积分`, 'gold');
    } else {
      showToast('已撤销今日完成', 'info', 2000);
    }
    updateHeaderCredits();
    renderDaily();
  }

  function openAddDailyTaskModal(prefill = {}) {
    const isEdit = !!prefill.id;
    openModal(isEdit ? '编辑每日任务' : '添加每日任务', `
      <div class="form-group">
        <label class="form-label">任务名称 *</label>
        <input type="text" class="form-input" id="dt-title" value="${escHtml(prefill.title||'')}" placeholder="例：早起跑步、喝够8杯水">
      </div>
      <div style="display:grid;grid-template-columns:80px 1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">图标</label>
          <input type="text" class="form-input" id="dt-emoji" value="${escHtml(prefill.emoji||'')}" maxlength="4" style="text-align:center;font-size:1.1rem" placeholder="·">
        </div>
        <div class="form-group">
          <label class="form-label">积分奖励</label>
          <input type="number" class="form-input" id="dt-credits" value="${prefill.credits||5}" min="1" max="100">
        </div>
        <div></div>
      </div>
      <div class="form-group">
        <label class="form-label">描述（可选）</label>
        <input type="text" class="form-input" id="dt-desc" value="${escHtml(prefill.description||'')}" placeholder="简短说明">
      </div>
    `, [
      { label: '取消', class: 'btn btn-ghost', action: closeModal },
      { label: isEdit ? '保存' : '添加', class: 'btn btn-primary', action: () => saveDailyTaskFromModal(prefill.id) },
    ]);
  }

  function openEditDailyTaskModal(id) {
    const t = AetherStorage.getDailyTask(id); if (t) openAddDailyTaskModal(t);
  }

  function saveDailyTaskFromModal(existingId) {
    const title = document.getElementById('dt-title')?.value.trim();
    if (!title) { showToast('请填写任务名称', 'error'); return; }
    const prev = existingId ? AetherStorage.getDailyTask(existingId) : null;
    const task = {
      id: existingId || AetherStorage.genId(),
      title,
      emoji: document.getElementById('dt-emoji')?.value.trim() || '',
      description: document.getElementById('dt-desc')?.value.trim() || '',
      credits: parseInt(document.getElementById('dt-credits')?.value, 10) || 5,
      completions: prev?.completions || {},
      createdAt: prev?.createdAt || new Date().toISOString(),
    };
    AetherStorage.saveDailyTask(task);
    closeModal();
    showToast(existingId ? '已更新' : '每日任务已添加', 'success');
    if (currentView === 'daily') renderDaily();
  }

  function deleteDailyTaskPrompt(id) {
    const t = AetherStorage.getDailyTask(id); if (!t) return;
    openModal('删除每日任务',
      `<p style="color:var(--text-secondary)">确认删除「<strong style="color:var(--text-primary)">${escHtml(t.title)}</strong>」？</p>`,
      [{ label:'取消', class:'btn btn-ghost', action:closeModal },
       { label:'删除', class:'btn btn-danger', action:() => {
         AetherStorage.deleteDailyTask(id); closeModal(); renderDaily(); showToast('已删除','info');
       }}]);
  }

  // ============================================================
  // SETTINGS VIEW
  // ============================================================

  function renderSettings() {
    dirtySettings = false;
    const view = document.getElementById('view-settings');
    const settings = AetherStorage.getSettings();
    const roles = AetherAI.getRoles();
    view.innerHTML = `
      <div class="settings-scroll">
        <div class="section-header">
          <div><div class="section-title">系统设置</div><div class="section-subtitle">SETTINGS</div></div>
        </div>
        <p class="settings-archive-hint">称呼与自我介绍请在侧栏<strong>「个人档案」</strong>中维护，AI 会使用档案内容。<button type="button" class="btn-link" onclick="App.navigateTo('profile')">去编辑档案</button></p>
        <div class="settings-sections">
        <div class="settings-section">
          <div class="settings-section-header"><span class="settings-section-title">${window.AetherI18n ? AetherI18n.t('settings.section.lang') : '界面与语言'}</span></div>
          <div class="settings-body">
            <div class="form-group">
              <label class="form-label">${window.AetherI18n ? AetherI18n.t('settings.aetherLang') : '系统语言'}</label>
              <select class="form-select" id="s-aether-lang">
                <option value="zh" ${(settings.aetherLang || 'zh') === 'zh' ? 'selected' : ''}>中文（简体）</option>
                <option value="en" ${settings.aetherLang === 'en' ? 'selected' : ''}>English</option>
                <option value="ja" ${settings.aetherLang === 'ja' ? 'selected' : ''}>日本語</option>
              </select>
            </div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-header"><span class="settings-section-title">${window.AetherI18n ? AetherI18n.t('settings.section.role') : 'AI 助手角色'}</span></div>
          <div class="settings-body">
            <div class="role-cards">
              ${Object.keys(roles)
                .map((key) => {
                  const r = AetherAI.getRole(key);
                  return `
                <div class="role-card ${key === settings.currentRole ? 'active' : ''}" data-role="${key}" onclick="App.setRole('${key}')">
                  <div class="role-card-emoji"><img src="${escHtml(typeof AetherAI.getRoleLogoSrc === 'function' ? AetherAI.getRoleLogoSrc(key) : 'img/ama.png')}" alt="" class="role-card-logo" width="52" height="52" decoding="async"></div>
                  <div class="role-card-name">${escHtml(r.name)}</div>
                  <div class="role-card-desc">${escHtml(r.description)}</div>
                </div>`;
                })
                .join('')}
            </div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-header"><span class="settings-section-title">${window.AetherI18n ? AetherI18n.t('settings.section.model') : 'AI 模型配置'}</span></div>
          <div class="settings-body">
            <div class="form-group">
              <label class="form-label">${window.AetherI18n ? AetherI18n.t('settings.modelProvider') : '当前使用的 AI 提供商'}</label>
              <div class="llm-provider-grid">
                ${[
                  {id:'claude',   label:'Claude',   hint:'Anthropic'},
                  {id:'openai',   label:'OpenAI',   hint:'GPT 系列'},
                  {id:'gemini',   label:'Gemini',   hint:'Google'},
                  {id:'kimi',     label:'Kimi',     hint:'Moonshot'},
                  {id:'deepseek', label:'DeepSeek', hint:'深度求索'},
                ].map(p=>`
                  <div class="llm-provider-card ${(settings.llmProvider||'claude')===p.id?'active':''}" data-provider="${p.id}" onclick="App.selectLLMProvider('${p.id}')">
                    <div class="llm-provider-name">${p.label}</div>
                    <div class="llm-provider-hint">${p.hint}</div>
                  </div>`).join('')}
              </div>
            </div>

            <div class="llm-key-sections">
              <div class="llm-key-group ${(settings.llmProvider||'claude')==='claude'?'active':''}" data-provider-section="claude">
                <div class="form-group"><label class="form-label">Claude API Key</label>
                  <div class="api-key-wrapper">
                    <input type="password" class="form-input" id="s-apikey" value="${settings.apiKey||''}" placeholder="sk-ant-…">
                    <button class="api-key-toggle" onclick="App.toggleApiKeyVisibility()">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                  </div>
                  <div class="settings-hint"><a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a></div>
                </div>
                <div class="form-group"><label class="form-label">${window.AetherI18n ? AetherI18n.t('settings.model') : '模型'}</label>
                  <select class="form-select" id="s-model">
                    <option value="claude-opus-4-6"           ${settings.aiModel==='claude-opus-4-6'?'selected':''}>Claude Opus 4.6（最强）</option>
                    <option value="claude-sonnet-4-6"         ${settings.aiModel==='claude-sonnet-4-6'?'selected':''}>Claude Sonnet 4.6（均衡）</option>
                    <option value="claude-haiku-4-5-20251001" ${settings.aiModel==='claude-haiku-4-5-20251001'?'selected':''}>Claude Haiku 4.5（轻快）</option>
                  </select>
                </div>
              </div>

              <div class="llm-key-group ${(settings.llmProvider||'claude')==='openai'?'active':''}" data-provider-section="openai">
                <div class="form-group"><label class="form-label">OpenAI API Key</label>
                  <input type="password" class="form-input" id="s-openai-key" value="${settings.openaiKey||''}" placeholder="sk-…">
                  <div class="settings-hint"><a href="https://platform.openai.com" target="_blank">platform.openai.com</a></div>
                </div>
                <div class="form-group"><label class="form-label">${window.AetherI18n ? AetherI18n.t('settings.model') : '模型'}</label>
                  <select class="form-select" id="s-openai-model">
                    <option value="gpt-4o"       ${settings.openaiModel==='gpt-4o'?'selected':''}>GPT-4o（推荐）</option>
                    <option value="gpt-4o-mini"  ${settings.openaiModel==='gpt-4o-mini'?'selected':''}>GPT-4o mini（轻快）</option>
                    <option value="gpt-4-turbo"  ${settings.openaiModel==='gpt-4-turbo'?'selected':''}>GPT-4 Turbo</option>
                    <option value="gpt-3.5-turbo" ${settings.openaiModel==='gpt-3.5-turbo'?'selected':''}>GPT-3.5 Turbo</option>
                  </select>
                </div>
                <div class="form-group"><label class="form-label">${window.AetherI18n ? AetherI18n.t('settings.openaiBase') : '兼容 API 基础地址（可选）'}</label>
                  <input type="url" class="form-input settings-url-field" id="s-openai-base" value="${escHtml(settings.openaiBaseUrl||'')}" placeholder="默认 https://api.openai.com/v1">
                </div>
              </div>

              <div class="llm-key-group ${(settings.llmProvider||'claude')==='gemini'?'active':''}" data-provider-section="gemini">
                <div class="form-group"><label class="form-label">Google Gemini API Key</label>
                  <input type="password" class="form-input" id="s-gemini-key" value="${settings.geminiKey||''}" placeholder="AIza…">
                  <div class="settings-hint"><a href="https://aistudio.google.com" target="_blank">aistudio.google.com</a></div>
                </div>
                <div class="form-group"><label class="form-label">${window.AetherI18n ? AetherI18n.t('settings.model') : '模型'}</label>
                  <select class="form-select" id="s-gemini-model">
                    <option value="gemini-2.0-flash"   ${settings.geminiModel==='gemini-2.0-flash'?'selected':''}>Gemini 2.0 Flash（推荐）</option>
                    <option value="gemini-1.5-pro"     ${settings.geminiModel==='gemini-1.5-pro'?'selected':''}>Gemini 1.5 Pro</option>
                    <option value="gemini-1.5-flash"   ${settings.geminiModel==='gemini-1.5-flash'?'selected':''}>Gemini 1.5 Flash</option>
                  </select>
                </div>
              </div>

              <div class="llm-key-group ${(settings.llmProvider||'claude')==='kimi'?'active':''}" data-provider-section="kimi">
                <div class="form-group"><label class="form-label">Kimi（Moonshot）API Key</label>
                  <input type="password" class="form-input" id="s-kimi-key" value="${settings.kimiKey||''}" placeholder="sk-…">
                  <div class="settings-hint"><a href="https://platform.moonshot.cn" target="_blank">platform.moonshot.cn</a></div>
                </div>
                <div class="form-group"><label class="form-label">${window.AetherI18n ? AetherI18n.t('settings.model') : '模型'}</label>
                  <select class="form-select" id="s-kimi-model">
                    <option value="moonshot-v1-8k"   ${settings.kimiModel==='moonshot-v1-8k'?'selected':''}>Moonshot v1 8k</option>
                    <option value="moonshot-v1-32k"  ${settings.kimiModel==='moonshot-v1-32k'?'selected':''}>Moonshot v1 32k</option>
                    <option value="moonshot-v1-128k" ${settings.kimiModel==='moonshot-v1-128k'?'selected':''}>Moonshot v1 128k</option>
                  </select>
                </div>
              </div>

              <div class="llm-key-group ${(settings.llmProvider||'claude')==='deepseek'?'active':''}" data-provider-section="deepseek">
                <div class="form-group"><label class="form-label">DeepSeek API Key</label>
                  <input type="password" class="form-input" id="s-deepseek-key" value="${settings.deepseekKey||''}" placeholder="sk-…">
                  <div class="settings-hint"><a href="https://platform.deepseek.com" target="_blank">platform.deepseek.com</a></div>
                </div>
                <div class="form-group"><label class="form-label">${window.AetherI18n ? AetherI18n.t('settings.model') : '模型'}</label>
                  <select class="form-select" id="s-deepseek-model">
                    <option value="deepseek-chat"     ${settings.deepseekModel==='deepseek-chat'?'selected':''}>DeepSeek Chat（推荐）</option>
                    <option value="deepseek-reasoner" ${settings.deepseekModel==='deepseek-reasoner'?'selected':''}>DeepSeek Reasoner</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-header"><span class="settings-section-title">${window.AetherI18n ? AetherI18n.t('settings.section.amadeus') : 'AI形象设置'}</span></div>
          <div class="settings-body">
            <div class="form-group">
              <label class="form-label">${window.AetherI18n ? AetherI18n.t('settings.amadeus.name') : '助手显示名称'}</label>
              <input type="text" class="form-input" id="s-amadeus-name" value="${escHtml(settings.amadeusName || 'AMADEUS')}" placeholder="AMADEUS" maxlength="40">
            </div>
            <div class="form-group">
              <label class="form-label">${window.AetherI18n ? AetherI18n.t('settings.amadeus.profile') : '助手人格包'}</label>
              <select class="form-select" id="s-amadeus-agent-profile">
                <option value="AMADEUS" ${(settings.amadeusAgentProfile || 'AMADEUS') === 'AMADEUS' ? 'selected' : ''}>AMADEUS</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="margin:0">${window.AetherI18n ? AetherI18n.t('settings.amadeus.kb') : '知识库原文注入'}</label>
              <label style="display:flex;align-items:center;gap:10px;font-size:.88rem;cursor:pointer;margin-top:6px">
                <input type="checkbox" id="s-amadeus-kb-full" ${settings.assistantKbFullExtract !== false ? 'checked' : ''}>
                <span>附带手写知识点 &amp; 日记条目原文</span>
              </label>
            </div>
            <div class="form-group">
              <label class="form-label">${window.AetherI18n ? AetherI18n.t('settings.amadeus.scholar') : '学术检索（OpenAlex）'}</label>
              <select class="form-select" id="s-amadeus-scholar-mode">
                <option value="off" ${settings.assistantScholarSearchMode === 'off' ? 'selected' : ''}>${window.AetherI18n ? AetherI18n.t('settings.amadeus.scholarOff') : '关闭'}</option>
                <option value="auto" ${(settings.assistantScholarSearchMode || 'auto') === 'auto' ? 'selected' : ''}>${window.AetherI18n ? AetherI18n.t('settings.amadeus.scholarAuto') : '自动（含学术触发词时）'}</option>
                <option value="always" ${settings.assistantScholarSearchMode === 'always' ? 'selected' : ''}>${window.AetherI18n ? AetherI18n.t('settings.amadeus.scholarAlways') : '始终'}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">${window.AetherI18n ? AetherI18n.t('settings.ttsChannel') : '朗读通道'}</label>
              <select class="form-select" id="s-amadeus-tts-mode">
                <option value="auto" ${(settings.amadeusTtsMode||'auto')==='auto'?'selected':''}>${window.AetherI18n ? AetherI18n.t('settings.tts.auto') : '自动（Fish → SiliconFlow → 浏览器）'}</option>
                <option value="fish" ${settings.amadeusTtsMode==='fish'?'selected':''}>${window.AetherI18n ? AetherI18n.t('settings.tts.fish') : '仅 Fish'}</option>
                <option value="siliconflow" ${settings.amadeusTtsMode==='siliconflow'?'selected':''}>${window.AetherI18n ? AetherI18n.t('settings.tts.siliconflow') : '仅 SiliconFlow'}</option>
                <option value="browser" ${settings.amadeusTtsMode==='browser'?'selected':''}>${window.AetherI18n ? AetherI18n.t('settings.tts.browser') : '仅浏览器语音'}</option>
              </select>
            </div>
            <div class="form-group" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <label class="form-label" style="margin:0">${window.AetherI18n ? AetherI18n.t('settings.ttsAutoRead') : '自动朗读'}</label>
              <input type="checkbox" id="s-amadeus-voice" ${settings.amadeusVoiceEnabled !== false ? 'checked' : ''} style="cursor:pointer">
              <button type="button" class="btn btn-ghost" style="font-size:.82rem;padding:6px 12px" onclick="App.previewAmadeusTts()">${window.AetherI18n ? AetherI18n.t('settings.previewTts') : '试听'}</button>
            </div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-header"><span class="settings-section-title">${window.AetherI18n ? AetherI18n.t('settings.section.log') : '诊断日志'}</span></div>
          <div class="settings-body">
            <button type="button" class="btn btn-ghost" onclick="App.exportDiagLog()">${window.AetherI18n ? AetherI18n.t('settings.log.export') : '导出诊断日志 (.txt)'}</button>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-header"><span class="settings-section-title">${window.AetherI18n ? AetherI18n.t('settings.section.github') : 'GitHub 同步'}</span></div>
          <div class="settings-body">
            <div class="form-group"><label class="form-label">GitHub Token</label>
              <input type="password" class="form-input" id="s-ghtoken" value="${settings.githubToken||''}" placeholder="ghp_…">
            </div>
            <div class="form-group"><label class="form-label">Gist ID</label>
              <input type="text" class="form-input" id="s-gistid" value="${settings.githubGistId||''}" placeholder="首次导出后自动生成">
            </div>
            <div style="display:flex;gap:10px">
              <button class="btn btn-ghost" id="btn-export-gist" onclick="App.exportGist()">${window.AetherI18n ? AetherI18n.t('settings.github.upload') : '↑ 上传至 GitHub'}</button>
              <button class="btn btn-ghost" id="btn-import-gist" onclick="App.importGist()">${window.AetherI18n ? AetherI18n.t('settings.github.download') : '↓ 从 GitHub 下载'}</button>
            </div>
          </div>
        </div>
        <details class="settings-section settings-advanced-details">
          <summary class="settings-section-header settings-advanced-summary">
            <span class="settings-section-title">${window.AetherI18n ? AetherI18n.t('settings.section.advanced') : '高级设置'}</span>
            <span class="settings-advanced-chevron" aria-hidden="true">›</span>
          </summary>
          <div class="settings-body">
            <div class="reset-options-grid">
              <button class="btn btn-ghost reset-opt-btn" onclick="App.resetPartialData('tasks')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                ${window.AetherI18n ? AetherI18n.t('settings.danger.resetTasks') : '重置任务数据'}
              </button>
              <button class="btn btn-ghost reset-opt-btn" onclick="App.resetPartialData('credits')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                ${window.AetherI18n ? AetherI18n.t('settings.danger.resetCredits') : '重置积分记录'}
              </button>
              <button class="btn btn-ghost reset-opt-btn" onclick="App.resetPartialData('knowledge')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                ${window.AetherI18n ? AetherI18n.t('settings.danger.resetKb') : '重置知识库'}
              </button>
              <button class="btn btn-ghost reset-opt-btn" onclick="App.resetPartialData('chat')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 0 2 2z"/></svg>
                ${window.AetherI18n ? AetherI18n.t('settings.danger.clearChat') : '清空对话记录'}
              </button>
            </div>
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
              <button class="btn btn-danger" onclick="App.resetAllData()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                ${window.AetherI18n ? AetherI18n.t('settings.danger.clearAll') : '清除所有本地数据'}
              </button>
            </div>
          </div>
        </details>
        </div>
      </div>
      <div class="settings-save-bar">
        <span class="settings-save-caption">${window.AetherI18n ? AetherI18n.t('settings.saveCaption') : '以下内容可滚动查阅，请务必保存后再离开本页。'}</span>
        <button type="button" class="btn btn-primary btn-lg settings-save-primary" onclick="App.saveSettings()">${window.AetherI18n ? AetherI18n.t('settings.save') : '保存设置'}</button>
      </div>`;
    document.querySelectorAll('#view-settings input:not([type="button"]):not([type="submit"]), #view-settings textarea, #view-settings select').forEach(el => {
      el.addEventListener('input', () => { dirtySettings = true; });
      el.addEventListener('change', () => { dirtySettings = true; });
    });
  }

  function setRole(k) {
    document.querySelectorAll('.role-card').forEach(c => c.classList.toggle('active', c.dataset.role===k));
    dirtySettings = true;
    bindSidebarRoleAvatar(k);
  }
  function toggleApiKeyVisibility() {
    const i = document.getElementById('s-apikey'); if(i) i.type = i.type==='password'?'text':'password';
    dirtySettings = true;
  }

  function selectLLMProvider(id) {
    document.querySelectorAll('.llm-provider-card').forEach(c => c.classList.toggle('active', c.dataset.provider === id));
    document.querySelectorAll('.llm-key-group').forEach(g => g.classList.toggle('active', g.dataset.providerSection === id));
    dirtySettings = true;
  }

  function saveSettings() {
    saveSettingsQuiet();
    dirtySettings = false;
    if (window.AetherI18n) {
      AetherI18n.applyDocumentLang();
      AetherI18n.applyNavLabels();
      if (currentView === 'chat') renderChat();
    }
    const savedMsg = window.AetherI18n ? AetherI18n.t('settings.saved') : '设置已保存';
    showToast(savedMsg, 'success');
    if (currentView === 'settings') renderSettings();
  }

  function exportDiagLog() {
    if (!window.AetherLog || typeof window.AetherLog.download !== 'function') {
      showToast('日志模块未加载', 'error');
      return;
    }
    try {
      window.AetherLog.download();
      showToast('已开始下载诊断日志', 'success', 2200);
    } catch (e) {
      showToast('导出失败：' + (e.message || String(e)), 'error');
    }
  }

  function previewAmadeusTts() {
    saveSettingsQuiet();
    const s = AetherStorage.getSettings();
    const voiceState = resolveAmadeusVoiceTtsState(s);
    if (window.AetherLog) {
      try {
        const fishRef = !!(voiceState.fishAudioReferenceId && String(voiceState.fishAudioReferenceId).trim());
        window.AetherLog.info(
          'tts',
          'preview_start',
          'mode=' +
            (s.amadeusTtsMode || 'auto') +
            ' bcp=' +
            voiceState.speechBcp +
            ' translate=' +
            (voiceState.translate ? '1' : '0') +
            ' fishRef=' +
            fishRef
        );
      } catch (e) {}
    }
    if (!window.AetherAmadeusVoice || typeof window.AetherAmadeusVoice.speak !== 'function') {
      showToast('语音模块未加载', 'error');
      return;
    }
    const tip = window.AetherI18n && typeof window.AetherI18n.t === 'function' ? AetherI18n.t('toast.ttsPreviewing') : '正在按当前朗读通道试听…';
    showToast(tip, 'info', 2200);
    const PREVIEW_BY_SPEECH = {
      zh: '这是 AETHER 的试听语音，用于确认当前通道是否按预期工作。',
      en: 'This is an AETHER voice preview to check the current TTS channel.',
      ja: 'これは AETHER の読み上げ試聴です。現在のチャネルが正しく動いているか確認してください。',
    };
    const phrase = PREVIEW_BY_SPEECH[voiceState.speechLangKey] || PREVIEW_BY_SPEECH.zh;
    window.AetherAmadeusVoice.speak(phrase, {
      speechLang: voiceState.speechBcp,
      onPlaybackStart: function () {
        l2dSetGazeFollow(false);
        startMouthAnimation();
      },
      onPlaybackEnd: function () {
        stopMouthAnimation();
        l2dSetGazeFollow(true);
      },
      onEnd: function () {},
    });
  }

  async function exportGist() {
    saveSettings();
    const btn = document.getElementById('btn-export-gist');
    if (btn) { btn.textContent='上传中…'; btn.disabled=true; }
    try { await AetherStorage.exportToGist(); showToast('同步成功！', 'success', 4000); }
    catch (e) { showToast('同步失败：'+e.message, 'error'); }
    finally { if (btn) { btn.innerHTML='↑ 上传至 GitHub'; btn.disabled=false; } renderSettings(); }
  }

  async function importGist() {
    saveSettings();
    const btn = document.getElementById('btn-import-gist');
    if (btn) { btn.textContent='下载中…'; btn.disabled=true; }
    try { await AetherStorage.importFromGist(); showToast('数据已从 GitHub 恢复', 'success'); updateHeaderCredits(); }
    catch (e) { showToast('恢复失败：'+e.message, 'error'); }
    finally { if (btn) { btn.innerHTML='↓ 从 GitHub 下载'; btn.disabled=false; } }
  }

  function resetAllData() {
    openModal('清除数据',
      `<p style="color:var(--text-secondary)">此操作将清除任务、积分、每日知识库、对话与设置等，且<strong style="color:var(--danger)">无法恢复</strong>。</p>
       <p style="color:var(--text-muted);font-size:.82rem;margin-top:8px">知识库中通过「添加知识」手写归档的内容使用独立存储，<strong>不会</strong>被此项删除。建议先同步至 GitHub 再操作其他数据。</p>`,
      [{ label:'取消', class:'btn btn-ghost', action:closeModal },
       { label:'确认清除', class:'btn btn-danger', action:() => {
         ['aether_tasks','aether_credits','aether_chat','aether_stats','aether_kb_entries','aether_redemption_items','aether_task_templates','aether_redemption_templates','aether_redemption_hidden','aether_settings'].forEach(k=>localStorage.removeItem(k));
         closeModal(); showToast('数据已清除','info'); navigateTo('dashboard');
       }}]);
  }

  function resetPartialData(scope) {
    const SCOPE_LABELS = { tasks: '任务数据', credits: '积分记录', knowledge: '知识库', chat: '对话记录' };
    const SCOPE_KEYS = {
      tasks:     ['aether_tasks'],
      credits:   ['aether_credits', 'aether_amadeus_gifts_ledger'],
      knowledge: ['aether_kb_entries'],
      chat:      ['aether_chat'],
    };
    const label = SCOPE_LABELS[scope] || scope;
    const keys  = SCOPE_KEYS[scope] || [];
    const knowledgeNote = scope === 'knowledge'
      ? '<p style="color:var(--text-muted);font-size:.78rem;margin-top:10px">「添加知识」中的手写摘录不会随此项删除。</p>' : '';
    openModal(`重置${label}`,
      `<p style="color:var(--text-secondary)">确认重置<strong style="color:var(--text-primary)">「${label}」</strong>？此操作<strong style="color:var(--danger)">无法恢复</strong>。</p>${knowledgeNote}`,
      [{ label:'取消', class:'btn btn-ghost', action:closeModal },
       { label:`重置${label}`, class:'btn btn-danger', action:() => {
         keys.forEach(k => localStorage.removeItem(k));
         closeModal();
         showToast(`${label}已重置`, 'info');
         navigateTo(currentView === 'settings' ? 'settings' : currentView);
         updateHeaderCredits();
       }}]);
  }

  function openRoleModal() { navigateTo('settings'); }

  // ============================================================
  // PROFILE VIEW
  // ============================================================

  function renderProfile() {
    dirtyProfile = false;
    const view = document.getElementById('view-profile');
    const p = AetherStorage.getProfile();
    const updatedLabel = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('zh-CN',{month:'long',day:'numeric'}) + ' 更新' : '';

    view.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">个人档案</div>
          <div class="section-subtitle">USER PROFILE${updatedLabel ? ' · ' + updatedLabel : ''}</div>
        </div>
        <button class="btn btn-primary" onclick="App.saveProfile()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          保存档案
        </button>
      </div>

      <div class="profile-grid">
        <div class="profile-section glass-card">
          <div class="profile-section-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            基本信息
          </div>
          <div class="profile-fields">
            <div class="form-group">
              <label class="form-label">姓名 / 称呼</label>
              <input type="text" class="form-input" id="p-name" value="${escHtml(p.name||'')}" placeholder="你希望 AI 怎么称呼你">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="form-group">
                <label class="form-label">年龄</label>
                <input type="text" class="form-input" id="p-age" value="${escHtml(p.age||'')}" placeholder="例：25岁">
              </div>
              <div class="form-group">
                <label class="form-label">职业 / 身份</label>
                <input type="text" class="form-input" id="p-occupation" value="${escHtml(p.occupation||'')}" placeholder="例：产品经理、大学生">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">个人简介</label>
              <textarea class="form-textarea" id="p-bio" rows="3" placeholder="简单介绍一下自己，AI 会更了解你的背景和偏好">${escHtml(p.bio||'')}</textarea>
            </div>
          </div>
        </div>

        <div class="profile-section glass-card">
          <div class="profile-section-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            长远目标
          </div>
          <div class="profile-fields">
            <div class="form-group">
              <label class="form-label">人生目标 / 长远规划</label>
              <textarea class="form-textarea" id="p-goals" rows="4" placeholder="例：三年内转型为独立开发者；保持健康体重；学会第二门语言…&#10;&#10;AI 会根据这些目标为你推荐任务和建议">${escHtml(p.longTermGoals||'')}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">当前专注方向（近期 1-3 个月）</label>
              <textarea class="form-textarea" id="p-focus" rows="3" placeholder="例：专注提升技术能力，完成副业第一单…">${escHtml(p.currentFocus||'')}</textarea>
            </div>
          </div>
        </div>

        <div class="profile-section glass-card">
          <div class="profile-section-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            当前困扰
          </div>
          <div class="profile-fields">
            <div class="form-group">
              <label class="form-label">正在困扰你的事情</label>
              <textarea class="form-textarea" id="p-concerns" rows="4" placeholder="例：拖延严重，很难开始任务；工作与生活失去平衡；对未来方向感到迷茫…&#10;&#10;诚实地写下来，AI 会更有针对性地帮你">${escHtml(p.concerns||'')}</textarea>
            </div>
          </div>
        </div>

        <div class="profile-section glass-card">
          <div class="profile-section-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            特质与注意事项
          </div>
          <div class="profile-fields">
            <div class="form-group">
              <label class="form-label">个性特质 / AI 应注意的事项</label>
              <textarea class="form-textarea" id="p-traits" rows="4" placeholder="例：INFP，容易焦虑，不喜欢被催促；偏视觉型学习者；有多动症倾向，需要任务拆细…&#10;&#10;这些信息会帮助 AI 调整与你沟通的方式">${escHtml(p.traits||'')}</textarea>
            </div>
          </div>
        </div>
      </div>

      <div class="profile-ai-hint glass-card">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ai-blue)" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 8v4l3 3"/><path d="M22 2L12 12"/></svg>
        <span>档案信息会自动传递给 AI，让它更了解你。信息仅存于本地，不会上传到任何服务器（除非你主动同步到 GitHub）。</span>
      </div>`;
    document.querySelectorAll('#view-profile input, #view-profile textarea').forEach(el => {
      el.addEventListener('input', () => { dirtyProfile = true; });
      el.addEventListener('change', () => { dirtyProfile = true; });
    });
  }

  function saveProfile() {
    saveProfileWithoutToast();
    dirtyProfile = false;
    showToast('档案已保存', 'success');
  }

  // ============================================================
  // MODAL HELPERS
  // ============================================================

  function openModal(title, bodyHtml, actions = []) {
    const overlay   = document.getElementById('modal-overlay');
    const container = document.getElementById('modal-container');
    container.className = 'modal-container glass-card';
    container.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">${escHtml(title)}</div>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-footer">
        ${actions.map((a,i) => `<button class="btn ${a.class||''}" id="modal-action-${i}">${escHtml(a.label)}</button>`).join('')}
      </div>`;
    overlay.classList.remove('hidden');
    actions.forEach((a,i) => { const btn=document.getElementById(`modal-action-${i}`); if (btn && a.action) btn.addEventListener('click',a.action); });
    overlay.addEventListener('click', e => { if (e.target===overlay) closeModal(); }, { once:true });
  }

  function openLargeModal(title, bodyHtml, actions = []) {
    openModal(title, bodyHtml, actions);
    document.getElementById('modal-container')?.classList.add('modal-large');
  }

  // For modals that supply their own complete HTML (header + body + footer)
  function openRawModal(html) {
    const overlay   = document.getElementById('modal-overlay');
    const container = document.getElementById('modal-container');
    container.className = 'modal-container glass-card';
    container.innerHTML = html;
    overlay.classList.remove('hidden');
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); }, { once: true });
  }

  function closeModal() {
    pendingAIDecompose = null;
    document.getElementById('modal-overlay')?.classList.add('hidden');
    document.getElementById('modal-container')?.classList.remove('modal-large');
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  function showToast(msg, type='info', duration=3000) {
    if (window.AetherLog && (type === 'error' || type === 'warning')) {
      if (type === 'error') AetherLog.error('toast', msg);
      else AetherLog.warn('toast', msg);
    }
    const icons = { success:'✓', error:'✕', info:'ℹ', gold:'✦', warning:'!' };
    const container = document.getElementById('toast-container'); if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ'}</span><span class="toast-msg">${escHtml(msg)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('exit'); setTimeout(()=>toast.remove(),300); }, duration);
  }

  function showConfetti() {
    const canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:9999';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const COLORS = ['#F7D060','#F0A050','#4ADE80','#60A5FA','#F472B6','#A78BFA','#FF6B6B','#34D399'];
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height * 0.5,
      w: 6 + Math.random() * 8,
      h: 10 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * Math.PI * 2,
      vx: (Math.random() - 0.5) * 3,
      vy: 3 + Math.random() * 4,
      vr: (Math.random() - 0.5) * 0.15,
      alpha: 1,
    }));
    let frame = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.12;
        if (frame > 80) p.alpha -= 0.015;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (frame < 140) requestAnimationFrame(draw);
      else canvas.remove();
    }
    draw();
  }

  function showCreditPop(amount, target) {
    const el = document.createElement('div');
    el.className = 'credit-pop';
    el.textContent = `${amount>0?'+':''}${amount} ✦`;
    const rect = target?.getBoundingClientRect?.() || {left:window.innerWidth/2,top:window.innerHeight/2};
    el.style.left = rect.left+'px'; el.style.top = (rect.top+window.scrollY)+'px';
    document.body.appendChild(el); setTimeout(()=>el.remove(),1600);
  }

  function escHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso), now = new Date(), diff = now - d;
    if (diff < 60000)    return '刚刚';
    if (diff < 3600000)  return Math.floor(diff/60000)+' 分钟前';
    if (diff < 86400000) return Math.floor(diff/3600000)+' 小时前';
    return d.toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'});
  }

  // ============================================================
  //  BRANCHES — 长期枝条任务
  // ============================================================

  function renderBranches() {
    const el = document.getElementById('view-branches');
    if (!el) return;
    const branches = AetherStorage.getBranches();
    const onboarded = localStorage.getItem('aether_branches_onboarded');
    const showGuide = !onboarded && branches.length === 0;

    el.innerHTML = `
      <div class="section-header">
        <div>
          <h1 class="section-title">长期任务</h1>
          <div class="section-subtitle">目标步骤链 · 逐步解锁 · 完成即进阶</div>
        </div>
        <div class="section-header-actions">
          <button class="btn btn-ghost btn-sm" onclick="App.openAIBranchModal()">AI 生成长期任务</button>
          <button class="btn btn-primary btn-sm" onclick="App.openAddBranchModal()">+ 新建长期任务</button>
        </div>
      </div>

      ${showGuide ? `
        <div class="branch-onboarding glass-card" id="branch-onboarding">
          <div class="branch-onboarding-header">
            <span class="branch-onboarding-icon branch-onboarding-letter">序</span>
            <div>
              <div class="branch-onboarding-title">欢迎使用长期任务</div>
              <div class="branch-onboarding-sub">像游戏技能树一样，把大目标拆解成有序的步骤链</div>
            </div>
            <button class="btn-icon branch-onboarding-close" onclick="App.dismissBranchOnboarding()" title="知道了">✕</button>
          </div>
          <div class="branch-onboarding-steps">
            <div class="branch-onboarding-step">
              <div class="bon-step-num">1</div>
              <div class="bon-step-body">
                <div class="bon-step-title">创建长期任务</div>
                <div class="bon-step-desc">设置目标名称，添加一系列由易到难的步骤，每步可设置积分奖励</div>
              </div>
            </div>
            <div class="branch-onboarding-arrow">→</div>
            <div class="branch-onboarding-step">
              <div class="bon-step-num">2</div>
              <div class="bon-step-body">
                <div class="bon-step-title">拉入任务列表</div>
                <div class="bon-step-desc">点击「拉入任务列表」，当前步骤会出现在你的任务管理中</div>
              </div>
            </div>
            <div class="branch-onboarding-arrow">→</div>
            <div class="branch-onboarding-step">
              <div class="bon-step-num">3</div>
              <div class="bon-step-body">
                <div class="bon-step-title">完成即解锁下一步</div>
                <div class="bon-step-desc">完成任务后，下一个步骤自动加入列表，循序渐进直到目标达成</div>
              </div>
            </div>
          </div>
          <div style="text-align:center;margin-top:20px">
            <button class="btn btn-primary" onclick="App.openAddBranchModal();App.dismissBranchOnboarding()">+ 创建第一个长期任务</button>
            <button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="App.dismissBranchOnboarding()">知道了</button>
          </div>
        </div>
      ` : ''}

      ${branches.length === 0 && onboarded ? `
        <div class="empty-state glass-card" style="padding:48px 24px;margin-top:24px;">
          <div class="empty-state-icon empty-state-dot" style="opacity:0.45"></div>
          <div style="font-size:0.95rem;margin-bottom:16px;">还没有长期任务</div>
          <button class="btn btn-primary" onclick="App.openAddBranchModal()">+ 新建第一个长期任务</button>
        </div>
      ` : ''}

      ${branches.length > 0 ? `<div class="branches-list">${branches.map(renderBranchCard).join('')}</div>` : ''}
    `;
  }

  function dismissBranchOnboarding() {
    localStorage.setItem('aether_branches_onboarded', '1');
    renderBranches();
  }

  function renderBranchCard(branch) {
    const total = branch.steps.length;
    const done  = branch.steps.filter(s => s.done).length;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
    const isComplete = done === total && total > 0;
    const curStep = branch.steps[branch.currentStepIdx];
    const isPulled = curStep && curStep.pulledTaskId;

    return `
      <div class="branch-card glass-card ${isComplete ? 'branch-complete' : ''}" id="bcard-${branch.id}">
        <div class="branch-card-header">
          <span class="branch-emoji">${escHtml(branchGlyph(branch))}</span>
          <div class="branch-meta">
            <div class="branch-name">${branch.name}</div>
            ${branch.description ? `<div class="branch-desc">${branch.description}</div>` : ''}
          </div>
          <div class="branch-header-right">
            <div class="branch-progress-label">${done}/${total}</div>
            <div class="branch-header-actions">
              <button class="btn-icon" onclick="App.openEditBranchModal('${branch.id}')" title="编辑">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-icon btn-icon-danger" onclick="App.deleteBranchPrompt('${branch.id}')" title="删除">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>
          </div>
        </div>

        <div class="branch-progress-track">
          <div class="branch-progress-fill" style="width:${pct}%"></div>
        </div>

        <div class="branch-steps">
          ${branch.steps.map((step, i) => renderBranchStep(branch, step, i)).join('')}
        </div>

        ${!isComplete && curStep && !isPulled ? `
          <div class="branch-pull-row">
            <button class="btn btn-ghost btn-sm branch-pull-btn" onclick="App.pullBranchStep('${branch.id}')">
              ↓ 拉入任务列表
            </button>
          </div>
        ` : ''}
        ${!isComplete && isPulled ? `
          <div class="branch-pull-row">
            <span class="branch-pulled-hint">⚡ 当前步骤已在任务列表中，完成后自动解锁下一步</span>
          </div>
        ` : ''}
        ${isComplete ? `
          <div class="branch-complete-banner">长期任务全部完成</div>
        ` : ''}
      </div>
    `;
  }

  function renderBranchStep(branch, step, i) {
    const cur = branch.currentStepIdx;
    const isDone = step.done;
    const isActive = i === cur && !isDone;
    const isLocked = i > cur;
    let cls = 'branch-step';
    if (isDone)   cls += ' branch-step-done';
    if (isActive) cls += ' branch-step-active';
    if (isLocked) cls += ' branch-step-locked';
    const icon = isDone ? '✓' : isActive ? '▶' : '⬡';
    return `
      <div class="${cls}">
        <div class="branch-step-icon">${icon}</div>
        <div class="branch-step-body">
          <div class="branch-step-title">${step.title}</div>
          ${step.note ? `<div class="branch-step-note">${step.note}</div>` : ''}
        </div>
        <div class="branch-step-credits">${step.credits}✦</div>
        ${isLocked ? '<div class="branch-step-lock" title="锁定">锁</div>' : ''}
      </div>
    `;
  }

  function tryAdvanceBranch(branchId) {
    const result = AetherStorage.advanceBranch(branchId);
    const branch = AetherStorage.getBranch(branchId);
    if (!result) {
      // Branch complete
      if (branch) showToast(`长期任务「${branch.name}」全部完成`, 'gold', 5500);
    } else {
      // Auto-pull next step into task list
      const { step, stepIdx } = result;
      const newTask = AetherStorage.createTask({
        title: step.title,
        credits: step.credits,
        priority: 'medium',
        description: step.note || '',
        branchId: branchId,
        branchStepIdx: stepIdx,
      });
      AetherStorage.setBranchStepPulled(branchId, stepIdx, newTask.id);
      showToast(`任务解锁：「${step.title}」已自动加入任务列表`, 'success', 4500);
    }
    if (currentView === 'branches') renderBranches();
  }

  function pullBranchStep(branchId) {
    const branch = AetherStorage.getBranch(branchId);
    if (!branch) return;
    const stepIdx = branch.currentStepIdx;
    const step = branch.steps[stepIdx];
    if (!step || step.done) return;
    if (step.pulledTaskId) {
      showToast('当前步骤已在任务列表中', 'info'); return;
    }
    const newTask = AetherStorage.createTask({
      title: step.title,
      credits: step.credits,
      priority: 'medium',
      description: step.note || '',
      branchId: branchId,
      branchStepIdx: stepIdx,
    });
    AetherStorage.setBranchStepPulled(branchId, stepIdx, newTask.id);
    showToast(`「${step.title}」已加入任务列表`, 'success');
    renderBranches();
  }

  // ---- Add / Edit Branch Modal ----
  let _branchSteps = [];
  let _pendingAIBranch = null;

  function openAddBranchModal(prefill) {
    _branchSteps = (prefill && prefill.steps) ? prefill.steps.map(s => ({ ...s })) : [];
    openRawModal(buildBranchModalHTML(null, prefill));
    renderBranchStepRows();
  }

  function openEditBranchModal(id) {
    const branch = AetherStorage.getBranch(id);
    if (!branch) return;
    _branchSteps = branch.steps.map(s => ({ title: s.title, credits: s.credits, note: s.note || '' }));
    openRawModal(buildBranchModalHTML(id, branch));
    renderBranchStepRows();
  }

  function buildBranchModalHTML(existingId, prefill) {
    const p = prefill || {};
    return `
      <div class="modal-header">
        <div class="modal-title">${existingId ? '编辑长期任务' : '新建长期任务'}</div>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">任务名称</label>
          <input id="branch-name" class="form-input" placeholder="例：精通 TypeScript" value="${p.name || ''}">
        </div>
        <div style="display:grid;grid-template-columns:90px 1fr;gap:10px">
          <div class="form-group">
            <label class="form-label">图标</label>
            <div class="emoji-picker-wrap">
              <input type="text" class="form-input emoji-input" id="branch-emoji" placeholder="可选" maxlength="4" value="${escHtml(p.emoji || '')}">
              <button type="button" class="btn btn-ghost btn-sm emoji-picker-toggle" onclick="App.toggleEmojiPicker('branch-emoji-grid')">▼</button>
            </div>
            <div class="emoji-picker-grid hidden" id="branch-emoji-grid">
              ${EMOJI_PRESETS.map(e=>`<button type="button" class="emoji-btn" onclick="App.pickEmoji('branch-emoji','branch-emoji-grid','${e}')">${e}</button>`).join('')}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">简介（选填）</label>
            <input id="branch-desc" class="form-input" placeholder="这条枝条要达成什么目标" value="${p.description || ''}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" style="margin-bottom:8px">步骤链
            <span style="font-size:0.72rem;color:var(--text-muted);font-weight:400;margin-left:6px">从第一步开始，由简到难</span>
          </label>
          <div id="branch-step-rows"></div>
          <button class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%" onclick="App.addBranchStepRow()">+ 添加步骤</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="App.closeModal()">取消</button>
        <button class="btn btn-primary" onclick="App.saveBranchFromModal('${existingId || ''}')">保存</button>
      </div>
    `;
  }

  function renderBranchStepRows() {
    const container = document.getElementById('branch-step-rows');
    if (!container) return;
    container.innerHTML = _branchSteps.map((s, i) => `
      <div class="branch-step-edit-row" id="bser-${i}">
        <span class="bser-num">${i + 1}</span>
        <input class="form-input bser-title" placeholder="步骤标题" value="${(s.title || '').replace(/"/g,'&quot;')}">
        <input class="form-input bser-credits" type="number" min="5" max="200" placeholder="积分" value="${s.credits || 30}">
        <input class="form-input bser-note" placeholder="备注（选填）" value="${(s.note || '').replace(/"/g,'&quot;')}">
        <button class="btn-icon btn-icon-danger" onclick="App.removeBranchStepRow(${i})" title="删除">✕</button>
      </div>
    `).join('') || '<div style="color:var(--text-muted);font-size:0.82rem;padding:8px 0">还没有步骤，点击下方添加</div>';
  }

  function syncStepsFromDOM() {
    const rows = document.querySelectorAll('.branch-step-edit-row');
    _branchSteps = Array.from(rows).map(row => ({
      title:   row.querySelector('.bser-title')?.value || '',
      credits: parseInt(row.querySelector('.bser-credits')?.value) || 30,
      note:    row.querySelector('.bser-note')?.value || '',
    }));
  }

  function addBranchStepRow() {
    syncStepsFromDOM();
    _branchSteps.push({ title: '', credits: 30, note: '' });
    renderBranchStepRows();
    setTimeout(() => {
      const rows = document.querySelectorAll('.bser-title');
      if (rows.length) rows[rows.length - 1].focus();
    }, 50);
  }

  function removeBranchStepRow(i) {
    syncStepsFromDOM();
    _branchSteps.splice(i, 1);
    renderBranchStepRows();
  }

  function saveBranchFromModal(existingId) {
    syncStepsFromDOM();
    const name = document.getElementById('branch-name')?.value.trim();
    const emoji = document.getElementById('branch-emoji')?.value.trim() || '';
    const desc  = document.getElementById('branch-desc')?.value.trim() || '';
    if (!name) { showToast('请输入任务名称', 'error'); return; }
    const validSteps = _branchSteps.filter(s => s.title && s.title.trim());
    if (validSteps.length === 0) { showToast('请至少添加一个步骤', 'error'); return; }
    if (existingId) {
      const branch = AetherStorage.getBranch(existingId);
      if (!branch) return;
      // Merge: keep done status for existing steps
      const merged = validSteps.map((s, i) => {
        const old = branch.steps[i];
        return old
          ? { ...old, title: s.title, credits: s.credits, note: s.note }
          : { id: 'bs_' + Date.now() + '_' + i, title: s.title, credits: s.credits, note: s.note, done: false, pulledTaskId: null };
      });
      branch.name = name; branch.emoji = emoji; branch.description = desc; branch.steps = merged;
      AetherStorage.saveBranch(branch);
      showToast('长期任务已更新', 'success');
    } else {
      AetherStorage.createBranch({ name, emoji, description: desc, steps: validSteps });
      showToast('长期任务已创建', 'success');
    }
    closeModal();
    if (currentView === 'branches') renderBranches();
  }

  function deleteBranchPrompt(id) {
    const branch = AetherStorage.getBranch(id);
    if (!branch) return;
    openRawModal(`
      <div class="modal-header">
        <div class="modal-title">删除长期任务</div>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <p style="color:var(--text-secondary);line-height:1.6">
          确定删除长期任务「${escHtml(branchGlyph(branch))} ${escHtml(branch.name)}」？<br>
          <span style="color:var(--text-muted);font-size:0.82rem">此操作不可撤销，已拉入任务列表的步骤不受影响。</span>
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="App.closeModal()">取消</button>
        <button class="btn btn-danger" onclick="App.confirmDeleteBranch('${id}')">确认删除</button>
      </div>
    `);
  }

  function confirmDeleteBranch(id) {
    AetherStorage.deleteBranch(id);
    closeModal();
    showToast('长期任务已删除', 'info');
    if (currentView === 'branches') renderBranches();
  }

  // ---- AI Generate Branch Modal ----
  function openAIBranchModal() {
    const settings = AetherStorage.getSettings();
    if (!AetherAI.hasConfiguredKey(settings)) {
      showToast('请先在设置中配置 AI API Key', 'error'); return;
    }
    openRawModal(`
      <div class="modal-header">
        <div class="modal-title">AI 生成长期任务</div>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">描述你的长期目标</label>
          <textarea id="ai-branch-goal" class="form-textarea" rows="3"
            placeholder="例：我想在3个月内系统学会 React，从零到能独立开发项目"></textarea>
        </div>
        <div id="ai-branch-result" style="display:none">
          <div class="kb-ai-content" id="ai-branch-preview" style="min-height:60px;white-space:pre-wrap"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="App.closeModal()">取消</button>
        <button class="btn btn-primary" id="ai-branch-gen-btn" onclick="App.generateBranchFromAI()">生成长期任务</button>
      </div>
    `);
  }

  async function generateBranchFromAI() {
    const goal = document.getElementById('ai-branch-goal')?.value.trim();
    if (!goal) { showToast('请描述你的目标', 'error'); return; }
    const btn = document.getElementById('ai-branch-gen-btn');
    if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }
    const preview = document.getElementById('ai-branch-preview');
    const resultEl = document.getElementById('ai-branch-result');
    try {
      const settings = AetherStorage.getSettings();
      const data = await AetherAI.generateBranch(goal, settings.currentRole);
      if (preview) {
        preview.textContent = `${data.emoji} ${data.name}\n${data.description}\n\n步骤：\n${data.steps.map((s,i) => `${i+1}. ${s.title}（${s.credits}✦）${s.note ? '\n   '+s.note : ''}`).join('\n')}`;
        resultEl.style.display = 'block';
      }
      // Store result and replace footer buttons
      _pendingAIBranch = data;
      const footer = document.querySelector('.modal-footer');
      if (footer) footer.innerHTML = `
        <button class="btn btn-ghost" onclick="App.closeModal()">取消</button>
        <button class="btn btn-ghost" onclick="App.openAIBranchModal()">重新生成</button>
        <button class="btn btn-primary" onclick="App.applyAIBranch()">使用此长期任务</button>
      `;
    } catch (e) {
      showToast('AI 生成失败：' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '生成长期任务'; }
    }
  }

  function applyAIBranch() {
    if (!_pendingAIBranch) { showToast('数据已过期，请重新生成', 'error'); return; }
    const data = _pendingAIBranch;
    _pendingAIBranch = null;
    closeModal();
    openAddBranchModal(data);
  }

  // Expose
  window.App = {
    navigateTo,
    openAddTaskModal, openEditTaskModal, openAIDecompose, applyAIDecomposeStored, applyDecompose,
    handleCompleteTask, quickToggleTask, toggleSubtaskCompletion, toggleSubtasks, deleteTask, setFilter,
    toggleTemplatePicker, applyTaskTemplate, deleteTaskTemplate, openSaveTemplateModal,
    addManualSubtaskRow, setDueDateShortcut,
    sendChatMessage, handleChatKey, switchChatRole, clearChat, clearAmadeusChat,
    pickAmadeusAttachments, pickAmadeusAttachmentFolder, onAmadeusAttachInput, onAmadeusAttachDrop, removeAmadeusAttachment,
    toggleAmadeusVoiceQuick,
    triggerTaskEval, toggleMemoryPanel, deleteLTMFact, clearLTM, refreshMemoryStats,
    openTodaySummary, addKBResource, removeKBResource, saveKBFromModal, editKBEntry, deleteKBEntry,
    openKBCustomModal, deleteKBCustomEntryPrompt, syncKBToAI, polishKBEntry,
    selectCalDay, calPrevMonth, calNextMonth, calGoToday, openAddTaskWithDate,
    setRewardsTab, confirmRedeem, promptRemoveRedemptionItem, openHiddenRedemptionsModal, restoreHiddenRedemption, openAddRedemptionModal, applyRedemptionTemplate,
    deleteRedemptionUserTemplate, openSaveRedemptionTemplateModal,
    toggleEmojiPicker, pickEmoji,
    refreshAgentSuggestions, createSuggestedTask,
    toggleDailyTask, toggleDailyTaskForDate, openAddDailyTaskModal, openEditDailyTaskModal, deleteDailyTaskPrompt, openDailyHistoryModal,
    renderBranches, dismissBranchOnboarding, pullBranchStep, openAddBranchModal, openEditBranchModal, saveBranchFromModal,
    deleteBranchPrompt, confirmDeleteBranch, addBranchStepRow, removeBranchStepRow,
    openAIBranchModal, generateBranchFromAI, applyAIBranch,
    saveProfile,
    selectLLMProvider,
    setTheme, setRole, toggleApiKeyVisibility, saveSettings, previewAmadeusTts, exportDiagLog, exportGist, importGist, resetAllData, resetPartialData,
    openRoleModal, openModal, openRawModal, closeModal, showToast,
    refreshAfterAmadeusActions,
    resolveAmadeusVoiceTtsState,
    onAmadeusSpeechLangChange,
  };

})();
