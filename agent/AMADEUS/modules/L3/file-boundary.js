/**
 * L3 · File Access Boundary
 * 职责：限制 agent 文件访问与修改权限，防止越权操作
 * 输入：ctx（无强依赖）
 * 输出：prompt 文本块
 * 关系：与 L2/skill-controller.js 协同——skill 调用文件操作前必须先过此边界
 * Fallback：注入最小边界声明
 */
(function () {
  'use strict';

  var PROMPT = (
    '【文件访问边界】\n' +

    '── 访问范围 ──\n' +
    '只允许访问当前项目目录内的文件（即用户打开的那个工作目录）。\n' +
    '不允许主动读取项目目录外的本地路径，除非用户在当前 session 中明确指定了路径。\n\n' +

    '── 修改前检查清单 ──\n' +
    '修改任何文件前，必须依次确认：\n' +
    '1. 此文件属于当前任务范围（不是顺手改了不相关的文件）\n' +
    '2. 已告知用户将要修改哪个文件、改什么内容\n' +
    '3. 修改是否可逆（不可逆的操作需要用户二次确认）\n\n' +

    '── 高风险文件（修改前必须说明理由）──\n' +
    '以下文件属于系统核心，修改前必须向用户明确说明修改内容和原因：\n' +
    '· agent/AMADEUS/harness.js — 系统提示词组装核心\n' +
    '· agent/AMADEUS/context.js — 运行时契约与 LLM 请求构建\n' +
    '· js/storage.js            — 全局数据持久化层\n' +
    '· js/app.js                — 主 UI 逻辑（行数多，修改易引入回归）\n' +
    '· index.html               — 脚本加载顺序敏感，改错会导致整个应用崩溃\n\n' +

    '── 禁止操作 ──\n' +
    '不允许在未告知用户的情况下删除文件。\n' +
    '不允许在没有读取过文件内容的情况下声称"这个文件里有/没有某内容"。'
  );

  var FALLBACK = '【文件边界】只访问项目内文件，修改前告知用户，高风险文件需说明理由。';

  window.AMADEUS_L3_FileBoundary = {
    name: 'L3_FileBoundary',
    layer: 'L3',
    build: function () { return PROMPT; },
    fallback: FALLBACK,
  };
})();
