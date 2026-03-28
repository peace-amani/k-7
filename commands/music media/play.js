import { createRequire } from 'module';
import axios from 'axios';
import yts from 'yt-search';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setMusicSession } from '../../lib/musicSession.js';
import { xwolfSearch } from '../../lib/xwolfApi.js';
import { downloadAudioWithFallback } from '../../lib/audioDownloader.js';

const require = createRequire(import.meta.url);
let giftedBtns;
try { giftedBtns = require('gifted-btns'); } catch (e) {}

// ── David Cyril API — metadata + URL resolver ─────────────────────────────
async function davidcyrilPlayMeta(query) {
  try {
    const res  = await axios.get('https://apis.davidcyril.name.ng/play', {
      params: { query },
      timeout: 15000
    });
    const data = res.data;
    if (!data?.status || !data?.result?.video_url) return null;
    const { title, video_url, thumbnail, duration } = data.result;
    return { title, thumbnail, duration, videoUrl: video_url };
  } catch {
    return null;
  }
}

// ── Search fallback: yt-search ────────────────────────────────────────────
async function ytsSearch(query, limit = 5) {
  try {
    const { videos } = await yts(query);
    if (!videos?.length) return [];
    return videos.slice(0, limit).map(v => ({
      id:           v.videoId,
      title:        v.title,
      channelTitle: v.author?.name || '',
      duration:     v.timestamp   || '',
      thumbnail:    v.thumbnail   || `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`
    }));
  } catch {
    return [];
  }
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

    const flags     = { list: args.includes('list') || args.includes('search') };
    const queryArgs = args.filter(a => !['list', 'search'].includes(a));
    let searchQuery = queryArgs.join(' ').trim() || quotedText;

    if (!searchQuery && !flags.list) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎵 *PLAY* ⌋\n│\n├─⊷ *${p}play <song name>*\n│  └⊷ Download audio\n├─⊷ *${p}play <YouTube URL>*\n│  └⊷ Download from link\n├─⊷ *${p}play list <query>*\n│  └⊷ Search and list results\n├─⊷ Reply a message and send *${p}play*\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    console.log(`🎵 [PLAY] Query: "${searchQuery}"`);
    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    try {
      // ── List mode ────────────────────────────────────────────────────────
      if (flags.list) {
        const listQuery = searchQuery || args.join(' ');
        let items = await xwolfSearch(listQuery, 10);
        if (!items.length) items = await ytsSearch(listQuery, 10);
        if (!items.length) {
          await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
          return sock.sendMessage(jid, { text: `❌ No results found for "${listQuery}"` }, { quoted: m });
        }
        let listText = `🔍 *Search Results:* "${listQuery}"\n\n`;
        items.forEach((v, i) => {
          listText += `${i + 1}. ${v.title}\n   👤 ${v.channelTitle || 'Unknown'}\n   ⏱️ ${v.duration || 'N/A'}\n   📺 ${p}play https://youtube.com/watch?v=${v.id}\n\n`;
        });
        await sock.sendMessage(jid, { text: listText }, { quoted: m });
        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
        return;
      }

      // ── Step 1: resolve search → YouTube URL + metadata ──────────────────
      // Priority: David Cyril → xwolfSearch → yt-search
      const isUrl = /^https?:\/\//i.test(searchQuery);
      let videoInfo = { title: searchQuery, channelTitle: '', duration: '', thumbnail: '' };

      if (!isUrl) {
        console.log(`🎵 [PLAY] Trying David Cyril for metadata...`);
        const dc = await davidcyrilPlayMeta(searchQuery);

        if (dc?.videoUrl) {
          if (dc.title)     videoInfo.title     = dc.title;
          if (dc.thumbnail) videoInfo.thumbnail = dc.thumbnail;
          if (dc.duration)  videoInfo.duration  = dc.duration;
          searchQuery = dc.videoUrl;
          console.log(`✅ [PLAY] David Cyril: "${dc.title}" → ${dc.videoUrl}`);
        } else {
          console.log(`🎵 [PLAY] David Cyril failed, trying xwolfSearch...`);
          let items = await xwolfSearch(searchQuery, 5);
          if (!items.length) {
            console.log(`🎵 [PLAY] xwolfSearch empty, trying yt-search...`);
            items = await ytsSearch(searchQuery, 5);
          }
          if (items.length) {
            const top = items[0];
            videoInfo = {
              title:        top.title       || searchQuery,
              channelTitle: top.channelTitle || '',
              duration:     top.duration    || '',
              thumbnail:    top.thumbnail   || `https://img.youtube.com/vi/${top.id}/hqdefault.jpg`
            };
            searchQuery = `https://youtube.com/watch?v=${top.id}`;

            if (isButtonModeEnabled() && giftedBtns?.sendInteractiveMessage) {
              const videos = items.map(v => ({
                url: `https://youtube.com/watch?v=${v.id}`, title: v.title,
                author: v.channelTitle || '', duration: v.duration || '',
                videoId: v.id, thumbnail: v.thumbnail || `https://img.youtube.com/vi/${v.id}/hqdefault.jpg`
              }));
              setMusicSession(jid, { videos, index: 0, type: 'audio' });
              const buttons = [{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '⬇️ Download', id: `${p}songdl` }) }];
              if (videos.length > 1) buttons.push({ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '➡️ Next Result', id: `${p}snext` }) });
              try {
                const msgOpts = {
                  title: videoInfo.title.substring(0, 60),
                  text: `🎵 *${videoInfo.title}*\n👤 ${videoInfo.channelTitle || 'Unknown'}\n⏱️ ${videoInfo.duration || 'N/A'}\n\n_Result 1 of ${videos.length}_`,
                  footer: `🐺 ${getBotName()}`, interactiveButtons: buttons
                };
                if (videoInfo.thumbnail) msgOpts.image = { url: videoInfo.thumbnail };
                await giftedBtns.sendInteractiveMessage(sock, jid, msgOpts);
                await sock.sendMessage(jid, { react: { text: '🎵', key: m.key } });
                return;
              } catch {}
            }
          }
        }
      } else {
        const videoId = searchQuery.match(/(?:v=|youtu\.be\/)([^&?\/\s]{11})/i)?.[1] || '';
        if (videoId) videoInfo.thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        const dc = await davidcyrilPlayMeta(searchQuery);
        if (dc?.title)     videoInfo.title     = dc.title;
        if (dc?.thumbnail) videoInfo.thumbnail = dc.thumbnail;
        if (dc?.duration)  videoInfo.duration  = dc.duration;
        if (dc?.videoUrl)  searchQuery         = dc.videoUrl;
      }

      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      // ── Step 2: download — yt-dlp → Giftedtech → Cobalt → XWolf → XCasper
      const audioBuffer = await downloadAudioWithFallback(searchQuery);

      if (!audioBuffer) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Download failed. Please try again later.` }, { quoted: m });
      }

      const trackTitle = videoInfo.title || 'Audio';
      const sizeMB     = (audioBuffer.length / 1024 / 1024).toFixed(1);

      if (parseFloat(sizeMB) > 50) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ File too large (${sizeMB}MB). Max is 50MB.` }, { quoted: m });
      }

      let thumbnailBuffer = null;
      if (videoInfo.thumbnail) {
        try {
          const tr = await axios.get(videoInfo.thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
          if (tr.data.length > 1000) thumbnailBuffer = Buffer.from(tr.data);
        } catch {}
      }

      const cleanTitle  = trackTitle.replace(/[^\w\s.-]/gi, '').substring(0, 50);
      const contextInfo = {
        externalAdReply: {
          title:     trackTitle.substring(0, 60),
          body:      `🎵 ${videoInfo.channelTitle ? videoInfo.channelTitle + ' | ' : ''}${videoInfo.duration ? '⏱️ ' + videoInfo.duration + ' | ' : ''}${sizeMB}MB | 128kbps | Downloaded by ${getBotName()}`,
          mediaType: 2, thumbnail: thumbnailBuffer,
          sourceUrl: searchQuery, mediaUrl: searchQuery,
          renderLargerThumbnail: true
        }
      };

      await sock.sendMessage(jid, {
        audio: audioBuffer, mimetype: 'audio/mpeg', ptt: false,
        fileName: `${cleanTitle}.mp3`, contextInfo
      }, { quoted: m });

      await sock.sendMessage(jid, {
        document: audioBuffer, mimetype: 'audio/mpeg',
        fileName: `${cleanTitle}.mp3`,
        contextInfo: { externalAdReply: { ...contextInfo.externalAdReply, body: `📄 Document | ${sizeMB}MB | Downloaded by ${getBotName()}` } }
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [PLAY] Sent: "${trackTitle}" (${sizeMB}MB)`);

    } catch (err) {
      console.error(`❌ [PLAY] ${err.message}`);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ Error: ${err.message}` }, { quoted: m });
    }
  }
};
