// Refer to https://docs.google.com/document/d/1wyxnD5Khig2h3sQIXt755d7jGEreOYbWXhiSe4PBvhU/edit
import { Game } from './game';
import { Player } from './player';
import { Message } from 'discord.js';
import { GameRole } from './enums';

const Discord = require('discord.js')
const client = new Discord.Client();

// thanks stackoverflow
function shuffle(a) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a;
}

var game: Game;

const minNumOfPlayers = 6;

if(process.env.NODE_ENV !== 'production'){
    require('dotenv').config();
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.username}`);
});

client.on('message', (msg: Message) => {
    var args = msg.content.split(" ");

    switch(args[0]) {
        case "!startgame":
            if(msg.author.discriminator == "5612"){ // TO-DO: make a proper start game system
                if(msg.guild.memberCount - 1 >= 6){ // Check if there are more than 6 players (bot is included in guild.memberCount)

                    // Role Frequency Calculation
                    // TO-DO (low priority): change role frequency calculation? (maybe?)
                    var mafia = 1 + Math.floor((msg.guild.memberCount - 1 - minNumOfPlayers) / 2);
                    var detectives = (mafia > 1) ? mafia - 1 : 1;
                    var healers = (detectives > 1) ? detectives - 1 : 1;
                    var towns = msg.guild.memberCount - 1 - (mafia + detectives + healers);

                    var roleFrequency = [mafia, detectives, healers, towns];

                    var memberArray = msg.guild.members.array();
                    
                    // remove bot from member array
                    var index = memberArray.indexOf(msg.guild.me);
                    if (index > -1) {
                        memberArray.splice(index, 1);
                    }
                    memberArray = shuffle(memberArray);

                    var playerArray: Player[] = [];

                    for(var i = 0; i < memberArray.length; i++){
                        playerArray.push(new Player(memberArray[i],
                            (i < roleFrequency[0]) ? GameRole.MAFIA
                            : (i < roleFrequency[1] + roleFrequency[0]) ? GameRole.DETECTIVE
                            : (i < roleFrequency[2] + roleFrequency[0] + roleFrequency[1]) ? GameRole.HEALER
                            : GameRole.TOWNSPERSON
                        ));
                    }

                    var debugString = "debug:\n";
                    for(let a = 0; a < playerArray.length; a++){
                        debugString += `[${playerArray[a].guildMember.displayName}, role: ${playerArray[a].role.toString()}]\n`;
                    }
                    msg.channel.send(debugString);

                    game = new Game(client, playerArray, msg.guild);
                }
            }
            break;
        case "!debug":
            switch(args[1]){
                case "test":
                    msg.channel.send("test");
                break;
                case "deleteGameChannels":
                    msg.guild.channels.forEach((channel, key, map) => {
                        if(channel.name == "lobby" || channel.name == "bot-debug" || channel.name == "bot-roadmap"){
                            console.log(`not deleting ${channel.name}`);
                        } else {
                            channel.delete();
                        }
                    });
                break;
                case "resetRoles":
                    msg.guild.members.array().forEach(member => {
                        if(member != msg.guild.me){
                            member.removeRoles(member.roles);
                        }
                    });
                break;
            }
            break;
    }
});

client.login(process.env.BOT_TOKEN);