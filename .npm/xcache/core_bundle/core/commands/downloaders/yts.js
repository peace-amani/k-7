








// import axios from 'axios';
// import yts from 'yt-search';

// export default {
//   name: 'yts',
//   description: 'Search YouTube videos with detailed information',
//   usage: 'yts [search query]',
//   execute: async (sock, msg, args) => {
//     try {
//       if (args.length === 0) {
//         return sock.sendMessage(msg.key.remoteJid, {
//           text: '❌ *Please provide a search query*\n\n📌 *Usage:*\n• `!yts song name`\n• `!yts funny videos`\n• `!yts tutorial 2024`'
//         }, { quoted: msg });
//       }

//       const query = args.join(' ');
      
//       // Send processing message
//       await sock.sendMessage(msg.key.remoteJid, {
//         text: `🔍 *Searching YouTube for:* "${query}"`
//       }, { quoted: msg });

//       // Use yt-search package (more reliable)
//       const searchResults = await searchYouTube(query);
      
//       if (!searchResults || searchResults.length === 0) {
//         return sock.sendMessage(msg.key.remoteJid, {
//           text: '❌ No results found. Try different keywords.'
//         }, { quoted: msg });
//       }

//       // Format results in the requested style
//       let resultText = `📑 *YOUTUBE SEARCH RESULTS:* "${query}"\n\n`;
      
//       searchResults.slice(0, 15).forEach((video, index) => {
//         resultText += `*${index + 1}. ${video.title}*\n`;
//         resultText += `🌐 *URL:* ${video.url}\n`;
//         resultText += `⏱️ *Duration:* ${video.duration}\n`;
//         resultText += `🪟 *Views:* ${formatViews(video.views)}\n`;
//         resultText += `⤴️ *Uploaded:* ${video.ago}\n`;
//         resultText += `🧾 *Channel:* ${video.author.name}\n`;
//         resultText += `\n`;
//       });
      
//       resultText += `🌍 *Tip:* Use !ytplay <url> to download audio\n`;
//       resultText += `🗺️ Use !ytv <url> to download video`;

//       await sock.sendMessage(msg.key.remoteJid, {
//         text: resultText
//       }, { quoted: msg });

//     } catch (error) {
//       console.error('YouTube search error:', error);
//       await sock.sendMessage(msg.key.remoteJid, {
//         text: '❌ Search failed. Please try again later.'
//       }, { quoted: msg });
//     }
//   },
// };

// // Format views count
// function formatViews(views) {
//   if (!views) return 'N/A';
  
//   if (typeof views === 'string') {
//     return views;
//   }
  
//   if (views >= 1000000000) {
//     return (views / 1000000000).toFixed(1) + 'B';
//   } else if (views >= 1000000) {
//     return (views / 1000000).toFixed(1) + 'M';
//   } else if (views >= 1000) {
//     return (views / 1000).toFixed(1) + 'K';
//   }
//   return views.toString();
// }

// // Search YouTube using yt-search package
// async function searchYouTube(query) {
//   try {
//     const search = await yts(query);
//     return search.videos || [];
//   } catch (error) {
//     console.log('yt-search failed:', error.message);
//     return await fallbackSearch(query);
//   }
// }

// // Fallback search using Invidious API
// async function fallbackSearch(query) {
//   const instances = [
//     'https://invidious.fdn.fr',
//     'https://inv.nadeko.net',
//     'https://yewtu.be',
//     'https://invidious.weblibre.org'
//   ];

//   for (const instance of instances) {
//     try {
//       const response = await axios.get(
//         `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
//         { timeout: 8000 }
//       );
      
//       if (response.data && Array.isArray(response.data)) {
//         return response.data.map(video => ({
//           title: video.title,
//           url: `https://youtube.com/watch?v=${video.videoId}`,
//           duration: video.lengthSeconds ? formatDuration(video.lengthSeconds) : 'N/A',
//           views: video.viewCount || 0,
//           ago: video.publishedText || 'N/A',
//           author: { name: video.author || 'Unknown' }
//         }));
//       }
//     } catch (error) {
//       console.log(`Instance ${instance} failed:`, error.message);
//       continue;
//     }
//   }
  
//   return [];
// }

// // Format duration from seconds to HH:MM:SS or MM:SS
// function formatDuration(seconds) {
//   if (!seconds) return 'N/A';
  
//   const hours = Math.floor(seconds / 3600);
//   const minutes = Math.floor((seconds % 3600) / 60);
//   const secs = seconds % 60;
  
//   if (hours > 0) {
//     return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
//   }
//   return `${minutes}:${secs.toString().padStart(2, '0')}`;
// }











































import axios from 'axios';
import yts from 'yt-search';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

export default {
  name: 'yts',
  description: 'Search YouTube videos with detailed information',
  usage: 'yts [search query]',
  execute: async (sock, msg, args) => {
    try {
      if (args.length === 0) {
        return sock.sendMessage(msg.key.remoteJid, {
          text: `╭─⌈ 🔍 *YTS SEARCH* ⌋\n│\n├─⊷ *yts <search query>*\n│  └⊷ Search YouTube videos\n│\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
        }, { quoted: msg });
      }

      const query = args.join(' ');
      
      await sock.sendMessage(msg.key.remoteJid, { react: { text: '⏳', key: msg.key } });

      const searchResults = await searchYouTube(query);
      
      if (!searchResults || searchResults.length === 0) {
        await sock.sendMessage(msg.key.remoteJid, { react: { text: '❌', key: msg.key } });
        return sock.sendMessage(msg.key.remoteJid, {
          text: '❌ No results found. Try different keywords.'
        }, { quoted: msg });
      }

      // Format results in WOLFBOT style
      let resultText = `${getBotName()} "${query}"\n\n`;
      
      // Add quality/format information header
      //resultText += `*📺 Available Qualities:* 144p • 240p • 360p • 480p • 720p • 1080p\n`;
      //resultText += `*🎵 Audio Formats:* MP3 • M4A • AAC • OPUS\n\n`;
      
      searchResults.slice(0, 15).forEach((video, index) => {
        resultText += `*${index + 1}. ${video.title}*\n`;
        resultText += `🅦 *URL:* ${video.url}\n`;
        resultText += `🅞 *Duration:* ${video.duration}\n`;
        resultText += `🅛 *Views:* ${formatViews(video.views)}\n`;
        resultText += `🅕 *Uploaded:* ${video.ago}\n`;
        resultText += `🅑 *Channel:* ${video.author.name}\n`;
        
        // Add quality info if available
        if (video.quality) {
          resultText += `🅞 *Quality:* ${video.quality}\n`;
        }
        
        // Add some pixel art/quality indicators
        const qualityIndicator = getQualityIndicator(video.duration, video.views);
        resultText += `🅣 *Format:* ${qualityIndicator}\n`;
        
        resultText += `\n`;
      });
      
      // WOLFBOT footer with commands
      resultText += `┌───────────────────\n`;
      resultText += `│ ${getBotName()} DOWNLOAD TIPS\n`;
      resultText += `├───────────────────\n`;
      resultText += `│ • Use *.ytplay <url>* for audio (MP3)\n`;
      resultText += `│ • Use *.ytv <url>* for video\n`;
      resultText += `│ • Add *-q 720p* for specific quality\n`;
      resultText += `│ • Add *-f mp4* for video format\n`;
      resultText += `└───────────────────\n\n`;
      resultText += `🎬 *Tip:* Videos may have 360p/720p/1080p options`;

      await sock.sendMessage(msg.key.remoteJid, {
        text: resultText
      }, { quoted: msg });

      await sock.sendMessage(msg.key.remoteJid, { react: { text: '✅', key: msg.key } });

    } catch (error) {
      console.error('YouTube search error:', error);
      await sock.sendMessage(msg.key.remoteJid, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(msg.key.remoteJid, {
        text: '❌ Search failed. Please try again later.'
      }, { quoted: msg });
    }
  },
};

// Format views count
function formatViews(views) {
  if (!views) return 'N/A';
  
  if (typeof views === 'string') {
    return views;
  }
  
  if (views >= 1000000000) {
    return (views / 1000000000).toFixed(1) + 'B';
  } else if (views >= 1000000) {
    return (views / 1000000000).toFixed(1) + 'M';
  } else if (views >= 1000) {
    return (views / 1000).toFixed(1) + 'K';
  }
  return views.toString();
}

// Get quality indicator based on video stats
function getQualityIndicator(duration, views) {
  const viewCount = typeof views === 'number' ? views : 0;
  
  if (viewCount > 1000000) {
    return '1080p HD • 320kbps'; // Popular videos likely have HD
  } else if (viewCount > 100000) {
    return '720p • 256kbps';
  } else if (viewCount > 10000) {
    return '480p • 192kbps';
  }
  
  // Determine by duration - longer videos often have better quality
  if (duration && typeof duration === 'string') {
    const [mins, secs] = duration.split(':').map(Number);
    const totalSeconds = (mins * 60) + (secs || 0);
    
    if (totalSeconds > 600) { // Over 10 minutes
      return '720p/1080p';
    } else if (totalSeconds > 300) { // 5-10 minutes
      return '480p/720p';
    } else if (totalSeconds > 180) { // 3-5 minutes
      return '360p/480p';
    }
  }
  
  return '360p • 128kbps'; // Default
}

// Enhanced search with quality detection
async function searchYouTube(query) {
  try {
    const search = await yts(query);
    const videos = search.videos || [];
    
    // Enhance with quality detection
    return videos.map(video => {
      // Determine likely available qualities based on video metadata
      let quality = '';
      const viewCount = typeof video.views === 'number' ? video.views : parseInt(video.views) || 0;
      
      if (viewCount > 500000) {
        quality = '360p • 720p • 1080p';
      } else if (viewCount > 100000) {
        quality = '360p • 720p';
      } else if (viewCount > 10000) {
        quality = '360p • 480p';
      } else {
        quality = '144p • 360p';
      }
      
      return {
        ...video,
        quality: quality,
        duration: video.duration ? video.duration.timestamp || video.duration.toString() : 'N/A',
        views: video.views || 0,
        ago: video.ago || 'N/A',
        author: { 
          name: video.author ? (video.author.name || video.author) : 'Unknown' 
        }
      };
    });
    
  } catch (error) {
    console.log('yt-search failed:', error.message);
    return await fallbackSearch(query);
  }
}

// Fallback search using Invidious API
async function fallbackSearch(query) {
  const instances = [
    'https://invidious.fdn.fr',
    'https://inv.nadeko.net',
    'https://yewtu.be',
    'https://invidious.weblibre.org'
  ];

  for (const instance of instances) {
    try {
      const response = await axios.get(
        `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
        { timeout: 8000 }
      );
      
      if (response.data && Array.isArray(response.data)) {
        return response.data.map(video => {
          const viewCount = video.viewCount || 0;
          let quality = '';
          
          if (viewCount > 500000) {
            quality = '360p • 720p • 1080p';
          } else if (viewCount > 100000) {
            quality = '360p • 720p';
          } else {
            quality = '144p • 360p';
          }
          
          return {
            title: video.title,
            url: `https://youtube.com/watch?v=${video.videoId}`,
            duration: video.lengthSeconds ? formatDuration(video.lengthSeconds) : 'N/A',
            views: viewCount,
            ago: video.publishedText || 'N/A',
            author: { name: video.author || 'Unknown' },
            quality: quality
          };
        });
      }
    } catch (error) {
      console.log(`Instance ${instance} failed:`, error.message);
      continue;
    }
  }
  
  return [];
}

// Format duration from seconds
function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}