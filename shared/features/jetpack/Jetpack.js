import { Feature } from '../Feature.js';
import { jetpackMovement } from './movement.js';

// The jetpack: a 'jetpack' pickup (the mode decides where they come from) that lets you fly
// until you die (./movement.js). One per player; carriers take no fall damage.
export class Jetpack extends Feature {
    static id = 'jetpack';
    static movement = jetpackMovement;

    resetPlayer(player) {
        player.jetpack = false;
        player.flying = false;
    }

    onDeath(player) {
        this.resetPlayer(player);
    }

    fallImmune(player) {
        return !!player.jetpack;
    }

    canFly(player) {
        return !!player.jetpack;
    }

    playerJSON(player) {
        return { jetpack: !!player.jetpack, jetting: !!player.flying };
    }

    get pickups() {
        return {
            jetpack: {
                canTake: player => !player.jetpack,
                apply: player => {
                    player.jetpack = true;
                }
            }
        };
    }
}
