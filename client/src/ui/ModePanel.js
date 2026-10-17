import { el } from './dom.js';

// The strip at the top centre of the screen: what the current mode is about right now. The
// mode's client half draws it (ClientMode.panelView).
export class ModePanel {
    constructor(root) {
        this.title = el('div.mode-title');
        this.main = el('div.mode-main');
        this.sub = el('div.mode-sub');
        this.root = el('div.mode-panel.hidden', {}, [this.title, this.main, this.sub]);
        root.append(this.root);
        this.state = null;
        this.key = '';
    }

    // state: latest MODE_STATE; players: the game's player map; selfId; mode: the ClientMode
    render(state, players, selfId, mode) {
        if (!state || !mode) return;
        this.state = state;
        const self = players.get(selfId);
        const view = mode.panelView(state, self, players);
        const key = `${view.title}|${view.main}|${view.sub}|${view.className || ''}`;
        if (key === this.key) return;
        this.key = key;
        this.root.classList.remove('hidden');
        this.root.className = `mode-panel ${view.className || ''}`;
        this.title.textContent = view.title;
        if (view.mainNodes) this.main.replaceChildren(...view.mainNodes);
        else this.main.textContent = view.main;
        this.sub.textContent = view.sub || '';
    }
}
