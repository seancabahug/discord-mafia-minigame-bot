import { Player } from './player';
import { GameState, GameRole } from './enums';
import { Client, Guild } from 'discord.js';

const textChannels = {
    
};

export class Game {
    alivePlayers: Player[];
    deadPlayers: Player[];
    gameState: GameState;
    serverGuild: Guild;
    constructor(bot: Client, players: Player[], server: Guild){
        this.alivePlayers = players;
        this.deadPlayers = [];
        this.gameState = GameState.INTIALIZING;
        this.serverGuild = server;

        // Grant roles / Set up channels
        for(var i = 0; i < players.length; i++){
            players[i].guildMember.addRole(this.serverGuild.roles.find(role => role.id == "645866489538281473"));
            
        }
    }
}