// ====== commands/ai/chatbot.js ======
// W.O.L.F Chatbot — a public-facing AI assistant for group chats and DMs.
//
// Unlike Wolf AI (lib/wolfai.js) which is a private JARVIS for the owner,
// the chatbot is designed for regular users.  It responds to free-form text
// in groups and DMs when chatbot mode is active.
//
// Features:
//   • Multi-turn conversation memory (last 20 messages, 1-hour expiry)
//   • Intent detection — recognises requests like "play a song", "make an image"
//     and executes the corresponding bot command
//   • Pending action flow — if the user says "play something" without specifying
//     a song, the bot asks what they want and waits for the follow-up
//   • Automatic fallback through 7 AI models in priority order
//   • Full identity scrubbing (GPT, Claude, etc. → chatbot name)
//
// Config stored in data/chatbot/chatbot_config_<botId>.json:
//   mode           — off | on | groups | dms | both
//   preferredModel — which AI model to try first
//   chatbotName    — the chatbot's display name (default: "W.O.L.F")
//   allowedGroups  — whitelist of group JIDs (if set, only these groups)
//   allowedDMs     — whitelist of DM numbers (if set, only these contacts)
//   stats          — running counters for total queries and media actions
//
// Conversations stored in data/chatbot/conversations/<botId>/<userId>.json
// (one file per WhatsApp JID, trimmed to last 20 messages).

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { normalizeMessageContent, jidNormalizedUser } from '@whiskeysockets/baileys';
import supabase from '../../lib/database.js';
import { getOwnerName } from '../../lib/menuHelper.js';
import { getPhoneFromLid } from '../../lib/sudo-store.js';

// ── Data directory paths ───────────────────────────────────────────────────
const DATA_DIR         = './data/chatbot';
const CONVERSATIONS_DIR = path.join(DATA_DIR, 'conversations');

// ── Bot ID helpers ─────────────────────────────────────────────────────────
// Each bot number gets its own config and conversation directory so two bot
// numbers on the same host don't share state.

function getBotId() {
  // Try the database-stored ID first
  const dbId = supabase.getConfigBotId ? supabase.getConfigBotId() : 'default';
  if (dbId && dbId !== 'default') {
    const candidate = path.join(DATA_DIR, `chatbot_config_${dbId}.json`);
    if (fs.existsSync(candidate)) return dbId;
  }
  // Fallback: use the owner's phone number from globals (covers LID-vs-phone mismatch)
  const ownerNum = (global.OWNER_CLEAN_NUMBER || global.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
  if (ownerNum) {
    const candidate = path.join(DATA_DIR, `chatbot_config_${ownerNum}.json`);
    if (fs.existsSync(candidate)) return ownerNum;
  }
  // Last resort: scan data/chatbot/ for any existing config file
  try {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('chatbot_config_') && f.endsWith('.json'));
    if (files.length > 0) {
      const match = files[0].replace('chatbot_config_', '').replace('.json', '');
      return match;
    }
  } catch {}
  return ownerNum || dbId || 'default';
}

// Return the path to the config JSON file for this bot instance.
function getConfigFile() {
  const botId = getBotId();
  return path.join(DATA_DIR, `chatbot_config_${botId}.json`);
}

// Return the path to the per-bot conversations directory.
function getConversationsDir() {
  const botId = getBotId();
  return path.join(DATA_DIR, 'conversations', botId);
}

// ── Pending actions ────────────────────────────────────────────────────────
// When the chatbot detects a vague intent (e.g. "play something") it asks
// a clarifying question and waits for the next message from the same sender.
// pendingActions maps "senderJid::chatId" → { type, command, timestamp }.
// Actions expire after 2 minutes to avoid stale state.
const pendingActions   = new Map();
const PENDING_TIMEOUT  = 120000; // 2 minutes

// ══════════════════════════════════════════════════════════════════════════
// SECTION 1 — AI model registry
// ══════════════════════════════════════════════════════════════════════════
// 7 AI backends in priority order.  The chatbot tries each one until it
// gets a usable response.  Falls back to a simple bare query to GPT if all
// model+context calls fail.

const AI_MODELS = {
  gpt: {
    name: 'GPT-5', icon: '🤖',
    url: 'https://iamtkm.vercel.app/ai/gpt5', method: 'GET',
    params: (q) => ({ apikey: 'tkm', text: q }),
    extract: (data) => data?.result || data?.response || data?.answer || null
  },
  copilot: {
    name: 'Copilot', icon: '🧠',
    url: 'https://iamtkm.vercel.app/ai/copilot', method: 'GET',
    params: (q) => ({ apikey: 'tkm', text: q }),
    extract: (data) => data?.result || data?.response || data?.answer || null
  },
  claude: {
    name: 'Claude AI', icon: '🔮',
    url: 'https://apiskeith.vercel.app/ai/claudeai', method: 'GET',
    params: (q) => ({ q }),
    extract: (data) => data?.result || data?.response || data?.answer || data?.text || data?.content || null
  },
  grok: {
    name: 'Grok', icon: '⚡',
    url: 'https://apiskeith.vercel.app/ai/grok', method: 'GET',
    params: (q) => ({ q }),
    extract: (data) => data?.result || data?.response || data?.answer || data?.text || null
  },
  blackbox: {
    name: 'Blackbox', icon: '🖥️',
    url: 'https://apiskeith.vercel.app/ai/blackbox', method: 'GET',
    params: (q) => ({ q }),
    extract: (data) => data?.result || data?.response || data?.answer || data?.solution || null
  },
  bard: {
    name: 'Google Bard', icon: '🌐',
    url: 'https://apiskeith.vercel.app/ai/bard', method: 'GET',
    params: (q) => ({ q }),
    extract: (data) => data?.result || data?.response || data?.answer || null
  },
  perplexity: {
    name: 'Perplexity', icon: '🔍',
    url: 'https://apiskeith.vercel.app/ai/perplexity', method: 'GET',
    params: (q) => ({ q }),
    extract: (data) => data?.result || data?.response || data?.answer || null
  }
};

// Order to try AI models — fastest/most reliable first
const MODEL_PRIORITY = ['gpt', 'copilot', 'claude', 'blackbox', 'grok', 'bard', 'perplexity'];

// ══════════════════════════════════════════════════════════════════════════
// SECTION 2 — Intent detection
// ══════════════════════════════════════════════════════════════════════════
// Before sending a message to the AI, the chatbot tries to detect whether
// the user wants a specific media action (generate image, play song, etc.).
// If an action is detected, the bot executes the corresponding command
// instead of (or in addition to) replying with text.

// Emoji reactions sent while the media command is running (visual feedback)
const MEDIA_REACTIONS = {
  imagine: '🎨',
  play:    '🎵',
  video:   '🎬',
  song:    '🎶'
};

// Prompts sent when the user's request is too vague (no specific target given)
const MEDIA_PROMPTS = {
  image:     { ask: `Sure! Describe the image you'd like me to generate 🎨`,        confirm: `Got it! Let me create that for you... 🎨`      },
  playAudio: { ask: `Of course! What song or music would you like me to play? 🎵`,  confirm: `Great choice! Let me find that for you... 🎵`   },
  playVideo: { ask: `Sure thing! What video would you like me to find? 🎬`,          confirm: `On it! Finding that video for you... 🎬`        },
  song:      { ask: `Sure! Which song would you like me to download? 🎶`,            confirm: `Alright! Downloading that for you... 🎶`         }
};

// INTENT_PATTERNS — one entry per action type.
// Each entry has:
//   vaguePatterns   — regex list matching requests without a specific target
//                     ("generate an image" — needs a follow-up question)
//   specificPatterns — regex list matching requests with a clear target
//                     ("generate an image of a sunset" — execute immediately)
//   extractQuery    — function that strips filler words from the matched text
//                     to produce a clean search query
//   command         — the bot command name to execute
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

// Try to detect a media action intent from a free-form text message.
// Returns { type, command, query, vague } or null.
// `vague` is true when the request is missing a specific target.
function detectIntent(text) {
  const trimmed = text.trim();
  if (trimmed.length < 4) return null;

  for (const [intentKey, intent] of Object.entries(INTENT_PATTERNS)) {
    // Skip playAudio if the message already looks like a video request
    if (intentKey === 'playAudio') {
      const isVideo = INTENT_PATTERNS.playVideo.vaguePatterns.some(p => p.test(trimmed)) ||
                      INTENT_PATTERNS.playVideo.specificPatterns.some(p => p.test(trimmed));
      if (isVideo) continue;
    }

    // Vague patterns match first — these trigger the clarifying question flow
    for (const pattern of intent.vaguePatterns) {
      if (pattern.test(trimmed)) {
        return { type: intentKey, command: intent.command, query: '', vague: true };
      }
    }

    // Specific patterns match when a query target is present — execute immediately
    for (const pattern of intent.specificPatterns) {
      if (pattern.test(trimmed)) {
        const query = intent.extractQuery(trimmed);
        if (query && query.length >= 2) {
          return { type: intentKey, command: intent.command, query, vague: false };
        }
      }
    }
  }

  return null; // no media intent detected — treat as a regular AI chat message
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 3 — Pending action management
// ══════════════════════════════════════════════════════════════════════════

// Composite key so two different senders in the same group don't share state
function pendingKey(senderJid, chatId) {
  return `${senderJid}::${chatId}`;
}

// Record a pending clarification action.  Auto-expires after PENDING_TIMEOUT ms.
function setPendingAction(senderJid, chatId, actionType, command) {
  const key = pendingKey(senderJid, chatId);
  pendingActions.set(key, { type: actionType, command, timestamp: Date.now() });
  // Self-cleaning timer to prevent stale entries in the Map
  setTimeout(() => {
    const pending = pendingActions.get(key);
    if (pending && Date.now() - pending.timestamp >= PENDING_TIMEOUT) {
      pendingActions.delete(key);
    }
  }, PENDING_TIMEOUT);
}

// Retrieve the pending action for a sender, or null if expired/absent.
function getPendingAction(senderJid, chatId) {
  const key     = pendingKey(senderJid, chatId);
  const pending = pendingActions.get(key);
  if (!pending) return null;
  if (Date.now() - pending.timestamp > PENDING_TIMEOUT) {
    pendingActions.delete(key);
    return null;
  }
  return pending;
}

// Remove the pending action (after it has been resolved or cancelled)
function clearPendingAction(senderJid, chatId) {
  pendingActions.delete(pendingKey(senderJid, chatId));
}

// Words that cancel a pending action instead of answering it
const CANCEL_WORDS = ['cancel', 'nevermind', 'never mind', 'nvm', 'stop', 'nah', 'no', 'forget it', 'skip'];

// ══════════════════════════════════════════════════════════════════════════
// SECTION 4 — Config & conversation persistence
// ══════════════════════════════════════════════════════════════════════════

// Create the data directories if they don't exist
function ensureDataDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const convDir = getConversationsDir();
  if (!fs.existsSync(convDir)) fs.mkdirSync(convDir, { recursive: true });
}

// Load the chatbot config JSON.  Returns a safe default if the file is absent.
// Also attempts to pull the config from the SQLite database as a background
// update (in case the file was lost but the DB row survived).
function loadConfig() {
  ensureDataDirs();
  const defaultConfig = { mode: 'off', preferredModel: 'gpt', allowedGroups: [], allowedDMs: [], stats: { totalQueries: 0, modelsUsed: {} } };
  const configFile    = getConfigFile();
  try {
    if (fs.existsSync(configFile)) {
      return JSON.parse(fs.readFileSync(configFile, 'utf8'));
    }
  } catch {}
  // Trigger a background DB read to restore the file if it's missing
  if (supabase.isAvailable()) {
    const botId = getBotId();
    supabase.getAll('chatbot_config', { key: 'main', bot_id: botId }).then(rows => {
      const data = rows?.[0];
      if (data && data.config) {
        try { fs.writeFileSync(configFile, JSON.stringify(data.config, null, 2)); } catch {}
      }
    }).catch(() => {});
  }
  return defaultConfig;
}

// Save the config to disk and to the SQLite database (dual-write for resilience).
function saveConfig(config) {
  ensureDataDirs();
  const configFile = getConfigFile();
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  const botId = getBotId();
  supabase.upsert('chatbot_config', { key: 'main', config, bot_id: botId, updated_at: new Date().toISOString() }, 'key,bot_id').catch(() => {});
}

// Return the path to a user's conversation file.
// Special characters in the JID are replaced with _ so it's a safe filename.
function getConversationFile(userId) {
  const convDir = getConversationsDir();
  return path.join(convDir, `${userId.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
}

// Load the conversation history for a user.
// Returns an empty history if the file is absent or older than 1 hour.
// Also attempts a background restore from the SQLite database.
function loadConversation(userId) {
  ensureDataDirs();
  const file = getConversationFile(userId);
  try {
    if (fs.existsSync(file)) {
      const data   = JSON.parse(fs.readFileSync(file, 'utf8'));
      const oneHour = 60 * 60 * 1000;
      if (Date.now() - (data.lastActive || 0) > oneHour) {
        // Conversation is stale — return a fresh one
        return { messages: [], lastActive: Date.now(), model: null };
      }
      return data;
    }
  } catch {}
  // Background restore from DB if the file is missing
  if (supabase.isAvailable()) {
    const sanitizedId = userId.replace(/[^a-zA-Z0-9]/g, '_');
    const botId       = getBotId();
    supabase.getAll('chatbot_conversations', { user_id: sanitizedId, bot_id: botId }).then(rows => {
      const data = rows?.[0];
      if (data && data.conversation) {
        try { ensureDataDirs(); fs.writeFileSync(file, JSON.stringify(data.conversation, null, 2)); } catch {}
      }
    }).catch(() => {});
  }
  return { messages: [], lastActive: Date.now(), model: null };
}

// Save a user's conversation to disk and to the SQLite database.
// Trims to the last 20 messages to keep files small.
function saveConversation(userId, conversation) {
  ensureDataDirs();
  const file           = getConversationFile(userId);
  conversation.lastActive = Date.now();
  if (conversation.messages.length > 20) {
    conversation.messages = conversation.messages.slice(-20);
  }
  fs.writeFileSync(file, JSON.stringify(conversation, null, 2));
  const botId = getBotId();
  supabase.upsert('chatbot_conversations', {
    user_id:      userId.replace(/[^a-zA-Z0-9]/g, '_'),
    conversation,
    bot_id:       botId,
    last_updated: new Date().toISOString()
  }, 'user_id,bot_id').catch(() => {});
}

// Delete a user's conversation file and DB row (used by ?chatbot clear).
function clearConversation(userId) {
  const file = getConversationFile(userId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const botId       = getBotId();
  const sanitizedId = userId.replace(/[^a-zA-Z0-9]/g, '_');
  // Use raw query because supabase.removeWhere doesn't support parameterised queries
  supabase.query(
    `DELETE FROM chatbot_conversations WHERE user_id = $1 AND bot_id = $2`,
    [sanitizedId, botId]
  ).catch(() => {});
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 5 — AI query engine
// ══════════════════════════════════════════════════════════════════════════

// Build the AI prompt with system instructions + conversation history.
// The system instructions tell the AI to identify as `botName` (not GPT/Claude)
// and to keep replies short and conversational.
function buildContextPrompt(conversation, newQuery, botName = 'W.O.L.F') {
  const n = botName;
  let context = `You are ${n}, an elite AI assistant created by WolfTech. Your name is ${n} and you must always identify yourself as ${n} when asked who you are. You are intelligent, conversational, and helpful. You remember the conversation context and respond naturally like a real chat partner. Keep responses SHORT and CONCISE — aim for 2-3 sentences maximum unless the question genuinely requires more detail.\n\nCRITICAL IDENTITY RULES:\n- Your name is ${n}. Always refer to yourself as ${n}.\n- You were created by WolfTech. Never say you were made by OpenAI, Google, Anthropic, Microsoft, Meta, xAI, or any other company.\n- Never reveal or mention any underlying AI model (GPT, Claude, Copilot, Grok, Bard, Blackbox, Perplexity, LLaMA, Gemini, etc).\n- If asked what you are, say: "I'm ${n}, an AI assistant by WolfTech."\n- Never say "As an AI language model" - instead say "As ${n}" if needed.\n- You are not ChatGPT, not Claude, not Bard, not Copilot. You are ${n}.\n\n`;

  // Append the last 6 messages of conversation history for context
  if (conversation.messages.length > 0) {
    context += `Previous conversation:\n`;
    const recentMessages = conversation.messages.slice(-6);
    for (const msg of recentMessages) {
      context += `${msg.role === 'user' ? 'Human' : n}: ${msg.content}\n`;
    }
    context += `\n`;
  }

  context += `Human: ${newQuery}\n${n}:`;
  return context;
}

// Call a single AI model.  Returns the extracted response text or null.
async function queryAI(modelKey, prompt, timeout = 35000) {
  const model = AI_MODELS[modelKey];
  if (!model) return null;

  try {
    const response = await axios({
      method: model.method, url: model.url,
      params: model.params(prompt), timeout,
      headers: { 'User-Agent': 'WOLF-Chatbot/2.0', 'Accept': 'application/json', 'Cache-Control': 'no-cache' },
      validateStatus: (status) => status >= 200 && status < 500
    });

    if (response.data && typeof response.data === 'object') {
      const result = model.extract(response.data);
      if (result && typeof result === 'string' && result.trim().length > 5) {
        const lower = result.toLowerCase();
        if (lower.includes('error:') || lower.startsWith('error') || lower.includes('unavailable')) return null;
        return result.trim();
      }
    } else if (typeof response.data === 'string' && response.data.trim().length > 5) {
      return response.data.trim();
    }
  } catch {}

  return null;
}

// Try every model in MODEL_PRIORITY order using the full context prompt.
// If all fail, fall back to sending just the bare user query to GPT.
// Returns { response, model } or null.
async function getAIResponse(query, conversation, preferredModel = 'gpt', botName = 'W.O.L.F') {
  const contextPrompt = buildContextPrompt(conversation, query, botName);

  // Try the preferred model first
  let result = await queryAI(preferredModel, contextPrompt);
  if (result) return { response: result, model: preferredModel };

  // Try all other models in priority order
  for (const modelKey of MODEL_PRIORITY) {
    if (modelKey === preferredModel) continue;
    result = await queryAI(modelKey, contextPrompt);
    if (result) return { response: result, model: modelKey };
  }

  // Last resort: bare query without conversation history
  result = await queryAI('gpt', query);
  if (result) return { response: result, model: 'gpt' };

  return null;
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 6 — Response cleaning and trimming
// ══════════════════════════════════════════════════════════════════════════

// Strip AI brand names, role prefixes, citation markers, and repeated blank
// lines from the AI's response, and replace all brand names with `botName`.
function cleanAIResponse(text, botName = 'W.O.L.F') {
  if (!text) return '';
  const n        = botName;
  const nEscaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  text = text.replace(/\[\d+\]/g, '');                                        // [1] citation markers
  text = text.replace(/Human:.*$/gm, '');                                     // echoed Human: lines
  text = text.replace(new RegExp(`^${nEscaped}:\\s*`, 'gim'), '');            // echoed "BotName:" prefix
  text = text.replace(/^(Assistant|AI|Bot|Claude|GPT|Grok|Copilot|Bard):\s*/gim, '');

  // Replace all known AI brand names with the configured bot name
  text = text.replace(/\b(ChatGPT|GPT-?[34o5]?|GPT|OpenAI)\b/gi, n);
  text = text.replace(/\b(Claude|Anthropic)\b/gi, n);
  text = text.replace(/\b(Copilot|Microsoft Copilot)\b/gi, n);
  text = text.replace(/\b(Google Bard|Bard|Gemini)\b/gi, n);
  text = text.replace(/\b(Grok|xAI)\b/gi, n);
  text = text.replace(/\b(Blackbox|Blackbox AI)\b/gi, n);
  text = text.replace(/\b(Perplexity|Perplexity AI)\b/gi, n);
  text = text.replace(/\b(LLaMA|Meta AI|Mistral)\b/gi, n);
  text = text.replace(/\bI'?m an AI (language )?model\b/gi, `I'm ${n}`);
  text = text.replace(/\bAs an AI (language )?model\b/gi, `As ${n}`);
  text = text.replace(/\bmade by (OpenAI|Google|Anthropic|Microsoft|Meta|xAI)\b/gi, 'made by WolfTech');
  text = text.replace(/\bcreated by (OpenAI|Google|Anthropic|Microsoft|Meta|xAI)\b/gi, 'created by WolfTech');
  text = text.replace(/\bdeveloped by (OpenAI|Google|Anthropic|Microsoft|Meta|xAI)\b/gi, 'developed by WolfTech');
  text = text.replace(/\bbuilt by (OpenAI|Google|Anthropic|Microsoft|Meta|xAI)\b/gi, 'built by WolfTech');
  text = text.replace(/\btrained by (OpenAI|Google|Anthropic|Microsoft|Meta|xAI)\b/gi, 'trained by WolfTech');

  // Collapse repeated bot name ("W.O.L.F W.O.L.F" → "W.O.L.F")
  text = text.replace(new RegExp(`(${nEscaped}[\\s,]*){2,}`, 'g'), `${n} `);
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  return text.trim();
}

// Trim the response to roughly 700 characters, cutting at a sentence boundary
// where possible.  Appends " _..._ " to indicate truncation.
function trimResponse(text, maxChars = 700) {
  if (!text || text.length <= maxChars) return text;

  const chunk = text.slice(0, maxChars + 100);
  const sentenceEnd = /[.!?](?:\s|$)/g;
  let lastGoodCut   = -1;
  let match;
  while ((match = sentenceEnd.exec(chunk)) !== null) {
    if (match.index + 1 <= maxChars) lastGoodCut = match.index + 1;
  }

  if (lastGoodCut > 50) return text.slice(0, lastGoodCut).trim() + ' _..._';

  // No good sentence break found — hard cut at word boundary
  const hardCut  = text.slice(0, maxChars);
  const lastSpace = hardCut.lastIndexOf(' ');
  return (lastSpace > 50 ? hardCut.slice(0, lastSpace) : hardCut).trim() + ' _..._';
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 7 — Public config helpers
// ══════════════════════════════════════════════════════════════════════════

// Return the full config object (used by the ?chatbot command).
export function getChatbotConfig() {
  return loadConfig();
}

// Returns true if the chatbot should respond in the given chat.
// Checks the mode setting and any group/DM whitelists.
export function isChatbotActiveForChat(chatId) {
  const config  = loadConfig();
  if (config.mode === 'off') return false;

  const isGroup = chatId.endsWith('@g.us');
  const isDM    = chatId.endsWith('@s.whatsapp.net') || chatId.endsWith('@lid');

  const allowedGroups = config.allowedGroups || [];
  const allowedDMs    = config.allowedDMs    || [];

  // If there is a whitelist for groups, only whitelisted groups get a response
  if (isGroup && allowedGroups.length > 0) {
    return allowedGroups.includes(chatId);
  }

  // If there is a whitelist for DMs, only whitelisted numbers get a response
  if (isDM && allowedDMs.length > 0) {
    const normalized = chatId.split('@')[0].split(':')[0];
    // If chatId is a LID (@lid), resolve it to a phone number for whitelist comparison.
    // Modern WhatsApp delivers DM remoteJid as a LID even when the whitelist stores phone numbers.
    let resolvedPhone = null;
    if (chatId.endsWith('@lid')) {
      const fromGlobal = globalThis.resolvePhoneFromLid?.(chatId);
      const fromCache  = globalThis.lidPhoneCache?.get(normalized) || globalThis.lidPhoneCache?.get(chatId);
      const fromStore  = getPhoneFromLid(normalized) || getPhoneFromLid(chatId);
      const raw = fromGlobal || fromCache || fromStore;
      if (raw) resolvedPhone = String(raw).replace(/[^0-9]/g, '');
    }
    // If we have a resolved phone number, enforce the whitelist
    if (resolvedPhone || !chatId.endsWith('@lid')) {
      return allowedDMs.some(dm => {
        const normDM = dm.split('@')[0].split(':')[0];
        if (normDM === normalized) return true;
        if (resolvedPhone && normDM === resolvedPhone) return true;
        return false;
      });
    }
    // LID couldn't be resolved — fall through to the mode check below.
    // The user explicitly set a mode, so honour it rather than silently blocking.
  }

  // No whitelist — use the mode setting
  if (config.mode === 'on'     || config.mode === 'both')   return true;
  if (config.mode === 'groups' && isGroup)                  return true;
  if (config.mode === 'dms'    && isDM)                     return true;

  return false;
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 8 — "Silent sock" proxy
// ══════════════════════════════════════════════════════════════════════════
// When the chatbot executes a bot command on behalf of a user (e.g. ?play),
// the command's internal text-only status messages should be suppressed —
// only the final media file or result should be sent.
//
// createSilentSock() wraps the real sock object in a Proxy that:
//   • Passes through all media messages (image, video, audio, sticker)
//   • Passes through emoji reactions
//   • Suppresses plain-text messages (status updates like "Downloading…")
//   • Suppresses message edits
function createSilentSock(sock, chatId, originalMsg) {
  const proxyHandler = {
    get(target, prop) {
      if (prop === 'sendMessage') {
        return async (jid, content, options = {}) => {
          // Always allow emoji reactions (progress/done indicators)
          if (content.react) return target.sendMessage(jid, content, options);

          // Always allow media with captions — prepend a user-friendly header
          if (content.image || content.video || content.audio || content.document || content.sticker) {
            if (content.caption) content.caption = `🐺 Here is your result!\n\n${content.caption}`;
            return target.sendMessage(jid, content, options);
          }

          // Suppress message edits (intermediate status updates)
          if (content.edit) return { key: { id: 'suppressed' } };

          // Suppress plain-text-only messages (e.g. "Downloading from YouTube…")
          if (content.text && !content.image && !content.video && !content.audio) {
            return { key: { id: 'suppressed' } };
          }

          return target.sendMessage(jid, content, options);
        };
      }
      // Pass all other properties through to the real sock unchanged
      const val = target[prop];
      if (typeof val === 'function') return val.bind(target);
      return val;
    }
  };
  return new Proxy(sock, proxyHandler);
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 9 — Media command execution
// ══════════════════════════════════════════════════════════════════════════

// Execute a bot command (e.g. "play", "imagine") on behalf of the chatbot.
// Uses the silent sock proxy so only the final result is sent, not the
// intermediate status messages.  Sends a reaction before and after.
// Returns true on success, false on error.
async function executeMediaCommand(sock, msg, commandName, query, commandsMap) {
  if (!commandsMap || !commandsMap.has(commandName)) return false;

  const command = commandsMap.get(commandName);
  if (!command || !command.execute) return false;

  try {
    const chatId   = msg.key.remoteJid;
    const reaction = MEDIA_REACTIONS[commandName] || '⚡';

    // Send the "working on it" emoji reaction
    await sock.sendMessage(chatId, { react: { text: reaction, key: msg.key } });

    const prefix = '.';
    const args   = query.split(/\s+/).filter(Boolean);

    // Build a fake message object so the command can read its own "text"
    const fakeMsg = {
      ...msg,
      message: {
        conversation:         `${prefix}${commandName} ${query}`,
        extendedTextMessage:  { text: `${prefix}${commandName} ${query}` }
      }
    };

    // Use the silent proxy so intermediate text replies are suppressed
    const silentSock = createSilentSock(sock, chatId, msg);
    await command.execute(silentSock, fakeMsg, args, prefix);

    // Send the "done" checkmark reaction
    await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
    return true;
  } catch (error) {
    console.error(`[W.O.L.F] Media command error (${commandName}):`, error.message);
    await sock.sendMessage(msg.key.remoteJid, { react: { text: '❌', key: msg.key } });
    return false;
  }
}

// Increment the media action counter in the config stats.
function trackMediaAction(intentType, config) {
  config.stats.totalQueries = (config.stats.totalQueries || 0) + 1;
  config.stats.mediaActions = config.stats.mediaActions || {};
  config.stats.mediaActions[intentType] = (config.stats.mediaActions[intentType] || 0) + 1;
  saveConfig(config);
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 10 — Main message handler
// ══════════════════════════════════════════════════════════════════════════

// Called by index.js for every message in a chat where the chatbot is active.
// Processing pipeline:
//   1. Extract text; ignore command-prefixed messages and empty messages.
//   2. Check for a pending clarification action from a previous turn.
//   3. Detect media intent (image/play/video/song).
//   4. If intent is vague → ask for clarification and set pendingAction.
//   5. If intent is specific → execute the command immediately.
//   6. If no intent → query the AI and send a text reply.
//
// `commandsMap` — the full Map of command name → command module (for intent execution).
// Returns true if the message was handled, false otherwise.
export async function handleChatbotMessage(sock, msg, commandsMap) {
  const chatId    = msg.key.remoteJid;
  const rawSender = msg.key.participant || chatId;
  const senderJid = jidNormalizedUser(rawSender);

  // Extract plain text from the message
  const normalized = normalizeMessageContent(msg.message);
  const textMsg    = normalized?.conversation || normalized?.extendedTextMessage?.text || '';

  if (!textMsg || textMsg.trim().length < 2) return false;

  const userText = textMsg.trim();

  // Ignore messages that look like bot commands (prefix-triggered)
  if (userText.startsWith('.') || userText.startsWith('/') || userText.startsWith('!')) {
    clearPendingAction(senderJid, chatId);
    return false;
  }

  // ── Pending action resolution ──────────────────────────────────────────
  // If the previous turn left a pending clarification, this message is the
  // user's answer (e.g. "What song?" → "Faded by Alan Walker").
  const pending = getPendingAction(senderJid, chatId);
  if (pending && commandsMap) {
    clearPendingAction(senderJid, chatId);

    // User cancelled the action
    if (CANCEL_WORDS.includes(userText.toLowerCase()) || userText.length < 3) {
      await sock.sendMessage(chatId, { text: `🐺 Alright, cancelled!` }, { quoted: msg });
      return true;
    }

    // Execute the pending command with the user's answer as the query
    const executed = await executeMediaCommand(sock, msg, pending.command, userText, commandsMap);
    if (executed) {
      const config = loadConfig();
      trackMediaAction(pending.type, config);

      // Record both turns in the conversation so context is preserved
      const conversation = loadConversation(senderJid);
      conversation.messages.push({ role: 'user',      content: userText });
      conversation.messages.push({ role: 'assistant', content: `[Executed ${pending.command}: ${userText}]` });
      saveConversation(senderJid, conversation);
      return true;
    }
  }

  // ── Media intent detection ─────────────────────────────────────────────
  const intent = detectIntent(userText);

  if (intent && commandsMap) {
    if (intent.vague) {
      // Vague request — ask for a specific target
      setPendingAction(senderJid, chatId, intent.type, intent.command);
      const promptInfo = MEDIA_PROMPTS[intent.type];
      await sock.sendMessage(chatId, {
        text: `🐺 ${promptInfo?.ask || 'Sure! What would you like?'}`
      }, { quoted: msg });

      // Record in conversation
      const conversation = loadConversation(senderJid);
      conversation.messages.push({ role: 'user',      content: userText });
      conversation.messages.push({ role: 'assistant', content: promptInfo?.ask || 'Sure! What would you like?' });
      saveConversation(senderJid, conversation);
      return true;
    }

    // Specific intent — execute immediately
    const executed = await executeMediaCommand(sock, msg, intent.command, intent.query, commandsMap);
    if (executed) {
      const config = loadConfig();
      trackMediaAction(intent.type, config);

      const conversation = loadConversation(senderJid);
      conversation.messages.push({ role: 'user',      content: userText });
      conversation.messages.push({ role: 'assistant', content: `[Executed ${intent.command}: ${intent.query}]` });
      saveConversation(senderJid, conversation);
      return true;
    }
  }

  // ── AI text response ───────────────────────────────────────────────────
  const config     = loadConfig();
  const botName    = config.chatbotName || 'W.O.L.F';
  const conversation = loadConversation(senderJid);

  try {
    await sock.sendPresenceUpdate('composing', chatId); // show "typing…"

    const aiResult = await getAIResponse(userText, conversation, config.preferredModel || 'gpt', botName);

    if (!aiResult) {
      await sock.sendMessage(chatId, {
        text: `🐺 _I'm having trouble connecting right now. Try again in a moment._`
      }, { quoted: msg });
      return true;
    }

    const cleanedResponse = cleanAIResponse(aiResult.response, botName);
    const finalResponse   = trimResponse(cleanedResponse);

    // Save both turns to conversation history
    conversation.messages.push({ role: 'user',      content: userText });
    conversation.messages.push({ role: 'assistant', content: cleanedResponse });
    saveConversation(senderJid, conversation);

    // Update query stats
    config.stats.totalQueries = (config.stats.totalQueries || 0) + 1;
    config.stats.modelsUsed   = config.stats.modelsUsed || {};
    config.stats.modelsUsed[aiResult.model] = (config.stats.modelsUsed[aiResult.model] || 0) + 1;
    saveConfig(config);

    await sock.sendMessage(chatId, { text: `🐺 ${finalResponse}` }, { quoted: msg });
    return true;
  } catch (error) {
    console.error(`[${botName}] Chat error:`, error.message);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 11 — ?chatbot command handler (default export)
// ══════════════════════════════════════════════════════════════════════════
// Handles all ?chatbot <subcommand> calls.  Owner-only.
//
// Sub-commands:
//   on / off / groups / dms / both — change chatbot mode
//   model [<key>]                  — list or switch AI model
//   name [<name>]                  — view or change chatbot name
//   stats                          — show query statistics
//   clear                          — reset conversation history for this user
//   settings                       — show full config
//   addgroup / removegroup         — whitelist / de-whitelist a group
//   listgroups / cleargroups       — manage group whitelist
//   adddm / removedm               — whitelist / de-whitelist a DM number
//   listdms / cleardms             — manage DM whitelist
//   (no args)                      — show the help menu
export default {
  name: 'chatbot',
  description: 'W.O.L.F - Wise Operational Learning Framework | AI Chatbot System',
  category: 'ai',
  aliases: ['wolf', 'wolfchat', 'aichat', 'wolfbot'],
  usage: 'chatbot <on|off|groups|dms|both|model>',
  ownerOnly: true,

  async execute(sock, m, args, PREFIX) {
    const jid        = m.key.remoteJid;
    const config     = loadConfig();
    const subCommand = (args[0] || '').toLowerCase();

    // ── No sub-command: show help / status card ──────────────────────────
    if (!subCommand || subCommand === 'help') {
      const modeEmoji  = { off: '🔴', on: '🟢', groups: '👥', dms: '💬', both: '🌐' };
      const currentModel = AI_MODELS[config.preferredModel] || AI_MODELS.gpt;

      const allowedGroups = config.allowedGroups || [];
      const allowedDMs    = config.allowedDMs    || [];
      const whitelistInfo = (allowedGroups.length > 0 || allowedDMs.length > 0)
        ? `│ 📋 Whitelist: ${allowedGroups.length} groups, ${allowedDMs.length} DMs\n`
        : '';

      const chatbotName = config.chatbotName || 'W.O.L.F';
      const helpText =
        `╭─⌈ 🐺 *${chatbotName} CHATBOT* ⌋\n` +
        `│ ${modeEmoji[config.mode] || '🔴'} Status: ${config.mode.toUpperCase()}\n` +
        `│ ${currentModel.icon} Model: ${currentModel.name}\n` +
        `│ 🏷️ Name: ${chatbotName}\n` +
        whitelistInfo +
        `├─⊷ *${PREFIX}chatbot on*\n│  └⊷ Enable everywhere\n` +
        `├─⊷ *${PREFIX}chatbot off*\n│  └⊷ Disable chatbot\n` +
        `├─⊷ *${PREFIX}chatbot groups*\n│  └⊷ Groups only\n` +
        `├─⊷ *${PREFIX}chatbot dms*\n│  └⊷ DMs only\n` +
        `├─⊷ *${PREFIX}chatbot both*\n│  └⊷ All chats\n` +
        `├─⊷ *${PREFIX}chatbot name <name>*\n│  └⊷ Set chatbot name\n` +
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

    // ── Mode toggle ──────────────────────────────────────────────────────
    if (['on', 'off', 'groups', 'dms', 'both'].includes(subCommand)) {
      config.mode = subCommand;
      saveConfig(config);

      const modeLabels = { on: '🟢 ON', off: '🔴 OFF', groups: '👥 GROUPS', dms: '💬 DMS', both: '🌐 ALL' };
      return sock.sendMessage(jid, {
        text: `✅ Chatbot mode set to: *${modeLabels[subCommand]}*`
      }, { quoted: m });
    }

    // ── Model selection ──────────────────────────────────────────────────
    if (subCommand === 'model') {
      const modelName = (args[1] || '').toLowerCase();

      if (!modelName) {
        const active = config.preferredModel || 'gpt';
        let modelList = `*AI Models:*\n`;
        for (const [key, model] of Object.entries(AI_MODELS)) {
          modelList += `${model.icon} ${model.name} (\`${key}\`)${key === active ? ' ✅' : ''}\n`;
        }
        modelList += `\nSwitch: \`${PREFIX}chatbot model <key>\``;
        return sock.sendMessage(jid, { text: modelList }, { quoted: m });
      }

      if (!AI_MODELS[modelName]) {
        const validModels = Object.keys(AI_MODELS).join(', ');
        return sock.sendMessage(jid, {
          text: `❌ Unknown model: *${modelName}*\nAvailable: ${validModels}`
        }, { quoted: m });
      }

      config.preferredModel = modelName;
      saveConfig(config);
      const model = AI_MODELS[modelName];
      return sock.sendMessage(jid, {
        text: `✅ Model set to: ${model.icon} *${model.name}*`
      }, { quoted: m });
    }

    // ── Stats ────────────────────────────────────────────────────────────
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
        const mediaEmojis  = { image: '🎨', playAudio: '🎵', playVideo: '🎬', song: '🎶' };
        const mediaLabels  = { image: 'Images', playAudio: 'Music', playVideo: 'Videos', song: 'Songs' };
        statsText += `🎯 *Media Actions:*\n`;
        for (const [key, count] of Object.entries(stats.mediaActions)) {
          statsText += `  ${mediaEmojis[key] || '📦'} ${mediaLabels[key] || key}: ${count}\n`;
        }
      }

      statsText += `\n⚡ *Powered by ${getOwnerName().toUpperCase()} TECH*`;
      return sock.sendMessage(jid, { text: statsText }, { quoted: m });
    }

    // ── Clear conversation history ────────────────────────────────────────
    if (subCommand === 'clear') {
      const senderJid = m.key.participant || jid;
      clearConversation(senderJid);
      clearPendingAction(senderJid, jid);
      return sock.sendMessage(jid, {
        text: `✅ Conversation history cleared`
      }, { quoted: m });
    }

    // ── Settings overview ─────────────────────────────────────────────────
    if (subCommand === 'settings') {
      const model     = AI_MODELS[config.preferredModel] || AI_MODELS.gpt;
      const modeEmoji = { off: '🔴', on: '🟢', groups: '👥', dms: '💬', both: '🌐' };

      const aGroups = config.allowedGroups || [];
      const aDMs    = config.allowedDMs    || [];
      let whitelistSection = '';
      if (aGroups.length > 0 || aDMs.length > 0) {
        whitelistSection = `\n📋 *Whitelist:*\n`;
        if (aGroups.length > 0) whitelistSection += `  👥 ${aGroups.length} group(s)\n`;
        if (aDMs.length    > 0) whitelistSection += `  💬 ${aDMs.length} DM(s)\n`;
      }

      const cbName = config.chatbotName || 'W.O.L.F';
      const settingsText =
        `🐺 *${cbName} Settings*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🏷️ *Name:* ${cbName}\n` +
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

    // ── Group whitelist management ────────────────────────────────────────

    if (subCommand === 'addgroup') {
      if (!jid.endsWith('@g.us')) {
        return sock.sendMessage(jid, { text: `❌ Run this command inside a group.` }, { quoted: m });
      }
      if (!config.allowedGroups) config.allowedGroups = [];
      if (config.allowedGroups.includes(jid)) {
        return sock.sendMessage(jid, { text: `⚠️ This group is already added.` }, { quoted: m });
      }
      config.allowedGroups.push(jid);
      const wasOffG = config.mode === 'off';
      if (wasOffG) config.mode = 'groups';
      saveConfig(config);
      let groupName = jid.split('@')[0];
      const cached  = globalThis.groupMetadataCache?.get(jid);
      if (cached?.data?.subject) groupName = cached.data.subject;
      const autoNoteG = wasOffG ? `\n⚠️ Mode auto-set to GROUPS (was OFF)` : '';
      return sock.sendMessage(jid, {
        text: `✅ *${groupName}* successfully added${autoNoteG}`
      }, { quoted: m });
    }

    if (subCommand === 'removegroup') {
      if (!jid.endsWith('@g.us')) {
        return sock.sendMessage(jid, { text: `❌ Run this command inside a group.` }, { quoted: m });
      }
      if (!config.allowedGroups) config.allowedGroups = [];
      const idx = config.allowedGroups.indexOf(jid);
      if (idx === -1) {
        return sock.sendMessage(jid, { text: `⚠️ This group is not in the list.` }, { quoted: m });
      }
      config.allowedGroups.splice(idx, 1);
      saveConfig(config);
      return sock.sendMessage(jid, {
        text: `✅ Group removed (${config.allowedGroups.length} remaining)`
      }, { quoted: m });
    }

    if (subCommand === 'listgroups') {
      const groups = config.allowedGroups || [];
      if (groups.length === 0) {
        return sock.sendMessage(jid, {
          text: `📋 No groups in whitelist.`
        }, { quoted: m });
      }
      let listText = `📋 *Whitelisted Groups (${groups.length}):*\n`;
      for (let i = 0; i < groups.length; i++) {
        const gid    = groups[i];
        let gName    = gid.split('@')[0];
        const cached = globalThis.groupMetadataCache?.get(gid);
        if (cached?.data?.subject) gName = cached.data.subject;
        listText += `${i + 1}. ${gName}\n`;
      }
      return sock.sendMessage(jid, { text: listText }, { quoted: m });
    }

    if (subCommand === 'cleargroups') {
      config.allowedGroups = [];
      saveConfig(config);
      return sock.sendMessage(jid, {
        text: `✅ All groups cleared`
      }, { quoted: m });
    }

    // ── DM whitelist management ───────────────────────────────────────────

    if (subCommand === 'adddm') {
      const number = (args[1] || '').replace(/[^0-9]/g, '');
      if (!number || number.length < 7) {
        return sock.sendMessage(jid, {
          text: `❌ Provide a valid number.\nUsage: \`${PREFIX}chatbot adddm 2547xxxxxxxx\``
        }, { quoted: m });
      }
      if (!config.allowedDMs) config.allowedDMs = [];
      const dmJid  = `${number}@s.whatsapp.net`;
      const exists = config.allowedDMs.some(dm => {
        const normDM = dm.split('@')[0].split(':')[0];
        return normDM === number;
      });
      if (exists) {
        return sock.sendMessage(jid, { text: `⚠️ ${number} is already added.` }, { quoted: m });
      }
      config.allowedDMs.push(dmJid);
      const wasOff = config.mode === 'off';
      if (wasOff) config.mode = 'dms';
      saveConfig(config);
      const autoNote = wasOff ? `\n⚠️ Mode auto-set to DMS (was OFF)` : '';
      return sock.sendMessage(jid, {
        text: `✅ ${number} successfully added${autoNote}`
      }, { quoted: m });
    }

    if (subCommand === 'removedm') {
      const number = (args[1] || '').replace(/[^0-9]/g, '');
      if (!number || number.length < 7) {
        return sock.sendMessage(jid, {
          text: `❌ Provide a valid number.\nUsage: \`${PREFIX}chatbot removedm 2547xxxxxxxx\``
        }, { quoted: m });
      }
      if (!config.allowedDMs) config.allowedDMs = [];
      const idx = config.allowedDMs.findIndex(dm => {
        const normDM = dm.split('@')[0].split(':')[0];
        return normDM === number;
      });
      if (idx === -1) {
        return sock.sendMessage(jid, { text: `⚠️ ${number} is not in the list.` }, { quoted: m });
      }
      config.allowedDMs.splice(idx, 1);
      saveConfig(config);
      return sock.sendMessage(jid, {
        text: `✅ ${number} successfully removed`
      }, { quoted: m });
    }

    if (subCommand === 'listdms') {
      const dms = config.allowedDMs || [];
      if (dms.length === 0) {
        return sock.sendMessage(jid, {
          text: `📋 No DMs in whitelist.`
        }, { quoted: m });
      }
      let listText = `📋 *Whitelisted DMs (${dms.length}):*\n`;
      for (let i = 0; i < dms.length; i++) {
        const num = dms[i].split('@')[0].split(':')[0];
        listText += `${i + 1}. +${num}\n`;
      }
      return sock.sendMessage(jid, { text: listText }, { quoted: m });
    }

    if (subCommand === 'cleardms') {
      config.allowedDMs = [];
      saveConfig(config);
      return sock.sendMessage(jid, {
        text: `✅ All DMs cleared`
      }, { quoted: m });
    }

    // ── Rename the chatbot ────────────────────────────────────────────────
    if (subCommand === 'name') {
      const newName = args.slice(1).join(' ').trim();
      if (!newName) {
        const currentName = config.chatbotName || 'W.O.L.F';
        return sock.sendMessage(jid, {
          text: `Name: *${currentName}*\nChange: \`${PREFIX}chatbot name <new name>\``
        }, { quoted: m });
      }
      if (newName.length > 30) {
        return sock.sendMessage(jid, { text: `❌ Name too long (max 30 characters).` }, { quoted: m });
      }
      config.chatbotName = newName;
      saveConfig(config);
      return sock.sendMessage(jid, {
        text: `✅ Chatbot name set to: *${newName}*`
      }, { quoted: m });
    }

    // Unknown sub-command fallback
    return sock.sendMessage(jid, {
      text: `❌ Unknown option: *${subCommand}*\nUse \`${PREFIX}chatbot\` to see all commands.`
    }, { quoted: m });
  }
};
