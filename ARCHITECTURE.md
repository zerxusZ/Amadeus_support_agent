# AETHER — 技术架构文档
> **工程级约束：此文件与项目代码同等重要。**  
> 每次对任意源文件做出修改后，必须更新本文件中受影响的部分，保持架构描述与实现严格一致。

---

## 一、技术栈概览

| 维度 | 实现方式 |
|------|----------|
| 运行环境 | 纯浏览器（单页应用，无服务端） |
| 模块系统 | 全局 IIFE + `window.*` 命名空间（无 ES Modules，无打包器） |
| 脚本加载 | `index.html` 中顺序 `<script src>` 标签，顺序即依赖顺序 |
| 样式 | 单一 `css/main.css`，CSS 自定义属性 + 多主题覆盖 |
| 数据持久化 | `localStorage`（`AetherStorage`） |
| AI 通信 | 浏览器 `fetch` 直连各 LLM API |
| TTS | Fish Audio（需代理）/ SiliconFlow / 浏览器 Web Speech API |
| Live2D | pixi.js + Live2DCubismCore + index.min.js（本地静态） |

---

## 二、脚本加载顺序（`index.html`）

加载顺序即初始化顺序，不可随意调换。

```
js/storage.js          → AetherStorage（全局存储层，所有层均依赖）
js/i18n.js             → AetherI18n（国际化，app.js 依赖）
config/tts-config.js   → TTS 密钥与通道配置

agent/aether-log.js    → AetherLog（共享日志工具）

agent/AMADEUS/modules/L3/anti-hallucination.js  → 幻觉约束
agent/AMADEUS/modules/L3/file-boundary.js       → 文件边界约束
agent/AMADEUS/modules/L3/memory.js              → 长期记忆模块
agent/AMADEUS/modules/L3/attention.js           → 注意力权重

agent/AMADEUS/modules/L2/task-decomp.js         → 任务拆解
agent/AMADEUS/modules/L2/ltask-manager.js       → 长期任务管理
agent/AMADEUS/modules/L2/summarization.js       → 总结生成
agent/AMADEUS/modules/L2/kb-sync.js             → 知识库同步
agent/AMADEUS/modules/L2/skill-controller.js    → 技能路由

agent/AMADEUS/modules/L1/personality.js         → 人格输出
agent/AMADEUS/modules/L1/language.js            → 语言适配
agent/AMADEUS/modules/L1/mood.js                → 情绪状态
agent/AMADEUS/modules/L1/format.js              → 格式控制

agent/AMADEUS/modules/index.js  → 模块注册表（整合 L1/L2/L3 为 system prompt）
agent/AMADEUS/config.js         → Agent 身份元数据注册表
agent/AMADEUS/harness.js        → 受控上下文 + 技能表 + 人格评估
agent/AMADEUS/context.js        → 应用层上下文契约（runtime contract）
agent/AMADEUS/attachments.js    → 文件附件处理
agent/AMADEUS/actions.js        → AI 动作指令解析与执行
agent/AMADEUS/ai.js             → LLM 通信层（多后端路由）

utils/live2d/live2d.min.js
utils/live2d/live2dcubismcore.min.js
utils/live2d/pixi.min.js
utils/live2d/index.min.js       → Live2D 运行时（只读，不可修改）

agent/AMADEUS/voice.js          → TTS 语音合成与文字同步
js/app.js                       → 主 UI 层（必须最后加载）
```

---

## 三、目录结构

```
man2/
├── index.html                  # 入口，定义加载顺序与 HTML 骨架
├── css/
│   └── main.css                # 唯一样式文件；主题通过 data-theme 切换
├── js/
│   ├── app.js                  # UI 渲染、视图路由、事件绑定（约 4500+ 行）
│   ├── storage.js              # 全局数据持久化（localStorage CRUD）
│   └── i18n.js                 # 国际化翻译表（zh / en / ja）
├── config/
│   └── tts-config.js           # Fish Audio / SiliconFlow 密钥与参数（本地，勿提交）
├── agent/
│   ├── aether-log.js           # 共享日志工具（AetherLog）
│   └── AMADEUS/
│       ├── config.js           # Agent 身份注册表（可扩展多 profile）
│       ├── harness.js          # 上下文组装入口（AetherAmadeusHarness）
│       ├── context.js          # Runtime contract 生成（机器可读声明）
│       ├── attachments.js      # 附件读取与注入
│       ├── actions.js          # <aether_action> 指令解析与执行
│       ├── ai.js               # LLM 调用层（AetherAI，多后端路由）
│       ├── voice.js            # TTS 合成、音频播放、文字同步
│       └── modules/
│           ├── index.js        # 模块注册表，组装完整 system prompt
│           ├── L1/             # 输出层（直接影响模型回复风格）
│           │   ├── personality.js  # 人格核心（AMADEUS 身份定义）
│           │   ├── language.js     # 语言/语域规则
│           │   ├── mood.js         # 情绪状态（含逾期任务愤怒升级）
│           │   └── format.js       # 回复格式约束
│           ├── L2/             # 行为层（工具使用与任务推理）
│           │   ├── task-decomp.js      # AI 拆解子任务
│           │   ├── ltask-manager.js    # 长期任务（枝条）推理
│           │   ├── summarization.js    # 对话总结提炼
│           │   ├── kb-sync.js          # 知识库同步触发
│           │   └── skill-controller.js # 技能路由决策
│           └── L3/             # 约束层（硬性边界，最高优先级）
│               ├── anti-hallucination.js  # 幻觉抑制
│               ├── file-boundary.js       # 文件访问边界声明
│               ├── memory.js              # LTM 注入规则
│               └── attention.js           # 注意力优先级权重
├── img/
│   ├── back.png                # 主内容区背景图
│   ├── ama.png                 # AI 助手聊天气泡头像
│   ├── numbers-0.png ~ numbers-9.png  # 仪表盘时钟数字图片
│   ├── colon.png               # 仪表盘时钟冒号图片
│   └── *.png                   # 其他 UI 图标
├── scripts/
│   ├── fish-audio-proxy.mjs    # Fish TTS 代理服务（Node.js）
│   ├── start-fish-proxy.cmd    # 启动代理的快捷脚本
│   └── split_numbers_sprites.py # 数字精灵图切割工具
├── utils/
│   └── live2d/                 # Live2D 运行时（第三方，只读）
├── fish-tts-proxy/             # Fish TTS 代理相关资源
├── ARCHITECTURE.md             # 本文件（架构文档，与代码同等重要）
└── PROJECT.md                  # 项目说明文档（与代码同等重要）
```

---

## 四、全局命名空间

所有模块通过 `window.*` 暴露，无 ES Module 隔离：

| 全局变量 | 来源文件 | 职责 |
|----------|----------|------|
| `window.AetherStorage` | `js/storage.js` | 全部 localStorage 读写 |
| `window.AetherI18n` | `js/i18n.js` | 翻译函数 `t(key)` |
| `window.AetherAI` | `agent/AMADEUS/ai.js` | LLM 调用、角色管理 |
| `window.AetherAmadeusHarness` | `agent/AMADEUS/harness.js` | system prompt 组装 |
| `window.AetherAmadeusContext` | `agent/AMADEUS/context.js` | runtime contract 生成 |
| `window.AetherAmadeusAttachments` | `agent/AMADEUS/attachments.js` | 附件处理 |
| `window.AetherAmadeusActions` | `agent/AMADEUS/actions.js` | 动作解析执行 |
| `window.AetherAmadeusVoice` | `agent/AMADEUS/voice.js` | TTS 与文字同步 |
| `window.AetherAgentProfiles` | `agent/AMADEUS/config.js` | Agent profile 注册表 |
| `window.AetherLog` | `agent/aether-log.js` | 调试日志 |
| `window.App` | `js/app.js`（IIFE 尾部） | UI 公开 API（供 HTML onclick 调用） |

---

## 五、数据层（`js/storage.js`）

所有数据存储于 `localStorage`，Key 前缀为 `aether_*`。

### 主要数据域

| 域 | Storage Key | 说明 |
|----|-------------|------|
| Tasks | `aether_tasks` | 主任务列表（含子任务、截止日期、积分） |
| Daily Tasks | `aether_daily_tasks` | 每日重复任务 |
| Branches | `aether_branches` | 长期任务（枝条） |
| Credits | `aether_credits` | 积分余额 + 交易流水 |
| Stats | `aether_stats` | 连续天数、总完成数等统计 |
| Settings | `aether_settings` | 用户偏好设置（含 API Key） |
| Profile | `aether_profile` | 用户档案（姓名、目标等） |
| KB Entries | `aether_kb_*` | 知识库（AI 摘要 + 手写条目） |
| Chat History | `aether_amadeus_history` | AMADEUS 对话历史 |
| LTM | `aether_ltm_facts` | 长期记忆事实列表 |
| Redemptions | `aether_redemptions` | 积分兑换记录 |
| Gift Catalog | `aether_ai_gifts` | 可兑换 AI 礼物目录 |

---

## 六、UI 层（`js/app.js`）

### 视图路由

`navigateTo(viewName)` 驱动视图切换，同时触发对应渲染函数：

| 视图 ID | 渲染函数 | 说明 |
|---------|----------|------|
| `dashboard` | `renderDashboard()` | 仪表盘，含图片时钟 |
| `tasks` | `renderTasks()` | 任务列表 |
| `calendar` | `renderCalendar()` | 日历 |
| `daily` | `renderDaily()` | 每日任务 |
| `branches` | `renderBranches()` | 长期任务枝条 |
| `knowledge` | `renderKnowledge()` | 知识库 |
| `chat` | `renderChat()` | AMADEUS AI 对话 |
| `rewards` | `renderRewards()` | 积分中心 |
| `profile` | `renderProfile()` | 个人档案 |
| `settings` | `renderSettings()` | 设置页 |

### 主题系统

主题通过 `document.documentElement.dataset.theme` 切换。  
当前硬锁定为 `'scifi'`（`LOCKED_THEME` 常量）。

| 主题 Key | 说明 |
|----------|------|
| `scifi` | 朱红暗电路板风格（当前激活） |
| `cozy` | 暖色舒适风格 |
| `pressure` | 高压警示风格 |

CSS 覆盖规则：`[data-theme="scifi"] .selector { ... }` 覆盖基础 `:root` 变量。

### 图片时钟（仪表盘）

- `buildTimeDigitHtml(timeStr)` — 将 `"HH:MM"` 转为 `<img>` 序列
- `updateDashboardClock()` — 每 10 秒更新 `#dash-time-digits` span
- 图片源：`img/numbers-{0-9}.png`、`img/colon.png`
- CSS 控制：`.time-digit`（`height: 3.15em`）、`.time-colon`（`height: 2.34em`）

### 公开 API（`window.App`）

所有 HTML `onclick` 均调用 `App.*` 方法，在 IIFE 末尾统一暴露。  
**新增功能必须在此注册，否则 HTML 内联事件无法调用。**

---

## 七、Agent 架构（AMADEUS 三层模型）

```
┌─────────────────────────────────────────────┐
│  L3 — 约束层（最高优先级，不可被 L1/L2 覆盖）         │
│  anti-hallucination · file-boundary         │
│  memory · attention                         │
├─────────────────────────────────────────────┤
│  L2 — 行为层（工具使用、任务推理）                    │
│  task-decomp · ltask-manager                │
│  summarization · kb-sync · skill-controller │
├─────────────────────────────────────────────┤
│  L1 — 输出层（影响回复风格，最灵活）                  │
│  personality · language · mood · format     │
└─────────────────────────────────────────────┘
         ↓ 组装为完整 system prompt
      modules/index.js
         ↓
      harness.js（注入任务/记忆/KB 上下文）
         ↓
      context.js（runtime contract 声明）
         ↓
      ai.js（fetch → LLM API）
```

### 情绪升级规则（`L1/mood.js`）

当 `ctx.overdueCount >= 1` 时激活 URGENT 状态：
- `n >= 5`：愤怒（逾期 n 个）
- `n >= 3`：不耐烦（逾期 n 个）
- `n >= 1`：紧迫

---

## 八、TTS 语音系统（`agent/AMADEUS/voice.js`）

### 通道优先级（`auto` 模式）

```
Fish Audio（需 scripts/fish-audio-proxy.mjs 本地代理）
    → 失败 → SiliconFlow API
        → 失败 → 浏览器 Web Speech API
```

### 文字同步模式

| 模式 | 触发条件 | 机制 |
|------|----------|------|
| `syncVoiceReveal` | TTS 语言 = 系统语言 | 逐 segment 精确同步 |
| `syncByProgress` | TTS 语言 ≠ 系统语言（翻译模式） | 按播放进度比例展开文字 |

---

## 九、国际化（`js/i18n.js`）

- 支持语言：`zh`（简体中文）、`en`（English）、`ja`（日本語）
- 访问方式：`AetherI18n.t('key')` 或 `window.AetherI18n ? AetherI18n.t('key') : '兜底文本'`
- DOM 自动应用：`AetherI18n.applyNavLabels()` 填充 `data-i18n` 属性节点
- **新增 UI 文本必须同时在三个语言中添加对应 key**

---

## 十、CSS 设计系统

### CSS 自定义属性（`:root`）

关键变量（scifi 主题中被 `[data-theme="scifi"]` 覆盖）：

```css
--ai-blue        /* 主题强调色，当前 #E83535（朱红） */
--bg-primary     /* 最深背景 */
--bg-card        /* 卡片背景（半透明） */
--border         /* 默认边框 */
--border-hover   /* 悬停边框 */
--border-active  /* 激活/聚焦边框 */
--sidebar-bg     /* 侧边栏背景 */
--header-bg      /* 顶栏背景 */
--main-border-ui / --main-border-ui-strong  /* 主区域边框 */
--font-display / --font-body / --font-mono  /* 字体族 */
```

### 主题覆盖顺序（specificity 从低到高）

```
:root { ... }
[data-theme="scifi"] { ... }      /* 主题变量覆盖 */
#main-content .glass-card { ... } /* 背景图区域特例 */
```

---

## 十一、修改守则

1. **加载顺序**：新增脚本必须在 `index.html` 中按依赖顺序插入，不可破坏已有顺序。
2. **命名空间**：所有新模块必须挂载到 `window.Aether*` 命名空间，避免全局污染。
3. **UI 公开 API**：新增 `onclick` 处理函数必须在 `window.App` 对象中注册。
4. **i18n**：新增 UI 文本必须同时在 `zh`/`en`/`ja` 三个语言中添加 key。
5. **存储**：新增数据域必须在 `storage.js` 中添加对应 getter/setter，并在本文档第五节登记。
6. **CSS**：主题相关样式必须同时检查 `[data-theme="scifi"]` 覆盖块，避免 pink/旧色残留。
7. **文档同步**：每次修改后更新 `ARCHITECTURE.md` 和 `PROJECT.md`，不可滞后。
