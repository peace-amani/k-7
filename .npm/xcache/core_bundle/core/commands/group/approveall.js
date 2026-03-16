import { getBotName } from '../../lib/botname.js';
export default {
  name: 'approveall',
  description: 'Approve all pending group join requests.',
  execute: async (sock, msg, args, metadata) => {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
    } catch (e) {}

    let pendingRequests;
    try {
      pendingRequests = await sock.groupRequestParticipantsList(jid);
    } catch (error) {
      console.error('[ApproveAll] Error fetching pending requests:', error);
      try { await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }); } catch (e) {}
      return sock.sendMessage(jid, { text: '❌ Failed to fetch pending join requests. Make sure the bot is an admin.' }, { quoted: msg });
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      try { await sock.sendMessage(jid, { react: { text: 'ℹ️', key: msg.key } }); } catch (e) {}
      return sock.sendMessage(jid, { text: 'ℹ️ No pending join requests found in this group.' }, { quoted: msg });
    }

    const participantJids = pendingRequests.map(p => p.jid || p.id);

    let approvedCount = 0;
    let failedCount = 0;
    const batchSize = 5;

    for (let i = 0; i < participantJids.length; i += batchSize) {
      const batch = participantJids.slice(i, i + batchSize);
      try {
        await sock.groupRequestParticipantsUpdate(jid, batch, 'approve');
        approvedCount += batch.length;
      } catch (error) {
        console.error('[ApproveAll] Batch approval error:', error);
        failedCount += batch.length;
      }
      if (i + batchSize < participantJids.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    try { await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }); } catch (e) {}

    let resultText = `╭━🐺 *APPROVED* 🐺━╮\n`;
    resultText += `┃ 📋 *Total Requests:* ${participantJids.length}\n`;
    resultText += `┃ ✅ *Approved:* ${approvedCount}\n`;
    if (failedCount > 0) {
      resultText += `┃ ❌ *Failed:* ${failedCount}\n`;
    }
    resultText += `╰━━━━━━━━━━━━━╯\n`;
    resultText += `_🐺 _${getBotName()}_`;

    await sock.sendMessage(jid, { text: resultText }, { quoted: msg });
  },
};
