import { generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { getOwnerName } from '../../lib/menuHelper.js';
import { getBotName } from '../../lib/botname.js';

const BRAND = () => getOwnerName().toUpperCase();

// ─── Slide / card definitions ─────────────────────────────────────────────────
// Each card is one swipeable slide in the horizontal carousel.
// body: short command list shown on the card
// button: the quick-reply button label + command id (opens that category menu)
const CARDS = [
  {
    title: '🤖 AI & Models',
    subtitle: 'ChatGPT, Gemini, Grok & more',
    body: '📌 Key commands:\n• .chatgpt  • .gemini\n• .grok  • .deepseek\n• .claude  • .mistral\n• .vision  • .summarize',
    btn: { label: '📋 Open AI Menu', id: '.aimenu' }
  },
  {
    title: '🎬 Image & Video Gen',
    subtitle: 'AI-generated media',
    body: '📌 Key commands:\n• .imagine  • .flux\n• .anime  • .art\n• .real  • .remini\n• .videogen  • .removebg',
    btn: { label: '📋 Open Image Menu', id: '.imagemenu' }
  },
  {
    title: '🎌 Anime & Fun',
    subtitle: 'Anime, games & entertainment',
    body: '📌 Key commands:\n• .hug  • .pat  • .kiss\n• .waifu  • .neko\n• .dance  • .hack\n• .quote  • .joke',
    btn: { label: '📋 Open Fun Menu', id: '.funmenu' }
  },
  {
    title: '⚙️ Automation',
    subtitle: 'Auto-actions & smart features',
    body: '📌 Key commands:\n• .autoread  • .autoreact\n• .autotyping\n• .autoviewstatus\n• .autodownloadstatus\n• .autorecording',
    btn: { label: '📋 Open Auto Menu', id: '.automenu' }
  },
  {
    title: '🎨 Design & Logos',
    subtitle: 'Logo & text effects',
    body: '📌 Key commands:\n• .logo  • .firelogo\n• .neonlogo  • .goldlogo\n• .diamondlogo\n• .rainbowlogo\n• .brandlogo',
    btn: { label: '📋 Open Logo Menu', id: '.logomenu' }
  },
  {
    title: '⬇️ Downloaders',
    subtitle: 'YouTube, TikTok, Instagram & more',
    body: '📌 Key commands:\n• .ytmp3  • .ytmp4\n• .tiktok  • .instagram\n• .facebook  • .spotify\n• .mediafire  • .apk',
    btn: { label: '📋 Open Download Menu', id: '.downloadmenu' }
  },
  {
    title: '🔐 Security',
    subtitle: 'Hacking & security tools',
    body: '📌 Key commands:\n• .nmap  • .whois\n• .sslcheck  • .dnslookup\n• .portscan  • .sqlicheck\n• .malwarecheck  • .phishcheck',
    btn: { label: '📋 Open Security Menu', id: '.securitymenu' }
  },
  {
    title: '📸 Photo Effects',
    subtitle: 'Ephoto & PhotoFunia effects',
    body: '📌 Key commands:\n• .neon  • .graffiti\n• .hologram  • .matrix\n• .gradient  • .metal\n• .text3d  • .photofunia',
    btn: { label: '📋 Open Ephoto Menu', id: '.ephotomenu' }
  },
  {
    title: '👥 Group Tools',
    subtitle: 'Group admin & management',
    body: '📌 Key commands:\n• .antilink  • .welcome\n• .kick  • .ban  • .tagall\n• .mute  • .joinapproval\n• .promote  • .demote',
    btn: { label: '📋 Open Group Menu', id: '.groupmenu' }
  },
  {
    title: '🎵 Music & Media',
    subtitle: 'Play, convert & download music',
    body: '📌 Key commands:\n• .play  • .song\n• .lyrics  • .shazam\n• .tosticker  • .toaudio\n• .tts  • .togif',
    btn: { label: '📋 Open Music Menu', id: '.musicmenu' }
  },
  {
    title: '🗞️ News & Sports',
    subtitle: 'Latest news & match scores',
    body: '📌 Key commands:\n• .bbcnews  • .technews\n• .football  • .cricket\n• .basketball  • .f1\n• .tennis  • .sportsnews',
    btn: { label: '📋 Open Sports Menu', id: '.sportsmenu' }
  },
  {
    title: '🕵️ Stalker & Tools',
    subtitle: 'Social media lookup & tools',
    body: '📌 Key commands:\n• .igstalk  • .gitstalk\n• .tiktokstalk  • .twitterstalk\n• .movies  • .translate\n• .wiki  • .weather',
    btn: { label: '📋 Open Stalker Menu', id: '.stalkermenu' }
  },
  {
    title: '👑 Owner & Admin',
    subtitle: 'Bot owner & settings',
    body: '📌 Key commands:\n• .restart  • .reload\n• .setbotname  • .setprefix\n• .addsudo  • .block\n• .anticall  • .mode',
    btn: { label: '📋 Open Owner Menu', id: '.ownermenu' }
  }
];

// ─── Build interactive carousel card (each card = one InteractiveMessage) ─────
function buildCard(card) {
  return {
    header: {
      title: card.title,
      subtitle: card.subtitle,
      hasMediaAttachment: false
    },
    body: { text: card.body },
    footer: { text: `🐺 ${getBotName() || BRAND()}` },
    nativeFlowMessage: {
      buttons: [
        {
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({
            display_text: card.btn.label,
            id: card.btn.id
          })
        }
      ]
    }
  };
}

// ─── Command export ────────────────────────────────────────────────────────────
export default {
  name: 'menuslide',
  alias: ['slidemenu', 'cmds'],
  description: 'Browse all bot command categories as swipeable carousel slides.',

  async execute(sock, msg) {
    const chatId  = msg.key.remoteJid;
    const botName = getBotName() || BRAND();

    try {
      const carouselMsg = generateWAMessageFromContent(chatId, {
        viewOnceMessage: {
          message: {
            interactiveMessage: {
              body: { text: `🐺 *${botName} — Command Categories*\nSwipe left or right to browse all categories 👇` },
              footer: { text: `${CARDS.length} categories • Tap a button to open full menu` },
              carouselMessage: {
                carouselCardType: 1,   // HSCROLL_CARDS — horizontal scroll
                messageVersion: 1,
                cards: CARDS.map(buildCard)
              }
            }
          }
        }
      }, {
        quoted: msg,
        userJid: sock.user?.id || chatId
      });

      await sock.relayMessage(chatId, carouselMsg.message, {
        messageId: carouselMsg.key.id
      });

    } catch (err) {
      console.error('[MENUSLIDE] Carousel failed, sending plain list:', err.message);

      // Fallback: plain text list of all categories + key commands
      const prefix = global.prefix || process.env.PREFIX || '.';
      const text = [
        `╭─⌈ 🐺 *${botName} MENU* ⌋`,
        ...CARDS.map((c, i) => `├─⊷ ${c.title}\n│    ${c.body.split('\n').slice(1).join(' ')}`),
        `╰⊷ Use *${prefix}aimenu*, *${prefix}groupmenu* etc. for full category menus`
      ].join('\n');

      await sock.sendMessage(chatId, { text }, { quoted: msg });
    }
  }
};
