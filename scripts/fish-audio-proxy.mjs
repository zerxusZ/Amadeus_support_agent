/**
 * 本地 Fish Audio TTS 反代 — 解决浏览器直连 api.fish.audio 的 CORS 问题
 *
 * 用法（在项目根目录）:
 *   node scripts/fish-audio-proxy.mjs
 * Windows 亦可双击 scripts/start-fish-proxy.cmd（需已安装 Node 并在 PATH 中）
 *
 * 默认监听 http://127.0.0.1:8787 ，转发到 https://api.fish.audio/v1/tts
 * 环境变量:
 *   PORT=8787          监听端口（默认 8787）
 *   FISH_PROXY_LISTEN=127.0.0.1   监听地址（默认仅本机）
 *
 * config/tts-config.js 根级填写:
 *   fishAudioApiBase: 'http://127.0.0.1:8787'
 * （不要以 / 结尾即可；前端会请求 该地址 + /v1/tts）
 */
import http from 'node:http';
import https from 'node:https';

const LISTEN = process.env.FISH_PROXY_LISTEN || '127.0.0.1';
const PORT = parseInt(String(process.env.PORT || '8787'), 10);
const UPSTREAM = { hostname: 'api.fish.audio', port: 443, path: '/v1/tts' };

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type,model');
  res.setHeader('Access-Control-Max-Age', '86400');
}

const server = http.createServer((req, res) => {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const pathOnly = (req.url || '').split('?')[0];
  if (req.method === 'GET' && (pathOnly === '/' || pathOnly === '')) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(
      'Fish TTS proxy is running.\nPOST JSON to /v1/tts (same as Fish OpenAPI).\nSet fishAudioApiBase to http://127.0.0.1:' +
        PORT +
        '\n'
    );
    return;
  }

  if (req.method !== 'POST' || !pathOnly.endsWith('/v1/tts')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found. Use POST /v1/tts\n');
    return;
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const auth = req.headers.authorization;
    const model = req.headers.model || 's2-pro';
    const ct = req.headers['content-type'] || 'application/json';

    if (!auth || !String(auth).toLowerCase().startsWith('bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Missing Authorization: Bearer <Fish API Key>' }));
      return;
    }

    const opts = {
      hostname: UPSTREAM.hostname,
      port: UPSTREAM.port,
      path: UPSTREAM.path,
      method: 'POST',
      headers: {
        Authorization: auth,
        model: model,
        'Content-Type': ct,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const pr = https.request(opts, (up) => {
      applyCors(res);
      const skip = new Set(['transfer-encoding', 'connection', 'keep-alive']);
      for (const [k, v] of Object.entries(up.headers)) {
        if (v == null) continue;
        if (skip.has(String(k).toLowerCase())) continue;
        try {
          res.setHeader(k, v);
        } catch (_) {}
      }
      res.writeHead(up.statusCode || 502);
      up.pipe(res);
    });

    pr.on('error', (err) => {
      try {
        if (!res.headersSent) {
          applyCors(res);
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end('Upstream error: ' + (err && err.message ? err.message : String(err)));
      } catch (_) {}
    });

    pr.write(body);
    pr.end();
  });

  req.on('error', () => {
    try {
      res.writeHead(400);
      res.end();
    } catch (_) {}
  });
});

server.listen(PORT, LISTEN, () => {
  console.log('[fish-audio-proxy] http://' + LISTEN + ':' + PORT + '  ->  https://api.fish.audio/v1/tts');
  console.log('[fish-audio-proxy] tts-config: fishAudioApiBase: \'http://127.0.0.1:' + PORT + '\'');
});
