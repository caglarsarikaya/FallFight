import { ClientFeature } from '../ClientFeature.js';

// The map's RPG: everyone hears it appear, and who grabbed it
export class RpgClient extends ClientFeature {
    static id = 'rpg';

    get pickups() {
        return {
            rpg: {
                spawned: data => {
                    this.game.sound.play('rpgSpawn');
                    this.game.hud.toast(`An RPG appeared on the ${data.spot || ''} tower!`);
                },
                taken: ({ by }) => {
                    const game = this.game;
                    if (by === game.selfId) game.sound.play('deploy');
                    game.hud.toast(by === game.selfId ? 'You have the RPG! One shot, make it count'
                        : `${game.players.get(by)?.name || 'Someone'} has the RPG!`);
                }
            }
        };
    }
}
