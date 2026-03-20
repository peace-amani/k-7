import { createRequire } from 'module';
import axios from 'axios';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setMusicSession } from '../../lib/musicSession.js';
import { queryXWolfAudio, xwolfSearch, downloadMediaBuffer } from '../../lib/xwolfApi.js';
import { queryKeithAudio } from '../../lib/keithApi.js';

const require = createRequire(import.meta.url);
let giftedBtns;
try { giftedBtns = require('gifted-btns'); } catch (e) {}

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

      const isUrl = /^https?:\/\//i.test(searchQuery);
      let videoId = '';
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

          if (isButtonModeEnabled() && giftedBtns?.sendInteractiveMessage) {
            const videos = items.map(v => ({
              url: `https://youtube.com/watch?v=${v.id}`,
              title: v.title,
              author: v.channelTitle || '',
              duration: v.duration || '',
              videoId: v.id,
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
                text: `🎵 *${videoInfo.title}*\n👤 ${videoInfo.channelTitle || 'Unknown'}\n⏱️ ${videoInfo.duration || 'N/A'}\n\n_Result 1 of ${videos.length}_`,
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

      let result = await queryXWolfAudio(searchQuery);
      if (!result.success) result = await queryKeithAudio(searchQuery);

      if (!result.success) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ All download services are currently unavailable. Please try again later.` }, { quoted: m });
      }

      const { data, endpoint } = result;
      const trackTitle = data.title || videoInfo.title || 'Audio';
      const quality    = data.quality || '192kbps';
      const thumbUrl   = data.thumbnail || videoInfo.thumbnail || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null);

      console.log(`🎵 [PLAY] Found via ${endpoint}: ${trackTitle}`);

      const audioBuffer = await downloadMediaBuffer(data.download_url);
      if (!audioBuffer) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Failed to download audio. Please try again.` }, { quoted: m });
      }

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
      console.log(`✅ [PLAY] Success: "${trackTitle}" via ${endpoint} (${sizeLabel})`);

    } catch (error) {
      console.error('❌ [PLAY] ERROR:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` }, { quoted: m });
    }
  }
};
