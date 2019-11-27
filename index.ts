// Refer to https://docs.google.com/document/d/1wyxnD5Khig2h3sQIXt755d7jGEreOYbWXhiSe4PBvhU/edit
import { Game } from './game';
import { Player } from './player';
import { Message, TextChannel, GuildMember } from 'discord.js';
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

var game: Game | undefined = undefined;

var currentlyInGame: GuildMember[] = [];
var queue: {player: GuildMember, ready: boolean}[] = [];

const minNumOfPlayers = 6;

if(process.env.NODE_ENV !== 'production'){
    require('dotenv').config();
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.username}`);
});

client.on('message', (msg: Message) => {
    var args = msg.content.split(" ");

    if(msg.content.startsWith("!")){
        if(game == undefined || game.isFinished || (currentlyInGame.find(member => member.user == msg.author) && !game.isFinished)){
            switch(args[0]) {
                case "!startgame":
                    if(queue.length >= 6){ // Check if there are more than 6 players (bot is included in guild.memberCount)
                        if(queue.filter(player => player.ready == false).length == 0){
                            currentlyInGame = [];
                            var lobbyChannel: TextChannel = <TextChannel> msg.guild.channels.find(channel => channel.name == "lobby");
                            lobbyChannel.send("The game is starting! Please wait a couple seconds until the server is finished setting up...");

                            // Role Frequency Calculation
                            // TO-DO (low priority): change role frequency calculation? (maybe?)
                            var mafia = 1 + Math.floor((queue.length - minNumOfPlayers) / 2);
                            var detectives = (mafia > 1) ? mafia - 1 : 1;
                            var healers = (detectives > 1) ? detectives - 1 : 1;
                            var towns = queue.length - (mafia + detectives + healers);

                            var roleFrequency = [mafia, detectives, healers, towns];

                            var memberArray = queue;
                            memberArray = shuffle(memberArray);

                            var playerArray: Player[] = [];

                            for(var i = 0; i < memberArray.length; i++){
                                playerArray.push(new Player(memberArray[i].player,
                                    (i < roleFrequency[0]) ? GameRole.MAFIA
                                    : (i < roleFrequency[1] + roleFrequency[0]) ? GameRole.DETECTIVE
                                    : (i < roleFrequency[2] + roleFrequency[0] + roleFrequency[1]) ? GameRole.HEALER
                                    : GameRole.TOWNSPERSON
                                ));
                            }

                            /*var debugString = "debug:\n";
                            for(let a = 0; a < playerArray.length; a++){
                                debugString += `[${playerArray[a].guildMember.displayName}, role: ${playerArray[a].role.toString()}]\n`;
                            }
                            msg.channel.send(debugString);*/

                            playerArray = shuffle(playerArray);

                            game = new Game(client, playerArray, msg.guild);

                            queue.forEach(element => {
                                currentlyInGame.push(element.player);
                            });
                            queue = [];
                        } else {
                            msg.channel.send("All players in the queue must be ready to start a game! Type `!ready` if you haven't already!");
                        }
                    } else {
                        msg.channel.send("There must be 6 or more players in the queue to start a game!");
                    }
                    break;
                case "!debug":
                    switch(args[1]){
                        case "test":
                            msg.channel.send("test");
                        break;
                        case "deleteGameChannels":
                            msg.guild.channels.forEach((channel, key, map) => {
                                if(channel.name == "lobby" || channel.name == "bot-debug" || channel.name == "bot-roadmap" || channel.type == "category" || channel.type == "voice"){
                                    console.log(`not deleting ${channel.name}`);
                                } else {
                                    channel.delete();
                                }
                            });
                        break;
                        case "resetMembers":
                            msg.guild.members.array().forEach(member => {
                                if(member != msg.guild.me){
                                    member.removeRoles(member.roles);
                                    member.setNickname("");
                                }
                            });
                        break;
                        case "sendMsgTest":
                            var channel : TextChannel = <TextChannel> msg.guild.channels.find(channel => channel.name == "bot-debug");
                            channel.send("test");
                        break;
                    }
                break;
                case "!join":
                    if(queue.find(player => player.player == msg.member) == undefined){
                        queue.push({
                            player: msg.member,
                            ready: false
                        });
                        msg.member.setRoles([msg.guild.roles.find(role => role.name == "In Queue")]);
                        msg.channel.send(`${msg.author.username}, you have been added to the queue. Type \`!ready\` to ready up, and type \`!startgame\` once everybody is ready! If you would like the leave the queue, type \`!leave\``);
                        msg.member.setNickname(`✗ | ${msg.author.username}`);
                    } else {
                        msg.channel.send("You are already in the queue.");
                    }
                break;
                case "!ready":
                    var playerInQueue = queue.find(player => player.player == msg.member);
                    var lobbyChannel: TextChannel = <TextChannel> msg.guild.channels.find(channel => channel.name == "lobby");
                    if(playerInQueue != undefined){
                        queue.find(player => player.player == msg.member).ready = !queue.find(player => player.player == msg.member).ready;
                        if(playerInQueue.ready){
                            msg.member.setNickname(`✓ | ${msg.author.username}`);
                            lobbyChannel.send(`${msg.author.username} is ready! Type \`!ready\` again if you still aren't ready.`);
                        } else {
                            msg.member.setNickname(`✗ | ${msg.author.username}`);
                            lobbyChannel.send(`${msg.author.username} is no longer ready. Type \`!ready\` again once you're ready!`);
                        }
                    } else {
                        msg.channel.send("You are not in the queue. Type `!join` to join!");
                    }
                break;
                case "!leave":
                    if(queue.find(player => player.player == msg.member) != undefined){
                        var memberToSplice = queue.find(player => player.player == msg.member);
                        queue.splice(queue.indexOf(memberToSplice));
                        msg.channel.send(`${msg.author.username} has left the queue. Type \`!join\` if you would like to join!`);
                        msg.member.setNickname("");
                        msg.member.setRoles([]);
                    } else {
                        msg.channel.send("You are not in the queue.");
                    }
                break;
                case "!queue":
                    var queueString = "People in the queue:\n";
                    queue.forEach(player => queueString += `${player.player.user.username}\n`);
                    msg.channel.send(queueString);
                break;
                default:
                    if(game != undefined) game.processMessage(msg);
            }
        } else {
            msg.channel.send("You cannot use commands at this time.");
        }
    }

    if(msg.channel == msg.author.dmChannel){
        if(currentlyInGame.find(player => player.user == msg.author) != undefined && game != undefined && !game.isFinished ){
            game.processMessage(msg);
        } else if (game != undefined && !game.isFinished){
            msg.channel.send("There is a game in progress. You cannot use commands at this time.");
        }
    }
});

client.login(process.env.BOT_TOKEN);