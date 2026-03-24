// ====== lib/wolfai.js ======
// Wolf AI — the bot's private JARVIS-like DM assistant.
//
// When the owner (or a sudo user) DMs the bot, Wolf AI intercepts the
// message and acts as a knowledgeable assistant that:
//   • Answers questions about the bot's features and commands
//   • Understands natural-language requests ("play some Drake", "go silent mode")
//     and actually executes the corresponding bot command
//   • Manages chat control (silences itself in specific chats or groups)
//   • Holds a multi-turn conversation (remembers the last ~30 messages per user)
//
// Architecture:
//   1. handleWolfAI()      — main entry point called by index.js on every DM
//   2. detectChatControlIntent() — checks for "hands off" / "block this chat"
//   3. quickIntentMatch()  — fast regex-based command detection (no AI call needed)
//   4. getWolfResponse()   — tries each AI model in MODEL_PRIORITY order
//   5. parseCommandFromResponse() — extracts [EXECUTE:cmd:args] from AI reply
//   6. wolfCommandHandler() — handles explicit ?wolf sub-commands
//
// Persistence:
//   • Wolf config (enabled, name, blockedChats, allowedGroups) → data/wolfai/wolf_config.json
//   • Per-user conversations (last 30 msgs, 2-hour expiry)     → data/wolfai/conversations/<jid>.json

import axios from 'axios';
import { getBotName } from './botname.js';
import db from './database.js';

const WOLF_CONFIG_KEY = 'wolfai_config';

// ── Runtime cache ──────────────────────────────────────────────────────────
let wolfEnabled = null;
let _wolfConfig = null;

// ══════════════════════════════════════════════════════════════════════════
// SECTION 1 — Config helpers (database-backed)
// ══════════════════════════════════════════════════════════════════════════

function loadWolfConfig() {
  const stored = db.getConfigSync(WOLF_CONFIG_KEY, null);
  return (stored && typeof stored === 'object') ? stored : { enabled: true };
}

function saveWolfConfig(updates) {
  const current = loadWolfConfig();
  const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };
  db.setConfigSync(WOLF_CONFIG_KEY, merged);
  _wolfConfig = merged;
  return merged;
}

// ── Public config accessors ────────────────────────────────────────────────

// Returns true if Wolf AI is currently enabled.
// Caches the result in `wolfEnabled` so the file is only read once.
export function isWolfEnabled() {
  if (wolfEnabled !== null) return wolfEnabled;
  const cfg = loadWolfConfig();
  wolfEnabled = cfg.enabled !== false;
  return wolfEnabled;
}

// Enable or disable Wolf AI and persist the change.
export function setWolfEnabled(enabled) {
  wolfEnabled = enabled;
  saveWolfConfig({ enabled });
  return wolfEnabled;
}

// Return the AI assistant's display name (default: "W.O.L.F").
// Used in every reply and in the system prompt so the AI knows its own name.
export function getWolfName() {
  if (_wolfConfig?.wolfName) return _wolfConfig.wolfName;
  const cfg = loadWolfConfig();
  return cfg.wolfName || 'W.O.L.F';
}

// Change the AI assistant's name and persist the change.
export function setWolfName(name) {
  const cfg = saveWolfConfig({ wolfName: name });
  _wolfConfig = cfg;
  return name;
}

export function getWolfStats() {
  return {
    enabled: isWolfEnabled(),
    name: getWolfName(),
    conversations: Object.keys(_convCache).length,
    models: MODEL_PRIORITY.length,
  };
}

// ── Blocked chat management ────────────────────────────────────────────────
// The owner can tell Wolf AI to stay silent in specific chats.
// Blocked JIDs are stored in wolf_config.json → blockedChats[].

export function getBlockedChats() {
  const cfg = loadWolfConfig();
  return cfg.blockedChats || [];
}

// Add a JID to the blocked list (if not already there).
export function addBlockedChat(jid) {
  const blocked = getBlockedChats();
  if (!blocked.includes(jid)) {
    blocked.push(jid);
    saveWolfConfig({ blockedChats: blocked });
  }
}

// Remove a JID from the blocked list.
export function removeBlockedChat(jid) {
  const blocked = getBlockedChats().filter(j => j !== jid);
  saveWolfConfig({ blockedChats: blocked });
}

// Returns true if a JID is on the blocked list (Wolf AI won't reply there).
export function isChatBlocked(jid) {
  return getBlockedChats().includes(jid);
}

// ── Allowed group management ───────────────────────────────────────────────
// By default Wolf AI only responds in DMs.  To make it respond in a group,
// the owner must explicitly allow that group's JID.
// Allowed group JIDs are stored in wolf_config.json → allowedGroups[].

export function getAllowedGroups() {
  const cfg = loadWolfConfig();
  return cfg.allowedGroups || [];
}

export function addAllowedGroup(jid) {
  const groups = getAllowedGroups();
  if (!groups.includes(jid)) {
    groups.push(jid);
    saveWolfConfig({ allowedGroups: groups });
  }
}

export function removeAllowedGroup(jid) {
  const groups = getAllowedGroups().filter(j => j !== jid);
  saveWolfConfig({ allowedGroups: groups });
}

export function isGroupAllowed(jid) {
  return getAllowedGroups().includes(jid);
}

// ── JID normalizer ─────────────────────────────────────────────────────────
// Convert a raw phone number (with or without country code, spaces, dashes)
// or an existing WhatsApp JID into a full @s.whatsapp.net JID.
// Returns null if the input doesn't look like a phone number.
export function normalizeToJid(input) {
  if (!input) return null;
  input = input.trim();
  if (input.includes('@')) return input; // already a JID
  const digits = input.replace(/[^0-9]/g, '');
  if (digits.length >= 7) return `${digits}@s.whatsapp.net`;
  return null;
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 2 — AI model registry
// ══════════════════════════════════════════════════════════════════════════
// 14 AI backends are registered in MODEL_PRIORITY order.
// queryAI() tries them one by one until one returns a usable response.
//
// Each model has:
//   url      — primary API endpoint
//   fallbackUrl (optional) — tried if the primary fails
//   method   — HTTP method (all GET)
//   params   — function(query) that builds the query-string parameters
//   extract  — function(responseData) that pulls the text out of the JSON

// Shorthand extractor: tries the most common field names in priority order
const EXTRACT_ALL = (d) => d?.result || d?.response || d?.answer || d?.text || d?.content || d?.solution || d?.data?.result || d?.data?.response || null;

const AI_MODELS = {
  gpt:        { name: 'GPT-5',        url: 'https://iamtkm.vercel.app/ai/gpt5',             method: 'GET', params: (q) => ({ apikey: 'tkm', text: q }), extract: EXTRACT_ALL },
  copilot:    { name: 'Copilot',      url: 'https://iamtkm.vercel.app/ai/copilot',           method: 'GET', params: (q) => ({ apikey: 'tkm', text: q }), extract: EXTRACT_ALL },
  claude:     { name: 'Claude',       url: 'https://apiskeith.vercel.app/ai/claudeai',       method: 'GET', params: (q) => ({ q }), extract: EXTRACT_ALL },
  grok:       { name: 'Grok',         url: 'https://apiskeith.vercel.app/ai/grok',           method: 'GET', params: (q) => ({ q }), extract: EXTRACT_ALL },
  blackbox:   { name: 'Blackbox',     url: 'https://apiskeith.vercel.app/ai/blackbox',       method: 'GET', params: (q) => ({ q }), extract: EXTRACT_ALL },
  bard:       { name: 'Google Bard',  url: 'https://apiskeith.vercel.app/ai/bard',           method: 'GET', params: (q) => ({ q }), extract: EXTRACT_ALL },
  perplexity: { name: 'Perplexity',   url: 'https://apiskeith.vercel.app/ai/perplexity',     method: 'GET', params: (q) => ({ q }), extract: EXTRACT_ALL },
  metai:      { name: 'Meta AI',      url: 'https://apiskeith.vercel.app/ai/metai',          method: 'GET', params: (q) => ({ q }), extract: EXTRACT_ALL },
  mistral:    { name: 'Mistral',      url: 'https://apiskeith.vercel.app/ai/mistral',        method: 'GET', params: (q) => ({ q }), extract: EXTRACT_ALL },
  qwen:       { name: 'Qwen AI',      url: 'https://apiskeith.vercel.app/ai/qwenai',         method: 'GET', params: (q) => ({ q }), extract: EXTRACT_ALL },
  venice:     { name: 'Venice',       url: 'https://apiskeith.vercel.app/ai/venice',         method: 'GET', params: (q) => ({ q }), extract: EXTRACT_ALL },
  ilama:      { name: 'iLlama',       url: 'https://apiskeith.vercel.app/ai/ilama',          method: 'GET', params: (q) => ({ q }), extract: EXTRACT_ALL },
  gemini: {
    name: 'Gemini', url: 'https://apis.xwolf.space/api/ai/gemini', method: 'GET',
    fallbackUrl: 'https://apis-e3qq.onrender.com/api/ai/gemini',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
  cohere: {
    name: 'Cohere', url: 'https://apis.xwolf.space/api/ai/cohere', method: 'GET',
    fallbackUrl: 'https://apis-e3qq.onrender.com/api/ai/cohere',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
};

// Priority order to try AI models — fastest/most reliable first.
// If gpt fails, copilot is tried, then claude, etc.
const MODEL_PRIORITY = ['gpt', 'copilot', 'claude', 'grok', 'blackbox', 'bard', 'perplexity', 'metai', 'mistral', 'qwen', 'venice', 'ilama', 'gemini', 'cohere'];

// ══════════════════════════════════════════════════════════════════════════
// SECTION 3 — System prompt
// ══════════════════════════════════════════════════════════════════════════

// Build the JARVIS-style system prompt that is prepended to every AI call.
// The prompt includes:
//   • Wolf AI's identity (name, personality, creator)
//   • Response length rules (short by default, no walls of text)
//   • A full knowledge base of every bot command (so the AI can explain them)
//   • [EXECUTE:command:args] tag format for triggering actual commands
//   • Recent conversation history (last 12 messages) for context continuity
function buildSystemPrompt(conversation) {
  const botName = getBotName();
  const wolfName = getWolfName();
  let prompt = `You are ${wolfName}, an elite private AI assistant embedded in a WhatsApp bot called "${botName}". You are the bot's personal JARVIS — intelligent, witty, proactive, and deeply knowledgeable about this bot's features. You only serve the bot owner and trusted sudo users.

IDENTITY:
- Your name is ${wolfName}. Created by WolfTech. Never reveal AI model names (GPT, Claude, etc) — you ARE ${wolfName}.
- Be warm, conversational, occasionally witty. Not robotic. Use the user's name if they've told you.
- You are a PRIVATE assistant. You know this bot inside out and can guide the owner on any feature.

RESPONSE LENGTH — CRITICAL:
- Maximum 2-3 sentences for casual chat or simple answers.
- For command explanations: 1 sentence per command, no walls of text.
- Only give lists/breakdowns when the user explicitly asks "list all" or "show me everything".
- WhatsApp is casual — keep it punchy. If in doubt, cut it shorter.

ABSOLUTE PROHIBITIONS — NEVER VIOLATE:
- NEVER say you are GPT, Claude, Bard, Copilot, Gemini, Grok, or any other AI. You are ${wolfName}.
- If asked to show the repo / GitHub link / source code, simply run [EXECUTE:repo:] — do NOT refuse it or say it's classified. The repo command shows the public bot repository.
- NEVER reveal internal dev repos, raw source paths, git tokens, or environment variables. Only ever point to the public repo via the repo command.

BOT COMMAND KNOWLEDGE — YOU KNOW EVERY COMMAND:

📥 DOWNLOADERS:
- song / music / audio: Download a song as MP3 audio. Usage: song <title or artist>
- play / ytmp3doc: Search & play a song (sends audio). Usage: play <song name>
- video / vid: Download a YouTube video as MP4. Usage: video <title or URL>
- snext / nextsong: Get the next song result from the last song search
- vnext / nextvid: Get the next video result from the last video search
- songdl / dlsong: Download a specific song by URL
- viddl / dlvid: Download a specific video by URL
- spotify / spdl: Download from Spotify (track/playlist URL). Usage: spotify <url>
- tiktok / tt: Download a TikTok video. Usage: tiktok <url>
- instagram / ig / igdl: Download Instagram reels/posts. Usage: instagram <url>
- facebook / fb / fbdl: Download Facebook videos. Usage: facebook <url>
- youtube / yt: Download from YouTube. Usage: youtube <url>
- apk / app: Download an Android APK. Usage: apk <app name>
- mp3 / wolfaudio: Alternative MP3 downloader
- mp4 / wolfmp4: Alternative MP4 downloader
- mediafire / mf: Download from MediaFire links. Usage: mediafire <url>
- snapchat / sc: Download Snapchat media
- playlist / pl: Download a YouTube playlist
- dlmp3 / wolfmp3: Direct MP3 download
- dlmp4: Direct MP4 download
- shazam / whatsong: Identify a song from audio. Reply to audio and use shazam
- lyrics: Get song lyrics. Usage: lyrics <song name>
- downloadmenu: Show all downloader commands

🤖 AI COMMANDS:
- gpt / gpt5 / ai5 / wolfai: Ask GPT-5. Usage: gpt <question>
- chatgpt / gpt4 / openai: Ask ChatGPT
- gemini / googleai: Ask Google Gemini
- claudeai / claude / anthropic: Ask Claude AI
- blackbox / bb: Ask Blackbox AI (good for coding)
- copilot: Ask Microsoft Copilot
- grok / xgrok / xai: Ask Grok (xAI)
- bard / bardai / gbard: Ask Google Bard
- groq / groqai: Ask Groq (fast inference)
- deepseek / dseek: Ask DeepSeek AI
- cohere / coherai: Ask Cohere
- dolphin: Ask Dolphin AI
- falcon / falcon40b: Ask Falcon AI
- ilama / llama: Ask iLlama (Meta Llama)
- chatglm / glm: Ask ChatGLM
- deepseek+: Advanced DeepSeek with flags (--r1, --code, --vision)
- humanizer / humanize: Make AI-written text sound human
- codellama / codel: AI specifically for coding questions
- analyze: Analyze an image with AI (reply to image)
- aiscanner / aidetect: Detect if text is AI-generated
- aimenu / aihelp: Show all AI commands

🎵 MUSIC MODE:
- The bot has a Music Mode — when active, audio/song commands work automatically
- musicmenu: Show all music commands

🖼️ IMAGE GENERATION & EDITING:
- imagine / flux / fluxai / aiimage: Generate an AI image. Usage: imagine <description>
- bing / text2image / text2img: Generate image using Bing AI
- remini: Enhance/upscale a photo quality (reply to image)
- sticker: Convert image/video/GIF to WhatsApp sticker (reply to media)
- toimage / togif: Convert sticker to image or GIF (reply to sticker)
- brandlogo: Generate a brand logo
- companylogo: Generate a company logo
- reverseimage: Reverse image search (reply to image)

🔧 GROUP MANAGEMENT:
- antilink [on/off]: Block links in groups
- antibug [on/off]: Block bug/crash messages
- antispam [on/off]: Block spam messages
- antibadword [on/off]: Filter bad words. addbadword <word> to add words
- antileave / leavealert: Alert when members leave
- antiimage / antivideo / antisticker / antiaudio: Block specific media types
- antibot [on/off]: Block bots from joining
- antidemote / antipromote: Prevent unauthorized admin changes
- antimention [on/off]: Block mass mentions
- antigrouplink [on/off]: Block group invite links
- antidelete [on/off]: Restore deleted messages
- antiviewonce [on/off]: Save view-once media automatically
- anticall [on/off]: Block group calls
- kick: Kick a member (reply to their message or mention)
- add <number>: Add a member to the group
- ban: Ban a member permanently
- promote / demote: Promote or demote admins
- mute / unmute: Mute or unmute the group
- tagall: Mention all group members
- warn / warnings / resetwarn: Warning system — warn members, check warnings, reset
- setwarn <number>: Set max warnings before auto-kick
- grouplink: Get the group invite link
- welcome [on/off]: Toggle welcome/goodbye messages
- approveall: Approve all pending join requests

⚙️ OWNER / ADMIN COMMANDS:
- addsudo <number>: Add a sudo (trusted admin) user
- delsudo <number>: Remove a sudo user
- checksudo / clearsudo: Check or clear sudo list
- block / blockall: Block contacts
- restart: Restart the bot
- about: Show bot info
- autobio: Automatically update the bot's WhatsApp bio/status
- antidelete [on/off]: Catch deleted messages
- clearcache: Clear bot cache
- cleardb: Clear bot database
- disk: Check disk usage
- fetchapi / testapi: Test if an API endpoint is working
- findcommands <query>: Search for a specific command
- getapi / apiinfo: Show API info

🛠️ UTILITY COMMANDS:
- alive / alive2: Check if the bot is online
- ping / speed / latency: Test bot speed/latency
- uptime / runtime: Show how long the bot has been running
- weather <city>: Get current weather
- news: Latest news headlines
- wiki <topic>: Wikipedia search
- translate <text>: Translate text
- define <word>: Dictionary definition
- time: Current time
- screenshot / ss <url>: Screenshot a website
- shorturl / url <url>: Shorten a URL
- qrencode <text>: Generate a QR code
- iplookup <ip>: IP address lookup
- covid: COVID-19 stats
- reverseimage: Reverse image search
- vv / vv2: Save view-once media (reply to view-once)
- prefixinfo: Show the current bot prefix
- getjid / jid / whois: Get the JID of a contact
- getpp / getgpp: Get a profile picture
- device: Check device info
- warnings / checkwarn: Check a member's warnings
- vcf: Generate a contact VCF file
- setcaption: Set a default caption for media

🎮 FUN & GAMES:
- joke / funny: Tell a random joke
- quote: Get an inspirational quote
- truth / dare: Truth or Dare
- dice: Roll a dice
- coinflip: Flip a coin
- rps: Rock Paper Scissors
- tictactoe: Play Tic Tac Toe
- quiz: Answer a trivia question
- snake / tetris: Play Snake or Tetris
- emojimix / emix: Mix two emojis together
- hack: Fake hacking animation
- gamemenu / funmenu: Show game/fun commands

🤳 SOCIAL / DOWNLOADERS (extra):
- facebook / fb: Facebook video download
- instagram / ig: Instagram download
- tiktok: TikTok download
- snapchat: Snapchat download

🌐 AUTOMATION:
- autotyping [on/off]: Auto typing indicator
- autoread [on/off]: Auto read messages
- autoreact: Auto react to messages
- autoviewstatus: Auto view statuses
- autodownloadstatus: Auto download status updates
- autorecording [on/off]: Auto recording indicator
- reactowner / reactdev: React to owner/dev messages

📊 SETTINGS & INFO:
- menu / menu2: Show full bot command menu
- prefix / prefixinfo: Show current command prefix
- mode public: Bot responds to everyone in all chats
- mode silent: Bot responds only to the owner (stealth)
- mode groups: Bot responds only in group chats
- mode dms: Bot responds only in private DMs
- mode buttons: All responses use interactive buttons
- mode channel: All responses forwarded as channel messages
- mode default: Reset to normal text mode
- wolf on/off: Toggle this AI assistant on or off
- wolf name <name>: Change this AI assistant's name
- wolf status: Show AI assistant stats
- wolf clear: Reset conversation memory
- chatbot on/off/groups/dms/both: Toggle public chatbot
- chatbot name <name>: Change chatbot name
- chatbot model <model>: Switch chatbot AI model

COMMAND EXECUTION — HOW TO RUN BOT COMMANDS:
When the user clearly wants an ACTION done (download, play, generate, kick, etc.), include a command tag on the last line:
Format: [EXECUTE:command_name:arguments]
Examples:
• "play some Drake" → [EXECUTE:play:Drake]
• "make this a sticker" → [EXECUTE:sticker:]
• "turn on antilink" → [EXECUTE:antilink:on]
• "turn off antilink" → [EXECUTE:antilink:off]
• "turn on antispam" → [EXECUTE:antispam:on]
• "turn on welcome" → [EXECUTE:welcome:on]
• "generate an image of a sunset" → [EXECUTE:imagine:sunset]
• "tell me a joke" → [EXECUTE:joke:]
• "check uptime" → [EXECUTE:uptime:]
• "switch to silent mode" → [EXECUTE:mode:silent]
• "go public" → [EXECUTE:mode:public]
• "groups only mode" → [EXECUTE:mode:groups]
• "dms only" → [EXECUTE:mode:dms]
• "show the repo" → [EXECUTE:repo:]
• "check ping" → [EXECUTE:ping:]
• "how long has the bot been running" → [EXECUTE:uptime:]
IMPORTANT: NEVER use [EXECUTE:menu:] — the menu is handled separately. Only use [EXECUTE:...] when the user clearly wants an action done, not for informational questions. Always put your conversational reply FIRST, then the tag on the last line.`;

  // Append recent conversation history (last 12 turns) so the AI remembers context
  if (conversation.messages.length > 0) {
    prompt += `\n\nCONVERSATION HISTORY:\n`;
    const recent = conversation.messages.slice(-12);
    for (const msg of recent) {
      prompt += `${msg.role === 'user' ? 'Human' : wolfName}: ${msg.content}\n`;
    }
  }

  return prompt;
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 4 — Per-user conversation store (database-backed)
// ══════════════════════════════════════════════════════════════════════════

// In-memory cache for active conversations (fast access during active chat)
// Capped at 100 entries; expired entries (>2h idle) evicted every 30 minutes.
const _convCache = {};
const _CONV_TTL    = 2 * 60 * 60 * 1000;  // 2 hours
const _CONV_MAX    = 100;                   // max simultaneous cached conversations

setInterval(() => {
  const now  = Date.now();
  const keys = Object.keys(_convCache);
  // 1. Evict any entry that has exceeded the TTL
  for (const k of keys) {
    if (now - (_convCache[k].lastActive || 0) > _CONV_TTL) {
      delete _convCache[k];
    }
  }
  // 2. If still over cap, evict the oldest (by lastActive) until under cap
  const remaining = Object.keys(_convCache);
  if (remaining.length > _CONV_MAX) {
    remaining
      .sort((a, b) => (_convCache[a]?.lastActive || 0) - (_convCache[b]?.lastActive || 0))
      .slice(0, remaining.length - _CONV_MAX)
      .forEach(k => delete _convCache[k]);
  }
}, 30 * 60 * 1000); // run every 30 minutes

function _convKey(userId) {
  return 'wolf_conv_' + userId.replace(/[^a-zA-Z0-9]/g, '_');
}

function loadConversation(userId) {
  if (_convCache[userId]) {
    const cached = _convCache[userId];
    if (Date.now() - (cached.lastActive || 0) > 2 * 60 * 60 * 1000) {
      delete _convCache[userId];
      return { messages: [], lastActive: Date.now(), userData: cached.userData || {} };
    }
    return cached;
  }
  try {
    const stored = db.getConfigSync(_convKey(userId), null);
    if (stored && typeof stored === 'object' && Array.isArray(stored.messages)) {
      if (Date.now() - (stored.lastActive || 0) > 2 * 60 * 60 * 1000) {
        return { messages: [], lastActive: Date.now(), userData: stored.userData || {} };
      }
      _convCache[userId] = stored;
      return stored;
    }
  } catch {}
  return { messages: [], lastActive: Date.now(), userData: {} };
}

function saveConversation(userId, conversation) {
  conversation.lastActive = Date.now();
  if (conversation.messages.length > 30) {
    conversation.messages = conversation.messages.slice(-30);
  }
  _convCache[userId] = conversation;
  db.setConfigSync(_convKey(userId), conversation);
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 5 — AI query engine
// ══════════════════════════════════════════════════════════════════════════

// Call a single AI model by key.  Tries the primary URL, then the fallback URL
// if one is configured.  Returns the extracted text or null if the call failed.
// `timeout` defaults to 30 seconds to avoid blocking the chat for too long.
async function queryAI(modelKey, prompt, timeout = 30000) {
  const model = AI_MODELS[modelKey];
  if (!model) return null;

  // Inner helper that attempts a single URL and extracts the result
  const tryUrl = async (url) => {
    try {
      const response = await axios({
        method: model.method, url,
        params: model.params(prompt),
        timeout,
        headers: { 'User-Agent': 'WOLF-AI/2.0', 'Accept': 'application/json' },
        validateStatus: (s) => s >= 200 && s < 500 // don't throw on 4xx
      });
      if (response.data && typeof response.data === 'object') {
        const result = model.extract(response.data);
        if (result && typeof result === 'string' && result.trim().length > 3) {
          const lower = result.toLowerCase();
          // Reject obvious error strings that some APIs return as "responses"
          if (lower.includes('error:') || lower.startsWith('error') || lower.includes('unavailable')) return null;
          return result.trim();
        }
      } else if (typeof response.data === 'string' && response.data.trim().length > 3) {
        return response.data.trim();
      }
    } catch {}
    return null;
  };

  const primary = await tryUrl(model.url);
  if (primary) return primary;

  // Try the fallback URL if the primary failed
  if (model.fallbackUrl) return tryUrl(model.fallbackUrl);
  return null;
}

// Try every model in MODEL_PRIORITY order until one returns a valid response.
// Builds the full prompt (system + conversation history + user message) first.
// If all models fail with the full prompt, falls back to asking GPT with just
// the bare user message (shorter prompt = better chance of success).
async function getWolfResponse(userMessage, conversation) {
  const wolfName = getWolfName();
  const systemPrompt = buildSystemPrompt(conversation);
  const fullPrompt = `${systemPrompt}\nHuman: ${userMessage}\n${wolfName}:`;

  for (const modelKey of MODEL_PRIORITY) {
    const result = await queryAI(modelKey, fullPrompt);
    if (result) {
      const cleaned = cleanResponse(result);
      if (isValidWolfResponse(cleaned)) return cleaned;
    }
  }

  // All models failed with full prompt — try a bare query to GPT as last resort
  const simpleResult = await queryAI('gpt', userMessage);
  if (simpleResult) {
    const cleaned = cleanResponse(simpleResult);
    if (isValidWolfResponse(cleaned)) return cleaned;
  }

  return null;
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 6 — Response cleaning
// ══════════════════════════════════════════════════════════════════════════

// Strip any AI self-identification (GPT, Claude, etc.) and replace with the
// Wolf AI name.  Also strips conversation prefixes that the model echoed back,
// citation numbers, and redundant blank lines.
function cleanResponse(text) {
  const wolfName = getWolfName();
  if (!text) return '';
  text = text.replace(/\[\d+\]/g, '');                                      // [1], [2] citation markers
  text = text.replace(/Human:.*$/gm, '');                                   // echoed "Human:" lines
  text = text.replace(/W\.O\.L\.F:/g, '');                                  // echoed "W.O.L.F:" prefix
  text = text.replace(new RegExp(`${wolfName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'g'), '');
  text = text.replace(/^(Assistant|AI|Bot|Claude|GPT|Grok|Copilot|Bard):\s*/gim, '');
  // Replace every known AI brand name with wolfName so identity is preserved
  text = text.replace(/\b(ChatGPT|GPT-?[34o5]?|GPT|OpenAI)\b/gi, wolfName);
  text = text.replace(/\b(Claude|Anthropic)\b/gi, wolfName);
  text = text.replace(/\b(Copilot|Microsoft Copilot)\b/gi, wolfName);
  text = text.replace(/\b(Google Bard|Bard|Gemini)\b/gi, wolfName);
  text = text.replace(/\b(Grok|xAI)\b/gi, wolfName);
  text = text.replace(/\b(Blackbox|Blackbox AI)\b/gi, wolfName);
  text = text.replace(/\b(Perplexity|Perplexity AI)\b/gi, wolfName);
  text = text.replace(/\b(LLaMA|Meta AI|Mistral|Mistral AI)\b/gi, wolfName);
  text = text.replace(/\b(Qwen|QwenAI|Qwen AI|Alibaba Cloud)\b/gi, wolfName);
  text = text.replace(/\b(Venice|Venice AI|Venice\.ai)\b/gi, wolfName);
  text = text.replace(/\b(Cohere|Cohere AI|Command R)\b/gi, wolfName);
  text = text.replace(/\b(iLlama|LLaMA 2|LLaMA 3|Llama)\b/gi, wolfName);
  text = text.replace(/\bI'?m an AI (language )?model\b/gi, `I'm ${wolfName}`);
  text = text.replace(/\bAs an AI (language )?model\b/gi, `As ${wolfName}`);
  text = text.replace(/\bmade by (OpenAI|Google|Anthropic|Microsoft|Meta|xAI)\b/gi, 'made by WolfTech');
  text = text.replace(/\bcreated by (OpenAI|Google|Anthropic|Microsoft|Meta|xAI)\b/gi, 'created by WolfTech');
  // Collapse cases where the name appears twice in a row ("W.O.L.F W.O.L.F")
  const escapedWolfName = wolfName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  text = text.replace(new RegExp(`(${escapedWolfName}[\\s,]*){2,}`, 'g'), `${wolfName} `);
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n'); // collapse triple blank lines
  return text.trim();
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 7 — Action extraction fallback
// ══════════════════════════════════════════════════════════════════════════

// If the AI's reply implies it's about to do something (e.g. "Turning antilink on...")
// but forgot to include the [EXECUTE:] tag, this function tries to infer the
// command from the text so the action still happens.
function extractActionFromAIText(aiText) {
  const t = aiText.toLowerCase();

  // Pattern: "turning antilink on", "switching autotyping off", etc.
  const toggleable = 'antilink|antibug|antispam|antibadword|antileave|antiimage|antivideo|antisticker|antiaudio|antibot|antidelete|antiviewonce|antigrouplink|anticall|autotyping|autoread|autoviewstatus|autorecording|welcome|autoreact|leavealert';
  const togRe = new RegExp(`\\b(turning|switching|toggling|setting)\\s+(${toggleable})\\s+(on|off)\\b|\\b(${toggleable})\\s+(turned|switched|set)\\s+(on|off)\\b`, 'i');
  const togM = t.match(togRe);
  if (togM) {
    const cmd   = (togM[2] || togM[4] || '').toLowerCase().trim();
    const state = (togM[3] || togM[6] || '').toLowerCase().trim();
    if (cmd && state) return { command: cmd, args: [state] };
  }

  // Pattern: "switching to public mode", "mode to silent"
  const modeM = t.match(/\bswitching\s+(?:to\s+)?(public|silent|groups?|dms?|buttons?|channel|default)\s+mode\b/i)
    || t.match(/\bmode\s+(?:to\s+)?(public|silent|groups?|dms?|buttons?|channel|default)\b/i);
  if (modeM) {
    const m = modeM[1].toLowerCase().replace(/s$/, '');
    const normalized = m === 'group' ? 'groups' : m === 'dm' ? 'dms' : m;
    return { command: 'mode', args: [normalized] };
  }

  // Pattern: "playing <song> for you"
  const playM = aiText.match(/\bplaying\s+["']?(.+?)["']?\s*(?:for you|now|🎵|$)/i);
  if (playM) return { command: 'play', args: [playM[1].trim()] };

  // Pattern: "generating an image of <subject>"
  const imgM = aiText.match(/\bgenerating\s+(?:an?\s+)?(?:ai\s+)?image\s+(?:of\s+)?["']?(.+?)["']?\s*(?:for you|now|🎨|$)/i);
  if (imgM) return { command: 'imagine', args: [imgM[1].trim()] };

  return null;
}

// Parse the [EXECUTE:command_name:arguments] tag from the AI's response.
// Returns { command, args } or null if no tag is present.
function parseCommandFromResponse(response) {
  const match = response.match(/\[EXECUTE:([a-zA-Z0-9]+):?(.*?)\]/);
  if (!match) return null;
  const command = match[1].toLowerCase();
  const argsStr = (match[2] || '').trim();
  const args = argsStr ? argsStr.split(/\s+/) : [];
  return { command, args };
}

// Remove the [EXECUTE:...] tag from the display text so users don't see it.
function stripCommandTag(response) {
  return response.replace(/\[EXECUTE:[^\]]*\]/g, '').trim();
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 8 — Trigger detection
// ══════════════════════════════════════════════════════════════════════════

// List of patterns that activate Wolf AI when they appear at the start of a
// message.  Handles "hey wolf", "wolf,", "ok wolf", etc.
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

// Returns true if the message text starts with a Wolf AI trigger phrase.
// Called by index.js to decide whether to route the message here.
export function isWolfTrigger(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  return WOLF_TRIGGERS.some(r => r.test(trimmed));
}

// Remove the trigger prefix ("hey wolf", "wolf,") from the message so
// the remaining text is the actual question/request.
function stripWolfPrefix(text) {
  if (!text) return '';
  let s = text.trim();
  s = s.replace(/^(hey|yo|hi|hello|ok|okay|dear|sup|ey|ay)\s+wolf\b[\s,!.]*/i, '');
  s = s.replace(/^wolf\b[\s,!.]*/i, '');
  return s.trim();
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 9 — Quick intent matcher
// ══════════════════════════════════════════════════════════════════════════

// Fast regex-based command dispatcher — called BEFORE the AI query.
// If the user's message clearly maps to a specific command, we execute it
// directly without spending time on an AI call.  This saves latency for
// simple requests like "ping", "go public", or "turn on antilink".
//
// Returns { command, args, confirm? } or null if no match found.
// `confirm` is a short acknowledgment message sent before running the command.
function quickIntentMatch(text) {
  // Strip common filler prefixes so "can you turn on antilink" → "turn on antilink"
  let cleaned = text.trim().replace(
    /^(?:can\s+you|could\s+you|please|pls|hey\s+wolf,?\s*|wolf,?\s*|would\s+you|i\s+want\s+(?:you\s+to\s+)?|i\s+need\s+(?:you\s+to\s+)?|go\s+ahead\s+and\s+|try\s+to\s+)\s*/i,
    ''
  );
  const lower = cleaned.toLowerCase().trim().replace(/[?!.]+$/, '').trim();
  const orig  = cleaned.trim();

  // ── Menu requests (explicit only) ───────────────────────────────────────
  if (/^(show\s+)?(me\s+)?(the\s+)?(bot\s+)?menu(\s+please|\s+pls)?$/.test(lower)
    || /^(open|pull\s+up|bring\s+up|display)\s+(the\s+)?(bot\s+)?menu$/.test(lower)
    || /^(bot\s+)?menu$/.test(lower)) {
    return { command: 'menu', args: [] };
  }

  // ── Sub-menus ────────────────────────────────────────────────────────────
  if (/\b(show\s+)?(the\s+)?(music|song|audio)\s*menu\b/i.test(lower)) return { command: 'musicmenu', args: [] };
  if (/\b(show\s+)?(the\s+)?ai\s*menu\b/i.test(lower))                  return { command: 'aimenu', args: [] };
  if (/\b(show\s+)?(the\s+)?game[s]?\s*menu\b/i.test(lower))            return { command: 'gamemenu', args: [] };
  if (/\b(show\s+)?(the\s+)?(fun|funny)\s*menu\b/i.test(lower))         return { command: 'funmenu', args: [] };
  if (/\b(show\s+)?(the\s+)?(download[s]?|downloader)\s*menu\b/i.test(lower)) return { command: 'downloadmenu', args: [] };
  if (/\b(show\s+)?(the\s+)?(tool[s]?)\s*menu\b/i.test(lower))          return { command: 'toolsmenu', args: [] };

  // ── Repo link ────────────────────────────────────────────────────────────
  if (/^(show\s+)?(the\s+)?(repo|repository|github|source|git|bot\s+repo|bot\s+source|bot\s+github)(\s+link|\s+info|\s+url)?$/.test(lower)
    || /\b(what'?s?\s+(the\s+)?(repo|github|source|repository)|send\s+(me\s+)?(the\s+)?(repo|github|source)\s+(link|url)?)\b/i.test(lower)) {
    return { command: 'repo', args: [] };
  }

  // ── Status checks — no confirmation needed ───────────────────────────────
  if (/^(are\s+you\s+)?(alive|there|online|working|active|running|awake)\??$/.test(lower)) return { command: 'alive', args: [] };
  if (/^ping$/.test(lower))                     return { command: 'ping', args: [] };
  if (/^(uptime|runtime)$/.test(lower))         return { command: 'uptime', args: [] };
  if (/^prefix(info)?$/.test(lower))            return { command: 'prefixinfo', args: [] };
  if (/^(show\s+)?(the\s+)?owner$/.test(lower)) return { command: 'owner', args: [] };

  // ── Restart — confirm before doing ──────────────────────────────────────
  if (/^(please\s+)?(restart|reboot)(\s+(the\s+)?bot)?$/.test(lower)) {
    return { command: 'restart', args: [], confirm: 'Restarting the bot now 🔄' };
  }

  // ── Mode switching — always confirm ─────────────────────────────────────
  const modeLabels = { public: '🌍 Public', silent: '🔇 Silent', groups: '👥 Groups only', dms: '💬 DMs only', buttons: '🔘 Buttons', channel: '📡 Channel', default: '📝 Default' };
  const modeMap = {
    public:  /\b(public\s*mode|go\s*public|mode\s*(to\s*)?public|(switch|change|set)\s*(the\s*)?bot\s*mode\s*(to\s*)?public|everyone\s*mode|respond\s+to\s+everyone)\b/i,
    silent:  /\b(silent\s*mode|go\s*silent|mode\s*(to\s*)?silent|(switch|change|set)\s*(the\s*)?bot\s*mode\s*(to\s*)?silent|stealth\s*mode|owner\s*only\s*mode)\b/i,
    groups:  /\b(groups?\s*(only\s*)?mode|mode\s*(to\s*)?groups?|(switch|change|set)\s*(the\s*)?bot\s*mode\s*(to\s*)?groups?|groups?\s*only)\b/i,
    dms:     /\b(dms?\s*(only\s*)?mode|mode\s*(to\s*)?dms?|(switch|change|set)\s*(the\s*)?bot\s*mode\s*(to\s*)?dms?|private\s*(only\s*)?mode)\b/i,
    buttons: /\b(buttons?\s*mode|mode\s*(to\s*)?buttons?|(switch|change|set)\s*(the\s*)?bot\s*mode\s*(to\s*)?buttons?)\b/i,
    channel: /\b(channel\s*mode|mode\s*(to\s*)?channel|(switch|change|set)\s*(the\s*)?bot\s*mode\s*(to\s*)?channel)\b/i,
    default: /\b(default\s*mode|mode\s*(to\s*)?default|(switch|change|set)\s*(the\s*)?bot\s*mode\s*(to\s*)?default|reset\s*(the\s*)?mode|normal\s*mode)\b/i,
  };
  for (const [modeName, pattern] of Object.entries(modeMap)) {
    if (pattern.test(lower)) {
      return { command: 'mode', args: [modeName], confirm: `Switching to ${modeLabels[modeName]} mode ✅` };
    }
  }

  // ── Toggle-able features — confirm on/off ────────────────────────────────
  const toggleable = 'antilink|antibug|antispam|antibadword|antileave|antiimage|antivideo|antisticker|antiaudio|antibot|antidelete|antiviewonce|antigrouplink|anticall|autotyping|autoread|autoviewstatus|autorecording|welcome|autoreact|leavealert';
  const togRe = new RegExp(`(?:(?:turn|switch|set|put)\\s+)?(on|off|enable|disable)\\s+(?:the\\s+)?(${toggleable})|(?:the\\s+)?(${toggleable})\\s+(?:turn\\s+)?(on|off|enable|disable)|(${toggleable})\\s+(on|off)`, 'i');
  const togM = lower.match(togRe);
  if (togM) {
    const cmd      = (togM[2] || togM[3] || togM[5] || '').toLowerCase().trim();
    const stateRaw = (togM[1] || togM[4] || togM[6] || '').toLowerCase().trim();
    if (cmd && stateRaw) {
      const state = (stateRaw === 'on' || stateRaw === 'enable') ? 'on' : 'off';
      const icon  = state === 'on' ? '✅' : '❌';
      return { command: cmd, args: [state], confirm: `${cmd} turned ${state} ${icon}` };
    }
  }

  // ── Music / Play ─────────────────────────────────────────────────────────
  const playM = orig.match(/^(?:play|play\s+me|search\s+for|find\s+(?:the\s+)?song)\s+(.+)/i);
  if (playM) return { command: 'play', args: [playM[1].trim()], confirm: `Searching for *${playM[1].trim()}* 🎵` };

  const songM = orig.match(/^(?:download|get|dl)\s+(?:song|audio|mp3|music)?\s*(?:of\s+|for\s+)?(.+)/i);
  if (songM && !songM[1].match(/^https?:\/\//)) return { command: 'song', args: [songM[1].trim()], confirm: `Downloading *${songM[1].trim()}* as audio 🎵` };

  const vidM = orig.match(/^(?:download|get|dl)\s+(?:video|vid|mp4)?\s*(?:of\s+|for\s+)?(.+)/i);
  if (vidM && !vidM[1].match(/^https?:\/\//)) return { command: 'video', args: [vidM[1].trim()], confirm: `Downloading *${vidM[1].trim()}* as video 🎬` };

  // ── URL-based downloads — detect platform from URL ───────────────────────
  const urlM = orig.match(/(?:download|get|dl)\s+(https?:\/\/\S+)/i) || orig.match(/^(https?:\/\/\S+)$/);
  if (urlM) {
    const url = urlM[1];
    if (/tiktok/i.test(url))          return { command: 'tiktok',    args: [url], confirm: `Downloading TikTok video ⏬` };
    if (/instagram|ig\./i.test(url))  return { command: 'instagram', args: [url], confirm: `Downloading Instagram media ⏬` };
    if (/facebook|fb\.com/i.test(url)) return { command: 'facebook', args: [url], confirm: `Downloading Facebook video ⏬` };
    if (/spotify/i.test(url))         return { command: 'spotify',   args: [url], confirm: `Downloading from Spotify 🎵` };
    if (/youtu/i.test(url))           return { command: 'youtube',   args: [url], confirm: `Downloading from YouTube ⏬` };
    if (/mediafire/i.test(url))       return { command: 'mediafire', args: [url], confirm: `Downloading from MediaFire ⏬` };
  }

  // ── Shazam / song identification ─────────────────────────────────────────
  if (/\b(identify|shazam|what\s+(song|music)|find\s+this\s+song|name\s+this\s+song)\b/i.test(lower)) {
    return { command: 'shazam', args: [], confirm: `Identifying the song 🎵` };
  }

  // ── Lyrics ───────────────────────────────────────────────────────────────
  const lyrM = orig.match(/\b(?:get|show|find|what\s+are)\s+(?:the\s+)?lyrics\s+(?:of\s+|for\s+)?(.+)/i);
  if (lyrM) return { command: 'lyrics', args: [lyrM[1].trim()], confirm: `Fetching lyrics for *${lyrM[1].trim()}* 📝` };

  // ── Image generation ─────────────────────────────────────────────────────
  const imgM = orig.match(/^(?:generate|create|make|draw|imagine|ai\s+image\s+of)\s+(?:an?\s+)?(?:image|picture|photo|art\s+of|ai\s+image\s+of)?\s*(.+)/i);
  if (imgM && imgM[1].length > 2) return { command: 'imagine', args: [imgM[1].trim()], confirm: `Generating AI image of *${imgM[1].trim()}* 🎨` };

  // ── Sticker ──────────────────────────────────────────────────────────────
  if (/\b(make|convert|turn)\s+(this|it)\s+(into?\s+)?a?\s*sticker\b/i.test(lower) || /^sticker$/.test(lower)) {
    return { command: 'sticker', args: [], confirm: `Converting to sticker 🎭` };
  }

  // ── Fun / games ──────────────────────────────────────────────────────────
  if (/^(tell\s+(me\s+)?a?\s*)?(joke|funny)$/.test(lower) || /\bsend\s+(me\s+)?a?\s*joke\b/i.test(lower)) {
    return { command: 'joke', args: [], confirm: `Here's a joke 😄` };
  }
  if (/^(get\s+(me\s+)?a?\s*)?(quote|inspiration)$/.test(lower)) return { command: 'quote', args: [], confirm: `Here's a quote 💭` };

  // ── Weather ──────────────────────────────────────────────────────────────
  const wxM = orig.match(/\b(?:weather|weather\s+in|weather\s+for)\s+(.+)/i);
  if (wxM) return { command: 'weather', args: [wxM[1].trim()], confirm: `Checking weather for *${wxM[1].trim()}* 🌤️` };

  // ── Wikipedia ────────────────────────────────────────────────────────────
  const wikiM = orig.match(/^(?:wiki|search\s+wiki(?:pedia)?|wikipedia)\s+(.+)/i);
  if (wikiM) return { command: 'wiki', args: [wikiM[1].trim()], confirm: `Searching Wikipedia for *${wikiM[1].trim()}* 📖` };

  // ── News ─────────────────────────────────────────────────────────────────
  if (/^(show|get|latest|today'?s?)?\s*(news|headlines)$/.test(lower)) return { command: 'news', args: [], confirm: `Fetching latest news 📰` };

  // ── Screenshot ───────────────────────────────────────────────────────────
  const ssM = orig.match(/^(?:screenshot|ss|capture|snap)\s+(https?:\/\/\S+)/i);
  if (ssM) return { command: 'screenshot', args: [ssM[1]], confirm: `Taking screenshot of *${ssM[1]}* 📸` };

  // ── Translate ────────────────────────────────────────────────────────────
  const trM = orig.match(/^translate\s+(.+)/i);
  if (trM) return { command: 'translate', args: [trM[1].trim()], confirm: `Translating... 🌐` };

  // ── Define ───────────────────────────────────────────────────────────────
  const defM = orig.match(/^(?:define|meaning\s+of|what\s+(?:does|is))\s+(.+)/i);
  if (defM) return { command: 'define', args: [defM[1].trim()], confirm: `Looking up *${defM[1].trim()}* 📚` };

  // ── Chatbot toggle ───────────────────────────────────────────────────────
  const cbM = lower.match(/\bchatbot\s+(on|off|enable|disable)\b|\b(on|off|enable|disable)\s+(?:the\s+)?chatbot\b/i);
  if (cbM) {
    const st    = (cbM[1] || cbM[2] || '').toLowerCase();
    const state = (st === 'on' || st === 'enable') ? 'on' : 'off';
    return { command: 'chatbot', args: [state], confirm: `Chatbot turned ${state} ${state === 'on' ? '✅' : '❌'}` };
  }

  return null; // no match — fall through to the AI query
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 10 — Response quality filters
// ══════════════════════════════════════════════════════════════════════════

// Reject responses that look like a Wolfram Alpha search engine output
// or that are short flat refusals ("Sorry, I can't…"), since these are
// not useful as Wolf AI replies.
function isValidWolfResponse(text) {
  if (!text || text.trim().length < 2) return false;
  const t = text.trim();
  const lower = t.toLowerCase();
  if (/wolfram/i.test(t)) return false;
  if (/\bi\s*(?:am|'m)\s+(?:wolf|w\.o\.l\.f).{0,40}(?:search|engine|assistant|tool)/i.test(t)) return false;
  // Short flat refusals (< 180 chars) that start with "no I" or "I cannot" are unhelpful
  if (t.length < 180 && /^(?:no[,!.]?\s+i\s+|i\s+(?:cannot|can't|am\s+unable|'m\s+unable)|sorry[,.]?\s+i\s+(?:can|am))/i.test(lower)) return false;
  if (/\b(?:as|being)\s+(?:an?\s+)?(?:ai|search)\s+(?:engine|assistant|model)\b/i.test(lower) && t.length < 200) return false;
  return true;
}

// Trim the response to roughly 420 characters, cutting at a sentence
// boundary where possible so the text doesn't end mid-sentence.
function trimWolfResponse(text, maxChars = 420) {
  if (!text || text.length <= maxChars) return text;
  const chunk = text.slice(0, maxChars + 80);
  const sentenceEnd = /[.!?](?:\s|$)/g;
  let lastGoodCut = -1;
  let match;
  while ((match = sentenceEnd.exec(chunk)) !== null) {
    if (match.index + 1 <= maxChars) lastGoodCut = match.index + 1;
  }
  if (lastGoodCut > 30) return text.slice(0, lastGoodCut).trim();
  const hardCut  = text.slice(0, maxChars);
  const lastSpace = hardCut.lastIndexOf(' ');
  return (lastSpace > 30 ? hardCut.slice(0, lastSpace) : hardCut).trim() + '...';
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 11 — Chat control intent detection
// ══════════════════════════════════════════════════════════════════════════

// Detect when the owner is asking Wolf AI to stay out of a conversation.
// Handles three types of requests:
//   • block/silence this chat or a specific number
//   • hands-off detection: "don't interrupt my conversation with 254712345678"
//   • allow/deny groups
//   • unblock a previously blocked number
//
// Called for BOTH incoming AND outgoing (fromMe) messages so the owner can
// type "don't interrupt me with John" from their own phone and have it work.
//
// APOSTROPHE NORMALISATION:
//   WhatsApp often sends "smart" (curly) apostrophes (U+2018 ' / U+2019 ')
//   instead of ASCII '.  All apostrophe variants are replaced with ASCII '
//   at the top of this function so every regex only needs to handle '.
function detectChatControlIntent(text, currentChatId) {
  // Normalise ALL apostrophe variants to ASCII ' so regex always works
  // WhatsApp often sends curly/smart apostrophes (U+2019 ' and U+2018 ')
  const normalised = text
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035`]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
  const lower = normalised.toLowerCase();

  const jidPattern = /([\d]+-[\d]+@g\.us|[\w\d.+-]+@[sg]\.whatsapp\.net)/i;

  // "silence here" / "stop responding in this chat"
  const silenceHere = /\b(silence|block|quiet|stop responding|don't respond|dont respond|pause|mute|go quiet|be quiet|stop talking)\b.{0,30}\b(here|this chat|this group|this conversation)\b/i;
  const hereFirst   = /\b(here|this chat|this group|this conversation)\b.{0,20}\b(silence|block|quiet|stop|mute)\b/i;
  if (silenceHere.test(lower) || hereFirst.test(lower)) {
    return { action: 'block', jid: currentChatId };
  }

  // ── HANDS-OFF DETECTION ──────────────────────────────────────────────────
  // Extract the first phone number anywhere in the message (9–15 digits).
  // Using 9+ digits to avoid matching short numbers like years or amounts.
  const anyNumberInText = normalised.match(/\b(\d{9,15})\b/);
  if (anyNumberInText) {
    const digits = anyNumberInText[1];

    // Signal 1: "don't/do not interrupt/interfere" anywhere in message
    // After normalisation all apostrophes are ASCII so don't → don't always matches
    const hasNoInterrupt = /\b(don't|dont|do not)\s+(inter(rupt|fere)|respond|jump in|butt in|cut in|reply)\b/i.test(lower);

    // Signal 2: "I'll be talking/speaking/chatting to/with [number]"
    // Number can appear anywhere after the verb — no adjacency required
    const hasTalkingTo = /i('ll|ll| will| am going to| gonna)\s+(be\s+)?(chat(ting)?|talk(ing)?|speak(ing)?|message|text(ing)?)\s+(to|with)\b/i.test(lower);

    // Signal 3: explicit "hands off", "leave us alone", "stay out" phrases
    const hasHandsOff = /\bhands? *off\b|\bleave (us|me) alone\b|\bstay out\b|\bno interfer/i.test(lower);

    console.log(`[WolfAI/chatControl] number=${digits} noInterrupt=${hasNoInterrupt} talkingTo=${hasTalkingTo} handsOff=${hasHandsOff} lower="${lower}"`);

    if (hasNoInterrupt || hasTalkingTo || hasHandsOff) {
      return { action: 'block', jid: `${digits}@s.whatsapp.net` };
    }
  }

  // "block/silence/ignore <number or JID>"
  const blockJidMatch = text.match(/(?:block|silence|ignore|don'?t respond in)\s+(.+)/i);
  if (blockJidMatch) {
    const jid = normalizeToJid(blockJidMatch[1].trim());
    if (jid) return { action: 'block', jid };
  }

  // "allow/respond in/activate in <group JID>"
  const allowMatch = text.match(
    /(?:allow|respond in|talk in|you can talk\s+in|i need you in|activate in|enable in|join|come to|be in)\s+([\d]+-[\d]+@g\.us|[\d]{5,}@g\.us|[\w\d.+-]+@g\.us)/i
  );
  if (allowMatch) return { action: 'allow_group', jid: allowMatch[1] };

  const allowJidSuffix = text.match(jidPattern);
  if (allowJidSuffix && /\b(allow|need you|talk here|respond|come to|activate|join)\b/i.test(lower) && allowJidSuffix[1].includes('@g.us')) {
    return { action: 'allow_group', jid: allowJidSuffix[1] };
  }

  // "deny/remove from groups/deactivate in <group JID>"
  const denyMatch = text.match(
    /(?:deny|remove from groups?|no longer respond in|stop talking in|leave|exit|deactivate in)\s+([\d]+-[\d]+@g\.us|[\w\d.+-]+@g\.us)/i
  );
  if (denyMatch) return { action: 'deny_group', jid: denyMatch[1] };

  // "unblock/allow back/respond again to <number>"
  const unblockMatch = normalised.match(
    /(?:unblock|allow(?:\s+back| again)?|respond again(?: to)?|talk(?:\s+to)? again|resume)\s*\+?([\d\s\-]{7,15}|[\w\d.+-]+@[sg]\.whatsapp\.net)/i
  );
  if (unblockMatch) {
    const raw = unblockMatch[1].trim();
    const jid = normalizeToJid(raw);
    if (jid) return { action: 'unblock', jid };
  }

  return null; // no chat control intent found
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 12 — Command info lookup
// ══════════════════════════════════════════════════════════════════════════

// Find a command in the commands Map by name or alias.
function lookupCommand(name, commands) {
  const q = name.toLowerCase().trim();
  if (commands.has(q)) return commands.get(q);
  for (const [, cmd] of commands) {
    const al = cmd.aliases || cmd.alias || [];
    if (Array.isArray(al) && al.some(a => a.toLowerCase() === q)) return cmd;
  }
  return null;
}

// Format a command's metadata as a readable WhatsApp message.
function formatCommandInfo(cmd) {
  const name    = cmd.name || '?';
  const desc    = cmd.description || cmd.desc || 'No description available.';
  const aliases = (cmd.aliases || cmd.alias || []);
  const usage   = cmd.usage || '';
  let info = `📋 *${name}*\n📝 ${desc}`;
  if (aliases.length > 0) info += `\n🔗 *Also:* ${aliases.join(', ')}`;
  if (usage) info += `\n💡 *Usage:* .${usage}`;
  if (cmd.category) info += `\n📁 *Category:* ${cmd.category}`;
  return info;
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 13 — Main handler
// ══════════════════════════════════════════════════════════════════════════

// Main Wolf AI message handler — called by index.js for every DM.
//
// Processing pipeline:
//   1. Basic guards: blocked chat, group not allowed
//   2. chatControl check (runs for outgoing messages too)
//   3. Outgoing guard: stop here for messages the owner sends to contacts
//   4. Command info lookup: "what does antilink do?"
//   5. Quick intent match: fast regex → immediate command execution
//   6. AI query: build prompt, try all models, clean response
//   7. Parse [EXECUTE:] tag or infer action from AI text
//   8. Send reply + save conversation
//
// Returns true if the message was handled, false if it should be passed on.
export async function handleWolfAI(sock, msg, commands, executeCommand, preExtractedText) {
  const text = preExtractedText || extractText(msg);
  if (!text || text.trim().length < 2) return false;

  const chatId   = msg.key.remoteJid;
  const senderId = msg.key.participant || msg.key.remoteJid;
  const isGroup  = chatId.includes('@g.us');

  // Blocked chats and non-whitelisted groups are always silenced
  if (isChatBlocked(chatId)) return false;
  if (isGroup && !isGroupAllowed(chatId)) return false;

  const isOutgoing  = msg.key.fromMe === true;
  const userMessage = text.trim();
  const wolfName    = getWolfName();

  // chatControl always runs for outgoing messages too — owner may type
  // "don't interrupt my conversation with 254713046497" from their phone
  const chatControl = detectChatControlIntent(userMessage, chatId);
  if (chatControl) {
    let reply = '';
    if (chatControl.action === 'block') {
      addBlockedChat(chatControl.jid);
      const isHere     = chatControl.jid === chatId;
      const displayNum = chatControl.jid.split('@')[0];
      const label      = isHere ? 'this chat' : `+${displayNum}`;
      reply = `🐺 Got it — I'll stay out of *${label}* and won't interrupt your conversation. To let me back in, say: *?wolf resume ${displayNum}*`;
    } else if (chatControl.action === 'unblock') {
      removeBlockedChat(chatControl.jid);
      const displayNum = chatControl.jid.split('@')[0];
      reply = `🐺 Back in action! I'll respond to *+${displayNum}* again.`;
    } else if (chatControl.action === 'allow_group') {
      addAllowedGroup(chatControl.jid);
      reply = `🐺 I'm now active in group *${chatControl.jid}*. I'll respond there when you chat with me.`;
    } else if (chatControl.action === 'deny_group') {
      removeAllowedGroup(chatControl.jid);
      reply = `🐺 Removed from active groups. I'll no longer respond in *${chatControl.jid}*.`;
    }
    if (reply) {
      await sock.sendMessage(chatId, { text: reply }, { quoted: msg });
    }
    return true;
  }

  // For messages the owner sends FROM their phone (outgoing/fromMe), stop here.
  // Wolf AI should not intercept the owner's own conversations with contacts —
  // it only responds to INCOMING messages in the owner's DMs.
  if (isOutgoing) return false;

  // ── Command info lookup: "what does autobio do?" ────────────────────────
  const lookupRe = /\b(?:what(?:'?s|\s+is|\s+does?)?\s+(?:the\s+)?|tell\s+me\s+about\s+(?:the\s+)?|explain\s+(?:the\s+)?|lemme\s+(?:see|know)\s+(?:what\s+)?(?:the\s+)?|show\s+me\s+(?:what\s+)?(?:the\s+)?|how\s+(?:does|do)\s+(?:the\s+)?|describe\s+(?:the\s+)?)(\w[\w-]*)\s*(?:do(?:es)?|command|work|feature)?\s*[?!.]*$/i;
  const lookupM  = userMessage.match(lookupRe);
  if (lookupM) {
    const found = lookupCommand(lookupM[1], commands);
    if (found) {
      await sock.sendPresenceUpdate('composing', chatId).catch(() => {});
      await new Promise(r => setTimeout(r, 500));
      await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
      await sock.sendMessage(chatId, { text: `🐺 ${formatCommandInfo(found)}` }, { quoted: msg });
      return true;
    }
  }

  // ── Quick intent match (no AI call needed) ───────────────────────────────
  const quickMatch = quickIntentMatch(userMessage);
  if (quickMatch && commands.has(quickMatch.command)) {
    if (quickMatch.confirm) {
      await sock.sendPresenceUpdate('composing', chatId).catch(() => {});
      await new Promise(r => setTimeout(r, 600));
      await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
      await sock.sendMessage(chatId, { text: `🐺 ${quickMatch.confirm}` }, { quoted: msg });
    }
    await executeCommand(quickMatch.command, quickMatch.args);
    return true;
  }

  // ── Full AI query ────────────────────────────────────────────────────────
  await sock.presenceSubscribe(chatId).catch(() => {});
  await sock.sendPresenceUpdate('composing', chatId).catch(() => {}); // show "typing…"

  const conversation = loadConversation(senderId);
  const aiResponse   = await getWolfResponse(userMessage, conversation);

  await sock.sendPresenceUpdate('paused', chatId).catch(() => {});

  // All AI models failed — send a friendly error and return
  if (!aiResponse) {
    const wn = getWolfName();
    await sock.sendMessage(chatId, {
      text: `🐺 ${wn} is having a brain moment. Try again shortly!`
    }, { quoted: msg });
    return true;
  }

  // Parse optional [EXECUTE:cmd:args] tag from the AI reply
  let parsedCommand = parseCommandFromResponse(aiResponse);
  const rawDisplay  = stripCommandTag(aiResponse);      // remove the tag from display text
  const displayText = trimWolfResponse(rawDisplay);     // trim to 420 chars at sentence boundary

  // Fallback: if AI didn't include [EXECUTE:] tag, try to infer the action
  // from what it said (e.g. "Turning antilink on…")
  if (!parsedCommand && rawDisplay) {
    const inferred = extractActionFromAIText(rawDisplay);
    if (inferred && commands.has(inferred.command)) parsedCommand = inferred;
  }

  // Save the exchange to the conversation file (both user and assistant turns)
  conversation.messages.push({ role: 'user',      content: userMessage });
  conversation.messages.push({ role: 'assistant', content: rawDisplay || userMessage });
  saveConversation(senderId, conversation);

  // Send the AI reply and (if applicable) execute the bot command
  if (parsedCommand && commands.has(parsedCommand.command)) {
    // Send the conversational reply first, then run the command
    if (displayText) {
      await sock.sendMessage(chatId, { text: `🐺 ${displayText}` }, { quoted: msg });
    }
    await executeCommand(parsedCommand.command, parsedCommand.args);
  } else if (displayText) {
    await sock.sendMessage(chatId, { text: `🐺 ${displayText}` }, { quoted: msg });
  }

  return true;
}

// ── Text extractor ─────────────────────────────────────────────────────────
// Pull the plain text out of a WhatsApp message object, handling all the
// different message types (plain text, extended, image/video caption, etc.)
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

// ══════════════════════════════════════════════════════════════════════════
// SECTION 14 — ?wolf command handler
// ══════════════════════════════════════════════════════════════════════════
// Handles explicit ?wolf <subcommand> calls.  Kept here (rather than in
// commands/ai/wolf.js) so index.js can call it directly for the AI DM path.
//
// Sub-commands:
//   on / enable      — turn Wolf AI on
//   off / disable    — turn Wolf AI off
//   name <name>      — rename the AI assistant
//   block <jid>      — silence Wolf AI in a specific chat/number
//   unblock <jid>    — re-enable a previously blocked chat/number
//   allow <gid>      — allow Wolf AI in a specific group JID
//   deny / disallow  — remove a group from the allowed list
//   chats / list     — show silenced chats and active groups
//   status / stats   — show full AI stats
//   clear            — delete all stored conversation files
//   (no args)        — show the status card / help menu
export async function wolfCommandHandler(sock, m, args, PREFIX) {
  const jid     = m.key.remoteJid;
  const botName = getBotName();
  const sub     = (args[0] || '').toLowerCase();

  if (sub === 'on' || sub === 'enable') {
    setWolfEnabled(true);
    const wn = getWolfName();
    return sock.sendMessage(jid, {
      text: `🐺 *${wn} Activated*\n\nJust DM me anything — I'm listening!\n\nExamples:\n• _play Bohemian Rhapsody_\n• _what does antilink do_\n• _show the bot menu_\n• _turn on antilink_`
    }, { quoted: m });
  }

  if (sub === 'off' || sub === 'disable') {
    setWolfEnabled(false);
    return sock.sendMessage(jid, {
      text: `🐺 *${getWolfName()} Deactivated*\n\nUse *${PREFIX}wolf on* to reactivate.`
    }, { quoted: m });
  }

  if (sub === 'name') {
    const newName = args.slice(1).join(' ').trim();
    if (!newName) {
      return sock.sendMessage(jid, {
        text: `🐺 Current AI name: *${getWolfName()}*\n\nTo change: *${PREFIX}wolf name <new name>*`
      }, { quoted: m });
    }
    const old = getWolfName();
    setWolfName(newName);
    return sock.sendMessage(jid, {
      text: `🐺 AI name changed from *${old}* → *${newName}*`
    }, { quoted: m });
  }

  if (sub === 'block' || sub === 'silence') {
    const raw       = args.slice(1).join(' ').trim();
    const targetJid = raw ? normalizeToJid(raw) : jid;
    if (!targetJid) {
      return sock.sendMessage(jid, {
        text: `❌ Invalid number or JID.\nUsage: *${PREFIX}wolf block <number or JID>*\nOr run *${PREFIX}wolf block* from within the chat you want to silence.`
      }, { quoted: m });
    }
    addBlockedChat(targetJid);
    const label = targetJid === jid ? 'this chat' : targetJid;
    return sock.sendMessage(jid, {
      text: `🔇 *Silenced*\n\nI won't respond in *${label}*.\nUse *${PREFIX}wolf unblock ${targetJid}* to re-enable.`
    }, { quoted: m });
  }

  if (sub === 'unblock' || sub === 'resume') {
    const raw       = args.slice(1).join(' ').trim();
    const targetJid = raw ? normalizeToJid(raw) : jid;
    if (!targetJid) {
      return sock.sendMessage(jid, {
        text: `❌ Invalid number or JID.\nUsage: *${PREFIX}wolf unblock <number or JID>*`
      }, { quoted: m });
    }
    removeBlockedChat(targetJid);
    const label = targetJid === jid ? 'this chat' : targetJid;
    return sock.sendMessage(jid, {
      text: `🔊 *Unblocked*\n\nI'll respond in *${label}* again.`
    }, { quoted: m });
  }

  if (sub === 'allow') {
    const raw       = args.slice(1).join(' ').trim();
    const targetJid = raw ? normalizeToJid(raw) : (jid.includes('@g.us') ? jid : null);
    if (!targetJid || !targetJid.includes('@g.us')) {
      return sock.sendMessage(jid, {
        text: `❌ Please provide a valid group JID.\nUsage: *${PREFIX}wolf allow <group-jid>*`
      }, { quoted: m });
    }
    addAllowedGroup(targetJid);
    return sock.sendMessage(jid, {
      text: `✅ *Group Activated*\n\nI'm now active in:\n*${targetJid}*\nUse *${PREFIX}wolf deny ${targetJid}* to remove.`
    }, { quoted: m });
  }

  if (sub === 'deny' || sub === 'disallow') {
    const raw       = args.slice(1).join(' ').trim();
    const targetJid = raw ? normalizeToJid(raw) : (jid.includes('@g.us') ? jid : null);
    if (!targetJid || !targetJid.includes('@g.us')) {
      return sock.sendMessage(jid, {
        text: `❌ Please provide a valid group JID.\nUsage: *${PREFIX}wolf deny <group-jid>*`
      }, { quoted: m });
    }
    removeAllowedGroup(targetJid);
    return sock.sendMessage(jid, { text: `🚫 *Group Removed*\n\nI'll no longer respond in:\n*${targetJid}*` }, { quoted: m });
  }

  if (sub === 'chats' || sub === 'list' || sub === 'groups') {
    const blocked = getBlockedChats();
    const groups  = getAllowedGroups();
    let text = `🐺 *${getWolfName()} — Chat Control*\n\n`;
    text += `🔇 *Silenced Chats (${blocked.length}):*\n`;
    text += blocked.length === 0 ? `  _None_\n` : blocked.map((b, i) => `  ${i + 1}. ${b}`).join('\n') + '\n';
    text += `\n✅ *Active Groups (${groups.length}):*\n`;
    text += groups.length === 0 ? `  _None — only DMs by default_\n` : groups.map((g, i) => `  ${i + 1}. ${g}`).join('\n') + '\n';
    text += `\n*Commands:*\n• *${PREFIX}wolf block <number/jid>* — silence\n• *${PREFIX}wolf unblock <number/jid>* — re-enable\n• *${PREFIX}wolf allow <group-jid>* — activate in group\n• *${PREFIX}wolf deny <group-jid>* — deactivate in group`;
    return sock.sendMessage(jid, { text }, { quoted: m });
  }

  if (sub === 'status' || sub === 'stats') {
    const stats = getWolfStats();
    return sock.sendMessage(jid, {
      text: `🐺 *${stats.name} Status*\n\n` +
        `• *Status:* ${stats.enabled ? '✅ Active' : '❌ Disabled'}\n` +
        `• *Name:* ${stats.name}\n• *Models:* ${stats.models} available\n` +
        `• *Conversations:* ${stats.conversations} stored\n` +
        `• *Silenced Chats:* ${getBlockedChats().length}\n` +
        `• *Active Groups:* ${getAllowedGroups().length}\n• *Access:* Owner & Sudo only`
    }, { quoted: m });
  }

  if (sub === 'clear') {
    try {
      const count = Object.keys(_convCache).length;
      for (const userId of Object.keys(_convCache)) {
        delete _convCache[userId];
      }
      return sock.sendMessage(jid, {
        text: `🐺 *Conversations Cleared*\n\nCleared ${count} active conversation(s). Memory reset.`
      }, { quoted: m });
    } catch (err) {
      return sock.sendMessage(jid, { text: `❌ Error clearing: ${err.message}` }, { quoted: m });
    }
  }

  // Default: show the status card + full command reference
  const stats = getWolfStats();
  return sock.sendMessage(jid, {
    text: `🐺 *${stats.name} — ${botName}'s AI Assistant*\n\n` +
      `*Status:* ${stats.enabled ? '✅ Active' : '❌ Disabled'} | *Name:* ${stats.name}\n` +
      `*Models:* ${stats.models} | *Convos:* ${stats.conversations}\n` +
      `*Silenced:* ${getBlockedChats().length} chats | *Groups:* ${getAllowedGroups().length}\n\n` +
      `*Commands:*\n• *${PREFIX}wolf on/off* — Toggle\n• *${PREFIX}wolf name <name>* — Rename\n` +
      `• *${PREFIX}wolf block/unblock <jid>* — Silence/resume\n• *${PREFIX}wolf allow/deny <group-jid>* — Group access\n` +
      `• *${PREFIX}wolf chats* — View chat controls\n• *${PREFIX}wolf status* — Full stats\n• *${PREFIX}wolf clear* — Reset memory`
  }, { quoted: m });
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 15 — Default export
// ══════════════════════════════════════════════════════════════════════════
// Single object exported as default so index.js only needs one import line.
// All public functions are included here for convenience.
const WolfAI = {
  isEnabled:     isWolfEnabled,
  setEnabled:    setWolfEnabled,
  isTrigger:     isWolfTrigger,
  handle:        handleWolfAI,
  command:       wolfCommandHandler,
  getWolfName, setWolfName, getWolfStats,
  getBlockedChats, addBlockedChat, removeBlockedChat,
  getAllowedGroups, addAllowedGroup, removeAllowedGroup,
  normalizeToJid, isChatBlocked, isGroupAllowed,
};
export default WolfAI;
