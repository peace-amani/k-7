import axios from 'axios';

export default {
  name: "ilama",
  aliases: ["llama", "ai", "ask", "chat"],
  category: "ai",
  description: "AI chatbot powered by Llama",
  
  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    
    // Check if query is provided
    if (args.length === 0) {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🤖 *LLAMA AI* ⌋\n├─⊷ *${PREFIX}ilama <question>*\n│  └⊷ Ask Llama AI anything\n├─⊷ *${PREFIX}llama <question>*\n│  └⊷ Alias for ilama\n╰───`
      }, { quoted: m });
    }

    const query = args.join(' ');
    const encodedQuery = encodeURIComponent(query);
    
    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      // Call Llama API
      const apiUrl = `https://apiskeith.vercel.app/ai/ilama?q=${encodedQuery}`;
      
      console.log(`[ILAMA] Query: "${query}"`);
      
      const response = await axios.get(apiUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'WolfBot/1.0',
          'Accept': 'application/json'
        }
      });

      if (!response.data?.status || !response.data.result) {
        throw new Error('No valid response from AI');
      }

      const aiResponse = response.data.result;
      
      // Format AI response
      let formattedResponse = `🤖 *LLAMA AI RESPONSE*\n\n`;
      formattedResponse += `💭 *Your Question:*\n${query}\n\n`;
      formattedResponse += `💡 *AI Answer:*\n${aiResponse}\n\n`;
      formattedResponse += `━━━━━━━━━━━━━━━━━━━━\n`;
      formattedResponse += `🎯 *Model:* Llama AI\n`;
     // formattedResponse += `✨ *Powered by:* apiskeith.vercel.app`;

      // Send AI response
      await sock.sendMessage(jid, {
        text: formattedResponse
      }, { quoted: m });

      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

    } catch (error) {
      try {
        const wolfRes = await axios.get(`https://apis.wolf.space/api/ai/llama?q=${encodeURIComponent(query)}`, {
          timeout: 30000, headers: { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' }
        });
        const wolfData = wolfRes.data;
        const wolfText = wolfData?.result || wolfData?.response || wolfData?.answer || wolfData?.text;
        if (wolfText && wolfText.trim()) {
          await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
          return await sock.sendMessage(jid, {
            text: `🦙 *LLAMA AI*\n━━━━━━━━━━━━━━━━━\n${wolfText.trim()}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by WOLF AI_`
          }, { quoted: m });
        }
      } catch {}
      console.error('[ILAMA] Error:', error.message);
      
      let errorMessage = `❌ *AI Query Failed*\n\n`;
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage += `• AI service is unavailable\n`;
        errorMessage += `• Try again later\n\n`;
      } else if (error.response) {
        if (error.response.status === 404) {
          errorMessage += `• API endpoint not found\n\n`;
        } else if (error.response.status === 500) {
          errorMessage += `• AI server error\n`;
          errorMessage += `• Try rephrasing your question\n\n`;
        } else {
          errorMessage += `• API Error: ${error.response.status}\n\n`;
        }
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage += `• AI response timeout\n`;
        errorMessage += `• Try simpler question\n`;
        errorMessage += `• AI might be busy\n\n`;
      } else if (error.message.includes('No valid response')) {
        errorMessage += `• AI returned empty response\n`;
        errorMessage += `• Try different wording\n\n`;
      } else {
        errorMessage += `• Error: ${error.message}\n\n`;
      }
      
      errorMessage += `💡 *Tips for better AI responses:*\n`;
      errorMessage += `• Be clear and specific\n`;
      errorMessage += `• Ask one question at a time\n`;
      errorMessage += `• Avoid ambiguous questions\n`;
      errorMessage += `• Use proper English\n\n`;
      
      errorMessage += `📌 *Usage:* \`${PREFIX}ilama your question\`\n`;
      errorMessage += `📝 *Example:* \`${PREFIX}ilama What is artificial intelligence?\``;
      
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