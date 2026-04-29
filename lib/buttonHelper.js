import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBotName, buildMenuHeader, createFakeContact, createFadedEffect, createReadMoreEffect, getMenuImageBuffer, sendLoadingMessage } from './menuHelper.js';
import { isButtonModeEnabled } from './buttonMode.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);

let sendInteractiveMessage, sendButtons;
try {
  const giftedBtns = require('gifted-btns');
  sendInteractiveMessage = giftedBtns.sendInteractiveMessage;
  sendButtons = giftedBtns.sendButtons;
} catch (e) {
  console.log('[ButtonHelper] gifted-btns not available:', e.message);
}

let generateWAMessageFromContent, prepareWAMessageMedia, proto;
import('@whiskeysockets/baileys').then(m => {
  generateWAMessageFromContent = m.generateWAMessageFromContent;
  prepareWAMessageMedia = m.prepareWAMessageMedia;
  proto = m.proto;
}).catch(e => {
  console.log('[ButtonHelper] baileys not available:', e.message);
});

export function isButtonMode() {
  return isButtonModeEnabled();
}

export function isGiftedBtnsAvailable() {
  return typeof sendInteractiveMessage === 'function';
}

export async function sendButtonMenu(sock, jid, options = {}) {
  const {
    title = '',
    text = '',
    footer = '',
    buttons = [],
    image = null,
    quoted = null
  } = options;

  let fullText = '';
  if (title) fullText += `*${title}*\n\n`;
  fullText += text;
  if (footer) fullText += `\n\n${footer}`;
  await sock.sendMessage(jid, { text: fullText }, quoted ? { quoted } : {});
}

export async function sendInteractiveWithImage(sock, jid, { bodyText, footerText, buttons, imageBuffer, mimetype }) {
  if (!generateWAMessageFromContent || !proto) {
    throw new Error('Baileys proto not available');
  }

  let headerObj = { title: '', subtitle: '', hasMediaAttachment: false };

  if (imageBuffer && prepareWAMessageMedia) {
    try {
      const mediaMsg = await prepareWAMessageMedia(
        { image: imageBuffer },
        { upload: sock.waUploadToServer }
      );
      if (mediaMsg?.imageMessage) {
        headerObj = {
          title: '',
          subtitle: '',
          hasMediaAttachment: true,
          imageMessage: mediaMsg.imageMessage
        };
      }
    } catch (uploadErr) {
      console.log('[ButtonHelper] Image upload failed, sending without image:', uploadErr.message);
    }
  }

  const nativeButtons = buttons.map(btn => ({
    name: btn.name,
    buttonParamsJson: typeof btn.buttonParamsJson === 'string'
      ? btn.buttonParamsJson
      : JSON.stringify(btn.buttonParamsJson)
  }));

  const msgContent = {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2
        },
        interactiveMessage: proto.Message.InteractiveMessage.create({
          header: proto.Message.InteractiveMessage.Header.create(headerObj),
          body: proto.Message.InteractiveMessage.Body.create({ text: bodyText }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: footerText }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: nativeButtons,
            messageParamsJson: ''
          })
        })
      }
    }
  };

  try {
    const msg = generateWAMessageFromContent(jid, msgContent, { userJid: sock.user?.id });
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    console.log('[ButtonHelper] Interactive message sent successfully');
    return msg;
  } catch (relayErr) {
    console.log('[ButtonHelper] relayMessage failed:', relayErr?.message || relayErr);
    throw relayErr;
  }
}

export async function sendMainMenuButtons(sock, jid, m, PREFIX) {
  const botName = getBotName();
  const fkontak = createFakeContact(m);

  const headerText = buildMenuHeader('🐺 MAIN MENU', PREFIX);

  const menuCategories = [
    { text: '🤖 AI', id: `${PREFIX}aimenu` },
    { text: '🐙 Anime', id: `${PREFIX}animemenu` },
    { text: '⚙️ Auto', id: `${PREFIX}automenu` },
    { text: '🎨 Logo', id: `${PREFIX}logomenu` },
    { text: '⬇️ Download', id: `${PREFIX}downloadmenu` },
    { text: '✨ Ephoto', id: `${PREFIX}ephotomenu` },
    { text: '🛡️ Security', id: `${PREFIX}securitymenu` },
    { text: '🎉 Fun', id: `${PREFIX}funmenu` },
    { text: '🎮 Games', id: `${PREFIX}gamemenu` },
    { text: '🐙 GitHub', id: `${PREFIX}gitmenu` },
    { text: '🏠 Group', id: `${PREFIX}groupmenu` },
    { text: '🖼️ ImageGen', id: `${PREFIX}imagemenu` },
    { text: '🔄 Media', id: `${PREFIX}mediamenu` },
    { text: '🎵 Music', id: `${PREFIX}musicmenu` },
    { text: '👑 Owner', id: `${PREFIX}ownermenu` },
    { text: '📸 PhotoFunia', id: `${PREFIX}photofunia` },
    { text: '🏆 Sports', id: `${PREFIX}sportsmenu` },
    { text: '🕵️ Stalker', id: `${PREFIX}stalkermenu` },
    { text: '🔧 Tools', id: `${PREFIX}toolsmenu` },
    { text: '💝 Valentine', id: `${PREFIX}valentinemenu` },
    { text: '🎬 Videos', id: `${PREFIX}videomenu` },
  ];

  let menuText = `${headerText}\n\n📋 *Tap a button below to open a category:*`;

  const interactiveButtons = menuCategories.map(cat => ({
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({
      display_text: cat.text,
      id: cat.id
    })
  }));

  interactiveButtons.push({
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({
      display_text: '📜 All Commands',
      id: `${PREFIX}menu2`
    })
  });

  interactiveButtons.push({
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({
      display_text: '🏓 Ping',
      id: `${PREFIX}ping`
    })
  });

  try {
    const media = await getMenuImageBuffer();
    const imageBuffer = media?.buffer || null;

    await sendInteractiveWithImage(sock, jid, {
      bodyText: menuText,
      footerText: `🐺 ${botName}`,
      buttons: interactiveButtons,
      imageBuffer: imageBuffer,
      mimetype: 'image/jpeg'
    });
  } catch (err) {
    console.log('[ButtonMenu] Interactive with image failed:', err.message);
    let fallback = `${headerText}\n\n📋 *Menu Categories:*\n\n`;
    menuCategories.forEach(cat => {
      fallback += `├─ ${cat.text} → *${cat.id}*\n`;
    });
    fallback += `\n📜 Full list: *${PREFIX}menu2*\n🏓 Ping: *${PREFIX}ping*`;
    fallback += `\n\n🐺 *POWERED BY ${botName.toUpperCase()}* 🐺`;

    try {
      const media = await getMenuImageBuffer();
      if (media) {
        await sock.sendMessage(jid, { image: media.buffer, caption: fallback, mimetype: "image/jpeg" }, { quoted: fkontak });
      } else {
        await sock.sendMessage(jid, { text: fallback }, { quoted: fkontak });
      }
    } catch {
      await sock.sendMessage(jid, { text: fallback }, { quoted: fkontak });
    }
  }
}

export async function sendResponseWithButtons(sock, jid, options = {}, m = null) {
  const {
    text = '',
    footer = '',
    buttons = [],
    image = null
  } = options;

  await sock.sendMessage(jid, { text }, m ? { quoted: m } : {});
}
