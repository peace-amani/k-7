import qrcode from 'qrcode';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
  name: 'qrencode',
  alias: ['qrcode', 'qr'],
  description: '📱 Generate a QR code from text or URL',
  category: 'utility',
  usage: '.qrencode <text or URL>',

  async execute(sock, m, args) {
    const jid = m.key.remoteJid;

    if (!args.length) {
      return sock.sendMessage(
        jid,
        { text: `╭─⌈ 📱 *QR CODE GENERATOR* ⌋\n│\n├─⊷ *qrencode <text/URL>*\n│  └⊷ Generate a QR code from text or URL\n│\n├─⊷ *Example:*\n│  └⊷ \`.qrencode https://example.com\`\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` },
        { quoted: m }
      );
    }

    const textToEncode = args.join(' ');

    try {
      const qrBuffer = await qrcode.toBuffer(textToEncode, { type: 'png', margin: 2, scale: 5 });
      await sock.sendMessage(jid, { image: qrBuffer, caption: '📱 Here is your QR code' }, { quoted: m });
    } catch (err) {
      console.error('[QR Encode Error]', err);
      await sock.sendMessage(jid, { text: '❌ Failed to generate QR code. Please try again.' }, { quoted: m });
    }
  }
};
