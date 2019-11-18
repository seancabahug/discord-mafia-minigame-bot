import { Player } from './player';
import { GameState, GameRole } from './enums';
import { Client } from 'discord.js';

export class Game {
    alivePlayers: Player[];
    deadPlayers: Player[];
    gameState: GameState;
    constructor(bot: Client, players: Player[]){
        this.alivePlayers = players;
        this.deadPlayers = [];
        this.gameState = GameState.INTIALIZING;
    }
}