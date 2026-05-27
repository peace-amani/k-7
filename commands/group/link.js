import { getOwnerName } from '../../lib/menuHelper.js';
// export default {
//   name: 'link',
//   description: 'Get the group invite link',
//   category: 'group',
//   async execute(sock, msg, args, metadata) {
//     const sender = msg.key.remoteJid;
//     const isGroup = sender.endsWith('@g.us');

//     if (!isGroup) {
//       await sock.sendMessage(sender, { text: '❌ This command is only for groups.' }, { quoted: msg });
//       return;
//     }

//     const user = msg.key.participant || msg.participant || msg.key.remoteJid;
//     const groupAdmins = metadata.participants.filter(p => p.admin);
//     const isAdmin = groupAdmins.some(p => p.id === user);

//     if (!isAdmin) {
//       await sock.sendMessage(sender, { text: '⛔ Only group admins can use this command.' }, { quoted: msg });
//       return;
//     }

//     try {
//       const code = await sock.groupInviteCode(sender);
//       const inviteLink = `https://chat.whatsapp.com/${code}`;

//       await sock.sendMessage(sender, {
//         text: `🐺 *Silent Wolf Group Invite Link*\n\n🔗 ${inviteLink}`,
//       }, { quoted: msg });
//     } catch (err) {
//       console.error('Group Link Error:', err);
//       await sock.sendMessage(sender, { text: '❌ Could not fetch the group link.' }, { quoted: msg });
//     }
//   }
// };






export default {
  name: 'link',
  description: 'Get or reset the group invite link',
  category: 'group',
  async execute(sock, msg, args, metadata) {
    const sender = msg.key.remoteJid;
    const isGroup = sender.endsWith('@g.us');

    if (!isGroup) {
      await sock.sendMessage(sender, { 
        text: '❌ *This command is only for groups.*\n\nJoin a group to use this command.' 
      }, { quoted: msg });
      return;
    }

    try {
      // Get user who sent the message
      const user = msg.key.participant || sender;
      
      // Get group metadata if not provided
      if (!metadata) {
        metadata = await sock.groupMetadata(sender);
      }
      
      // Check if user is admin
      const participant = metadata.participants.find(p => p.id === user);
      const isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
      
      if (!isAdmin) {
        await sock.sendMessage(sender, { 
          text: '⛔ *Permission Denied*\n\nOnly group admins can use this command.\n\nAsk an admin for the group link.' 
        }, { quoted: msg });
        return;
      }

      const action = args[0]?.toLowerCase();
      
      // Show usage if no action specified
      if (!action) {
        const usageText = `╭─⌈ 📋 *GROUP LINK* ⌋\n│\n├─⊷ *link*\n│  └⊷ Get current invite link\n├─⊷ *link reset*\n│  └⊷ Generate new link\n├─⊷ *link revoke*\n│  └⊷ Revoke current link\n├─⊷ *link info*\n│  └⊷ Show link info\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;
        
        await sock.sendMessage(sender, { 
          text: usageText
        }, { quoted: msg });
        return;
      }

      let message = '';
      
      switch(action) {
        case 'reset':
        case 'new':
        case 'generate':
          // Revoke old link and generate new one
          await sock.groupRevokeInvite(sender);
          // Small delay to ensure revocation
          await new Promise(resolve => setTimeout(resolve, 1000));
          const newCode = await sock.groupInviteCode(sender);
          const newLink = `https://chat.whatsapp.com/${newCode}`;
          
          message = `🔄 *New Group Link Generated*\n\n🔗 *New Link:* ${newLink}\n\n⚠️ *Note:* The old link is now invalid.`;
          break;
          
        case 'revoke':
        case 'delete':
        case 'remove':
          // Revoke current link
          await sock.groupRevokeInvite(sender);
          message = '🗑️ *Group Link Revoked*\n\nThe invite link has been deleted. No one can join using the old link.\n\nGenerate a new link with: *link reset*';
          break;
          
        case 'info':
        case 'status':
          try {
            const code = await sock.groupInviteCode(sender);
            const link = `https://chat.whatsapp.com/${code}`;
            
            // Refresh group metadata
            const groupMetadata = await sock.groupMetadata(sender);
            const participantsCount = groupMetadata.participants.length;
            const creationDate = new Date(groupMetadata.creation * 1000).toLocaleDateString();
            const adminsCount = groupMetadata.participants.filter(p => p.admin).length;
            
            message = `📊 *Group Link Information*\n\n`;
            message += `🔗 *Link:* ${link}\n`;
            message += `👥 *Members:* ${participantsCount}\n`;
            message += `📅 *Created:* ${creationDate}\n`;
            message += `👑 *Admins:* ${adminsCount}\n`;
            message += `🆔 *Group ID:* ${sender.split('@')[0]}\n\n`;
            message += `\n╭─⌈ 💡 *COMMANDS* ⌋\n│\n├─⊷ *link reset*\n│  └⊷ Generate new link\n├─⊷ *link revoke*\n│  └⊷ Delete current link\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;
          } catch (error) {
            if (error.message?.includes('not authorized') || error.message?.includes('401')) {
              message = '🔗 *No Active Link*\n\nThere is no active invite link for this group or the bot lacks permissions.\n\nGenerate one with: *link reset*';
            } else {
              message = '🔗 *No Active Link*\n\nThere is no active invite link for this group.\n\nGenerate one with: *link reset*';
            }
          }
          break;
          
        default:
          // Get current link
          try {
            const code = await sock.groupInviteCode(sender);
            const link = `https://chat.whatsapp.com/${code}`;
            
            message = `🐺 *Group Invite Link*\n\n`;
            message += `🔗 *Link:* ${link}\n\n`;
            message += `\n╭─⌈ 📋 *USAGE* ⌋\n│\n├─⊷ *link reset*\n│  └⊷ Generate new link\n├─⊷ *link revoke*\n│  └⊷ Delete current link\n╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;
          } catch (error) {
            // No active link, generate one
            try {
              const newCode = await sock.groupInviteCode(sender);
              const newLink = `https://chat.whatsapp.com/${newCode}`;
              
              message = `🔗 *New Group Link Created*\n\n`;
              message += `No active link found. Generated new link:\n\n`;
              message += `${newLink}\n\n`;
              message += `Share this link to invite members to the group.`;
            } catch (genError) {
              message = '❌ *Failed to generate link*\n\nThe bot may not have admin privileges to create invite links.';
            }
          }
      }

      await sock.sendMessage(sender, { 
        text: message,
        contextInfo: {
          forwardingScore: 999,
          isForwarded: false
        }
      }, { quoted: msg });

    } catch (err) {
      console.error('Group Link Error:', err);
      
      let errorMessage = '❌ *Error*\n\n';
      
      if (err.message?.includes('not authorized')) {
        errorMessage += 'Bot is not authorized to manage group links.\nMake sure bot is an admin.';
      } else if (err.message?.includes('401')) {
        errorMessage += 'Bot lost admin privileges.\nRe-add bot as admin.';
      } else if (err.message?.includes('404')) {
        errorMessage += 'Group not found or bot removed.';
      } else if (err.message?.includes('not in group')) {
        errorMessage += 'Bot is not in this group.';
      } else if (err.message?.includes('invitecode')) {
        errorMessage += 'Unable to generate invite code.\nBot may need admin permissions.';
      } else {
        errorMessage += `Could not process request: ${err.message || 'Unknown error'}`;
      }
      
      await sock.sendMessage(sender, { text: errorMessage }, { quoted: msg });
    }
  }
};