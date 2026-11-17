import Card, {Suit, SUITS, Value, VALUES} from './Card.js';

/**
 *  Random number generator returning a float in [0, 1)
 */
export type Rng = () => number;

/**
 *  Deck class
 *  - Holds the draw pile (pioche, face down) and the discard pile (pile de rejet, face up)
 *  - Everything is local: no network call, the game works offline and on GitHub Pages
 */
class Deck {

    // region Public Properties
    /**
     *  Draw pile, last element is the top of the pile
     */
    public drawPile: Card[] = [];

    /**
     *  Discard pile, last element is the top (visible) card
     */
    public discardPile: Card[] = [];

    /**
     *  Number of standard 52 cards decks used (the rules recommend 2 = 104 cards)
     */
    public readonly deckCount: number;
    // endregion

    // region Private Properties
    private readonly rng: Rng;
    // endregion

    // region Constructor
    /**
     *  Create a new shuffled shoe of `deckCount` decks without jokers
     * @param deckCount
     * @param rng
     */
    constructor(deckCount: number = 1, rng: Rng = Math.random) {
        this.deckCount = deckCount;
        this.rng = rng;
        const faces: [Value, Suit][] = [];
        for (let d = 0; d < deckCount; d++) {
            for (const suit of SUITS) {
                for (const value of VALUES) faces.push([value, suit]);
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
    public get remaining(): number {
        return this.drawPile.length;
    }

    /**
     *  Visible card of the discard pile
     */
    public get topDiscard(): Card | undefined {
        return this.discardPile[this.discardPile.length - 1];
    }

    /**
     *  Draw one card from the draw pile.
     *  When the draw pile is empty, the discard pile (except its top card) is shuffled
     *  back into the draw pile (issue #5). Returns undefined if no card is left at all.
     */
    public draw(): Card | undefined {
        if (this.drawPile.length === 0) this.reshuffleDiscard();
        return this.drawPile.pop();
    }

    /**
     *  Draw several cards
     * @param count
     */
    public drawMany(count: number): Card[] {
        const res: Card[] = [];
        for (let i = 0; i < count; i++) {
            const card = this.draw();
            if (!card) break;
            res.push(card);
        }
        return res;
    }

    /**
     *  Put a card face up on the discard pile
     * @param card
     */
    public discard(card: Card) {
        this.discardPile.push(card);
    }

    /**
     *  Take the visible card of the discard pile
     */
    public takeDiscard(): Card | undefined {
        return this.discardPile.pop();
    }

    /**
     *  Shuffle every discarded card but the visible one back into the draw pile
     * @returns true if cards were moved
     */
    public reshuffleDiscard(): boolean {
        if (this.discardPile.length <= 1) return false;
        const top = this.discardPile.pop()!;
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
    private shuffle<T>(cards: T[]) {
        for (let i = cards.length - 1; i > 0; i--) {
            const j = Math.floor(this.rng() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }
    }
    // endregion
}

export default Deck;
