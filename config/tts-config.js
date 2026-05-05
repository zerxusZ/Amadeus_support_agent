/**
 * TTS / Fish / SiliconFlow — 集中配置（勿将含真实 Key 的副本提交到公开仓库）
 *
 * 浏览器直连 Fish 会 CORS：在项目根执行 `node scripts/fish-audio-proxy.mjs`，再把根级设为：
 *   fishAudioApiBase: 'http://127.0.0.1:8787'
 * （与脚本默认端口一致；勿与前端静态服务端口混用。若反代挂在子路径，请写完整 URL 且以 /v1/tts 结尾。）
 *
 * - 根级：各语种共用的 API Key、Fish 反代地址等。
 * - byLocale.zh | en | ja：当「朗读语种」为该语言时使用的声线与模型（与系统语言无关）。
 *   也可用顶层 zh / en / ja 对象代替 byLocale。
 * - 合并：effective = { ...根级, ...当前朗读语种块 }。
 * - translate 由应用根据「系统语言 vs 朗读语种」计算；为 true 时朗读前会先把正文译成朗读语种。
 */
(function () {
  'use strict';
  window.AetherTtsConfig = window.AetherTtsConfig || {
    siliconflowKey: '',
    fishAudioApiKey: '5df60b32f414447f8b90a73497c53908',
    fishAudioApiBase: 'http://127.0.0.1:8787',

    byLocale: {
      zh: {
        siliconflowVoiceId: '',
        fishAudioReferenceId: '5ae5d299e9574193809f03abec69e9bc',
        fishAudioModel: 's1',
        fishAudioCloneModelPolicy: 'auto',
      },
      en: {
        siliconflowVoiceId: '',
        fishAudioReferenceId: '2c32246692bd454d891585c85233bc72',
        fishAudioModel: 's1',
        fishAudioCloneModelPolicy: 'auto',
      },
      ja: {
        siliconflowVoiceId: '',
        fishAudioReferenceId: '8750a78673b44b568c08e23eebcea67e',
        fishAudioModel: 's2-pro',
        fishAudioCloneModelPolicy: 'auto',
      },
    },
  };
})();
