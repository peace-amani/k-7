import http from 'http';
import { getPlatformInfo } from './platformDetect.js';

let _server = null;

function getStatus() {
  const s = globalThis._webStatus || {};
  const uptime = process.uptime();
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const sec = Math.floor(uptime % 60);
  const uptimeStr = `${h}h ${m}m ${sec}s`;

  const platform = getPlatformInfo();

  return {
    botName:    s.botName    || global.BOT_NAME || 'SilentWolfBot',
    version:    s.version    || global.VERSION  || '1.0.0',
    connected:  s.connected  ?? false,
    uptime:     uptimeStr,
    uptimeSecs: Math.floor(uptime),
    platform:   `${platform.icon} ${platform.name}`,
    commands:   s.commands   || 0,
    prefix:     s.prefix     || '.',
    botMode:    s.botMode    || 'public',
    owner:      s.owner      || 'Unknown',
    antispam:   s.antispam   ?? false,
    antibug:    s.antibug    ?? false,
    antilink:   s.antilink   ?? false,
    timestamp:  new Date().toISOString(),
  };
}

function getPort() {
  if (process.env.PORT)            return parseInt(process.env.PORT);
  if (process.env.SERVER_PORT)     return parseInt(process.env.SERVER_PORT);
  if (process.env.APP_PORT)        return parseInt(process.env.APP_PORT);
  return 3000;
}

function getHTML(st) {
  const statusColor  = st.connected ? '#22c55e' : '#ef4444';
  const statusLabel  = st.connected ? 'Connected' : 'Disconnected';
  const statusDot    = st.connected ? '🟢' : '🔴';
  const modeColor    = st.botMode === 'private' ? '#a855f7' : st.botMode === 'group' ? '#3b82f6' : '#22c55e';

  function badge(val, label) {
    const on = val ? '#22c55e' : '#6b7280';
    const txt = val ? 'ON' : 'OFF';
    return `<span class="badge" style="background:${on}20;color:${on};border:1px solid ${on}40">${label}: ${txt}</span>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="refresh" content="30"/>
<title>${st.botName} — Status</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{
    --bg:#0d0d0d;--card:#161616;--border:#222;
    --accent:#f59e0b;--text:#e5e5e5;--muted:#6b7280;
    --radius:12px;--font:'Segoe UI',system-ui,sans-serif
  }
  body{background:var(--bg);color:var(--text);font-family:var(--font);min-height:100vh;
       display:flex;flex-direction:column;align-items:center;padding:24px 16px}
  header{text-align:center;margin-bottom:32px}
  .wolf{font-size:64px;line-height:1;margin-bottom:8px;filter:drop-shadow(0 0 20px #f59e0b60)}
  h1{font-size:28px;font-weight:700;letter-spacing:-.5px;color:#fff}
  h1 span{color:var(--accent)}
  .ver{font-size:13px;color:var(--muted);margin-top:4px}
  .status-pill{display:inline-flex;align-items:center;gap:8px;padding:8px 18px;
               border-radius:999px;font-size:14px;font-weight:600;margin-top:14px;
               background:${statusColor}15;color:${statusColor};border:1px solid ${statusColor}40}
  .dot{width:9px;height:9px;border-radius:50%;background:${statusColor};
       box-shadow:0 0 8px ${statusColor};animation:${st.connected ? 'pulse 2s infinite' : 'none'}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;
        width:100%;max-width:720px;margin-bottom:20px}
  .card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
        padding:18px 20px}
  .card-label{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:6px}
  .card-value{font-size:18px;font-weight:700;color:#fff;word-break:break-word}
  .card-value.accent{color:var(--accent)}
  .card-value.mode{color:${modeColor}}
  .card-value.uptime{font-size:15px;font-variant-numeric:tabular-nums;color:#a3e635}
  .badges{display:flex;flex-wrap:wrap;gap:8px;width:100%;max-width:720px;margin-bottom:20px}
  .badge{font-size:12px;font-weight:600;padding:5px 12px;border-radius:999px;letter-spacing:.3px}
  .platform-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
                 padding:16px 20px;width:100%;max-width:720px;text-align:center;margin-bottom:20px}
  .platform-card .plat{font-size:15px;font-weight:600;color:var(--accent)}
  .links{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-bottom:24px}
  a.btn{padding:9px 20px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;
        transition:.2s}
  a.btn-primary{background:var(--accent);color:#000}
  a.btn-ghost{border:1px solid var(--border);color:var(--muted)}
  a.btn:hover{opacity:.85}
  footer{font-size:12px;color:var(--muted);text-align:center}
  footer span{color:var(--accent);font-weight:600}
  @media(max-width:480px){h1{font-size:22px}.card-value{font-size:15px}}
</style>
</head>
<body>
<header>
  <div class="wolf">🐺</div>
  <h1>${st.botName} <span>Bot</span></h1>
  <div class="ver">v${st.version}</div>
  <div class="status-pill"><div class="dot"></div>${statusLabel}</div>
</header>

<div class="grid">
  <div class="card">
    <div class="card-label">⏱ Uptime</div>
    <div class="card-value uptime">${st.uptime}</div>
  </div>
  <div class="card">
    <div class="card-label">⚡ Commands</div>
    <div class="card-value accent">${st.commands}</div>
  </div>
  <div class="card">
    <div class="card-label">💬 Prefix</div>
    <div class="card-value accent">${st.prefix === 'none' ? '(none)' : st.prefix}</div>
  </div>
  <div class="card">
    <div class="card-label">🎛 Mode</div>
    <div class="card-value mode">${st.botMode.charAt(0).toUpperCase() + st.botMode.slice(1)}</div>
  </div>
  <div class="card">
    <div class="card-label">👑 Owner</div>
    <div class="card-value" style="font-size:14px">+${st.owner}</div>
  </div>
  <div class="card">
    <div class="card-label">🕐 Last Checked</div>
    <div class="card-value" style="font-size:12px;color:var(--muted)">${new Date().toLocaleTimeString()}</div>
  </div>
</div>

<div class="badges">
  ${badge(st.antispam,  'Anti-Spam')}
  ${badge(st.antibug,   'Anti-Bug')}
  ${badge(st.antilink,  'Anti-Link')}
</div>

<div class="platform-card">
  <div class="card-label" style="text-align:center">Running on</div>
  <div class="plat">${st.platform}</div>
</div>

<div class="links">
  <a class="btn btn-primary" href="/api/status">📊 JSON Status</a>
  <a class="btn btn-ghost"   href="/health">💚 Health Check</a>
</div>

<footer>
  Powered by <span>SILENT WOLF TECH</span> &bull; Auto-refreshes every 30s
</footer>
</body>
</html>`;
}

export function setupWebServer() {
  if (_server) return;

  const PORT = getPort();

  _server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    const st  = getStatus();

    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', connected: st.connected, uptime: st.uptimeSecs, timestamp: st.timestamp }));
    }

    if (url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify(st, null, 2));
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getHTML(st));
  });

  _server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[WebServer] Port ${PORT} in use, trying ${PORT + 1}`);
      _server.listen(PORT + 1, '0.0.0.0');
    }
  });

  _server.listen(PORT, '0.0.0.0', () => {
    const { name } = getPlatformInfo();
    console.log(`[WebServer] 🌐 Status page running on port ${PORT} (${name})`);
  });
}

export function updateWebStatus(data) {
  globalThis._webStatus = { ...(globalThis._webStatus || {}), ...data };
}
