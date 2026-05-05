---
name: aether-amadeus-progress-eval
description: >-
  AETHER 项目中 AMADEUS「任务进展评估」功能：触发方式、系统提示、JSON 输出契约与前端格式化。
  在修改 js/amadeus-harness.js、js/ai.js 中 evaluateTaskProgress / getTaskEvalSystemPrompt，
  或调试助手页「📊 进展评估」按钮时使用。
---

# AETHER · AMADEUS 任务进展评估（Progress Eval）

## 代码位置

- `js/amadeus-harness.js`：`getTaskEvalSystemPrompt`、`buildTaskEvalUserPayload`、`formatTaskEvalJson`；主对话技能表中的 `skill_progress_eval`。
- `js/ai.js`：`evaluateTaskProgress()` 组装快照、调用 LLM、再经 `formatTaskEvalJson` 转为可读文本。
- `js/app.js`：`triggerTaskEval()` 绑定助手页按钮，将结果插入对话气泡。

## 何时触发（产品语义）

- 用户点击助手页 **「📊 进展评估」**。
- 用户在对话中明确询问完成节奏、是否落后、与目标差距等——主对话 system prompt 中的 `skill_progress_eval` 要求模型基于任务快照回答；**结构化 JSON 子调用**仍由 `evaluateTaskProgress` 专用链路完成。

## LLM 输出契约（必须严格遵守）

模型在进展评估子任务中 **只输出一个 JSON 对象**，不要 markdown 代码围栏。字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `assessment` | string | 2–5 句中文，结合待办、逾期、今日完成与档案，具体有温度。 |
| `completion_level` | string | 仅允许：`ahead` \| `on_track` \| `behind` \| `unclear`。 |
| `progress_note` | string | 一句中文，概括相对用户自身目标的完成感。 |
| `next_actions` | string[] | 1–3 条，动词开头、可立即执行。 |
| `risks` | string[] | 0–2 条可选，点出逾期或过载等。 |

### `completion_level` 口径（与 harness 一致）

- **ahead**：明显超前于自设节奏或近期完成密度很高。
- **on_track**：与当前专注、截止与任务结构大致匹配。
- **behind**：逾期或堆积明显，或连续未完成关键项。
- **unclear**：档案或任务数据不足；须在 `assessment` 中诚实说明。

## 用户载荷快照

`buildTaskEvalUserPayload` 注入：显示名、今日完成数、待处理数、逾期数、待办标题示例（最多 8 条）、知识库摘要片段（若有）。修改快照字段时须同步更新 harness 与 `ai.js` 中传入对象。

## 前端展示

`formatTaskEvalJson` 从模型输出中提取首个 `{...}` JSON，解析失败则回退原始文本。成功时拼接：评估正文、节奏标签、`progress_note`、编号后的 `next_actions` 与 `risks`。

## 修改时注意

- 保持 **纯 JSON** 约定，否则 `formatTaskEvalJson` 与 UI 会异常。
- 主对话的 `SHORT_TERM_MAX` 与进展评估的 **独立 system prompt** 不要混用同一段提示词。
- 新增评估维度时，优先扩展 JSON 字段并在 `formatTaskEvalJson` 中格式化，避免破坏现有解析。
