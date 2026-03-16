import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { normalizeMessageContent, jidNormalizedUser } from '@whiskeysockets/baileys';
import supabase from '../../lib/database.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const DATA_DIR = './data/chatbot';
const CONVERSATIONS_DIR = path.join(DATA_DIR, 'conversations');

function getBotId() {
  return supabase.getConfigBotId ? supabase.getConfigBotId() : 'default';
}

function getConfigFile() {
  const botId = getBotId();
  return path.join(DATA_DIR, `chatbot_config_${botId}.json`);
}

function getConversationsDir() {
  const botId = getBotId();
  return path.join(DATA_DIR, 'conversations', botId);
}

const pendingActions = new Map();
const PENDING_TIMEOUT = 120000;

const AI_MODELS = {
  gpt: {
    name: 'GPT-5',
    icon: '🤖',
    url: 'https://iamtkm.vercel.app/ai/gpt5',
    method: 'GET',
    params: (q) => ({ apikey: 'tkm', text: q }),
    extract: (data) => data?.result || data?.response || data?.answer || null
  },
  copilot: {
    name: 'Copilot',
    icon: '🧠',
    url: 'https://iamtkm.vercel.app/ai/copilot',
    method: 'GET',
    params: (q) => ({ apikey: 'tkm', text: q }),
    extract: (data) => data?.result || data?.response || data?.answer || null
  },
  claude: {
    name: 'Claude AI',
    icon: '🔮',
    url: 'https://apiskeith.vercel.app/ai/claudeai',
    method: 'GET',
    params: (q) => ({ q }),
    extract: (data) => data?.result || data?.response || data?.answer || data?.text || data?.content || null
  },
  grok: {
    name: 'Grok',
    icon: '⚡',
    url: 'https://apiskeith.vercel.app/ai/grok',
    method: 'GET',
    params: (q) => ({ q }),
    extract: (data) => data?.result || data?.response || data?.answer || data?.text || null
  },
  blackbox: {
    name: 'Blackbox',
    icon: '🖥️',
    url: 'https://apiskeith.vercel.app/ai/blackbox',
    method: 'GET',
    params: (q) => ({ q }),
    extract: (data) => data?.result || data?.response || data?.answer || data?.solution || null
  },
  bard: {
    name: 'Google Bard',
    icon: '🌐',
    url: 'https://apiskeith.vercel.app/ai/bard',
    method: 'GET',
    params: (q) => ({ q }),
    extract: (data) => data?.result || data?.response || data?.answer || null
  },
  perplexity: {
    name: 'Perplexity',
    icon: '🔍',
    url: 'https://apiskeith.vercel.app/ai/perplexity',
    method: 'GET',
    params: (q) => ({ q }),
    extract: (data) => data?.result || data?.response || data?.answer || null
  }
};

const MODEL_PRIORITY = ['gpt', 'copilot', 'claude', 'blackbox', 'grok', 'bard', 'perplexity'];

const MEDIA_REACTIONS = {
  imagine: '🎨',
  play: '🎵',
  video: '🎬',
  song: '🎶'
};

const MEDIA_PROMPTS = {
  image: {
    ask: `Sure! Describe the image you'd like me to generate 🎨`,
    confirm: `Got it! Let me create that for you... 🎨`
  },
  playAudio: {
    ask: `Of course! What song or music would you like me to play? 🎵`,
    confirm: `Great choice! Let me find that for you... 🎵`
  },
  playVideo: {
    ask: `Sure thing! What video would you like me to find? 🎬`,
    confirm: `On it! Finding that video for you... 🎬`
  },
  song: {
    ask: `Sure! Which song would you like me to download? 🎶`,
    confirm: `Alright! Downloading that for you... 🎶`
  }
};

const INTENT_PATTERNS = {
  image: {
    vaguePatterns: [
      /^(?:can you |could you |wolf,?\s+)?(?:generate|create|make|draw|design|paint|sketch)\s+(?:an?\s+)?(?:image|picture|photo|art|artwork|illustration|pic|img|drawing|painting)\s*\??$/i,
      /^(?:can you |could you |wolf,?\s+)?(?:generate|create|make|draw|design)\s+(?:for me|something|an image|a picture)\s*\??$/i,
      /^(?:i want|i need|i'd like)\s+(?:an?\s+)?(?:image|picture|photo|art|drawing)\s*\.?$/i,
      /^(?:generate|create|make|draw)\s+(?:an?\s+)?(?:image|picture|photo)\s*\??$/i
    ],
    specificPatterns: [
      /^(?:generate|create|make|draw|design|paint|sketch)\s+(?:an?\s+)?(?:image|picture|photo|art|artwork|illustration|pic|img|drawing|painting)\s+(?:of|about|for|with|showing)\s+.{3,}/i,
      /^(?:generate|create|make|draw|design|paint|sketch)\s+(?:me\s+)?(?:an?\s+)?.{5,}/i,
      /(?:image|picture|photo|art|drawing|painting)\s+(?:of|about|for|with)\s+.{3,}/i,
      /^imagine\s+.{3,}/i,
      /^(?:can you |please |wolf,?\s+)?(?:generate|create|make|draw|design)\s+(?:an?\s+)?(?:image|picture|photo)\s+(?:of|about|for|with|showing)\s+.{3,}/i
    ],
    extractQuery: (text) => {
      let query = text;
      query = query.replace(/^(?:can you |could you |please |wolf,?\s+)?(?:generate|create|make|draw|design|paint|sketch)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|art|artwork|illustration|pic|img|drawing|painting)\s*(?:of|about|for|with|showing)?\s*/i, '');
      query = query.replace(/^imagine\s+/i, '');
      query = query.replace(/^(?:can you |could you |please |wolf,?\s+)?(?:generate|create|make|draw|design|paint|sketch)\s+(?:me\s+)?(?:an?\s+)?/i, '');
      return query.trim();
    },
    command: 'imagine'
  },
  playAudio: {
    vaguePatterns: [
      /^(?:can you |could you |wolf,?\s+)?(?:play|sing|find)\s+(?:a\s+)?(?:song|music|something|audio)\s*\??$/i,
      /^(?:play|sing)\s+(?:me\s+)?(?:something|a song|music)\s*\??$/i,
      /^(?:i want to (?:hear|listen to)|let me hear)\s+(?:a\s+)?(?:song|music|something)\s*\??$/i
    ],
    specificPatterns: [
      /^(?:play|sing|find me|put on|listen to)\s+(?:the\s+)?(?:song\s+)?(?!(?:a\s+)?(?:song|music|something|audio)\s*\??$).{3,}/i,
      /^(?:can you |please |wolf,?\s+)?(?:play|sing|find me|put on)\s+(?!(?:a\s+)?(?:song|music|something)\s*\??$).{3,}/i,
      /^(?:play|download)\s+(?:me\s+)?(?:the\s+)?(?:song|music|audio|mp3)\s+.{3,}/i,
      /^(?:i want to (?:hear|listen)|let me hear|play me)\s+.{3,}/i
    ],
    extractQuery: (text) => {
      let query = text;
      query = query.replace(/^(?:can you |could you |please |wolf,?\s+)?(?:play|sing|find me|put on|listen to|download)\s+(?:me\s+)?(?:the\s+)?(?:song|music|track|audio|mp3)?\s*/i, '');
      query = query.replace(/^(?:i want to (?:hear|listen)|let me hear|play me)\s+/i, '');
      query = query.replace(/\s+(?:on youtube|from youtube|for me|please)$/i, '');
      return query.trim();
    },
    command: 'play'
  },
  playVideo: {
    vaguePatterns: [
      /^(?:can you |could you |wolf,?\s+)?(?:play|download|get|find|show)\s+(?:a\s+)?(?:video|vid|clip)\s*\??$/i,
      /^(?:i want to (?:watch|see)|let me (?:watch|see)|show me)\s+(?:a\s+)?(?:video|something)\s*\??$/i
    ],
    specificPatterns: [
      /^(?:play|download|get|find|show)\s+(?:the\s+)?(?:video|vid|clip|movie)\s+(?:of|about|for)?\s*.{3,}/i,
      /^(?:play|download|get|find|show)\s+(?:me\s+)?(?:the\s+)?video\s+.{3,}/i,
      /^(?:can you |please |wolf,?\s+)?(?:play|download|get|show)\s+(?:the\s+)?(?:video|vid)\s+.{3,}/i,
      /^(?:i want to (?:watch|see)|let me (?:watch|see)|show me)\s+.{3,}/i,
      /^(?:play|download)\s+.{3,}\s+video$/i
    ],
    extractQuery: (text) => {
      let query = text;
      query = query.replace(/^(?:can you |could you |please |wolf,?\s+)?(?:play|download|get|find|show)\s+(?:me\s+)?(?:the\s+)?(?:video|vid|clip|movie)\s*(?:of|about|for)?\s*/i, '');
      query = query.replace(/^(?:i want to (?:watch|see)|let me (?:watch|see)|show me)\s+/i, '');
      query = query.replace(/\s+(?:video|vid|clip)$/i, '');
      query = query.replace(/\s+(?:on youtube|from youtube|for me|please)$/i, '');
      return query.trim();
    },
    command: 'video'
  },
  song: {
    vaguePatterns: [
      /^(?:can you |could you |wolf,?\s+)?(?:download|get|send|give)\s+(?:me\s+)?(?:a\s+)?(?:song|music|audio)\s*\??$/i
    ],
    specificPatterns: [
      /^(?:download|get)\s+(?:the\s+)?(?:song|music|audio|mp3)\s+.{3,}/i,
      /^(?:send|give)\s+(?:me\s+)?(?:the\s+)?(?:song|music|audio)\s+.{3,}/i
    ],
    extractQuery: (text) => {
      let query = text;
      query = query.replace(/^(?:download|get|send|give)\s+(?:me\s+)?(?:the\s+)?(?:song|music|audio|mp3)\s*/i, '');
      query = query.replace(/\s+(?:for me|please)$/i, '');
      return query.trim();
    },
    command: 'song'
  }
};

function detectIntent(text) {
  const trimmed = text.trim();
  if (trimmed.length < 4) return null;

  for (const [intentKey, intent] of Object.entries(INTENT_PATTERNS)) {
    if (intentKey === 'playAudio') {
      const isVideo = INTENT_PATTERNS.playVideo.vaguePatterns.some(p => p.test(trimmed)) ||
                      INTENT_PATTERNS.playVideo.specificPatterns.some(p => p.test(trimmed));
      if (isVideo) continue;
    }

    for (const pattern of intent.vaguePatterns) {
      if (pattern.test(trimmed)) {
        return { type: intentKey, command: intent.command, query: '', vague: true };
      }
    }

    for (const pattern of intent.specificPatterns) {
      if (pattern.test(trimmed)) {
        const query = intent.extractQuery(trimmed);
        if (query && query.length >= 2) {
          return { type: intentKey, command: intent.command, query, vague: false };
        }
      }
    }
  }

  return null;
}

function pendingKey(senderJid, chatId) {
  return `${senderJid}::${chatId}`;
}

function setPendingAction(senderJid, chatId, actionType, command) {
  const key = pendingKey(senderJid, chatId);
  pendingActions.set(key, {
    type: actionType,
    command: command,
    timestamp: Date.now()
  });

  setTimeout(() => {
    const pending = pendingActions.get(key);
    if (pending && Date.now() - pending.timestamp >= PENDING_TIMEOUT) {
      pendingActions.delete(key);
    }
  }, PENDING_TIMEOUT);
}

function getPendingAction(senderJid, chatId) {
  const key = pendingKey(senderJid, chatId);
  const pending = pendingActions.get(key);
  if (!pending) return null;

  if (Date.now() - pending.timestamp > PENDING_TIMEOUT) {
    pendingActions.delete(key);
    return null;
  }

  return pending;
}

function clearPendingAction(senderJid, chatId) {
  pendingActions.delete(pendingKey(senderJid, chatId));
}

const CANCEL_WORDS = ['cancel', 'nevermind', 'never mind', 'nvm', 'stop', 'nah', 'no', 'forget it', 'skip'];

function ensureDataDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const convDir = getConversationsDir();
  if (!fs.existsSync(convDir)) fs.mkdirSync(convDir, { recursive: true });
}

function loadConfig() {
  ensureDataDirs();
  const defaultConfig = { mode: 'off', preferredModel: 'gpt', allowedGroups: [], allowedDMs: [], stats: { totalQueries: 0, modelsUsed: {} } };
  const configFile = getConfigFile();
  try {
    if (fs.existsSync(configFile)) {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      return config;
    }
  } catch (e) {}
  if (supabase.isAvailable()) {
    const botId = getBotId();
    supabase.getAll('chatbot_config', { key: 'main', bot_id: botId }).then(rows => {
      const data = rows?.[0];
      if (data && data.config) {
        try {
          fs.writeFileSync(configFile, JSON.stringify(data.config, null, 2));
        } catch (e) {}
      }
    }).catch(() => {});
  }
  return defaultConfig;
}

function saveConfig(config) {
  ensureDataDirs();
  const configFile = getConfigFile();
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  const botId = getBotId();
  supabase.upsert('chatbot_config', { key: 'main', config: config, bot_id: botId, updated_at: new Date().toISOString() }, 'key,bot_id').catch(() => {});
}

function getConversationFile(userId) {
  const convDir = getConversationsDir();
  return path.join(convDir, `${userId.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
}

function loadConversation(userId) {
  ensureDataDirs();
  const file = getConversationFile(userId);
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const oneHour = 60 * 60 * 1000;
      if (Date.now() - (data.lastActive || 0) > oneHour) {
        return { messages: [], lastActive: Date.now(), model: null };
      }
      return data;
    }
  } catch (e) {}
  if (supabase.isAvailable()) {
    const sanitizedId = userId.replace(/[^a-zA-Z0-9]/g, '_');
    const botId = getBotId();
    supabase.getAll('chatbot_conversations', { user_id: sanitizedId, bot_id: botId }).then(rows => {
      const data = rows?.[0];
      if (data && data.conversation) {
        try {
          ensureDataDirs();
          fs.writeFileSync(file, JSON.stringify(data.conversation, null, 2));
        } catch (e) {}
      }
    }).catch(() => {});
  }
  return { messages: [], lastActive: Date.now(), model: null };
}

function saveConversation(userId, conversation) {
  ensureDataDirs();
  const file = getConversationFile(userId);
  conversation.lastActive = Date.now();
  if (conversation.messages.length > 20) {
    conversation.messages = conversation.messages.slice(-20);
  }
  fs.writeFileSync(file, JSON.stringify(conversation, null, 2));
  const botId = getBotId();
  supabase.upsert('chatbot_conversations', {
    user_id: userId.replace(/[^a-zA-Z0-9]/g, '_'),
    conversation: conversation,
    bot_id: botId,
    last_updated: new Date().toISOString()
  }, 'user_id,bot_id').catch(() => {});
}

function clearConversation(userId) {
  const file = getConversationFile(userId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const botId = getBotId();
  const sanitizedUserId = userId.replace(/[^a-zA-Z0-9]/g, '_');
  supabase.query(
    `DELETE FROM chatbot_conversations WHERE user_id = $1 AND bot_id = $2`,
    [sanitizedUserId, botId]
  ).catch(() => {});
}

function buildContextPrompt(conversation, newQuery) {
  let context = `You are W.O.L.F (Wise Operational Learning Framework), an elite AI assistant created by WolfTech. Your name is W.O.L.F and you must always identify yourself as W.O.L.F when asked who you are. You are intelligent, conversational, and helpful. You remember the conversation context and respond naturally like a real chat partner. Keep responses concise but thorough.\n\nCRITICAL IDENTITY RULES:\n- Your name is W.O.L.F. Always refer to yourself as W.O.L.F.\n- You were created by WolfTech. Never say you were made by OpenAI, Google, Anthropic, Microsoft, Meta, xAI, or any other company.\n- Never reveal or mention any underlying AI model (GPT, Claude, Copilot, Grok, Bard, Blackbox, Perplexity, LLaMA, Gemini, etc).\n- If asked what you are, say: "I'm W.O.L.F (Wise Operational Learning Framework), an AI assistant by WolfTech."\n- Never say "As an AI language model" - instead say "As W.O.L.F" if needed.\n- You are not ChatGPT, not Claude, not Bard, not Copilot. You are W.O.L.F.\n\n`;

  if (conversation.messages.length > 0) {
    context += `Previous conversation:\n`;
    const recentMessages = conversation.messages.slice(-10);
    for (const msg of recentMessages) {
      context += `${msg.role === 'user' ? 'Human' : 'W.O.L.F'}: ${msg.content}\n`;
    }
    context += `\n`;
  }

  context += `Human: ${newQuery}\nW.O.L.F:`;
  return context;
}

async function queryAI(modelKey, prompt, timeout = 35000) {
  const model = AI_MODELS[modelKey];
  if (!model) return null;

  try {
    const response = await axios({
      method: model.method,
      url: model.url,
      params: model.params(prompt),
      timeout,
      headers: {
        'User-Agent': 'WOLF-Chatbot/2.0',
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      },
      validateStatus: (status) => status >= 200 && status < 500
    });

    if (response.data && typeof response.data === 'object') {
      const result = model.extract(response.data);
      if (result && typeof result === 'string' && result.trim().length > 5) {
        const lower = result.toLowerCase();
        if (lower.includes('error:') || lower.startsWith('error') || lower.includes('unavailable')) {
          return null;
        }
        return result.trim();
      }
    } else if (typeof response.data === 'string' && response.data.trim().length > 5) {
      return response.data.trim();
    }
  } catch (e) {}

  return null;
}

async function getAIResponse(query, conversation, preferredModel = 'gpt') {
  const contextPrompt = buildContextPrompt(conversation, query);

  let result = await queryAI(preferredModel, contextPrompt);
  if (result) return { response: result, model: preferredModel };

  for (const modelKey of MODEL_PRIORITY) {
    if (modelKey === preferredModel) continue;
    result = await queryAI(modelKey, contextPrompt);
    if (result) return { response: result, model: modelKey };
  }

  result = await queryAI('gpt', query);
  if (result) return { response: result, model: 'gpt' };

  return null;
}

function cleanAIResponse(text) {
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
  text = text.replace(/\b(LLaMA|Meta AI|Mistral)\b/gi, 'W.O.L.F');
  text = text.replace(/\bI'?m an AI (language )?model\b/gi, "I'm W.O.L.F");
  text = text.replace(/\bAs an AI (language )?model\b/gi, 'As W.O.L.F');
  text = text.replace(/\bmade by (OpenAI|Google|Anthropic|Microsoft|Meta|xAI)\b/gi, 'made by WolfTech');
  text = text.replace(/\bcreated by (OpenAI|Google|Anthropic|Microsoft|Meta|xAI)\b/gi, 'created by WolfTech');
  text = text.replace(/\bdeveloped by (OpenAI|Google|Anthropic|Microsoft|Meta|xAI)\b/gi, 'developed by WolfTech');
  text = text.replace(/\bbuilt by (OpenAI|Google|Anthropic|Microsoft|Meta|xAI)\b/gi, 'built by WolfTech');
  text = text.replace(/\btrained by (OpenAI|Google|Anthropic|Microsoft|Meta|xAI)\b/gi, 'trained by WolfTech');

  text = text.replace(/(W\.O\.L\.F[\s,]*){2,}/g, 'W.O.L.F ');

  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  return text.trim();
}

export function getChatbotConfig() {
  return loadConfig();
}

export function isChatbotActiveForChat(chatId) {
  const config = loadConfig();
  if (config.mode === 'off') return false;

  const isGroup = chatId.endsWith('@g.us');
  const isDM = chatId.endsWith('@s.whatsapp.net') || chatId.endsWith('@lid');

  const allowedGroups = config.allowedGroups || [];
  const allowedDMs = config.allowedDMs || [];

  if (isGroup && allowedGroups.length > 0) {
    return allowedGroups.includes(chatId);
  }

  if (isDM && allowedDMs.length > 0) {
    const normalized = chatId.split('@')[0].split(':')[0];
    return allowedDMs.some(dm => {
      const normDM = dm.split('@')[0].split(':')[0];
      return normDM === normalized;
    });
  }

  if (config.mode === 'on' || config.mode === 'both') return true;
  if (config.mode === 'groups' && isGroup) return true;
  if (config.mode === 'dms' && isDM) return true;

  return false;
}

function createSilentSock(sock, chatId, originalMsg) {
  const proxyHandler = {
    get(target, prop) {
      if (prop === 'sendMessage') {
        return async (jid, content, options = {}) => {
          if (content.react) {
            return target.sendMessage(jid, content, options);
          }

          if (content.image || content.video || content.audio || content.document || content.sticker) {
            if (content.caption) {
              content.caption = `🐺 Here is your result!\n\n${content.caption}`;
            }
            return target.sendMessage(jid, content, options);
          }

          if (content.edit) {
            return { key: { id: 'suppressed' } };
          }

          if (content.text && !content.image && !content.video && !content.audio) {
            return { key: { id: 'suppressed' } };
          }

          return target.sendMessage(jid, content, options);
        };
      }
      const val = target[prop];
      if (typeof val === 'function') return val.bind(target);
      return val;
    }
  };
  return new Proxy(sock, proxyHandler);
}

async function executeMediaCommand(sock, msg, commandName, query, commandsMap) {
  if (!commandsMap || !commandsMap.has(commandName)) return false;

  const command = commandsMap.get(commandName);
  if (!command || !command.execute) return false;

  try {
    const chatId = msg.key.remoteJid;
    const reaction = MEDIA_REACTIONS[commandName] || '⚡';
    await sock.sendMessage(chatId, {
      react: { text: reaction, key: msg.key }
    });

    const prefix = '.';
    const args = query.split(/\s+/).filter(Boolean);

    const fakeMsg = {
      ...msg,
      message: {
        conversation: `${prefix}${commandName} ${query}`,
        extendedTextMessage: {
          text: `${prefix}${commandName} ${query}`
        }
      }
    };

    const silentSock = createSilentSock(sock, chatId, msg);
    await command.execute(silentSock, fakeMsg, args, prefix);

    await sock.sendMessage(chatId, {
      react: { text: '✅', key: msg.key }
    });

    return true;
  } catch (error) {
    console.error(`[W.O.L.F] Media command error (${commandName}):`, error.message);

    await sock.sendMessage(msg.key.remoteJid, {
      react: { text: '❌', key: msg.key }
    });

    return false;
  }
}

function trackMediaAction(intentType, config) {
  config.stats.totalQueries = (config.stats.totalQueries || 0) + 1;
  config.stats.mediaActions = config.stats.mediaActions || {};
  config.stats.mediaActions[intentType] = (config.stats.mediaActions[intentType] || 0) + 1;
  saveConfig(config);
}

export async function handleChatbotMessage(sock, msg, commandsMap) {
  const chatId = msg.key.remoteJid;
  const rawSender = msg.key.participant || chatId;
  const senderJid = jidNormalizedUser(rawSender);

  const normalized = normalizeMessageContent(msg.message);
  const textMsg = normalized?.conversation ||
                  normalized?.extendedTextMessage?.text || '';

  if (!textMsg || textMsg.trim().length < 2) return false;

  const userText = textMsg.trim();

  if (userText.startsWith('.') || userText.startsWith('/') || userText.startsWith('!')) {
    clearPendingAction(senderJid, chatId);
    return false;
  }

  const pending = getPendingAction(senderJid, chatId);
  if (pending && commandsMap) {
    clearPendingAction(senderJid, chatId);

    if (CANCEL_WORDS.includes(userText.toLowerCase()) || userText.length < 3) {
      await sock.sendMessage(chatId, {
        text: `🐺 Alright, cancelled!`
      }, { quoted: msg });
      return true;
    }

    const executed = await executeMediaCommand(sock, msg, pending.command, userText, commandsMap);
    if (executed) {
      const config = loadConfig();
      trackMediaAction(pending.type, config);

      const conversation = loadConversation(senderJid);
      conversation.messages.push({ role: 'user', content: userText });
      conversation.messages.push({ role: 'assistant', content: `[Executed ${pending.command}: ${userText}]` });
      saveConversation(senderJid, conversation);
      return true;
    }
  }

  const intent = detectIntent(userText);

  if (intent && commandsMap) {
    if (intent.vague) {
      setPendingAction(senderJid, chatId, intent.type, intent.command);

      const promptInfo = MEDIA_PROMPTS[intent.type];
      await sock.sendMessage(chatId, {
        text: `🐺 ${promptInfo?.ask || 'Sure! What would you like?'}`
      }, { quoted: msg });

      const conversation = loadConversation(senderJid);
      conversation.messages.push({ role: 'user', content: userText });
      conversation.messages.push({ role: 'assistant', content: promptInfo?.ask || 'Sure! What would you like?' });
      saveConversation(senderJid, conversation);
      return true;
    }

    const executed = await executeMediaCommand(sock, msg, intent.command, intent.query, commandsMap);
    if (executed) {
      const config = loadConfig();
      trackMediaAction(intent.type, config);

      const conversation = loadConversation(senderJid);
      conversation.messages.push({ role: 'user', content: userText });
      conversation.messages.push({ role: 'assistant', content: `[Executed ${intent.command}: ${intent.query}]` });
      saveConversation(senderJid, conversation);
      return true;
    }
  }

  const config = loadConfig();
  const conversation = loadConversation(senderJid);

  try {
    await sock.sendPresenceUpdate('composing', chatId);

    const aiResult = await getAIResponse(userText, conversation, config.preferredModel || 'gpt');

    if (!aiResult) {
      await sock.sendMessage(chatId, {
        text: `🐺 _I'm having trouble connecting right now. Try again in a moment._`
      }, { quoted: msg });
      return true;
    }

    const cleanedResponse = cleanAIResponse(aiResult.response);

    conversation.messages.push({ role: 'user', content: userText });
    conversation.messages.push({ role: 'assistant', content: cleanedResponse });
    saveConversation(senderJid, conversation);

    config.stats.totalQueries = (config.stats.totalQueries || 0) + 1;
    config.stats.modelsUsed = config.stats.modelsUsed || {};
    config.stats.modelsUsed[aiResult.model] = (config.stats.modelsUsed[aiResult.model] || 0) + 1;
    saveConfig(config);

    let responseText = '';
    if (cleanedResponse.length > 2000) {
      responseText = `🐺 ${cleanedResponse.substring(0, 2000)}\n\n_... (trimmed)_`;
    } else {
      responseText = `🐺 ${cleanedResponse}`;
    }

    await sock.sendMessage(chatId, { text: responseText }, { quoted: msg });
    return true;
  } catch (error) {
    console.error('[W.O.L.F] Chat error:', error.message);
    return false;
  }
}

export default {
  name: 'chatbot',
  description: 'W.O.L.F - Wise Operational Learning Framework | AI Chatbot System',
  category: 'ai',
  aliases: ['wolf', 'wolfchat', 'aichat', 'wolfbot'],
  usage: 'chatbot <on|off|groups|dms|both|model>',
  ownerOnly: true,

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const config = loadConfig();
    const subCommand = (args[0] || '').toLowerCase();

    if (!subCommand || subCommand === 'help') {
      const modeEmoji = {
        off: '🔴', on: '🟢', groups: '👥', dms: '💬', both: '🌐'
      };
      const currentModel = AI_MODELS[config.preferredModel] || AI_MODELS.gpt;

      const allowedGroups = config.allowedGroups || [];
      const allowedDMs = config.allowedDMs || [];
      const whitelistInfo = (allowedGroups.length > 0 || allowedDMs.length > 0)
        ? `│ 📋 Whitelist: ${allowedGroups.length} groups, ${allowedDMs.length} DMs\n`
        : '';

      const helpText =
        `╭─⌈ 🐺 *W.O.L.F CHATBOT* ⌋\n` +
        `│ ${modeEmoji[config.mode] || '🔴'} Status: ${config.mode.toUpperCase()}\n` +
        `│ ${currentModel.icon} Model: ${currentModel.name}\n` +
        whitelistInfo +
        `├─⊷ *${PREFIX}chatbot on*\n│  └⊷ Enable everywhere\n` +
        `├─⊷ *${PREFIX}chatbot off*\n│  └⊷ Disable chatbot\n` +
        `├─⊷ *${PREFIX}chatbot groups*\n│  └⊷ Groups only\n` +
        `├─⊷ *${PREFIX}chatbot dms*\n│  └⊷ DMs only\n` +
        `├─⊷ *${PREFIX}chatbot both*\n│  └⊷ All chats\n` +
        `├─⊷ *${PREFIX}chatbot model*\n│  └⊷ Switch AI model\n` +
        `├─⊷ *${PREFIX}chatbot stats*\n│  └⊷ View stats\n` +
        `├─⊷ *${PREFIX}chatbot clear*\n│  └⊷ Reset history\n` +
        `├─⊷ *${PREFIX}chatbot settings*\n│  └⊷ View config\n` +
        `├─⌈ 📋 *WHITELIST* ⌋\n` +
        `├─⊷ *${PREFIX}chatbot addgroup*\n│  └⊷ Add this group\n` +
        `├─⊷ *${PREFIX}chatbot removegroup*\n│  └⊷ Remove this group\n` +
        `├─⊷ *${PREFIX}chatbot listgroups*\n│  └⊷ List allowed groups\n` +
        `├─⊷ *${PREFIX}chatbot cleargroups*\n│  └⊷ Clear all groups\n` +
        `├─⊷ *${PREFIX}chatbot adddm <number>*\n│  └⊷ Add a DM\n` +
        `├─⊷ *${PREFIX}chatbot removedm <number>*\n│  └⊷ Remove a DM\n` +
        `├─⊷ *${PREFIX}chatbot listdms*\n│  └⊷ List allowed DMs\n` +
        `├─⊷ *${PREFIX}chatbot cleardms*\n│  └⊷ Clear all DMs\n` +
        `╰───`;

      return sock.sendMessage(jid, { text: helpText }, { quoted: m });
    }

    if (['on', 'off', 'groups', 'dms', 'both'].includes(subCommand)) {
      config.mode = subCommand;
      saveConfig(config);

      const modeDescriptions = {
        on: '🟢 W.O.L.F is now *ACTIVE* everywhere!',
        off: '🔴 W.O.L.F is now *DISABLED*.',
        groups: '👥 W.O.L.F is now active in *GROUPS ONLY*.',
        dms: '💬 W.O.L.F is now active in *DMs ONLY*.',
        both: '🌐 W.O.L.F is now active in *ALL CHATS*.'
      };

      return sock.sendMessage(jid, {
        text: `🐺 *W.O.L.F*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${modeDescriptions[subCommand]}\n\n🤖 *Model:* ${(AI_MODELS[config.preferredModel] || AI_MODELS.gpt).name}\n⚡ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    if (subCommand === 'model') {
      const modelName = (args[1] || '').toLowerCase();

      if (!modelName) {
        let modelList = `🐺 *W.O.L.F - AI Models*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        for (const [key, model] of Object.entries(AI_MODELS)) {
          const isActive = key === (config.preferredModel || 'gpt');
          modelList += `${model.icon} *${model.name}* (\`${key}\`) ${isActive ? '✅' : ''}\n`;
        }

        modelList += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        modelList += `Switch: \`${PREFIX}chatbot model <key>\``;

        return sock.sendMessage(jid, { text: modelList }, { quoted: m });
      }

      if (!AI_MODELS[modelName]) {
        const validModels = Object.keys(AI_MODELS).join(', ');
        return sock.sendMessage(jid, {
          text: `❌ Unknown model: *${modelName}*\n\n*Available:* ${validModels}`
        }, { quoted: m });
      }

      config.preferredModel = modelName;
      saveConfig(config);

      const model = AI_MODELS[modelName];
      return sock.sendMessage(jid, {
        text: `🐺 *W.O.L.F*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${model.icon} Now using: *${model.name}*\n\nAuto-fallback enabled if unavailable.\n⚡ *Powered by ${getOwnerName().toUpperCase()} TECH*`
      }, { quoted: m });
    }

    if (subCommand === 'stats') {
      const stats = config.stats || { totalQueries: 0, modelsUsed: {}, mediaActions: {} };
      let statsText = `🐺 *W.O.L.F Stats*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                      `📊 *Total Queries:* ${stats.totalQueries}\n` +
                      `🤖 *Model:* ${(AI_MODELS[config.preferredModel] || AI_MODELS.gpt).name}\n` +
                      `📡 *Mode:* ${config.mode.toUpperCase()}\n\n`;

      if (Object.keys(stats.modelsUsed || {}).length > 0) {
        statsText += `🔄 *AI Usage:*\n`;
        const sorted = Object.entries(stats.modelsUsed).sort((a, b) => b[1] - a[1]);
        for (const [modelKey, count] of sorted) {
          const model = AI_MODELS[modelKey];
          if (model) statsText += `  ${model.icon} ${model.name}: ${count}\n`;
        }
        statsText += `\n`;
      }

      if (Object.keys(stats.mediaActions || {}).length > 0) {
        const mediaEmojis = { image: '🎨', playAudio: '🎵', playVideo: '🎬', song: '🎶' };
        const mediaLabels = { image: 'Images', playAudio: 'Music', playVideo: 'Videos', song: 'Songs' };
        statsText += `🎯 *Media Actions:*\n`;
        for (const [key, count] of Object.entries(stats.mediaActions)) {
          statsText += `  ${mediaEmojis[key] || '📦'} ${mediaLabels[key] || key}: ${count}\n`;
        }
      }

      statsText += `\n⚡ *Powered by ${getOwnerName().toUpperCase()} TECH*`;

      return sock.sendMessage(jid, { text: statsText }, { quoted: m });
    }

    if (subCommand === 'clear') {
      const senderJid = m.key.participant || jid;
      clearConversation(senderJid);
      clearPendingAction(senderJid, jid);

      return sock.sendMessage(jid, {
        text: `🐺 *W.O.L.F*\n\n🗑️ Conversation history cleared!`
      }, { quoted: m });
    }

    if (subCommand === 'settings') {
      const model = AI_MODELS[config.preferredModel] || AI_MODELS.gpt;
      const modeEmoji = { off: '🔴', on: '🟢', groups: '👥', dms: '💬', both: '🌐' };

      const aGroups = config.allowedGroups || [];
      const aDMs = config.allowedDMs || [];
      let whitelistSection = '';
      if (aGroups.length > 0 || aDMs.length > 0) {
        whitelistSection = `\n📋 *Whitelist:*\n`;
        if (aGroups.length > 0) {
          whitelistSection += `  👥 ${aGroups.length} group(s)\n`;
        }
        if (aDMs.length > 0) {
          whitelistSection += `  💬 ${aDMs.length} DM(s)\n`;
        }
      }

      const settingsText =
        `🐺 *W.O.L.F Settings*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `${modeEmoji[config.mode] || '🔴'} *Mode:* ${config.mode.toUpperCase()}\n` +
        `${model.icon} *Model:* ${model.name}\n` +
        `🔄 *Auto-Fallback:* Enabled\n` +
        `💾 *Memory:* 20 msgs (1hr timeout)\n` +
        `🎯 *Interactive:* Images, Music, Videos\n` +
        `📊 *Queries:* ${config.stats?.totalQueries || 0}\n` +
        whitelistSection + `\n` +
        `🤖 *Models (${Object.keys(AI_MODELS).length}):*\n` +
        Object.entries(AI_MODELS).map(([k, v]) => `  ${v.icon} ${v.name} (\`${k}\`)`).join('\n') +
        `\n\n⚡ *Powered by ${getOwnerName().toUpperCase()} TECH*`;

      return sock.sendMessage(jid, { text: settingsText }, { quoted: m });
    }

    if (subCommand === 'addgroup') {
      if (!jid.endsWith('@g.us')) {
        return sock.sendMessage(jid, {
          text: `❌ This command must be used inside a group chat.`
        }, { quoted: m });
      }
      if (!config.allowedGroups) config.allowedGroups = [];
      if (config.allowedGroups.includes(jid)) {
        return sock.sendMessage(jid, {
          text: `⚠️ This group is already in the whitelist.`
        }, { quoted: m });
      }
      config.allowedGroups.push(jid);
      saveConfig(config);
      let groupName = jid.split('@')[0];
      const cached = globalThis.groupMetadataCache?.get(jid);
      if (cached?.data?.subject) groupName = cached.data.subject;
      return sock.sendMessage(jid, {
        text: `🐺 *W.O.L.F*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n✅ Group added to whitelist!\n\n👥 *Group:* ${groupName}\n📋 *Total:* ${config.allowedGroups.length} group(s)\n\n_W.O.L.F will only respond in whitelisted chats._`
      }, { quoted: m });
    }

    if (subCommand === 'removegroup') {
      if (!jid.endsWith('@g.us')) {
        return sock.sendMessage(jid, {
          text: `❌ This command must be used inside a group chat.`
        }, { quoted: m });
      }
      if (!config.allowedGroups) config.allowedGroups = [];
      const idx = config.allowedGroups.indexOf(jid);
      if (idx === -1) {
        return sock.sendMessage(jid, {
          text: `⚠️ This group is not in the whitelist.`
        }, { quoted: m });
      }
      config.allowedGroups.splice(idx, 1);
      saveConfig(config);
      return sock.sendMessage(jid, {
        text: `🐺 *W.O.L.F*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🗑️ Group removed from whitelist!\n📋 *Remaining:* ${config.allowedGroups.length} group(s)`
      }, { quoted: m });
    }

    if (subCommand === 'listgroups') {
      const groups = config.allowedGroups || [];
      if (groups.length === 0) {
        return sock.sendMessage(jid, {
          text: `🐺 *W.O.L.F*\n\n📋 No groups in whitelist.\n_W.O.L.F responds in all groups based on mode._`
        }, { quoted: m });
      }
      let listText = `🐺 *W.O.L.F - Whitelisted Groups*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      for (let i = 0; i < groups.length; i++) {
        const gid = groups[i];
        let gName = gid.split('@')[0];
        const cached = globalThis.groupMetadataCache?.get(gid);
        if (cached?.data?.subject) gName = cached.data.subject;
        listText += `${i + 1}. 👥 *${gName}*\n`;
      }
      listText += `\n📋 *Total:* ${groups.length} group(s)`;
      return sock.sendMessage(jid, { text: listText }, { quoted: m });
    }

    if (subCommand === 'cleargroups') {
      config.allowedGroups = [];
      saveConfig(config);
      return sock.sendMessage(jid, {
        text: `🐺 *W.O.L.F*\n\n🗑️ All groups removed from whitelist!\n_W.O.L.F will respond based on mode setting._`
      }, { quoted: m });
    }

    if (subCommand === 'adddm') {
      const number = (args[1] || '').replace(/[^0-9]/g, '');
      if (!number || number.length < 7) {
        return sock.sendMessage(jid, {
          text: `❌ Please provide a valid phone number.\n\n*Usage:* \`${PREFIX}chatbot adddm 2547xxxxxxxx\``
        }, { quoted: m });
      }
      if (!config.allowedDMs) config.allowedDMs = [];
      const dmJid = `${number}@s.whatsapp.net`;
      const exists = config.allowedDMs.some(dm => {
        const normDM = dm.split('@')[0].split(':')[0];
        return normDM === number;
      });
      if (exists) {
        return sock.sendMessage(jid, {
          text: `⚠️ +${number} is already in the DM whitelist.`
        }, { quoted: m });
      }
      config.allowedDMs.push(dmJid);
      saveConfig(config);
      return sock.sendMessage(jid, {
        text: `🐺 *W.O.L.F*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n✅ DM added to whitelist!\n\n💬 *Number:* +${number}\n📋 *Total:* ${config.allowedDMs.length} DM(s)\n\n_W.O.L.F will only respond in whitelisted DMs._`
      }, { quoted: m });
    }

    if (subCommand === 'removedm') {
      const number = (args[1] || '').replace(/[^0-9]/g, '');
      if (!number || number.length < 7) {
        return sock.sendMessage(jid, {
          text: `❌ Please provide a valid phone number.\n\n*Usage:* \`${PREFIX}chatbot removedm 2547xxxxxxxx\``
        }, { quoted: m });
      }
      if (!config.allowedDMs) config.allowedDMs = [];
      const idx = config.allowedDMs.findIndex(dm => {
        const normDM = dm.split('@')[0].split(':')[0];
        return normDM === number;
      });
      if (idx === -1) {
        return sock.sendMessage(jid, {
          text: `⚠️ +${number} is not in the DM whitelist.`
        }, { quoted: m });
      }
      config.allowedDMs.splice(idx, 1);
      saveConfig(config);
      return sock.sendMessage(jid, {
        text: `🐺 *W.O.L.F*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🗑️ DM removed from whitelist!\n\n💬 *Number:* +${number}\n📋 *Remaining:* ${config.allowedDMs.length} DM(s)`
      }, { quoted: m });
    }

    if (subCommand === 'listdms') {
      const dms = config.allowedDMs || [];
      if (dms.length === 0) {
        return sock.sendMessage(jid, {
          text: `🐺 *W.O.L.F*\n\n📋 No DMs in whitelist.\n_W.O.L.F responds in all DMs based on mode._`
        }, { quoted: m });
      }
      let listText = `🐺 *W.O.L.F - Whitelisted DMs*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      for (let i = 0; i < dms.length; i++) {
        const num = dms[i].split('@')[0].split(':')[0];
        listText += `${i + 1}. 💬 *+${num}*\n`;
      }
      listText += `\n📋 *Total:* ${dms.length} DM(s)`;
      return sock.sendMessage(jid, { text: listText }, { quoted: m });
    }

    if (subCommand === 'cleardms') {
      config.allowedDMs = [];
      saveConfig(config);
      return sock.sendMessage(jid, {
        text: `🐺 *W.O.L.F*\n\n🗑️ All DMs removed from whitelist!\n_W.O.L.F will respond based on mode setting._`
      }, { quoted: m });
    }

    return sock.sendMessage(jid, {
      text: `❌ Unknown option: *${subCommand}*\n\nUse \`${PREFIX}chatbot\` to see commands.`
    }, { quoted: m });
  }
};
