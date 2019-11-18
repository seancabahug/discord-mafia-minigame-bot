// Refer to https://docs.google.com/document/d/1wyxnD5Khig2h3sQIXt755d7jGEreOYbWXhiSe4PBvhU/edit
import { Game } from './game';
import { Player } from './player';
import { Message } from 'discord.js';

const Discord = require('discord.js')
const client = new Discord.Client();

var game: Game;

const maxNumOfPlayers = 6;

if(process.env.NODE_ENV !== 'production'){
    require('dotenv').config();
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.username}`);
});

client.on('message', (msg: Message) => {
    if(msg.content == "!startgame"){ // TO-DO: make a proper start game function
        if(msg.guild.memberCount - 1 >= 6){ // Check if there are more than 6 players (bot is included in guild.memberCount)

            // Role Frequency Calculation
            // TO-DO (low priority): change role frequency calculation? (maybe?)
            var mafia = 1 + Math.floor((msg.guild.memberCount - 1) / 2);
            var detectives = (mafia > 1) ? mafia - 1 : 1;
            var healers = (detectives > 1) ? detectives - 1 : 1;
            var towns = msg.guild.memberCount - 1 - (mafia + detectives + healers);

            var roleFrequency = [mafia, detectives, healers, towns];

        }
    } else if(msg.content == "test"){
        console.log(msg.guild.memberCount);
    }
});

client.login(process.env.BOT_TOKEN);