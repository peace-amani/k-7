import { getBotName } from '../../lib/botname.js';

function detectPlatform() {
    if (process.env.HEROKU_APP_NAME || process.env.DYNO)                              return { name: 'Heroku',           icon: '🦸' };
    if (process.env.RENDER_SERVICE_ID || process.env.RENDER)                          return { name: 'Render',           icon: '⚡' };
    if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_NAME)          return { name: 'Railway',          icon: '🚂' };
    if (process.env.REPL_ID || process.env.REPLIT_DB_URL || process.env.REPL_SLUG)   return { name: 'Replit',           icon: '🌀' };
    if (process.env.VERCEL || process.env.VERCEL_ENV)                                 return { name: 'Vercel',           icon: '▲'  };
    if (process.env.GLITCH_PROJECT_REMIX || process.env.GLITCH)                      return { name: 'Glitch',           icon: '🎏' };
    if (process.env.KOYEB_APP || process.env.KOYEB_REGION)                           return { name: 'Koyeb',            icon: '☁️' };
    if (process.env.PANEL || process.env.PTERODACTYL)                                 return { name: 'Pterodactyl',      icon: '🖥️' };
    if (process.env.SSH_CONNECTION || process.env.SSH_CLIENT)                         return { name: 'VPS',              icon: '🖥️' };
    if (process.platform === 'win32')                                                 return { name: 'Windows',          icon: '💻' };
    if (process.platform === 'darwin')                                                return { name: 'macOS',            icon: '🍎' };
    if (process.platform === 'android')                                               return { name: 'Termux (Android)', icon: '📱' };
    if (process.platform === 'linux')                                                 return { name: 'Linux',            icon: '🐧' };
    return { name: 'Unknown', icon: '❓' };
}

export default {
    name:        'plat',
    alias:       ['platform2', 'whererun', 'myplatform'],
    category:    'utility',
    description: 'Show the platform the bot is running on',

    async execute(sock, msg, args, PREFIX) {
        const { name, icon } = detectPlatform();
        const botName = getBotName();

        const text =
            `╭─⌈ ${icon} *PLATFORM* ⌋\n` +
            `│ Running on: *${name}* ${icon}\n` +
            `╰⊷ *${botName}*`;

        await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
    }
};
