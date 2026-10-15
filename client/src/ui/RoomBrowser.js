import { ROOMS } from '../../shared/constants.js';
import { getModeInfo } from '../../shared/config/modes.js';
import { getMap } from '../../shared/world/maps/index.js';
import { el } from './dom.js';

export const ROOM_ERROR_TEXT = {
    'wrong-password': 'Wrong password',
    'full': 'That room is full',
    'not-found': 'That room was closed',
    'server-full': `Server is full (${ROOMS.maxRooms} rooms). Join an existing room.`,
    'bad-name': 'Pick a room name',
    'name-taken': 'A room with that name already exists',
    'bad-size': `Rooms hold 2 to ${ROOMS.maxPlayersPerRoom} players`,
    'bad-mode': 'That game mode is not available',
    'bad-map': 'That map is not available',
    'timeout': 'The server did not answer, try again',
    'offline': 'Rooms need the online server'
};

export const roomErrorText = error => ROOM_ERROR_TEXT[error] || 'Something went wrong';

// Online rooms, in two parts the menu places itself:
//   listRoot  live list of rooms to join (each row has its own Join button)
//   formRoot  the fields for a new room (name, password, size, bots); the menu supplies mode and map
// onJoin(roomId, password) and onCreate(options) return promises resolving to { error } or {}.
// onEmptyCreate: the "Create one" button shown when there are no rooms.
export class RoomBrowser {
    constructor({ profile, sound, onJoin, onCreate, onEmptyCreate = () => {} }) {
        this.profile = profile;
        this.sound = sound;
        this.onJoin = onJoin;
        this.onCreate = onCreate;
        this.rows = new Map();          // roomId -> row elements, reused so typing isn't interrupted
        this.enabled = false;

        this.list = el('div.room-list');
        this.listMessage = el('div.room-empty');
        this.emptyCreate = el('button.btn.room-empty-create', { type: 'button', text: 'Create one', onclick: () => onEmptyCreate() });
        this.listRoot = el('div.rooms', {}, [this.list, this.listMessage, this.emptyCreate]);
        this.formRoot = this.buildCreateForm();
        this.render([]);
    }

    buildCreateForm() {
        const stop = e => e.stopPropagation();
        this.nameInput = el('input', { type: 'text', maxlength: 24, placeholder: 'Room name', value: this.profile.roomName || '' });
        this.passwordInput = el('input', { type: 'password', maxlength: 32, placeholder: 'No password', autocomplete: 'new-password' });
        for (const input of [this.nameInput, this.passwordInput]) input.addEventListener('keydown', stop);

        this.sizeSelect = el('select.room-size');
        for (let n = 2; n <= ROOMS.maxPlayersPerRoom; n++) {
            this.sizeSelect.append(el('option', { value: n, text: `${n} players` }));
        }
        const savedSize = Math.min(this.profile.roomMaxPlayers || ROOMS.maxPlayersPerRoom, ROOMS.maxPlayersPerRoom);
        this.sizeSelect.value = String(savedSize);

        const withBots = this.profile.roomBots !== false;
        this.botsYes = el('input', { type: 'radio', name: 'room-bots', value: 'yes', checked: withBots });
        this.botsNo = el('input', { type: 'radio', name: 'room-bots', value: 'no', checked: !withBots });

        this.createError = el('div.room-error');
        this.formMessage = el('div.room-empty');
        const field = (text, control) => el('label.room-field', {}, [el('span.label', { text }), control]);
        return el('div.room-create', {}, [
            this.formMessage,
            field('Room name', this.nameInput),
            field('Password (optional)', this.passwordInput),
            field('Players', this.sizeSelect),
            el('div.room-bots', {}, [
                el('label', {}, [this.botsYes, ' Fill empty seats with bots']),
                el('label', {}, [this.botsNo, ' No bots: friends only'])
            ]),
            this.createError
        ]);
    }

    setEnabled(enabled, message = '') {
        this.enabled = enabled;
        this.listRoot.classList.toggle('disabled', !enabled);
        this.formRoot.classList.toggle('disabled', !enabled);
        for (const row of this.rows.values()) row.joinButton.disabled = !enabled;
        this.formMessage.textContent = enabled ? '' : message || roomErrorText('offline');
        if (!enabled) {
            this.listMessage.textContent = message || roomErrorText('offline');
            this.emptyCreate.classList.add('hidden');
        } else {
            this.render(this.lastRooms || []);
        }
    }

    // rooms: [{ id, name, kind, players, maxPlayers, bots, locked }]
    render(rooms) {
        this.lastRooms = rooms;
        const seen = new Set();
        for (const room of rooms) {
            seen.add(room.id);
            const row = this.rows.get(room.id) || this.createRow(room);
            this.updateRow(row, room);
            this.list.append(row.node); // keeps the server's order
        }
        for (const [id, row] of this.rows) {
            if (!seen.has(id)) {
                row.node.remove();
                this.rows.delete(id);
            }
        }
        if (!this.enabled) return;
        this.listMessage.textContent = rooms.length ? '' : 'No rooms yet.';
        this.emptyCreate.classList.toggle('hidden', rooms.length > 0);
    }

    createRow(room) {
        const name = el('span.room-name');
        const info = el('span.room-info');
        const password = el('input.hidden', { type: 'password', maxlength: 32, placeholder: 'Password' });
        password.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Enter') this.join(room.id, password.value, row);
        });
        const joinButton = el('button.btn.room-join', { type: 'button', text: 'Join' });
        const error = el('div.room-error');
        const row = { node: null, name, info, password, joinButton, error, locked: false };
        joinButton.addEventListener('click', () => {
            if (row.locked && password.classList.contains('hidden')) {
                password.classList.remove('hidden');
                joinButton.textContent = 'Go';
                password.focus();
                return;
            }
            this.join(room.id, password.value, row);
        });
        row.node = el('div.room-row', {}, [
            el('div.room-main', {}, [name, info, password, joinButton]),
            error
        ]);
        row.joinButton.disabled = !this.enabled;
        this.rows.set(room.id, row);
        return row;
    }

    updateRow(row, room) {
        row.locked = room.locked;
        row.name.textContent = `${room.locked ? '🔒 ' : ''}${room.name}`;
        const full = room.players >= room.maxPlayers;
        const mode = getModeInfo(room.mode)?.name || '';
        const map = getMap(room.map)?.name || '';
        row.info.textContent = `${mode}${map ? ` · ${map}` : ''} · ${room.players}/${room.maxPlayers} · ${room.bots ? '🤖 bots' : 'no bots'}${full ? ' · full' : ''}`;
        row.node?.classList.toggle('full', full);
    }

    async join(roomId, password, row) {
        if (!this.enabled) return;
        this.sound.unlock();
        this.sound.play('click');
        row.error.textContent = '';
        row.joinButton.disabled = true;
        const result = await this.onJoin(roomId, password);
        row.joinButton.disabled = !this.enabled;
        if (result?.error) row.error.textContent = roomErrorText(result.error);
    }

    // Create a room from the form, with the mode and map the menu picked
    async create({ mode, map }) {
        if (!this.enabled) return { error: 'offline' };
        const options = {
            roomName: this.nameInput.value.trim(),
            password: this.passwordInput.value,
            maxPlayers: Number(this.sizeSelect.value),
            bots: this.botsYes.checked,
            mode,
            map
        };
        // Remember the choices (not the password) for next time
        Object.assign(this.profile, { roomName: options.roomName, roomMaxPlayers: options.maxPlayers, roomBots: options.bots, roomMap: options.map });
        this.profile.save();

        this.createError.textContent = '';
        const result = await this.onCreate(options);
        if (result?.error) this.createError.textContent = roomErrorText(result.error);
        return result;
    }
}
