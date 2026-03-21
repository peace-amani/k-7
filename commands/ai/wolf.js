// ====== commands/ai/wolf.js ======
// This is a thin "glue" file — it registers the ?wolf command with the
// bot's command loader and forwards all execution to the real implementation
// inside lib/wolfai.js (wolfCommandHandler).
//
// Keeping the command logic in lib/wolfai.js means:
//   • index.js can call WolfAI.command() directly without going through the
//     command loader (needed for the AI DM assistant, which intercepts
//     free-form messages, not prefixed commands).
//   • This file stays tiny — just the metadata the loader needs.
//
// Owner-only: only the bot owner (and sudo users, enforced inside
// wolfCommandHandler) can run ?wolf sub-commands.
//
// Sub-commands handled by wolfCommandHandler (all via ?wolf <sub>):
//   on / enable     — turn Wolf AI on
//   off / disable   — turn Wolf AI off
//   name <name>     — rename the AI assistant
//   block <jid>     — silence Wolf AI in a specific chat
//   unblock <jid>   — re-enable Wolf AI in a specific chat
//   allow <gid>     — allow Wolf AI to respond in a group
//   deny  <gid>     — remove a group from the allowed list
//   chats / list    — show silenced chats and active groups
//   status / stats  — show full AI stats
//   clear           — delete all stored conversation memory
//   (no args)       — show the status card / help menu

import WolfAI from '../../lib/wolfai.js';

export default {
  name: "wolf",
  aliases: ["wolfai", "wolfbot"],
  description: "Toggle Wolf AI assistant on/off and manage chat controls",
  ownerOnly: true,

  // `args`  — words after the command (e.g. ["on"] for "?wolf on")
  // `PREFIX` — the current command prefix (e.g. "?")
  async execute(sock, m, args, PREFIX) {
    return WolfAI.command(sock, m, args, PREFIX);
  },
};
