import Dutch, {RuleError} from './Dutch.js';
import {Action, applyAction, buildView, CardView, faceUp, GameView, Notice} from './View.js';

/**
 *  A Session is what the game screen talks to:
 *  - it exposes the view of the game for this device (`state`)
 *  - it sends the actions of this device (`dispatch`)
 *  - it emits events: new state, a card to reveal, a notice to show, the session closed
 *
 *  Implementations:
 *  - LocalSession: everybody on the same screen (hot-seat)
 *  - net/Host: online game, this device runs the engine and is seat 0
 *  - net/Client: online game, the engine runs on the host's device
 */
export type SessionEvent =
    | { type: 'state' }
    | { type: 'reveal'; card: CardView }
    | { type: 'notice'; notice: Notice }
    | { type: 'lobby' }
    | { type: 'closed'; reason: string };

export interface Session {
    /** Seat of this device, null on a shared screen */
    readonly viewerId: number | null;
    /** Can start the next round / a new game */
    readonly isHost: boolean;
    /** Debug "show every card" is only possible where the engine runs */
    readonly canShowAll: boolean;
    readonly state: GameView | null;
    dispatch(action: Action): void;
    setShowAll(on: boolean): void;
    on(listener: (event: SessionEvent) => void): () => void;
}

/**
 *  Small event emitter shared by the sessions
 */
export class Emitter<E> {
    private listeners: ((event: E) => void)[] = [];

    public on(listener: (event: E) => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    public emit(event: E) {
        for (const listener of this.listeners.slice()) listener(event);
    }
}

/**
 *  Find a card in the hands (reveals are always about cards in a hand)
 */
export function findHandCard(game: Dutch, cardId: string) {
    return game.ownerOf(cardId)?.getCard(cardId);
}

/**
 *  Hot-seat: one screen, one engine, every player acts from this device
 */
export class LocalSession implements Session {
    public readonly viewerId = null;
    public readonly isHost = true;
    public readonly canShowAll = true;
    public state: GameView | null = null;

    private readonly game: Dutch;
    private readonly events = new Emitter<SessionEvent>();
    private showAll = false;

    constructor(game: Dutch) {
        this.game = game;
        game.on(event => {
            if (event.type === 'reveal') {
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
            const notice = applyAction(this.game, action);
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

    private refresh() {
        this.state = buildView(this.game, null, {showAll: this.showAll});
        this.events.emit({type: 'state'});
    }
}
