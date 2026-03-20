import { getBotName } from '../../lib/botname.js';
import {
  isWolfEnabled, setWolfEnabled, getWolfStats,
  getWolfName, setWolfName,
  getBlockedChats, addBlockedChat, removeBlockedChat,
  getAllowedGroups, addAllowedGroup, removeAllowedGroup,
  normalizeToJid,
} from '../../lib/wolfai.js';

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
          text: `🐺 Current AI name: *${current}*\n\nTo change: *${PREFIX}wolf name <new name>*`
        }, { quoted: m });
        return;
      }
      const old = getWolfName();
      setWolfName(newName);
      await sock.sendMessage(jid, {
        text: `🐺 AI name changed from *${old}* → *${newName}*`
      }, { quoted: m });
      return;
    }

    if (sub === 'block' || sub === 'silence') {
      const raw = args.slice(1).join(' ').trim();
      let targetJid = raw ? normalizeToJid(raw) : jid;
      if (!targetJid) {
        await sock.sendMessage(jid, {
          text: `❌ Invalid number or JID. Usage: *${PREFIX}wolf block <number or JID>*\nOr just run *${PREFIX}wolf block* from within the chat you want to silence.`
        }, { quoted: m });
        return;
      }
      addBlockedChat(targetJid);
      const label = targetJid === jid ? 'this chat' : targetJid;
      await sock.sendMessage(jid, {
        text: `🔇 *Silenced*\n\nI won't respond in *${label}* anymore.\nUse *${PREFIX}wolf unblock ${targetJid}* to re-enable.`
      }, { quoted: m });
      return;
    }

    if (sub === 'unblock' || sub === 'resume') {
      const raw = args.slice(1).join(' ').trim();
      const targetJid = raw ? normalizeToJid(raw) : jid;
      if (!targetJid) {
        await sock.sendMessage(jid, {
          text: `❌ Invalid number or JID. Usage: *${PREFIX}wolf unblock <number or JID>*`
        }, { quoted: m });
        return;
      }
      removeBlockedChat(targetJid);
      const label = targetJid === jid ? 'this chat' : targetJid;
      await sock.sendMessage(jid, {
        text: `🔊 *Unblocked*\n\nI'll respond in *${label}* again.`
      }, { quoted: m });
      return;
    }

    if (sub === 'allow') {
      const raw = args.slice(1).join(' ').trim();
      const targetJid = raw ? normalizeToJid(raw) : (jid.includes('@g.us') ? jid : null);
      if (!targetJid || !targetJid.includes('@g.us')) {
        await sock.sendMessage(jid, {
          text: `❌ Please provide a valid group JID.\nUsage: *${PREFIX}wolf allow <group-jid>*\n\n_Get a group's JID using the \`getjid\` command inside that group._`
        }, { quoted: m });
        return;
      }
      addAllowedGroup(targetJid);
      await sock.sendMessage(jid, {
        text: `✅ *Group Activated*\n\nI'm now active in:\n*${targetJid}*\n\nI'll respond there when you message me.\nUse *${PREFIX}wolf deny ${targetJid}* to remove me.`
      }, { quoted: m });
      return;
    }

    if (sub === 'deny' || sub === 'disallow') {
      const raw = args.slice(1).join(' ').trim();
      const targetJid = raw ? normalizeToJid(raw) : (jid.includes('@g.us') ? jid : null);
      if (!targetJid || !targetJid.includes('@g.us')) {
        await sock.sendMessage(jid, {
          text: `❌ Please provide a valid group JID.\nUsage: *${PREFIX}wolf deny <group-jid>*`
        }, { quoted: m });
        return;
      }
      removeAllowedGroup(targetJid);
      await sock.sendMessage(jid, {
        text: `🚫 *Group Removed*\n\nI'll no longer respond in:\n*${targetJid}*`
      }, { quoted: m });
      return;
    }

    if (sub === 'chats' || sub === 'list' || sub === 'groups') {
      const blocked = getBlockedChats();
      const groups = getAllowedGroups();
      let text = `🐺 *${getWolfName()} — Chat Control*\n\n`;
      text += `🔇 *Silenced Chats (${blocked.length}):*\n`;
      if (blocked.length === 0) {
        text += `  _None_\n`;
      } else {
        blocked.forEach((b, i) => { text += `  ${i + 1}. ${b}\n`; });
      }
      text += `\n✅ *Active Groups (${groups.length}):*\n`;
      if (groups.length === 0) {
        text += `  _None — I only respond in DMs by default_\n`;
      } else {
        groups.forEach((g, i) => { text += `  ${i + 1}. ${g}\n`; });
      }
      text += `\n*Commands:*\n`;
      text += `• *${PREFIX}wolf block <number/jid>* — silence a chat\n`;
      text += `• *${PREFIX}wolf unblock <number/jid>* — re-enable a chat\n`;
      text += `• *${PREFIX}wolf allow <group-jid>* — activate in a group\n`;
      text += `• *${PREFIX}wolf deny <group-jid>* — deactivate in a group`;
      await sock.sendMessage(jid, { text }, { quoted: m });
      return;
    }

    if (sub === 'status' || sub === 'stats') {
      const stats = getWolfStats();
      const blocked = getBlockedChats();
      const groups = getAllowedGroups();
      await sock.sendMessage(jid, {
        text: `🐺 *${stats.name} Status*\n\n` +
          `• *Status:* ${stats.enabled ? '✅ Active' : '❌ Disabled'}\n` +
          `• *Name:* ${stats.name}\n` +
          `• *AI Models:* ${stats.models} available\n` +
          `• *Conversations:* ${stats.conversations} stored\n` +
          `• *Silenced Chats:* ${blocked.length}\n` +
          `• *Active Groups:* ${groups.length}\n` +
          `• *Access:* Owner & Sudo only`
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
          for (const file of files) fs.unlinkSync(path.join(convDir, file));
          await sock.sendMessage(jid, {
            text: `🐺 *Conversations Cleared*\n\nCleared ${files.length} conversation(s). Memory has been reset.`
          }, { quoted: m });
        } else {
          await sock.sendMessage(jid, { text: `🐺 No conversations to clear.` }, { quoted: m });
        }
      } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Error clearing: ${err.message}` }, { quoted: m });
      }
      return;
    }

    const stats = getWolfStats();
    await sock.sendMessage(jid, {
      text: `🐺 *${stats.name} — ${botName}'s AI Assistant*\n\n` +
        `*Status:* ${stats.enabled ? '✅ Active' : '❌ Disabled'}\n` +
        `*Name:* ${stats.name}\n` +
        `*Models:* ${stats.models} available | *Convos:* ${stats.conversations}\n` +
        `*Silenced:* ${getBlockedChats().length} chats | *Groups:* ${getAllowedGroups().length}\n\n` +
        `*Commands:*\n` +
        `• *${PREFIX}wolf on/off* — Toggle AI\n` +
        `• *${PREFIX}wolf name <name>* — Change AI name\n` +
        `• *${PREFIX}wolf block <number/jid>* — Silence a chat\n` +
        `• *${PREFIX}wolf unblock <number/jid>* — Re-enable a chat\n` +
        `• *${PREFIX}wolf allow <group-jid>* — Activate in a group\n` +
        `• *${PREFIX}wolf deny <group-jid>* — Deactivate in a group\n` +
        `• *${PREFIX}wolf chats* — View blocked chats & active groups\n` +
        `• *${PREFIX}wolf status* — Full status\n` +
        `• *${PREFIX}wolf clear* — Reset conversation memory`
    }, { quoted: m });
  },
};
