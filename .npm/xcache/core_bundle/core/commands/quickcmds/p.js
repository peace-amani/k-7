import axios from "axios";
import { getBotName } from '../../lib/botname.js';
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let _cachedGithubData = null;
let _lastGithubFetch = 0;
const GITHUB_CACHE_TTL = 5 * 60 * 1000;

export default {
  name: "p",
  description: "Check bot ping and status",

  async execute(sock, m, args, PREFIX) {
    try {
      const jid = m.key.remoteJid;
      const sender = m.key.participant || m.key.remoteJid;

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

      const pingStartTime = Date.now();
      
      let ownerInfo = {
        jid: "",
        number: "",
        name: ""
      };
      
      try {
        const ownerPath = path.join(__dirname, "../../owner.json");
        const ownerData = await fs.readFile(ownerPath, "utf8");
        const ownerDataJson = JSON.parse(ownerData);
        
        ownerInfo.jid = ownerDataJson.OWNER_JID || ownerDataJson.OWNER_CLEAN_JID || "";
        ownerInfo.number = ownerDataJson.OWNER_NUMBER || ownerDataJson.OWNER_CLEAN_NUMBER || "";
        ownerInfo.name = ownerDataJson.OWNER_NAME || "Silent Wolf";
        
      } catch (ownerError) {
        console.error("❌ [PING] Failed to read owner.json:", ownerError.message);
        ownerInfo.name = "Silent Wolf";
        ownerInfo.number = "254703397679";
        ownerInfo.jid = "254703397679@s.whatsapp.net";
      }

      const githubOwner = "7silent-wolf";
      let githubData = _cachedGithubData || {
        avatar_url: "https://avatars.githubusercontent.com/u/10639145",
        html_url: `https://github.com/${githubOwner}`,
        name: "Silent Wolf"
      };

      if (!_cachedGithubData || Date.now() - _lastGithubFetch > GITHUB_CACHE_TTL) {
        try {
          const githubResponse = await axios.get(`https://api.github.com/users/${githubOwner}`, {
            timeout: 5000,
            headers: { "User-Agent": "Silent-Wolf-Bot", "Accept": "application/vnd.github.v3+json" }
          });
          _cachedGithubData = githubResponse.data;
          _lastGithubFetch = Date.now();
          githubData = _cachedGithubData;
        } catch {}
      }

      const pingTime = Date.now() - pingStartTime;
      
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);
      
      let responseQuality = "";
      if (pingTime < 500) responseQuality = "⚡ Lightning Fast";
      else if (pingTime < 1500) responseQuality = "🚀 Fast";
      else if (pingTime < 3000) responseQuality = "🐢 Moderate";
      else responseQuality = "🐌 Slow";

      const text = `🐺 *${getBotName()}* — Pong!\n⚡ *Latency:* ${pingTime}ms  •  *Uptime:* ${hours}h ${minutes}m ${seconds}s\n📶 *Quality:* ${responseQuality}`;

      await sock.sendMessage(
        jid,
        {
          text,
          contextInfo: {
            mentionedJid: ownerInfo.jid ? [ownerInfo.jid] : [],
            externalAdReply: {
              title: `🐺 ${getBotName()} Status`,
              body: `Ping: ${pingTime}ms • Uptime: ${hours}h ${minutes}m`,
              mediaType: 1,
              thumbnailUrl: githubData.avatar_url,
              sourceUrl: githubData.html_url,
              mediaUrl: `https://github.com/7silent-wolf/silentwolf`,
              renderLargerThumbnail: true
            },
          },
        },
        { quoted: fkontak }
      );

    } catch (err) {
      console.error("❌ [PING] Command error:", err.message || err);
      
      const fallbackText = `
╭━━⚡ *BOT STATUS* ⚡━━╮
┃
┃  📡 *Response Time:* Calculating...
┃  💻 *Status:* Operational
┃  🐺 *Developer:* 7silent-wolf
┃  🔗 *GitHub:* 7silent-wolf/silentwolf
┃
╰━━━━━━━━━━━━━━━━━━━━╯
`.trim();

      try {
        await sock.sendMessage(
          m.key.remoteJid,
          { 
            text: fallbackText,
            contextInfo: {
              externalAdReply: {
                title: `${getBotName()} Status`,
                body: "Bot is online • Basic metrics",
                mediaType: 1,
                thumbnailUrl: "https://avatars.githubusercontent.com/u/10639145",
                sourceUrl: "https://github.com/7silent-wolf/silentwolf"
              }
            }
          },
          { quoted: m }
        );
      } catch (sendError) {
        console.error("❌ [PING] Failed to send fallback:", sendError.message);
      }
    }
  },
};
