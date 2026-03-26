import supabase from '../../lib/database.js';
import { getOwnerName } from '../../lib/menuHelper.js';

const rpsActiveGames = new Map();
const rpsChallenges = new Map();
const rpsTournaments = new Map();
const rpsStats = new Map();
const rpsLeaderboard = new Map();

let globalSock = null;

export default {
    name: "rps",
    alias: ["rockpaperscissors", "rock", "paper", "scissors", "challenge"],
    desc: "Play Rock-Paper-Scissors in WhatsApp - Single player, Multiplayer & Tournaments",
    category: "games",
    usage: `.rps play [rock/paper/scissors] - Play vs AI\n.rps challenge @user [bet] - Challenge another player\n.rps accept - Accept challenge\n.rps decline - Decline challenge\n.rps tournament create [players] [entry] - Create tournament\n.rps tournament join - Join tournament\n.rps tournament start - Start tournament\n.rps stats - Your statistics\n.rps leaderboard - Global rankings\n.rps history - Match history\n.rps rules - Game rules`,
    
    async execute(sock, m, args) {
        try {
            globalSock = sock;
            
            const chatId = m.key.remoteJid;
            const userId = m.key.participant || m.key.remoteJid;
            const userName = m.pushName || "Player";
            const userMention = m.key.participant ? `@${m.key.participant.split('@')[0]}` : userName;
            
            // Initialize stats
            if (!rpsStats.has(userId)) {
                rpsStats.set(userId, {
                    name: userName,
                    totalGames: 0,
                    wins: 0,
                    losses: 0,
                    draws: 0,
                    winStreak: 0,
                    maxWinStreak: 0,
                    totalPoints: 0,
                    achievements: [],
                    lastPlayed: 0,
                    vsAI: { wins: 0, losses: 0, draws: 0 },
                    vsHuman: { wins: 0, losses: 0, draws: 0 },
                    byMove: { rock: 0, paper: 0, scissors: 0 }
                });
            }
            
            const action = args[0]?.toLowerCase();
            
            // Quick play commands
            const moves = ['rock', 'paper', 'scissors', 'r', 'p', 's'];
            if (moves.includes(action)) {
                return await playVsAI(sock, m, chatId, userId, userName, action);
            }
            
            // Help command
            if (!action || action === 'help') {
                return await showRPSHelp(sock, m, chatId);
            }
            
            // Rules
            if (action === 'rules') {
                return await showRPSRules(sock, m, chatId);
            }
            
            // Stats command
            if (action === 'stats') {
                return await showRPSStats(sock, m, chatId, userId, userName);
            }
            
            // Leaderboard
            if (action === 'leaderboard' || action === 'lb' || action === 'top') {
                return await showRPSLeaderboard(sock, m, chatId);
            }
            
            // History
            if (action === 'history' || action === 'matches') {
                return await showRPSHistory(sock, m, chatId, userId, userName);
            }
            
            // Challenges
            if (action === 'challenge' || action === 'ch' || action === 'duel') {
                if (!m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
                    return await sock.sendMessage(chatId, {
                        text: "❌ Please mention a user to challenge!\nExample: `.rps challenge @username`"
                    }, { quoted: m });
                }
                
                const targetUserId = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
                const betAmount = parseInt(args[2]) || 0;
                
                return await createChallenge(sock, m, chatId, userId, userName, targetUserId, betAmount);
            }
            
            if (action === 'accept') {
                return await acceptChallenge(sock, m, chatId, userId, userName);
            }
            
            if (action === 'decline' || action === 'reject') {
                return await declineChallenge(sock, m, chatId, userId, userName);
            }
            
            if (action === 'cancel') {
                return await cancelChallenge(sock, m, chatId, userId, userName);
            }
            
            // Tournament commands
            if (action === 'tournament' || action === 'tourney' || action === 't') {
                const subAction = args[1]?.toLowerCase();
                
                if (!subAction || subAction === 'help') {
                    return await showTournamentHelp(sock, m, chatId);
                }
                
                if (subAction === 'create') {
                    const playerCount = parseInt(args[2]) || 8;
                    const entryFee = parseInt(args[3]) || 0;
                    
                    return await createTournament(sock, m, chatId, userId, userName, playerCount, entryFee);
                }
                
                if (subAction === 'join') {
                    return await joinTournament(sock, m, chatId, userId, userName);
                }
                
                if (subAction === 'start') {
                    return await startTournament(sock, m, chatId, userId, userName);
                }
                
                if (subAction === 'leave') {
                    return await leaveTournament(sock, m, chatId, userId, userName);
                }
                
                if (subAction === 'status' || subAction === 'info') {
                    return await showTournamentStatus(sock, m, chatId);
                }
                
                if (subAction === 'cancel') {
                    return await cancelTournament(sock, m, chatId, userId, userName);
                }
                
                if (subAction === 'list') {
                    return await listTournaments(sock, m, chatId);
                }
                
                return await showTournamentHelp(sock, m, chatId);
            }
            
            // Play vs AI
            if (action === 'play' || action === 'vsai' || action === 'ai') {
                const move = args[1]?.toLowerCase();
                if (!move || !['rock', 'paper', 'scissors', 'r', 'p', 's'].includes(move)) {
                    return await sock.sendMessage(chatId, {
                        text: "❌ Please specify your move!\nUsage: `.rps play rock` or `.rps play paper` or `.rps play scissors`"
                    }, { quoted: m });
                }
                
                return await playVsAI(sock, m, chatId, userId, userName, move);
            }
            
            // Quick rematch
            if (action === 'rematch') {
                return await handleRematch(sock, m, chatId, userId, userName);
            }
            
            return await showRPSHelp(sock, m, chatId);
            
        } catch (error) {
            console.error("RPS game error:", error);
            await sock.sendMessage(m.key.remoteJid, {
                text: `❌ Error: ${error.message}\nUse .rps help for instructions`
            }, { quoted: m });
        }
    }
};

// ============= SINGLE PLAYER (VS AI) =============

async function playVsAI(sock, m, chatId, userId, userName, playerMove) {
    // Convert short forms
    const moveMap = { 'r': 'rock', 'p': 'paper', 's': 'scissors' };
    const playerChoice = moveMap[playerMove] || playerMove;
    
    // AI makes a choice (with some "intelligence" - 70% random, 30% counter to player's last move)
    const stats = rpsStats.get(userId);
    let aiChoice;
    
    if (Math.random() < 0.3 && stats.byMove && (stats.totalGames > 5)) {
        // Try to counter player's most used move
        const moves = Object.entries(stats.byMove);
        const mostUsedMove = moves.sort((a, b) => b[1] - a[1])[0][0];
        aiChoice = getCounterMove(mostUsedMove);
    } else {
        // Random choice
        const choices = ['rock', 'paper', 'scissors'];
        aiChoice = choices[Math.floor(Math.random() * choices.length)];
    }
    
    // Determine winner
    const result = determineWinner(playerChoice, aiChoice);
    
    // Update stats
    updateStatsAfterGame(userId, result, playerChoice, true);
    
    // Emojis for moves
    const moveEmojis = {
        'rock': '🪨',
        'paper': '📄', 
        'scissors': '✂️'
    };
    
    const resultMessages = {
        'win': `🎉 *${userName} WINS!*`,
        'lose': `😢 *AI WINS!*`,
        'draw': `🤝 *IT'S A DRAW!*`
    };
    
    const resultEmojis = {
        'win': '🏆',
        'lose': '💀',
        'draw': '🤝'
    };
    
    const message = `
${resultEmojis[result]} *ROCK PAPER SCISSORS* ${resultEmojis[result]}

👤 *Player:* ${userName}
🤖 *Opponent:* AI Bot

${moveEmojis[playerChoice]} *${userName}:* ${playerChoice.toUpperCase()}
${moveEmojis[aiChoice]} *AI Bot:* ${aiChoice.toUpperCase()}

${resultMessages[result]}

*${getResultDescription(playerChoice, aiChoice, result)}*

📊 *Your Stats:*
🎮 Total Games: ${stats.totalGames + 1}
🏆 Wins: ${stats.wins + (result === 'win' ? 1 : 0)}
😢 Losses: ${stats.losses + (result === 'lose' ? 1 : 0)}
🤝 Draws: ${stats.draws + (result === 'draw' ? 1 : 0)}
🔥 Win Streak: ${result === 'win' ? stats.winStreak + 1 : 0}

*Play again:*
• \`.rps rock\` (quick play)
• \`.rps play paper\`
• \`.rps challenge @friend\` (vs human)
    `.trim();
    
    await sock.sendMessage(chatId, { 
        text: message,
        mentions: [userId]
    }, { quoted: m });
    
    saveRPSStats();
}

// ============= MULTIPLAYER CHALLENGES =============

async function createChallenge(sock, m, chatId, userId, userName, targetUserId, betAmount) {
    // Check if target is self
    if (targetUserId === userId) {
        return await sock.sendMessage(chatId, {
            text: "❌ You cannot challenge yourself!"
        }, { quoted: m });
    }
    
    // Check if target already has a pending challenge
    for (const [key, challenge] of rpsChallenges) {
        if (challenge.targetId === targetUserId && challenge.status === 'pending') {
            return await sock.sendMessage(chatId, {
                text: `❌ ${challenge.targetName} already has a pending challenge!`
            }, { quoted: m });
        }
    }
    
    // Create challenge ID
    const challengeId = `${chatId}_${Date.now()}`;
    
    const challenge = {
        id: challengeId,
        chatId,
        challengerId: userId,
        challengerName: userName,
        targetId: targetUserId,
        targetName: m.pushName || "Opponent",
        betAmount,
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + (5 * 60 * 1000), // 5 minutes
        messageId: null
    };
    
    rpsChallenges.set(challengeId, challenge);
    
    const betText = betAmount > 0 ? `💰 *Bet:* ${betAmount} points` : '';
    
    const message = `
⚔️ *RPS CHALLENGE ISSUED!* ⚔️

${betText}

👤 *Challenger:* ${userName}
🎯 *Challenged:* @${targetUserId.split('@')[0]}

⏱️ *Expires in:* 5 minutes

*Commands:*
✅ \`.rps accept\` - Accept challenge
❌ \`.rps decline\` - Decline challenge
🕐 \`.rps cancel\` - Cancel challenge

*Once accepted, both players DM me their choice:*
• Rock 🪨
• Paper 📄  
• Scissors ✂️

*The result will be announced here!*
    `.trim();
    
    const challengeMsg = await sock.sendMessage(chatId, {
        text: message,
        mentions: [targetUserId, userId]
    }, { quoted: m });
    
    challenge.messageId = challengeMsg.key;
    
    // Auto-expire challenge after 5 minutes
    setTimeout(async () => {
        if (rpsChallenges.has(challengeId) && rpsChallenges.get(challengeId).status === 'pending') {
            rpsChallenges.delete(challengeId);
            
            try {
                await sock.sendMessage(chatId, {
                    text: `⏰ *Challenge expired!*\n\n${userName}'s challenge to @${targetUserId.split('@')[0]} has expired.`,
                    edit: challengeMsg.key
                });
            } catch (error) {
                console.error("Failed to edit expired challenge:", error);
            }
        }
    }, 5 * 60 * 1000);
}

async function acceptChallenge(sock, m, chatId, userId, userName) {
    // Find pending challenge for this user
    let challenge = null;
    let challengeId = null;
    
    for (const [id, ch] of rpsChallenges) {
        if (ch.targetId === userId && ch.status === 'pending' && ch.chatId === chatId) {
            challenge = ch;
            challengeId = id;
            break;
        }
    }
    
    if (!challenge) {
        return await sock.sendMessage(chatId, {
            text: "❌ No pending challenges found for you!"
        }, { quoted: m });
    }
    
    // Update challenge status
    challenge.status = 'accepted';
    challenge.acceptedAt = Date.now();
    
    // Create a new game
    const gameId = `${chatId}_${challengeId}`;
    const game = {
        id: gameId,
        chatId,
        challengeId,
        player1Id: challenge.challengerId,
        player1Name: challenge.challengerName,
        player2Id: challenge.targetId,
        player2Name: challenge.targetName,
        player1Choice: null,
        player2Choice: null,
        betAmount: challenge.betAmount,
        status: 'waiting_for_choices',
        createdAt: Date.now(),
        result: null,
        round: 1,
        maxRounds: 1,
        scores: { player1: 0, player2: 0 }
    };
    
    rpsActiveGames.set(gameId, game);
    
    // Update challenge message
    const message = `
✅ *CHALLENGE ACCEPTED!* ✅

⚔️ *Match Starting:*
👤 ${challenge.challengerName} vs 👤 ${challenge.targetName}

💰 *Bet:* ${challenge.betAmount > 0 ? challenge.betAmount + ' points' : 'No bet'}

*📝 INSTRUCTIONS:*
Both players need to send me their choice in *PRIVATE CHAT*:
• \`rock\` or \`r\` - Rock 🪨
• \`paper\` or \`p\` - Paper 📄
• \`scissors\` or \`s\` - Scissors ✂️

*Send your choice within 60 seconds!*

I will announce the result here once both choices are received.
    `.trim();
    
    try {
        await sock.sendMessage(chatId, {
            text: message,
            edit: challenge.messageId,
            mentions: [challenge.challengerId, challenge.targetId]
        });
    } catch (error) {
        console.error("Failed to edit challenge message:", error);
        await sock.sendMessage(chatId, {
            text: message,
            mentions: [challenge.challengerId, challenge.targetId]
        });
    }
    
    // Send private instructions to both players
    const privateInstructions = `
🎮 *RPS CHALLENGE - MAKE YOUR MOVE*

You are playing against ${userId === challenge.challengerId ? challenge.targetName : challenge.challengerName}

*Choose your move by replying with:*
• \`rock\` or \`r\` - 🪨 Rock
• \`paper\` or \`p\` - 📄 Paper  
• \`scissors\` or \`s\` - ✂️ Scissors

*You have 60 seconds to choose!*
    `.trim();
    
    await sock.sendMessage(challenge.challengerId, { text: privateInstructions });
    await sock.sendMessage(challenge.targetId, { text: privateInstructions });
    
    // Start timeout for choices
    setTimeout(async () => {
        if (rpsActiveGames.has(gameId) && rpsActiveGames.get(gameId).status === 'waiting_for_choices') {
            const timedOutGame = rpsActiveGames.get(gameId);
            
            let timeoutMessage = "⏰ *TIME'S UP!*\n\n";
            
            if (!timedOutGame.player1Choice && !timedOutGame.player2Choice) {
                timeoutMessage += "Both players failed to choose in time. Match cancelled.";
            } else if (!timedOutGame.player1Choice) {
                timeoutMessage += `${timedOutGame.player1Name} failed to choose. ${timedOutGame.player2Name} wins by default!`;
                // Update stats for automatic win
                updateStatsAfterGame(timedOutGame.player2Id, 'win', null, false);
                updateStatsAfterGame(timedOutGame.player1Id, 'lose', null, false);
            } else if (!timedOutGame.player2Choice) {
                timeoutMessage += `${timedOutGame.player2Name} failed to choose. ${timedOutGame.player1Name} wins by default!`;
                // Update stats for automatic win
                updateStatsAfterGame(timedOutGame.player1Id, 'win', null, false);
                updateStatsAfterGame(timedOutGame.player2Id, 'lose', null, false);
            }
            
            await sock.sendMessage(chatId, {
                text: timeoutMessage,
                mentions: [timedOutGame.player1Id, timedOutGame.player2Id]
            });
            
            rpsActiveGames.delete(gameId);
            saveRPSStats();
        }
    }, 60 * 1000);
}

async function declineChallenge(sock, m, chatId, userId, userName) {
    // Find pending challenge for this user
    let challenge = null;
    let challengeId = null;
    
    for (const [id, ch] of rpsChallenges) {
        if (ch.targetId === userId && ch.status === 'pending' && ch.chatId === chatId) {
            challenge = ch;
            challengeId = id;
            break;
        }
    }
    
    if (!challenge) {
        return await sock.sendMessage(chatId, {
            text: "❌ No pending challenges found for you!"
        }, { quoted: m });
    }
    
    challenge.status = 'declined';
    
    const message = `❌ *CHALLENGE DECLINED*\n\n${userName} declined the challenge from ${challenge.challengerName}.`;
    
    try {
        await sock.sendMessage(chatId, {
            text: message,
            edit: challenge.messageId,
            mentions: [challenge.challengerId]
        });
    } catch (error) {
        console.error("Failed to edit declined message:", error);
        await sock.sendMessage(chatId, { text: message });
    }
    
    rpsChallenges.delete(challengeId);
}

async function cancelChallenge(sock, m, chatId, userId, userName) {
    // Find challenge created by this user
    let challenge = null;
    let challengeId = null;
    
    for (const [id, ch] of rpsChallenges) {
        if (ch.challengerId === userId && ch.status === 'pending' && ch.chatId === chatId) {
            challenge = ch;
            challengeId = id;
            break;
        }
    }
    
    if (!challenge) {
        return await sock.sendMessage(chatId, {
            text: "❌ No pending challenges found that you created!"
        }, { quoted: m });
    }
    
    challenge.status = 'cancelled';
    
    const message = `🚫 *CHALLENGE CANCELLED*\n\n${userName} cancelled their challenge to ${challenge.targetName}.`;
    
    try {
        await sock.sendMessage(chatId, {
            text: message,
            edit: challenge.messageId,
            mentions: [challenge.targetId]
        });
    } catch (error) {
        console.error("Failed to edit cancelled message:", error);
        await sock.sendMessage(chatId, { text: message });
    }
    
    rpsChallenges.delete(challengeId);
}

// Handle player choices (from private messages)
export async function handleRPSChoice(sock, m) {
    try {
        const userId = m.key.remoteJid;
        const choice = m.message?.conversation?.toLowerCase() || 
                      m.message?.extendedTextMessage?.text?.toLowerCase();
        
        if (!choice || !['rock', 'paper', 'scissors', 'r', 'p', 's'].includes(choice)) {
            return; // Not a valid RPS choice
        }
        
        // Convert short forms
        const moveMap = { 'r': 'rock', 'p': 'paper', 's': 'scissors' };
        const playerChoice = moveMap[choice] || choice;
        
        // Find active game where this player hasn't chosen yet
        for (const [gameId, game] of rpsActiveGames) {
            if (game.status === 'waiting_for_choices') {
                if (userId === game.player1Id && !game.player1Choice) {
                    game.player1Choice = playerChoice;
                    await sock.sendMessage(userId, { 
                        text: `✅ Choice recorded: ${playerChoice.toUpperCase()} ${getMoveEmoji(playerChoice)}\n\nWaiting for opponent...` 
                    });
                    
                    // Check if both players have chosen
                    if (game.player1Choice && game.player2Choice) {
                        await processGameResult(sock, game);
                    }
                    return;
                    
                } else if (userId === game.player2Id && !game.player2Choice) {
                    game.player2Choice = playerChoice;
                    await sock.sendMessage(userId, { 
                        text: `✅ Choice recorded: ${playerChoice.toUpperCase()} ${getMoveEmoji(playerChoice)}\n\nWaiting for opponent...` 
                    });
                    
                    // Check if both players have chosen
                    if (game.player1Choice && game.player2Choice) {
                        await processGameResult(sock, game);
                    }
                    return;
                }
            }
        }
        
        // If no active game found
        await sock.sendMessage(userId, { 
            text: "❌ No active RPS game found or you've already made your choice!" 
        });
        
    } catch (error) {
        console.error("Error handling RPS choice:", error);
    }
}

async function processGameResult(sock, game) {
    game.status = 'completed';
    
    // Determine winner
    const result = determineWinner(game.player1Choice, game.player2Choice);
    
    // Update game result
    game.result = result;
    
    // Update stats for both players
    updateStatsAfterGame(game.player1Id, 
        result === 'win' ? 'win' : result === 'lose' ? 'lose' : 'draw',
        game.player1Choice,
        false
    );
    
    updateStatsAfterGame(game.player2Id,
        result === 'lose' ? 'win' : result === 'win' ? 'lose' : 'draw',
        game.player2Choice,
        false
    );
    
    // Update leaderboard
    if (result !== 'draw') {
        const winnerId = result === 'win' ? game.player1Id : game.player2Id;
        const winnerName = result === 'win' ? game.player1Name : game.player2Name;
        const loserId = result === 'win' ? game.player2Id : game.player1Id;
        
        updateRPSLeaderboard(winnerId, winnerName, loserId);
    }
    
    // Prepare result message
    const moveEmojis = {
        'rock': '🪨',
        'paper': '📄', 
        'scissors': '✂️'
    };
    
    let resultMessage = "";
    if (result === 'win') {
        resultMessage = `🎉 *${game.player1Name} WINS!*`;
    } else if (result === 'lose') {
        resultMessage = `🎉 *${game.player2Name} WINS!*`;
    } else {
        resultMessage = `🤝 *IT'S A DRAW!*`;
    }
    
    const resultDescription = getResultDescription(game.player1Choice, game.player2Choice, result);
    
    const message = `
🏆 *RPS MATCH RESULT* 🏆

${moveEmojis[game.player1Choice]} *${game.player1Name}:* ${game.player1Choice.toUpperCase()}
${moveEmojis[game.player2Choice]} *${game.player2Name}:* ${game.player2Choice.toUpperCase()}

${resultMessage}

*${resultDescription}*

${game.betAmount > 0 ? `💰 *Bet Amount:* ${game.betAmount} points\n` : ''}
*Next:*
• \`.rps rematch\` - Play again
• \`.rps challenge @user\` - New challenge
• \`.rps tournament create\` - Start tournament
    `.trim();
    
    await sock.sendMessage(game.chatId, {
        text: message,
        mentions: [game.player1Id, game.player2Id]
    });
    
    // Clear the game
    rpsActiveGames.delete(game.id);
    
    // Clear the challenge
    if (game.challengeId && rpsChallenges.has(game.challengeId)) {
        rpsChallenges.delete(game.challengeId);
    }
    
    saveRPSStats();
}

async function handleRematch(sock, m, chatId, userId, userName) {
    // Check for recent completed game with this player
    // This is a simplified version - in production, you'd track recent games
    
    await sock.sendMessage(chatId, {
        text: `To rematch, challenge the player again:\n\`.rps challenge @username\`\n\nOr play vs AI: \`.rps rock\``,
        mentions: [userId]
    }, { quoted: m });
}

// ============= TOURNAMENTS =============

async function createTournament(sock, m, chatId, userId, userName, playerCount, entryFee) {
    // Validate player count
    const validCounts = [4, 8, 16, 32];
    const actualCount = validCounts.includes(playerCount) ? playerCount : 8;
    
    // Check if tournament already exists in this chat
    if (rpsTournaments.has(chatId)) {
        return await sock.sendMessage(chatId, {
            text: "❌ A tournament is already active in this chat!"
        }, { quoted: m });
    }
    
    const tournamentId = `${chatId}_${Date.now()}`;
    const tournament = {
        id: tournamentId,
        chatId,
        creatorId: userId,
        creatorName: userName,
        playerCount: actualCount,
        entryFee,
        players: [{
            id: userId,
            name: userName,
            joinedAt: Date.now()
        }],
        status: 'registration',
        bracket: null,
        currentRound: 0,
        prizes: calculatePrizes(actualCount, entryFee),
        createdAt: Date.now(),
        startsAt: null
    };
    
    rpsTournaments.set(tournamentId, tournament);
    
    const message = `
🏆 *RPS TOURNAMENT CREATED!* 🏆

*Tournament Details:*
👑 Creator: ${userName}
👥 Players: ${actualCount} (${tournament.players.length}/${actualCount} joined)
💰 Entry Fee: ${entryFee > 0 ? `${entryFee} points` : 'Free'}
🎁 Prize Pool: ${tournament.prizes.total} points

*Prize Distribution:*
🥇 1st: ${tournament.prizes.first} points
🥈 2nd: ${tournament.prizes.second} points
🥉 3rd-4th: ${tournament.prizes.third} points each

*Commands:*
✅ \`.rps tournament join\` - Join tournament
▶️ \`.rps tournament start\` - Start tournament (creator only)
❌ \`.rps tournament leave\` - Leave tournament
📊 \`.rps tournament status\` - Check status

*Registration will close when all spots are filled or creator starts the tournament!*
    `.trim();
    
    const tournamentMsg = await sock.sendMessage(chatId, {
        text: message,
        mentions: [userId]
    }, { quoted: m });
    
    tournament.messageId = tournamentMsg.key;
    
    // Auto-cancel after 1 hour if not started
    setTimeout(async () => {
        if (rpsTournaments.has(tournamentId) && rpsTournaments.get(tournamentId).status === 'registration') {
            const expiredTourney = rpsTournaments.get(tournamentId);
            rpsTournaments.delete(tournamentId);
            
            await sock.sendMessage(chatId, {
                text: `⏰ *Tournament cancelled due to inactivity*\n\nTournament created by ${userName} has been cancelled.`,
                edit: tournamentMsg.key
            });
        }
    }, 60 * 60 * 1000);
}

async function joinTournament(sock, m, chatId, userId, userName) {
    // Find active tournament in this chat
    let tournament = null;
    let tournamentId = null;
    
    for (const [id, tourney] of rpsTournaments) {
        if (tourney.chatId === chatId && tourney.status === 'registration') {
            tournament = tourney;
            tournamentId = id;
            break;
        }
    }
    
    if (!tournament) {
        return await sock.sendMessage(chatId, {
            text: "❌ No active tournament in this chat!"
        }, { quoted: m });
    }
    
    // Check if already joined
    if (tournament.players.some(p => p.id === userId)) {
        return await sock.sendMessage(chatId, {
            text: "❌ You've already joined this tournament!"
        }, { quoted: m });
    }
    
    // Check if tournament is full
    if (tournament.players.length >= tournament.playerCount) {
        return await sock.sendMessage(chatId, {
            text: `❌ Tournament is full! (${tournament.playerCount}/${tournament.playerCount} players)`
        }, { quoted: m });
    }
    
    // Add player
    tournament.players.push({
        id: userId,
        name: userName,
        joinedAt: Date.now()
    });
    
    // Update message
    const updatedMessage = `
🏆 *RPS TOURNAMENT* 🏆

*Tournament Details:*
👑 Creator: ${tournament.creatorName}
👥 Players: ${tournament.playerCount} (${tournament.players.length}/${tournament.playerCount} joined)
💰 Entry Fee: ${tournament.entryFee > 0 ? `${tournament.entryFee} points` : 'Free'}
🎁 Prize Pool: ${tournament.prizes.total} points

*Joined Players:*
${tournament.players.map((p, i) => `${i + 1}. ${p.name}`).join('\n')}

*Commands:*
✅ \`.rps tournament join\` - Join tournament
▶️ \`.rps tournament start\` - Start tournament (creator only)
❌ \`.rps tournament leave\` - Leave tournament
📊 \`.rps tournament status\` - Check status

${tournament.players.length === tournament.playerCount ? '✅ *TOURNAMENT IS FULL!*\nCreator can start the tournament now!' : ''}
    `.trim();
    
    try {
        await sock.sendMessage(chatId, {
            text: updatedMessage,
            edit: tournament.messageId,
            mentions: tournament.players.map(p => p.id)
        });
    } catch (error) {
        console.error("Failed to edit tournament message:", error);
    }
    
    await sock.sendMessage(chatId, {
        text: `✅ *${userName} has joined the tournament!*\n(${tournament.players.length}/${tournament.playerCount} players)`,
        mentions: [userId]
    });
}

async function startTournament(sock, m, chatId, userId, userName) {
    // Find tournament in this chat
    let tournament = null;
    let tournamentId = null;
    
    for (const [id, tourney] of rpsTournaments) {
        if (tourney.chatId === chatId && tourney.status === 'registration') {
            tournament = tourney;
            tournamentId = id;
            break;
        }
    }
    
    if (!tournament) {
        return await sock.sendMessage(chatId, {
            text: "❌ No active tournament in this chat!"
        }, { quoted: m });
    }
    
    // Check if user is the creator
    if (tournament.creatorId !== userId) {
        return await sock.sendMessage(chatId, {
            text: "❌ Only the tournament creator can start the tournament!"
        }, { quoted: m });
    }
    
    // Check minimum players (at least 2)
    if (tournament.players.length < 2) {
        return await sock.sendMessage(chatId, {
            text: "❌ Need at least 2 players to start a tournament!"
        }, { quoted: m });
    }
    
    // Start tournament
    tournament.status = 'active';
    tournament.startsAt = Date.now();
    
    // Create bracket
    const bracket = createBracket(tournament.players);
    tournament.bracket = bracket;
    tournament.currentRound = 1;
    
    // Announce first round matches
    const roundMatches = bracket.filter(match => match.round === 1);
    
    let matchesText = "";
    roundMatches.forEach((match, index) => {
        const player1 = tournament.players.find(p => p.id === match.player1Id);
        const player2 = tournament.players.find(p => p.id === match.player2Id);
        matchesText += `Match ${index + 1}: ${player1?.name || 'BYE'} vs ${player2?.name || 'BYE'}\n`;
    });
    
    const message = `
🎬 *TOURNAMENT STARTED!* 🎬

*Round 1 Matches:*
${matchesText}

*How it works:*
1. I will DM each player when it's their match
2. Players reply with their choice (rock/paper/scissors)
3. Winner advances to next round
4. Tournament continues until champion is crowned!

*First matches starting now! Check your DMs!*
    `.trim();
    
    await sock.sendMessage(chatId, {
        text: message,
        mentions: tournament.players.map(p => p.id)
    });
    
    // Start first matches
    await startTournamentRound(sock, tournament, 1);
}

async function startTournamentRound(sock, tournament, round) {
    const matches = tournament.bracket.filter(m => m.round === round && !m.completed);
    
    for (const match of matches) {
        // Skip if player has bye
        if (!match.player1Id || !match.player2Id) {
            match.winnerId = match.player1Id || match.player2Id;
            match.completed = true;
            continue;
        }
        
        // Send DM to both players
        const player1 = tournament.players.find(p => p.id === match.player1Id);
        const player2 = tournament.players.find(p => p.id === match.player2Id);
        
        const dmMessage = `
🏆 *TOURNAMENT MATCH - ROUND ${round}*

You are playing against ${player1.id === match.player1Id ? player2.name : player1.name}

*Reply with your choice:*
• \`rock\` or \`r\` - 🪨 Rock
• \`paper\` or \`p\` - 📄 Paper  
• \`scissors\` or \`s\` - ✂️ Scissors

*You have 2 minutes to choose!*
        `.trim();
        
        await sock.sendMessage(match.player1Id, { text: dmMessage });
        await sock.sendMessage(match.player2Id, { text: dmMessage });
        
        // Store match info for processing choices
        match.status = 'waiting';
        match.startedAt = Date.now();
    }
}

// ============= UTILITY FUNCTIONS =============

function determineWinner(choice1, choice2) {
    if (choice1 === choice2) return 'draw';
    
    const winningConditions = {
        'rock': 'scissors',
        'paper': 'rock',
        'scissors': 'paper'
    };
    
    return winningConditions[choice1] === choice2 ? 'win' : 'lose';
}

function getCounterMove(move) {
    const counters = {
        'rock': 'paper',
        'paper': 'scissors',
        'scissors': 'rock'
    };
    return counters[move] || 'rock';
}

function getResultDescription(choice1, choice2, result) {
    const descriptions = {
        'win': {
            'rock': 'Rock crushes Scissors',
            'paper': 'Paper covers Rock',
            'scissors': 'Scissors cuts Paper'
        },
        'lose': {
            'rock': 'Rock is covered by Paper',
            'paper': 'Paper is cut by Scissors',
            'scissors': 'Scissors are crushed by Rock'
        }
    };
    
    if (result === 'draw') return "Both chose the same!";
    
    return descriptions[result][choice1] || "Game played!";
}

function getMoveEmoji(move) {
    const emojis = {
        'rock': '🪨',
        'paper': '📄',
        'scissors': '✂️'
    };
    return emojis[move] || '🎮';
}

function updateStatsAfterGame(userId, result, move, vsAI) {
    const stats = rpsStats.get(userId);
    
    stats.totalGames++;
    stats.lastPlayed = Date.now();
    
    if (result === 'win') {
        stats.wins++;
        stats.winStreak++;
        stats.maxWinStreak = Math.max(stats.maxWinStreak, stats.winStreak);
        stats.totalPoints += 10;
        
        if (vsAI) {
            stats.vsAI.wins++;
        } else {
            stats.vsHuman.wins++;
        }
    } else if (result === 'lose') {
        stats.losses++;
        stats.winStreak = 0;
        
        if (vsAI) {
            stats.vsAI.losses++;
        } else {
            stats.vsHuman.losses++;
        }
    } else {
        stats.draws++;
        stats.winStreak = 0;
        
        if (vsAI) {
            stats.vsAI.draws++;
        } else {
            stats.vsHuman.draws++;
        }
    }
    
    if (move && stats.byMove[move] !== undefined) {
        stats.byMove[move]++;
    }
    
    // Check for achievements
    checkAchievements(userId, stats);
}

function checkAchievements(userId, stats) {
    const achievements = [];
    
    if (stats.totalGames >= 1 && !stats.achievements.includes('first_game')) {
        achievements.push('first_game');
    }
    
    if (stats.wins >= 10 && !stats.achievements.includes('ten_wins')) {
        achievements.push('ten_wins');
    }
    
    if (stats.winStreak >= 5 && !stats.achievements.includes('five_streak')) {
        achievements.push('five_streak');
    }
    
    if (stats.totalGames >= 100 && !stats.achievements.includes('centurion')) {
        achievements.push('centurion');
    }
    
    if (stats.byMove.rock >= 50 && !stats.achievements.includes('rock_king')) {
        achievements.push('rock_king');
    }
    
    if (stats.byMove.paper >= 50 && !stats.achievements.includes('paper_master')) {
        achievements.push('paper_master');
    }
    
    if (stats.byMove.scissors >= 50 && !stats.achievements.includes('scissors_expert')) {
        achievements.push('scissors_expert');
    }
    
    if (achievements.length > 0) {
        stats.achievements.push(...achievements);
        // In production, you'd notify the user about new achievements
    }
}

function updateRPSLeaderboard(winnerId, winnerName, loserId) {
    // Update winner
    const winnerEntry = rpsLeaderboard.get(winnerId) || {
        name: winnerName,
        wins: 0,
        losses: 0,
        rating: 1000,
        streak: 0
    };
    
    winnerEntry.wins++;
    winnerEntry.streak = Math.max(winnerEntry.streak, winnerEntry.streak + 1);
    winnerEntry.rating += 25;
    rpsLeaderboard.set(winnerId, winnerEntry);
    
    // Update loser
    const loserEntry = rpsLeaderboard.get(loserId) || {
        name: 'Unknown',
        wins: 0,
        losses: 0,
        rating: 1000,
        streak: 0
    };
    
    loserEntry.losses++;
    loserEntry.streak = 0;
    loserEntry.rating = Math.max(800, loserEntry.rating - 15);
    rpsLeaderboard.set(loserId, loserEntry);
    
    // Keep only top 100 players
    const sorted = Array.from(rpsLeaderboard.entries())
        .sort((a, b) => b[1].rating - a[1].rating)
        .slice(0, 100);
    
    rpsLeaderboard.clear();
    for (const [id, data] of sorted) {
        rpsLeaderboard.set(id, data);
    }
}

function createBracket(players) {
    const bracket = [];
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
    
    let round = 1;
    let currentPlayers = shuffledPlayers;
    
    while (currentPlayers.length > 1) {
        const matches = [];
        
        for (let i = 0; i < currentPlayers.length; i += 2) {
            const match = {
                round,
                player1Id: currentPlayers[i]?.id,
                player2Id: currentPlayers[i + 1]?.id,
                winnerId: null,
                completed: false
            };
            
            // If odd number of players, give bye
            if (!match.player2Id) {
                match.winnerId = match.player1Id;
                match.completed = true;
            }
            
            matches.push(match);
        }
        
        bracket.push(...matches);
        round++;
        
        // For next round, winners advance
        currentPlayers = matches.map(m => ({ 
            id: m.winnerId || m.player1Id,
            name: 'Winner' 
        })).filter(p => p.id);
    }
    
    return bracket;
}

function calculatePrizes(playerCount, entryFee) {
    const totalPool = playerCount * entryFee;
    
    return {
        total: totalPool,
        first: Math.floor(totalPool * 0.5),
        second: Math.floor(totalPool * 0.3),
        third: Math.floor(totalPool * 0.1)
    };
}

// ============= INFO COMMANDS =============

async function showRPSHelp(sock, m, chatId) {
    const helpText = `╭─⌈ 🎮 *ROCK PAPER SCISSORS* ⌋
│
├─⊷ *.rps rock / r*
│  └⊷ Play Rock vs AI
│
├─⊷ *.rps paper / p*
│  └⊷ Play Paper vs AI
│
├─⊷ *.rps scissors / s*
│  └⊷ Play Scissors vs AI
│
├─⊷ *.rps challenge @user [bet]*
│  └⊷ Challenge another player
│
├─⊷ *.rps accept / decline / cancel*
│  └⊷ Manage challenges
│
├─⊷ *.rps tournament create 8 10*
│  └⊷ Create 8-player tournament (10pt entry)
│
├─⊷ *.rps tournament join / start / status / leave*
│  └⊷ Tournament management
│
├─⊷ *.rps stats*
│  └⊷ Your personal statistics
│
├─⊷ *.rps leaderboard*
│  └⊷ Global rankings
│
├─⊷ *.rps history*
│  └⊷ Your match history
│
├─⊷ *.rps rules*
│  └⊷ Game rules
│
├─⊷ 🎯 Tournament sizes: 4, 8, 16, or 32 players
├─⊷ ⏱️ Time: 60s per move, 2min for tournaments
│
╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;
    
    await sock.sendMessage(chatId, { text: helpText }, { quoted: m });
}

async function showRPSRules(sock, m, chatId) {
    const rulesText = `╭─⌈ 📜 *RPS RULES* ⌋
│
├─⊷ 🪨 Rock crushes ✂️ Scissors
├─⊷ 📄 Paper covers 🪨 Rock
├─⊷ ✂️ Scissors cuts 📄 Paper
├─⊷ Same choice = Draw
│
├─⊷ *How to Play:*
│  └⊷ .rps challenge @user → accept → choose in DM → result in group
│
├─⊷ *Multiplayer:*
│  └⊷ 60s per choice, bets optional, forfeit on timeout
│
├─⊷ *Tournaments:*
│  └⊷ Single elimination, top 3 prizes, 2min per match
│
├─⊷ *Points:*
│  └⊷ AI win +10 │ Human win +25 │ Loss -15 │ Draw ±0
│
├─⊷ *Achievements:* 🎮 First Game │ 🏆 10 Wins │ 🔥 5 Streak │ 🎯 100 Games
│
╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;
    
    await sock.sendMessage(chatId, { text: rulesText }, { quoted: m });
}

async function showRPSStats(sock, m, chatId, userId, userName) {
    const stats = rpsStats.get(userId) || {
        totalGames: 0, wins: 0, losses: 0, draws: 0,
        winStreak: 0, maxWinStreak: 0, totalPoints: 0,
        achievements: [], lastPlayed: 0,
        vsAI: { wins: 0, losses: 0, draws: 0 },
        vsHuman: { wins: 0, losses: 0, draws: 0 },
        byMove: { rock: 0, paper: 0, scissors: 0 }
    };
    
    const winRate = stats.totalGames > 0 ? 
        Math.round((stats.wins / stats.totalGames) * 100) : 0;
    
    const mostUsedMove = Object.entries(stats.byMove)
        .sort((a, b) => b[1] - a[1])[0] || ['none', 0];
    
    const statsText = `
📊 *RPS STATISTICS - ${userName}* 📊

*Overall Stats:*
🎮 Total Games: ${stats.totalGames}
🏆 Wins: ${stats.wins} (${winRate}%)
😢 Losses: ${stats.losses}
🤝 Draws: ${stats.draws}
🔥 Current Win Streak: ${stats.winStreak}
🔥 Max Win Streak: ${stats.maxWinStreak}
⭐ Total Points: ${stats.totalPoints}

*Vs AI:*
🤖 Wins: ${stats.vsAI.wins}
🤖 Losses: ${stats.vsAI.losses}
🤖 Draws: ${stats.vsAI.draws}

*Vs Humans:*
👤 Wins: ${stats.vsHuman.wins}
👤 Losses: ${stats.vsHuman.losses}
👤 Draws: ${stats.vsHuman.draws}

*Move Usage:*
🪨 Rock: ${stats.byMove.rock} (${stats.totalGames > 0 ? Math.round((stats.byMove.rock / stats.totalGames) * 100) : 0}%)
📄 Paper: ${stats.byMove.paper} (${stats.totalGames > 0 ? Math.round((stats.byMove.paper / stats.totalGames) * 100) : 0}%)
✂️ Scissors: ${stats.byMove.scissors} (${stats.totalGames > 0 ? Math.round((stats.byMove.scissors / stats.totalGames) * 100) : 0}%)

*Most Used:* ${mostUsedMove[0].toUpperCase()}

*Achievements:* ${stats.achievements.length > 0 ? stats.achievements.map(a => `• ${a.replace(/_/g, ' ').toUpperCase()}`).join('\n') : 'None yet!'}

${stats.lastPlayed ? `*Last Played:* ${new Date(stats.lastPlayed).toLocaleString()}` : ''}

*Keep playing to improve your stats!*
    `.trim();
    
    await sock.sendMessage(chatId, { text: statsText }, { quoted: m });
}

async function showRPSLeaderboard(sock, m, chatId) {
    const allPlayers = Array.from(rpsLeaderboard.entries())
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 15);
    
    let leaderboardText = `🏆 *RPS GLOBAL LEADERBOARD* 🏆\n\n`;
    
    if (allPlayers.length === 0) {
        leaderboardText += "No ranked players yet! Play vs humans to get ranked!";
    } else {
        for (let i = 0; i < allPlayers.length; i++) {
            const player = allPlayers[i];
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
            const winRate = player.wins + player.losses > 0 ? 
                Math.round((player.wins / (player.wins + player.losses)) * 100) : 0;
            
            leaderboardText += `${medal} *${player.name}*\n`;
            leaderboardText += `   📈 Rating: ${player.rating} | 🏆 ${player.wins}W ${player.losses}L (${winRate}%)`;
            leaderboardText += ` | 🔥 ${player.streak} streak\n\n`;
        }
    }
    
    leaderboardText += `\n*Play \`.rps challenge @friend\` to get ranked!*`;
    
    await sock.sendMessage(chatId, { text: leaderboardText });
}

async function showRPSHistory(sock, m, chatId, userId, userName) {
    // In production, you'd store and retrieve match history
    // For now, show basic stats
    
    const stats = rpsStats.get(userId) || {
        totalGames: 0, wins: 0, losses: 0, draws: 0
    };
    
    const historyText = `
📜 *MATCH HISTORY - ${userName}* 📜

*Recent Activity:*
🎮 Total Matches: ${stats.totalGames}
🏆 Wins: ${stats.wins}
😢 Losses: ${stats.losses}
🤝 Draws: ${stats.draws}

*Last 5 Matches:* (Feature coming soon!)

*To see detailed history, play more matches!*

*Tip:* Challenge different players to build your match history!
    `.trim();
    
    await sock.sendMessage(chatId, { text: historyText }, { quoted: m });
}

async function showTournamentHelp(sock, m, chatId) {
    const helpText = `╭─⌈ 🏆 *RPS TOURNAMENT* ⌋
│
├─⊷ *.rps tournament create 8*
│  └⊷ Create 8-player free tournament
│
├─⊷ *.rps tournament create 16 10*
│  └⊷ 16 players, 10 point entry fee
│
├─⊷ *.rps tournament join*
│  └⊷ Join active tournament
│
├─⊷ *.rps tournament leave*
│  └⊷ Leave tournament
│
├─⊷ *.rps tournament start*
│  └⊷ Start tournament (creator only)
│
├─⊷ *.rps tournament cancel*
│  └⊷ Cancel tournament (creator only)
│
├─⊷ *.rps tournament status / list*
│  └⊷ Check status or list tournaments
│
├─⊷ *Rules:* Single elimination, 2-32 players, 2min per match
├─⊷ *Prizes:* 1st 50% │ 2nd 30% │ 3rd-4th 10% each
│
╰⊷ *Powered by ${getOwnerName().toUpperCase()} TECH*`;
    
    await sock.sendMessage(chatId, { text: helpText }, { quoted: m });
}

async function showTournamentStatus(sock, m, chatId) {
    // Find tournament in this chat
    let tournament = null;
    
    for (const [id, tourney] of rpsTournaments) {
        if (tourney.chatId === chatId) {
            tournament = tourney;
            break;
        }
    }
    
    if (!tournament) {
        return await sock.sendMessage(chatId, {
            text: "❌ No active tournament in this chat!"
        }, { quoted: m });
    }
    
    let statusText = "";
    
    if (tournament.status === 'registration') {
        statusText = `*Status:* 🟡 REGISTRATION OPEN\n*Players:* ${tournament.players.length}/${tournament.playerCount}`;
    } else if (tournament.status === 'active') {
        statusText = `*Status:* 🟢 TOURNAMENT ACTIVE\n*Current Round:* ${tournament.currentRound}`;
    } else if (tournament.status === 'completed') {
        statusText = `*Status:* 🏆 COMPLETED`;
    }
    
    const message = `
🏆 *TOURNAMENT STATUS* 🏆

${statusText}

*Details:*
👑 Creator: ${tournament.creatorName}
👥 Size: ${tournament.playerCount} players
💰 Entry: ${tournament.entryFee > 0 ? `${tournament.entryFee} points` : 'Free'}
🎁 Prize Pool: ${tournament.prizes.total} points

*Players Joined (${tournament.players.length}):*
${tournament.players.map((p, i) => `${i + 1}. ${p.name}`).join('\n')}

${tournament.status === 'registration' ? `\n*Join with:* \`.rps tournament join\`` : ''}
    `.trim();
    
    await sock.sendMessage(chatId, { 
        text: message,
        mentions: tournament.players.map(p => p.id)
    });
}

async function leaveTournament(sock, m, chatId, userId, userName) {
    // Find tournament in this chat
    let tournament = null;
    let tournamentId = null;
    
    for (const [id, tourney] of rpsTournaments) {
        if (tourney.chatId === chatId && tourney.status === 'registration') {
            tournament = tourney;
            tournamentId = id;
            break;
        }
    }
    
    if (!tournament) {
        return await sock.sendMessage(chatId, {
            text: "❌ No active tournament in this chat or tournament has already started!"
        }, { quoted: m });
    }
    
    // Check if user is in tournament
    const playerIndex = tournament.players.findIndex(p => p.id === userId);
    if (playerIndex === -1) {
        return await sock.sendMessage(chatId, {
            text: "❌ You're not in this tournament!"
        }, { quoted: m });
    }
    
    // Remove player
    tournament.players.splice(playerIndex, 1);
    
    await sock.sendMessage(chatId, {
        text: `👋 *${userName} has left the tournament.*\n(${tournament.players.length}/${tournament.playerCount} players remaining)`,
        mentions: [userId]
    });
    
    // Update tournament message
    const updatedMessage = `
🏆 *RPS TOURNAMENT* 🏆

*Tournament Details:*
👑 Creator: ${tournament.creatorName}
👥 Players: ${tournament.playerCount} (${tournament.players.length}/${tournament.playerCount} joined)
💰 Entry Fee: ${tournament.entryFee > 0 ? `${tournament.entryFee} points` : 'Free'}
🎁 Prize Pool: ${tournament.prizes.total} points

*Joined Players:*
${tournament.players.map((p, i) => `${i + 1}. ${p.name}`).join('\n')}

*Commands:*
✅ \`.rps tournament join\` - Join tournament
▶️ \`.rps tournament start\` - Start tournament (creator only)
❌ \`.rps tournament leave\` - Leave tournament
📊 \`.rps tournament status\` - Check status
    `.trim();
    
    try {
        await sock.sendMessage(chatId, {
            text: updatedMessage,
            edit: tournament.messageId,
            mentions: tournament.players.map(p => p.id)
        });
    } catch (error) {
        console.error("Failed to edit tournament message:", error);
    }
}

async function cancelTournament(sock, m, chatId, userId, userName) {
    // Find tournament in this chat
    let tournament = null;
    let tournamentId = null;
    
    for (const [id, tourney] of rpsTournaments) {
        if (tourney.chatId === chatId && tourney.status === 'registration') {
            tournament = tourney;
            tournamentId = id;
            break;
        }
    }
    
    if (!tournament) {
        return await sock.sendMessage(chatId, {
            text: "❌ No active tournament in this chat!"
        }, { quoted: m });
    }
    
    // Check if user is the creator
    if (tournament.creatorId !== userId) {
        return await sock.sendMessage(chatId, {
            text: "❌ Only the tournament creator can cancel the tournament!"
        }, { quoted: m });
    }
    
    rpsTournaments.delete(tournamentId);
    
    await sock.sendMessage(chatId, {
        text: `🚫 *TOURNAMENT CANCELLED*\n\nTournament created by ${userName} has been cancelled.`,
        mentions: tournament.players.map(p => p.id)
    });
}

async function listTournaments(sock, m, chatId) {
    const tournaments = Array.from(rpsTournaments.values())
        .filter(t => t.status === 'registration')
        .slice(0, 5);
    
    if (tournaments.length === 0) {
        return await sock.sendMessage(chatId, {
            text: "ℹ️ No active tournaments open for registration."
        }, { quoted: m });
    }
    
    let listText = `🏆 *ACTIVE TOURNAMENTS* 🏆\n\n`;
    
    tournaments.forEach((tourney, index) => {
        listText += `*${index + 1}. ${tourney.creatorName}'s Tournament*\n`;
        listText += `   👥 ${tourney.players.length}/${tourney.playerCount} players\n`;
        listText += `   💰 ${tourney.entryFee > 0 ? `${tourney.entryFee} pts` : 'Free'}\n`;
        listText += `   🎁 Prize: ${tourney.prizes.total} points\n\n`;
    });
    
    listText += `*Join with:* \`.rps tournament join\`\n*Create with:* \`.rps tournament create 8\``;
    
    await sock.sendMessage(chatId, { text: listText });
}

// ============= DATA PERSISTENCE =============

async function saveRPSStats() {
    const data = {
        rpsStats: Array.from(rpsStats.entries()),
        rpsLeaderboard: Array.from(rpsLeaderboard.entries()),
        timestamp: Date.now()
    };
    
    try {
        await supabase.setConfig('game_rps_data', data);
    } catch (error) {
        console.error("Failed to save RPS stats:", error);
    }
}

async function loadRPSStats() {
    try {
        const parsed = supabase.getConfigSync('game_rps_data', null);
        if (!parsed) return;
        
        // Load stats
        for (const [userId, stats] of parsed.rpsStats) {
            rpsStats.set(userId, stats);
        }
        
        // Load leaderboard
        for (const [userId, playerData] of parsed.rpsLeaderboard) {
            rpsLeaderboard.set(userId, playerData);
        }
        
        globalThis._wolfSysStats = globalThis._wolfSysStats || {};
        globalThis._wolfSysStats.rpsPlayers = rpsStats.size;
    } catch (error) {
        console.log("No RPS stats found, starting fresh");
    }
}

// Cleanup expired challenges every minute
setInterval(() => {
    const now = Date.now();
    
    for (const [challengeId, challenge] of rpsChallenges) {
        if (challenge.status === 'pending' && now > challenge.expiresAt) {
            rpsChallenges.delete(challengeId);
        }
    }
}, 60000);

// Initialize
loadRPSStats();
setInterval(saveRPSStats, 300000); // Save every 5 minutes