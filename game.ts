import { Player } from './player';
import { GameState, GameRole } from './enums';
import { Client, Guild, TextChannel, ChannelData, Role, ChannelCreationOverwrites, GuildChannel, Message, GuildMember } from 'discord.js';

function wait(seconds){
    return new Promise(resolve => {
        setTimeout(resolve, seconds * 1000);
    });
}

export class Game {
    players: {all: Player[], detectives: Player[], healers: Player[], mafias: Player[]};
    deadPlayers: Player[];
    gameState: GameState;
    serverGuild: Guild;
    textChannels: TextChannel[];
    aliveRole: Role;
    day: number;
    nightActions: {
        kill: {killer: GuildMember, victim: Player}[], 
        heal: {healer: GuildMember, patient: Player}[], 
        investigate: {detective: GuildMember, subject: Player}[]
    }

    constructor(bot: Client, players: Player[], server: Guild){
        this.initializeGame(bot, players, server); // gameLoop will be called within initializeGame()
    }

    initializeGame = async (bot: Client, players: Player[], server: Guild) => {
        // Initialize variables
        this.players = {
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
        this.nightActions = {
            kill: [],
            heal: [],
            investigate: []
        };
        this.day = 1;

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
            this.textChannels["the-central"] = <TextChannel> channel;
        });

        // Set permissions for mafia channel
        var mafiaChannelPermissions : ChannelCreationOverwrites[] = [{
            id: this.serverGuild.id,
            deny: ['VIEW_CHANNEL', 'SEND_MESSAGES']
        }];
        for(let a = 0; a < this.players.mafias.length; a++){
            mafiaChannelPermissions.push({
                id: this.players.mafias[a].guildMember,
                allow: ['SEND_MESSAGES', 'VIEW_CHANNEL']
            });
        }

        await this.serverGuild.createChannel("mafia-discussion", {
            type: "text",
            permissionOverwrites: mafiaChannelPermissions
        }).then(channel => {
            this.textChannels["mafia-discussion"] = <TextChannel> channel;
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

        for(let i = 0; i < this.players.all.length; i++){
            //this.alivePlayers.all[i].guildMember.send("__this is a test. let me know in the mafia minigame server if you see this. - sean__");
            var playerMember = this.players.all[i].guildMember;
            switch(this.players.all[i].role){
                case GameRole.DETECTIVE:
                    await playerMember.send(
                        `${playerMember.displayName}, you are a **DETECTIVE**. You, along with the other townspeople, must kill all members of the Mafia. At night, you may choose one person to investigate.`
                    );
                break;
                case GameRole.HEALER:
                    await playerMember.send(
                        `${playerMember.displayName}, you are a **HEALER**. You, along with the other townspeople, must kill all members of the Mafia. At night, you may choose one person to protect from the Mafia.`
                    );    
                break;
                case GameRole.MAFIA:
                    await playerMember.send(
                        `${playerMember.displayName}, you are part of the **MAFIA**. Please refer to the #mafia-discussion channel in the server for more information.`
                    );
                break;
                case GameRole.TOWNSPERSON:
                    await playerMember.send(
                        `${playerMember.displayName}, you are a **TOWNSPERSON**. You, along with the other townspeople, must kill all members of the Mafia.`
                    );
                break;
            }
        }

        this.gameLoop();
    }

    gameLoop = async () => {

        // Day intro
        this.gameState = GameState.DAY_INTRO;
        this.textChannels["the-central"].send("Welcome! You all have been given your roles through DM.\nTake some time to say hi! **Night will fall in 15 seconds.**");
        await wait(10);
        this.textChannels["the-central"].send("Night will fall in **5 seconds**.");
        await wait(5);
        
        var isGameDone : boolean = false;
        while(!isGameDone){
            this.textChannels[0].replacePermissionOverwrites({
                overwrites: [{
                    id: this.aliveRole,
                    deny: ["SEND_MESSAGES"]
                }]
            });
            this.gameState = GameState.NIGHT;
            this.textChannels["the-central"].send("Good night, everybody! The sun will rise in 20 seconds. If you have a special ability, you can use it through DM.");
            await wait(15);
            this.textChannels["the-central"].send("The sun will rise in **5 seconds**.");
            await wait(5);
        
            this.day++;
            
            // TO-DO: night and day announcement code here

            // check win
            await this.checkWin().then(gameDone => {
               isGameDone = gameDone;
            });
            if(isGameDone) break;
            
        }
        
    }

    checkWin = () => {
        return new Promise<boolean>(async resolve => {
            var innocentsWin : boolean = this.deadPlayers.filter(player => player.role == GameRole.MAFIA).length >= this.players.mafias.length;
            var mafiaWins : boolean = this.deadPlayers.filter(player => player.role != GameRole.MAFIA).length >= this.players.all.filter(player => player.role != GameRole.MAFIA).length;
            if(innocentsWin || mafiaWins){
                resolve(true);
                if(innocentsWin){
                    await this.textChannels["the-central"].send("All Mafia members are dead. **INNOCENTS WIN!**");
                } else if (mafiaWins){
                    await this.textChannels["the-central"].send("All innocents are dead. **MAFIA WINS!**");
                }
                this.textChannels.forEach(channel => {
                    channel.replacePermissionOverwrites({
                        overwrites: [{
                            id: this.serverGuild.id,
                            allow: ["READ_MESSAGES"],
                            deny: ["SEND_MESSAGES"]
                        }]
                    });
                });
                this.players.all.forEach(async member => {
                    if(member.guildMember != this.serverGuild.me){
                        await member.guildMember.removeRoles(member.guildMember.roles);
                    }
                });
            } else {
                resolve(false);
            }
        });
    }

    processMessage = (message: Message) => {

    }
}