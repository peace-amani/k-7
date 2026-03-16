import { sendSubMenu, getBotName } from '../../lib/menuHelper.js';

export default {
  name: "securitymenu",
  alias: ["hackmenu", "secmenu", "hackingmenu", "ethicalmenu"],
  desc: "Shows ethical hacking commands",
  category: "ethical hacking",
  usage: ".securitymenu",

  async execute(sock, m, args, PREFIX) {
    const jid = m.key.remoteJid;
    const botName = getBotName();
    await sock.sendMessage(jid, { text: `securitymenu loading...` }, { quoted: m });
    await new Promise(resolve => setTimeout(resolve, 800));

    const commandsText = `╭─⊷ *🔍 RECON & OSINT*
│
│  • whois
│  • dnslookup
│  • subdomain
│  • reverseip
│  • geoip
│  • portscan
│  • headers
│  • traceroute
│  • asnlookup
│  • shodan
│
╰─⊷

╭─⊷ *📡 NETWORK ANALYSIS*
│
│  • pinghost
│  • latency
│  • sslcheck
│  • tlsinfo
│  • openports
│  • firewallcheck
│  • maclookup
│  • bandwidthtest
│
╰─⊷

╭─⊷ *🌐 WEB SECURITY*
│
│  • securityheaders
│  • wafdetect
│  • robotscheck
│  • sitemap
│  • cmsdetect
│  • techstack
│  • cookiescan
│  • redirectcheck
│
╰─⊷

╭─⊷ *⚠️ VULNERABILITY CHECKS*
│
│  • xsscheck
│  • sqlicheck
│  • csrfcheck
│  • clickjackcheck
│  • directoryscan
│  • exposedfiles
│  • misconfigcheck
│  • cvecheck
│
╰─⊷

╭─⊷ *🔐 PASSWORD & HASH TOOLS*
│
│  • hashidentify
│  • hashcheck
│  • bcryptcheck
│  • passwordstrength
│  • leakcheck
│
╰─⊷

╭─⊷ *🔬 FORENSICS & ANALYSIS*
│
│  • metadata
│  • filehash
│  • malwarecheck
│  • urlscan
│  • phishcheck
│  • nmap
│  • ipinfo
│  • nglattack
│
╰─⊷`;

    await sendSubMenu(sock, jid, '🛡️ ETHICAL HACKING MENU', commandsText, m, PREFIX);
  }
};
