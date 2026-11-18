import {BotOptions, Bots} from './Bots.js';
import Dutch, {DutchSnapshot, RuleError} from './Dutch.js';
import {Emitter, findHandCard, Session, SessionEvent} from './Session.js';
import {Action, applyAction, buildView, faceUp, GameView} from './View.js';

/**
 *  "Contre l'ordinateur": this device plays seat 0, computer players play the other seats.
 *  Like an online game, the player only sees his own cards when they are revealed to him.
 */
export class SoloSession implements Session {
    public readonly viewerId = 0;
    public readonly isHost = true;
    public readonly canShowAll = true;
    public state: GameView | null = null;

    private readonly events = new Emitter<SessionEvent>();
    private readonly bots: Bots;
    private showAll = false;
    private readonly unsubscribe: () => void;

    /**
     * @param game the engine (new or restored), seat 0 is the player of this device
     * @param persist called after every change with the whole game (to continue it after a reload)
     */
    constructor(public readonly game: Dutch, private readonly persist?: (snapshot: DutchSnapshot) => void, botOptions: BotOptions = {}) {
        this.bots = new Bots(game, game.players.slice(1).map(p => p.id), botOptions);
        this.unsubscribe = game.on(event => {
            if (event.type === 'reveal') {
                if (!event.public && event.playerId !== this.viewerId) return;
                const card = findHandCard(game, event.cardId);
                if (card) this.events.emit({type: 'reveal', card: faceUp(card)});
            } else {
                this.refresh();
            }
        });
        this.refresh();
    }

    public dispatch(action: Action) {
        try {
            // This device only plays its own seat
            const notice = applyAction(this.game, {...action, playerId: this.viewerId});
            if (notice) this.events.emit({type: 'notice', notice});
        } catch (e) {
            if (!(e instanceof RuleError)) throw e;
            this.events.emit({type: 'notice', notice: {text: e.message, kind: 'error'}});
        }
    }

    public setShowAll(on: boolean) {
        this.showAll = on;
        this.refresh();
    }

    public on(listener: (event: SessionEvent) => void) {
        return this.events.on(listener);
    }

    /** Leaving the game: the bots stop playing */
    public close() {
        this.bots.stop();
        this.unsubscribe();
    }

    private refresh() {
        this.state = buildView(this.game, this.viewerId, {showAll: this.showAll});
        this.persist?.(this.game.snapshot());
        this.events.emit({type: 'state'});
        this.bots.schedule();
    }
}
