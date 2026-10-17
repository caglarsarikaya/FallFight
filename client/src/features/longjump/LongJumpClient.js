import * as THREE from 'three';
import { registerPickupLook } from '../../entities/PickupView.js';
import { ClientFeature } from '../ClientFeature.js';

// The long jump module on screen: its pickup, what it says, and the leap's sound
export class LongJumpClient extends ClientFeature {
    static id = 'longjump';
    static menuControls = [['Ctrl + Space', 'Long jump, if you carry the module']];

    get pickups() {
        return {
            longjump: {
                name: 'Long Jump',
                spawned: () => {
                    this.game.sound.play('rpgSpawn');
                    this.game.hud.toast('A Long Jump module appeared in the middle!');
                },
                taken: ({ by }) => {
                    if (!by) return;
                    const game = this.game;
                    if (by === game.selfId) game.sound.play('armorUp');
                    game.hud.toast(by === game.selfId ? 'Long Jump! Crouch + jump while running'
                        : `${game.players.get(by)?.name || 'Someone'} has the Long Jump!`);
                }
            }
        };
    }

    jumpSound(kind) {
        return kind === 'longjump' ? 'longJump' : null;
    }
}

// A grey backpack with two thrusters and a green light strip
registerPickupLook('longjump', {
    color: '#6dff6a',
    spotlight: true,
    create() {
        const group = new THREE.Group();
        const grey = new THREE.MeshLambertMaterial({ color: '#7a828c' });
        const dark = new THREE.MeshLambertMaterial({ color: '#33383f' });
        const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.18), grey);
        group.add(pack);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.01),
            new THREE.MeshBasicMaterial({ color: '#6dff6a' }));
        strip.position.set(0, 0.02, 0.095);
        group.add(strip);
        for (const side of [-1, 1]) {
            const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.26, 10), dark);
            thruster.position.set(side * 0.12, -0.2, -0.12);
            group.add(thruster);
        }
        group.traverse(o => {
            if (o.isMesh) o.castShadow = true;
        });
        group.scale.setScalar(1.3);
        return group;
    }
});
