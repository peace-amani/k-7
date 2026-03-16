// import axios from 'axios';
// import { createWriteStream, existsSync, mkdirSync } from 'fs';
// import { promisify } from 'util';
// import { exec } from 'child_process';
// import fs from 'fs';
// import { getUserCaption } from './tiktok.js'; // Import caption from TikTok module if you want consistency

// const execAsync = promisify(exec);

// export default {
//   name: "facebook",
//   aliases: ["fb", "fbdl"], // Add aliases for convenience
//   description: "Download Facebook videos",
//   async execute(sock, m, args) {
//     const jid = m.key.remoteJid;
//     const userId = m.key.participant || m.key.remoteJid;

//     try {
//       if (!args[0]) {
//         await sock.sendMessage(jid, { 
//           text: `📥 *Facebook Video Downloader*\n\nUsage: fb <facebook-url>\n\nExamples:\n• fb https://fb.watch/xyz\n• fb https://www.facebook.com/username/videos/123456\n• fb https://fb.com/reel/xyz123\n\n📝 *Note:* Supports Facebook, Facebook Watch, and Reels` 
//         }, { quoted: m });
//         return;
//       }

//       const url = args[0];
      
//       if (!isValidFacebookUrl(url)) {
//         await sock.sendMessage(jid, { 
//           text: `❌ Invalid Facebook URL\n\nSupported formats:\n• https://fb.watch/...\n• https://facebook.com/.../videos/...\n• https://fb.com/reel/...\n• https://www.facebook.com/watch/?v=...` 
//         }, { quoted: m });
//         return;
//       }

//       await sock.sendMessage(jid, { 
//         text: `⏳ *Processing...*\n\nFetching video from Facebook...` 
//       }, { quoted: m });

//       const result = await downloadFacebook(url);
      
//       if (!result.success) {
//         await sock.sendMessage(jid, { 
//           text: `❌ Download failed: ${result.error || 'Unknown error'}\n\nTry a different link or check if the video is publicly accessible.` 
//         }, { quoted: m });
//         return;
//       }

//       const { videoPath, videoInfo } = result;
      
//       // Get user's custom caption or use default
//       const userCaption = getUserCaption(userId) || "WolfBot is the Alpha";
      
//       // Add video info to caption if available
//       let caption = userCaption;
//       if (videoInfo && videoInfo.title) {
//         caption = `${videoInfo.title}\n\n${userCaption}`;
//       }

//       try {
//         // Read video file into buffer
//         const videoData = fs.readFileSync(videoPath);
//         const fileSize = fs.statSync(videoPath).size;
//         console.log(`📊 [FACEBOOK] Video size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
        
//         // Send video
//         await sock.sendMessage(jid, {
//           video: videoData,
//           caption: caption,
//           mimetype: 'video/mp4',
//           fileName: `facebook_video.mp4`
//         }, { quoted: m });

//         console.log(`✅ [FACEBOOK] Video sent successfully`);

//         // DELETE TEMP FILE IMMEDIATELY AFTER SENDING
//         if (existsSync(videoPath)) {
//           fs.unlinkSync(videoPath);
//           console.log(`🧹 [FACEBOOK] Cleaned up temp video: ${videoPath}`);
//         }

//       } catch (sendError) {
//         console.error('❌ [FACEBOOK] Error sending video:', sendError);
        
//         // Try to send as document if video sending fails (for larger files)
//         if (sendError.message.includes('too large') || sendError.message.includes('size')) {
//           try {
//             const videoData = fs.readFileSync(videoPath);
//             await sock.sendMessage(jid, {
//               document: videoData,
//               fileName: 'facebook_video.mp4',
//               mimetype: 'video/mp4'
//             }, { quoted: m });
//             console.log(`✅ [FACEBOOK] Video sent as document`);
//           } catch (docError) {
//             await sock.sendMessage(jid, { 
//               text: `❌ Video is too large to send. Size: ${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(2)}MB` 
//             }, { quoted: m });
//           }
//         }
        
//         // Cleanup
//         if (existsSync(videoPath)) {
//           fs.unlinkSync(videoPath);
//           console.log(`🧹 [FACEBOOK] Cleaned up failed send: ${videoPath}`);
//         }
//       }

//     } catch (error) {
//       console.error('❌ [FACEBOOK] Command error:', error);
//       await sock.sendMessage(jid, { 
//         text: `❌ Error: ${error.message}\n\nPlease try again or use a different link.` 
//       }, { quoted: m });
//     }
//   },
// };

// // Helper function to extract Facebook video ID
// function extractFacebookVideoId(url) {
//   const patterns = [
//     /(?:v=|\/)([0-9]+)/, // ?v= or /video/123456
//     /fb\.watch\/([a-zA-Z0-9_-]+)/, // fb.watch/abc123
//     /reel\/([a-zA-Z0-9_-]+)/, // reel/abc123
//     /video\/([0-9]+)/, // video/123456
//     /watch\/\?v=([0-9]+)/ // watch/?v=123456
//   ];
  
//   for (const pattern of patterns) {
//     const match = url.match(pattern);
//     if (match && match[1]) {
//       return match[1];
//     }
//   }
//   return null;
// }

// function isValidFacebookUrl(url) {
//   const patterns = [
//     /https?:\/\/(www\.|m\.)?facebook\.com\/.*/i,
//     /https?:\/\/(www\.|m\.)?fb\.com\/.*/i,
//     /https?:\/\/(www\.|m\.)?fb\.watch\/.*/i,
//     /https?:\/\/(www\.)?facebook\.com\/watch\/.*/i,
//     /https?:\/\/(www\.)?facebook\.com\/reel\/.*/i
//   ];
//   return patterns.some(pattern => pattern.test(url));
// }

// async function downloadFacebook(url) {
//   try {
//     const tempDir = './temp/facebook';
//     if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

//     const timestamp = Date.now();
//     const videoPath = `${tempDir}/fb_${timestamp}.mp4`;

//     // Try multiple download methods in order
//     const methods = [
//       downloadWithYtDlp,     // Method 1: yt-dlp (most reliable)
//       downloadWithSnapTik,   // Method 2: SnapTik API
//       downloadWithSaveFrom   // Method 3: SaveFrom API
//     ];

//     for (const method of methods) {
//       try {
//         console.log(`[FACEBOOK] Trying method: ${method.name}`);
//         const result = await method(url, videoPath);
//         if (result.success) {
//           return result;
//         }
//       } catch (error) {
//         console.log(`[FACEBOOK] Method ${method.name} failed:`, error.message);
//         continue;
//       }
//     }

//     return { 
//       success: false, 
//       error: 'All download methods failed. Try using yt-dlp locally.' 
//     };

//   } catch (error) {
//     console.error('❌ [FACEBOOK] Download error:', error);
//     return { success: false, error: error.message };
//   }
// }

// // Method 1: yt-dlp (Most reliable)
// async function downloadWithYtDlp(url, videoPath) {
//   try {
//     // Check if yt-dlp is installed
//     try {
//       await execAsync('yt-dlp --version');
//     } catch {
//       return { success: false, error: 'yt-dlp not installed' };
//     }

//     console.log(`[FACEBOOK] Downloading with yt-dlp: ${url}`);
    
//     // Get video info first
//     const infoResult = await execAsync(`yt-dlp --dump-json "${url}"`);
//     const videoInfo = JSON.parse(infoResult.stdout);
    
//     // Download the video
//     await execAsync(`yt-dlp -f "best[ext=mp4]" --no-playlist -o "${videoPath}" "${url}"`);
    
//     // Verify download
//     if (existsSync(videoPath) && fs.statSync(videoPath).size > 0) {
//       const fileSize = fs.statSync(videoPath).size;
//       console.log(`✅ [FACEBOOK] yt-dlp successful: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
      
//       return { 
//         success: true, 
//         videoPath,
//         videoInfo: {
//           title: videoInfo.title || 'Facebook Video',
//           duration: videoInfo.duration || null,
//           uploader: videoInfo.uploader || null
//         }
//       };
//     } else {
//       throw new Error('yt-dlp download failed');
//     }
    
//   } catch (error) {
//     console.error('❌ [FACEBOOK] yt-dlp error:', error);
//     return { success: false, error: error.message };
//   }
// }

// // Method 2: SnapTik API
// async function downloadWithSnapTik(url, videoPath) {
//   try {
//     console.log(`[FACEBOOK] Using SnapTik API`);
    
//     const apiUrl = `https://snaptik.app/abc.php?url=${encodeURIComponent(url)}`;
//     const response = await axios.get(apiUrl, {
//       headers: {
//         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
//         'Accept': 'application/json',
//       },
//       timeout: 30000
//     });

//     if (response.data && response.data.data && response.data.data.play) {
//       const videoUrl = response.data.data.play;
//       await downloadFile(videoUrl, videoPath, 'facebook.com');
      
//       if (existsSync(videoPath) && fs.statSync(videoPath).size > 0) {
//         return { success: true, videoPath };
//       }
//     }
    
//     return { success: false, error: 'No video URL found' };
    
//   } catch (error) {
//     console.error('❌ [FACEBOOK] SnapTik error:', error);
//     return { success: false, error: error.message };
//   }
// }

// // Method 3: SaveFrom API
// async function downloadWithSaveFrom(url, videoPath) {
//   try {
//     console.log(`[FACEBOOK] Using SaveFrom API`);
    
//     const apiUrl = `https://api.savefrom.net/api/convert`;
//     const response = await axios.post(apiUrl, {
//       url: url,
//       host: 'facebook'
//     }, {
//       headers: {
//         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
//         'Content-Type': 'application/json',
//       },
//       timeout: 30000
//     });

//     if (response.data && response.data.url) {
//       const videoUrl = response.data.url;
//       await downloadFile(videoUrl, videoPath, 'facebook.com');
      
//       if (existsSync(videoPath) && fs.statSync(videoPath).size > 0) {
//         return { success: true, videoPath };
//       }
//     }
    
//     return { success: false, error: 'No video URL found' };
    
//   } catch (error) {
//     console.error('❌ [FACEBOOK] SaveFrom error:', error);
//     return { success: false, error: error.message };
//   }
// }

// // Enhanced download function with better headers
// async function downloadFile(url, filePath, referer = 'https://www.facebook.com/') {
//   const writer = createWriteStream(filePath);
  
//   const response = await axios({
//     method: 'GET',
//     url: url,
//     responseType: 'stream',
//     timeout: 120000, // 2 minutes timeout for larger videos
//     headers: {
//       'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
//       'Referer': referer,
//       'Accept': 'video/mp4,video/webm,video/*;q=0.9,*/*;q=0.8',
//       'Accept-Language': 'en-US,en;q=0.9',
//       'Accept-Encoding': 'gzip, deflate, br',
//       'Connection': 'keep-alive',
//       'Sec-Fetch-Dest': 'video',
//       'Sec-Fetch-Mode': 'no-cors',
//       'Sec-Fetch-Site': 'cross-site'
//     },
//     maxContentLength: 500 * 1024 * 1024, // 500MB max
//     maxBodyLength: 500 * 1024 * 1024
//   });

//   let downloadedBytes = 0;
//   const totalBytes = parseInt(response.headers['content-length']) || 0;

//   response.data.on('data', (chunk) => {
//     downloadedBytes += chunk.length;
//     if (totalBytes > 0) {
//       const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
//       if (percent % 10 === 0) {
//         console.log(`📥 Downloading: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(2)}MB)`);
//       }
//     }
//   });

//   response.data.pipe(writer);

//   return new Promise((resolve, reject) => {
//     writer.on('finish', () => {
//       console.log(`✅ Download complete: ${(downloadedBytes / 1024 / 1024).toFixed(2)}MB`);
//       resolve();
//     });
    
//     writer.on('error', (err) => {
//       if (existsSync(filePath)) {
//         fs.unlinkSync(filePath);
//       }
//       reject(err);
//     });
    
//     response.data.on('error', (err) => {
//       if (existsSync(filePath)) {
//         fs.unlinkSync(filePath);
//       }
//       reject(err);
//     });
//   });
// }
















import { createRequire } from 'module';
import axios from 'axios';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import fs from 'fs';
import { isButtonModeEnabled } from '../../lib/buttonMode.js';
import { setActionSession } from '../../lib/actionSession.js';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const _requireFb = createRequire(import.meta.url);
let giftedBtnsFb;
try { giftedBtnsFb = _requireFb('gifted-btns'); } catch (e) {}

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

export default {
  name: 'facebook',
  aliases: ['fb'], // Aliases for the command
  description: 'Download Facebook videos',
  category: 'downloader',

  async execute(sock, m, args, PREFIX) {
    PREFIX = PREFIX || '.';
    console.log('📘 [FACEBOOK] Command triggered');
    
    const jid = m.key.remoteJid;
    const prefix = ','; // Your bot's prefix
    
    if (!args || !args[0]) {
      await sock.sendMessage(jid, { 
        text: `╭─⌈ 📘 *FACEBOOK DOWNLOADER* ⌋\n│\n├─⊷ *${prefix}facebook <url>*\n│  └⊷ Download video from Facebook\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*` 
      }, { quoted: m });
      return;
    }

    const url = args[0];
    console.log(`📘 [FACEBOOK] URL: ${url}`);
    
    // Validate Facebook URL - More comprehensive patterns
    const facebookPatterns = [
      /https?:\/\/(?:www\.|m\.)?facebook\.com\/.+\/videos\/.+/i,
      /https?:\/\/(?:www\.|m\.)?facebook\.com\/watch\/?/i,
      /https?:\/\/(?:www\.|m\.)?fb\.watch\/.+/i,
      /https?:\/\/(?:www\.)?facebook\.com\/reel\/.+/i,
      /https?:\/\/(?:www\.)?facebook\.com\/share\/r\/.+/i, // Your format
      /https?:\/\/(?:www\.)?facebook\.com\/.+\/video(s)?\/.+/i,
      /https?:\/\/(?:www\.)?facebook\.com\/video\.php\?v=.+/i,
      /https?:\/\/(?:www\.)?facebook\.com\/.+\/posts\/.+/i,
      /https?:\/\/(?:www\.)?facebook\.com\/photo\.php\?v=.+/i,
      /https?:\/\/(?:www\.)?fb\.com\/.+\/videos\/.+/i,
      /https?:\/\/(?:www\.)?facebook\.com\/.+\/permalink\/.+/i
    ];

    const isValidUrl = facebookPatterns.some(pattern => pattern.test(url));
    
    if (!isValidUrl) {
      await sock.sendMessage(jid, { 
        text: `❌ *Invalid Facebook URL*\n\n💡 *Valid formats:*\n• \`https://fb.watch/...\`\n• \`https://facebook.com/share/r/...\`\n• \`https://facebook.com/.../videos/...\`\n• \`https://facebook.com/watch/...\`\n• \`https://facebook.com/reel/...\`\n• \`https://facebook.com/.../posts/...\``
      }, { quoted: m });
      return;
    }

    // Clean the URL - remove any anchors or tracking parameters
    let cleanUrl = url.split('?')[0]; // Remove query parameters
    cleanUrl = cleanUrl.split('#')[0]; // Remove anchors
    
    // If it's a share link, we need to resolve it to get the actual video URL
    if (cleanUrl.includes('/share/r/')) {
      console.log(`📘 [FACEBOOK] Detected share link, attempting to resolve...`);
      try {
        const resolvedUrl = await resolveFacebookShareLink(cleanUrl);
        if (resolvedUrl) {
          cleanUrl = resolvedUrl;
          console.log(`📘 [FACEBOOK] Resolved to: ${cleanUrl}`);
        }
      } catch (e) {
        console.log(`📘 [FACEBOOK] Could not resolve share link:`, e.message);
      }
    }

    // Button mode preview card
    if (isButtonModeEnabled() && giftedBtnsFb) {
      const isReel = cleanUrl.includes('/reel/');
      const isWatch = cleanUrl.includes('/watch') || cleanUrl.includes('fb.watch');
      const mediaType = isReel ? 'Reel' : isWatch ? 'Watch Video' : 'Video';
      const shortUrl = cleanUrl.replace(/^https?:\/\/(www\.)?(facebook\.com|fb\.com|fb\.watch)/, '').split('?')[0].slice(0, 40) || cleanUrl.slice(0, 40);
      const senderClean = (m.key.participant || m.key.remoteJid).split(':')[0].split('@')[0];
      setActionSession(`fb:${senderClean}:${jid.split('@')[0]}`, { url: cleanUrl, mediaType }, 10 * 60 * 1000);
      const cardText = `📘 *Facebook ${mediaType} Found*\n\n🔗 ${shortUrl}\n\n▸ Tap Download to get the video`;
      try {
        await giftedBtnsFb.sendInteractiveMessage(sock, jid, {
          body: { text: cardText },
          footer: { text: getBotName() },
          interactiveButtons: [
            { type: 'quick_reply', display_text: '⬇️ Download', id: `${PREFIX}fbdlget` }
          ]
        }, { quoted: m });
        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
        return;
      } catch (e) {}
    }

    await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

    // Check if message has already been processed
    if (processedMessages.has(m.key.id)) {
      console.log(`📘 [FACEBOOK] Message already processed`);
      return;
    }
    
    processedMessages.add(m.key.id);
    
    // Clean up old message IDs after 5 minutes
    setTimeout(() => {
      processedMessages.delete(m.key.id);
    }, 5 * 60 * 1000);

    try {
      const result = await downloadFacebook(cleanUrl);
      
      if (!result.success) {
        await sock.sendMessage(jid, { 
          text: `❌ *Download failed*\n\n⚠️ *Error:* ${result.error || 'Unknown error'}\n\n💡 *Try:*\n• Make sure video is public\n• Try different link format\n• Use full video URL instead of share link`
        }, { quoted: m });
        return;
      }

      const { videoUrl, videoPath, title, description } = result;
      
      try {
        // Download video to temp file first to check size
        const tempDir = './temp/fb';
        if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
        
        const tempFile = videoPath || `${tempDir}/fb_${Date.now()}.mp4`;
        
        console.log(`📘 [FACEBOOK] Downloading video to: ${tempFile}`);
        await sock.sendMessage(jid, { react: { text: '📥', key: m.key } });
        await downloadToFile(videoUrl, tempFile);
        
        const fileSize = fs.statSync(tempFile).size;
        const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
        
        console.log(`📘 [FACEBOOK] Video size: ${sizeMB}MB`);
        
        // Check WhatsApp size limit
        if (parseFloat(sizeMB) > 16) {
          await sock.sendMessage(jid, { 
            text: `⚠️ *Video too large*\n• Size: ${sizeMB}MB\n• WhatsApp limit: 16MB\n\n💡 *Direct download link:*\n${videoUrl}`
          }, { quoted: m });
          if (existsSync(tempFile)) fs.unlinkSync(tempFile);
          return;
        }
        
        const videoData = fs.readFileSync(tempFile);
        
        // Create caption
        let caption = "📘 *Facebook Video*";
        if (title) {
          caption += `\n\n*${title}*`;
        }
        if (description) {
          caption += `\n${description.substring(0, 100)}${description.length > 100 ? '...' : ''}`;
        }
        
        await sock.sendMessage(jid, {
          video: videoData,
          mimetype: "video/mp4",
          caption: caption
        }, { quoted: m });

        console.log(`✅ [FACEBOOK] Video sent successfully`);
        await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
        
        // Clean up temp file
        if (existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
          console.log(`🧹 [FACEBOOK] Cleaned up temp file: ${tempFile}`);
        }

      } catch (sendError) {
        console.error('❌ [FACEBOOK] Error sending video:', sendError);
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        
        // Cleanup even if sending fails
        if (videoPath && existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
          console.log(`🧹 [FACEBOOK] Cleaned up failed send: ${videoPath}`);
        }
        
        await sock.sendMessage(jid, { 
          text: `❌ *Failed to send video*\n\n💡 *Direct download link:*\n${videoUrl}`
        }, { quoted: m });
      }

    } catch (error) {
      console.error('❌ [FACEBOOK] Command error:', error);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
      
      let errorMsg = `❌ *Download failed*\n\n⚠️ *Error:* ${error.message}`;
      
      if (error.message.includes('timeout')) {
        errorMsg += "\n• Request timed out";
      } else if (error.message.includes('ENOTFOUND')) {
        errorMsg += "\n• Network error";
      } else if (error.message.includes('rate limit')) {
        errorMsg += "\n• Rate limited by Facebook";
      }
      
      errorMsg += "\n\n💡 *Try these alternatives:*\n• https://fbdown.net\n• https://getfvid.com\n• https://fbvideodownloader.com";
      
      await sock.sendMessage(jid, { 
        text: errorMsg
      }, { quoted: m });
    }
  }
};

// Function to resolve Facebook share links to actual video URLs
async function resolveFacebookShareLink(shareUrl) {
  try {
    console.log(`📘 [FACEBOOK] Resolving share link: ${shareUrl}`);
    
    // Follow redirects to get final URL
    const response = await axios.get(shareUrl, {
      maxRedirects: 5,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    
    // Get final URL after redirects
    const finalUrl = response.request?.res?.responseUrl || shareUrl;
    console.log(`📘 [FACEBOOK] Resolved to: ${finalUrl}`);
    
    return finalUrl;
  } catch (error) {
    console.log(`📘 [FACEBOOK] Failed to resolve share link:`, error.message);
    return shareUrl; // Return original if resolution fails
  }
}

// Function to download Facebook video using multiple APIs
async function downloadFacebook(url) {
  try {
    console.log(`📘 [FACEBOOK] Attempting to download: ${url}`);
    
    // Clean URL for API calls
    const cleanUrlForApi = encodeURIComponent(url);
    
    // Try multiple Facebook download APIs
    const apis = [
      // API 1: FBdown API - Most reliable
      {
        name: 'FBdown',
        url: `https://fbdown.net/download.php`,
        method: 'POST',
        data: { URL: url },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://fbdown.net',
          'Referer': 'https://fbdown.net/'
        },
        extract: (data) => {
          // Parse HTML response from fbdown
          const hdMatch = data.match(/href="([^"]+\.mp4)"[^>]*>Download \(HD\)/);
          const sdMatch = data.match(/href="([^"]+\.mp4)"[^>]*>Download \(SD\)/);
          return hdMatch ? hdMatch[1] : (sdMatch ? sdMatch[1] : null);
        }
      },
      
      // API 2: GetFVID API - Good alternative
      {
        name: 'GetFVID',
        url: `https://getfvid.com/downloader`,
        method: 'POST',
        data: `url=${encodeURIComponent(url)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://getfvid.com',
          'Referer': 'https://getfvid.com/'
        },
        extract: (data) => {
          const hdMatch = data.match(/href="([^"]+\.mp4)"[^>]*>Download HD/);
          const sdMatch = data.match(/href="([^"]+\.mp4)"[^>]*>Download SD/);
          return hdMatch ? hdMatch[1] : (sdMatch ? sdMatch[1] : null);
        }
      },
      
      // API 3: Direct API call to video download service
      {
        name: 'VideoDownloader',
        url: `https://api.videodownloaderapi.com/api/fb?url=${cleanUrlForApi}`,
        method: 'GET',
        extract: (data) => {
          try {
            const json = typeof data === 'string' ? JSON.parse(data) : data;
            if (json.url) return json.url;
            if (json.links && json.links.hd) return json.links.hd;
            if (json.links && json.links.sd) return json.links.sd;
          } catch (e) {
            return null;
          }
        }
      },
      
      // API 4: Simple API
      {
        name: 'SimpleAPI',
        url: `https://facebook-video-api.vercel.app/?url=${cleanUrlForApi}`,
        method: 'GET',
        extract: (data) => {
          try {
            const json = typeof data === 'string' ? JSON.parse(data) : data;
            return json.videoUrl || json.url || null;
          } catch (e) {
            return null;
          }
        }
      }
    ];

    let videoUrl = null;
    let apiUsed = null;
    
    // Try each API
    for (const api of apis) {
      try {
        console.log(`📘 [FACEBOOK] Trying ${api.name} API`);
        
        const config = {
          method: api.method,
          url: api.url,
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
            ...api.headers
          }
        };
        
        if (api.method === 'POST' && api.data) {
          config.data = api.data;
        }
        
        const response = await axios(config);
        videoUrl = api.extract(response.data);
        
        if (videoUrl) {
          apiUsed = api.name;
          console.log(`✅ [FACEBOOK] Got video URL from ${api.name}: ${videoUrl.substring(0, 80)}...`);
          break;
        }
      } catch (apiError) {
        console.log(`📘 [FACEBOOK] ${api.name} API failed:`, apiError.message);
        continue;
      }
    }

    if (!videoUrl) {
      throw new Error('Could not extract video URL from any source');
    }

    // Extract video title if available
    let title = null;
    let description = null;
    
    try {
      const pageResponse = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
      });
      
      const html = pageResponse.data;
      
      // Extract title from meta tags
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
      if (titleMatch) {
        title = titleMatch[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'");
      }
      
      // Extract description from meta tags
      const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
      if (descMatch) {
        description = descMatch[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'");
      }
    } catch (e) {
      console.log(`📘 [FACEBOOK] Could not extract metadata:`, e.message);
    }

    return {
      success: true,
      videoUrl,
      title,
      description,
      source: apiUsed
    };
    
  } catch (error) {
    console.error('❌ [FACEBOOK] Download function error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export { downloadFacebook, downloadToFile };

// Function to download file
async function downloadToFile(url, filePath) {
  console.log(`📘 [FACEBOOK DOWNLOAD] Starting download from: ${url.substring(0, 100)}...`);
  
  const writer = createWriteStream(filePath);
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream',
    timeout: 120000, // 2 minute timeout for large files
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.facebook.com/',
      'Accept': 'video/mp4,video/webm,video/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
      'Range': 'bytes=0-'
    }
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      console.log(`✅ [FACEBOOK DOWNLOAD] Finished downloading to: ${filePath}`);
      resolve();
    });
    writer.on('error', (err) => {
      console.error(`❌ [FACEBOOK DOWNLOAD] Write error:`, err.message);
      if (existsSync(filePath)) fs.unlinkSync(filePath);
      reject(err);
    });
    response.data.on('error', (err) => {
      console.error(`❌ [FACEBOOK DOWNLOAD] Response error:`, err.message);
      if (existsSync(filePath)) fs.unlinkSync(filePath);
      reject(err);
    });
  });
}