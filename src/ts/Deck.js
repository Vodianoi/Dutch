import Card, { SUITS, VALUES } from './Card.js';
/**
 *  Deck class
 *  - Holds the draw pile (pioche, face down) and the discard pile (pile de rejet, face up)
 *  - Everything is local: no network call, the game works offline and on GitHub Pages
 */
class Deck {
    // endregion
    // region Constructor
    /**
     *  Create a new shuffled shoe of `deckCount` decks without jokers
     * @param deckCount
     * @param rng
     */
    constructor(deckCount = 1, rng = Math.random) {
        // region Public Properties
        /**
         *  Draw pile, last element is the top of the pile
         */
        this.drawPile = [];
        /**
         *  Discard pile, last element is the top (visible) card
         */
        this.discardPile = [];
        this.deckCount = deckCount;
        this.rng = rng;
        const faces = [];
        for (let d = 0; d < deckCount; d++) {
            for (const suit of SUITS) {
                for (const value of VALUES)
                    faces.push([value, suit]);
            }
        }
        this.shuffle(faces);
        // Ids are given after shuffling so that an id never tells which card it is:
        // in online games, face down cards are sent to the other players with their id only.
        const prefix = Math.floor(this.rng() * 36 ** 4).toString(36);
        this.drawPile = faces.map(([value, suit], i) => new Card(`${prefix}-${i}`, value, suit));
    }
    // endregion
    // region Public Methods
    /**
     *  Cards left in the draw pile
     */
    get remaining() {
        return this.drawPile.length;
    }
    /**
     *  Visible card of the discard pile
     */
    get topDiscard() {
        return this.discardPile[this.discardPile.length - 1];
    }
    /**
     *  Draw one card from the draw pile.
     *  When the draw pile is empty, the discard pile (except its top card) is shuffled
     *  back into the draw pile (issue #5). Returns undefined if no card is left at all.
     */
    draw() {
        if (this.drawPile.length === 0)
            this.reshuffleDiscard();
        return this.drawPile.pop();
    }
    /**
     *  Draw several cards
     * @param count
     */
    drawMany(count) {
        const res = [];
        for (let i = 0; i < count; i++) {
            const card = this.draw();
            if (!card)
                break;
            res.push(card);
        }
        return res;
    }
    /**
     *  Put a card face up on the discard pile
     * @param card
     */
    discard(card) {
        this.discardPile.push(card);
    }
    /**
     *  Take the visible card of the discard pile
     */
    takeDiscard() {
        return this.discardPile.pop();
    }
    /**
     *  Shuffle every discarded card but the visible one back into the draw pile
     * @returns true if cards were moved
     */
    reshuffleDiscard() {
        if (this.discardPile.length <= 1)
            return false;
        const top = this.discardPile.pop();
        this.drawPile = this.discardPile.concat(this.drawPile);
        this.discardPile = [top];
        this.shuffle(this.drawPile);
        return true;
    }
    // endregion
    // region Private Methods
    /**
     *  Fisher-Yates shuffle
     * @param cards
     * @private
     */
    shuffle(cards) {
        for (let i = cards.length - 1; i > 0; i--) {
            const j = Math.floor(this.rng() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }
    }
}
export default Deck;
