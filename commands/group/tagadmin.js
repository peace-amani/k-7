// commands/group/tagadmin.js

export default {
  name: 'tagadmin',
  alias: ['tagadmins'],
  description: 'Tags all admins with a formatted list.',
  execute: async (sock, msg, args, prefix, opts) => {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
    }

    try {
      const groupMetadata = await sock.groupMetadata(jid);
      const participants = groupMetadata.participants;

      const admins = participants
        .filter(p => p.admin)
        .map(p => ({
          id: p.id,
          name: p.name || p.notify || p.id.split('@')[0],
          role: p.admin
        }));

      if (admins.length === 0) {
        return sock.sendMessage(jid, { text: '⚠️ No admins found in this group.' }, { quoted: msg });
      }

      const customMessage = args.length > 0 ? args.join(' ') : '📢 Attention admins!';
      const groupName = groupMetadata.subject || 'Group';

      let captionText = `${customMessage}\n\n`;
      captionText += `🏷️ *${groupName}*\n`;
      captionText += `👑 Total Admins: ${admins.length}\n\n`;

      captionText += '┏━━━━━━━━━━━━━━━━━━━━┓\n';
      captionText += `┃ 👑 *ADMINS* (${admins.length})\n`;
      captionText += '┣━━━━━━━━━━━━━━━━━━━━┫\n';

      admins.forEach((admin, index) => {
        const paddedNumber = (index + 1).toString().padStart(2, '0');
        const tag = admin.role === 'superadmin' ? '⭐' : '🔰';
        const name = admin.name.length > 18
          ? admin.name.substring(0, 15) + '...'
          : admin.name.padEnd(18, ' ');
        captionText += `┃ ${paddedNumber}. ${tag} @${name}\n`;
      });

      captionText += '┗━━━━━━━━━━━━━━━━━━━━━┛\n\n';

      const now = new Date();
      const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const dateString = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      captionText += `⏰ Tagged on ${dateString} at ${timeString}`;

      const mentionIds = admins.map(a => a.id);

      let profilePicture;
      try {
        profilePicture = await sock.profilePictureUrl(jid, 'image');
      } catch {
        profilePicture = null;
      }

      if (profilePicture) {
        const response = await fetch(profilePicture);
        const buffer = await response.arrayBuffer();
        await sock.sendMessage(jid, {
          image: Buffer.from(buffer),
          caption: captionText,
          mentions: mentionIds
        }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, {
          text: captionText,
          mentions: mentionIds
        }, { quoted: msg });
      }

    } catch (err) {
      console.error('❌ tagadmin error:', err);
      await sock.sendMessage(jid, { text: '❌ Failed to tag admins.' }, { quoted: msg });
    }
  }
};
