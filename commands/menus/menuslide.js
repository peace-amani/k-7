import { createRequire } from 'module';
import { getOwnerName } from '../../lib/menuHelper.js';
import { getBotName } from '../../lib/botname.js';

const _require = createRequire(import.meta.url);
let giftedBtns;
try { giftedBtns = _require('gifted-btns'); } catch {}

const BRAND = () => getOwnerName().toUpperCase();

// ─── Slide definitions ────────────────────────────────────────────────────────
const SLIDES = [
  {
    icon: '🤖',
    title: 'AI & Models',
    body: [
      '╭─⌈ 🤖 *AI & MODELS* ⌋',
      '├─⊷ `.chatgpt`   ChatGPT (OpenAI)',
      '├─⊷ `.gemini`    Google Gemini',
      '├─⊷ `.grok`      xAI Grok',
      '├─⊷ `.deepseek`  DeepSeek AI',
      '├─⊷ `.claude`    Anthropic Claude',
      '├─⊷ `.mistral`   Mistral AI',
      '├─⊷ `.llama`     Meta LLaMA',
      '├─⊷ `.perplexity` Perplexity AI',
      '├─⊷ `.groq`      Groq (ultra-fast)',
      '├─⊷ `.vision`    Image understanding',
      '├─⊷ `.totext`    Voice → text',
      '├─⊷ `.summarize` Summarise text',
      '├─⊷ `.aimenu`    Full AI menu',
    ]
  },
  {
    icon: '🎬',
    title: 'AI Video & Image Gen',
    body: [
      '╭─⌈ 🎬 *AI VIDEO & IMAGE GEN* ⌋',
      '├─⊷ `.imagine`   Generate image (AI)',
      '├─⊷ `.flux`      Flux image model',
      '├─⊷ `.anime`     Anime-style image',
      '├─⊷ `.art`       Artistic generation',
      '├─⊷ `.real`      Realistic photo',
      '├─⊷ `.remini`    Enhance photo quality',
      '├─⊷ `.videogen`  AI video generation',
      '├─⊷ `.tovideo`   Convert to video',
      '├─⊷ `.lovevideo` Love-themed video',
      '├─⊷ `.removebg`  Remove background',
      '├─⊷ `.imagemenu` Full image gen menu',
    ]
  },
  {
    icon: '🎌',
    title: 'Anime & Fun',
    body: [
      '╭─⌈ 🎌 *ANIME & FUN* ⌋',
      '├─⊷ `.hug`       Send a hug',
      '├─⊷ `.pat`       Pat someone',
      '├─⊷ `.kiss`      Kiss someone',
      '├─⊷ `.waifu`     Random waifu',
      '├─⊷ `.neko`      Neko image',
      '├─⊷ `.dance`     Dance gif',
      '├─⊷ `.cry`       Cry gif',
      '├─⊷ `.slap`      Slap someone',
      '├─⊷ `.hack`      Fake hacking screen',
      '├─⊷ `.quote`     Random quote',
      '├─⊷ `.animemenu` Full anime menu',
    ]
  },
  {
    icon: '⚙️',
    title: 'Automation',
    body: [
      '╭─⌈ ⚙️ *AUTOMATION* ⌋',
      '├─⊷ `.autoread`       Auto-read messages',
      '├─⊷ `.autoreact`      Auto-react to msgs',
      '├─⊷ `.autotyping`     Auto typing indicator',
      '├─⊷ `.autoviewstatus` Auto-view statuses',
      '├─⊷ `.autodownloadstatus` Save statuses',
      '├─⊷ `.autoreactstatus` React to statuses',
      '├─⊷ `.autorecording`  Auto recording bubble',
      '├─⊷ `.reactowner`     React to owner msgs',
      '├─⊷ `.reactdev`       React to dev msgs',
      '├─⊷ `.automenu`       Full automation menu',
    ]
  },
  {
    icon: '🎨',
    title: 'Design & Logo Effects',
    body: [
      '╭─⌈ 🎨 *DESIGN & LOGO EFFECTS* ⌋',
      '├─⊷ `.logo`        Basic logo',
      '├─⊷ `.firelogo`    Fire logo effect',
      '├─⊷ `.neonlogo`    Neon glow logo',
      '├─⊷ `.goldlogo`    Gold logo',
      '├─⊷ `.diamondlogo` Diamond logo',
      '├─⊷ `.dragonlogo`  Dragon logo',
      '├─⊷ `.rainbowlogo` Rainbow logo',
      '├─⊷ `.matrixlogo`  Matrix logo',
      '├─⊷ `.phoenixlogo` Phoenix logo',
      '├─⊷ `.brandlogo`   Brand-style logo',
      '├─⊷ `.logomenu`    Full logo menu',
    ]
  },
  {
    icon: '⬇️',
    title: 'Downloaders',
    body: [
      '╭─⌈ ⬇️ *DOWNLOADERS* ⌋',
      '├─⊷ `.ytmp3`      YouTube → MP3',
      '├─⊷ `.ytmp4`      YouTube → MP4',
      '├─⊷ `.ytplay`     Search & play YT',
      '├─⊷ `.tiktok`     TikTok video',
      '├─⊷ `.instagram`  Instagram video/reel',
      '├─⊷ `.facebook`   Facebook video',
      '├─⊷ `.snapchat`   Snapchat video',
      '├─⊷ `.spotify`    Spotify track info',
      '├─⊷ `.mediafire`  MediaFire download',
      '├─⊷ `.apk`        App download',
      '├─⊷ `.downloadmenu` Full downloader menu',
    ]
  },
  {
    icon: '🔐',
    title: 'Security & Hacking',
    body: [
      '╭─⌈ 🔐 *SECURITY & HACKING* ⌋',
      '├─⊷ `.nmap`       Port scan',
      '├─⊷ `.whois`      Domain WHOIS lookup',
      '├─⊷ `.dnslookup`  DNS records',
      '├─⊷ `.portscan`   Open ports check',
      '├─⊷ `.sslcheck`   SSL certificate check',
      '├─⊷ `.sqlicheck`  SQLi vulnerability test',
      '├─⊷ `.xsscheck`   XSS check',
      '├─⊷ `.malwarecheck` URL malware scan',
      '├─⊷ `.phishcheck` Phishing detection',
      '├─⊷ `.leakcheck`  Data breach check',
      '├─⊷ `.securitymenu` Full security menu',
    ]
  },
  {
    icon: '📸',
    title: 'Photo Effects',
    body: [
      '╭─⌈ 📸 *PHOTO EFFECTS* ⌋',
      '├─⊷ `.neon`         Neon text photo',
      '├─⊷ `.3dtext`       3D text effect',
      '├─⊷ `.graffiti`     Graffiti-style text',
      '├─⊷ `.fire`         Fire text',
      '├─⊷ `.galaxy`       Galaxy effect',
      '├─⊷ `.hologram`     Hologram style',
      '├─⊷ `.metal`        Metal engraving',
      '├─⊷ `.matrix`       Matrix-style text',
      '├─⊷ `.gradient`     Gradient text',
      '├─⊷ `.photofunia`   100+ PhotoFunia effects',
      '├─⊷ `.ephotomenu`   Full ephoto menu',
    ]
  },
  {
    icon: '👥',
    title: 'Group Management',
    body: [
      '╭─⌈ 👥 *GROUP MANAGEMENT* ⌋',
      '├─⊷ `.antilink`   Anti-link protection',
      '├─⊷ `.welcome`    Welcome message toggle',
      '├─⊷ `.kick`       Kick a member',
      '├─⊷ `.ban` / `.unban` Ban/unban member',
      '├─⊷ `.promote` / `.demote` Admin controls',
      '├─⊷ `.tagall`     Tag all members',
      '├─⊷ `.mute` / `.unmute` Mute group',
      '├─⊷ `.joinapproval` Link approval mode',
      '├─⊷ `.onlyadmins` Admin-only messages',
      '├─⊷ `.disp`       Disappearing messages',
      '├─⊷ `.groupmenu`  Full group menu',
    ]
  },
  {
    icon: '🎵',
    title: 'Music & Media',
    body: [
      '╭─⌈ 🎵 *MUSIC & MEDIA CONVERSION* ⌋',
      '├─⊷ `.play`       Play/search music',
      '├─⊷ `.song`       Download song',
      '├─⊷ `.lyrics`     Get song lyrics',
      '├─⊷ `.shazam`     Identify a song',
      '├─⊷ `.tosticker`  Image → sticker',
      '├─⊷ `.toaudio`    Video → audio',
      '├─⊷ `.togif`      Video → GIF',
      '├─⊷ `.tovoice`    Text → voice note',
      '├─⊷ `.tts`        Text-to-speech',
      '├─⊷ `.trim`       Trim audio/video',
      '├─⊷ `.musicmenu`  Full music menu',
    ]
  },
  {
    icon: '🗞️',
    title: 'News & Sports',
    body: [
      '╭─⌈ 🗞️ *NEWS & SPORTS* ⌋',
      '├─⊷ `.bbcnews`    BBC News headlines',
      '├─⊷ `.citizennews` Citizen TV news',
      '├─⊷ `.kbcnews`    KBC news',
      '├─⊷ `.technews`   Tech news',
      '├─⊷ `.football`   Football scores',
      '├─⊷ `.cricket`    Cricket scores',
      '├─⊷ `.basketball` Basketball scores',
      '├─⊷ `.f1`         Formula 1 news',
      '├─⊷ `.tennis`     Tennis updates',
      '├─⊷ `.sportsnews` Sports news',
      '├─⊷ `.sportsmenu` Full sports menu',
    ]
  },
  {
    icon: '🕵️',
    title: 'Stalker & Tools',
    body: [
      '╭─⌈ 🕵️ *STALKER & TOOLS* ⌋',
      '├─⊷ `.igstalk`    Stalk Instagram user',
      '├─⊷ `.gitstalk`   Stalk GitHub user',
      '├─⊷ `.tiktokstalk` Stalk TikTok user',
      '├─⊷ `.twitterstalk` Stalk Twitter user',
      '├─⊷ `.ipstalk`    IP address info',
      '├─⊷ `.npmstalk`   NPM package info',
      '├─⊷ `.movies`     Movie search',
      '├─⊷ `.trailer`    Movie trailer',
      '├─⊷ `.translate`  Translate text',
      '├─⊷ `.wiki`       Wikipedia search',
      '├─⊷ `.stalkermenu` Full stalker menu',
    ]
  },
  {
    icon: '👑',
    title: 'Owner & Admin',
    body: [
      '╭─⌈ 👑 *OWNER & ADMIN* ⌋',
      '├─⊷ `.owner`      Show owner info',
      '├─⊷ `.restart`    Restart the bot',
      '├─⊷ `.reload`     Reload commands',
      '├─⊷ `.setbotname` Change bot name',
      '├─⊷ `.setprefix`  Change command prefix',
      '├─⊷ `.addsudo`    Add sudo user',
      '├─⊷ `.block`      Block a user',
      '├─⊷ `.anticall`   Block incoming calls',
      '├─⊷ `.antidelete` Anti-delete messages',
      '├─⊷ `.mode`       Public/private mode',
      '├─⊷ `.ownermenu`  Full owner menu',
    ]
  }
];

const TOTAL = SLIDES.length;

// ─── Build the text for one slide ────────────────────────────────────────────
function buildSlideText(index, botName) {
  const slide = SLIDES[index];
  const lines = [
    ...slide.body,
    `├─────────────────────`,
    `├─⊷ Slide ${index + 1} of ${TOTAL}`,
    `╰⊷ *${botName} Menu*`
  ];
  return lines.join('\n');
}

// ─── Build interactive button array ──────────────────────────────────────────
function buildButtons(index, prefix) {
  const buttons = [];

  if (index > 0) {
    buttons.push({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: `◀ ${SLIDES[index - 1].icon} ${SLIDES[index - 1].title}`,
        id: `${prefix}menuslide ${index}`        // 1-based: previous = current index (0-based)
      })
    });
  }

  if (index < TOTAL - 1) {
    buttons.push({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: `${SLIDES[index + 1].icon} ${SLIDES[index + 1].title} ▶`,
        id: `${prefix}menuslide ${index + 2}`    // 1-based: next = index + 2
      })
    });
  }

  // Always add a home button on any slide that isn't the first
  if (index > 0) {
    buttons.push({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: `🏠 Start Over`,
        id: `${prefix}menuslide`
      })
    });
  }

  return buttons;
}

// ─── Command export ───────────────────────────────────────────────────────────
export default {
  name: 'menuslide',
  alias: ['slidemenu', 'cmds'],
  description: 'Browse command categories as interactive slides. Usage: .menuslide [1-' + TOTAL + ']',

  async execute(sock, msg, args) {
    const chatId  = msg.key.remoteJid;
    const prefix  = global.prefix || process.env.PREFIX || '.';
    const botName = getBotName() || BRAND();

    // Determine which slide to show (args[0] is 1-based)
    let slideIndex = 0;
    if (args[0]) {
      const n = parseInt(args[0], 10);
      if (!isNaN(n) && n >= 1 && n <= TOTAL) {
        slideIndex = n - 1;
      }
    }

    const text    = buildSlideText(slideIndex, botName);
    const buttons = buildButtons(slideIndex, prefix);
    const footer  = `🐺 ${botName} • Use buttons to navigate`;

    // Send as interactive message if gifted-btns is available
    if (giftedBtns) {
      try {
        return await giftedBtns.sendInteractiveMessage(sock, chatId, {
          text,
          footer,
          interactiveButtons: buttons
        });
      } catch {
        // fall through to plain text
      }
    }

    // Fallback: plain text with navigation hint
    const navHint = [
      slideIndex > 0      ? `◀ ${prefix}menuslide ${slideIndex}` : null,
      slideIndex < TOTAL - 1 ? `▶ ${prefix}menuslide ${slideIndex + 2}` : null,
    ].filter(Boolean).join('   ');

    return sock.sendMessage(chatId, {
      text: text + (navHint ? `\n\n${navHint}` : '')
    }, { quoted: msg });
  }
};
