import { getBotName } from '../../lib/botname.js';
import { isWolfEnabled, setWolfEnabled, getWolfStats, getWolfName, setWolfName } from '../../lib/wolfai.js';

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
      const wn = getWolfName();
      await sock.sendMessage(jid, {
        text: `🐺 *${wn} Activated*\n\nJust DM me anything — I'm listening!\n\nExamples:\n• _play Bohemian Rhapsody_\n• _what is quantum physics_\n• _show the menu_\n• _turn on antilink_`
      }, { quoted: m });
      return;
    }

    if (sub === 'off' || sub === 'disable') {
      setWolfEnabled(false);
      const wn = getWolfName();
      await sock.sendMessage(jid, {
        text: `🐺 *${wn} Deactivated*\n\nUse *${PREFIX}wolf on* to reactivate.`
      }, { quoted: m });
      return;
    }

    if (sub === 'name') {
      const newName = args.slice(1).join(' ').trim();
      if (!newName) {
        const current = getWolfName();
        await sock.sendMessage(jid, {
          text: `🐺 Current AI name: *${current}*\n\nTo change it: *${PREFIX}wolf name <new name>*`
        }, { quoted: m });
        return;
      }
      const old = getWolfName();
      setWolfName(newName);
      await sock.sendMessage(jid, {
        text: `🐺 AI name changed from *${old}* to *${newName}*.\n\nAll future responses will use the new name.`
      }, { quoted: m });
      return;
    }

    if (sub === 'status' || sub === 'stats') {
      const stats = getWolfStats();
      await sock.sendMessage(jid, {
        text: `🐺 *${stats.name} Status*\n\n` +
          `• *Status:* ${stats.enabled ? '✅ Active' : '❌ Disabled'}\n` +
          `• *Name:* ${stats.name}\n` +
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
            text: `🐺 *Conversations Cleared*\n\nCleared ${files.length} conversation(s). Memory has been reset.`
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
      text: `🐺 *${stats.name} — ${botName}'s AI Assistant*\n\n` +
        `*Status:* ${stats.enabled ? '✅ Active' : '❌ Disabled'}\n` +
        `*Name:* ${stats.name}\n` +
        `*AI Models:* ${stats.models} available\n` +
        `*Conversations:* ${stats.conversations} active\n` +
        `*Access:* Owner & Sudo only\n\n` +
        `*Commands:*\n` +
        `• *${PREFIX}wolf on* — Activate\n` +
        `• *${PREFIX}wolf off* — Deactivate\n` +
        `• *${PREFIX}wolf name <name>* — Change AI name\n` +
        `• *${PREFIX}wolf status* — Show stats\n` +
        `• *${PREFIX}wolf clear* — Reset all conversations\n\n` +
        `When active, just DM anything — I'll respond!`
    }, { quoted: m });
  },
};
