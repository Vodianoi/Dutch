import { Bots } from './Bots.js';
import { RuleError } from './Dutch.js';
import { Emitter, findHandCard } from './Session.js';
import { applyAction, buildView, faceUp } from './View.js';
/**
 *  "Contre l'ordinateur": this device plays seat 0, computer players play the other seats.
 *  Like an online game, the player only sees his own cards when they are revealed to him.
 */
export class SoloSession {
    /**
     * @param game the engine (new or restored), seat 0 is the player of this device
     * @param persist called after every change with the whole game (to continue it after a reload)
     */
    constructor(game, persist, botOptions = {}) {
        this.game = game;
        this.persist = persist;
        this.viewerId = 0;
        this.isHost = true;
        this.canShowAll = true;
        this.state = null;
        this.events = new Emitter();
        this.showAll = false;
        this.bots = new Bots(game, game.players.slice(1).map(p => p.id), botOptions);
        this.unsubscribe = game.on(event => {
            if (event.type === 'reveal') {
                if (!event.public && event.playerId !== this.viewerId)
                    return;
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
            // This device only plays its own seat
            const notice = applyAction(this.game, { ...action, playerId: this.viewerId });
            if (notice)
                this.events.emit({ type: 'notice', notice });
        }
        catch (e) {
            if (!(e instanceof RuleError))
                throw e;
            this.events.emit({ type: 'notice', notice: { text: e.message, kind: 'error' } });
        }
    }
    setShowAll(on) {
        this.showAll = on;
        this.refresh();
    }
    on(listener) {
        return this.events.on(listener);
    }
    /** Leaving the game: the bots stop playing */
    close() {
        this.bots.stop();
        this.unsubscribe();
    }
    refresh() {
        this.state = buildView(this.game, this.viewerId, { showAll: this.showAll });
        this.persist?.(this.game.snapshot());
        this.events.emit({ type: 'state' });
        this.bots.schedule();
    }
}
