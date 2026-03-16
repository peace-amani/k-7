import { sendSubMenu, getBotName } from '../../lib/menuHelper.js';

export default {
  name: "groupmenu",
  alias: ["gmenu", "grouphelp", "groupcmds"],
  desc: "Shows group management commands",
  category: "Group",
  usage: ".groupmenu",

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const botName = getBotName();
    await sock.sendMessage(jid, { text: `groupmenu loading...` }, { quoted: m });
    await new Promise(resolve => setTimeout(resolve, 800));

    const commandsText = `╭─⊷ *🛡️ ADMIN & MODERATION*
│
│  • add
│  • promote
│  • promoteall
│  • demote
│  • demoteall
│  • kick
│  • kickall
│  • ban
│  • unban
│  • clearbanlist
│  • warn
│  • resetwarn
│  • setwarn
│  • warnings
│  • mute
│  • unmute
│  • welcome
│  • goodbye
│  • leave
│  • join
│  • creategroup
│
╰─⊷

╭─⊷ *🚫 AUTO-MODERATION*
│
│  • antilink
│  • antisticker
│  • antiimage
│  • antivideo
│  • antiaudio
│  • antimention
│  • antistatusmention
│  • antigrouplink
│  • antidemote
│  • antipromote
│  • antileave
│
╰─⊷

╭─⊷ *📊 GROUP INFO & TOOLS*
│
│  • groupinfo
│  • grouplink
│  • tagall
│  • tagadmin
│  • hidetag
│  • link
│  • revoke
│  • setdesc
│  • getparticipants
│  • listonline
│  • listinactive
│  • approveall
│  • rejectall
│
╰─⊷`;

    await sendSubMenu(sock, jid, '🏠 GROUP MENU', commandsText, m, PREFIX);
  }
};
