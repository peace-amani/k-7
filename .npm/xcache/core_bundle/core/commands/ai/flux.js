import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBotName } from '../../lib/botname.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: "flux",
  aliases: ["fluxai", "imageai", "generate", "aiimage"],
  category: "ai",
  description: "Generate an image using Flux AI",
  
  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    
    // Check if query is provided
    if (args.length === 0) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🎨 *FLUX AI* ⌋\n├─⊷ *${PREFIX}flux <prompt>*\n│  └⊷ Generate AI image from text\n├─⊷ *${PREFIX}fluxai <prompt>*\n│  └⊷ Alias for flux\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    const query = args.join(' ');
    const encodedQuery = encodeURIComponent(query);
    
    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      // Call Flux API with arraybuffer response
      const apiUrl = `https://apiskeith.vercel.app/ai/flux?q=${encodedQuery}`;
      
      console.log(`[FLUX] Generating image for: "${query}"`);
      console.log(`[FLUX] API URL: ${apiUrl}`);
      
      const response = await axios.get(apiUrl, {
        responseType: 'arraybuffer',
        timeout: 60000, // 60 second timeout
        headers: {
          'User-Agent': 'WolfBot/1.0',
          'Accept': 'image/jpeg,image/png'
        }
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('Empty response from AI');
      }

      console.log(`[FLUX] Received image data: ${response.data.length} bytes`);

      // Create temp directory if it doesn't exist
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Generate unique filename
      const timestamp = Date.now();
      const filename = `flux_${timestamp}.jpg`;
      const filePath = path.join(tempDir, filename);

      // Save image to file
      fs.writeFileSync(filePath, response.data);
      console.log(`[FLUX] Image saved to: ${filePath}`);

      // Send the generated image
      await sock.sendMessage(jid, {
        image: fs.readFileSync(filePath),
        caption: `🎨 *FLUX AI Generated Image*\n\n_Created by ${getBotName()}_`
      }, { quoted: m });

      // Delete the temporary file
      fs.unlinkSync(filePath);
      console.log(`[FLUX] Temporary file deleted: ${filePath}`);

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

    } catch (error) {
      console.error('[FLUX] Error:', error.message);
      
      let errorMessage = `❌ *Image Generation Failed*\n\n`;
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage += `• Flux API is unavailable\n`;
        errorMessage += `• Try again later\n\n`;
      } else if (error.response) {
        if (error.response.status === 404) {
          errorMessage += `• API endpoint not found\n\n`;
        } else if (error.response.status === 500) {
          errorMessage += `• AI server error\n`;
          errorMessage += `• Try different prompt\n\n`;
        } else {
          errorMessage += `• API Error: ${error.response.status}\n\n`;
        }
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage += `• Generation timeout (60s)\n`;
        errorMessage += `• Try simpler prompt\n`;
        errorMessage += `• Server might be busy\n\n`;
      } else if (error.message.includes('Empty response')) {
        errorMessage += `• AI returned empty image\n`;
        errorMessage += `• Try different prompt\n\n`;
      } else {
        errorMessage += `• Error: ${error.message}\n\n`;
      }
      
      errorMessage += `💡 *Tips for better results:*\n`;
      errorMessage += `• Be descriptive with your prompt\n`;
      errorMessage += `• Avoid very complex requests\n`;
      errorMessage += `• Try English prompts\n`;
      errorMessage += `• Keep prompts under 100 characters\n\n`;
      
      errorMessage += `📌 *Usage:* \`${PREFIX}flux your prompt\`\n`;
      errorMessage += `📝 *Example:* \`${PREFIX}flux cyberpunk city\``;
      
      await sock.sendMessage(jid, {
        text: errorMessage
      }, { quoted: m });
      
      // Send error reaction
      await sock.sendMessage(jid, {
        react: { text: '❌', key: m.key }
      });
    }
  }
};