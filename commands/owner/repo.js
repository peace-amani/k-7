import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import moment from 'moment-timezone';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOwnerName } from '../../lib/menuHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MENU_IMAGE_URL = "https://i.ibb.co/Gvkt4q9d/Chat-GPT-Image-Feb-21-2026-12-47-33-AM.png";

function getRepoImage() {
  const menuMediaDir1 = path.join(__dirname, "../menus/media");
  const menuMediaDir2 = path.join(__dirname, "../media");

  const imgPaths = [
    path.join(menuMediaDir1, "wolfbot.jpg"),
    path.join(menuMediaDir2, "wolfbot.jpg"),
    path.join(menuMediaDir1, "wolfbot.png"),
    path.join(menuMediaDir2, "wolfbot.png"),
  ];

  for (const p of imgPaths) {
    if (fs.existsSync(p)) {
      try {
        return { type: 'buffer', data: fs.readFileSync(p) };
      } catch {}
    }
  }

  return { type: 'url', data: DEFAULT_MENU_IMAGE_URL };
}

export default {
  name: "repo",
  aliases: ["r", "sc", "source", "github", "git", "wolfrepo", "botrepo"],
  description: "Shows bot GitHub repository information",

  async execute(sock, m, args, PREFIX) {
    try {
      const jid = m.key.remoteJid;
      const sender = m.key.participant || m.key.remoteJid;
      const mentionTag = `@${sender.split('@')[0]}`;

      function createFakeContact(message) {
        return {
          key: {
            participants: "0@s.whatsapp.net",
            remoteJid: "status@broadcast",
            fromMe: false,
            id: getBotName()
          },
          message: {
            contactMessage: {
              vcard: `BEGIN:VCARD\nVERSION:3.0\nN:Sy;Bot;;;\nFN:${getBotName()}\nitem1.TEL;waid=${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}:${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
            }
          },
          participant: "0@s.whatsapp.net"
        };
      }

      const fkontak = createFakeContact(m);

      const owner = "sil3nt-wolf";
      const repo = "silentwolf";
      const repoUrl = `https://github.com/${owner}/${repo}`;

      const img = getRepoImage();
      const imagePayload = img.type === 'buffer' ? { image: img.data } : { image: { url: img.data } };

      try {
        const { data } = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}`,
          { 
            timeout: 10000,
            headers: { 
              "User-Agent": "WolfBot",
              "Accept": "application/vnd.github.v3+json"
            } 
          }
        );

        let sizeText;
        const sizeKB = data.size;
        if (sizeKB > 1024) {
          sizeText = `${(sizeKB / 1024).toFixed(2)} MB`;
        } else {
          sizeText = `${sizeKB} KB`;
        }

        let txt = `╭─⌈ \`WOLF REPO\` ⌋\n`;
        txt += `│\n`;
        txt += `│ ✧ *Name* : ${data.name || "Silent Wolf "}\n`;
        txt += `│ ✧ *Owner* : ${owner}\n`;
        txt += `│ ✧ *Stars* : ${data.stargazers_count || 0} ⭐\n`;
        txt += `│ ✧ *Forks* : ${data.forks_count || 0} 🍴\n`;
        txt += `│ ✧ *Watchers* : ${data.watchers_count || 0} 👁️\n`;
        txt += `│ ✧ *Size* : ${sizeText}\n`;
        txt += `│ ✧ *Updated* : ${moment(data.updated_at).format('DD/MM/YYYY HH:mm:ss')}\n`;
        txt += `│ ✧ *Repo* : ${repoUrl}\n`;
        txt += `│ *Description* :${data.description || 'A powerful WhatsApp bot with 400+ commands'}\n`;
        txt += `│ Hey ${mentionTag}! 👋\n`;
        txt += `│ _*Don't forget*_ 🎉`;
        txt += `│ *to fork and star the repo!* ⭐\n`;
        txt += `╰───`;

        await sock.sendMessage(jid, {
          ...imagePayload,
          caption: txt,
          mentions: [sender]
        }, { quoted: fkontak });

        await sock.sendMessage(jid, {
          react: { text: '✅', key: m.key }
        });

      } catch (apiError) {
        console.error("GitHub API Error:", apiError);
        
        const fallbackText = `╭─⌈ *WOLF REPO* ⌋\n` +
          `│\n` +
          `│ ✧ *Name* : Silent Wolf Bot\n` +
          `│ ✧ *Owner* : sil3nt-wolf\n` +
          `│ ✧ *Repository* : ${repoUrl}\n` +
          `│ ✧ *Status* : ✅ NEW CLEAN REPOSITORY\n` +
          `│ ✧ *Size* : ~1.5 MB (Optimized)\n` +
          `│ ✧ *Last Updated* : ${moment().format('DD/MM/YYYY HH:mm:ss')}\n` +
          `│\n` +
          `│ *Features* :\n` +
          `│ • 400+ Commands\n` +
          `│ • No node_modules in repo ✅\n` +
          `│ • Clean and optimized\n` +
          `│ • Fast and reliable\n` +
          `│\n` +
          `│ Hey ${mentionTag}! 👋\n` +
          `│ _This repository is clean and optimized!_\n` +
          `│ *Be the first to star it!* ⭐\n` +
          `╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;

        await sock.sendMessage(jid, {
          ...imagePayload,
          caption: fallbackText,
          mentions: [sender]
        }, { quoted: fkontak });

        await sock.sendMessage(jid, {
          react: { text: '⚠️', key: m.key }
        });
      }

    } catch (err) {
      console.error("General Error:", err);
      
      const img = getRepoImage();
      const imagePayload = img.type === 'buffer' ? { image: img.data } : { image: { url: img.data } };

      const simpleText = `*WOLF REPO*\n\n` +
        `• *New Repository* : ✅ YES\n` +
        `• *URL* : https://github.com/sil3nt-wolf/silentwolf\n` +
        `• *Status* : Clean and optimized\n` +
        `• *Size* : ~1.5 MB\n\n` +
        `Hey @${(m.key.participant || m.key.remoteJid).split('@')[0]}! _Thank you for choosing Silent Wolf!_`;

      await sock.sendMessage(m.key.remoteJid, {
        ...imagePayload,
        caption: simpleText,
        mentions: [m.key.participant || m.key.remoteJid]
      }, { quoted: m });
    }
  },
};
