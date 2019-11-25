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

        for(let i = 0; i < this.players.all.length; i++){
            //this.alivePlayers.all[i].guildMember.send("__this is a test. let me know in the mafia minigame server if you see this. - sean__");
            var playerMember = this.players.all[i].guildMember;
            switch(this.players.all[i].role){
                case GameRole.DETECTIVE:
                    await playerMember.send(
                        `${playerMember.displayName}, you are a **DETECTIVE**.\n
                        You, along with the other townspeople, must kill all members of the Mafia.\n
                        At night, you may choose one person to investigate.`
                    );
                break;
                case GameRole.HEALER:
                    await playerMember.send(
                        `${playerMember.displayName}, you are a **HEALER**.\n
                        You, along with the other townspeople, must kill all members of the Mafia.\n
                        At night, you may choose one person to protect from the Mafia.`
                    );    
                break;
                case GameRole.MAFIA:
                    await playerMember.send(
                        `${playerMember.displayName}, you are part of the **MAFIA**.\n
                        Please refer to the #mafia-discussion channel in the server for more information.`
                    );
                break;
                case GameRole.TOWNSPERSON:
                    await playerMember.send(
                        `${playerMember.displayName}, you are a **TOWNSPERSON**.\n
                        You, along with the other townspeople, must kill all members of the Mafia.`
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
            this.textChannels["the-central"].send("Good night, everybody! The sun will rise in 20 seconds. If you have a special ability, please refer to DM.");
            this.players.all.forEach(async player => {
                var examplePerson = this.players.all[Math.floor(Math.random() * this.players.all.length)];
                switch(player.role){
                    case GameRole.DETECTIVE:
                        await player.guildMember.send(
                            `Night has fallen. To investigate someone, DM their player ID (the number in the square brackets in their server name).\n
                            For example, to investigate \`${examplePerson.guildMember.nickname}\`, send me \`${this.players.all.indexOf(examplePerson)}\`.\n
                            If you wish to not investigate anyone, don't respond.`
                        );
                    break;
                    case GameRole.HEALER:
                        await player.guildMember.send(
                            `Night has fallen. To heal someone, DM their player ID (the number in the square brackets in their server name).\n
                            For example, to heal \`${examplePerson.guildMember.nickname}\`, send me \`${this.players.all.indexOf(examplePerson)}\`.\n
                            If you wish to not heal anyone, don't respond.`
                        );    
                    break;
                    case GameRole.MAFIA:
                        await player.guildMember.send(
                            `Night has fallen. To kill someone, DM their player ID (the number in the square brackets in their server name).\n
                            For example, to kill \`${examplePerson.guildMember.nickname}\`, send me \`${this.players.all.indexOf(examplePerson)}\`.\n
                            If you wish to not kill anyone, don't respond.`
                        );
                    break;
                }
            });
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

    processMessage = async (message: Message) => {
        if(message.channel == message.author.dmChannel){
            var player = this.players.all.find(player => player.guildMember == message.member);
            if(player != undefined){
                var actionSubject = parseInt(message.content);
                switch(this.gameState){
                    case GameState.NIGHT:
                        if(!isNaN(actionSubject)){
                            if(actionSubject < this.players.all.length && actionSubject >= 0){
                                var playerSubject = this.players.all[actionSubject];
                                switch(player.role){
                                    case GameRole.DETECTIVE:
                                        var investigateObj = this.nightActions.investigate.find(action => action.detective == message.member);
                                        if(investigateObj == undefined){
                                            this.nightActions.investigate.push({
                                                detective: player.guildMember,
                                                subject: playerSubject
                                            });
                                        } else {
                                            this.nightActions.investigate[this.nightActions.investigate.indexOf(investigateObj)] = {
                                                detective: player.guildMember,
                                                subject: playerSubject
                                            };
                                        }
                                        await message.channel.send(`You will be investigating ${playerSubject.guildMember.user.username}. Type \`cancel\` to cancel.`);
                                    break;
                                    case GameRole.HEALER:
                                        var healObj = this.nightActions.heal.find(action => action.healer == message.member);
                                        if(healObj == undefined){
                                            this.nightActions.heal.push({
                                                healer: player.guildMember,
                                                patient: playerSubject
                                            });
                                        } else {
                                            this.nightActions.heal[this.nightActions.heal.indexOf(healObj)] = {
                                                healer: player.guildMember,
                                                patient: playerSubject
                                            };
                                        }
                                        await message.channel.send(`You will be healing ${playerSubject.guildMember.user.username}. Type \`cancel\` to cancel.`);
                                    break;
                                    case GameRole.MAFIA:
                                        var killObj = this.nightActions.kill.find(action => action.killer == message.member);
                                        if(killObj == undefined){
                                            this.nightActions.kill.push({
                                                killer: player.guildMember,
                                                victim: playerSubject
                                            });
                                        } else {
                                            this.nightActions.kill[this.nightActions.kill.indexOf(killObj)] = {
                                                killer: player.guildMember,
                                                victim: playerSubject
                                            };
                                        }
                                        await message.channel.send(`You will be killing ${playerSubject.guildMember.user.username}. Type \`cancel\` to cancel.`);
                                    break;
                                }
                            } else {
                                await message.channel.send("Invalid player ID.");
                            }
                        } else {
                            if(message.content.toLowerCase() == "cancel"){
                                switch(player.role){
                                    case GameRole.DETECTIVE:
                                        var investigate = this.nightActions.investigate;
                                        this.nightActions.investigate.splice(investigate.indexOf(investigate.find(investigate => investigate.detective == message.member)), 1);
                                    break;
                                    case GameRole.HEALER:
                                        var heal = this.nightActions.heal;
                                        this.nightActions.heal.splice(heal.indexOf(heal.find(heal => heal.healer == message.member)), 1);
                                    break;
                                    case GameRole.MAFIA:
                                        var kill = this.nightActions.kill;
                                        this.nightActions.kill.splice(kill.indexOf(kill.find(kill => kill.killer == message.member)), 1);
                                    break;
                                }
                                await message.channel.send("Choice cleared.");
                            } else {
                                await message.channel.send("That is invalid.");
                            }
                        }
                    break;
                }
            }
        }
    }
}