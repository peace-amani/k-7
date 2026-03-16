import { getBotName } from '../../lib/botname.js';
import { isWolfEnabled, setWolfEnabled, getWolfStats } from '../../lib/wolfai.js';

export default {
  name: "wolf",
  aliases: ["wolfai", "wolfbot"],
  description: "Toggle Wolf AI assistant on/off",
  ownerOnly: true,

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const botName = getBotName();
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'on' || sub === 'enable') {
      setWolfEnabled(true);
      await sock.sendMessage(jid, {
        text: `🐺 *Wolf AI Activated*\n\nI'm now listening! Just start any message with *"wolf"* to talk to me.\n\nExamples:\n• _wolf show me the menu_\n• _wolf play Bohemian Rhapsody_\n• _wolf what is quantum physics_\n• _hey wolf how are you_\n• _wolf restart the bot_`
      }, { quoted: m });
      return;
    }

    if (sub === 'off' || sub === 'disable') {
      setWolfEnabled(false);
      await sock.sendMessage(jid, {
        text: `🐺 *Wolf AI Deactivated*\n\nI'll stop listening for "wolf" messages. Use *${PREFIX}wolf on* to reactivate.`
      }, { quoted: m });
      return;
    }

    if (sub === 'status' || sub === 'stats') {
      const stats = getWolfStats();
      await sock.sendMessage(jid, {
        text: `🐺 *Wolf AI Status*\n\n` +
          `• *Status:* ${stats.enabled ? '✅ Active' : '❌ Disabled'}\n` +
          `• *AI Models:* ${stats.models} available\n` +
          `• *Conversations:* ${stats.conversations} stored\n` +
          `• *Access:* Owner & Sudo only\n\n` +
          `Use *${PREFIX}wolf on/off* to toggle.`
      }, { quoted: m });
      return;
    }

    if (sub === 'clear') {
      const fs = await import('fs');
      const path = await import('path');
      const convDir = './data/wolfai/conversations';
      try {
        if (fs.existsSync(convDir)) {
          const files = fs.readdirSync(convDir);
          for (const file of files) {
            fs.unlinkSync(path.join(convDir, file));
          }
          await sock.sendMessage(jid, {
            text: `🐺 *Conversations Cleared*\n\nCleared ${files.length} conversation(s). Wolf AI memory has been reset.`
          }, { quoted: m });
        } else {
          await sock.sendMessage(jid, { text: `🐺 No conversations to clear.` }, { quoted: m });
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Error clearing conversations: ${err.message}` }, { quoted: m });
      }
      return;
    }

    const stats = getWolfStats();
    await sock.sendMessage(jid, {
      text: `🐺 *Wolf AI — ${botName}'s JARVIS*\n\n` +
        `*Status:* ${stats.enabled ? '✅ Active' : '❌ Disabled'}\n` +
        `*AI Models:* ${stats.models} fallback models\n` +
        `*Conversations:* ${stats.conversations} active\n` +
        `*Access:* Owner & Sudo only\n\n` +
        `*Commands:*\n` +
        `• *${PREFIX}wolf on* — Activate Wolf AI\n` +
        `• *${PREFIX}wolf off* — Deactivate Wolf AI\n` +
        `• *${PREFIX}wolf status* — Show stats\n` +
        `• *${PREFIX}wolf clear* — Reset all conversations\n\n` +
        `When active, just say *"wolf"* followed by anything:\n` +
        `• _wolf show menu_\n` +
        `• _hey wolf play a song_\n` +
        `• _wolf explain black holes_\n` +
        `• _yo wolf tell me a joke_`
    }, { quoted: m });
  },
};
