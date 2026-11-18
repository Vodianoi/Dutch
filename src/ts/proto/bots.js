import { RuleError } from '../Dutch.js';
/**
 *  Simple computer players for the prototype.
 *  They only use what the engine tells them: a card is known once it was revealed to them.
 */
export class Bots {
    constructor(game, ids) {
        this.game = game;
        this.ids = ids;
        /** Cards each bot has seen (by card id) */
        this.known = new Map();
        this.throwTimers = new Map();
        this.paused = false;
        for (const id of ids)
            this.known.set(id, new Set());
        game.on(event => {
            if (event.type === 'reveal' && !event.public && ids.includes(event.playerId)) {
                this.known.get(event.playerId).add(event.cardId);
            }
        });
    }
    stop() {
        this.paused = true;
        clearTimeout(this.turnTimer);
        this.throwTimers.forEach(t => clearTimeout(t));
    }
    /**
     *  Called after every change: plan the next move of a bot, if one has to act
     */
    schedule() {
        if (this.paused)
            return;
        clearTimeout(this.turnTimer);
        const who = this.whoActs();
        if (who !== null) {
            const slow = this.game.phase === 'peek' ? 1600 : 0;
            this.turnTimer = setTimeout(() => this.act(who), slow + 850 + Math.random() * 650);
        }
        this.planThrows();
    }
    whoActs() {
        const g = this.game;
        if (g.phase === 'peek')
            return this.ids.find(id => !g.players[id].ready) ?? null;
        const effect = g.activeEffect;
        if (effect)
            return this.ids.includes(effect.playerId) ? effect.playerId : null;
        if (g.isRoundRunning && this.ids.includes(g.currentPlayerIndex))
            return g.currentPlayerIndex;
        return null;
    }
    mine(id) {
        const known = this.known.get(id);
        const cards = this.game.players[id].cards;
        return {
            known: cards.filter(c => known.has(c.id)).sort((a, b) => b.points - a.points),
            unknown: cards.filter(c => !known.has(c.id)),
        };
    }
    act(id) {
        const g = this.game;
        try {
            if (g.phase === 'peek')
                return void g.peek(id);
            const effect = g.activeEffect;
            if (effect)
                return this.useEffect(id, effect.type);
            const { known, unknown } = this.mine(id);
            const worst = known[0];
            if (g.phase === 'draw') {
                if (g.isStuck)
                    return g.endTurn(id);
                const top = g.deck.topDiscard;
                const useful = top && top.points <= 2 && (unknown.length > 0 || (worst && worst.points > top.points + 2));
                return void (useful ? g.takeDiscard(id) : g.drawFromPile(id));
            }
            if (g.phase === 'drawn' && g.drawn) {
                const card = g.drawn.card;
                let target;
                if (worst && worst.points > card.points + 1)
                    target = worst;
                else if (card.points <= 4 && unknown.length)
                    target = pick(unknown);
                else if (g.drawn.source === 'discard')
                    target = worst ?? pick(unknown);
                return target ? g.swapDrawn(id, target.id) : g.discardDrawn(id);
            }
            if (g.phase === 'played') {
                const estimate = known.reduce((s, c) => s + c.points, 0) + unknown.length * 6;
                const dutch = g.dutchCallerId === null && unknown.length <= 1 && estimate <= 8;
                return g.endTurn(id, dutch);
            }
        }
        catch (e) {
            if (!(e instanceof RuleError))
                throw e;
            console.warn('Bot', id, e.message);
        }
    }
    useEffect(id, type) {
        const g = this.game;
        const { known, unknown } = this.mine(id);
        const others = g.players.filter(p => p.id !== id && !g.isImmune(p.id) && p.cards.length > 0);
        if (type === 'QUEEN' && unknown.length)
            return void g.queenPeek(id, pick(unknown).id);
        if (type === 'JACK' && known[0] && known[0].points >= 7 && others.length) {
            const give = known[0];
            this.known.get(id).delete(give.id);
            return g.jackSwap(id, give.id, pick(pick(others).cards).id);
        }
        if (type === 'ACE' && others.length) {
            // Give the card to the player with the fewest cards
            const target = others.sort((a, b) => a.cards.length - b.cards.length)[0];
            return g.aceGive(id, target.id);
        }
        g.skipEffect(id);
    }
    /**
     *  A bot that knows a card of the same value as the discard throws it (after a reaction time)
     */
    planThrows() {
        const g = this.game;
        const top = g.deck.topDiscard;
        for (const id of this.ids) {
            if (this.throwTimers.has(id) || !top || !g.canThrow(id))
                continue;
            const match = this.mine(id).known.find(c => c.matches(top));
            if (!match)
                continue;
            this.throwTimers.set(id, setTimeout(() => {
                this.throwTimers.delete(id);
                if (this.paused)
                    return;
                if (g.canThrow(id) && g.deck.topDiscard?.matches(match) && g.players[id].hasCard(match.id)) {
                    try {
                        g.throwCard(id, match.id);
                    }
                    catch (e) {
                        if (!(e instanceof RuleError))
                            throw e;
                    }
                }
            }, 700 + Math.random() * 1100));
        }
    }
}
function pick(items) {
    return items[Math.floor(Math.random() * items.length)];
}
