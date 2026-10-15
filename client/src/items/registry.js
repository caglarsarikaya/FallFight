import { GUN_IDS } from '../../shared/config/weapons.js';
import { GunView } from './guns/GunView.js';
import { KnifeView } from './guns/KnifeView.js';
import { HealthPotionView } from './HealthPotionView.js';
import { GrenadeView } from './GrenadeView.js';

// Item id -> view. Guns get theirs from client/src/items/guns/specs.js automatically.
const views = new Map([
    ...GUN_IDS.map(id => new GunView(id)),
    new KnifeView(),
    new HealthPotionView(),
    new GrenadeView('hegrenade'),
    new GrenadeView('smokegrenade')
].map(v => [v.itemId, v]));

export function getItemView(itemId) {
    return views.get(itemId) || null;
}
