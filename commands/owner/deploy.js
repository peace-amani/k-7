// commands/owner/deploy.js
// .deploy / .deployment — hosting guide with interactive buttons
// Each button (or sub-command) shows a platform-specific guide or video link.

import { createRequire } from 'module';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { isGiftedBtnsAvailable } from '../../lib/buttonHelper.js';

const _require = createRequire(import.meta.url);
let _giftedBtns = null;
try { _giftedBtns = _require('gifted-btns'); } catch {}

// ── Platform content ───────────────────────────────────────────────────────
const PLATFORMS = {
    heroku: {
        icon: '🟣',
        name: 'Heroku',
        type: 'text',
        content: (PREFIX) =>
            `🟣 *DEPLOY ON HEROKU*\n\n` +
            `Heroku is a cloud platform that lets you build, run, and manage applications.\n\n` +
            `*📋 Steps:*\n` +
            `1️⃣ Create an account at *heroku.com*\n` +
            `2️⃣ Install Heroku CLI: \`npm install -g heroku\`\n` +
            `3️⃣ Login via CLI: \`heroku login\`\n` +
            `4️⃣ Create a new app: \`heroku create your-app-name\`\n` +
            `5️⃣ Add your env vars in *Settings → Config Vars*\n` +
            `6️⃣ Push your code: \`git push heroku main\`\n` +
            `7️⃣ Scale the dyno: \`heroku ps:scale web=1\`\n\n` +
            `*⚡ Pro Tips:*\n` +
            `• Use *Eco dynos* for low-cost 24/7 hosting\n` +
            `• Add a *Procfile* with: \`worker: node index.js\`\n` +
            `• Free tier was discontinued — use Eco ($5/mo)\n` +
            `• Set \`OWNER_NUMBER\` and session vars in Config Vars\n\n` +
            `*🔗 Link:* https://heroku.com\n\n` +
            `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
    },
    bothosting: {
        icon: '🤖',
        name: 'Bothosting',
        type: 'video',
        url: 'https://youtu.be/4Jq46fsEZsU?si=HyRE6CAYC6bESV6h',
        content: (PREFIX) =>
            `🤖 *BOTHOSTING GUIDE*\n\n` +
            `Watch the full tutorial on how to deploy your bot on Bothosting:\n\n` +
            `📹 *Video Guide:*\n` +
            `https://youtu.be/4Jq46fsEZsU?si=HyRE6CAYC6bESV6h\n\n` +
            `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
    },
    katabump: {
        icon: '🎯',
        name: 'Katabump',
        type: 'video',
        url: 'https://youtu.be/RviTwLfrK_Q?si=mz2Fy8QrXC-YiykR',
        content: (PREFIX) =>
            `🎯 *KATABUMP GUIDE*\n\n` +
            `Watch the full tutorial on how to deploy your bot on Katabump:\n\n` +
            `📹 *Video Guide:*\n` +
            `https://youtu.be/RviTwLfrK_Q?si=mz2Fy8QrXC-YiykR\n\n` +
            `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
    },
    panel: {
        icon: '🖥️',
        name: 'Panel (Pterodactyl)',
        type: 'video',
        url: 'https://youtu.be/5ooHGLOKKVo?si=U3cJy4rkkigUagK5',
        content: (PREFIX) =>
            `🖥️ *PANEL (PTERODACTYL) GUIDE*\n\n` +
            `Watch the full tutorial on how to deploy your bot on a Pterodactyl panel:\n\n` +
            `📹 *Video Guide:*\n` +
            `https://youtu.be/5ooHGLOKKVo?si=U3cJy4rkkigUagK5\n\n` +
            `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
    },
    render: {
        icon: '⚡',
        name: 'Render',
        type: 'text',
        content: (PREFIX) =>
            `⚡ *DEPLOY ON RENDER*\n\n` +
            `Render is a modern cloud platform with a generous free tier for hosting bots.\n\n` +
            `*📋 Steps:*\n` +
            `1️⃣ Create an account at *render.com*\n` +
            `2️⃣ Click *New → Web Service*\n` +
            `3️⃣ Connect your *GitHub repository*\n` +
            `4️⃣ Set the *Build Command:* \`npm install\`\n` +
            `5️⃣ Set the *Start Command:* \`node index.js\`\n` +
            `6️⃣ Add your env vars in the *Environment* tab\n` +
            `7️⃣ Choose *Free* tier and click *Deploy*\n\n` +
            `*⚡ Pro Tips:*\n` +
            `• Free tier services sleep after 15 min of inactivity\n` +
            `• Use *Background Worker* type (not Web Service) to avoid sleep\n` +
            `• Upgrade to *Starter ($7/mo)* for always-on hosting\n` +
            `• Set \`OWNER_NUMBER\` and session vars in Environment settings\n\n` +
            `*🔗 Link:* https://render.com\n\n` +
            `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
    },
    railway: {
        icon: '🚂',
        name: 'Railway',
        type: 'text',
        content: (PREFIX) =>
            `🚂 *DEPLOY ON RAILWAY*\n\n` +
            `Railway is a fast, developer-friendly deployment platform with a trial credit.\n\n` +
            `*📋 Steps:*\n` +
            `1️⃣ Create an account at *railway.app*\n` +
            `2️⃣ Click *New Project → Deploy from GitHub repo*\n` +
            `3️⃣ Select your repository and branch\n` +
            `4️⃣ Railway auto-detects Node.js and sets the start command\n` +
            `5️⃣ Go to *Variables* tab and add your env vars\n` +
            `6️⃣ Click *Deploy* — your bot goes live instantly\n\n` +
            `*⚡ Pro Tips:*\n` +
            `• New accounts get *$5 trial credits* (no card needed)\n` +
            `• After trial, plans start at *$5/mo (Hobby)*\n` +
            `• Railway keeps your app running 24/7 with no sleep\n` +
            `• Set \`OWNER_NUMBER\` and session vars in the Variables tab\n\n` +
            `*🔗 Link:* https://railway.app\n\n` +
            `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
    }
};

export default {
    name: 'deploy',
    alias: ['deployment', 'hosting', 'host'],
    category: 'owner',
    description: 'Deployment & hosting guides for various platforms',
    ownerOnly: false,

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const sub = args[0]?.toLowerCase();

        // ── Sub-command provided — send platform content ──────────────────────
        if (sub && PLATFORMS[sub]) {
            const platform = PLATFORMS[sub];
            await sock.sendMessage(chatId, {
                text: platform.content(PREFIX)
            }, { quoted: msg });
            return;
        }

        // ── Unknown sub-command ───────────────────────────────────────────────
        if (sub && !PLATFORMS[sub]) {
            return sock.sendMessage(chatId, {
                text: `❌ Unknown platform *${sub}*.\n\nAvailable: heroku, bothosting, katabump, panel, render, railway`
            }, { quoted: msg });
        }

        // ── No args — show interactive buttons if gifted-btns is on ──────────
        const buttonsActive = isButtonModeEnabled();

        if (buttonsActive && isGiftedBtnsAvailable() && _giftedBtns) {
            const deployButtons = [
                { display: '🟣 Heroku',      id: 'heroku'     },
                { display: '🤖 Bothosting',  id: 'bothosting' },
                { display: '🎯 Katabump',    id: 'katabump'   },
                { display: '🖥️ Panel',       id: 'panel'      },
                { display: '⚡ Render',      id: 'render'     },
                { display: '🚂 Railway',     id: 'railway'    },
            ];

            const interactiveButtons = deployButtons.map(btn => ({
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: btn.display,
                    id: `${PREFIX}deploy ${btn.id}`
                })
            }));

            try {
                await _giftedBtns.sendInteractiveMessage(sock, chatId, {
                    text: `🚀 *DEPLOYMENT GUIDE*\n\nSelect a platform to get the hosting guide:`,
                    interactiveButtons
                });
                return;
            } catch (e) {
                console.log('[Deploy] Interactive buttons failed:', e?.message);
                // Fall through to plain text
            }
        }

        // ── Plain text menu (fallback) ────────────────────────────────────────
        const ownerName = getOwnerName().toUpperCase();
        return sock.sendMessage(chatId, {
            text:
                `╭─⌈ 🚀 *DEPLOYMENT GUIDE* ⌋\n` +
                `│\n` +
                `├─⊷ *${PREFIX}deploy heroku*\n` +
                `│  └⊷ 🟣 How to deploy on Heroku\n` +
                `├─⊷ *${PREFIX}deploy bothosting*\n` +
                `│  └⊷ 🤖 Bothosting video guide\n` +
                `├─⊷ *${PREFIX}deploy katabump*\n` +
                `│  └⊷ 🎯 Katabump video guide\n` +
                `├─⊷ *${PREFIX}deploy panel*\n` +
                `│  └⊷ 🖥️ Pterodactyl panel video guide\n` +
                `├─⊷ *${PREFIX}deploy render*\n` +
                `│  └⊷ ⚡ How to deploy on Render\n` +
                `├─⊷ *${PREFIX}deploy railway*\n` +
                `│  └⊷ 🚂 How to deploy on Railway\n` +
                `│\n` +
                `╰⊷ *Powered by ${ownerName} TECH*`
        }, { quoted: msg });
    }
};
