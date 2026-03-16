import fs from 'fs';
import { getBotName } from '../../lib/botname.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOwnerName } from '../../lib/menuHelper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const footerFile = path.join(__dirname, '../../data/footer.json');

function ensureDir() {
    const dir = path.dirname(footerFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getFooter() {
    try {
        if (fs.existsSync(footerFile)) {
            return JSON.parse(fs.readFileSync(footerFile, 'utf8')).footer;
        }
    } catch {}
    return `${getBotName()} is the ALPHA`;
}

function setFooter(text) {
    ensureDir();
    fs.writeFileSync(footerFile, JSON.stringify({ footer: text, updatedAt: new Date().toISOString() }, null, 2));
}

export default {
    name: 'setfooter',
    alias: ['footer', 'setcaption', 'defaultcaption'],
    description: 'Set default footer/caption for downloads (viewonce, tiktok, instagram, video downloads)',
    category: 'owner',

    async execute(sock, msg, args, PREFIX, extra) {
        const chatId = msg.key.remoteJid;
        const { jidManager } = extra;

        const isSudoUser = extra?.isSudo ? extra.isSudo() : false;
        if (!jidManager.isOwner(msg) && !isSudoUser) {
            return sock.sendMessage(chatId, {
                text: '❌ *Owner Only Command!*'
            }, { quoted: msg });
        }

        if (args.length === 0 || args[0]?.toLowerCase() === 'help') {
            const current = getFooter();
            return sock.sendMessage(chatId, {
                text: `╭─⌈ 📝 *SET FOOTER* ⌋\n│\n│ 📌 Current: ${current}\n├─⊷ *${PREFIX}setfooter <text>*\n│  └⊷ Set footer text\n├─⊷ *${PREFIX}setfooter reset*\n│  └⊷ Reset to default\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
            }, { quoted: msg });
        }

        if (args[0]?.toLowerCase() === 'reset') {
            setFooter(`${getBotName()} is the ALPHA`);
            return sock.sendMessage(chatId, {
                text: `✅ *Footer Reset!*\n\n📝 Default: ${getBotName()} is the ALPHA`
            }, { quoted: msg });
        }

        const newFooter = args.join(' ').trim();

        if (newFooter.length > 200) {
            return sock.sendMessage(chatId, {
                text: '❌ Footer too long! Max 200 characters.'
            }, { quoted: msg });
        }

        setFooter(newFooter);

        await sock.sendMessage(chatId, {
            text: `✅ *Footer Updated!*\n\n📝 *New Footer:*\n> ${newFooter}\n\n` +
                `This will appear on all downloads.`
        }, { quoted: msg });
    }
};
