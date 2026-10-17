import { GRENADE } from '../constants.js';
import { Consumable } from './Consumable.js';

// A thrown grenade (HE or smoke), used up from its inventory stack. The room flies it as a
// bouncing projectile and sets it off when the fuse runs out: HE blows up like the RPG's rocket
// (GameRoom.explode, which reads `blast`), smoke leaves a cloud (GameRoom.popSmoke, `smoke`).
export class Grenade extends Consumable {
    constructor({ id, name, short, slot, blast = null, smoke = null }) {
        super({ id, name, cooldown: 0.8, description: name });
        this.short = short;
        this.slot = slot;
        this.blast = blast;
        this.smoke = smoke;
    }

    get action() {
        return 'throw';
    }

    applyEffect({ room, player, origin, dir }) {
        const speed = GRENADE.throwSpeed;
        room.spawnProjectile(player, this, origin, {
            x: dir.x * speed + player.vx,
            y: dir.y * speed + speed * GRENADE.upBias + Math.max(0, player.vy),
            z: dir.z * speed + player.vz
        }, { gravity: room.ruleset.grenade.gravity, bounce: GRENADE.bounce, fuse: GRENADE.fuse, life: Infinity });
        // Out of this kind: back to the best gun
        const inv = player.inventory;
        if (inv.count(this.id) === 0 && inv.selected === this.slot) room.select(player, inv.bestSlot());
    }
}
