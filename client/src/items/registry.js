import { AxeView } from './AxeView.js';
import { BowView } from './BowView.js';
import { HealthPotionView } from './HealthPotionView.js';

// Item id -> view. Add a view here when registering a new item in shared/items/ItemRegistry.js
const views = new Map([new BowView(), new AxeView(), new HealthPotionView()].map(v => [v.itemId, v]));

export function getItemView(itemId) {
    return views.get(itemId) || null;
}
