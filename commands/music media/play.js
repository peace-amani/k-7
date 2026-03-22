import { createRequire } from 'module';
import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setMusicSession } from '../../lib/musicSession.js';
import { xwolfSearch, streamXWolf } from '../../lib/xwolfApi.js';
import { xcasperAudio } from '../../lib/xcasperApi.js';

const require = createRequire(import.meta.url);
let giftedBtns;
try { giftedBtns = require('gifted-btns'); } catch (e) {}

// ── David Cyril API — primary download source ────────────────────────────────
// Endpoint: GET https://apis.davidcyril.name.ng/play?query=<search or yt url>
// Returns:  { status: true, result: { title, video_url, thumbnail, duration, download_url } }
// The download_url is a direct CDN MP3 link — fetch it to get the audio buffer.
async function davidcyrilPlay(query) {
  try {
    const url = `https://apis.davidcyril.name.ng/play?query=${encodeURIComponent(query)}`;
    const res  = await axios.get(url, { timeout: 20000 });
    const data = res.data;

    if (!data?.status || !data?.result?.download_url) return null;

    const { title, video_url, thumbnail, duration, download_url } = data.result;

    // Fetch the actual audio buffer from the CDN link
    const dlRes = await axios.get(download_url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: 60 * 1024 * 1024   // 60 MB safety cap
    });

    const buffer = Buffer.from(dlRes.data);
    if (!buffer || buffer.length < 1000) return null;

    return { buffer, title, thumbnail, duration, videoUrl: video_url };
  } catch {
    return null;
  }
}

export default {
  name: 'play',
  aliases: ['ytmp3doc', 'audiodoc', 'ytplay'],
  category: 'Downloader',
  description: 'Download YouTube audio',

  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const p = prefix || '.';
    const quotedText = m.quoted?.text?.trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation?.trim() || '';

    const flags = { list: args.includes('list') || args.includes('search') };
    const queryArgs = args.filter(a => !['list', 'search'].includes(a));
    let searchQuery = queryArgs.length > 0 ? queryArgs.join(' ') : quotedText;

    if (!searchQuery && !flags.list) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎵 *PLAY COMMAND* ⌋\n│\n├─⊷ *${p}play <song name>*\n│  └⊷ Download audio\n├─⊷ *${p}play <YouTube URL>*\n│  └⊷ Download from link\n├─⊷ *${p}play list <query>*\n│  └⊷ Search and list results\n├─⊷ *Reply to a text message*\n│  └⊷ Uses replied text as search\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    console.log(`🎵 [PLAY] Query: "${searchQuery}"`);
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      // ── List mode ────────────────────────────────────────────────────────
      if (flags.list) {
        const listQuery = searchQuery || args.join(' ');
        const items = await xwolfSearch(listQuery, 10);
        if (!items.length) {
          await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
          return sock.sendMessage(jid, { text: `❌ No results found for "${listQuery}"` }, { quoted: m });
        }
        let listText = `🔍 *Search Results:* "${listQuery}"\n\n`;
        items.forEach((v, i) => {
          const ytUrl = `https://youtube.com/watch?v=${v.id}`;
          listText += `${i + 1}. ${v.title}\n   👤 ${v.channelTitle || 'Unknown'}\n   ⏱️ ${v.duration || 'N/A'} | 📦 ${v.size || 'N/A'}\n   📺 ${p}play ${ytUrl}\n\n`;
        });
        await sock.sendMessage(jid, { text: listText }, { quoted: m });
        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
        return;
      }

      // ── Resolve search query to video info ───────────────────────────────
      const isUrl = /^https?:\/\//i.test(searchQuery);
      let videoId  = '';
      let videoInfo = { title: searchQuery, channelTitle: '', duration: '', thumbnail: '' };

      if (!isUrl) {
        const items = await xwolfSearch(searchQuery, 5);
        if (items.length) {
          const top = items[0];
          videoId = top.id;
          videoInfo = {
            title:        top.title       || searchQuery,
            channelTitle: top.channelTitle || '',
            duration:     top.duration    || '',
            thumbnail:    `https://img.youtube.com/vi/${top.id}/hqdefault.jpg`
          };
          searchQuery = `https://youtube.com/watch?v=${top.id}`;

          // Button mode — show interactive preview card, let user tap Download
          if (isButtonModeEnabled() && giftedBtns?.sendInteractiveMessage) {
            const videos = items.map(v => ({
              url:       `https://youtube.com/watch?v=${v.id}`,
              title:     v.title,
              author:    v.channelTitle || '',
              duration:  v.duration    || '',
              videoId:   v.id,
              thumbnail: `https://img.youtube.com/vi/${v.id}/hqdefault.jpg`
            }));
            setMusicSession(jid, { videos, index: 0, type: 'audio' });
            const buttons = [
              { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '⬇️ Download', id: `${p}songdl` }) }
            ];
            if (videos.length > 1) {
              buttons.push({ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '➡️ Next Result', id: `${p}snext` }) });
            }
            try {
              const msgOpts = {
                title: videoInfo.title.substring(0, 60),
                text:  `🎵 *${videoInfo.title}*\n👤 ${videoInfo.channelTitle || 'Unknown'}\n⏱️ ${videoInfo.duration || 'N/A'}\n\n_Result 1 of ${videos.length}_`,
                footer: `🐺 ${getBotName()}`,
                interactiveButtons: buttons
              };
              if (videoInfo.thumbnail) msgOpts.image = { url: videoInfo.thumbnail };
              await giftedBtns.sendInteractiveMessage(sock, jid, msgOpts);
              await sock.sendMessage(jid, { react: { text: '🎵', key: m.key } });
              return;
            } catch {}
          }
        }
      } else {
        videoId = searchQuery.match(/(?:v=|youtu\.be\/)([^&?\/\s]{11})/i)?.[1] || '';
        if (videoId) videoInfo.thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      }

      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      // ── Download phase — tiered fallback ─────────────────────────────────
      // 1st: David Cyril API  (search + metadata + CDN MP3 in one call)
      // 2nd: XWolf stream
      // 3rd: Xcasper audio

      let audioBuffer = null;

      // 1st attempt — David Cyril
      console.log(`🎵 [PLAY] Trying David Cyril API...`);
      const dc = await davidcyrilPlay(searchQuery);
      if (dc?.buffer) {
        audioBuffer = dc.buffer;
        // Enrich videoInfo with David Cyril's metadata where available
        if (dc.title)     videoInfo.title     = dc.title;
        if (dc.thumbnail) videoInfo.thumbnail = dc.thumbnail;
        if (dc.duration)  videoInfo.duration  = dc.duration;
        console.log(`✅ [PLAY] David Cyril success: "${dc.title}"`);
      }

      // 2nd attempt — XWolf stream
      if (!audioBuffer) {
        console.log(`🎵 [PLAY] David Cyril failed, trying XWolf...`);
        audioBuffer = await streamXWolf(searchQuery, 'mp3');
      }

      // 3rd attempt — Xcasper
      if (!audioBuffer) {
        console.log(`🎵 [PLAY] XWolf failed, trying Xcasper...`);
        audioBuffer = await xcasperAudio(searchQuery);
      }

      if (!audioBuffer) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Download failed. Please try again later.` }, { quoted: m });
      }

      const trackTitle = videoInfo.title || 'Audio';
      const quality    = '128kbps';
      const thumbUrl   = videoInfo.thumbnail;

      const sizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(1);
      if (parseFloat(sizeMB) > 50) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ File too large (${sizeMB}MB). Maximum is 50MB.` }, { quoted: m });
      }

      let thumbnailBuffer = null;
      if (thumbUrl) {
        try {
          const tr = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 10000 });
          if (tr.data.length > 1000) thumbnailBuffer = Buffer.from(tr.data);
        } catch {}
      }

      const cleanTitle = trackTitle.replace(/[^\w\s.-]/gi, '').substring(0, 50);
      const sizeLabel  = `${sizeMB}MB`;

      const contextInfo = {
        externalAdReply: {
          title:               trackTitle.substring(0, 60),
          body:                `🎵 ${videoInfo.channelTitle ? videoInfo.channelTitle + ' | ' : ''}${videoInfo.duration ? '⏱️ ' + videoInfo.duration + ' | ' : ''}${sizeLabel} | ${quality} | Downloaded by ${getBotName()}`,
          mediaType:           2,
          thumbnail:           thumbnailBuffer,
          sourceUrl:           searchQuery,
          mediaUrl:            searchQuery,
          renderLargerThumbnail: true
        }
      };

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
            body: `📄 Document | ${sizeLabel} | Downloaded by ${getBotName()}`
          }
        }
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [PLAY] Success: "${trackTitle}" (${sizeLabel})`);

    } catch (error) {
      console.error('❌ [PLAY] ERROR:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` }, { quoted: m });
    }
  }
};
