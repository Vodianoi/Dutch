import Card from './Card.js';

/**
 *  Player class
 *  - Pure data: name, hand, scores and per-turn flags
 *  - Game rules live in Dutch.ts, rendering in ui/GameView.ts
 */
class Player {

    // region Public Properties
    /**
     *  Player's id (index in the game)
     */
    public readonly id: number;

    /**
     *  Player's name
     */
    public readonly name: string;

    /**
     *  Colour of the player's avatar (see PLAYER_COLORS)
     */
    public readonly color: string;

    /**
     *  Player's hand, face down, by position. A card that leaves the hand leaves a hole (null)
     *  so that the other cards keep their place: players remember their cards by position.
     */
    public hand: (Card | null)[] = [];

    /**
     *  Total score across rounds
     */
    public score: number = 0;

    /**
     *  Score of each finished round (penalty included)
     */
    public roundScores: number[] = [];

    /**
     *  Ready to start the round (only used with the "peek 2 cards" variant)
     */
    public ready: boolean = false;

    /**
     *  A wrong throw locks the player until the end of the current turn
     */
    public locked: boolean = false;
    // endregion

    // region Constructor
    constructor(id: number, name: string, color: string) {
        this.id = id;
        this.name = name;
        this.color = color;
    }
    // endregion

    // region Public Methods
    /**
     *  Cards in hand, without the holes
     */
    public get cards(): Card[] {
        return this.hand.filter((card): card is Card => card !== null);
    }

    /**
     *  Sum of the points of the cards in hand
     */
    public get handPoints(): number {
        return this.cards.reduce((sum, card) => sum + card.points, 0);
    }

    public hasCard(cardId: string): boolean {
        return this.hand.some(card => card?.id === cardId);
    }

    public getCard(cardId: string): Card | undefined {
        return this.cards.find(card => card.id === cardId);
    }

    /**
     *  Remove a card from the hand and return it; its place stays empty
     * @param cardId
     */
    public removeCard(cardId: string): Card | undefined {
        const index = this.hand.findIndex(card => card?.id === cardId);
        if (index < 0) return undefined;
        const card = this.hand[index]!;
        this.hand[index] = null;
        return card;
    }

    /**
     *  Replace a card at the same position in the hand
     * @param cardId card to replace
     * @param card new card
     * @returns the replaced card
     */
    public replaceCard(cardId: string, card: Card): Card | undefined {
        const index = this.hand.findIndex(c => c?.id === cardId);
        if (index < 0) return undefined;
        const old = this.hand[index]!;
        this.hand[index] = card;
        return old;
    }

    /**
     *  A new card (penalty, Ace) takes the first empty place, or goes after the last card
     */
    public addCard(card: Card) {
        const hole = this.hand.indexOf(null);
        if (hole >= 0) this.hand[hole] = card;
        else this.hand.push(card);
    }

    /**
     *  Reset the round state (keeps total score)
     */
    public resetForRound() {
        this.hand = [];
        this.ready = false;
        this.locked = false;
    }
    // endregion
}

export default Player;
