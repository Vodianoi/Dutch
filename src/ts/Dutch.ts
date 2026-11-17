import Card from './Card.js';
import Deck, {Rng} from './Deck.js';
import Player from './Player.js';

// region Types
/**
 *  Phases of a round
 *  - peek:      (variant) players look at their 2 last cards before the round starts
 *  - draw:      current player must draw from the draw pile or take the discard
 *  - drawn:     current player holds a card and must swap it (or discard it if it comes from the draw pile)
 *  - played:    current player has played, he can end his turn or say "Dutch"
 *  - roundOver: points are counted, waiting for next round
 *  - gameOver:  someone reached the target score
 */
export type Phase = 'peek' | 'draw' | 'drawn' | 'played' | 'roundOver' | 'gameOver';

export type LogKind = 'info' | 'good' | 'bad' | 'dutch' | 'score';

export interface LogEntry {
    round: number;
    kind: LogKind;
    message: string;
}

export interface DrawnCard {
    card: Card;
    source: 'pile' | 'discard';
}

export interface RoundScore {
    playerId: number;
    points: number;
    penalty: number;
    total: number;
}

export interface RoundResult {
    round: number;
    dutchCallerId: number | null;
    scores: RoundScore[];
    hands: Record<number, Card[]>;
    gameOver: boolean;
    winners: number[];
}

/**
 *  Events emitted to the UI
 *  - change: the state changed, re-render
 *  - reveal: show a face down card for a short time (the owner gets to know it)
 */
export type GameEvent =
    | { type: 'change' }
    | { type: 'reveal'; cardId: string; playerId: number };

export interface DutchOptions {
    players: string[];
    deckCount?: number;
    cardsPerPlayer?: number;
    targetScore?: number;
    dutchPenalty?: number;
    peekVariant?: boolean;
    rng?: Rng;
}

/**
 *  Thrown when an action is not allowed by the rules; the message is shown to the players
 */
export class RuleError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RuleError';
    }
}
// endregion

/**
 *  Dutch game engine
 *  - Holds the whole game state and enforces the rules of the README
 *  - No DOM access: the UI calls the actions and listens to the events
 */
class Dutch {

    // region Public Properties
    public readonly players: Player[];
    public deck: Deck;
    public phase: Phase = 'draw';
    public round: number = 0;

    /**
     *  Index of the player whose turn it is
     */
    public currentPlayerIndex: number = 0;

    /**
     *  Card held by the current player after drawing
     */
    public drawn: DrawnCard | null = null;

    /**
     *  Player who said "Dutch" this round
     */
    public dutchCallerId: number | null = null;

    /**
     *  Turns left to play after "Dutch" was called
     */
    public finalTurnsLeft: number = 0;

    public log: LogEntry[] = [];
    public lastResult: RoundResult | null = null;

    public readonly deckCount: number;
    public readonly cardsPerPlayer: number;
    public readonly targetScore: number;
    public readonly dutchPenalty: number;
    public readonly peekVariant: boolean;
    // endregion

    // region Private Properties
    private readonly rng: Rng;
    private firstPlayerIndex: number = 0;
    private listeners: ((event: GameEvent) => void)[] = [];
    // endregion

    // region Constructor
    constructor(options: DutchOptions) {
        if (options.players.length < 2 || options.players.length > 10) {
            throw new RuleError('Le Dutch se joue de 2 à 10 joueurs.');
        }
        this.players = options.players.map((name, i) => new Player(i, name));
        this.deckCount = options.deckCount ?? 2;
        this.cardsPerPlayer = options.cardsPerPlayer ?? 4;
        this.targetScore = options.targetScore ?? 100;
        this.dutchPenalty = options.dutchPenalty ?? 10;
        this.peekVariant = options.peekVariant ?? false;
        this.rng = options.rng ?? Math.random;
        this.deck = new Deck(this.deckCount, this.rng);
    }
    // endregion

    // region Getters
    public get currentPlayer(): Player {
        return this.players[this.currentPlayerIndex];
    }

    public get isFinalRound(): boolean {
        return this.dutchCallerId !== null;
    }

    public get isRoundRunning(): boolean {
        return this.phase === 'draw' || this.phase === 'drawn' || this.phase === 'played';
    }

    public getPlayer(id: number): Player {
        const player = this.players[id];
        if (!player) throw new RuleError(`Joueur inconnu (${id}).`);
        return player;
    }

    /**
     *  Can this player try to throw a card on the discard pile right now?
     */
    public canThrow(playerId: number): boolean {
        const player = this.players[playerId];
        return !!player
            && (this.phase === 'draw' || this.phase === 'played')
            && !player.locked
            && !!this.deck.topDiscard;
    }

    /**
     *  Can the current player end his turn? (issue #4: he must have played first)
     */
    public get canEndTurn(): boolean {
        if (this.phase === 'played') return true;
        // Nothing left to draw at all: the player is allowed to pass
        return this.phase === 'draw' && this.isStuck;
    }

    /**
     *  No card can be drawn and the discard can't be taken
     */
    public get isStuck(): boolean {
        return this.deck.remaining === 0
            && this.deck.discardPile.length <= 1
            && (this.currentPlayer.hand.length === 0 || !this.deck.topDiscard);
    }
    // endregion

    // region Events
    public on(listener: (event: GameEvent) => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private emit(event: GameEvent) {
        for (const listener of this.listeners) listener(event);
    }

    private changed() {
        this.emit({type: 'change'});
    }

    private reveal(player: Player, card: Card) {
        this.emit({type: 'reveal', cardId: card.id, playerId: player.id});
    }

    private addLog(message: string, kind: LogKind = 'info') {
        this.log.push({round: this.round, kind, message});
    }
    // endregion

    // region Round lifecycle
    /**
     *  Start a new round
     *  - New shuffled shoe
     *  - Deal 4 cards face down to each player
     *  - Put the top card of the draw pile on the discard pile
     */
    public startRound() {
        if (this.phase === 'gameOver') throw new RuleError('La partie est terminée.');
        this.round++;
        this.deck = new Deck(this.deckCount, this.rng);
        for (const player of this.players) {
            player.resetForRound();
            player.hand = this.deck.drawMany(this.cardsPerPlayer);
        }
        this.deck.discard(this.deck.draw()!);
        this.drawn = null;
        this.dutchCallerId = null;
        this.finalTurnsLeft = 0;
        this.lastResult = null;
        this.currentPlayerIndex = this.firstPlayerIndex;

        this.addLog(`— Ronde ${this.round} — ${this.deck.deckCount * 52} cartes, ${this.cardsPerPlayer} cartes chacun.`, 'info');
        if (this.peekVariant) {
            this.phase = 'peek';
            this.addLog('Chaque joueur regarde ses 2 dernières cartes.', 'info');
        } else {
            this.phase = 'draw';
            this.addLog(`C'est au tour de ${this.currentPlayer.name}.`, 'info');
        }
        this.changed();
    }

    /**
     *  Variant: a player looks at his 2 last cards and is ready
     * @returns the revealed cards
     */
    public peek(playerId: number): Card[] {
        if (this.phase !== 'peek') throw new RuleError('Ce n\'est pas le moment de regarder ses cartes.');
        const player = this.getPlayer(playerId);
        if (player.ready) throw new RuleError(`${player.name} a déjà regardé ses cartes.`);
        const cards = player.hand.slice(-2);
        cards.forEach(card => this.reveal(player, card));
        player.ready = true;
        this.addLog(`${player.name} regarde ses 2 dernières cartes.`, 'info');
        if (this.players.every(p => p.ready)) {
            this.phase = 'draw';
            this.addLog(`C'est au tour de ${this.currentPlayer.name}.`, 'info');
        }
        this.changed();
        return cards;
    }

    /**
     *  Count the points of the round and check the end of the game
     */
    private endRound() {
        const hands: Record<number, Card[]> = {};
        const points = this.players.map(p => {
            hands[p.id] = p.hand.slice();
            return p.handPoints;
        });
        const lowest = Math.min(...points);
        const scores: RoundScore[] = this.players.map((p, i) => {
            let penalty = 0;
            // A player who says "Dutch" and doesn't have the lowest score gets a penalty.
            // On a tie, the player who said "Dutch" has the advantage.
            if (p.id === this.dutchCallerId && points[i] > lowest) penalty = this.dutchPenalty;
            const roundTotal = points[i] + penalty;
            p.roundScores.push(roundTotal);
            p.score += roundTotal;
            return {playerId: p.id, points: points[i], penalty, total: p.score};
        });

        this.addLog(`Fin de la ronde ${this.round} : ` + scores
            .map(s => `${this.players[s.playerId].name} ${s.points}${s.penalty ? ` (+${s.penalty})` : ''}`)
            .join(', '), 'score');

        const gameOver = this.players.some(p => p.score >= this.targetScore);
        let winners: number[] = [];
        if (gameOver) {
            const best = Math.min(...this.players.map(p => p.score));
            winners = this.players.filter(p => p.score === best).map(p => p.id);
            this.addLog(`Partie terminée ! Victoire de ${winners.map(id => this.players[id].name).join(' et ')} avec ${best} points.`, 'dutch');
        }

        this.lastResult = {round: this.round, dutchCallerId: this.dutchCallerId, scores, hands, gameOver, winners};
        this.phase = gameOver ? 'gameOver' : 'roundOver';
        this.drawn = null;
        this.firstPlayerIndex = (this.firstPlayerIndex + 1) % this.players.length;
        this.changed();
    }

    public nextRound() {
        if (this.phase !== 'roundOver') throw new RuleError('La ronde n\'est pas terminée.');
        this.startRound();
    }
    // endregion

    // region Turn actions
    private assertCurrent(playerId: number) {
        if (!this.isRoundRunning) throw new RuleError('Aucune ronde en cours.');
        if (playerId !== this.currentPlayerIndex) {
            throw new RuleError(`Ce n'est pas le tour de ${this.getPlayer(playerId).name}.`);
        }
    }

    /**
     *  Draw the top card of the draw pile (pioche)
     */
    public drawFromPile(playerId: number): Card {
        this.assertCurrent(playerId);
        if (this.phase !== 'draw') throw new RuleError('Vous avez déjà pioché ce tour-ci.');
        const reshuffled = this.deck.remaining === 0 && this.deck.discardPile.length > 1;
        const card = this.deck.draw();
        if (!card) throw new RuleError('Il n\'y a plus de carte dans la pioche.');
        if (reshuffled) this.addLog('La pioche est vide : la pile de rejet est mélangée pour refaire la pioche.', 'info');
        this.drawn = {card, source: 'pile'};
        this.phase = 'drawn';
        this.addLog(`${this.currentPlayer.name} pioche une carte.`, 'info');
        this.changed();
        return card;
    }

    /**
     *  Take the visible card of the discard pile. The player must then swap it with one of his cards.
     */
    public takeDiscard(playerId: number): Card {
        this.assertCurrent(playerId);
        if (this.phase !== 'draw') throw new RuleError('Vous avez déjà pioché ce tour-ci.');
        if (this.currentPlayer.hand.length === 0) {
            throw new RuleError('Sans carte en main, impossible d\'échanger : piochez plutôt.');
        }
        const card = this.deck.takeDiscard();
        if (!card) throw new RuleError('La pile de rejet est vide.');
        this.drawn = {card, source: 'discard'};
        this.phase = 'drawn';
        this.addLog(`${this.currentPlayer.name} prend ${card} de la pile de rejet.`, 'info');
        this.changed();
        return card;
    }

    /**
     *  Swap the drawn card with a card of the hand; the hand card goes to the discard pile
     */
    public swapDrawn(playerId: number, handCardId: string) {
        this.assertCurrent(playerId);
        if (this.phase !== 'drawn' || !this.drawn) throw new RuleError('Piochez d\'abord une carte.');
        const player = this.currentPlayer;
        const newCard = this.drawn.card;
        const old = player.replaceCard(handCardId, newCard);
        if (!old) throw new RuleError('Cette carte n\'est pas dans votre main.');
        this.drawn = null;
        this.phase = 'played';
        this.addLog(`${player.name} échange une carte et jette ${old}.`, 'info');
        this.discardCard(old);
        // The player now knows the card he just placed
        this.reveal(player, newCard);
        this.changed();
    }

    /**
     *  Throw the card drawn from the draw pile without keeping it
     */
    public discardDrawn(playerId: number) {
        this.assertCurrent(playerId);
        if (this.phase !== 'drawn' || !this.drawn) throw new RuleError('Piochez d\'abord une carte.');
        if (this.drawn.source === 'discard') {
            throw new RuleError('Une carte prise dans la pile de rejet doit être échangée.');
        }
        const card = this.drawn.card;
        this.drawn = null;
        this.phase = 'played';
        this.addLog(`${this.currentPlayer.name} jette ${card}.`, 'info');
        this.discardCard(card);
        this.changed();
    }

    /**
     *  Any player (not only the current one) throws a card of the same value as the visible discard.
     *  - Right value: the card goes to the discard pile 
     *  - Wrong value: the card stays, the player gets a penalty card and can't throw again this turn
     * @returns true if the card matched
     */
    public throwCard(playerId: number, cardId: string): boolean {
        const player = this.getPlayer(playerId);
        if (!this.isRoundRunning) throw new RuleError('Aucune ronde en cours.');
        if (this.phase === 'drawn') {
            throw new RuleError(`Attendez que ${this.currentPlayer.name} ait joué sa carte.`);
        }
        if (player.locked) throw new RuleError(`${player.name} s'est trompé : plus de carte à jeter durant ce tour.`);
        const card = player.getCard(cardId);
        if (!card) throw new RuleError('Cette carte n\'est pas dans votre main.');
        const top = this.deck.topDiscard;
        if (!top) throw new RuleError('La pile de rejet est vide.');

        if (card.matches(top)) {
            player.removeCard(cardId);
            this.addLog(`${player.name} jette ${card} sur ${top} !`, 'good');
            this.discardCard(card);
            this.changed();
            return true;
        }

        player.locked = true;
        this.reveal(player, card);
        const penalty = this.deck.draw();
        if (penalty) {
            player.addCard(penalty);
            this.addLog(`${player.name} se trompe (${card} ≠ ${top}) : carte de pénalité.`, 'bad');
        } else {
            this.addLog(`${player.name} se trompe (${card} ≠ ${top}), mais il n'y a plus de carte de pénalité.`, 'bad');
        }
        this.changed();
        return false;
    }

    /**
     *  End the turn of the current player, optionally saying "Dutch"
     */
    public endTurn(playerId: number, callDutch: boolean = false) {
        this.assertCurrent(playerId);
        if (!this.canEndTurn) throw new RuleError('Vous devez jouer (piocher ou prendre le rejet) avant de finir votre tour.');
        const player = this.currentPlayer;

        if (callDutch) {
            if (this.dutchCallerId !== null) {
                throw new RuleError(`${this.players[this.dutchCallerId].name} a déjà dit Dutch.`);
            }
            this.dutchCallerId = player.id;
            this.finalTurnsLeft = this.players.length - 1;
            this.addLog(`${player.name} dit « Dutch » ! Dernier tour pour les autres joueurs.`, 'dutch');
        } else if (this.dutchCallerId !== null) {
            this.finalTurnsLeft--;
        }

        this.players.forEach(p => p.locked = false);

        if (this.dutchCallerId !== null && this.finalTurnsLeft <= 0) {
            this.endRound();
            return;
        }

        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.phase = 'draw';
        this.addLog(`${this.isFinalRound ? 'Dernier tour' : 'Au tour'} de ${this.currentPlayer.name}.`, 'info');
        this.changed();
    }
    // endregion

    // region Helpers
    private discardCard(card: Card) {
        this.deck.discard(card);
    }
    // endregion
}

export default Dutch;
