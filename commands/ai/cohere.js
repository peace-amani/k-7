import axios from 'axios';

const WOLF_API = 'https://apis.wolf.space/api/ai/cohere';

export default {
  name: 'cohere',
  description: 'Cohere AI - Smart AI assistant powered by WOLF API',
  category: 'ai',
  aliases: ['coherai', 'cohai'],
  usage: 'cohere [your question]',

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;

    let query = '';
    if (args.length > 0) {
      query = args.join(' ');
    } else if (m.quoted?.text) {
      query = m.quoted.text;
    } else {
      return sock.sendMessage(jid, {
        text: `╭─⌈ 🤖 *COHERE AI* ⌋\n├─⊷ *${PREFIX}cohere <question>*\n│  └⊷ Ask Cohere anything\n├─⊷ *${PREFIX}coherai <question>*\n│  └⊷ Alias for cohere\n├─⊷ *${PREFIX}cohai <question>*\n│  └⊷ Alias for cohere\n╰───`
      }, { quoted: m });
    }

    console.log(`🤖 [COHERE] Query: "${query}"`);

    try {
      await sock.sendMessage(jid, { react: { text: '⏳', key: m.key } });

      const response = await axios({
        method: 'POST',
        url: WOLF_API,
        data: { prompt: query },
        headers: { 'Content-Type': 'application/json' },
        timeout: 40000,
        validateStatus: (status) => status >= 200 && status < 500
      });

      console.log(`✅ [COHERE] Response status: ${response.status}`);

      let aiResponse = '';
      let model = 'Cohere';

      if (response.data && typeof response.data === 'object') {
        const data = response.data;

        if (data.success && data.response) {
          aiResponse = data.response;
          model = data.model || data.provider || 'Cohere';
        } else if (data.result) {
          aiResponse = data.result;
        } else if (data.response) {
          aiResponse = data.response;
        } else if (data.answer) {
          aiResponse = data.answer;
        } else if (data.text) {
          aiResponse = data.text;
        } else if (data.message) {
          aiResponse = data.message;
        } else if (data.error) {
          throw new Error(data.error);
        } else {
          aiResponse = JSON.stringify(data, null, 2);
        }
      } else if (typeof response.data === 'string') {
        aiResponse = response.data;
      } else {
        throw new Error('Invalid API response');
      }

      if (!aiResponse || aiResponse.trim() === '') {
        throw new Error('Cohere returned empty response');
      }

      aiResponse = aiResponse.trim();

      if (aiResponse.length > 3000) {
        aiResponse = aiResponse.substring(0, 3000) + '\n\n... _(response truncated)_';
      }

      const displayQuery = query.length > 80 ? query.substring(0, 80) + '...' : query;

      let resultText = `🤖 *COHERE AI*\n\n`;
      resultText += `💭 *Query:* ${displayQuery}\n\n`;
      resultText += `${aiResponse}\n\n`;
      resultText += `⚡ _Powered by WOLF API • ${model}_`;

      await sock.sendMessage(jid, { text: resultText }, { quoted: m });
      await sock.sendMessage(jid, { react: { text: '✅', key: m.key } });

      console.log(`✅ [COHERE] Response sent (${aiResponse.length} chars)`);

    } catch (error) {
      console.error('❌ [COHERE] ERROR:', error.message);
      await sock.sendMessage(jid, { react: { text: '❌', key: m.key } });

      let errorMessage = `❌ *Cohere AI Error*\n\n`;

      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        errorMessage += `Request timed out. Try a shorter query.`;
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage += `API server unreachable. Try again later.`;
      } else if (error.response?.status === 429) {
        errorMessage += `Rate limit exceeded. Wait a moment.`;
      } else {
        errorMessage += `${error.message}\n\nTry: \`${PREFIX}gpt\`, \`${PREFIX}blackbox\`, or \`${PREFIX}grok\``;
      }

      await sock.sendMessage(jid, { text: errorMessage }, { quoted: m });
    }
  }
};
