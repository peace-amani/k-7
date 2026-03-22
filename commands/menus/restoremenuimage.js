import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { invalidateMenuImageCache } from "./menu.js";
import { invalidateMenuHelperCache } from "../../lib/menuHelper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: "restoremenuimage",
  description: "Restore default menu image or from backup",
  async execute(sock, m, args) {
    const jid = m.key.remoteJid;
    
    // Check if user is bot owner
    const isOwner = m.sender === global.owner || m.sender === process.env.OWNER_NUMBER;
    if (!isOwner) {
      await sock.sendMessage(jid, { 
        text: "❌ Owner only!" 
      }, { quoted: m });
      return;
    }

    let statusMsg;

    try {
      const mediaDir = path.join(__dirname, "media");
      const backupDir = path.join(mediaDir, "backups");
      const wolfbotPath = path.join(mediaDir, "wolfbot.jpg");
      const wolfbotGifPath = path.join(mediaDir, "wolfbot.gif");
      
      // Your default menu image URL
      const defaultImageUrl = "https://i.ibb.co/Gvkt4q9d/Chat-GPT-Image-Feb-21-2026-12-47-33-AM.png";

      // If no arguments, restore to default image from URL
      if (args.length === 0) {
        statusMsg = await sock.sendMessage(jid, { 
          text: "🔄 Downloading default image..." 
        }, { quoted: m });

        try {
          // Download default image from URL
          const response = await axios({
            method: 'GET',
            url: defaultImageUrl,
            responseType: 'arraybuffer',
            timeout: 20000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });

          await sock.sendMessage(jid, { 
            text: "🔄 Downloading default image... ✅\n💾 Saving...",
            edit: statusMsg.key 
          });

          const imageBuffer = Buffer.from(response.data);

          // Create directories if they don't exist
          if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
          }
          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
          }

          // Create backup of current image if it exists
          if (fs.existsSync(wolfbotPath)) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const backupPath = path.join(backupDir, `wolfbot-backup-before-reset-${timestamp}.jpg`);
            try {
              fs.copyFileSync(wolfbotPath, backupPath);
              console.log(`💾 Backup created: ${backupPath}`);
            } catch (backupError) {
              console.log("⚠️ Could not create backup");
            }
          }

          // Remove any GIF menu image when restoring default
          try { if (fs.existsSync(wolfbotGifPath)) fs.unlinkSync(wolfbotGifPath); } catch {}

          // Save the default image
          fs.writeFileSync(wolfbotPath, imageBuffer);
          try { invalidateMenuImageCache(); } catch {}
          try { invalidateMenuHelperCache(); } catch {}
          
          console.log(`✅ Default menu image restored from URL`);

          // Get the restored image for preview
          const restoredImageBuffer = fs.readFileSync(wolfbotPath);
          
          // Edit with final success message
          await sock.sendMessage(jid, { 
            image: restoredImageBuffer,
            caption: `✅ *Default Menu Restored!*\n\nUse ${global.prefix}menu to see it.`,
            edit: statusMsg.key 
          });

        } catch (downloadError) {
          await sock.sendMessage(jid, { 
            text: "❌ Failed to download default image",
            edit: statusMsg.key 
          });
          return;
        }
        return;
      }

      // If argument is "list" or "backups", show available backups
      if (args[0] === 'list' || args[0] === 'backups') {
        if (!fs.existsSync(backupDir)) {
          await sock.sendMessage(jid, { 
            text: "❌ No backups found!" 
          }, { quoted: m });
          return;
        }

        const backupFiles = fs.readdirSync(backupDir)
          .filter(file => file.startsWith('wolfbot-backup-') && (file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.webp') || file.endsWith('.gif')))
          .sort()
          .reverse()
          .slice(0, 10);

        if (backupFiles.length === 0) {
          await sock.sendMessage(jid, { 
            text: "📁 No backups found!" 
          }, { quoted: m });
          return;
        }

        let backupList = `📁 *Backups* (${backupFiles.length})\n\n`;
        
        backupFiles.forEach((file, index) => {
          const filePath = path.join(backupDir, file);
          const stats = fs.statSync(filePath);
          const size = (stats.size / 1024 / 1024).toFixed(2);
          const isGif = file.endsWith('.gif');
          
          backupList += `${index + 1}. ${isGif ? '🎞️' : '🖼️'} ${file}\n`;
          backupList += `   📏 ${size}MB\n\n`;
        });

        backupList += `💡 ${global.prefix}restoremenuimage <number>`;

        await sock.sendMessage(jid, { text: backupList }, { quoted: m });
        return;
      }

      // If specific backup number is provided
      const index = parseInt(args[0]) - 1;
      
      // Check if backup directory exists
      if (!fs.existsSync(backupDir)) {
        await sock.sendMessage(jid, { 
          text: "❌ No backups found!" 
        }, { quoted: m });
        return;
      }

      const backupFiles = fs.readdirSync(backupDir)
        .filter(file => file.startsWith('wolfbot-backup-') && (file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.webp') || file.endsWith('.gif')))
        .sort()
        .reverse();

      if (backupFiles.length === 0) {
        await sock.sendMessage(jid, { 
          text: "❌ No backups found!" 
        }, { quoted: m });
        return;
      }

      if (isNaN(index) || index < 0 || index >= backupFiles.length) {
        await sock.sendMessage(jid, { 
          text: `❌ Invalid! Use 1-${backupFiles.length}` 
        }, { quoted: m });
        return;
      }

      const backupToRestore = backupFiles[index];
      const backupPath = path.join(backupDir, backupToRestore);
      
      statusMsg = await sock.sendMessage(jid, { 
        text: `🔄 Restoring backup...` 
      }, { quoted: m });

      const isGifBackup = backupToRestore.endsWith('.gif');

      if (isGifBackup) {
        try { if (fs.existsSync(wolfbotPath)) fs.unlinkSync(wolfbotPath); } catch {}
        fs.copyFileSync(backupPath, wolfbotGifPath);
      } else {
        try { if (fs.existsSync(wolfbotGifPath)) fs.unlinkSync(wolfbotGifPath); } catch {}
        fs.copyFileSync(backupPath, wolfbotPath);
      }
      
      try { invalidateMenuImageCache(); } catch {}
      try { invalidateMenuHelperCache(); } catch {}
      console.log(`✅ Menu ${isGifBackup ? 'GIF' : 'image'} restored from backup: ${backupToRestore}`);

      await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (error) {
      console.error("❌ [RESTOREMENUIMAGE] ERROR:", error);
      
      if (statusMsg) {
        await sock.sendMessage(jid, { 
          text: "❌ Restore failed",
          edit: statusMsg.key 
        });
      } else {
        await sock.sendMessage(jid, { 
          text: "❌ Restore failed" 
        }, { quoted: m });
      }
    }
  },
};