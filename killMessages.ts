import { Player } from "./player";
import { GameRole } from "./enums";

function generateMessage(player: Player, wasHealed: boolean){
    var playerUsername = player.guildMember.user.username;
    var playerRole = GameRole[player.role].toLowerCase();

    if(playerRole == "mafia"){
        playerRole = "member of the Mafia";
    }

    if (!wasHealed) {
        const killMessages = [
            `**${playerUsername}** was found dead in his home. He was a **${playerRole}**.`,
            `**${playerUsername}** slipped on a carefully placed banana peel last night. They were a **${playerRole}**.`,
            `**${playerUsername}** picked up a ringing phone last night and was called "gay". This **${playerRole}** was found dead today due to suicide.`,
            `**${playerUsername}** is very lucky to get an uncreative kill message. They were a **${playerRole}**.`,
            `**${playerUsername}** took it too hard to the ass. They were a **${playerRole}**.`,
            `**${playerUsername}** thought Sean needed to make better kill messages, and thus karma struck. They were a **${playerRole}**.`,
            `**${playerUsername}** died uwu!!!11 uwu owo uwu they were a **${playerRole}** uwuuu!`,
            `**${playerUsername}** was unable to handle the watermelon shoved into his dickhole. They were a **${playerRole}**.`,
            `**${playerUsername}** was found dead with a pair of chopsticks in his eyes. They were a **${playerRole}**.`
        ];
        return killMessages[Math.floor(Math.random() * killMessages.length)];
    } else {
        const healMessages = [
            `**${playerUsername}** was attacked, but was then saved by a healer!`,
            `**${playerUsername}** was attacked and stuff but then he got touched a lot by some doctor person so he's good now`
        ];
        return healMessages[Math.floor(Math.random() * healMessages.length)];
    }
}

export { generateMessage };