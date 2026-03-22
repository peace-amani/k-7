import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

// https://apis.davidcyril.name.ng/play?query=<song>
// Returns: { status, result: { title, video_url, thumbnail, duration, views, published, download_url } }

async function davidCyrilPlay(query) {
  const res = await axios.get('https://apis.davidcyril.name.ng/play', {
    params: { query },
    timeout: 20000
  });
  const r = res.data?.result;
  if (!res.data?.status || !r?.download_url) throw new Error(res.data?.message || 'No result from API');
  return r;
}

export default {
  name: 'play',
  aliases: ['ytmp3doc', 'audiodoc', 'ytplay'],
  category: 'Downloader',
  description: 'Download YouTube audio',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const p   = prefix || '/';
    const quotedText = m.quoted?.text?.trim()
      || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim()
      || '';

    const query = args.join(' ').trim() || quotedText;

    if (!query) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎵 *PLAY* ⌋\n├─⊷ *${p}play <song name>*\n├─⊷ *${p}play <YouTube URL>*\n├─⊷ Reply a message and send *${p}play*\n╰⊷ _Powered by ${getOwnerName().toUpperCase()} TECH_`
      }, { quoted: m });
    }

    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });
    console.log(`🎵 [PLAY] Query: "${query}"`);

    try {
      // ── 1. Fetch metadata + download URL from David Cyril ────────────────
      const track = await davidCyrilPlay(query);
      const { title, video_url, thumbnail, duration, download_url } = track;

      console.log(`✅ [PLAY] Got: "${title}" → ${download_url}`);
      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      // ── 2. Download the audio file ───────────────────────────────────────
      const dlRes = await axios.get(download_url, {
        responseType: 'arraybuffer',
        timeout: 120000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer':    'https://ytshorts.savetube.me/',
          'Accept':     'audio/mpeg,audio/*;q=0.9,*/*;q=0.8'
        },
        validateStatus: s => s >= 200 && s < 400
      });

      const audioBuffer = Buffer.from(dlRes.data);

      if (audioBuffer.length < 10000) {
        throw new Error(`Download returned too little data (${audioBuffer.length} bytes)`);
      }

      const header = audioBuffer.slice(0, 50).toString('utf8').toLowerCase();
      if (header.includes('<!doctype') || header.includes('<html')) {
        throw new Error('CDN returned an HTML page instead of audio — try again later');
      }

      const sizeMB = (audioBuffer.length / 1024 / 1024).toFixed(1);
      if (parseFloat(sizeMB) > 50) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ File too large (${sizeMB}MB). Max is 50MB.` }, { quoted: m });
      }

      // ── 3. Fetch thumbnail ───────────────────────────────────────────────
      let thumbnailBuffer = null;
      if (thumbnail) {
        try {
          const tr = await axios.get(thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
          if (tr.data.length > 1000) thumbnailBuffer = Buffer.from(tr.data);
        } catch {}
      }

      const cleanTitle  = title.replace(/[^\w\s.-]/gi, '').substring(0, 50);
      const contextInfo = {
        externalAdReply: {
          title:     title.substring(0, 60),
          body:      `🎵 ${duration ? '⏱️ ' + duration + ' | ' : ''}${sizeMB}MB | 128kbps | Downloaded by ${getBotName()}`,
          mediaType: 2,
          thumbnail: thumbnailBuffer,
          sourceUrl: video_url,
          mediaUrl:  video_url,
          renderLargerThumbnail: true
        }
      };

      // ── 4. Send audio + document ─────────────────────────────────────────
      await sock.sendMessage(jid, {
        audio:    audioBuffer,
        mimetype: 'audio/mpeg',
        ptt:      false,
        fileName: `${cleanTitle}.mp3`,
        contextInfo
      }, { quoted: m });

      await sock.sendMessage(jid, {
        document: audioBuffer,
        mimetype: 'audio/mpeg',
        fileName: `${cleanTitle}.mp3`,
        contextInfo: {
          externalAdReply: {
            ...contextInfo.externalAdReply,
            body: `📄 Document | ${sizeMB}MB | Downloaded by ${getBotName()}`
          }
        }
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [PLAY] Sent: "${title}" (${sizeMB}MB)`);

    } catch (err) {
      console.error(`❌ [PLAY] ${err.message}`);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, {
        text: `❌ Failed: ${err.message}`
      }, { quoted: m });
    }
  }
};
