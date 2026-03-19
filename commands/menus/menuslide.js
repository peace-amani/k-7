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
      '• .chatgpt   • .gemini',
      '• .grok      • .deepseek',
      '• .claude    • .mistral',
      '• .vision    • .summarize',
      '• .aimenu',
    ]
  },
  {
    icon: '🎬', title: 'Image & Video Gen',
    body: [
      '🎬 *IMAGE & VIDEO GEN*',
      '• .imagine   • .flux',
      '• .anime     • .art',
      '• .real      • .remini',
      '• .videogen  • .removebg',
      '• .imagemenu',
    ]
  },
  {
    icon: '🎌', title: 'Anime & Fun',
    body: [
      '🎌 *ANIME & FUN*',
      '• .hug    • .pat    • .kiss',
      '• .waifu  • .neko   • .dance',
      '• .cry    • .slap   • .cuddle',
      '• .hack   • .quote  • .joke',
      '• .funmenu  • .animemenu',
    ]
  },
  {
    icon: '⚙️', title: 'Automation',
    body: [
      '⚙️ *AUTOMATION*',
      '• .autoread',
      '• .autoreact',
      '• .autotyping',
      '• .autoviewstatus',
      '• .autodownloadstatus',
      '• .autoreactstatus',
      '• .autorecording',
      '• .automenu',
    ]
  },
  {
    icon: '🎨', title: 'Design & Logos',
    body: [
      '🎨 *DESIGN & LOGO EFFECTS*',
      '• .logo      • .firelogo',
      '• .neonlogo  • .goldlogo',
      '• .diamondlogo',
      '• .dragonlogo',
      '• .rainbowlogo',
      '• .brandlogo • .logomenu',
    ]
  },
  {
    icon: '⬇️', title: 'Downloaders',
    body: [
      '⬇️ *DOWNLOADERS*',
      '• .ytmp3     • .ytmp4',
      '• .ytplay    • .tiktok',
      '• .instagram • .facebook',
      '• .spotify   • .apk',
      '• .downloadmenu',
    ]
  },
  {
    icon: '🔐', title: 'Security & Hacking',
    body: [
      '🔐 *SECURITY & HACKING*',
      '• .nmap      • .whois',
      '• .dnslookup • .sslcheck',
      '• .portscan  • .sqlicheck',
      '• .xsscheck  • .leakcheck',
      '• .securitymenu',
    ]
  },
  {
    icon: '📸', title: 'Photo Effects',
    body: [
      '📸 *PHOTO EFFECTS*',
      '• .neon      • .text3d',
      '• .graffiti  • .hologram',
      '• .metal     • .matrix',
      '• .gradient  • .photofunia',
      '• .ephotomenu',
    ]
  },
  {
    icon: '👥', title: 'Group Management',
    body: [
      '👥 *GROUP MANAGEMENT*',
      '• .antilink  • .welcome',
      '• .kick      • .ban',
      '• .tagall    • .mute',
      '• .promote   • .demote',
      '• .joinapproval • .disp',
      '• .groupmenu',
    ]
  },
  {
    icon: '🎵', title: 'Music & Media',
    body: [
      '🎵 *MUSIC & MEDIA*',
      '• .play      • .song',
      '• .lyrics    • .shazam',
      '• .tosticker • .toaudio',
      '• .tts       • .trim',
      '• .musicmenu',
    ]
  },
  {
    icon: '🗞️', title: 'News & Sports',
    body: [
      '🗞️ *NEWS & SPORTS*',
      '• .bbcnews   • .technews',
      '• .football  • .cricket',
      '• .basketball • .f1',
      '• .tennis    • .sportsnews',
      '• .sportsmenu',
    ]
  },
  {
    icon: '🕵️', title: 'Stalker & Tools',
    body: [
      '🕵️ *STALKER & TOOLS*',
      '• .igstalk   • .gitstalk',
      '• .tiktokstalk',
      '• .twitterstalk',
      '• .movies    • .translate',
      '• .wiki      • .weather',
      '• .stalkermenu',
    ]
  },
  {
    icon: '👑', title: 'Owner & Admin',
    body: [
      '👑 *OWNER & ADMIN*',
      '• .restart   • .reload',
      '• .setbotname • .setprefix',
      '• .addsudo   • .block',
      '• .anticall  • .mode',
      '• .ownermenu',
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
