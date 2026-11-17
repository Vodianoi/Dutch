/**
 *  Player class
 *  - Pure data: name, hand, scores and per-turn flags
 *  - Game rules live in Dutch.ts, rendering in ui/GameView.ts
 */
class Player {
    // endregion
    // region Constructor
    constructor(id, name) {
        /**
         *  Player's hand, face down
         */
        this.hand = [];
        /**
         *  Total score across rounds
         */
        this.score = 0;
        /**
         *  Score of each finished round (penalty included)
         */
        this.roundScores = [];
        /**
         *  Ready to start the round (only used with the "peek 2 cards" variant)
         */
        this.ready = false;
        /**
         *  A wrong throw locks the player until the end of the current turn
         */
        this.locked = false;
        this.id = id;
        this.name = name;
    }
    // endregion
    // region Public Methods
    /**
     *  Sum of the points of the cards in hand
     */
    get handPoints() {
        return this.hand.reduce((sum, card) => sum + card.points, 0);
    }
    hasCard(cardId) {
        return this.hand.some(card => card.id === cardId);
    }
    getCard(cardId) {
        return this.hand.find(card => card.id === cardId);
    }
    /**
     *  Remove a card from the hand and return it
     * @param cardId
     */
    removeCard(cardId) {
        const index = this.hand.findIndex(card => card.id === cardId);
        if (index < 0)
            return undefined;
        return this.hand.splice(index, 1)[0];
    }
    /**
     *  Replace a card at the same position in the hand
     * @param cardId card to replace
     * @param card new card
     * @returns the replaced card
     */
    replaceCard(cardId, card) {
        const index = this.hand.findIndex(c => c.id === cardId);
        if (index < 0)
            return undefined;
        const old = this.hand[index];
        this.hand[index] = card;
        return old;
    }
    addCard(card) {
        this.hand.push(card);
    }
    /**
     *  Reset the round state (keeps total score)
     */
    resetForRound() {
        this.hand = [];
        this.ready = false;
        this.locked = false;
    }
}
export default Player;
