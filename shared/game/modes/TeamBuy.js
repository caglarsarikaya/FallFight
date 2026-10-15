import { TEAM_BUY } from '../../config/modes.js';
import { KNIFE, WEAPONS, WEAPON_SLOT, weaponSpec } from '../../config/weapons.js';
import { S2C } from '../../protocol.js';
import { buyItem } from '../Shop.js';
import { GameMode } from './GameMode.js';

const TEAMS = TEAM_BUY.teams;   // ['t', 'ct']
const other = team => (team === 't' ? 'ct' : 't');

// Team Buy: Red Brick vs Blue Brick in rounds, like CS on fy_pool_day.
// Freeze time at the start of a round to buy (nobody moves), then fight until one team is wiped
// out or the clock runs out. Dead players watch until the next round. Kills, wins and even losses
// pay money; guns you still hold at the end of a round carry over. First to roundsToWin wins.
export class TeamBuy extends GameMode {
    get id() {
        return 'teambuy';
    }

    get pickupTypes() {
        return [];
    }

    reset() {
        super.reset();
        this.round = 0;
        this.score = { t: 0, ct: 0 };
        this.lossStreak = { t: 0, ct: 0 };
        this.phase = 'waiting';
        this.phaseEndsAt = 0;
        this.roundStartedAt = 0;
        this.lastWinner = null;
        // The first round starts on the next tick (so players added right after get in on it)
        this.startAt = this.room.time;
    }

    resetPlayer(player) {
        super.resetPlayer(player);
        player.money = TEAM_BUY.startMoney;
        player.carry = false;     // keep the current loadout into the next round
    }

    onJoin(player) {
        player.team = this.smallerTeam();
        player.money ??= TEAM_BUY.startMoney;
        // Mid-round arrivals wait for the next round
        if (this.phase === 'live' || this.phase === 'over') {
            player.alive = false;
            player.respawnAt = Infinity;
        }
        super.onJoin(player);
    }

    smallerTeam() {
        const count = this.teamCounts();
        return count.t <= count.ct ? 't' : 'ct';
    }

    teamCounts() {
        const count = { t: 0, ct: 0 };
        for (const p of this.room.players.values()) if (p.team) count[p.team]++;
        return count;
    }

    aliveCounts() {
        const count = { t: 0, ct: 0 };
        for (const p of this.room.players.values()) if (p.alive && p.team) count[p.team]++;
        return count;
    }

    isEnemy(a, b) {
        return a !== b && a.team !== b.team;
    }

    // Start of a life with nothing: knife and the team's pistol
    equip(player) {
        if (player.carry) {
            // Survivors keep their guns, with full ammo for the new round
            player.carry = false;
            for (const [id, a] of Object.entries(player.inventory.ammo)) {
                const spec = weaponSpec(id);
                a.mag = spec.mag;
                a.reserve = spec.reserve;
            }
            return;
        }
        player.inventory.reset({ weapons: [TEAM_BUY.defaultPistol[player.team] || 'glock'] });
        player.armor = 0;
        player.helmet = false;
    }

    spawnZones(player) {
        return this.room.map.spawns?.[player.team] || null;
    }

    frozen() {
        return this.phase === 'freeze';
    }

    canFire(player) {
        return super.canFire(player) && (this.phase === 'live' || this.phase === 'over');
    }

    respawnDelay() {
        return null; // wait for the next round
    }

    // ---- rounds --------------------------------------------------------------------------

    startRound() {
        this.round++;
        this.phase = 'freeze';
        this.roundStartedAt = this.room.time;
        this.phaseEndsAt = this.room.time + TEAM_BUY.freezeTime;
        this.balanceTeams();
        for (const player of this.room.players.values()) {
            // Survivors keep what they carry; everyone else starts over with a pistol
            player.carry = player.alive && this.round > 1;
            this.room.respawn(player);
            if (player.isBot) this.botBuy(player);
        }
        this.dirty = true;
        this.room.emit(null, S2C.ROUND_START, { round: this.round, freezeTime: TEAM_BUY.freezeTime });
    }

    // Keep the teams within one player of each other by moving bots across
    balanceTeams() {
        const count = this.teamCounts();
        while (Math.abs(count.t - count.ct) > 1) {
            const from = count.t > count.ct ? 't' : 'ct';
            const bot = [...this.room.players.values()].find(p => p.isBot && p.team === from)
                || [...this.room.players.values()].find(p => p.team === from);
            bot.team = other(from);
            bot.carry = false;
            count[from]--;
            count[other(from)]++;
        }
    }

    endRound(winner, reason) {
        if (this.phase !== 'live') return;
        this.phase = 'over';
        this.phaseEndsAt = this.room.time + TEAM_BUY.roundEndDelay;
        this.lastWinner = winner;
        if (winner) {
            this.score[winner]++;
            const loser = other(winner);
            this.lossStreak[winner] = 0;
            const lossPay = Math.min(TEAM_BUY.lossReward + this.lossStreak[loser] * TEAM_BUY.lossBonus, TEAM_BUY.lossReward + TEAM_BUY.maxLossBonus);
            this.lossStreak[loser]++;
            for (const p of this.room.players.values()) {
                if (p.team === winner) this.pay(p, TEAM_BUY.winReward);
                else if (p.team === loser) this.pay(p, lossPay);
            }
        } else {
            for (const p of this.room.players.values()) this.pay(p, TEAM_BUY.lossReward);
        }
        this.dirty = true;
        this.room.emit(null, S2C.ROUND_END, { winner, reason, score: { ...this.score }, round: this.round });
    }

    pay(player, amount) {
        player.money = Math.max(0, Math.min(TEAM_BUY.maxMoney, (player.money ?? 0) + amount));
    }

    tick() {
        const now = this.room.time;
        if (this.room.matchOver) return;
        if (this.phase === 'waiting') {
            if (now >= this.startAt && this.room.players.size > 0) this.startRound();
            return;
        }
        if (this.phase === 'freeze' && now >= this.phaseEndsAt) {
            this.phase = 'live';
            this.phaseEndsAt = now + TEAM_BUY.roundTime;
            this.dirty = true;
        } else if (this.phase === 'live') {
            const alive = this.aliveCounts();
            const counts = this.teamCounts();
            if (counts.t && counts.ct) {
                if (alive.t === 0 && alive.ct === 0) this.endRound(null, 'draw');
                else if (alive.t === 0) this.endRound('ct', 'elimination');
                else if (alive.ct === 0) this.endRound('t', 'elimination');
            }
            if (this.phase === 'live' && now >= this.phaseEndsAt) {
                // Time's up: the team with more players standing takes it
                this.endRound(alive.t === alive.ct ? null : alive.t > alive.ct ? 't' : 'ct', 'time');
            }
        } else if (this.phase === 'over' && now >= this.phaseEndsAt) {
            const champion = TEAMS.find(team => this.score[team] >= TEAM_BUY.roundsToWin);
            if (champion) {
                this.room.endMatch({
                    winnerTeam: champion,
                    title: `${TEAM_BUY.teamNames[champion]} win the match ${this.score[champion]}-${this.score[other(champion)]}!`
                });
            } else {
                this.startRound();
            }
        }
    }

    onKill(victim, killer, cause) {
        if (killer) {
            const reward = cause === KNIFE.id ? KNIFE.killReward : weaponSpec(cause)?.killReward ?? 300;
            this.pay(killer, reward);
            killer.score = killer.kills;
        }
        this.dirty = true;
    }

    // ---- buying ----------------------------------------------------------------------------

    canBuy(player) {
        if (!player.alive || this.room.matchOver) return false;
        const inTime = this.phase === 'freeze' || (this.phase === 'live' && this.room.time - this.roundStartedAt < TEAM_BUY.buyTime);
        return inTime && this.inBuyZone(player);
    }

    inBuyZone(player) {
        const zones = this.spawnZones(player);
        if (!zones) return true;
        const { ix, iz } = this.room.arena.tileAt(player.x, player.z);
        return zones.some(z => ix >= z.x0 - 3 && ix <= z.x1 + 3 && iz >= z.z0 - 3 && iz <= z.z1 + 3);
    }

    // Returns { ok, error?, price }; the items are in shared/game/Shop.js
    buy(player, item) {
        if (!this.canBuy(player)) return { ok: false, error: 'not-now' };
        return buyItem(this.room, player, item);
    }

    // Bots spend like CS bots: armor first, then the best gun they can afford
    botBuy(bot) {
        const rng = this.room.rng;
        const has = id => bot.inventory.has(id);
        const primary = bot.inventory.hotbar[WEAPON_SLOT.PRIMARY];
        if (!primary) {
            const rifle = bot.team === 't' ? 'ak47' : 'm4a1';
            const choices = [
                rng() < 0.15 ? 'awp' : null,
                rifle,
                rng() < 0.3 ? 'scout' : null,
                'p90',
                rng() < 0.3 ? 'm3' : 'mp5'
            ].filter(Boolean);
            for (const id of choices) {
                // Leave money for a vest
                if (!has(id) && bot.money >= WEAPONS[id].price + TEAM_BUY.kevlar) {
                    this.buy(bot, id);
                    break;
                }
            }
            if (!bot.inventory.hotbar[WEAPON_SLOT.PRIMARY] && bot.money >= WEAPONS.deagle.price && rng() < 0.6) this.buy(bot, 'deagle');
        }
        if (bot.money >= TEAM_BUY.kevlarHelmet) this.buy(bot, 'kevlar_helmet');
        else if (bot.money >= TEAM_BUY.kevlar) this.buy(bot, 'kevlar');
        if (bot.money >= 1500) this.buy(bot, 'ammo');
    }

    // ---- what clients see -------------------------------------------------------------------

    stateJSON() {
        const now = this.room.time;
        return {
            mode: this.id,
            phase: this.phase,
            round: this.round,
            roundsToWin: TEAM_BUY.roundsToWin,
            score: { ...this.score },
            alive: this.aliveCounts(),
            freezeLeft: this.phase === 'freeze' ? Math.max(0, this.phaseEndsAt - now) : 0,
            timeLeft: this.phase === 'live' ? Math.max(0, this.phaseEndsAt - now) : 0,
            buyLeft: Math.max(0, TEAM_BUY.buyTime - (now - this.roundStartedAt)),
            lastWinner: this.lastWinner
        };
    }

    playerJSON(player) {
        return { team: player.team ?? null, money: player.money ?? 0 };
    }

    standings() {
        return super.standings().map(s => ({ ...s, team: this.room.players.get(s.id)?.team }));
    }
}
