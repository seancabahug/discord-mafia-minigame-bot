import { Player } from './player';
import { GameState, GameRole } from './enums';
import { Client, Guild, TextChannel, ChannelData, Role, ChannelCreationOverwrites, GuildChannel } from 'discord.js';

export class Game {
    alivePlayers: {all: Player[], detectives: Player[], healers: Player[], mafias: Player[]};
    deadPlayers: Player[];
    gameState: GameState;
    serverGuild: Guild;
    textChannels: TextChannel[];
    aliveRole: Role;

    constructor(bot: Client, players: Player[], server: Guild){
        this.initializeGame(bot, players, server);
        this.gameLoop();
    }

    initializeGame = async (bot: Client, players: Player[], server: Guild) => {
        // Initialize variables
        this.alivePlayers = {
            all: players,
            detectives: players.filter(player => player.role == GameRole.DETECTIVE),
            healers: players.filter(player => player.role == GameRole.HEALER),
            mafias: players.filter(player => player.role == GameRole.MAFIA),
        };
        this.deadPlayers = [];
        this.gameState = GameState.INITIALIZING;
        this.serverGuild = server;
        this.textChannels = [];
        this.aliveRole = this.serverGuild.roles.find(role => role.id == "645866489538281473");

        // Reset channels
        this.serverGuild.channels.forEach(async (channel, key, map) => {
            if(channel.name == "lobby" || channel.name == "bot-debug" || channel.name == "bot-roadmap"){
                console.log(`not deleting ${channel.name}`);
            } else {
                await channel.delete();
            }
        });

        // Grant roles / Set up channels
        for(let i = 0; i < players.length; i++){
            await players[i].guildMember.addRole(this.aliveRole);
            await players[i].guildMember.setNickname(`[${i}] ${players[i].guildMember.displayName}`);
        }
        
        // Disable lobby for players
        await this.serverGuild.channels.find(channel => channel.name == "lobby").overwritePermissions(this.aliveRole, {
            VIEW_CHANNEL: false
        });

        // Create the-central + mafia-discussion
        await this.serverGuild.createChannel("the-central", {
            type: "text",
            permissionOverwrites: [
                {
                    id: this.serverGuild.id,
                    allow: ['VIEW_CHANNEL'],
                    deny: ['SEND_MESSAGES']
                },
                {
                    id: this.aliveRole,
                    allow: ['SEND_MESSAGES']
                }
            ]
        }).then(channel => {
            this.textChannels["the-central"] = channel;
        });

        // Set permissions for mafia channel
        var mafiaChannelPermissions : ChannelCreationOverwrites[] = [{
            id: this.serverGuild.id,
            deny: ['VIEW_CHANNEL', 'SEND_MESSAGES']
        }];
        for(let a = 0; a < this.alivePlayers.mafias.length; a++){
            mafiaChannelPermissions.push({
                id: this.alivePlayers.mafias[a].guildMember,
                allow: ['SEND_MESSAGES', 'VIEW_CHANNEL']
            });
        }

        await this.serverGuild.createChannel("mafia-discussion", {
            type: "text",
            permissionOverwrites: mafiaChannelPermissions
        }).then(channel => {
            this.textChannels["mafia-discussion"] = channel;
        });

        // Create other channels made for special roles
        /*var permissions : Map<GameRole, ChannelCreationOverwrites[]> = new Map([ // Establish permissions
            [GameRole.DETECTIVE, [{
                id: this.serverGuild.id,
                deny: ['VIEW_CHANNEL']
            }]],
            [GameRole.MAFIA, [{
                id: this.serverGuild.id,
                deny: ['VIEW_CHANNEL']
            }]],
            [GameRole.HEALER, [{
                id: this.serverGuild.id,
                deny: ['VIEW_CHANNEL']
            }]]
        ]);
        this.alivePlayers.all.forEach(element => { // Assign permissions to players
            var newPermissionObject = permissions.get(element.role)
            newPermissionObject.push({
                id: element.guildMember,
                allow: ['VIEW_CHANNEL', 'SEND_MESSAGES']
            });
            permissions.set(element.role, newPermissionObject);
        });*/

        for(let i = 0; i < this.alivePlayers.all.length; i++){
            //this.alivePlayers.all[i].guildMember.send("__this is a test. let me know in the mafia minigame server if you see this. - sean__");
            switch(this.alivePlayers.all[i].role){
                case GameRole.DETECTIVE:
                    await this.alivePlayers.all[i].guildMember.send(
                        `${this.alivePlayers.all[i].guildMember.displayName}, you are a **DETECTIVE**. You, along with the other townspeople, must kill all members of the Mafia. At night, you may choose one person to investigate.`
                    );
                break;
                case GameRole.HEALER:
                    await this.alivePlayers.all[i].guildMember.send(
                        `${this.alivePlayers.all[i].guildMember.displayName}, you are a **HEALER**. You, along with the other townspeople, must kill all members of the Mafia. At night, you may choose one person to protect from the Mafia.`
                    );    
                break;
                case GameRole.MAFIA:
                    await this.alivePlayers.all[i].guildMember.send(
                        `${this.alivePlayers.all[i].guildMember.displayName}, you are part of the **MAFIA**. Please refer to the #mafia-discussion channel in the server for more information.`
                    );
                break;
                case GameRole.TOWNSPERSON:
                    await this.alivePlayers.all[i].guildMember.send(
                        `${this.alivePlayers.all[i].guildMember.displayName}, you are a **TOWNSPERSON**. You, along with the other townspeople, must kill all members of the Mafia.`
                    );
                break;
            }
        }
    }

    gameLoop = async () => {
        
    }
}