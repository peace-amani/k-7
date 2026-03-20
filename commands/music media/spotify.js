// import axios from 'axios';
// import { getBotName } from '../../lib/botname.js';

// const GIFTED_API = 'https://api.giftedtech.co.ke/api/download/spotifydl';

// async function downloadAndValidate(url) {
//   const response = await axios({
//     url,
//     method: 'GET',
//     responseType: 'arraybuffer',
//     timeout: 60000,
//     maxRedirects: 5,
//     headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
//     validateStatus: (s) => s >= 200 && s < 400
//   });
//   const buffer = Buffer.from(response.data);
//   if (buffer.length < 1000) throw new Error('File too small, likely not audio');
//   const header = buffer.slice(0, 50).toString('utf8').toLowerCase();
//   if (header.includes('<!doctype') || header.includes('<html') || header.includes('bad gateway')) {
//     throw new Error('Received HTML instead of audio');
//   }
//   return buffer;
// }

// export default {
//   name: 'spotify',
//   aliases: ['spot', 'spdl', 'spotifydl', 'spotid'],
//   category: 'Downloader',
//   description: 'Download tracks from Spotify',

//   async execute(sock, m, args, PREFIX) {
//     const jid = m.key.remoteJid;
//     const quotedText = m.quoted?.text?.trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim() || '';

//     const query = args.length > 0 ? args.join(' ') : quotedText;

//     if (!query) {
//       return sock.sendMessage(jid, {
//         text: `╭─⌈ 🎵 *SPOTIFY DOWNLOADER* ⌋\n│\n├─⊷ *${PREFIX}spotify <Spotify URL>*\n│  └⊷ Download from Spotify link\n│\n├─⊷ *Examples:*\n│  └⊷ ${PREFIX}spotify https://open.spotify.com/track/...\n│\n├─⊷ *Aliases:* spot, spdl, spotifydl\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
//       }, { quoted: m });
//     }

//     console.log(`🎵 [SPOTIFY] Query: "${query}"`);
//     await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

//     try {
//       const apiRes = await axios.get(GIFTED_API, {
//         params: { apikey: 'gifted', url: query },
//         timeout: 30000
//       });

//       if (!apiRes.data?.success || !apiRes.data?.result?.download_url) {
//         throw new Error('No download link returned from Spotify API');
//       }

//       const { title, duration, thumbnail, download_url } = apiRes.data.result;

//       console.log(`🎵 [SPOTIFY] Found: ${title}`);
//       await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

//       const audioBuffer = await downloadAndValidate(download_url);
//       const fileSizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(1);

//       if (parseFloat(fileSizeMB) > 50) {
//         await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
//         return sock.sendMessage(jid, { text: `❌ File too large (${fileSizeMB}MB). Maximum size is 50MB.` }, { quoted: m });
//       }

//       let thumbnailBuffer = null;
//       if (thumbnail) {
//         try {
//           const thumbRes = await axios.get(thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
//           if (thumbRes.data.length > 1000) thumbnailBuffer = Buffer.from(thumbRes.data);
//         } catch {}
//       }

//       const cleanTitle = (title || 'spotify').replace(/[^\w\s.-]/gi, '').substring(0, 50);
//       const fileName = `${cleanTitle}.mp3`;

//       const contextInfo = {
//         externalAdReply: {
//           title: (title || 'Spotify Track').substring(0, 60),
//           body: `🎵 ${duration ? '⏱️ ' + duration + ' | ' : ''}${fileSizeMB}MB | Downloaded by ${getBotName()}`,
//           mediaType: 2,
//           thumbnail: thumbnailBuffer,
//           sourceUrl: query.startsWith('http') ? query : 'https://open.spotify.com',
//           renderLargerThumbnail: true
//         }
//       };

//       await sock.sendMessage(jid, {
//         audio: audioBuffer,
//         mimetype: 'audio/mpeg',
//         ptt: false,
//         fileName,
//         contextInfo
//       }, { quoted: m });

//       if (parseFloat(fileSizeMB) < 20) {
//         await sock.sendMessage(jid, {
//           document: audioBuffer,
//           mimetype: 'audio/mpeg',
//           fileName,
//           caption: `📄 *${title || 'Spotify Track'}*\n⏱️ ${duration || 'N/A'}\n📦 ${fileSizeMB}MB\n\n🐺 *Downloaded by ${getBotName()}*`
//         }, { quoted: m });
//       }

//       await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
//       console.log(`✅ [SPOTIFY] Success: "${title}" (${fileSizeMB}MB)`);

//     } catch (error) {
//       console.error('❌ [SPOTIFY] ERROR:', error.message);
//       await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
//       await sock.sendMessage(jid, {
//         text: `❌ *Spotify Error:* ${error.message}\n\n💡 Make sure you provide a valid Spotify track URL.\nExample: \`${PREFIX}spotify https://open.spotify.com/track/...\``
//       }, { quoted: m });
//     }
//   }
// };

















import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { xcasperSpotify } from '../../lib/xcasperApi.js';

const GIFTED_API = 'https://api.giftedtech.co.ke/api/download/spotifydlv3';

async function downloadAndValidate(url) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'arraybuffer',
    timeout: 60000,
    maxRedirects: 5,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    validateStatus: (s) => s >= 200 && s < 400
  });
  const buffer = Buffer.from(response.data);
  if (buffer.length < 1000) throw new Error('File too small, likely not audio');
  const header = buffer.slice(0, 50).toString('utf8').toLowerCase();
  if (header.includes('<!doctype') || header.includes('<html') || header.includes('bad gateway')) {
    throw new Error('Received HTML instead of audio');
  }
  return buffer;
}

export default {
  name: 'spotify',
  aliases: ['spot', 'spdl', 'spotifydl', 'spotid'],
  category: 'Downloader',
  description: 'Download tracks from Spotify',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const quotedText = m.quoted?.text?.trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim() || '';

    const query = args.length > 0 ? args.join(' ') : quotedText;

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎵 *SPOTIFY DOWNLOADER* ⌋\n│\n├─⊷ *${PREFIX}spotify <Spotify URL>*\n│  └⊷ Download from Spotify link\n│\n├─⊷ *Examples:*\n│  └⊷ ${PREFIX}spotify https://open.spotify.com/track/...\n│\n├─⊷ *Aliases:* spot, spdl, spotifydl\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    console.log(`🎵 [SPOTIFY] Query: "${query}"`);
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      let title = '', duration = 'N/A', thumbnail = '', audioBuffer = null;

      // Primary: GiftedTech API
      try {
        const apiRes = await axios.get(GIFTED_API, {
          params: { apikey: 'gifted', url: query },
          timeout: 30000
        });
        if (apiRes.data?.success && apiRes.data?.result?.download?.mp3) {
          const { metadata, download } = apiRes.data.result;
          title     = metadata?.title || '';
          thumbnail = metadata?.cover || '';
          console.log(`🎵 [SPOTIFY] GiftedTech found: ${title}`);
          audioBuffer = await downloadAndValidate(download.mp3);
        }
      } catch (e) {
        console.log(`[SPOTIFY] GiftedTech failed: ${e.message}`);
      }

      // Fallback: xcasper sportify
      if (!audioBuffer) {
        console.log('[SPOTIFY] Trying xcasper...');
        const xcRes = await xcasperSpotify(query);
        if (xcRes) {
          audioBuffer = xcRes.buf;
          title     = title     || xcRes.title;
          thumbnail = thumbnail || xcRes.thumbnail;
          duration  = xcRes.duration || duration;
          console.log(`🎵 [SPOTIFY] xcasper found: ${title}`);
        }
      }

      if (!audioBuffer) throw new Error('All Spotify sources failed. Please try again later.');

      console.log(`🎵 [SPOTIFY] Found: ${title}`);
      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });
      const fileSizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(1);

      if (parseFloat(fileSizeMB) > 50) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ File too large (${fileSizeMB}MB). Maximum size is 50MB.` }, { quoted: m });
      }

      let thumbnailBuffer = null;
      if (thumbnail) {
        try {
          const thumbRes = await axios.get(thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
          if (thumbRes.data.length > 1000) thumbnailBuffer = Buffer.from(thumbRes.data);
        } catch {}
      }

      const cleanTitle = (title || 'spotify').replace(/[^\w\s.-]/gi, '').substring(0, 50);
      const fileName = `${cleanTitle}.mp3`;

      const contextInfo = {
        externalAdReply: {
          title: (title || 'Spotify Track').substring(0, 60),
          body: `🎵 ${duration ? '⏱️ ' + duration + ' | ' : ''}${fileSizeMB}MB | Downloaded by ${getBotName()}`,
          mediaType: 2,
          thumbnail: thumbnailBuffer,
          sourceUrl: query.startsWith('http') ? query : 'https://open.spotify.com',
          renderLargerThumbnail: true
        }
      };

      await sock.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        ptt: false,
        fileName,
        contextInfo
      }, { quoted: m });

      if (parseFloat(fileSizeMB) < 20) {
        await sock.sendMessage(jid, {
          document: audioBuffer,
          mimetype: 'audio/mpeg',
          fileName,
          caption: `📄 *${title || 'Spotify Track'}*\n⏱️ ${duration || 'N/A'}\n📦 ${fileSizeMB}MB\n\n🐺 *Downloaded by ${getBotName()}*`
        }, { quoted: m });
      }

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [SPOTIFY] Success: "${title}" (${fileSizeMB}MB)`);

    } catch (error) {
      console.error('❌ [SPOTIFY] ERROR:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ *Spotify Error:* ${error.message}\n\n💡 Make sure you provide a valid Spotify track URL.\nExample: \`${PREFIX}spotify https://open.spotify.com/track/...\``
      }, { quoted: m });
    }
  }
};
