import axios from "axios";
import yts from "yt-search";
import { getOwnerName } from '../../lib/menuHelper.js';

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
  name: "ytv",
  description: "Download YouTube videos",
  category: "Downloader",
  async execute(sock, m, args, prefix) {
    const jid = m.key.remoteJid;

    try {
      if (args.length === 0) {
        await sock.sendMessage(jid, { 
          text: `╭─⌈ 🎬 *YTV DOWNLOADER* ⌋\n│\n├─⊷ *${prefix}ytv <video name>*\n│  └⊷ Download video\n├─⊷ *${prefix}ytv <YouTube URL>*\n│  └⊷ Download from link\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
        }, { quoted: m });
        return;
      }

      const searchQuery = args.join(" ");
      console.log(`🎬 [YTV] Request: ${searchQuery}`);

      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      let videoUrl = '';
      let videoTitle = '';
      let videoId = '';
      
      if (searchQuery.match(/(youtube\.com|youtu\.be)/i)) {
        videoUrl = searchQuery;
        videoId = videoUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i)?.[1] || '';
        
        if (videoId) {
          try {
            const { videos } = await yts({ videoId });
            if (videos && videos.length > 0) {
              videoTitle = videos[0].title;
            }
          } catch (e) {}
        }
        if (!videoTitle) videoTitle = "YouTube Video";
      } else {
        try {
          const { videos: ytResults } = await yts(searchQuery);
          if (!ytResults || ytResults.length === 0) {
            await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
            await sock.sendMessage(jid, { 
              text: `❌ No videos found for "${searchQuery}"`
            }, { quoted: m });
            return;
          }
          videoUrl = ytResults[0].url;
          videoTitle = ytResults[0].title;
          videoId = ytResults[0].videoId;
        } catch (searchError) {
          console.error("❌ [YTV] Search error:", searchError);
          await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
          await sock.sendMessage(jid, { 
            text: `❌ Search failed. Try direct YouTube link.`
          }, { quoted: m });
          return;
        }
      }

      console.log(`🎬 [YTV] Found: ${videoTitle} - ${videoUrl}`);
      await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });

      let videoBuffer = null;
      let sourceUsed = '';

      try {
        const wolfRes = await axios.get(`${WOLF_API}?url=${encodeURIComponent(videoUrl)}`, { timeout: 30000 });
        const apiData = wolfRes.data;

        const downloadSources = [];

        if (apiData?.downloadUrl && apiData.downloadUrl !== 'In Processing...' && apiData.downloadUrl.startsWith('http')) {
          downloadSources.push({ url: apiData.downloadUrl, label: 'Wolf Direct' });
        }

        if (apiData?.streamUrl) {
          const streamUrl = apiData.streamUrl.replace('http://', 'https://');
          downloadSources.push({ url: streamUrl, label: 'Wolf Stream' });
        }

        downloadSources.push({ url: `${WOLF_STREAM}?url=${encodeURIComponent(videoUrl)}`, label: 'Wolf Stream Q' });

        for (const source of downloadSources) {
          try {
            console.log(`🎬 [YTV] Trying: ${source.label}`);
            videoBuffer = await downloadAndValidate(source.url);
            sourceUsed = source.label;
            break;
          } catch (err) {
            console.log(`🎬 [YTV] ${source.label} failed: ${err.message}`);
            continue;
          }
        }
      } catch (err) {
        console.log(`🎬 [YTV] WOLF API failed: ${err.message}`);
      }

      if (!videoBuffer) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        await sock.sendMessage(jid, { 
          text: `❌ Video download failed. Try again later.`
        }, { quoted: m });
        return;
      }

      const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);

      if (parseFloat(fileSizeMB) > 99) {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        await sock.sendMessage(jid, { 
          text: `❌ Video too large: ${fileSizeMB}MB\nMax size: 99MB`
        }, { quoted: m });
        return;
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

      const cleanTitle = videoTitle.replace(/[^\w\s.-]/gi, '').substring(0, 50);

      await sock.sendMessage(jid, {
        video: videoBuffer,
        mimetype: 'video/mp4',
        caption: `🎬 ${videoTitle}\n📦 ${fileSizeMB}MB`,
        fileName: `${cleanTitle}.mp4`,
        thumbnail: thumbnailBuffer,
        gifPlayback: false
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
      console.log(`✅ [YTV] Success: ${videoTitle} (${fileSizeMB}MB) [${sourceUsed}]`);

    } catch (error) {
      console.error("❌ [YTV] Fatal error:", error);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      await sock.sendMessage(jid, { 
        text: `❌ Error: ${error.message}`
      }, { quoted: m });
    }
  },
};
