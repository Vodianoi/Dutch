/**
 *  Player class
 *  - Pure data: name, hand, scores and per-turn flags
 *  - Game rules live in Dutch.ts, rendering in ui/GameView.ts
 */
class Player {
    // endregion
    // region Constructor
    constructor(id, name, color) {
        /**
         *  Player's hand, face down, by position. A card that leaves the hand leaves a hole (null)
         *  so that the other cards keep their place: players remember their cards by position.
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
        this.color = color;
    }
    // endregion
    // region Public Methods
    /**
     *  Cards in hand, without the holes
     */
    get cards() {
        return this.hand.filter((card) => card !== null);
    }
    /**
     *  Sum of the points of the cards in hand
     */
    get handPoints() {
        return this.cards.reduce((sum, card) => sum + card.points, 0);
    }
    hasCard(cardId) {
        return this.hand.some(card => card?.id === cardId);
    }
    getCard(cardId) {
        return this.cards.find(card => card.id === cardId);
    }
    /**
     *  Remove a card from the hand and return it; its place stays empty
     * @param cardId
     */
    removeCard(cardId) {
        const index = this.hand.findIndex(card => card?.id === cardId);
        if (index < 0)
            return undefined;
        const card = this.hand[index];
        this.hand[index] = null;
        return card;
    }
    /**
     *  Replace a card at the same position in the hand
     * @param cardId card to replace
     * @param card new card
     * @returns the replaced card
     */
    replaceCard(cardId, card) {
        const index = this.hand.findIndex(c => c?.id === cardId);
        if (index < 0)
            return undefined;
        const old = this.hand[index];
        this.hand[index] = card;
        return old;
    }
    /**
     *  A new card (penalty, Ace) takes the first empty place, or goes after the last card
     */
    addCard(card) {
        const hole = this.hand.indexOf(null);
        if (hole >= 0)
            this.hand[hole] = card;
        else
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
