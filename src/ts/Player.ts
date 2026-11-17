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
     *  Player's hand, face down
     */
    public hand: Card[] = [];

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
    constructor(id: number, name: string) {
        this.id = id;
        this.name = name;
    }
    // endregion

    // region Public Methods
    /**
     *  Sum of the points of the cards in hand
     */
    public get handPoints(): number {
        return this.hand.reduce((sum, card) => sum + card.points, 0);
    }

    public hasCard(cardId: string): boolean {
        return this.hand.some(card => card.id === cardId);
    }

    public getCard(cardId: string): Card | undefined {
        return this.hand.find(card => card.id === cardId);
    }

    /**
     *  Remove a card from the hand and return it
     * @param cardId
     */
    public removeCard(cardId: string): Card | undefined {
        const index = this.hand.findIndex(card => card.id === cardId);
        if (index < 0) return undefined;
        return this.hand.splice(index, 1)[0];
    }

    /**
     *  Replace a card at the same position in the hand
     * @param cardId card to replace
     * @param card new card
     * @returns the replaced card
     */
    public replaceCard(cardId: string, card: Card): Card | undefined {
        const index = this.hand.findIndex(c => c.id === cardId);
        if (index < 0) return undefined;
        const old = this.hand[index];
        this.hand[index] = card;
        return old;
    }

    public addCard(card: Card) {
        this.hand.push(card);
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
