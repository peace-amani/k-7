import axios from "axios";
import yts from "yt-search";
import { queryXWolfVideo } from "../../lib/xwolfApi.js";
import { getBotName } from '../../lib/botname.js';

const WOLF_API = "https://apis.xwolf.space/download/mp4";
const WOLF_STREAM = "https://apis.xwolf.space/download/stream/mp4";

async function downloadAndValidate(downloadUrl, timeout = 120000) {
  const response = await axios({
    url: downloadUrl,
    method: 'GET',
    responseType: 'arraybuffer',
    timeout,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    validateStatus: (status) => status >= 200 && status < 400
  });

  const buffer = Buffer.from(response.data);
  if (buffer.length < 5000) throw new Error('File too small, likely not video');

  const headerStr = buffer.slice(0, 50).toString('utf8').toLowerCase();
  if (headerStr.includes('<!doctype') || headerStr.includes('<html') || headerStr.includes('bad gateway')) {
    throw new Error('Received HTML instead of video');
  }

  return buffer;
}

export default {
  name: "video",
  aliases: ["vid"],
  description: "Download YouTube videos",
  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;
    const quoted = m.quoted;
    const quotedText = quoted?.text?.trim() || (m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation)?.trim() || '';

    try {
      const searchQuery = args.length > 0 ? args.join(" ") : quotedText;
      
      if (!searchQuery) {
        return sock.sendMessage(jid, {
          text: `╭─⌈ 🎬 *VIDEO DOWNLOADER* ⌋\n│\n├─⊷ *${prefix}video <name/URL>*\n│  └⊷ Download video from YouTube\n│\n├─⊷ *Reply to a text message*\n│  └⊷ Uses replied text as search\n│\n├─⊷ *Examples:*\n│  └⊷ ${prefix}video funny cats\n│  └⊷ ${prefix}video https://youtube.com/...\n│\n╰⊷ *Powered by ${getBotName()}*`
        }, { quoted: m });
      }

      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const apiUrl = `${WOLF_API}?url=${encodeURIComponent(searchQuery)}`;
      let apiData = null;

      try {
        const response = await axios.get(apiUrl, { timeout: 30000 });
        if (response.data) apiData = response.data;
      } catch (err) {
        console.log(`🎬 [VIDEO] Wolf API failed: ${err.message}`);
      }

      let videoTitle = apiData?.title || apiData?.searchResult?.title || '';
      let videoId = apiData?.videoId || '';
      let youtubeUrl = apiData?.youtubeUrl || '';
      let duration = apiData?.searchResult?.duration || '';

      if (!videoTitle && !searchQuery.startsWith('http')) {
        try {
          const { videos: ytResults } = await yts(searchQuery);
          if (ytResults && ytResults.length > 0) {
            videoTitle = ytResults[0].title;
            videoId = ytResults[0].videoId;
            youtubeUrl = ytResults[0].url;
            duration = ytResults[0].timestamp || '';
          }
        } catch (e) {}
      }

      if (!videoTitle) videoTitle = "YouTube Video";

      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      let videoBuffer = null;
      let sourceUsed = '';

      const downloadSources = [];

      if (apiData?.downloadUrl && apiData.downloadUrl !== 'In Processing...' && apiData.downloadUrl.startsWith('http')) {
        downloadSources.push({ url: apiData.downloadUrl, label: 'Wolf Direct' });
      }

      if (apiData?.streamUrl) {
        const streamUrl = apiData.streamUrl.replace('http://', 'https://');
        downloadSources.push({ url: streamUrl, label: 'Wolf Stream' });
      }

      downloadSources.push({ url: `${WOLF_STREAM}?url=${encodeURIComponent(searchQuery)}`, label: 'Wolf Stream Q' });

      for (const source of downloadSources) {
        try {
          console.log(`🎬 [VIDEO] Trying: ${source.label}`);
          videoBuffer = await downloadAndValidate(source.url);
          sourceUsed = source.label;
          break;
        } catch (err) {
          console.log(`🎬 [VIDEO] ${source.label} failed: ${err.message}`);
          continue;
        }
      }

      if (!videoBuffer) {
        console.log(`🎬 [VIDEO] Primary sources failed, trying xwolf ytmp4/video fallback`);
        const xwolfResult = await queryXWolfVideo(searchQuery);
        if (xwolfResult.success) {
          try {
            videoBuffer = await downloadAndValidate(xwolfResult.data.download_url);
            sourceUsed  = xwolfResult.endpoint;
            if (!videoTitle || videoTitle === 'YouTube Video') videoTitle = xwolfResult.data.title || videoTitle;
          } catch (err) {
            console.log(`🎬 [VIDEO] xwolf fallback failed: ${err.message}`);
          }
        }
      }

      if (!videoBuffer) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { 
          text: `❌ Failed to download video\nTry again later`
        }, { quoted: m });
      }

      const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);

      if (parseFloat(fileSizeMB) > 99) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        return sock.sendMessage(jid, { 
          text: `❌ Video too large (${fileSizeMB}MB)\nMax size: 99MB`
        }, { quoted: m });
      }

      let thumbnailBuffer = null;
      if (videoId) {
        try {
          const thumbResponse = await axios.get(
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            { responseType: 'arraybuffer', timeout: 10000 }
          );
          if (thumbResponse.status === 200) {
            thumbnailBuffer = Buffer.from(thumbResponse.data);
          }
        } catch (e) {}
      }

      await sock.sendMessage(jid, {
        video: videoBuffer,
        caption: `🎬 ${videoTitle}\n${duration ? `⏱️ ${duration} • ` : ''}📦 ${fileSizeMB}MB`,
        mimetype: 'video/mp4',
        thumbnail: thumbnailBuffer
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

    } catch (error) {
      console.error("Video error:", error);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { 
        text: `❌ Error downloading video\nTry again later`
      }, { quoted: m });
    }
  }
};
