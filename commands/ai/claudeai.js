import axios from "axios";

export default {
  name: "claudeai",
  category: "AI",
  aliases: ["claude", "anthropic", "claude2", "claude3"],
  description: "Query Claude AI via Keith's API",
  
  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const quoted = m.quoted;
    let query = "";

    // Get query from arguments or quoted message
    if (args.length > 0) {
      query = args.join(" ");
    } else if (quoted && quoted.text) {
      query = quoted.text;
    } else {
      await sock.sendMessage(jid, { 
        text: `╭─⌈ 🧠 *CLAUDE AI* ⌋\n├─⊷ *${PREFIX}claudeai <question>*\n│  └⊷ Ask Claude anything\n├─⊷ *${PREFIX}claude <question>*\n│  └⊷ Alias for claudeai\n├─⊷ *${PREFIX}anthropic <question>*\n│  └⊷ Alias for claudeai\n╰───`}, { quoted: m });
      return;
    }

    console.log(`🧠 [CLAUDE] Query: "${query}"`);

    try {
      // Send initial status
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      // Make API request to Keith's Claude AI API
      const apiUrl = `https://apiskeith.vercel.app/ai/claudeai?q=${encodeURIComponent(query)}`;
      
      console.log(`🌐 [CLAUDE] Calling API: ${apiUrl}`);
      
      const response = await axios({
        method: 'GET',
        url: apiUrl,
        timeout: 35000, // Claude can be slower
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://apiskeith.vercel.app/',
          'Origin': 'https://apiskeith.vercel.app',
          'Cache-Control': 'no-cache'
        },
        validateStatus: function (status) {
          return status >= 200 && status < 500;
        }
      });

      console.log(`✅ [CLAUDE] Response status: ${response.status}`);
      

      // Parse response
      let claudeResponse = '';
      let metadata = {
        creator: 'Anthropic',
        model: 'Claude',
        status: true,
        source: 'Keith API'
      };
      
      if (response.data && typeof response.data === 'object') {
        const data = response.data;
        
        console.log('📊 Claude API Response structure:', Object.keys(data));
        
        // Extract based on Keith API structure
        if (data.status === true && data.result) {
          claudeResponse = data.result;
          console.log('✅ Using data.result');
        } else if (data.response) {
          claudeResponse = data.response;
          console.log('✅ Using data.response');
        } else if (data.answer) {
          claudeResponse = data.answer;
          console.log('✅ Using data.answer');
        } else if (data.text) {
          claudeResponse = data.text;
          console.log('✅ Using data.text');
        } else if (data.content) {
          claudeResponse = data.content;
          console.log('✅ Using data.content');
        } else if (data.message) {
          claudeResponse = data.message;
          console.log('✅ Using data.message');
        } else if (data.data) {
          claudeResponse = data.data;
          console.log('✅ Using data.data');
        } else if (data.error) {
          console.log('❌ API error:', data.error);
          throw new Error(data.error || 'Claude AI API returned error');
        } else {
          // Try to extract any text
          claudeResponse = extractClaudeResponse(data);
        }
      } else if (typeof response.data === 'string') {
        console.log('✅ Response is string');
        claudeResponse = response.data;
      } else {
        console.log('❌ Invalid response format');
        throw new Error('Invalid API response format');
      }
      
      // Check if response is empty
      if (!claudeResponse || claudeResponse.trim() === '') {
        console.log('❌ Empty response');
        throw new Error('Claude returned empty response');
      }
      
      // Clean response
      claudeResponse = claudeResponse.trim();
      console.log(`📝 Response length: ${claudeResponse.length} characters`);
      
      // Check for error indicators
      const lowerResponse = claudeResponse.toLowerCase();
      if (lowerResponse.includes('error:') || 
          lowerResponse.startsWith('error') ||
          lowerResponse.includes('failed to') ||
          lowerResponse.includes('unavailable') ||
          lowerResponse.includes('not found')) {
        console.log('❌ Response contains error indicator');
        throw new Error(claudeResponse);
      }
      
      // Format response for WhatsApp
      claudeResponse = formatClaudeResponse(claudeResponse);
      
      // Truncate if too long for WhatsApp
      if (claudeResponse.length > 2500) {
        claudeResponse = claudeResponse.substring(0, 2500) + '\n\n... (response truncated for WhatsApp)';
      }

      // Format final message
      let resultText = `🧠 *CLAUDE AI*\n\n`;
      
      // Query display
      const displayQuery = query.length > 80 ? query.substring(0, 80) + '...' : query;
      resultText += `💭 *Query:* ${displayQuery}\n\n`;
      
      // Claude Response
      resultText += `🤖 *Claude's Response:*\n${claudeResponse}\n\n`;
      
      // Footer with Claude branding
      resultText += `⚡ *Powered by Anthropic Claude*\n`;
      resultText += `🧠 *Constitutional AI Assistant*`;

      // Send final answer
      console.log('📤 Sending final response to WhatsApp');
      await sock.sendMessage(jid, { text: resultText }, { quoted: m });
      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

      console.log(`✅ Claude AI response sent successfully`);

    } catch (error) {
      try {
        const wolfRes = await axios.get(`https://apis.wolf.space/api/ai/claude?q=${encodeURIComponent(query)}`, {
          timeout: 30000, headers: { 'User-Agent': 'WolfBot/1.0', 'Accept': 'application/json' }
        });
        const wolfData = wolfRes.data;
        const wolfText = wolfData?.result || wolfData?.response || wolfData?.answer || wolfData?.text;
        if (wolfText && wolfText.trim()) {
          await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });
          return await sock.sendMessage(jid, {
            text: `🧠 *CLAUDE AI*\n━━━━━━━━━━━━━━━━━\n${wolfText.trim()}\n━━━━━━━━━━━━━━━━━\n🐺 _Powered by WOLF AI_`
          }, { quoted: m });
        }
      } catch {}
      console.error('❌ [Claude AI] ERROR:', error);
      console.error('❌ Error stack:', error.stack);
      
      let errorMessage = `❌ *CLAUDE AI ERROR*\n\n`;
      
      // Detailed error handling
      if (error.code === 'ECONNREFUSED') {
        errorMessage += `• Claude API server is down\n`;
        errorMessage += `• Anthropic service unavailable\n`;
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage += `• Request timed out (35s)\n`;
        errorMessage += `• Claude AI is thinking deeply\n`;
        errorMessage += `• Try simpler query\n`;
      } else if (error.code === 'ENOTFOUND') {
        errorMessage += `• Cannot connect to Claude API\n`;
        errorMessage += `• Check internet connection\n`;
      } else if (error.code === 'ECONNABORTED') {
        errorMessage += `• Connection aborted\n`;
        errorMessage += `• Network issue detected\n`;
      } else if (error.response?.status === 429) {
        errorMessage += `• Rate limit exceeded\n`;
        errorMessage += `• Too many Claude requests\n`;
        errorMessage += `• Wait 2-3 minutes\n`;
      } else if (error.response?.status === 404) {
        errorMessage += `• Claude endpoint not found\n`;
        errorMessage += `• API may have changed\n`;
      } else if (error.response?.status === 500) {
        errorMessage += `• Claude AI internal error\n`;
        errorMessage += `• Service temporarily down\n`;
      } else if (error.response?.status === 403) {
        errorMessage += `• Access forbidden\n`;
        errorMessage += `• API key may be invalid\n`;
      } else if (error.response?.status === 400) {
        errorMessage += `• Bad request to Claude\n`;
        errorMessage += `• Query may be malformed\n`;
      } else if (error.response?.data) {
        // Extract API error
        const apiError = error.response.data;
        console.log('📊 API Error response:', apiError);
        
        if (apiError.error) {
          errorMessage += `• Claude Error: ${apiError.error}\n`;
        } else if (apiError.message) {
          errorMessage += `• Error: ${apiError.message}\n`;
        } else if (apiError.details) {
          errorMessage += `• Details: ${apiError.details}\n`;
        } else if (typeof apiError === 'string') {
          errorMessage += `• Error: ${apiError}\n`;
        }
      } else if (error.message) {
        errorMessage += `• Error: ${error.message}\n`;
      }
      
      errorMessage += `\n🔧 *Troubleshooting:*\n`;
      errorMessage += `1. Try simpler/shorter query\n`;
      errorMessage += `2. Wait 1-2 minutes before retry\n`;
      errorMessage += `3. Check internet connection\n`;
      errorMessage += `4. Use other AI commands:\n`;
      errorMessage += `   • \`${PREFIX}gpt\` - ChatGPT\n`;
      errorMessage += `   • \`${PREFIX}bard\` - Google Bard\n`;
      errorMessage += `   • \`${PREFIX}grok\` - X AI Grok\n`;
      errorMessage += `5. Try rephrasing your question\n`;
      
      // Send error message
      try {
        console.log('📤 Sending error message to user');
        await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });
        await sock.sendMessage(jid, {
          text: errorMessage
        }, { quoted: m });
      } catch (sendError) {
        console.error('❌ Failed to send error message:', sendError);
      }
    }
  }
};

// Helper functions

// Extract text from Claude AI API response
function extractClaudeResponse(obj, depth = 0) {
  if (depth > 3) return 'Response too complex';
  
  // If it's a string, return it
  if (typeof obj === 'string') {
    return obj;
  }
  
  // If array, process each item
  if (Array.isArray(obj)) {
    return obj.map(item => extractClaudeResponse(item, depth + 1))
              .filter(text => text && text.trim())
              .join('\n');
  }
  
  // If object, look for common response fields
  if (obj && typeof obj === 'object') {
    // Priority fields for Claude
    const priorityFields = [
      'result', 'response', 'answer', 'text', 'content', 
      'message', 'output', 'choices', 'candidates', 'claude',
      'completion', 'generated_text'
    ];
    
    for (const field of priorityFields) {
      if (obj[field]) {
        const extracted = extractClaudeResponse(obj[field], depth + 1);
        if (extracted && extracted.trim()) {
          return extracted;
        }
      }
    }
    
    // Try to extract from any string property
    for (const key in obj) {
      if (typeof obj[key] === 'string' && obj[key].trim()) {
        return obj[key];
      }
    }
    
    // Try to stringify the object
    try {
      const stringified = JSON.stringify(obj, null, 2);
      if (stringified.length < 1000) {
        return stringified;
      }
    } catch (e) {
      // Ignore stringify errors
    }
  }
  
  return 'Could not extract response from API';
}

// Format Claude response
function formatClaudeResponse(text) {
  if (!text) return 'No response received from Claude AI';
  
  // Clean up
  text = text.trim();
  
  // Remove excessive markdown
  text = cleanClaudeResponse(text);
  
  // Add Claude's formatting style
  text = addClaudeFormatting(text);
  
  // Ensure proper spacing for WhatsApp
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return text;
}

// Clean Claude response
function cleanClaudeResponse(text) {
  // Remove citation numbers
  text = text.replace(/\[\d+\]/g, '');
  
  // Clean markdown but keep structure
  text = text.replace(/(\*\*|__)(.*?)\1/g, '*$2*');
  
  // Preserve code blocks if present
  if (text.includes('```')) {
    // Keep code blocks as is
    text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, '```$1\n$2\n```');
  }
  
  // Remove excessive whitespace
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\n\s+/g, '\n');
  
  // Fix common Claude formatting issues
  text = text.replace(/Human:/gi, '');
  text = text.replace(/Assistant:/gi, '🤖 Claude:');
  
  return text;
}

// Add Claude's formatting style
function addClaudeFormatting(text) {
  // Check if already has Claude style
  if (text.toLowerCase().includes('claude') || 
      text.toLowerCase().includes('anthropic') ||
      text.toLowerCase().includes('assistant')) {
    return text;
  }
  
  // Add Claude-style intro for longer responses
  if (text.length > 150 && !text.startsWith('🤖')) {
    const claudeIntros = [
      "🤖 Claude AI: ",
      "🧠 According to Claude: ",
      "⚡ Claude's analysis: "
    ];
    
    const randomIntro = claudeIntros[Math.floor(Math.random() * claudeIntros.length)];
    if (!text.startsWith(randomIntro.substring(0, 5))) {
      text = randomIntro + text;
    }
  }
  
  return text;
}