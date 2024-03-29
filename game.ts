import { Player } from './player';
import { GameState, GameRole } from './enums';
import { Client, Guild, TextChannel, ChannelData, Role, ChannelCreationOverwrites, GuildChannel, Message, GuildMember } from 'discord.js';
import { generateMessage } from './killMessages';

function wait(seconds: number){
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
    };
    voting: {
        votes: {voter: GuildMember, voted: Player}[],
        individualVoted: {voted: Player, votes: number}[]
    };
    accuse: {
        accused: Player,
        votes: {
            innocent: GuildMember[],
            guilty: GuildMember[]
        }
    };
    isFinished: boolean;

    constructor(bot: Client, players: Player[], server: Guild){
        // Initialize variables
        this.isFinished = false;
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
        this.voting = {
            votes: [],
            individualVoted: []
        };
        this.accuse = {
            accused: null,
            votes: {
                innocent: [],
                guilty: []
            }
        };
        this.day = 1;

        this.initializeGame(bot, players, server); // gameLoop will be called within initializeGame()
    }

    initializeGame = async (bot: Client, players: Player[], server: Guild) => {
        // Reset channels
        this.serverGuild.channels.forEach(async (channel, key, map) => {
            if(channel.name == "lobby" || channel.name == "bot-debug" || channel.name == "bot-roadmap" || channel.type == "category" || channel.type == "voice"){
                console.log(`not deleting ${channel.name}`);
            } else {
                await channel.delete();
            }
        });

        // Grant roles / Set up channels
        for(let i = 0; i < players.length; i++){
            await players[i].guildMember.setRoles([this.aliveRole]);
            await players[i].guildMember.setNickname(`[${i}] ${players[i].guildMember.user.username}`.substring(0, 30));
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
                        `${playerMember.user.username}, you are a **DETECTIVE**.\n
                        You, along with the other townspeople, must kill all members of the Mafia.\n
                        At night, you may choose one person to investigate.`
                    );
                break;
                case GameRole.HEALER:
                    await playerMember.send(
                        `${playerMember.user.username}, you are a **HEALER**.\n
                        You, along with the other townspeople, must kill all members of the Mafia.\n
                        At night, you may choose one person to protect from the Mafia.`
                    );    
                break;
                case GameRole.MAFIA:
                    await playerMember.send(
                        `${playerMember.user.username}, you are part of the **MAFIA**.\n
                        Please refer to the #mafia-discussion channel in the server for more information.`
                    );
                break;
                case GameRole.TOWNSPERSON:
                    await playerMember.send(
                        `${playerMember.user.username}, you are a **TOWNSPERSON**.\n
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
        this.textChannels["the-central"].send("Welcome! You all have been given your roles through DM.\nTake some time to say hi! **Night will fall in 30 seconds.**");
        await wait(25);
        this.textChannels["the-central"].send("Night will fall in **5 seconds**.");
        await wait(5);
        
        var isGameDone : boolean = false;
        while(!isGameDone){ // Game loop!
            
            // Night time!
            this.gameState = GameState.NIGHT;
            await this.textChannels["the-central"].replacePermissionOverwrites({ // Remove message sending perms from #the-central
                overwrites: [
                    {
                        id: this.aliveRole,
                        deny: ["SEND_MESSAGES"]
                    },
                    {
                        id: this.serverGuild.id,
                        deny: ['SEND_MESSAGES']
                    }
                ]
            });
            await this.textChannels["the-central"].send("Good night, everybody! The sun will rise in 60 seconds. If you have a special ability, please refer to DM.");
            this.players.all.forEach(async player => {
                if(player.isAlive){
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
                }
            });
            await wait(55);
            this.textChannels["the-central"].send("The sun will rise in **5 seconds**.");
            await wait(5);
        
            this.day++;

            // Day announcements!
            this.gameState = GameState.DAY_ANNOUNCEMENTS;

            // Tell investigators the roles of the investigatee (is that the right word?)
            this.nightActions.investigate.forEach(async action => {

                var filteredMafia = this.players.all.filter(player => player.role != GameRole.MAFIA);
                var innoRole = filteredMafia[Math.floor(Math.random() * filteredMafia.length)].role;
                await action.detective.send(`Your investigation last night has concluded that **${action.subject.guildMember.user.username}** is EITHER a member of the Mafia or a **${(action.subject.role != GameRole.MAFIA) ? GameRole[action.subject.role] : GameRole[innoRole]}**. 
                ᵖˡᵉᵃˢᵉ ᵈᵒⁿ'ᵗ ˢᵉⁿᵈ ˢᶜʳᵉᵉⁿˢʰᵒᵗˢ ᵗᵒ ᵒᵗʰᵉʳ ᵖᵉᵒᵖˡᵉ ᵇᵉᶜᵃᵘˢᵉ ᶦᵗ ᵐᵃᵏᵉˢ ᵗʰᵉ ᵍᵃᵐᵉ ˡᵉˢˢ ᶠᵘⁿ`);
            });

            await this.textChannels["the-central"].send(`Good morning everybody @here! It is day ${this.day}.`);
            await wait(3);
            this.nightActions.kill.forEach(async element => {
                if(this.nightActions.heal.find(action => action.patient == element.victim) == undefined){
                    this.deadPlayers.push(element.victim);
                    element.victim.isAlive = false;
                    element.victim.guildMember.setRoles([]);
                    await this.textChannels["the-central"].send(generateMessage(element.victim, false));
                } else {
                    await this.textChannels["the-central"].send(generateMessage(element.victim, true));
                }
                wait(5);
            });

            // check win
            await this.checkWin().then(gameDone => {
               this.isFinished = gameDone;
            });
            if(this.isFinished) break;

            // Reset night actions
            this.nightActions = {
                kill: [],
                investigate: [],
                heal: []
            };

            await this.textChannels["the-central"].replacePermissionOverwrites({ // Allow message sending perms from #the-central
                overwrites: [
                    {
                        id: this.aliveRole,
                        allow: ["SEND_MESSAGES"]
                    },
                    {
                        id: this.serverGuild.id,
                        deny: ["SEND_MESSAGES"]
                    }
                ]
            });
            
            this.gameState = GameState.DAY_DISCUSSION;
            await this.textChannels["the-central"].send("Everyone is out of bed! You all have **75 seconds** until votes may be made for trial.");
            await wait(55);
            await this.textChannels["the-central"].send("Voting will begin in **10 seconds**.");
            await wait(5);
            await this.textChannels["the-central"].send("Voting will begin in **5 seconds**.");
            await wait(5);
            
            this.gameState = GameState.DAY_TRIAL_DECISION;
            await this.textChannels["the-central"].send("You have 40 seconds to vote.\nType `!vote <Player ID>` to accuse somebody.\nFor example, to accuse `[2] John Smith`, type `!vote 2`");
            await wait(35);
            await this.textChannels["the-central"].send("You have 5 seconds to vote.");
            await wait(5);

            await this.textChannels["the-central"].replacePermissionOverwrites({ // Remove message sending perms from #the-central
                overwrites: [
                    {
                        id: this.aliveRole,
                        deny: ["SEND_MESSAGES"]
                    },
                    {
                        id: this.serverGuild.id,
                        deny: ['SEND_MESSAGES']
                    }
                ]
            });
            this.textChannels["the-central"].send("Voting has ended!");

            var mostVotedVote = {voted: null, votes: 0};
            this.voting.individualVoted.forEach(vote => {
                if(vote.votes > mostVotedVote.votes){
                    mostVotedVote = vote;
                } else if (vote.votes == mostVotedVote.votes){
                    mostVotedVote = {
                        voted: null,
                        votes: vote.votes
                    };
                }
            });

            this.voting = {
                votes: [],
                individualVoted: []
            };

            if(mostVotedVote.voted != null){
                // Day trial statement!
                this.gameState = GameState.DAY_TRIAL_STATEMENT;
                
                this.accuse.accused = mostVotedVote.voted;
                
                await this.textChannels["the-central"].replacePermissionOverwrites({
                    overwrites: [
                        {
                            id: this.aliveRole,
                            deny: ['SEND_MESSAGES']
                        }, {
                            id: this.accuse.accused.guildMember,
                            allow: ['SEND_MESSAGES']
                        }, {
                            id: this.serverGuild.id,
                            deny: ['SEND_MESSAGES']
                        }
                    ]
                });
                await wait(5)
                await this.textChannels["the-central"].send(`${this.accuse.accused.guildMember.user.username}, you are now on trial. You have 40 seconds to give a statement before the people will decide your fate.`);
                await wait(35);
                await this.textChannels["the-central"].send(`${this.accuse.accused.guildMember.user.username}, you have 5 seconds left.`);
                await wait(5);

                // Day vote
                this.gameState = GameState.DAY_VOTE;
                await this.textChannels["the-central"].replacePermissionOverwrites({
                    overwrites: [
                        {
                            id: this.aliveRole,
                            allow: ['SEND_MESSAGES']
                        },
                        {
                            id: this.serverGuild.id,
                            deny: ['SEND_MESSAGES']
                        }
                    ]
                });
                await this.textChannels["the-central"].send("You all have 60 seconds to discuss and vote. Type `!guilty` to vote guilty or `!innocent` to vote innocent.");
                await wait(50);
                await this.textChannels["the-central"].send("You all have 10 seconds to discuss and vote.");
                await wait(5);
                await this.textChannels["the-central"].send("You all have 5 seconds to discuss and vote.");
                await wait(5);

                await this.textChannels["the-central"].replacePermissionOverwrites({ // Remove message sending perms from #the-central
                    overwrites: [
                        {
                            id: this.aliveRole,
                            deny: ["SEND_MESSAGES"]
                        },
                        {
                            id: this.serverGuild.id,
                            deny: ['SEND_MESSAGES']
                        }
                    ]
                });
                await this.textChannels["the-central"].send("The people have spoken!");
                await wait(2);
                if(this.accuse.votes.innocent.length < this.accuse.votes.guilty.length){
                    await this.textChannels["the-central"].send(`${this.accuse.accused.guildMember.user.username}, you have been voted guilty. May you rest in peace.\nThey were **${GameRole[this.accuse.accused.role]}**.`);
                    this.players.all[this.players.all.indexOf(this.accuse.accused)].isAlive = false;
                    this.deadPlayers.push(this.accuse.accused);
                    await this.accuse.accused.guildMember.setRoles([]);
                } else if (this.accuse.votes.innocent.length >= this.accuse.votes.guilty.length){
                    await this.textChannels["the-central"].send(`${this.accuse.accused.guildMember.user.username}, you have been declared innocent. You shall live another day.`);
                }

                // check win
                await this.checkWin().then(gameDone => {
                    this.isFinished = gameDone;
                });
                if(this.isFinished) break;

                await wait(2);
                await this.textChannels["the-central"].send("The sun is setting; night will fall shortly.");
                await wait(5);
            } else {
                await this.textChannels["the-central"].send("There is either a tie between multiple people, or no votes have been cast. The sun has set. Night will fall in 5 seconds.");
                await wait(5);
            }
            this.accuse = {
                accused: null,
                votes: {
                    innocent: [],
                    guilty: []
                }
            };
        }
    }

    checkWin = () => {
        return new Promise<boolean>(async resolve => {
            var innocentsWin: boolean = this.deadPlayers.filter(player => player.role == GameRole.MAFIA).length >= this.players.mafias.length;
            var mafiaWins: boolean = this.deadPlayers.filter(player => player.role != GameRole.MAFIA).length >= this.players.all.filter(player => player.role != GameRole.MAFIA).length || (this.players.all.length - this.deadPlayers.length == 2 && this.players.all.find(player => player.role == GameRole.MAFIA) != undefined);
            if(innocentsWin || mafiaWins){
                resolve(true);
                if(innocentsWin){
                    await this.textChannels["the-central"].send("All Mafia members are dead. **INNOCENTS WIN!**");
                } else if (mafiaWins){
                    await this.textChannels["the-central"].send("All innocents are dead, or a stalemate has been made. **MAFIA WINS!**");
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
                        await member.guildMember.setNickname("");
                    }
                });
            } else {
                resolve(false);
            }
        });
    }

    processMessage = async (message: Message) => {
        var player = this.players.all.find(player => player.guildMember.user == message.author);
        if(player != undefined && player.isAlive){ // Is the user a living player?
            if(message.channel == message.author.dmChannel){ // Message sent thru DM?
                switch(this.gameState){
                    case GameState.NIGHT: // Night?
                        var actionSubject = parseInt(message.content);
                        if(!isNaN(actionSubject)){ // Is the message sent a number?
                            if(actionSubject < this.players.all.length && actionSubject >= 0){ // Is it a valid number (within player range?)
                                var playerSubject = this.players.all[actionSubject];
                                if(playerSubject.isAlive){ // Is thir target alive?
                                    switch(player.role){
                                        case GameRole.DETECTIVE:
                                            var investigateObj = this.nightActions.investigate.find(action => action.detective.user == message.author);
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
                                            var healObj = this.nightActions.heal.find(action => action.healer.user == message.author);
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
                                            if(playerSubject.role != GameRole.MAFIA){
                                                var killObj = this.nightActions.kill.find(action => action.killer.user == message.author);
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
                                            } else {
                                                await message.channel.send("You cannot kill other members of the Mafia.");
                                            }
                                        break;
                                    } 
                                } else {
                                    await message.channel.send("That person is not alive. Please choose someone else.");
                                }
                            } else {
                                await message.channel.send("Invalid player ID.");
                            }
                        } else {
                            if(message.content.toLowerCase() == "cancel"){
                                switch(player.role){
                                    case GameRole.DETECTIVE:
                                        var investigate = this.nightActions.investigate;
                                        this.nightActions.investigate.splice(investigate.indexOf(investigate.find(investigate => investigate.detective.user == message.author)), 1);
                                    break;
                                    case GameRole.HEALER:
                                        var heal = this.nightActions.heal;
                                        this.nightActions.heal.splice(heal.indexOf(heal.find(heal => heal.healer.user == message.author)), 1);
                                    break;
                                    case GameRole.MAFIA:
                                        var kill = this.nightActions.kill;
                                        this.nightActions.kill.splice(kill.indexOf(kill.find(kill => kill.killer.user == message.author)), 1);
                                    break;
                                }
                                await message.channel.send("Choice cleared.");
                            } else {
                                await message.channel.send("That is invalid.");
                            }
                        }
                    break;
                    default: 
                        await message.channel.send("It is day; you cannot use your special ability yet.");
                }
            } else {
                // to-do: things that aren't dm
                if(message.channel == this.textChannels["the-central"] && message.content.startsWith("!")){
                    var args = message.content.toLowerCase().split(" ");
                    switch(this.gameState){
                        case GameState.DAY_TRIAL_DECISION:
                            switch(args[0]){
                                case "!vote":
                                    if(args.length == 2){
                                        var voteChoice = parseInt(args[1]);
                                        if(!isNaN(voteChoice)){
                                            if(voteChoice < this.players.all.length && voteChoice >= 0){
                                                var playerVoteChoice = this.players.all[voteChoice];
                                                if(playerVoteChoice.isAlive && this.voting.votes.find(vote => vote.voter.user == message.author) == undefined){
                                                    this.voting.votes.push({
                                                        voter: player.guildMember,
                                                        voted: playerVoteChoice
                                                    });
                                                    var individualVote = this.voting.individualVoted.find(voted => voted.voted == playerVoteChoice);
                                                    if(individualVote != undefined){
                                                        this.voting.individualVoted.find(voted => voted.voted == playerVoteChoice).votes++;
                                                    } else {
                                                        this.voting.individualVoted.push({
                                                            voted: playerVoteChoice,
                                                            votes: 1
                                                        });
                                                    }
                                                    await message.channel.send(`Vote confirmed. ${playerVoteChoice.guildMember.user.username} now has ${this.voting.votes.filter(vote => vote.voted == playerVoteChoice).length} votes.`);
                                                } else {
                                                    await message.channel.send(message.author.username + ", that player is either not alive or you have already voted that person. Please choose someone else to vote.");
                                                }
                                            } else {
                                                await message.channel.send(message.author.username + ", that is not a valid player ID.");
                                            }
                                        } else {
                                            await message.channel.send(message.author.username + ", that is not a valid player ID.");
                                        }
                                    } else {
                                        await message.channel.send(message.author.username + ", you must vote in the format of `!vote <Player ID>`.");
                                    }
                                break;
                                case "!cancel":
                                    var playerVote = this.voting.votes.find(vote => vote.voter == player.guildMember);
                                    if(playerVote != undefined){
                                        this.voting.votes.splice(this.voting.votes.indexOf(playerVote), 1);
                                        this.voting.individualVoted.find(vote => vote.voted == playerVoteChoice).votes--;
                                        await message.channel.send(message.author.username + ", your vote has been canceled.");
                                    } else {
                                        await message.channel.send(message.author.username + ", you have not voted yet.");
                                    }
                                break;
                            }
                        break;
                        case GameState.DAY_VOTE:
                            if(player != this.accuse.accused){
                                switch(args[0]){
                                    case "!innocent":
                                        if(this.accuse.votes.innocent.find(accuser => accuser == player.guildMember) == undefined && this.accuse.votes.guilty.find(accuser => accuser == player.guildMember) == undefined){
                                            this.accuse.votes.innocent.push(player.guildMember);
                                            await message.channel.send(`**${message.author.username}** has voted **innocent**. Type \`!cancel\` to cancel your vote.`);
                                        }
                                    break;
                                    case "!guilty":
                                        if(this.accuse.votes.innocent.find(accuser => accuser == player.guildMember) == undefined && this.accuse.votes.guilty.find(accuser => accuser == player.guildMember) == undefined){
                                            this.accuse.votes.guilty.push(player.guildMember);
                                            await message.channel.send(`**${message.author.username}** has voted **guilty**. Type \`!cancel\` to cancel your vote.`);
                                        }
                                    break;
                                    case "!cancel":
                                        var innocentVote = this.accuse.votes.innocent.find(accuser => accuser == player.guildMember);
                                        var guiltyVote = this.accuse.votes.guilty.find(accuser => accuser == player.guildMember);
                                        if(innocentVote != undefined){
                                            var vote = this.accuse.votes.innocent;
                                            this.accuse.votes.innocent.splice(vote.indexOf(innocentVote));
                                            await message.channel.send(`${message.author.username}, your vote has been cleared.`);
                                        } else if(guiltyVote != undefined){
                                            var vote = this.accuse.votes.guilty;
                                            this.accuse.votes.guilty.splice(vote.indexOf(guiltyVote));   
                                            await message.channel.send(`${message.author.username}, your vote has been cleared.`);
                                        } else {
                                            await message.channel.send(`${message.author.username}, you have not casted a vote yet.`);
                                        }
                                    break;
                                }
                            } else {
                                await message.channel.send("You cannot vote if you are on trial.");
                            }
                        break;
                    }
                }
            }
        }
    }
}