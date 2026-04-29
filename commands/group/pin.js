import * as baileys from '@whiskeysockets/baileys';
const { proto } = baileys;

export default {
  name: 'pin',
  alias: ['pinmessage', 'pinmsg'],
  description: 'Pin a replied message in the group',
  category: 'group',

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
    }

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedKey = msg.message?.extendedTextMessage?.contextInfo;

    if (!quoted || !quotedKey?.stanzaId) {
      return sock.sendMessage(jid, {
        text: '⚠️ *Reply to a message* to pin it.\nExample: reply to any message with *.pin*'
      }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

      const botId = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
      const botLid = sock.user?.lid;
      const participant = quotedKey.participant;
      const isFromMe = participant === botId || participant === sock.user?.id || participant === botLid;

      const pinnedMsgKey = {
        remoteJid: jid,
        fromMe: isFromMe,
        id: quotedKey.stanzaId,
        participant: participant
      };

      await sock.sendMessage(jid, {
        pinInChat: {
          type: proto.PinInChat.Type.PIN_FOR_ALL,
          key: pinnedMsgKey
        }
      });

      await sock.sendMessage(jid, { react: { text: '📌', key: msg.key } });
      await sock.sendMessage(jid, {
        text: '📌 *Message pinned!*\nThe message has been pinned for all group members.'
      }, { quoted: msg });

    } catch (err) {
      console.error('[pin]', err.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(jid, { text: `❌ Failed to pin message: ${err.message}` }, { quoted: msg });
    }
  }
};
