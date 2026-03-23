// commands/group/tagadmin.js

export default {
  name: 'tagadmin',
  execute: async (sock, msg, args, prefix, opts) => {
    const jid = msg.key.remoteJid;
    const text = args.join(' ') || '🔔 Calling all group admins...';

    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ This command is only for groups.' }, { quoted: msg });
    }

    try {
      const metadata = await sock.groupMetadata(jid);
      const adminMembers = metadata.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (adminMembers.length === 0) {
        return sock.sendMessage(jid, { text: '⚠️ No admins found in this group.' }, { quoted: msg });
      }

      const mentionText = adminMembers
        .map(id => `@${id.split('@')[0]}`)
        .join(' ');

      await sock.sendMessage(jid, {
        text: `${text}\n\n${mentionText}`,
        mentions: adminMembers,
      }, { quoted: msg });

    } catch (err) {
      console.error('❌ tagadmin error:', err);
      await sock.sendMessage(jid, { text: '❌ Failed to tag admins.' }, { quoted: msg });
    }
  }
};
