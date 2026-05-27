import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

let _getUserCaption;
try {
  const _tk = await import('./tiktok.js');
  _getUserCaption = _tk.getUserCaption || ((uid) => `${getBotName()} is the Alpha`);
} catch { _getUserCaption = (uid) => `${getBotName()} is the Alpha`; }
function getCaption(uid) { return typeof _getUserCaption === 'function' ? _getUserCaption(uid) : `${getBotName()} is the Alpha`; }

const GIFTED_API = 'https://api.giftedtech.co.ke/api/download/mediafire';

async function downloadBuffer(url) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'arraybuffer',
    timeout: 90000,
    maxRedirects: 5,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    validateStatus: (s) => s >= 200 && s < 400
  });
  return Buffer.from(response.data);
}

export default {
  name: 'mediafire',
  aliases: ['mf', 'mfdl', 'mediafiredl'],
  description: 'Download files from MediaFire links',
  category: 'Downloader',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const userId = m.key.participant || m.key.remoteJid;
    const quotedText = m.quoted?.text?.trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim() || '';

    const url = args.length > 0 ? args.join(' ').trim() : quotedText;

    if (!url || !url.includes('mediafire.com')) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 📁 *MEDIAFIRE DOWNLOADER* ⌋\n│\n├⊷ *Usage:* ${prefix}mediafire <url>\n├⊷ *Example:*\n│  └⊷ ${prefix}mediafire https://www.mediafire.com/file/abc123/file.zip/file\n├⊷ *Aliases:* mf, mfdl, mediafiredl\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    console.log(`📁 [MEDIAFIRE] URL: ${url}`);
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      const apiRes = await axios.get(GIFTED_API, {
        params: { apikey: 'gifted', url },
        timeout: 20000
      });

      if (!apiRes.data?.success || !apiRes.data?.result?.downloadUrl) {
        throw new Error('Could not extract download link');
      }

      const { fileName, fileSize, fileType, mimeType, downloadUrl, uploadedOn } = apiRes.data.result;

      console.log(`📁 [MEDIAFIRE] Found: ${fileName} (${fileSize})`);
      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      const fileBuffer = await downloadBuffer(downloadUrl);
      const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(1);

      if (fileBuffer.length > 100 * 1024 * 1024) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, {
          text: `❌ *File too large (${fileSizeMB}MB)*\n\n📁 *${fileName}*\n📦 *Size:* ${fileSize}\n\n📥 Direct download link:\n${downloadUrl}`
        }, { quoted: m });
      }

      const detectedMime = mimeType || 'application/octet-stream';

      const BOT_NAME = getBotName();
      await sock.sendMessage(jid, {
        document: fileBuffer,
        fileName: fileName || 'mediafire_file',
        mimetype: detectedMime,
        caption:
          `╭─⌈ 📁 *MEDIAFIRE* ⌋\n` +
          `├⊷ 📄 *File:* ${fileName || 'Unknown'}\n` +
          `├⊷ 📏 *Size:* ${fileSize || fileSizeMB + 'MB'}\n` +
          `├⊷ 🗂️ *Type:* ${fileType || detectedMime}\n` +
          `${uploadedOn ? `├⊷ 📅 *Uploaded:* ${uploadedOn}\n` : ''}` +
          `╰⊷ *Powered by ${BOT_NAME}*\n\n${getCaption(userId)}`
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [MEDIAFIRE] Success: ${fileName} (${fileSizeMB}MB)`);

    } catch (error) {
      console.error('❌ [MEDIAFIRE] Error:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ *MediaFire Error:* ${error.message}\n\n💡 Make sure the link is a valid public MediaFire file URL.`
      }, { quoted: m });
    }
  }
};
