import { RuleError } from './Dutch.js';
import { applyAction, buildView, faceUp, notice } from './View.js';
/**
 *  Small event emitter shared by the sessions
 */
export class Emitter {
    constructor() {
        this.listeners = [];
    }
    on(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }
    emit(event) {
        for (const listener of this.listeners.slice())
            listener(event);
    }
}
/**
 *  Find a card in the hands (reveals are always about cards in a hand)
 */
export function findHandCard(game, cardId) {
    return game.ownerOf(cardId)?.getCard(cardId);
}
/**
 *  Hot-seat: one screen, one engine, every player acts from this device
 */
export class LocalSession {
    constructor(game) {
        this.viewerId = null;
        this.isHost = true;
        this.canShowAll = true;
        this.state = null;
        this.events = new Emitter();
        this.showAll = false;
        this.game = game;
        game.on(event => {
            if (event.type === 'reveal') {
                const card = findHandCard(game, event.cardId);
                if (card)
                    this.events.emit({ type: 'reveal', card: faceUp(card) });
            }
            else {
                this.refresh();
            }
        });
        this.refresh();
    }
    dispatch(action) {
        try {
            const notice = applyAction(this.game, action);
            if (notice)
                this.events.emit({ type: 'notice', notice });
        }
        catch (e) {
            if (!(e instanceof RuleError))
                throw e;
            this.events.emit({ type: 'notice', notice: notice('error', e.msg) });
        }
    }
    setShowAll(on) {
        this.showAll = on;
        this.refresh();
    }
    on(listener) {
        return this.events.on(listener);
    }
    refresh() {
        this.state = buildView(this.game, null, { showAll: this.showAll });
        this.events.emit({ type: 'state' });
    }
}
