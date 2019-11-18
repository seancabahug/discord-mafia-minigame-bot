import { GameRole } from './enums';
import { GuildMember } from 'discord.js';

export class Player {
    guildMember: GuildMember;
    isAlive: boolean;
    role: GameRole;
    constructor(guildMember: GuildMember, role: GameRole){
        this.guildMember = guildMember;
        this.isAlive = true;
        this.role = role;
    }
}