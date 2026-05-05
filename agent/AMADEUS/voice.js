/* ============================================================
   Amadeus 语音朗读
   通道：设置 amadeusTtsMode；密钥与按语种的声线/克隆见 config/tts-config.js（window.AetherTtsConfig）
   ============================================================ */
window.AetherAmadeusVoice = (function () {
  var FISH_URL_DEFAULT = 'https://api.fish.audio/v1/tts';
  var SF_URL = 'https://api.siliconflow.cn/v1/audio/speech';
  var SF_MODEL = 'FunAudioLLM/CosyVoice2-0.5B';
  var SF_VOICE_FALLBACK = 'zh_female_shuangkuaishu_emo_v2';
  var SF_VOICE_BY_BCP = {
    'zh-CN': 'zh_female_shuangkuaishu_emo_v2',
    'en-US': 'en_female_sarah_fixed_bigtts',
    'ja-JP': 'ja_female_yugiri_moon_bigtts',
  };

  var _audioCtx = null;
  var _activeNode = null;
  var _cancelled = false;
  var _activeSpeakOpts = null;
  var _progressRaf = null;

  function _clearProgressRaf() {
    if (_progressRaf != null) {
      cancelAnimationFrame(_progressRaf);
      _progressRaf = null;
    }
  }

  function _maybePlaybackEnd(o) {
    if (!o || !o._playbackStartFired) return;
    if (typeof o.onPlaybackEnd === 'function') {
      try {
        o.onPlaybackEnd();
      } catch (e) {}
    }
    o._playbackStartFired = false;
  }

  function _getAudioCtx() {
    if (!_audioCtx || _audioCtx.state === 'closed') {
      try {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {}
    }
    return _audioCtx;
  }

  function _getAppSettings() {
    try {
      if (window.AetherStorage && typeof window.AetherStorage.getSettings === 'function') {
        return window.AetherStorage.getSettings();
      }
    } catch (e) {}
    try {
      return JSON.parse(localStorage.getItem('aether_settings') || '{}');
    } catch (e) {
      return {};
    }
  }

  function _readRawTtsConfig() {
    try {
      if (window.AetherTtsConfig && typeof window.AetherTtsConfig === 'object') return window.AetherTtsConfig;
    } catch (e) {}
    return {};
  }

  function _isPlainLocaleBag(v) {
    return !!(v && typeof v === 'object' && !Array.isArray(v));
  }

  function _pickLocaleBlock(raw, locKey) {
    if (raw.byLocale && _isPlainLocaleBag(raw.byLocale[locKey])) return raw.byLocale[locKey];
    if (raw.locales && _isPlainLocaleBag(raw.locales[locKey])) return raw.locales[locKey];
    if (_isPlainLocaleBag(raw[locKey])) return raw[locKey];
    return {};
  }

  function _mergeTtsConfigForSpeechLang(speechBcp47) {
    var raw = _readRawTtsConfig();
    var s = String(speechBcp47 || 'zh-CN').toLowerCase();
    var locKey = s.indexOf('en') === 0 ? 'en' : s.indexOf('ja') === 0 ? 'ja' : 'zh';
    var common = {};
    Object.keys(raw).forEach(function (k) {
      if (k === 'byLocale' || k === 'locales') return;
      if (k === 'zh' || k === 'en' || k === 'ja') return;
      common[k] = raw[k];
    });
    var per = _pickLocaleBlock(raw, locKey);
    return Object.assign({}, common, per);
  }

  function _getFishUrlFromMerged(tts) {
    var base = String((tts && tts.fishAudioApiBase) || '').trim();
    if (!base) return FISH_URL_DEFAULT;
    base = base.replace(/\/+$/, '');
    if (/\/v1\/tts$/i.test(base)) return base;
    return base + '/v1/tts';
  }

  function _getFishModelFromMerged(tts) {
    var policy = String((tts && tts.fishAudioCloneModelPolicy) || 'auto').trim();
    var ref = String((tts && tts.fishAudioReferenceId) || '').trim();
    if (policy === 'auto' && ref) return 's2-pro';
    var m = String((tts && tts.fishAudioModel) || 's2-pro').trim();
    return m === 's2-pro' ? 's2-pro' : 's1';
  }

  function _ttsLog(level, tag, message, extra) {
    try {
      if (!window.AetherLog) return;
      var msg = String(message || '').slice(0, 2000);
      var ex = extra != null ? String(extra).slice(0, 1200) : undefined;
      if (level === 'error') window.AetherLog.error(tag || 'tts', msg, ex);
      else if (level === 'warn') window.AetherLog.warn(tag || 'tts', msg, ex);
      else window.AetherLog.info(tag || 'tts', msg, ex);
    } catch (e) {}
  }

  function _toast(msg) {
    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast(msg, 'warning', 5200);
    } else {
      console.warn('[AmadeusVoice]', msg);
    }
  }

  function _firePlaybackStart(speakOpts) {
    if (!speakOpts || speakOpts._playbackStartFired) return;
    speakOpts._playbackStartFired = true;
    if (typeof speakOpts.onPlaybackStart === 'function') {
      try {
        speakOpts.onPlaybackStart();
      } catch (e) {}
    }
  }

  function stripForSpeech(text) {
    if (!text) return '';
    return String(text)
      .replace(/<记住>[\s\S]*?<\/记住>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[`*_#>\[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitForTTS(text, langHint) {
    var t = stripForSpeech(text);
    if (!t) return [];
    var lang = String(langHint || 'zh').toLowerCase();
    var delimRe;
    if (lang === 'en') delimRe = /^[.!?\n]+$/;
    else if (lang === 'ja') delimRe = /^[。！？；．\n]+$/;
    else delimRe = /^[。！？；\n]+$/;

    var splitRe;
    if (lang === 'en') splitRe = /([.!?\n]+)/;
    else if (lang === 'ja') splitRe = /([。！？；．\n]+)/;
    else splitRe = /([。！？；\n]+)/;

    var raw = t.split(splitRe);
    var out = [];
    var buf = '';
    for (var j = 0; j < raw.length; j++) {
      buf += raw[j];
      if (delimRe.test(raw[j])) {
        if (buf.trim()) out.push(buf.trim());
        buf = '';
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  function _bcp47ToSplitLang(bcp) {
    var s = String(bcp || 'zh-CN').toLowerCase();
    if (s.indexOf('en') === 0) return 'en';
    if (s.indexOf('ja') === 0) return 'ja';
    return 'zh';
  }

  function _resolveSpeechBcp47(opts) {
    var s = opts && opts.speechLang != null ? String(opts.speechLang).trim() : '';
    if (s) return s;
    return 'zh-CN';
  }

  function _getTtsMode() {
    var m = String(_getAppSettings().amadeusTtsMode || 'auto').trim();
    if (m === 'fish' || m === 'siliconflow' || m === 'browser') return m;
    return 'auto';
  }

  function _sfVoiceForBcp(customId, bcp) {
    if (customId) return customId;
    return SF_VOICE_BY_BCP[bcp] || SF_VOICE_FALLBACK;
  }

  function _playDecodedBuffer(ctx, audioBuf, speakOpts, onDone) {
    if (_cancelled) {
      onDone(null, 0);
      return;
    }
    var dur = audioBuf.duration || 0.001;
    var src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(ctx.destination);
    _activeNode = src;
    var ctxStart = ctx.currentTime;
    function tick() {
      if (_cancelled) return;
      var elapsed = ctx.currentTime - ctxStart;
      var p = Math.min(1, Math.max(0, elapsed / dur));
      if (typeof speakOpts.onProgress === 'function') {
        try {
          speakOpts.onProgress(p);
        } catch (e) {}
      }
      if (p < 1) _progressRaf = requestAnimationFrame(tick);
      else _progressRaf = null;
    }
    src.onended = function () {
      _activeNode = null;
      _clearProgressRaf();
      if (typeof speakOpts.onProgress === 'function') {
        try {
          speakOpts.onProgress(1);
        } catch (e) {}
      }
      onDone(null, dur);
    };
    _firePlaybackStart(speakOpts);
    src.start(0);
    _progressRaf = requestAnimationFrame(tick);
  }

  function _sfSpeak(text, key, voiceId, cb, speakOpts) {
    var ctx = _getAudioCtx();
    if (!ctx) {
      cb(new Error('no AudioContext'));
      return;
    }

    var resume = ctx.state === 'suspended' ? ctx.resume().catch(function () {}) : Promise.resolve();

    resume
      .then(function () {
        return fetch(SF_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + key,
          },
          body: JSON.stringify({
            model: SF_MODEL,
            input: text,
            voice: voiceId,
            response_format: 'mp3',
            speed: 1.0,
          }),
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error('SiliconFlow TTS HTTP ' + res.status);
        return res.arrayBuffer();
      })
      .then(function (buf) {
        return ctx.decodeAudioData(buf);
      })
      .then(function (audioBuf) {
        if (_cancelled) {
          cb(null, 0);
          return;
        }
        _playDecodedBuffer(ctx, audioBuf, speakOpts, cb);
      })
      .catch(function (err) {
        _activeNode = null;
        _clearProgressRaf();
        cb(err);
      });
  }

  /** 判是否指向本机 Fish 反代（CORS 需本地 node 常驻；重启后要重新启动） */
  function _looksLikeLocalFishProxy(u) {
    return /^(https?):\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(
      String(u || '').trim(),
    );
  }

  /** Failed to fetch 等：补充本地反代排查说明 */
  function _fishSpeakNetworkHint(err, fishUrl) {
    var raw = String((err && err.message) || err || '');
    var lower = raw.toLowerCase();
    var netFail =
      lower.indexOf('failed to fetch') !== -1 ||
      lower.indexOf('networkerror') !== -1 ||
      lower.indexOf('load failed') !== -1 ||
      lower.indexOf('network request failed') !== -1;
    if (!netFail || !_looksLikeLocalFishProxy(fishUrl)) return err;
    return new Error(
      raw +
        ' · 请先启动 Fish 本地反代：在项目根目录执行 node scripts/fish-audio-proxy.mjs（默认 http://127.0.0.1:8787），保持该窗口不关；并与 config/tts-config.js 中 fishAudioApiBase 一致。浏览器打开上述地址若能见说明文字则说明反代已就绪。',
    );
  }

  function _fishSpeak(text, apiKey, referenceId, model, fishUrl, cb, speakOpts) {
    var ctx = _getAudioCtx();
    if (!ctx) {
      cb(new Error('no AudioContext'));
      return;
    }

    var resume = ctx.state === 'suspended' ? ctx.resume().catch(function () {}) : Promise.resolve();

    var rid = String(referenceId || '').trim();
    if (!rid) {
      cb(new Error('Fish reference_id 为空'));
      return;
    }

    var url = fishUrl || FISH_URL_DEFAULT;
    resume
      .then(function () {
        return fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apiKey,
            model: model,
          },
          body: JSON.stringify({
            text: text,
            reference_id: rid,
            format: 'mp3',
            condition_on_previous_chunks: false,
          }),
        });
      })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            throw new Error('Fish Audio HTTP ' + res.status + (t ? ': ' + t.slice(0, 200) : ''));
          });
        }
        return res.arrayBuffer();
      })
      .then(function (buf) {
        return ctx.decodeAudioData(buf);
      })
      .then(function (audioBuf) {
        if (_cancelled) {
          cb(null, 0);
          return;
        }
        _playDecodedBuffer(ctx, audioBuf, speakOpts, cb);
      })
      .catch(function (err) {
        _activeNode = null;
        _clearProgressRaf();
        cb(_fishSpeakNetworkHint(err, url));
      });
  }

  var _voicesReady = false;

  /** 排除系统中可能注册的成人向 / 恶搞第三方语音包，避免「朗读」误选到不当 voice.name */
  var _WEB_SPEECH_VOICE_BLOCK_SUB = [
    'nsfw',
    'r18',
    '18+',
    '18禁',
    'hentai',
    'erotic',
    'porn',
    'xxx',
    'moan',
    'fuck',
    'shit',
    'nude',
    'naked',
    'orgasm',
    'fetish',
    '福利',
    '娇喘',
    '呻吟',
    '情色',
    '肉文',
    '黄游',
    '成人向',
    '里番',
  ];
  var _WEB_SPEECH_VOICE_BLOCK_RE = [
    /\bsex\b/i,
    /\bero\b/i,
    /\bcum\b/i,
    /\bdick\b/i,
    /\bcock\b/i,
    /\bpussy\b/i,
    /\banal\b/i,
    /\bjerk\b/i,
    /\bblow\b/i,
    /\bhent\b/i,
  ];

  function _webSpeechVoiceLabelBlocked(v) {
    var blob = ((v && v.name) || '') + ' ' + ((v && v.voiceURI) || '');
    var low = blob.toLowerCase();
    var i;
    for (i = 0; i < _WEB_SPEECH_VOICE_BLOCK_SUB.length; i++) {
      if (low.indexOf(_WEB_SPEECH_VOICE_BLOCK_SUB[i]) !== -1) return true;
    }
    for (i = 0; i < _WEB_SPEECH_VOICE_BLOCK_RE.length; i++) {
      if (_WEB_SPEECH_VOICE_BLOCK_RE[i].test(blob)) return true;
    }
    return false;
  }

  function _scoreWebSpeechVoice(v, primary) {
    if (!v || _webSpeechVoiceLabelBlocked(v)) return -1;
    var name = String(v.name || '') + ' ' + String(v.voiceURI || '');
    var low = name.toLowerCase();
    var score = 0;
    if (v.localService === true) score += 80;
    if (v.default === true) score += 40;
    if (/microsoft|google|apple|samsung|baidu|xiaoyi|xiaoxiao|yunxi|huihui|yaoyao|kangkang/i.test(low)) score += 35;
    return score;
  }

  function _pickWebSpeechVoice(bcp47) {
    if (!window.speechSynthesis) return null;
    var voices = speechSynthesis.getVoices();
    var primary = String(bcp47 || 'zh-CN').split('-')[0].toLowerCase();
    var re = new RegExp('^' + primary + '(-|$)', 'i');
    var candidates = voices.filter(function (x) {
      return re.test(x.lang || '');
    });
    if (!candidates.length) {
      candidates = voices.filter(function (x) {
        return (x.lang || '').toLowerCase().indexOf(primary) === 0;
      });
    }
    if (!candidates.length) return null;
    var best = null;
    var bestScore = -2;
    var i;
    for (i = 0; i < candidates.length; i++) {
      var sc = _scoreWebSpeechVoice(candidates[i], primary);
      if (sc > bestScore) {
        bestScore = sc;
        best = candidates[i];
      }
    }
    if (best) return best;
    return candidates.find(function (x) {
      return !_webSpeechVoiceLabelBlocked(x);
    }) || candidates[0];
  }

  function _ensureVoices(cb) {
    if (!window.speechSynthesis) {
      cb();
      return;
    }
    if (speechSynthesis.getVoices().length) {
      _voicesReady = true;
      cb();
      return;
    }
    var done = function () {
      _voicesReady = true;
      speechSynthesis.removeEventListener('voiceschanged', done);
      cb();
    };
    speechSynthesis.addEventListener('voiceschanged', done);
    setTimeout(done, 800);
  }

  function _wsSpeakSegs(segs, rate, opts) {
    var bcp = _resolveSpeechBcp47(opts);
    _ttsLog('info', 'tts', 'web_speech', 'segments=' + (segs && segs.length) + ' rate=' + rate + ' lang=' + bcp);
    _ensureVoices(function () {
      var voice = _pickWebSpeechVoice(bcp);
      var i = 0;
      var n = (segs && segs.length) || 0;
      function emitProgress(p) {
        if (typeof opts.onProgress === 'function') {
          try {
            opts.onProgress(p);
          } catch (e) {}
        }
      }
      function next() {
        if (_cancelled || i >= n) {
          emitProgress(1);
          if (opts.onEnd) opts.onEnd();
          return;
        }
        var chunk = segs[i];
        if (n > 0) emitProgress(i / n);
        var cum = segs.slice(0, i + 1).join('');
        if (opts.onSegment) opts.onSegment(i, chunk, cum);
        var u = new SpeechSynthesisUtterance(chunk);
        u.lang = bcp;
        u.rate = rate;
        u.pitch = 1;
        if (voice) u.voice = voice;
        u.onstart = function () {
          _firePlaybackStart(opts);
        };
        u.onend = function () {
          i++;
          if (i < n) emitProgress(i / n);
          next();
        };
        u.onerror = function () {
          i++;
          next();
        };
        try {
          speechSynthesis.speak(u);
        } catch (e) {
          i++;
          next();
        }
      }
      if (opts.onStart) opts.onStart();
      next();
    });
  }

  function cancel() {
    _clearProgressRaf();
    _maybePlaybackEnd(_activeSpeakOpts);
    _activeSpeakOpts = null;
    _cancelled = true;
    if (_activeNode) {
      try {
        _activeNode.stop();
      } catch (e) {}
      _activeNode = null;
    }
    try {
      if (window.speechSynthesis) speechSynthesis.cancel();
    } catch (e) {}
  }

  function speak(text, opts) {
    opts = opts || {};
    opts._playbackStartFired = false;
    _cancelled = false;
    cancel();
    _cancelled = false;

    var speechBcp = _resolveSpeechBcp47(opts);
    var tts = _mergeTtsConfigForSpeechLang(speechBcp);
    var splitLang = _bcp47ToSplitLang(speechBcp);
    var segs = splitForTTS(text, splitLang);
    if (!segs.length) {
      if (opts.onEnd) opts.onEnd();
      return;
    }

    var userOnEnd = opts.onEnd;
    var sessionMeta = { mode: '', segs: segs.length, cancelled: false };
    opts.onEnd = function () {
      sessionMeta.cancelled = !!_cancelled;
      _ttsLog(
        'info',
        'tts',
        'speak_session_end',
        'mode=' + sessionMeta.mode + ' segs=' + sessionMeta.segs + (sessionMeta.cancelled ? ' cancelled=1' : '')
      );
      _maybePlaybackEnd(opts);
      _activeSpeakOpts = null;
      if (userOnEnd) userOnEnd();
    };
    _activeSpeakOpts = opts;

    var rate = typeof opts.rate === 'number' ? opts.rate : 1.0;
    var mode = _getTtsMode();
    sessionMeta.mode = mode;
    var fishKey = String(tts.fishAudioApiKey || '').trim();
    var fishRef = String(tts.fishAudioReferenceId || '').trim();
    var sfKey = String(tts.siliconflowKey || '').trim();
    var fishReady = !!(fishKey && fishRef);
    var fishUrl = _getFishUrlFromMerged(tts);
    var locKey = splitLang;
    _ttsLog(
      'info',
      'tts',
      'speak_start',
      'mode=' +
        mode +
        ' locale=' +
        locKey +
        ' fish=' +
        (fishReady ? '1' : '0') +
        ' sf=' +
        (sfKey ? '1' : '0') +
        ' segs=' +
        segs.length +
        ' bcp=' +
        speechBcp
    );

    function runFish(fishFailChain) {
      var model = _getFishModelFromMerged(tts);
      if (opts.onStart) opts.onStart();
      var fullText = segs.join('');
      if (opts.onSegment) opts.onSegment(0, fullText, fullText);
      _fishSpeak(
        fullText,
        fishKey,
        fishRef,
        model,
        fishUrl,
        function (err) {
          if (err) {
            console.warn('[AmadeusVoice] Fish Audio error:', err.message);
            _ttsLog('warn', 'tts', 'fish_request_fail', err.message);
            if (fishFailChain === 'siliconflow' && sfKey) {
              _toast('Fish TTS 失败，已改用 SiliconFlow：' + err.message);
              runSiliconFromIndex(0);
              return;
            }
            if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
              _toast(
                fishFailChain === 'siliconflow'
                  ? 'Fish TTS 失败（无 SiliconFlow Key），已改用浏览器语音：' + err.message
                  : 'Fish TTS 失败，已改用浏览器语音：' + err.message
              );
              _wsSpeakSegs(segs, rate, {
                onStart: opts.onStart,
                onPlaybackStart: opts.onPlaybackStart,
                onProgress: opts.onProgress,
                speechLang: speechBcp,
                onSegment: function (j, s) {
                  if (opts.onSegment) {
                    var c = segs.slice(0, j + 1).join('');
                    opts.onSegment(j, s, c);
                  }
                },
                onEnd: opts.onEnd,
              });
            } else {
              _toast('Fish TTS 失败且无可用回退：' + err.message);
              if (opts.onEnd) opts.onEnd();
            }
            return;
          }
          if (opts.onEnd) opts.onEnd();
        },
        opts
      );
    }

    function runSiliconFromIndex(startIdx) {
      var customId = String(tts.siliconflowVoiceId || '').trim();
      var voiceId = _sfVoiceForBcp(customId, speechBcp);
      var i = startIdx;
      var n = segs.length;
      function sfNext() {
        if (_cancelled || i >= n) {
          if (typeof opts.onProgress === 'function') {
            try {
              opts.onProgress(1);
            } catch (e) {}
          }
          if (opts.onEnd) opts.onEnd();
          return;
        }
        var chunk = segs[i];
        var cumulative = segs.slice(0, i + 1).join('');
        if (opts.onSegment) opts.onSegment(i, chunk, cumulative);
        var segOpts = Object.assign({}, opts, {
          onProgress:
            n > 0 && typeof opts.onProgress === 'function'
              ? function (localP) {
                  var lp = typeof localP === 'number' ? localP : 0;
                  var base = i / n;
                  var span = 1 / n;
                  try {
                    opts.onProgress(Math.min(1, base + lp * span));
                  } catch (e) {}
                }
              : opts.onProgress,
        });
        _sfSpeak(chunk, sfKey, voiceId, function (err) {
          if (err) {
            console.warn('[AmadeusVoice] SiliconFlow error:', err.message, '— falling back to Web Speech');
            _ttsLog('warn', 'tts', 'siliconflow_segment_fail', err.message + ' | seg=' + i + '/' + n + ' startIdx=' + startIdx);
            if (startIdx === 0 && i === 0) {
              _toast('SiliconFlow TTS 失败，已改用浏览器语音：' + err.message);
            }
            var remaining = segs.slice(i);
            var accBase = segs.slice(0, i).join('');
            _wsSpeakSegs(remaining, rate, {
              onStart: opts.onStart,
              onPlaybackStart: opts.onPlaybackStart,
              onProgress: opts.onProgress,
              speechLang: speechBcp,
              onSegment: function (j, s) {
                if (opts.onSegment) opts.onSegment(i + j, s, accBase + s);
              },
              onEnd: opts.onEnd,
            });
            return;
          }
          i++;
          sfNext();
        }, segOpts);
      }
      sfNext();
    }

    if (mode === 'browser') {
      if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
        _ttsLog('info', 'tts', 'route', 'browser_only');
        _wsSpeakSegs(segs, rate, opts);
      } else if (opts.onEnd) opts.onEnd();
      return;
    }

    if (mode === 'siliconflow') {
      if (sfKey) {
        _ttsLog('info', 'tts', 'route', 'siliconflow');
        if (opts.onStart) opts.onStart();
        runSiliconFromIndex(0);
      } else if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
        _toast('未配置 SiliconFlow Key（config/tts-config.js），已使用浏览器语音');
        _ttsLog('warn', 'tts', 'siliconflow_skipped', 'no_key_use_browser');
        _wsSpeakSegs(segs, rate, opts);
      } else if (opts.onEnd) opts.onEnd();
      return;
    }

    if (mode === 'fish') {
      if (!fishReady) {
        _toast('Fish 模式需要在 config/tts-config.js 中填写 API Key 与 reference_id');
        _ttsLog('warn', 'tts', 'fish_mode_blocked', 'missing_key_or_reference_id');
        if (opts.onEnd) opts.onEnd();
        return;
      }
      _ttsLog('info', 'tts', 'route', 'fish_only');
      runFish('browser');
      return;
    }

    if (fishReady) {
      var chain = sfKey ? 'siliconflow' : 'browser';
      _ttsLog('info', 'tts', 'route', 'auto_fish_then_' + chain);
      runFish(chain);
    } else if (sfKey) {
      _ttsLog('info', 'tts', 'route', 'auto_siliconflow');
      if (opts.onStart) opts.onStart();
      runSiliconFromIndex(0);
    } else if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
      _ttsLog('info', 'tts', 'route', 'auto_browser_only');
      _wsSpeakSegs(segs, rate, opts);
    } else if (opts.onEnd) opts.onEnd();
  }

  function isSupported() {
    return !!(
      (window.AudioContext || window.webkitAudioContext) ||
      (window.speechSynthesis && window.SpeechSynthesisUtterance)
    );
  }

  return {
    speak: speak,
    cancel: cancel,
    isSupported: isSupported,
    stripForSpeech: stripForSpeech,
    splitForTTS: splitForTTS,
    peekMergedTtsConfig: function (speechBcp47) {
      return _mergeTtsConfigForSpeechLang(speechBcp47 || 'zh-CN');
    },
  };
})();
