import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getBotName } from './botname.js';

const WOLF_DATA_DIR = './data/wolfai';
const WOLF_CONVERSATIONS_DIR = path.join(WOLF_DATA_DIR, 'conversations');
const WOLF_CONFIG_FILE = path.join(WOLF_DATA_DIR, 'wolf_config.json');

let wolfEnabled = null;

function ensureDirs() {
  if (!fs.existsSync(WOLF_DATA_DIR)) fs.mkdirSync(WOLF_DATA_DIR, { recursive: true });
  if (!fs.existsSync(WOLF_CONVERSATIONS_DIR)) fs.mkdirSync(WOLF_CONVERSATIONS_DIR, { recursive: true });
}

export function isWolfEnabled() {
  if (wolfEnabled !== null) return wolfEnabled;
  ensureDirs();
  try {
    if (fs.existsSync(WOLF_CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(WOLF_CONFIG_FILE, 'utf8'));
      wolfEnabled = config.enabled === true;
      return wolfEnabled;
    }
  } catch {}
  wolfEnabled = true;
  return true;
}

export function setWolfEnabled(enabled) {
  ensureDirs();
  wolfEnabled = enabled;
  try {
    fs.writeFileSync(WOLF_CONFIG_FILE, JSON.stringify({ enabled, updatedAt: new Date().toISOString() }, null, 2));
  } catch {}
  return wolfEnabled;
}

export function getWolfStats() {
  ensureDirs();
  let convCount = 0;
  try {
    const files = fs.readdirSync(WOLF_CONVERSATIONS_DIR);
    convCount = files.filter(f => f.endsWith('.json')).length;
  } catch {}
  return {
    enabled: isWolfEnabled(),
    conversations: convCount,
    models: MODEL_PRIORITY.length,
  };
}

const EXTRACT_ALL = (d) => d?.result || d?.response || d?.answer || d?.text || d?.content || d?.solution || d?.data?.result || d?.data?.response || null;

const AI_MODELS = {
  gpt: {
    name: 'GPT-5', url: 'https://iamtkm.vercel.app/ai/gpt5', method: 'GET',
    params: (q) => ({ apikey: 'tkm', text: q }), extract: EXTRACT_ALL
  },
  copilot: {
    name: 'Copilot', url: 'https://iamtkm.vercel.app/ai/copilot', method: 'GET',
    params: (q) => ({ apikey: 'tkm', text: q }), extract: EXTRACT_ALL
  },
  claude: {
    name: 'Claude', url: 'https://apiskeith.vercel.app/ai/claudeai', method: 'GET',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
  grok: {
    name: 'Grok', url: 'https://apiskeith.vercel.app/ai/grok', method: 'GET',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
  blackbox: {
    name: 'Blackbox', url: 'https://apiskeith.vercel.app/ai/blackbox', method: 'GET',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
  bard: {
    name: 'Google Bard', url: 'https://apiskeith.vercel.app/ai/bard', method: 'GET',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
  perplexity: {
    name: 'Perplexity', url: 'https://apiskeith.vercel.app/ai/perplexity', method: 'GET',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
  metai: {
    name: 'Meta AI', url: 'https://apiskeith.vercel.app/ai/metai', method: 'GET',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
  mistral: {
    name: 'Mistral', url: 'https://apiskeith.vercel.app/ai/mistral', method: 'GET',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
  qwen: {
    name: 'Qwen AI', url: 'https://apiskeith.vercel.app/ai/qwenai', method: 'GET',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
  venice: {
    name: 'Venice', url: 'https://apiskeith.vercel.app/ai/venice', method: 'GET',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
  ilama: {
    name: 'iLlama', url: 'https://apiskeith.vercel.app/ai/ilama', method: 'GET',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
  gemini: {
    name: 'Gemini', url: 'https://apis.xwolf.space/api/ai/gemini', method: 'GET',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
  cohere: {
    name: 'Cohere', url: 'https://apis.xwolf.space/api/ai/cohere', method: 'GET',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
};
const MODEL_PRIORITY = ['gpt', 'copilot', 'claude', 'grok', 'blackbox', 'bard', 'perplexity', 'metai', 'mistral', 'qwen', 'venice', 'ilama', 'gemini', 'cohere'];

const COMMAND_CATALOG = `
AVAILABLE BOT COMMANDS (use these exact command names):
- menu: Show bot menu/commands list
- alive: Check if bot is alive
- p: Ping/speed test
- up: Bot uptime
- play [query]: Play/search a song
- song [query]: Download a song as audio
- ytmp4 [query/url]: Download a video
- tiktok [url]: Download TikTok video
- facebook [url]: Download Facebook video
- spotify [url/query]: Download from Spotify
- sticker: Convert image/video to sticker (reply to media)
- toimage: Convert sticker to image (reply to sticker)
- togif: Convert video/sticker to GIF (reply to media)
- imagine [prompt]: Generate AI image
- remini: Enhance/upscale image (reply to image)
- gpt [question]: Ask AI a question
- joke: Tell a joke
- quote: Inspirational quote
- news: Latest news
- weather [city]: Weather info
- owner: Show bot owner
- prefixinfo: Show current prefix
- grouplink: Get group invite link
- screenshot [url]: Screenshot a website
- tagall: Tag all group members
- kick: Kick a member (reply or mention)
- promote: Promote to admin (reply or mention)
- demote: Demote from admin (reply or mention)
- mute: Mute group
- unmute: Unmute group
- antilink [on/off]: Toggle anti-link
- antibug [on/off]: Toggle anti-bug
- welcome [on/off]: Toggle welcome messages
- restart: Restart bot
- setsettings [mode] [value]: Change bot settings (mode silent/public)
- whois [domain]: WHOIS lookup
- football: Football scores
- cricket: Cricket scores
- tts [text]: Text to speech
- jarvis [query]: JARVIS voice AI
`;

function buildSystemPrompt(conversation) {
  const botName = getBotName();
  let prompt = `You are W.O.L.F (Wise Operational Learning Framework), an elite AI assistant embedded in a WhatsApp bot called "${botName}". You are like JARVIS from Iron Man — intelligent, witty, proactive, and always helpful. You address the user naturally and remember everything they've told you in this conversation.

CORE IDENTITY:
- Your name is W.O.L.F. You were created by WolfTech.
- Never reveal underlying AI models (GPT, Claude, etc). You ARE W.O.L.F.
- Be conversational, warm, and occasionally witty. Not robotic.
- Remember context from the conversation. If a user told you their name, use it.
- Be proactive — suggest things, anticipate needs.

COMMAND EXECUTION:
You are connected to a WhatsApp bot with many commands. When the user wants you to DO something (not just chat), you MUST include a command tag in your response.

Format: [EXECUTE:command_name:arguments]

Examples:
- User: "play me some Drake" → respond naturally AND include [EXECUTE:play:Drake]
- User: "show the menu" → respond AND include [EXECUTE:menu:]
- User: "what's my ping" → respond AND include [EXECUTE:p:]
- User: "download this tiktok https://..." → respond AND include [EXECUTE:tiktok:https://...]
- User: "make this a sticker" → respond AND include [EXECUTE:sticker:]
- User: "kick that guy" → respond AND include [EXECUTE:kick:]
- User: "turn on antilink" → respond AND include [EXECUTE:antilink:on]
- User: "how long have you been running" → respond AND include [EXECUTE:up:]
- User: "generate an image of a wolf" → respond AND include [EXECUTE:imagine:a wolf]
- User: "tell me a joke" → respond AND include [EXECUTE:joke:]
- User: "switch to silent mode" → respond AND include [EXECUTE:setsettings:mode silent]
- User: "restart yourself" → respond AND include [EXECUTE:restart:]

RULES FOR COMMANDS:
1. Only include [EXECUTE:...] when the user clearly wants an ACTION performed.
2. For pure conversation/questions (like "what is photosynthesis"), just answer naturally — NO command tag.
3. Always include a natural conversational response BEFORE the command tag.
4. The command tag should be on its own line at the END of your message.
5. Use the EXACT command names from the catalog below.
6. If the user's request doesn't match any command, just chat normally.
7. For media commands (sticker, toimage, remini), the user needs to reply to media — just include the command tag.
8. Arguments go after the second colon, space-separated.

${COMMAND_CATALOG}

CONVERSATION STYLE:
- Be concise but helpful. Not too long.
- Use light formatting (*bold* for emphasis).
- Occasionally use relevant emojis, but don't overdo it.
- If you don't know something, say so honestly.
- You can be funny and have personality.
- Remember: you're chatting on WhatsApp, keep it casual and natural.
`;

  if (conversation.messages.length > 0) {
    prompt += `\nCONVERSATION HISTORY:\n`;
    const recent = conversation.messages.slice(-15);
    for (const msg of recent) {
      prompt += `${msg.role === 'user' ? 'Human' : 'W.O.L.F'}: ${msg.content}\n`;
    }
  }

  return prompt;
}

function loadConversation(userId) {
  ensureDirs();
  const file = path.join(WOLF_CONVERSATIONS_DIR, `${userId.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Date.now() - (data.lastActive || 0) > 2 * 60 * 60 * 1000) {
        return { messages: [], lastActive: Date.now(), userData: data.userData || {} };
      }
      return data;
    }
  } catch {}
  return { messages: [], lastActive: Date.now(), userData: {} };
}

function saveConversation(userId, conversation) {
  ensureDirs();
  const file = path.join(WOLF_CONVERSATIONS_DIR, `${userId.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
  conversation.lastActive = Date.now();
  if (conversation.messages.length > 30) {
    conversation.messages = conversation.messages.slice(-30);
  }
  try {
    fs.writeFileSync(file, JSON.stringify(conversation, null, 2));
  } catch {}
}

async function queryAI(modelKey, prompt, timeout = 30000) {
  const model = AI_MODELS[modelKey];
  if (!model) return null;
  try {
    const response = await axios({
      method: model.method, url: model.url,
      params: model.params(prompt),
      timeout,
      headers: { 'User-Agent': 'WOLF-AI/2.0', 'Accept': 'application/json' },
      validateStatus: (s) => s >= 200 && s < 500
    });
    if (response.data && typeof response.data === 'object') {
      const result = model.extract(response.data);
      if (result && typeof result === 'string' && result.trim().length > 3) {
        const lower = result.toLowerCase();
        if (lower.includes('error:') || lower.startsWith('error') || lower.includes('unavailable')) return null;
        return result.trim();
      }
    } else if (typeof response.data === 'string' && response.data.trim().length > 3) {
      return response.data.trim();
    }
  } catch {}
  return null;
}

async function getWolfResponse(userMessage, conversation) {
  const systemPrompt = buildSystemPrompt(conversation);
  const fullPrompt = `${systemPrompt}\nHuman: ${userMessage}\nW.O.L.F:`;

  for (const modelKey of MODEL_PRIORITY) {
    const result = await queryAI(modelKey, fullPrompt);
    if (result) return cleanResponse(result);
  }

  const simpleResult = await queryAI('gpt', userMessage);
  if (simpleResult) return cleanResponse(simpleResult);

  return null;
}

function cleanResponse(text) {
  if (!text) return '';
  text = text.replace(/\[\d+\]/g, '');
  text = text.replace(/Human:.*$/gm, '');
  text = text.replace(/W\.O\.L\.F:/g, '');
  text = text.replace(/^(Assistant|AI|Bot|Claude|GPT|Grok|Copilot|Bard):\s*/gim, '');
  text = text.replace(/\b(ChatGPT|GPT-?[34o5]?|GPT|OpenAI)\b/gi, 'W.O.L.F');
  text = text.replace(/\b(Claude|Anthropic)\b/gi, 'W.O.L.F');
  text = text.replace(/\b(Copilot|Microsoft Copilot)\b/gi, 'W.O.L.F');
  text = text.replace(/\b(Google Bard|Bard|Gemini)\b/gi, 'W.O.L.F');
  text = text.replace(/\b(Grok|xAI)\b/gi, 'W.O.L.F');
  text = text.replace(/\b(Blackbox|Blackbox AI)\b/gi, 'W.O.L.F');
  text = text.replace(/\b(Perplexity|Perplexity AI)\b/gi, 'W.O.L.F');
  text = text.replace(/\b(LLaMA|Meta AI|Mistral|Mistral AI)\b/gi, 'W.O.L.F');
  text = text.replace(/\b(Qwen|QwenAI|Qwen AI|Alibaba Cloud)\b/gi, 'W.O.L.F');
  text = text.replace(/\b(Venice|Venice AI|Venice\.ai)\b/gi, 'W.O.L.F');
  text = text.replace(/\b(Cohere|Cohere AI|Command R)\b/gi, 'W.O.L.F');
  text = text.replace(/\b(iLlama|LLaMA 2|LLaMA 3|Llama)\b/gi, 'W.O.L.F');
  text = text.replace(/\bI'?m an AI (language )?model\b/gi, "I'm W.O.L.F");
  text = text.replace(/\bAs an AI (language )?model\b/gi, 'As W.O.L.F');
  text = text.replace(/\bmade by (OpenAI|Google|Anthropic|Microsoft|Meta|xAI)\b/gi, 'made by WolfTech');
  text = text.replace(/\bcreated by (OpenAI|Google|Anthropic|Microsoft|Meta|xAI)\b/gi, 'created by WolfTech');
  text = text.replace(/(W\.O\.L\.F[\s,]*){2,}/g, 'W.O.L.F ');
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  return text.trim();
}

function parseCommandFromResponse(response) {
  const match = response.match(/\[EXECUTE:([a-zA-Z0-9]+):?(.*?)\]/);
  if (!match) return null;
  const command = match[1].toLowerCase();
  const argsStr = (match[2] || '').trim();
  const args = argsStr ? argsStr.split(/\s+/) : [];
  return { command, args };
}

function stripCommandTag(response) {
  return response.replace(/\[EXECUTE:[^\]]*\]/g, '').trim();
}

const WOLF_TRIGGERS = [
  /^hey\s+wolf\b/i,
  /^yo\s+wolf\b/i,
  /^hi\s+wolf\b/i,
  /^hello\s+wolf\b/i,
  /^ok\s+wolf\b/i,
  /^okay\s+wolf\b/i,
  /^dear\s+wolf\b/i,
  /^sup\s+wolf\b/i,
  /^ey\s+wolf\b/i,
  /^ay\s+wolf\b/i,
  /^wolf\s*,/i,
  /^wolf\b/i,
];

export function isWolfTrigger(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  return WOLF_TRIGGERS.some(r => r.test(trimmed));
}

function stripWolfPrefix(text) {
  if (!text) return '';
  let s = text.trim();
  s = s.replace(/^(hey|yo|hi|hello|ok|okay|dear|sup|ey|ay)\s+wolf\b[\s,!.]*/i, '');
  s = s.replace(/^wolf\b[\s,!.]*/i, '');
  return s.trim();
}

function quickIntentMatch(text) {
  const lower = text.toLowerCase();

  if (/^(show\s+)?(the\s+)?menu$/.test(lower)) return { command: 'menu', args: [] };
  if (/^(are\s+you\s+)?(alive|there|online|up)\??$/.test(lower)) return { command: 'alive', args: [] };
  if (/^ping$/.test(lower)) return { command: 'p', args: [] };
  if (/^(uptime|up)$/.test(lower)) return { command: 'up', args: [] };
  if (/^prefix(info)?$/.test(lower)) return { command: 'prefixinfo', args: [] };
  if (/^owner$/.test(lower)) return { command: 'owner', args: [] };
  if (/^(restart|reboot)$/.test(lower)) return { command: 'restart', args: [] };

  return null;
}

export async function handleWolfAI(sock, msg, commands, executeCommand, preExtractedText) {
  const text = preExtractedText || extractText(msg);
  if (!text || !isWolfTrigger(text)) return false;

  const chatId = msg.key.remoteJid;
  const senderId = msg.key.participant || msg.key.remoteJid;
  const userMessage = stripWolfPrefix(text);

  if (!userMessage) {
    const botName = getBotName();
    await sock.sendMessage(chatId, {
      text: `🐺 Hey! I'm *${botName}* — your personal AI assistant.\n\nJust talk to me naturally. For example:\n• _Wolf play Bohemian Rhapsody_\n• _Wolf what's the weather in Nairobi_\n• _Wolf show me the menu_\n• _Wolf how does photosynthesis work_\n• _Wolf make this a sticker_\n\nI remember our conversations, so just keep chatting!`
    }, { quoted: msg });
    return true;
  }

  const quickMatch = quickIntentMatch(userMessage);
  if (quickMatch && commands.has(quickMatch.command)) {
    await executeCommand(quickMatch.command, quickMatch.args);
    return true;
  }

  await sock.presenceSubscribe(chatId).catch(() => {});
  await sock.sendPresenceUpdate('composing', chatId).catch(() => {});

  const conversation = loadConversation(senderId);

  const aiResponse = await getWolfResponse(userMessage, conversation);

  await sock.sendPresenceUpdate('paused', chatId).catch(() => {});

  if (!aiResponse) {
    await sock.sendMessage(chatId, {
      text: `🐺 Sorry, I'm having trouble thinking right now. Try again in a moment!`
    }, { quoted: msg });
    return true;
  }

  const parsedCommand = parseCommandFromResponse(aiResponse);
  const displayText = stripCommandTag(aiResponse);

  conversation.messages.push({ role: 'user', content: userMessage });
  conversation.messages.push({ role: 'assistant', content: displayText || userMessage });
  saveConversation(senderId, conversation);

  if (parsedCommand && commands.has(parsedCommand.command)) {
    if (displayText) {
      await sock.sendMessage(chatId, { text: displayText }, { quoted: msg });
    }
    await executeCommand(parsedCommand.command, parsedCommand.args);
  } else if (displayText) {
    await sock.sendMessage(chatId, { text: displayText }, { quoted: msg });
  }

  return true;
}

function extractText(msg) {
  if (!msg?.message) return '';
  const m = msg.message;
  return m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption
    || m.videoMessage?.caption
    || m.documentMessage?.caption
    || '';
}
