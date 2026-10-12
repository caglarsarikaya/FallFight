import { AXE } from '../constants.js';
import { MeleeWeapon } from './Weapon.js';

// Hits players in reach; if no player is hit, chops the floor block it's aimed at
export class Axe extends MeleeWeapon {
    constructor() {
        super({
            id: 'axe',
            name: 'Axe',
            damage: AXE.damage,
            reach: AXE.reach,
            cooldown: AXE.cooldown,
            knockback: AXE.knockback,
            description: `${AXE.damage} damage, chops any block`
        });
        this.canBreakBlocks = true;
    }

    use(ctx) {
        if (this.strikePlayer(ctx)) return true;
        const block = ctx.room.arena.raycast(ctx.origin, ctx.dir, this.reach);
        if (block) ctx.room.breakBlock(block.ix, block.iy, block.iz, ctx.player);
        return true;
    }
}
