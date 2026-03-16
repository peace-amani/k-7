import { sendSubMenu, getBotName } from '../../lib/menuHelper.js';

export default {
  name: "ownermenu",
  alias: ["omenu"],
  desc: "Shows owner-only commands",
  category: "Owner",
  usage: ".ownermenu",

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const botName = getBotName();
    await sock.sendMessage(jid, { text: `ownermenu loading...` }, { quoted: m });
    await new Promise(resolve => setTimeout(resolve, 800));

    const commandsText = `╭─⊷ *⚡ CORE MANAGEMENT*
│
│  • setbotname
│  • resetbotname
│  • setowner
│  • resetowner
│  • setprefix
│  • prefix
│  • iamowner
│  • about
│  • owner
│  • block
│  • unblock
│  • blockdetect
│  • silent
│  • anticall
│  • mode
│  • setpp
│  • setfooter
│  • repo
│  • pair
│
╰─⊷

╭─⊷ *🔐 PROTECTION SYSTEMS*
│
│  • antidelete
│  • antideletestatus
│  • antiedit
│  • antiviewonce
│  • antispam
│
╰─⊷

╭─⊷ *🔄 SYSTEM & MAINTENANCE*
│
│  • restart
│  • workingreload
│  • reloadenv
│  • getsettings
│  • setsetting
│  • test
│  • disk
│  • hostip
│  • findcommands
│  • latestupdates
│  • panel
│  • checkbotname
│  • disp
│
╰─⊷

╭─⊷ *⚙️ AUTOMATION*
│
│  • autoread
│  • autotyping
│  • autorecording
│  • autoreact
│  • autoreactstatus
│  • autoviewstatus
│  • autobio
│  • autorec
│  • reactowner
│
╰─⊷

╭─⊷ *👥 SUDO MANAGEMENT*
│
│  • addsudo
│  • delsudo
│  • listsudo
│  • checksudo
│  • clearsudo
│  • sudomode
│  • sudoinfo
│  • mysudo
│  • sudodebug
│  • linksudo
│
╰─⊷

╭─⊷ *🔒 PRIVACY CONTROLS*
│
│  • online
│  • privacy
│  • receipt
│  • profilepic
│  • viewer
│
╰─⊷

╭─⊷ *🐙 GITHUB TOOLS*
│
│  • gitclone
│  • gitinfo
│  • repanalyze
│  • update
│
╰─⊷`;

    await sendSubMenu(sock, jid, 'Owner Menu', commandsText, m, PREFIX);
  }
};
