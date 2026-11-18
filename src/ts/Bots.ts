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

export class Bots {
    /** Cards each bot has seen (by card id) */
    private readonly known = new Map<number, Set<string>>();
    private turnTimer: unknown = null;
    private readonly throwTimers = new Map<number, unknown>();
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
            const wait = (this.game.phase === 'peek' ? 2400 : 0) + 850 + Math.random() * 650;
            this.turnTimer = this.setTimer(() => {
                this.turnTimer = null;
                this.act(who);
            }, wait * this.speed);
        }
        this.planThrows();
    }

    private whoActs(): number | null {
        const g = this.game;
        if (g.phase === 'peek') return this.ids.find(id => !g.players[id].ready) ?? null;
        const effect = g.activeEffect;
        if (effect) return this.ids.includes(effect.playerId) ? effect.playerId : null;
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
            if (g.phase === 'peek') return void g.peek(id);
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
            }, (700 + Math.random() * 1100) * this.speed));
        }
    }
}

function pick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}
