export default {
  name: 'promote',
  description: 'Promote a member to admin',
  category: 'group',
  async execute(sock, msg, args, from, isGroup, sender) {
    const jid = msg.key.remoteJid;
    const rawSender = msg.key.participant || jid;

    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
      return;
    }

    let groupMetadata;
    try {
      groupMetadata = await sock.groupMetadata(jid);
    } catch (error) {
      await sock.sendMessage(jid, { text: '❌ Failed to fetch group information.' }, { quoted: msg });
      return;
    }

    const participants = groupMetadata.participants || [];

    const matchParticipant = (jidToMatch) => {
      if (!jidToMatch) return null;
      const normalised = jidToMatch.split(':')[0];
      return participants.find(p =>
        p.id === jidToMatch ||
        p.id === normalised ||
        p.phoneNumber === jidToMatch ||
        p.phoneNumber === normalised ||
        (p.id && p.id.split(':')[0] === normalised)
      );
    };

    const senderParticipant = matchParticipant(rawSender);
    const isAdmin = senderParticipant?.admin === 'admin' || senderParticipant?.admin === 'superadmin';

    if (!isAdmin) {
      await sock.sendMessage(jid, { text: '🛑 Only group admins can use this command.' }, { quoted: msg });
      return;
    }

    let targetJid = null;

    const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (mentions && mentions.length > 0) {
      targetJid = mentions[0];
    } else if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
      targetJid = msg.message.extendedTextMessage.contextInfo.participant;
    } else if (args.length > 0) {
      const possibleNumber = args[0].replace(/[^0-9]/g, '');
      if (possibleNumber.length > 8) {
        targetJid = possibleNumber + '@s.whatsapp.net';
      }
    }

    if (!targetJid) {
      await sock.sendMessage(jid, {
        text: '⚠️ Please mention or reply to the member you want to promote.\nExample: .promote @user'
      }, { quoted: msg });
      return;
    }

    const targetParticipant = matchParticipant(targetJid);

    if (targetParticipant?.admin) {
      await sock.sendMessage(jid, {
        text: `⚠️ @${targetJid.split('@')[0]} is already an admin!`,
        mentions: [targetJid]
      }, { quoted: msg });
      return;
    }

    const promoteId = targetParticipant?.id || targetJid;

    try {
      await sock.groupParticipantsUpdate(jid, [promoteId], 'promote');
      await sock.sendMessage(jid, {
        text: `🆙 @${targetJid.split('@')[0]} has been promoted to *Alpha* rank! 🐺`,
        mentions: [targetJid]
      }, { quoted: msg });

      try {
        await sock.sendMessage(targetJid, {
          text: `🎉 Congratulations! You've been promoted to admin in the group!\n\nLead with wisdom, Alpha! 🐺`
        });
      } catch {}

    } catch (error) {
      console.error('Promote Error:', error);
      let errorMsg = '❌ Failed to promote member. ';
      if (error.message?.includes('not authorized')) {
        errorMsg += 'I need admin permissions to promote members.';
      } else if (error.message?.includes('not in group')) {
        errorMsg += 'The user is not in this group.';
      } else {
        errorMsg += 'Try again later.';
      }
      await sock.sendMessage(jid, { text: errorMsg }, { quoted: msg });
    }
  }
};
