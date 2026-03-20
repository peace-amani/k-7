import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getBotName } from './botname.js';

const WOLF_DATA_DIR = './data/wolfai';
const WOLF_CONVERSATIONS_DIR = path.join(WOLF_DATA_DIR, 'conversations');
const WOLF_CONFIG_FILE = path.join(WOLF_DATA_DIR, 'wolf_config.json');

let wolfEnabled = null;
let _wolfConfig = null;

function ensureDirs() {
  if (!fs.existsSync(WOLF_DATA_DIR)) fs.mkdirSync(WOLF_DATA_DIR, { recursive: true });
  if (!fs.existsSync(WOLF_CONVERSATIONS_DIR)) fs.mkdirSync(WOLF_CONVERSATIONS_DIR, { recursive: true });
}

function loadWolfConfig() {
  ensureDirs();
  try {
    if (fs.existsSync(WOLF_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(WOLF_CONFIG_FILE, 'utf8'));
    }
  } catch {}
  return { enabled: true };
}

function saveWolfConfig(updates) {
  ensureDirs();
  const current = loadWolfConfig();
  const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };
  try { fs.writeFileSync(WOLF_CONFIG_FILE, JSON.stringify(merged, null, 2)); } catch {}
  _wolfConfig = merged;
  return merged;
}

export function isWolfEnabled() {
  if (wolfEnabled !== null) return wolfEnabled;
  const cfg = loadWolfConfig();
  wolfEnabled = cfg.enabled !== false;
  return wolfEnabled;
}

export function setWolfEnabled(enabled) {
  wolfEnabled = enabled;
  saveWolfConfig({ enabled });
  return wolfEnabled;
}

export function getWolfName() {
  if (_wolfConfig?.wolfName) return _wolfConfig.wolfName;
  const cfg = loadWolfConfig();
  return cfg.wolfName || 'W.O.L.F';
}

export function setWolfName(name) {
  const cfg = saveWolfConfig({ wolfName: name });
  _wolfConfig = cfg;
  return name;
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
    name: getWolfName(),
    conversations: convCount,
    models: MODEL_PRIORITY.length,
  };
}

export function getBlockedChats() {
  const cfg = loadWolfConfig();
  return cfg.blockedChats || [];
}

export function addBlockedChat(jid) {
  const blocked = getBlockedChats();
  if (!blocked.includes(jid)) {
    blocked.push(jid);
    saveWolfConfig({ blockedChats: blocked });
  }
}

export function removeBlockedChat(jid) {
  const blocked = getBlockedChats().filter(j => j !== jid);
  saveWolfConfig({ blockedChats: blocked });
}

export function isChatBlocked(jid) {
  return getBlockedChats().includes(jid);
}

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

export function normalizeToJid(input) {
  if (!input) return null;
  input = input.trim();
  if (input.includes('@')) return input;
  const digits = input.replace(/[^0-9]/g, '');
  if (digits.length >= 7) return `${digits}@s.whatsapp.net`;
  return null;
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
    fallbackUrl: 'https://apis-e3qq.onrender.com/api/ai/gemini',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
  cohere: {
    name: 'Cohere', url: 'https://apis.xwolf.space/api/ai/cohere', method: 'GET',
    fallbackUrl: 'https://apis-e3qq.onrender.com/api/ai/cohere',
    params: (q) => ({ q }), extract: EXTRACT_ALL
  },
};
const MODEL_PRIORITY = ['gpt', 'copilot', 'claude', 'grok', 'blackbox', 'bard', 'perplexity', 'metai', 'mistral', 'qwen', 'venice', 'ilama', 'gemini', 'cohere'];

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

  if (conversation.messages.length > 0) {
    prompt += `\n\nCONVERSATION HISTORY:\n`;
    const recent = conversation.messages.slice(-12);
    for (const msg of recent) {
      prompt += `${msg.role === 'user' ? 'Human' : wolfName}: ${msg.content}\n`;
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

  const tryUrl = async (url) => {
    try {
      const response = await axios({
        method: model.method, url,
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
  };

  const primary = await tryUrl(model.url);
  if (primary) return primary;

  if (model.fallbackUrl) return tryUrl(model.fallbackUrl);
  return null;
}

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

  const simpleResult = await queryAI('gpt', userMessage);
  if (simpleResult) {
    const cleaned = cleanResponse(simpleResult);
    if (isValidWolfResponse(cleaned)) return cleaned;
  }

  return null;
}

function cleanResponse(text) {
  const wolfName = getWolfName();
  if (!text) return '';
  text = text.replace(/\[\d+\]/g, '');
  text = text.replace(/Human:.*$/gm, '');
  text = text.replace(/W\.O\.L\.F:/g, '');
  text = text.replace(new RegExp(`${wolfName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'g'), '');
  text = text.replace(/^(Assistant|AI|Bot|Claude|GPT|Grok|Copilot|Bard):\s*/gim, '');
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
  const escapedWolfName = wolfName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  text = text.replace(new RegExp(`(${escapedWolfName}[\\s,]*){2,}`, 'g'), `${wolfName} `);
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  return text.trim();
}

function extractActionFromAIText(aiText) {
  // When AI says "Turning antilink on..." without [EXECUTE:] tag, try to infer the command
  const t = aiText.toLowerCase();
  const toggleable = 'antilink|antibug|antispam|antibadword|antileave|antiimage|antivideo|antisticker|antiaudio|antibot|antidelete|antiviewonce|antigrouplink|anticall|autotyping|autoread|autoviewstatus|autorecording|welcome|autoreact|leavealert';
  const togRe = new RegExp(`\\b(turning|switching|toggling|setting)\\s+(${toggleable})\\s+(on|off)\\b|\\b(${toggleable})\\s+(turned|switched|set)\\s+(on|off)\\b`, 'i');
  const togM = t.match(togRe);
  if (togM) {
    const cmd = (togM[2] || togM[4] || '').toLowerCase().trim();
    const state = (togM[3] || togM[6] || '').toLowerCase().trim();
    if (cmd && state) return { command: cmd, args: [state] };
  }
  const modeM = t.match(/\bswitching\s+(?:to\s+)?(public|silent|groups?|dms?|buttons?|channel|default)\s+mode\b/i)
    || t.match(/\bmode\s+(?:to\s+)?(public|silent|groups?|dms?|buttons?|channel|default)\b/i);
  if (modeM) {
    const m = modeM[1].toLowerCase().replace(/s$/, '');
    const normalized = m === 'group' ? 'groups' : m === 'dm' ? 'dms' : m;
    return { command: 'mode', args: [normalized] };
  }
  const playM = aiText.match(/\bplaying\s+["']?(.+?)["']?\s*(?:for you|now|🎵|$)/i);
  if (playM) return { command: 'play', args: [playM[1].trim()] };
  const imgM = aiText.match(/\bgenerating\s+(?:an?\s+)?(?:ai\s+)?image\s+(?:of\s+)?["']?(.+?)["']?\s*(?:for you|now|🎨|$)/i);
  if (imgM) return { command: 'imagine', args: [imgM[1].trim()] };
  return null;
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
  // Strip common filler prefixes so "can you turn on antilink" → "turn on antilink"
  let cleaned = text.trim().replace(
    /^(?:can\s+you|could\s+you|please|pls|hey\s+wolf,?\s*|wolf,?\s*|would\s+you|i\s+want\s+(?:you\s+to\s+)?|i\s+need\s+(?:you\s+to\s+)?|go\s+ahead\s+and\s+|try\s+to\s+)\s*/i,
    ''
  );
  const lower = cleaned.toLowerCase().trim().replace(/[?!.]+$/, '').trim();
  const orig = cleaned.trim();

  // Menu — explicit only
  if (/^(show\s+)?(me\s+)?(the\s+)?(bot\s+)?menu(\s+please|\s+pls)?$/.test(lower)
    || /^(open|pull\s+up|bring\s+up|display)\s+(the\s+)?(bot\s+)?menu$/.test(lower)
    || /^(bot\s+)?menu$/.test(lower)) {
    return { command: 'menu', args: [] };
  }

  // Sub-menus
  if (/\b(show\s+)?(the\s+)?(music|song|audio)\s*menu\b/i.test(lower)) return { command: 'musicmenu', args: [] };
  if (/\b(show\s+)?(the\s+)?ai\s*menu\b/i.test(lower)) return { command: 'aimenu', args: [] };
  if (/\b(show\s+)?(the\s+)?game[s]?\s*menu\b/i.test(lower)) return { command: 'gamemenu', args: [] };
  if (/\b(show\s+)?(the\s+)?(fun|funny)\s*menu\b/i.test(lower)) return { command: 'funmenu', args: [] };
  if (/\b(show\s+)?(the\s+)?(download[s]?|downloader)\s*menu\b/i.test(lower)) return { command: 'downloadmenu', args: [] };
  if (/\b(show\s+)?(the\s+)?(tool[s]?)\s*menu\b/i.test(lower)) return { command: 'toolsmenu', args: [] };

  // Repo — direct route, no longer hidden
  if (/^(show\s+)?(the\s+)?(repo|repository|github|source|git|bot\s+repo|bot\s+source|bot\s+github)(\s+link|\s+info|\s+url)?$/.test(lower)
    || /\b(what'?s?\s+(the\s+)?(repo|github|source|repository)|send\s+(me\s+)?(the\s+)?(repo|github|source)\s+(link|url)?)\b/i.test(lower)) {
    return { command: 'repo', args: [] };
  }

  // Status checks — no confirmation needed, command output is the response
  if (/^(are\s+you\s+)?(alive|there|online|working|active|running|awake)\??$/.test(lower)) return { command: 'alive', args: [] };
  if (/^ping$/.test(lower)) return { command: 'ping', args: [] };
  if (/^(uptime|runtime)$/.test(lower)) return { command: 'uptime', args: [] };
  if (/^prefix(info)?$/.test(lower)) return { command: 'prefixinfo', args: [] };
  if (/^(show\s+)?(the\s+)?owner$/.test(lower)) return { command: 'owner', args: [] };

  // Restart — confirm before doing
  if (/^(please\s+)?(restart|reboot)(\s+(the\s+)?bot)?$/.test(lower)) {
    return { command: 'restart', args: [], confirm: 'Restarting the bot now 🔄' };
  }

  // Mode switching — always confirm
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

  // Toggle features — confirm what's being done
  const toggleable = 'antilink|antibug|antispam|antibadword|antileave|antiimage|antivideo|antisticker|antiaudio|antibot|antidelete|antiviewonce|antigrouplink|anticall|autotyping|autoread|autoviewstatus|autorecording|welcome|autoreact|leavealert';
  const togRe = new RegExp(`(?:(?:turn|switch|set|put)\\s+)?(on|off|enable|disable)\\s+(?:the\\s+)?(${toggleable})|(?:the\\s+)?(${toggleable})\\s+(?:turn\\s+)?(on|off|enable|disable)|(${toggleable})\\s+(on|off)`, 'i');
  const togM = lower.match(togRe);
  if (togM) {
    const cmd = (togM[2] || togM[3] || togM[5] || '').toLowerCase().trim();
    const stateRaw = (togM[1] || togM[4] || togM[6] || '').toLowerCase().trim();
    if (cmd && stateRaw) {
      const state = (stateRaw === 'on' || stateRaw === 'enable') ? 'on' : 'off';
      const icon = state === 'on' ? '✅' : '❌';
      return { command: cmd, args: [state], confirm: `${cmd} turned ${state} ${icon}` };
    }
  }

  // Music / Play
  const playM = orig.match(/^(?:play|play\s+me|search\s+for|find\s+(?:the\s+)?song)\s+(.+)/i);
  if (playM) return { command: 'play', args: [playM[1].trim()], confirm: `Searching for *${playM[1].trim()}* 🎵` };

  const songM = orig.match(/^(?:download|get|dl)\s+(?:song|audio|mp3|music)?\s*(?:of\s+|for\s+)?(.+)/i);
  if (songM && !songM[1].match(/^https?:\/\//)) return { command: 'song', args: [songM[1].trim()], confirm: `Downloading *${songM[1].trim()}* as audio 🎵` };

  const vidM = orig.match(/^(?:download|get|dl)\s+(?:video|vid|mp4)?\s*(?:of\s+|for\s+)?(.+)/i);
  if (vidM && !vidM[1].match(/^https?:\/\//)) return { command: 'video', args: [vidM[1].trim()], confirm: `Downloading *${vidM[1].trim()}* as video 🎬` };

  // URL downloads
  const urlM = orig.match(/(?:download|get|dl)\s+(https?:\/\/\S+)/i) || orig.match(/^(https?:\/\/\S+)$/);
  if (urlM) {
    const url = urlM[1];
    if (/tiktok/i.test(url)) return { command: 'tiktok', args: [url], confirm: `Downloading TikTok video ⏬` };
    if (/instagram|ig\./i.test(url)) return { command: 'instagram', args: [url], confirm: `Downloading Instagram media ⏬` };
    if (/facebook|fb\.com/i.test(url)) return { command: 'facebook', args: [url], confirm: `Downloading Facebook video ⏬` };
    if (/spotify/i.test(url)) return { command: 'spotify', args: [url], confirm: `Downloading from Spotify 🎵` };
    if (/youtu/i.test(url)) return { command: 'youtube', args: [url], confirm: `Downloading from YouTube ⏬` };
    if (/mediafire/i.test(url)) return { command: 'mediafire', args: [url], confirm: `Downloading from MediaFire ⏬` };
  }

  // Shazam / identify song
  if (/\b(identify|shazam|what\s+(song|music)|find\s+this\s+song|name\s+this\s+song)\b/i.test(lower)) {
    return { command: 'shazam', args: [], confirm: `Identifying the song 🎵` };
  }

  // Lyrics
  const lyrM = orig.match(/\b(?:get|show|find|what\s+are)\s+(?:the\s+)?lyrics\s+(?:of\s+|for\s+)?(.+)/i);
  if (lyrM) return { command: 'lyrics', args: [lyrM[1].trim()], confirm: `Fetching lyrics for *${lyrM[1].trim()}* 📝` };

  // Image generation
  const imgM = orig.match(/^(?:generate|create|make|draw|imagine|ai\s+image\s+of)\s+(?:an?\s+)?(?:image|picture|photo|art\s+of|ai\s+image\s+of)?\s*(.+)/i);
  if (imgM && imgM[1].length > 2) return { command: 'imagine', args: [imgM[1].trim()], confirm: `Generating AI image of *${imgM[1].trim()}* 🎨` };

  // Sticker
  if (/\b(make|convert|turn)\s+(this|it)\s+(into?\s+)?a?\s*sticker\b/i.test(lower)
    || /^sticker$/.test(lower)) {
    return { command: 'sticker', args: [], confirm: `Converting to sticker 🎭` };
  }

  // Fun / games
  if (/^(tell\s+(me\s+)?a?\s*)?(joke|funny)$/.test(lower) || /\bsend\s+(me\s+)?a?\s*joke\b/i.test(lower)) {
    return { command: 'joke', args: [], confirm: `Here's a joke 😄` };
  }
  if (/^(get\s+(me\s+)?a?\s*)?(quote|inspiration)$/.test(lower)) return { command: 'quote', args: [], confirm: `Here's a quote 💭` };

  // Weather
  const wxM = orig.match(/\b(?:weather|weather\s+in|weather\s+for)\s+(.+)/i);
  if (wxM) return { command: 'weather', args: [wxM[1].trim()], confirm: `Checking weather for *${wxM[1].trim()}* 🌤️` };

  // Wikipedia
  const wikiM = orig.match(/^(?:wiki|search\s+wiki(?:pedia)?|wikipedia)\s+(.+)/i);
  if (wikiM) return { command: 'wiki', args: [wikiM[1].trim()], confirm: `Searching Wikipedia for *${wikiM[1].trim()}* 📖` };

  // News
  if (/^(show|get|latest|today'?s?)?\s*(news|headlines)$/.test(lower)) return { command: 'news', args: [], confirm: `Fetching latest news 📰` };

  // Screenshot
  const ssM = orig.match(/^(?:screenshot|ss|capture|snap)\s+(https?:\/\/\S+)/i);
  if (ssM) return { command: 'screenshot', args: [ssM[1]], confirm: `Taking screenshot of *${ssM[1]}* 📸` };

  // Translate
  const trM = orig.match(/^translate\s+(.+)/i);
  if (trM) return { command: 'translate', args: [trM[1].trim()], confirm: `Translating... 🌐` };

  // Define
  const defM = orig.match(/^(?:define|meaning\s+of|what\s+(?:does|is))\s+(.+)/i);
  if (defM) return { command: 'define', args: [defM[1].trim()], confirm: `Looking up *${defM[1].trim()}* 📚` };

  // Chatbot toggle
  const cbM = lower.match(/\bchatbot\s+(on|off|enable|disable)\b|\b(on|off|enable|disable)\s+(?:the\s+)?chatbot\b/i);
  if (cbM) {
    const st = (cbM[1] || cbM[2] || '').toLowerCase();
    const state = (st === 'on' || st === 'enable') ? 'on' : 'off';
    return { command: 'chatbot', args: [state], confirm: `Chatbot turned ${state} ${state === 'on' ? '✅' : '❌'}` };
  }

  return null;
}

function isValidWolfResponse(text) {
  if (!text || text.trim().length < 2) return false;
  const t = text.trim();
  const lower = t.toLowerCase();
  // Reject responses from Wolfram or wolf-branded search assistants
  if (/wolfram/i.test(t)) return false;
  if (/\bi\s*(?:am|'m)\s+(?:wolf|w\.o\.l\.f).{0,40}(?:search|engine|assistant|tool)/i.test(t)) return false;
  // Reject short flat refusals
  if (t.length < 180 && /^(?:no[,!.]?\s+i\s+|i\s+(?:cannot|can't|am\s+unable|'m\s+unable)|sorry[,.]?\s+i\s+(?:can|am))/i.test(lower)) return false;
  // Reject if the model identifies as any other AI engine
  if (/\b(?:as|being)\s+(?:an?\s+)?(?:ai|search)\s+(?:engine|assistant|model)\b/i.test(lower) && t.length < 200) return false;
  return true;
}

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
  const hardCut = text.slice(0, maxChars);
  const lastSpace = hardCut.lastIndexOf(' ');
  return (lastSpace > 30 ? hardCut.slice(0, lastSpace) : hardCut).trim() + '...';
}

function detectChatControlIntent(text, currentChatId) {
  const lower = text.toLowerCase();

  const jidPattern = /([\d]+-[\d]+@g\.us|[\w\d.+-]+@[sg]\.whatsapp\.net)/i;

  const silenceHere = /\b(silence|block|quiet|stop responding|don't respond|dont respond|pause|mute|go quiet|be quiet|stop talking)\b.{0,30}\b(here|this chat|this group|this conversation)\b/i;
  const hereFirst = /\b(here|this chat|this group|this conversation)\b.{0,20}\b(silence|block|quiet|stop|mute)\b/i;
  if (silenceHere.test(lower) || hereFirst.test(lower)) {
    return { action: 'block', jid: currentChatId };
  }

  // ── HANDS-OFF DETECTION ──────────────────────────────────────────────────
  // Extract the first phone number anywhere in the message (9–15 digits).
  // Using 9+ digits to avoid matching short numbers like years or amounts.
  const anyNumberInText = text.match(/\b(\d{9,15})\b/);
  if (anyNumberInText) {
    const digits = anyNumberInText[1];

    // Signal 1: "don't/do not interrupt/interfere" anywhere in message
    const hasNoInterrupt = /\b(?:don'?t|do\s+not)\s+(?:inter(?:rupt|fere)|respond|jump\s+in|butt\s+in|cut\s+in|reply)\b/i.test(lower);

    // Signal 2: "I'll be talking/speaking/chatting to/with [number]"
    // Number can appear anywhere after the verb — no adjacency required
    const hasTalkingTo = /i(?:'?ll| will| am going to| gonna)\s+(?:be\s+)?(?:chat(?:ting)?|talk(?:ing)?|speak(?:ing)?|message|text(?:ing)?)\s+(?:to|with)\b/i.test(lower);

    // Signal 3: explicit "hands off", "leave us alone", "stay out" phrases
    const hasHandsOff = /\bhands?\s*off\b|\bleave\s+(?:us|me)\s+alone\b|\bstay\s+out\b|\bno\s+interfer/i.test(lower);

    if (hasNoInterrupt || hasTalkingTo || hasHandsOff) {
      return { action: 'block', jid: `${digits}@s.whatsapp.net` };
    }
  }

  const blockJidMatch = text.match(/(?:block|silence|ignore|don'?t respond in)\s+(.+)/i);
  if (blockJidMatch) {
    const jid = normalizeToJid(blockJidMatch[1].trim());
    if (jid) return { action: 'block', jid };
  }

  const allowMatch = text.match(
    /(?:allow|respond in|talk in|you can talk\s+in|i need you in|activate in|enable in|join|come to|be in)\s+([\d]+-[\d]+@g\.us|[\d]{5,}@g\.us|[\w\d.+-]+@g\.us)/i
  );
  if (allowMatch) return { action: 'allow_group', jid: allowMatch[1] };

  const allowJidSuffix = text.match(jidPattern);
  if (allowJidSuffix && /\b(allow|need you|talk here|respond|come to|activate|join)\b/i.test(lower) && allowJidSuffix[1].includes('@g.us')) {
    return { action: 'allow_group', jid: allowJidSuffix[1] };
  }

  const denyMatch = text.match(
    /(?:deny|remove from groups?|no longer respond in|stop talking in|leave|exit|deactivate in)\s+([\d]+-[\d]+@g\.us|[\w\d.+-]+@g\.us)/i
  );
  if (denyMatch) return { action: 'deny_group', jid: denyMatch[1] };

  const unblockMatch = text.match(
    /(?:unblock|allow(?:\s+back| again)?|respond again(?: to)?|talk(?:\s+to)? again|resume)\s*\+?([\d\s\-]{7,15}|[\w\d.+-]+@[sg]\.whatsapp\.net)/i
  );
  if (unblockMatch) {
    const raw = unblockMatch[1].trim();
    const jid = normalizeToJid(raw);
    if (jid) return { action: 'unblock', jid };
  }

  return null;
}

function lookupCommand(name, commands) {
  const q = name.toLowerCase().trim();
  if (commands.has(q)) return commands.get(q);
  for (const [, cmd] of commands) {
    const al = cmd.aliases || cmd.alias || [];
    if (Array.isArray(al) && al.some(a => a.toLowerCase() === q)) return cmd;
  }
  return null;
}

function formatCommandInfo(cmd) {
  const name = cmd.name || '?';
  const desc = cmd.description || cmd.desc || 'No description available.';
  const aliases = (cmd.aliases || cmd.alias || []);
  const usage = cmd.usage || '';
  let info = `📋 *${name}*\n📝 ${desc}`;
  if (aliases.length > 0) info += `\n🔗 *Also:* ${aliases.join(', ')}`;
  if (usage) info += `\n💡 *Usage:* .${usage}`;
  if (cmd.category) info += `\n📁 *Category:* ${cmd.category}`;
  return info;
}

export async function handleWolfAI(sock, msg, commands, executeCommand, preExtractedText) {
  const text = preExtractedText || extractText(msg);
  if (!text || text.trim().length < 2) return false;

  const chatId = msg.key.remoteJid;
  const senderId = msg.key.participant || msg.key.remoteJid;
  const isGroup = chatId.includes('@g.us');

  if (isChatBlocked(chatId)) return false;
  if (isGroup && !isGroupAllowed(chatId)) return false;

  const userMessage = text.trim();
  const wolfName = getWolfName();

  const chatControl = detectChatControlIntent(userMessage, chatId);
  if (chatControl) {
    let reply = '';
    if (chatControl.action === 'block') {
      addBlockedChat(chatControl.jid);
      const isHere = chatControl.jid === chatId;
      const displayNum = chatControl.jid.split('@')[0];
      const label = isHere ? 'this chat' : `+${displayNum}`;
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

  // Command info lookup: "what does autobio do?" / "tell me about antidelete" / "explain sticker"
  const lookupRe = /\b(?:what(?:'?s|\s+is|\s+does?)?\s+(?:the\s+)?|tell\s+me\s+about\s+(?:the\s+)?|explain\s+(?:the\s+)?|lemme\s+(?:see|know)\s+(?:what\s+)?(?:the\s+)?|show\s+me\s+(?:what\s+)?(?:the\s+)?|how\s+(?:does|do)\s+(?:the\s+)?|describe\s+(?:the\s+)?)(\w[\w-]*)\s*(?:do(?:es)?|command|work|feature)?\s*[?!.]*$/i;
  const lookupM = userMessage.match(lookupRe);
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

  await sock.presenceSubscribe(chatId).catch(() => {});
  await sock.sendPresenceUpdate('composing', chatId).catch(() => {});

  const conversation = loadConversation(senderId);

  const aiResponse = await getWolfResponse(userMessage, conversation);

  await sock.sendPresenceUpdate('paused', chatId).catch(() => {});

  if (!aiResponse) {
    const wn = getWolfName();
    await sock.sendMessage(chatId, {
      text: `🐺 ${wn} is having a brain moment. Try again shortly!`
    }, { quoted: msg });
    return true;
  }

  let parsedCommand = parseCommandFromResponse(aiResponse);
  const rawDisplay = stripCommandTag(aiResponse);
  const displayText = trimWolfResponse(rawDisplay);

  // Fallback: if AI didn't include [EXECUTE:] tag, try to infer the action from what it said
  if (!parsedCommand && rawDisplay) {
    const inferred = extractActionFromAIText(rawDisplay);
    if (inferred && commands.has(inferred.command)) parsedCommand = inferred;
  }

  conversation.messages.push({ role: 'user', content: userMessage });
  conversation.messages.push({ role: 'assistant', content: rawDisplay || userMessage });
  saveConversation(senderId, conversation);

  if (parsedCommand && commands.has(parsedCommand.command)) {
    if (displayText) {
      await sock.sendMessage(chatId, { text: `🐺 ${displayText}` }, { quoted: msg });
    }
    await executeCommand(parsedCommand.command, parsedCommand.args);
  } else if (displayText) {
    await sock.sendMessage(chatId, { text: `🐺 ${displayText}` }, { quoted: msg });
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

// ─── .wolf command handler (consolidated here so commands/ai/wolf.js is a thin stub) ───
export async function wolfCommandHandler(sock, m, args, PREFIX) {
  const jid = m.key.remoteJid;
  const botName = getBotName();
  const sub = (args[0] || '').toLowerCase();

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
    const raw = args.slice(1).join(' ').trim();
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
    const raw = args.slice(1).join(' ').trim();
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
    const raw = args.slice(1).join(' ').trim();
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
    const raw = args.slice(1).join(' ').trim();
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
    const groups = getAllowedGroups();
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
    const convDir = WOLF_CONVERSATIONS_DIR;
    try {
      if (fs.existsSync(convDir)) {
        const files = fs.readdirSync(convDir);
        for (const file of files) fs.unlinkSync(path.join(convDir, file));
        return sock.sendMessage(jid, {
          text: `🐺 *Conversations Cleared*\n\nCleared ${files.length} conversation(s). Memory reset.`
        }, { quoted: m });
      }
      return sock.sendMessage(jid, { text: `🐺 No conversations to clear.` }, { quoted: m });
    } catch (err) {
      return sock.sendMessage(jid, { text: `❌ Error clearing: ${err.message}` }, { quoted: m });
    }
  }

  // Default: show status card
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

// ─── Single default export so index.js only needs one import line ───
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
