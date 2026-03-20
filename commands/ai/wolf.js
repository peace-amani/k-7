import WolfAI from '../../lib/wolfai.js';

export default {
  name: "wolf",
  aliases: ["wolfai", "wolfbot"],
  description: "Toggle Wolf AI assistant on/off and manage chat controls",
  ownerOnly: true,
  async execute(sock, m, args, PREFIX) {
    return WolfAI.command(sock, m, args, PREFIX);
  },
};
