import axios from 'axios';

export default {
  name: 'mistral',
  description: 'Mistral AI - Open-source advanced language model',
  category: 'ai',
  aliases: ['mistralai', 'mst', 'mist', 'mirai', 'mastral'],
  usage: 'mistral [question or request]',
  
  async execute(sock, m, args, PREFIX, extra) {
    const jid = m.key.remoteJid;
    const senderJid = m.key.participant || jid;
    
    // ====== HELP SECTION ======
    if (args.length === 0 || args[0].toLowerCase() === 'help') {
      const helpText = `╭─⌈ 🤖 *MISTRAL AI* ⌋\n├─⊷ *${PREFIX}mistral <question>*\n│  └⊷ Ask Mistral anything\n├─⊷ *${PREFIX}mistralai <question>*\n│  └⊷ Alias for mistral\n├─⊷ *${PREFIX}mst <question>*\n│  └⊷ Alias for mistral\n╰───`;
      
      return sock.sendMessage(jid, { text: helpText }, { quoted: m });
    }

    // ====== SPECIAL COMMANDS ======
    const specialCommands = {
      'code': 'code',
      'program': 'code',
      'python': 'python',
      'js': 'javascript',
      'javascript': 'javascript',
      'java': 'java',
      'cpp': 'cpp',
      'c++': 'cpp',
      'translate': 'translate',
      'lang': 'translate',
      'french': 'french',
      'spanish': 'spanish',
      'german': 'german',
      'write': 'write',
      'story': 'write',
      'poem': 'write',
      'creative': 'creative',
      'explain': 'explain',
      'technical': 'technical',
      'summarize': 'summarize',
      'summary': 'summarize',
      'assist': 'assist',
      'help': 'assist'
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
        case 'code':
          enhancedPrompt = `Generate clean, efficient code. Follow best practices: ${query}`;
          break;
        case 'python':
          enhancedPrompt = `Write Python code. Include comments and error handling: ${query}`;
          break;
        case 'javascript':
          enhancedPrompt = `Write JavaScript/Node.js code. Modern ES6+ syntax: ${query}`;
          break;
        case 'java':
          enhancedPrompt = `Write Java code. Object-oriented design: ${query}`;
          break;
        case 'cpp':
          enhancedPrompt = `Write C++ code. Efficient and optimized: ${query}`;
          break;
        case 'translate':
          enhancedPrompt = `Translate text. If no language specified, translate to English: ${query}`;
          break;
        case 'french':
          enhancedPrompt = `Translate to French: ${query}`;
          break;
        case 'spanish':
          enhancedPrompt = `Translate to Spanish: ${query}`;
          break;
        case 'german':
          enhancedPrompt = `Translate to German: ${query}`;
          break;
        case 'write':
          enhancedPrompt = `Write creatively with engaging style: ${query}`;
          break;
        case 'creative':
          enhancedPrompt = `Be creative and imaginative: ${query}`;
          break;
        case 'explain':
          enhancedPrompt = `Explain clearly with examples: ${query}`;
          break;
        case 'technical':
          enhancedPrompt = `Provide technical explanation with details: ${query}`;
          break;
        case 'summarize':
          enhancedPrompt = `Summarize concisely: ${query}`;
          break;
        case 'assist':
          enhancedPrompt = `Provide helpful assistance: ${query}`;
          break;
      }
    } else {
      enhancedPrompt = query;
    }

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      // ====== API REQUEST (Using Keith's Mistral API) ======
      const apiUrl = 'https://apiskeith.vercel.app/ai/mistral';
      
      console.log(`🤖 Mistral Query [${mode}]: ${query}`);
      
      const response = await axios({
        method: 'GET',
        url: apiUrl,
        params: {
          q: enhancedPrompt || query
        },
        timeout: 35000, // 35 seconds
        headers: {
          'User-Agent': 'WolfBot-Mistral/1.0',
          'Accept': 'application/json',
          'X-Requested-With': 'WolfBot',
          'Referer': 'https://apiskeith.vercel.app/',
          'Cache-Control': 'no-cache'
        },
        validateStatus: function (status) {
          return status >= 200 && status < 500;
        }
      });

      console.log(`✅ Mistral Response status: ${response.status}`);
      
      // ====== PARSE RESPONSE ======
      let aiResponse = '';
      let metadata = {
        creator: 'Keith API',
        model: 'Mistral AI',
        status: true
      };
      
      // Parse Keith API response format
      if (response.data && typeof response.data === 'object') {
        const data = response.data;
        
        // Extract based on Keith API structure
        if (data.status === true && data.result) {
          aiResponse = data.result;
          metadata.model = data.model || 'Mistral AI';
        } else if (data.response) {
          aiResponse = data.response;
        } else if (data.answer) {
          aiResponse = data.answer;
        } else if (data.text) {
          aiResponse = data.text;
        } else if (data.content) {
          aiResponse = data.content;
        } else if (data.message) {
          aiResponse = data.message;
        } else if (data.error) {
          // API returned an error
          throw new Error(data.error || 'Mistral API error');
        } else {
          // Try to extract any text
          aiResponse = extractMistralResponse(data);
        }
      } else if (typeof response.data === 'string') {
        aiResponse = response.data;
      } else {
        throw new Error('Invalid API response format');
      }
      
      // Check if response is empty
      if (!aiResponse || aiResponse.trim() === '') {
        throw new Error('Mistral returned empty response');
      }
      
      // Clean response
      aiResponse = aiResponse.trim();
      
      // Check for error indicators
      if (aiResponse.toLowerCase().includes('error:') || 
          aiResponse.toLowerCase().startsWith('error') ||
          aiResponse.toLowerCase().includes('failed to')) {
        throw new Error(aiResponse);
      }
      
      // Format response based on mode
      aiResponse = formatMistralResponse(aiResponse, mode, query);
      
      // Truncate if too long for WhatsApp
      if (aiResponse.length > 2800) {
        aiResponse = aiResponse.substring(0, 2800) + '\n\n... (response truncated)';
      }

      // ====== FORMAT FINAL MESSAGE ======
      let resultText = `🤖 *MISTRAL AI*\n\n`;
      
      // Mode indicator with emoji
      if (mode !== 'general') {
        const modeIcons = {
          'code': '💻',
          'python': '🐍',
          'javascript': '📜',
          'java': '☕',
          'cpp': '⚡',
          'translate': '🌐',
          'french': '🇫🇷',
          'spanish': '🇪🇸',
          'german': '🇩🇪',
          'write': '✍️',
          'creative': '🎨',
          'explain': '📚',
          'technical': '🔧',
          'summarize': '📋',
          'assist': '🤝'
        };
        const modeDisplay = mode.charAt(0).toUpperCase() + mode.slice(1);
        resultText += `${modeIcons[mode] || '⚡'} *Mode:* ${modeDisplay}\n\n`;
      }
      
      // Query display
      const displayQuery = query.length > 90 ? query.substring(0, 90) + '...' : query;
      resultText += `🎯 *Query:* ${displayQuery}\n\n`;
      
      // Mistral Response
      resultText += `✨ *Mistral Response:*\n${aiResponse}\n\n`;
      
      // Footer with Mistral branding
      resultText += `⚡ *Powered by Mistral AI via Keith API*\n`;
      resultText += `🔓 *Open Source AI Model*`;

      // ====== SEND FINAL ANSWER ======
      await sock.sendMessage(jid, { text: resultText }, { quoted: m });
      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

    } catch (error) {
      try {
        const wolfRes = await axios.get(`https://apis.wolf.space/api/ai/mistral?q=${encodeURIComponent(enhancedPrompt || query)}`, {
          timeout: 30000, headers: { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' }
        });
        const wolfData = wolfRes.data;
        const wolfText = wolfData?.result || wolfData?.response || wolfData?.answer || wolfData?.text;
        if (wolfText && wolfText.trim()) {
          await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
          return await sock.sendMessage(jid, {
            text: `⚡ *MISTRAL AI*\n━━━━━━━━━━━━━━━━━\n${wolfText.trim()}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by WOLF AI_`
          }, { quoted: m });
        }
      } catch {}
      console.error('❌ [Mistral AI] ERROR:', error);
      
      let errorMessage = `❌ *MISTRAL AI ERROR*\n\n`;
      
      if (error.code === 'ECONNREFUSED') {
        errorMessage += `• Mistral API server is down\n`;
        errorMessage += `• Please try again later\n`;
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage += `• Request timed out (35s)\n`;
        errorMessage += `• Mistral is processing complex request\n`;
        errorMessage += `• Try shorter query\n`;
      } else if (error.code === 'ENOTFOUND') {
        errorMessage += `• Cannot connect to Mistral API\n`;
        errorMessage += `• Check internet connection\n`;
      } else if (error.response?.status === 429) {
        errorMessage += `• Rate limit exceeded\n`;
        errorMessage += `• Too many Mistral requests\n`;
        errorMessage += `• Wait 1-2 minutes\n`;
      } else if (error.response?.status === 404) {
        errorMessage += `• Mistral endpoint not found\n`;
        errorMessage += `• API may have changed\n`;
      } else if (error.response?.status === 500) {
        errorMessage += `• Mistral internal error\n`;
        errorMessage += `• Model overloaded\n`;
      } else if (error.response?.status === 400) {
        errorMessage += `• Bad request to Mistral\n`;
        errorMessage += `• Query may be malformed\n`;
      } else if (error.response?.data) {
        // Extract API error
        const apiError = error.response.data;
        if (apiError.error) {
          errorMessage += `• Mistral Error: ${apiError.error}\n`;
        } else if (apiError.message) {
          errorMessage += `• Error: ${apiError.message}\n`;
        } else if (typeof apiError === 'string') {
          errorMessage += `• Error: ${apiError}\n`;
        }
      } else if (error.message) {
        errorMessage += `• Error: ${error.message}\n`;
      }
      
      errorMessage += `\n🔧 *Troubleshooting:*\n`;
      errorMessage += `1. Try simpler/shorter query\n`;
      errorMessage += `2. Wait 1 minute before retry\n`;
      errorMessage += `3. Check query language\n`;
      errorMessage += `4. Use \`${PREFIX}gpt\` as alternative\n`;
      errorMessage += `5. Try different wording\n`;
      
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

// Extract text from Mistral API response
function extractMistralResponse(obj) {
  // Prioritize common response fields
  const priorityFields = ['result', 'response', 'answer', 'text', 'content', 'message', 'output'];
  
  for (const field of priorityFields) {
    if (obj[field] && typeof obj[field] === 'string') {
      return obj[field];
    }
  }
  
  // Check for nested response
  if (obj.data && obj.data.text) {
    return obj.data.text;
  }
  
  // If array with items, join them
  if (Array.isArray(obj) && obj.length > 0) {
    return obj.map(item => 
      typeof item === 'string' ? item : 
      item.text ? item.text : JSON.stringify(item)
    ).join('\n');
  }
  
  // Check for choices format (OpenAI-like)
  if (obj.choices && Array.isArray(obj.choices) && obj.choices[0]) {
    const choice = obj.choices[0];
    if (choice.text) return choice.text;
    if (choice.message && choice.message.content) return choice.message.content;
  }
  
  // Last resort: stringify with limit
  return JSON.stringify(obj, null, 2).substring(0, 2000);
}

// Format Mistral response based on mode
function formatMistralResponse(text, mode, originalQuery) {
  if (!text) return 'No response available';
  
  // Clean up
  text = text.trim();
  
  // Remove excessive markdown for WhatsApp
  text = cleanMarkdown(text);
  
  // Special formatting based on mode
  switch(mode) {
    case 'code':
    case 'python':
    case 'javascript':
    case 'java':
    case 'cpp':
      text = formatCodeResponse(text, mode);
      break;
    case 'translate':
    case 'french':
    case 'spanish':
    case 'german':
      text = formatTranslationResponse(text, mode);
      break;
    case 'write':
    case 'creative':
      text = formatCreativeResponse(text);
      break;
    case 'explain':
    case 'technical':
      text = formatExplanationResponse(text);
      break;
    case 'summarize':
      text = formatSummaryResponse(text);
      break;
    default:
      text = formatGeneralResponse(text);
  }
  
  // Ensure proper spacing
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return text;
}

// Clean markdown for WhatsApp
function cleanMarkdown(text) {
  // Remove bold/italic but keep text
  text = text.replace(/\*\*(.*?)\*\*/g, '$1');
  text = text.replace(/\*(.*?)\*/g, '$1');
  text = text.replace(/__(.*?)__/g, '$1');
  text = text.replace(/~~(.*?)~~/g, '$1');
  
  // Handle headers
  text = text.replace(/^#{1,6}\s*/gm, '');
  
  // Handle links but keep URL
  text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');
  
  return text;
}

// Format code responses
function formatCodeResponse(text, language) {
  // Preserve code blocks
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  
  text = text.replace(codeBlockRegex, (match, lang, code) => {
    const detectedLang = lang || language || 'code';
    const langEmoji = {
      'python': '🐍',
      'javascript': '📜',
      'js': '📜',
      'java': '☕',
      'cpp': '⚡',
      'c++': '⚡',
      'html': '🌐',
      'css': '🎨',
      'sql': '🗄️',
      'bash': '🐚',
      'shell': '🐚'
    }[detectedLang.toLowerCase()] || '💻';
    
    return `${langEmoji} *${detectedLang.toUpperCase()} CODE:*\n\`\`\`${detectedLang}\n${code.trim()}\n\`\`\``;
  });
  
  // If no code blocks but looks like code, add them
  if (!text.includes('```') && isLikelyCode(text)) {
    text = `💻 *${language.toUpperCase()} CODE:*\n\`\`\`${language}\n${text}\n\`\`\``;
  }
  
  return text;
}

// Check if text looks like code
function isLikelyCode(text) {
  const codeIndicators = [
    'function', 'def ', 'class ', 'import ', 'export ', 'const ', 'let ', 'var ',
    'if (', 'for (', 'while (', 'return ', 'print(', 'console.log', 'System.out',
    'public ', 'private ', 'int ', 'string ', 'bool', '#include', 'using '
  ];
  
  const lowerText = text.toLowerCase();
  let score = 0;
  
  for (const indicator of codeIndicators) {
    if (lowerText.includes(indicator)) {
      score++;
      if (score >= 2) return true;
    }
  }
  
  // Check for code patterns
  if (text.includes(';') && text.includes('=')) return true;
  if (text.includes('{') && text.includes('}')) return true;
  if (text.includes('(') && text.includes(')') && text.includes('{')) return true;
  
  return false;
}

// Format translation responses
function formatTranslationResponse(text, language) {
  const langFlags = {
    'french': '🇫🇷',
    'spanish': '🇪🇸',
    'german': '🇩🇪',
    'translate': '🌐'
  };
  
  const flag = langFlags[language] || '🌐';
  const langName = language.charAt(0).toUpperCase() + language.slice(1);
  
  return `${flag} *${langName} Translation:*\n${text}`;
}

// Format creative writing responses
function formatCreativeResponse(text) {
  // Add writing flourish
  if (!text.startsWith('✍️')) {
    text = `✍️ *Creative Writing:*\n${text}`;
  }
  
  // Ensure proper paragraph breaks for stories/poems
  text = text.replace(/([.!?])\s+/g, '$1\n\n');
  
  return text;
}

// Format explanation responses
function formatExplanationResponse(text) {
  if (!text.startsWith('📚')) {
    text = `📚 *Explanation:*\n${text}`;
  }
  
  // Add bullet points for lists
  text = text.replace(/^\s*[-•*]\s+/gm, '• ');
  
  return text;
}

// Format summary responses
function formatSummaryResponse(text) {
  if (!text.startsWith('📋')) {
    text = `📋 *Summary:*\n${text}`;
  }
  
  // Ensure conciseness
  if (text.split(' ').length > 100) {
    const sentences = text.split(/[.!?]+/);
    if (sentences.length > 3) {
      text = sentences.slice(0, 3).join('.') + '.';
    }
  }
  
  return text;
}

// Format general responses
function formatGeneralResponse(text) {
  // Add emoji prefix if not present
  if (!text.startsWith('✨') && !text.startsWith('🤖') && !text.startsWith('⚡')) {
    text = `✨ *Response:*\n${text}`;
  }
  
  return text;
}