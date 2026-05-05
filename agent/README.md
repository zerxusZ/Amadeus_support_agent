# Agent 配置（按助手名称分目录）

每个子目录对应一种可切换的助手**人格与技能文案**（系统提示素材），由 `js/amadeus-harness.js` 在运行时读取 `window.AetherAgentProfiles[配置键]` 拼装进 LLM。

## 目录约定

- `AMADEUS/` — 默认助手；`config.js` 暴露 `window.AetherAgentProfiles.AMADEUS`。
- 新增候补：复制 `AMADEUS` 文件夹，改名（例如 `KURISU`），修改其中 `config.js` 的对象键与 `displayName`，在 `index.html` 里为该文件增加一行 `<script src="agent/KURISU/config.js"></script>`（放在 `amadeus-harness.js` 之前）。
- 在 AETHER **设置 → 助手角色配置** 中选择 `amadeusAgentProfile`（与设置里「AI 助手角色」不同：后者为对话**语气角色**；本项为 **prompt 包 / 助手品牌**）。

## 字段说明（`config.js` 内对象）

| 字段 | 用途 |
|------|------|
| `identity` | 人格与身份总述 |
| `memoryArchitecture` | 记忆纪律；可用占位符 `__SHORT_TERM_MAX__`（与 harness 中常量一致） |
| `skills` | 技能表文案 |
| `behaviorDirectives` | 行为与说话方式 |
| `ltmExtractPrompt` | 长期记忆抽取子系统提示 |

任务进展评估 JSON 的**字段契约**仍由 harness 内 `getTaskEvalSystemPrompt` 拼接（会引用当前 profile 的 `identity` + `memoryArchitecture`）。
