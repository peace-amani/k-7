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
    icon: '🤖', title: 'AI & Models',
    body: [
      '🤖 *AI & MODELS*',
      '• `.chatgpt`   ChatGPT (OpenAI)',
      '• `.gemini`    Google Gemini',
      '• `.grok`      xAI Grok',
      '• `.deepseek`  DeepSeek AI',
      '• `.claude`    Anthropic Claude',
      '• `.mistral`   Mistral AI',
      '• `.vision`    Image understanding',
      '• `.summarize` Summarise text',
      '• `.aimenu`    ➜ Full AI menu',
    ]
  },
  {
    icon: '🎬', title: 'Image & Video Gen',
    body: [
      '🎬 *IMAGE & VIDEO GEN*',
      '• `.imagine`   Generate image (AI)',
      '• `.flux`      Flux image model',
      '• `.anime`     Anime-style image',
      '• `.art`       Artistic generation',
      '• `.real`      Realistic photo',
      '• `.remini`    Enhance photo quality',
      '• `.videogen`  AI video generation',
      '• `.removebg`  Remove background',
      '• `.imagemenu` ➜ Full image menu',
    ]
  },
  {
    icon: '🎌', title: 'Anime & Fun',
    body: [
      '🎌 *ANIME & FUN*',
      '• `.hug`   `.pat`   `.kiss`',
      '• `.waifu` `.neko`  `.dance`',
      '• `.cry`   `.slap`  `.cuddle`',
      '• `.hack`  Fake hacking screen',
      '• `.quote` Random quote',
      '• `.joke`  Random joke',
      '• `.funmenu`   ➜ Full fun menu',
      '• `.animemenu` ➜ Full anime menu',
    ]
  },
  {
    icon: '⚙️', title: 'Automation',
    body: [
      '⚙️ *AUTOMATION*',
      '• `.autoread`          Auto-read messages',
      '• `.autoreact`         Auto-react to msgs',
      '• `.autotyping`        Auto typing bubble',
      '• `.autoviewstatus`    Auto-view statuses',
      '• `.autodownloadstatus` Save statuses',
      '• `.autoreactstatus`   React to statuses',
      '• `.autorecording`     Auto recording',
      '• `.automenu`          ➜ Full auto menu',
    ]
  },
  {
    icon: '🎨', title: 'Design & Logos',
    body: [
      '🎨 *DESIGN & LOGO EFFECTS*',
      '• `.logo`        Basic logo',
      '• `.firelogo`    Fire logo effect',
      '• `.neonlogo`    Neon glow logo',
      '• `.goldlogo`    Gold logo',
      '• `.diamondlogo` Diamond logo',
      '• `.dragonlogo`  Dragon logo',
      '• `.rainbowlogo` Rainbow logo',
      '• `.brandlogo`   Brand-style logo',
      '• `.logomenu`    ➜ Full logo menu',
    ]
  },
  {
    icon: '⬇️', title: 'Downloaders',
    body: [
      '⬇️ *DOWNLOADERS*',
      '• `.ytmp3`      YouTube → MP3',
      '• `.ytmp4`      YouTube → MP4',
      '• `.ytplay`     Search & play YT',
      '• `.tiktok`     TikTok video',
      '• `.instagram`  Instagram video/reel',
      '• `.facebook`   Facebook video',
      '• `.spotify`    Spotify track info',
      '• `.apk`        App download',
      '• `.downloadmenu` ➜ Full downloader menu',
    ]
  },
  {
    icon: '🔐', title: 'Security & Hacking',
    body: [
      '🔐 *SECURITY & HACKING*',
      '• `.nmap`         Port scan',
      '• `.whois`        Domain WHOIS lookup',
      '• `.dnslookup`    DNS records',
      '• `.sslcheck`     SSL cert check',
      '• `.sqlicheck`    SQLi vulnerability',
      '• `.xsscheck`     XSS check',
      '• `.malwarecheck` URL malware scan',
      '• `.leakcheck`    Data breach check',
      '• `.securitymenu` ➜ Full security menu',
    ]
  },
  {
    icon: '📸', title: 'Photo Effects',
    body: [
      '📸 *PHOTO EFFECTS*',
      '• `.neon`       Neon text photo',
      '• `.text3d`     3D text effect',
      '• `.graffiti`   Graffiti-style text',
      '• `.hologram`   Hologram style',
      '• `.metal`      Metal engraving',
      '• `.matrix`     Matrix-style text',
      '• `.gradient`   Gradient text',
      '• `.photofunia` 100+ PhotoFunia FX',
      '• `.ephotomenu` ➜ Full ephoto menu',
    ]
  },
  {
    icon: '👥', title: 'Group Management',
    body: [
      '👥 *GROUP MANAGEMENT*',
      '• `.antilink`    Anti-link protection',
      '• `.welcome`     Welcome msg toggle',
      '• `.kick`        Kick a member',
      '• `.ban`/`.unban` Ban/unban member',
      '• `.tagall`      Tag all members',
      '• `.mute`/`.unmute` Mute group',
      '• `.joinapproval` Link approval mode',
      '• `.disp`        Disappearing msgs',
      '• `.groupmenu`   ➜ Full group menu',
    ]
  },
  {
    icon: '🎵', title: 'Music & Media',
    body: [
      '🎵 *MUSIC & MEDIA CONVERSION*',
      '• `.play`      Play/search music',
      '• `.song`      Download song',
      '• `.lyrics`    Get song lyrics',
      '• `.shazam`    Identify a song',
      '• `.tosticker` Image → sticker',
      '• `.toaudio`   Video → audio',
      '• `.tts`       Text-to-speech',
      '• `.trim`      Trim audio/video',
      '• `.musicmenu` ➜ Full music menu',
    ]
  },
  {
    icon: '🗞️', title: 'News & Sports',
    body: [
      '🗞️ *NEWS & SPORTS*',
      '• `.bbcnews`    BBC News',
      '• `.technews`   Tech news',
      '• `.football`   Football scores',
      '• `.cricket`    Cricket scores',
      '• `.basketball` Basketball',
      '• `.f1`         Formula 1',
      '• `.tennis`     Tennis updates',
      '• `.sportsmenu` ➜ Full sports menu',
    ]
  },
  {
    icon: '🕵️', title: 'Stalker & Tools',
    body: [
      '🕵️ *STALKER & TOOLS*',
      '• `.igstalk`      Instagram lookup',
      '• `.gitstalk`     GitHub lookup',
      '• `.tiktokstalk`  TikTok lookup',
      '• `.twitterstalk` Twitter lookup',
      '• `.movies`       Movie search',
      '• `.translate`    Translate text',
      '• `.wiki`         Wikipedia search',
      '• `.weather`      Weather info',
      '• `.stalkermenu`  ➜ Full stalker menu',
    ]
  },
  {
    icon: '👑', title: 'Owner & Admin',
    body: [
      '👑 *OWNER & ADMIN*',
      '• `.restart`    Restart the bot',
      '• `.reload`     Reload commands',
      '• `.setbotname` Change bot name',
      '• `.setprefix`  Change prefix',
      '• `.addsudo`    Add sudo user',
      '• `.block`      Block a user',
      '• `.anticall`   Block incoming calls',
      '• `.mode`       Public/private mode',
      '• `.ownermenu`  ➜ Full owner menu',
    ]
  }
];

const TOTAL = SLIDES.length;

// ─── Build text for one slide ─────────────────────────────────────────────────
function buildSlideText(index, botName) {
  const slide = SLIDES[index];
  return [
    `╭─⌈ ${slide.icon} *${slide.title.toUpperCase()}* ⌋`,
    ...slide.body.map(l => `│ ${l}`),
    `├── Slide *${index + 1}/${TOTAL}*`,
    `╰⊷ *${botName}*`
  ].join('\n');
}

// ─── Build navigation buttons ─────────────────────────────────────────────────
function buildButtons(index, prefix) {
  const buttons = [];

  if (index > 0) {
    buttons.push({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: `◀ ${SLIDES[index - 1].icon} ${SLIDES[index - 1].title}`,
        id: `${prefix}menuslide ${index}`
      })
    });
  }

  if (index < TOTAL - 1) {
    buttons.push({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: `${SLIDES[index + 1].icon} ${SLIDES[index + 1].title} ▶`,
        id: `${prefix}menuslide ${index + 2}`
      })
    });
  }

  buttons.push({
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({
      display_text: index === 0 ? '📋 All Categories' : '🏠 First Slide',
      id: index === 0 ? `${prefix}menuslide ${TOTAL}` : `${prefix}menuslide 1`
    })
  });

  return buttons;
}

// ─── Command export ───────────────────────────────────────────────────────────
export default {
  name: 'menuslide',
  alias: ['slidemenu', 'cmds'],
  description: `Browse all ${TOTAL} command categories as interactive slides. Usage: .menuslide [1-${TOTAL}]`,

  async execute(sock, msg, args) {
    const chatId  = msg.key.remoteJid;
    const prefix  = global.prefix || process.env.PREFIX || '.';
    const botName = getBotName() || BRAND();

    let slideIndex = 0;
    if (args[0]) {
      const n = parseInt(args[0], 10);
      if (!isNaN(n) && n >= 1 && n <= TOTAL) slideIndex = n - 1;
    }

    const text    = buildSlideText(slideIndex, botName);
    const buttons = buildButtons(slideIndex, prefix);
    const footer  = `🐺 ${botName} • ${TOTAL} categories`;

    if (giftedBtns) {
      try {
        return await giftedBtns.sendInteractiveMessage(sock, chatId, {
          text,
          footer,
          interactiveButtons: buttons
        });
      } catch {}
    }

    // Fallback: plain text with navigation hint
    const navHint = [
      slideIndex > 0         ? `◀ *${prefix}menuslide ${slideIndex}*` : null,
      slideIndex < TOTAL - 1 ? `▶ *${prefix}menuslide ${slideIndex + 2}*` : null,
    ].filter(Boolean).join('   ');

    return sock.sendMessage(chatId, {
      text: text + (navHint ? `\n\n${navHint}` : '')
    }, { quoted: msg });
  }
};
