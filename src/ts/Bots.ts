import Card from './Card.js';
import Dutch, {EffectType, RuleError} from './Dutch.js';

/**
 *  Computer players ("Contre l'ordinateur").
 *  They only use what the engine tells them: a card is known once it was revealed to them.
 *  Each move waits a little, so that the players see what happens.
 */
export interface BotOptions {
    /** Multiplies the waiting times (0 in tests: play as fast as possible) */
    speed?: number;
    /** Timer functions (tests can pass their own) */
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
}

/** A bot looks at his cards between these times after the deal (ms) */
export const PEEK_MIN_MS = 1100;
export const PEEK_SPREAD_MS = 1100;
/** A move (draw, choose a card, use an effect) */
export const MOVE_MS = 1100;
export const MOVE_SPREAD_MS = 700;
/** After playing, before ending the turn: time to throw a card on the discard */
export const END_TURN_MS = 2200;
/** The last turn of the round: once it ends, nobody can throw any more */
export const END_ROUND_MS = 3600;

export class Bots {
    /** Cards each bot has seen (by card id) */
    private readonly known = new Map<number, Set<string>>();
    private turnTimer: unknown = null;
    private readonly throwTimers = new Map<number, unknown>();
    private readonly peekTimers = new Map<number, unknown>();
    private stopped = false;
    private readonly speed: number;
    private readonly setTimer: (fn: () => void, ms: number) => unknown;
    private readonly clearTimer: (handle: unknown) => void;
    private readonly unsubscribe: () => void;

    constructor(private readonly game: Dutch, public readonly ids: number[], options: BotOptions = {}) {
        this.speed = options.speed ?? 1;
        this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
        this.clearTimer = options.clearTimer ?? (h => clearTimeout(h as ReturnType<typeof setTimeout>));
        for (const id of ids) this.known.set(id, new Set());
        this.unsubscribe = game.on(event => {
            if (event.type === 'reveal' && !event.public && ids.includes(event.playerId)) {
                this.known.get(event.playerId)!.add(event.cardId);
            }
        });
    }

    public stop() {
        this.stopped = true;
        this.unsubscribe();
        if (this.turnTimer !== null) this.clearTimer(this.turnTimer);
        this.throwTimers.forEach(t => this.clearTimer(t));
        this.throwTimers.clear();
        this.peekTimers.forEach(t => this.clearTimer(t));
        this.peekTimers.clear();
    }

    /**
     *  To call after every change: plans the next move of a bot, if one has to act
     */
    public schedule() {
        if (this.stopped) return;
        if (this.turnTimer !== null) this.clearTimer(this.turnTimer);
        this.turnTimer = null;
        const who = this.whoActs();
        if (who !== null) {
            const wait = this.waitBefore(who);
            this.turnTimer = this.setTimer(() => {
                this.turnTimer = null;
                this.act(who);
            }, wait * this.speed);
        }
        this.planPeeks();
        this.planThrows();
    }

    /**
     *  Time before the next move of a bot (ms). After a card goes on the discard, the players
     *  need time to see it and throw a matching card: the bot waits longer before ending his turn,
     *  and even longer when it ends the round (nobody can throw any more after that).
     */
    private waitBefore(id: number): number {
        const g = this.game;
        if (!g.activeEffect && g.phase === 'played') {
            const endsRound = g.dutchCallerId !== null && g.finalTurnsLeft <= 1 && g.currentPlayerIndex === id;
            return endsRound ? END_ROUND_MS + Math.random() * 600 : END_TURN_MS + Math.random() * 700;
        }
        return MOVE_MS + Math.random() * MOVE_SPREAD_MS;
    }

    /**
     *  At the start of a round (variant), the bots look at their cards all at the same time,
     *  each after a short time of his own: not instant, but no waiting for each bot in turn
     */
    private planPeeks() {
        const g = this.game;
        if (g.phase !== 'peek') {
            // Ready for the next round
            this.peekTimers.forEach(t => this.clearTimer(t));
            this.peekTimers.clear();
            return;
        }
        for (const id of this.ids) {
            if (this.peekTimers.has(id) || g.players[id].ready) continue;
            this.peekTimers.set(id, this.setTimer(() => {
                if (this.stopped) return;
                try {
                    if (g.phase === 'peek' && !g.players[id].ready) g.peek(id);
                } catch (e) {
                    if (!(e instanceof RuleError)) throw e;
                }
                // Kept until the end of the phase: the bot doesn't look twice
            }, (PEEK_MIN_MS + Math.random() * PEEK_SPREAD_MS) * this.speed));
        }
    }

    private whoActs(): number | null {
        const g = this.game;
        // A card thrown while the players look at their cards can give an effect: it comes first
        const effect = g.activeEffect;
        if (effect) return this.ids.includes(effect.playerId) ? effect.playerId : null;
        if (g.phase === 'peek') return null; // planPeeks()
        if (g.isRoundRunning && this.ids.includes(g.currentPlayerIndex)) return g.currentPlayerIndex;
        return null;
    }

    private mine(id: number) {
        const known = this.known.get(id)!;
        const cards = this.game.players[id].cards;
        return {
            known: cards.filter(c => known.has(c.id)).sort((a, b) => b.points - a.points),
            unknown: cards.filter(c => !known.has(c.id)),
        };
    }

    private act(id: number) {
        if (this.stopped) return;
        const g = this.game;
        try {
            const effect = g.activeEffect;
            if (effect) return this.useEffect(id, effect.type);
            const {known, unknown} = this.mine(id);
            const worst = known[0];
            if (g.phase === 'draw') {
                if (g.isStuck) return g.endTurn(id);
                const top = g.deck.topDiscard;
                const useful = top && g.players[id].cards.length > 0 && top.points <= 2
                    && (unknown.length > 0 || (worst && worst.points > top.points + 2));
                return void (useful ? g.takeDiscard(id) : g.drawFromPile(id));
            }
            if (g.phase === 'drawn' && g.drawn) {
                const card = g.drawn.card;
                let target: Card | undefined;
                if (worst && worst.points > card.points + 1) target = worst;
                else if (card.points <= 4 && unknown.length) target = pick(unknown);
                else if (g.drawn.source === 'discard') target = worst ?? pick(unknown);
                return target ? g.swapDrawn(id, target.id) : g.discardDrawn(id);
            }
            if (g.phase === 'played') {
                const estimate = known.reduce((s, c) => s + c.points, 0) + unknown.length * 6;
                const dutch = g.dutchCallerId === null && unknown.length <= 1 && estimate <= 8;
                return g.endTurn(id, dutch);
            }
        } catch (e) {
            if (!(e instanceof RuleError)) throw e;
            // The state moved on in the meantime: the next change plans again
        }
    }

    private useEffect(id: number, type: EffectType) {
        const g = this.game;
        const {known, unknown} = this.mine(id);
        const others = g.players.filter(p => p.id !== id && !g.isImmune(p.id) && p.cards.length > 0);
        if (type === 'QUEEN' && unknown.length) return void g.queenPeek(id, pick(unknown).id);
        if (type === 'JACK' && known[0] && known[0].points >= 7 && others.length) {
            const give = known[0];
            this.known.get(id)!.delete(give.id);
            return g.jackSwap(id, give.id, pick(pick(others).cards).id);
        }
        if (type === 'ACE' && others.length) {
            // The player with the fewest cards gets one more
            const target = others.slice().sort((a, b) => a.cards.length - b.cards.length)[0];
            return g.aceGive(id, target.id);
        }
        g.skipEffect(id);
    }

    /**
     *  A bot that knows a card of the same value as the discard throws it (after a reaction time)
     */
    private planThrows() {
        const g = this.game;
        const top = g.deck.topDiscard;
        for (const id of this.ids) {
            if (this.throwTimers.has(id) || !top || !g.canThrow(id)) continue;
            const match = this.mine(id).known.find(c => c.matches(top));
            if (!match) continue;
            this.throwTimers.set(id, this.setTimer(() => {
                this.throwTimers.delete(id);
                if (this.stopped) return;
                if (g.canThrow(id) && g.deck.topDiscard?.matches(match) && g.players[id].hasCard(match.id)) {
                    try {
                        g.throwCard(id, match.id);
                    } catch (e) {
                        if (!(e instanceof RuleError)) throw e;
                    }
                }
            }, (900 + Math.random() * 1300) * this.speed));
        }
    }
}

function pick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}
