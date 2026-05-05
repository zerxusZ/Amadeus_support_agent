# AETHER — 项目说明文档
> **工程级约束：此文件与项目代码同等重要。**  
> 每次对任意源文件做出修改后，必须更新本文件中受影响的部分，保持说明与实现严格一致。  
> 禁止删除此文件。

---

## 一、项目简介

**AETHER** 是一个运行在浏览器中的个人自我管理系统，集成了 AI 助手（AMADEUS）。  
无需服务器，所有数据保存在本机 `localStorage`，直接用浏览器打开 `index.html` 即可运行。

---

## 二、核心功能

| 功能模块 | 说明 |
|----------|------|
| 仪表盘 | 图片数字时钟、任务统计、积分概览、快捷操作 |
| 任务管理 | 主任务增删改查、优先级、截止日期快速选择、积分奖励、AI 拆解 |
| 日历 | 按日期查看任务，支持点击日期快速建任务 |
| 每日任务 | 可重复的习惯性任务，独立打卡记录 |
| 长期任务（枝条） | 多步骤长期目标，支持 AI 生成 |
| 知识库 | 手动录入知识点 + AI 自动从对话提炼摘要 |
| AI 助手（AMADEUS） | 多 LLM 后端、三层 Agent 架构、TTS 语音、Live2D 角色 |
| 积分中心 | 完成任务获积分、兑换奖励、记录流水 |
| 个人档案 | 姓名、长期目标、个人描述（供 AI 个性化参考） |
| 设置 | LLM 提供商/密钥、角色切换、TTS 配置、GitHub 同步 |

---

## 三、运行方式

### 直接运行（推荐）

用浏览器直接打开 `index.html`。无需 Node.js，无需任何构建步骤。

```
双击 index.html
或
在浏览器地址栏输入：file:///C:/Users/Zerxus/man2/index.html
```

### 启用 Fish Audio TTS（可选）

Fish Audio 需要本地反向代理以解决 CORS 限制：

```cmd
scripts\start-fish-proxy.cmd
```

这会启动 `scripts/fish-audio-proxy.mjs`（Node.js），监听本地端口，转发 Fish Audio API 请求。

### GitHub 同步（可选）

在设置页配置 GitHub Personal Access Token 和 Gist ID，可上传/下载全量数据至 GitHub Gist 作为云端备份。

---

## 四、AI 配置

进入「设置」页，选择 LLM 提供商并填入 API Key：

| 提供商 | 获取地址 |
|--------|----------|
| Claude（Anthropic） | https://console.anthropic.com |
| OpenAI | https://platform.openai.com |
| Google Gemini | https://aistudio.google.com |
| Kimi（Moonshot） | https://platform.moonshot.cn |
| DeepSeek | https://platform.deepseek.com |

---

## 五、当前设计规范

### 主题

当前硬锁定为 **scifi（朱红暗电路板）** 主题，通过 `index.html` 中 `data-theme="scifi"` 和内联脚本固定。

### 配色方案

| 用途 | 色值 |
|------|------|
| 主强调色（--ai-blue） | `#E83535`（亮朱红） |
| 基础强调色 | `#CA2828`（深朱红） |
| 最深背景 | `#0e0404` |
| 卡片背景 | `rgba(202,40,40,0.06)` |
| 边框默认 | `rgba(202,40,40,0.18)` |
| 主文字 | `rgba(255,252,252,0.98)` |
| 次文字 | `rgba(255,232,236,0.86)` |
| 辅助文字 | `rgba(255,210,218,0.62)` |
| 成功色 | `#00ff99` |
| 危险色 | `#ff2244` |

### 字体

| 用途 | 字体 |
|------|------|
| 代码 / 标题 / 数字 | JetBrains Mono |
| 正文 | Plus Jakarta Sans |
| 展示标题 | JetBrains Mono（scifi 主题） |

字体通过 `index.html` 中 Google Fonts `<link>` 加载（非 CSS @import）。

### 边框规范

- 默认卡片边框：`1px solid var(--border-hover)`
- 悬停/激活边框：`var(--border-active)`
- 弹窗边框：`1px solid var(--main-border-ui-strong) !important` + 深色不透明背景
- 侧边栏边框：`2px solid rgba(202,40,40,0.44)` + 外阴影
- 所有边框均配备对应层级的 `box-shadow` 以增强质感

---

## 六、功能模块现状

### 仪表盘时钟

- 使用 `img/numbers-{0-9}.png` + `img/colon.png` 组成图片时钟
- 数字图片高度：`3.15em`（相对于 h1 字号）
- 冒号图片高度：`2.34em`
- 每 10 秒通过 `updateDashboardClock()` 刷新（仅更新 `#dash-time-digits`，不重渲染整个仪表盘）
- 标签 "SYSTEM ONLINE" 在图片上方以小字显示

### AMADEUS Agent

- 三层架构：L3 约束层 → L2 行为层 → L1 输出层
- 情绪升级：逾期任务 ≥1 触发紧迫，≥3 触发不耐烦，≥5 触发愤怒
- TTS：Fish Audio（本地代理）→ SiliconFlow → 浏览器 Web Speech（优先级顺序）
- 文字同步：同语言精确 segment 同步；翻译模式按进度比例展开

### 积分体系

- 完成任务获取积分，积分可兑换奖励
- AI 礼物项目：同调冰淇淋（tier1）、超量系统锁（tier2）、连接算力包（tier3）

### 多语言（i18n）

- 支持：简体中文（zh）、English（en）、日本語（ja）
- 设置页可切换，切换后立即生效（不需刷新）

---

## 七、已知限制

- 无服务端，数据仅在本机浏览器 localStorage 中（GitHub Gist 可备份）
- Fish Audio TTS 需要运行本地 Node.js 代理
- Live2D 模型仅支持内置模型，切换需手动修改配置
- 无 ES Module / 无打包器，所有文件通过 `<script src>` 顺序加载
- `color-mix()` 等现代 CSS 函数需要较新版本浏览器（Chrome 111+）

---

## 八、变更日志（重要修改记录）

> 每次修改代码后，在此处追加一条记录。格式：`日期 · 修改内容摘要`

| 日期 | 修改内容 |
|------|----------|
| 2026-05-04 | 全面 i18n 修复（hardcoded 中文替换为 t() 调用） |
| 2026-05-04 | 字体稳定性修复（CSS @import → index.html link 预连接） |
| 2026-05-04 | AMADEUS 逾期任务情绪升级（mood.js 重写） |
| 2026-05-04 | TTS 翻译模式文字同步（syncByProgress 模式） |
| 2026-05-04 | UI 全面改色至朱红 #CA2828 主题，替换所有旧粉色 pink 残留 |
| 2026-05-04 | AI 礼物名称更新：同调冰淇淋 / 超量系统锁 / 连接算力包 |
| 2026-05-04 | AI 聊天气泡头像改为 img/ama.png |
| 2026-05-04 | 全面边框增强（glass-card、modal、task-card、nav-item 等） |
| 2026-05-04 | 日期快速选择 chip（今天/明天/+3天/+1周/清除） |
| 2026-05-04 | 弹窗背景改为不透明（rgba(12,3,3,0.97)） |
| 2026-05-04 | 侧边栏文字亮度提升，图标 opacity: 1 |
| 2026-05-04 | 设置页大幅删减冗余说明文字 |
| 2026-05-04 | 仪表盘图片数字时钟（numbers-0~9.png + colon.png），每 10 秒刷新 |
| 2026-05-04 | 时钟数字增大 3 倍（height: 3.15em），标签改为列方向布局 |
| 2026-05-04 | 创建 ARCHITECTURE.md 和 PROJECT.md 工程文档 |
| 2026-05-04 | 修复 AI 生成长期任务失败：generateBranch() 错误调用 chat()（传入 role.systemPrompt 字符串而非 roleKey），改为直接调用 _callLLM() 非流式，与 decomposeTask 等函数保持一致 |

---

## 九、修改操作规程

**每次对项目做出任何修改时，必须执行以下步骤：**

1. **修改前**：读取 `ARCHITECTURE.md` 和 `PROJECT.md`，了解当前架构约束
2. **修改中**：遵守第十一章（ARCHITECTURE.md）修改守则
3. **修改后**：
   - 在 `PROJECT.md` 第八节变更日志追加一条记录
   - 更新 `ARCHITECTURE.md` / `PROJECT.md` 中与本次修改相关的所有章节
   - 两个文档均需与实现保持严格一致，不允许滞后

**此规程不可跳过，不论修改大小。**
