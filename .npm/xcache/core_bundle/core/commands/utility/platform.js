import os from 'os';
import moment from 'moment-timezone';
import { getBotName } from '../../lib/botname.js';

export default {
  name: 'platform',
  alias: ['hosting', 'host', 'server', 'whereami'],
  description: 'Show where the bot is hosted or running',
  category: 'utility',

  async execute(sock, m, args, PREFIX) {
    try {
      const jid = m.key.remoteJid;

      function createFakeContact(message) {
        return {
          key: {
            participant: "0@s.whatsapp.net",
            remoteJid: "status@broadcast",
            fromMe: false,
            id: getBotName()
          },
          messageTimestamp: moment().unix(),
          pushName: getBotName(),
          message: {
            contactMessage: {
              vcard: `BEGIN:VCARD\nVERSION:3.0\nN:Sy;Bot;;;\nFN:${getBotName()}\nitem1.TEL;waid=${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}:${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
            }
          },
          participant: "0@s.whatsapp.net"
        };
      }

      const fkontak = createFakeContact(m);

      const getDeploymentPlatform = () => {
        if (process.env.HEROKU_APP_NAME || process.env.DYNO || process.env.HEROKU_API_KEY) {
          return { name: 'Heroku', icon: '🦸', url: 'heroku.com' };
        }
        if (process.env.RENDER_SERVICE_ID || process.env.RENDER_SERVICE_NAME || process.env.RENDER) {
          return { name: 'Render', icon: '⚡', url: 'render.com' };
        }
        if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_NAME || process.env.RAILWAY_SERVICE_NAME) {
          return { name: 'Railway', icon: '🚂', url: 'railway.app' };
        }
        if (process.env.REPL_ID || process.env.REPLIT_DB_URL || process.env.REPLIT_USER || process.env.REPL_SLUG) {
          return { name: 'Replit', icon: '🌀', url: 'replit.com' };
        }
        if (process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_URL) {
          return { name: 'Vercel', icon: '▲', url: 'vercel.com' };
        }
        if (process.env.GLITCH_PROJECT_REMIX || process.env.PROJECT_REMIX_CHAIN || process.env.GLITCH) {
          return { name: 'Glitch', icon: '🎏', url: 'glitch.com' };
        }
        if (process.env.KOYEB_APP || process.env.KOYEB_REGION || process.env.KOYEB_SERVICE) {
          return { name: 'Koyeb', icon: '☁️', url: 'koyeb.com' };
        }
        if (process.env.CYCLIC_URL || process.env.CYCLIC_APP_ID || process.env.CYCLIC_DB) {
          return { name: 'Cyclic', icon: '🔄', url: 'cyclic.sh' };
        }
        if (process.env.PANEL || process.env.PTERODACTYL) {
          return { name: 'Panel/Pterodactyl', icon: '🖥️', url: 'pterodactyl.io' };
        }
        if (process.env.SSH_CONNECTION || process.env.SSH_CLIENT || (process.platform === 'linux' && process.env.USER === 'root')) {
          return { name: 'VPS/SSH', icon: '🖥️', url: 'N/A' };
        }
        if (process.platform === 'win32') {
          return { name: 'Windows PC', icon: '💻', url: 'Local' };
        }
        if (process.platform === 'darwin') {
          return { name: 'MacOS', icon: '🍎', url: 'Local' };
        }
        if (process.platform === 'android') {
          return { name: 'Termux (Android)', icon: '📱', url: 'Local' };
        }
        if (process.platform === 'linux') {
          return { name: 'Linux', icon: '🐧', url: 'Local' };
        }
        return { name: 'Unknown', icon: '🏠', url: 'N/A' };
      };

      const platform = getDeploymentPlatform();

      const uptime = process.uptime();
      const days = Math.floor(uptime / (3600 * 24));
      const hours = Math.floor((uptime % (3600 * 24)) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);
      let uptimeStr = '';
      if (days > 0) uptimeStr += `${days}d `;
      if (hours > 0) uptimeStr += `${hours}h `;
      if (minutes > 0) uptimeStr += `${minutes}m `;
      uptimeStr += `${seconds}s`;

      const mem = process.memoryUsage();
      const usedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
      const totalMB = (mem.heapTotal / 1024 / 1024).toFixed(1);
      const memPercent = Math.round((mem.heapUsed / mem.heapTotal) * 100);

      const totalSysMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
      const freeSysMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);

      const cpus = os.cpus();
      const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown';
      const cpuCores = cpus.length;

      const nodeVersion = process.version;
      const osType = os.type();
      const osRelease = os.release();
      const arch = os.arch();
      const hostname = os.hostname();

      const startTime = new Date(Date.now() - uptime * 1000).toLocaleString('en-US', { 
        timeZone: 'Africa/Nairobi',
        dateStyle: 'medium',
        timeStyle: 'short'
      });

      const platformText = `
╭━「 *${platform.icon} PLATFORM INFO* 」━╮
│
├─⊷ *🏠 HOSTING*
│  Platform: *${platform.name}*
│  Provider: ${platform.url}
│  Status: ✅ Active & Running
│  Hostname: ${hostname}
│
├─⊷ *💻 SYSTEM*
│  OS: ${osType} ${osRelease}
│  Arch: ${arch}
│  CPU: ${cpuModel}
│  Cores: ${cpuCores}
│  Total RAM: ${totalSysMem} GB
│  Free RAM: ${freeSysMem} GB
│
├─⊷ *⚙️ RUNTIME*
│  Node.js: ${nodeVersion}
│  PID: ${process.pid}
│  Uptime: ${uptimeStr.trim()}
│  Started: ${startTime}
│
├─⊷ *📊 MEMORY USAGE*
│  Heap Used: ${usedMB} MB
│  Heap Total: ${totalMB} MB
│  Usage: ${memPercent}%
│
╰━━━━━━━━━━━━━━━━━╯

🐺 *POWERED BY ${getBotName()}* 🐺`.trim();

      await sock.sendMessage(jid, { text: platformText }, { quoted: fkontak });
      
    } catch (err) {
      console.error('[PLATFORM] Error:', err);
      await sock.sendMessage(m.key.remoteJid, { text: '❌ Failed to get platform info.' }, { quoted: m });
    }
  },
};
