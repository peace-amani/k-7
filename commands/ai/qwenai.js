import axios from 'axios';

export default {
  name: 'qwenai',
  description: 'Qwen AI - Advanced AI assistant by Alibaba',
  category: 'ai',
  aliases: ['qwen', 'alibabai', 'qw', 'qai'],
  usage: 'qwenai [question or query]',
  
  async execute(sock, m, args, PREFIX, extra) {
    const jid = m.key.remoteJid;
    const senderJid = m.key.participant || jid;
    
    // ====== HELP SECTION ======
    if (args.length === 0 || args[0].toLowerCase() === 'help') {
      const helpText = `╭─⌈ 🤖 *QWEN AI* ⌋\n├─⊷ *${PREFIX}qwenai <question>*\n│  └⊷ Ask Qwen anything\n├─⊷ *${PREFIX}qwen <question>*\n│  └⊷ Alias for qwenai\n├─⊷ *${PREFIX}qw <question>*\n│  └⊷ Alias for qwenai\n╰───`;
      
      return sock.sendMessage(jid, { text: helpText }, { quoted: m });
    }

    // ====== SPECIAL COMMANDS ======
    const specialCommands = {
      'translate': 'translate',
      'tra': 'translate',
      'tr': 'translate',
      'chat': 'chat',
      'talk': 'chat',
      'write': 'write',
      'compose': 'write',
      'summarize': 'summarize',
      'summary': 'summarize',
      'sum': 'summarize',
      'explain': 'explain',
      'answer': 'answer',
      'ask': 'answer',
      'create': 'create',
      'generate': 'create',
      'brainstorm': 'brainstorm',
      'ideas': 'brainstorm'
    };

    let query = args.join(' ');
    let mode = 'general';
    let enhancedPrompt = '';

    // Check for special command modes
    const firstWord = args[0].toLowerCase();
    if (specialCommands[firstWord]) {
      mode = specialCommands[firstWord];
      query = args.slice(1).join(' ');
      
      switch(mode) {
        case 'translate':
          enhancedPrompt = `Act as translator. Translate to appropriate language: ${query}`;
          break;
        case 'chat':
          enhancedPrompt = `Act as conversational AI. Have natural conversation: ${query}`;
          break;
        case 'write':
          enhancedPrompt = `Act as writer/composer. Write content: ${query}`;
          break;
        case 'summarize':
          enhancedPrompt = `Act as summarizer. Provide concise summary: ${query}`;
          break;
        case 'explain':
          enhancedPrompt = `Act as explainer. Explain clearly: ${query}`;
          break;
        case 'answer':
          enhancedPrompt = `Act as Q&A expert. Answer question: ${query}`;
          break;
        case 'create':
          enhancedPrompt = `Act as content creator. Generate: ${query}`;
          break;
        case 'brainstorm':
          enhancedPrompt = `Act as brainstorming assistant. Provide ideas: ${query}`;
          break;
      }
    } else {
      enhancedPrompt = query;
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      // ====== API REQUEST (Using Keith's QwenAI API) ======
      const apiUrl = 'https://apiskeith.vercel.app/ai/qwenai';
      
      console.log(`🤖 QwenAI Query [${mode}]: ${query}`);
      
      const response = await axios({
        method: 'GET',
        url: apiUrl,
        params: {
          q: enhancedPrompt || query
        },
        timeout: 30000, // 30 seconds
        headers: {
          'User-Agent': 'WhatsApp-Bot/1.0',
          'Accept': 'application/json',
          'X-Requested-With': 'WhatsApp-Bot',
          'Referer': 'https://apiskeith.vercel.app/',
          'Cache-Control': 'no-cache'
        },
        validateStatus: function (status) {
          return status >= 200 && status < 500;
        }
      });

      console.log(`✅ QwenAI Response status: ${response.status}`);
      
      // ====== PARSE RESPONSE ======
      let aiResponse = '';
      let metadata = {
        creator: 'Keith API',
        model: 'Qwen AI',
        status: true
      };
      
      // Parse Keith API response format
      if (response.data && typeof response.data === 'object') {
        const data = response.data;
        
        // Extract based on Keith API structure
        if (data.status === true && data.result) {
          aiResponse = data.result;
          metadata.status = data.status;
        } else if (data.response) {
          aiResponse = data.response;
        } else if (data.answer) {
          aiResponse = data.answer;
        } else if (data.solution) {
          aiResponse = data.solution;
        } else if (data.text) {
          aiResponse = data.text;
        } else if (data.message) {
          aiResponse = data.message;
        } else if (data.error) {
          // API returned an error
          throw new Error(data.error || 'QwenAI API error');
        } else {
          // Try to extract any text
          aiResponse = extractQwenResponse(data);
        }
      } else if (typeof response.data === 'string') {
        aiResponse = response.data;
      } else {
        throw new Error('Invalid API response format');
      }
      
      // Check if response is empty or indicates error
      if (!aiResponse || aiResponse.trim() === '') {
        throw new Error('QwenAI returned empty response');
      }
      
      // Clean and format response
      aiResponse = aiResponse.trim();
      
      // Remove any error indicators
      if (aiResponse.toLowerCase().includes('error') || 
          aiResponse.toLowerCase().includes('failed') ||
          aiResponse.toLowerCase().includes('unavailable')) {
        throw new Error(aiResponse);
      }
      
      // Format based on mode
      aiResponse = formatQwenResponse(aiResponse, mode, query);
      
      // Truncate if too long for WhatsApp
      if (aiResponse.length > 2500) {
        aiResponse = aiResponse.substring(0, 2500) + '\n\n... (response truncated, continue with more specific query)';
      }

      // ====== FORMAT FINAL MESSAGE ======
      let resultText = `🤖 *QWEN AI*\n\n`;
      
      // Mode indicator with emoji
      if (mode !== 'general') {
        const modeIcons = {
          'translate': '🌐',
          'chat': '💬',
          'write': '✍️',
          'summarize': '📝',
          'explain': '📚',
          'answer': '❓',
          'create': '✨',
          'brainstorm': '💡'
        };
        resultText += `${modeIcons[mode] || '⚡'} *Mode:* ${mode.toUpperCase()}\n\n`;
      }
      
      // Query
      const displayQuery = query.length > 80 ? query.substring(0, 80) + '...' : query;
      resultText += `📝 *Query:* ${displayQuery}\n\n`;
      
      // Qwen AI Response
      resultText += `✨ *Qwen AI:*\n${aiResponse}\n\n`;
      
      // Footer
      resultText += `⚡ *Powered by Keith API | Alibaba Qwen AI*`;

      // ====== SEND FINAL ANSWER ======
      await sock.sendMessage(jid, { text: resultText }, { quoted: m });
      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

    } catch (error) {
      try {
        const wolfRes = await axios.get(`https://apis.wolf.space/api/ai/qwen?q=${encodeURIComponent(enhancedPrompt || query)}`, {
          timeout: 30000, headers: { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' }
        });
        const wolfData = wolfRes.data;
        const wolfText = wolfData?.result || wolfData?.response || wolfData?.answer || wolfData?.text;
        if (wolfText && wolfText.trim()) {
          await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
          return await sock.sendMessage(jid, {
            text: `🌐 *QWEN AI*\n━━━━━━━━━━━━━━━━━\n${wolfText.trim()}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by WOLF AI_`
          }, { quoted: m });
        }
      } catch {}
      console.error('❌ [Qwen AI] ERROR:', error);
      
      let errorMessage = `❌ *QWEN AI ERROR*\n\n`;
      
      if (error.code === 'ECONNREFUSED') {
        errorMessage += `• Qwen API server is down\n`;
        errorMessage += `• Please try again later\n`;
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage += `• Request timed out (30s)\n`;
        errorMessage += `• Try simpler query\n`;
      } else if (error.code === 'ENOTFOUND') {
        errorMessage += `• Cannot connect to Qwen AI API\n`;
        errorMessage += `• Check internet connection\n`;
      } else if (error.response?.status === 429) {
        errorMessage += `• Rate limit exceeded\n`;
        errorMessage += `• Too many Qwen requests\n`;
        errorMessage += `• Wait 1-2 minutes\n`;
      } else if (error.response?.status === 404) {
        errorMessage += `• Qwen endpoint not found\n`;
        errorMessage += `• API may have changed\n`;
      } else if (error.response?.status === 500) {
        errorMessage += `• Qwen internal error\n`;
        errorMessage += `• Try different query\n`;
      } else if (error.response?.status === 400) {
        errorMessage += `• Bad request to Qwen AI\n`;
        errorMessage += `• Query may be malformed\n`;
      } else if (error.response?.data) {
        // Extract API error
        const apiError = error.response.data;
        if (apiError.error) {
          errorMessage += `• Qwen Error: ${apiError.error}\n`;
        } else if (apiError.message) {
          errorMessage += `• Error: ${apiError.message}\n`;
        } else if (typeof apiError === 'string') {
          errorMessage += `• Error: ${apiError}\n`;
        }
      } else if (error.message) {
        errorMessage += `• Error: ${error.message}\n`;
      }
      
      errorMessage += `\n🔧 *Troubleshooting:*\n`;
      errorMessage += `1. Use simpler, shorter queries\n`;
      errorMessage += `2. Break complex questions\n`;
      errorMessage += `3. Wait 1 minute before retry\n`;
      errorMessage += `4. Check query formatting\n`;
      errorMessage += `5. Try \`${PREFIX}chatgpt\` or \`${PREFIX}blackbox\` alternatives\n`;
      
      // Try to send error message
      try {
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        await sock.sendMessage(jid, {
          text: errorMessage
        }, { quoted: m });
      } catch (sendError) {
        console.error('Failed to send error message:', sendError);
      }
    }
  },
};

// ====== HELPER FUNCTIONS ======

// Extract text from Qwen AI response
function extractQwenResponse(obj) {
  // Prioritize common response fields
  const priorityFields = ['result', 'response', 'answer', 'text', 'content', 'message', 'output'];
  
  for (const field of priorityFields) {
    if (obj[field] && typeof obj[field] === 'string') {
      return obj[field];
    }
  }
  
  // If no string field found, try to extract from nested objects
  if (obj.data) {
    return extractQwenResponse(obj.data);
  }
  
  // If array with items, join them
  if (Array.isArray(obj) && obj.length > 0) {
    return obj.map(item => 
      typeof item === 'string' ? item : JSON.stringify(item)
    ).join('\n');
  }
  
  // Last resort: stringify with limit
  return JSON.stringify(obj, null, 2).substring(0, 1500);
}

// Format Qwen response based on mode
function formatQwenResponse(text, mode, originalQuery) {
  if (!text) return 'No response available';
  
  // Clean up
  text = text.trim();
  
  // Remove excessive markdown
  text = text.replace(/\*\*(.*?)\*\*/g, '*$1*');
  
  // Handle different modes
  switch(mode) {
    case 'translate':
      text = formatTranslation(text, originalQuery);
      break;
    case 'summarize':
      text = formatSummary(text);
      break;
    case 'brainstorm':
      text = formatIdeas(text);
      break;
    case 'write':
      text = formatWriting(text);
      break;
  }
  
  // Ensure proper line breaks
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return text;
}

// Format translation response
function formatTranslation(text, originalQuery) {
  // Try to detect language or add translation header
  if (!text.includes('Translation:') && !text.includes('Translated:')) {
    return `🌐 *Translation:*\n${text}`;
  }
  return text;
}

// Format summary response
function formatSummary(text) {
  // Add summary header if not present
  if (!text.includes('Summary:') && !text.includes('summary:')) {
    return `📝 *Summary:*\n${text}`;
  }
  return text;
}

// Format brainstorming ideas
function formatIdeas(text) {
  const lines = text.split('\n');
  const formattedLines = [];
  let ideaCount = 1;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && (trimmed.match(/^\d+\./) || trimmed.match(/^[-•*]/) || trimmed.length > 20)) {
      formattedLines.push(`💡 *Idea ${ideaCount++}:* ${trimmed.replace(/^[-•*\d\.\s]+/, '').trim()}`);
    } else {
      formattedLines.push(line);
    }
  }
  
  return formattedLines.join('\n');
}

// Format writing content
function formatWriting(text) {
  // Check if it looks like a story, poem, or structured content
  const isPoem = text.includes('\n\n') && text.split('\n\n').length > 3;
  const isList = text.includes('\n-') || text.includes('\n•') || text.includes('\n*');
  
  if (isPoem) {
    return `✍️ *Creative Writing:*\n\n${text}`;
  } else if (isList) {
    return `📋 *Content Outline:*\n${text}`;
  }
  
  return `📄 *Written Content:*\n${text}`;
}