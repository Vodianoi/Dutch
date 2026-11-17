/**
 *  Card model
 *  - Pure data, no DOM: the UI renders cards from this model (see ui/GameView.ts)
 *  - Value and suit names follow the deckofcardsapi.com conventions used before
 *    (ACE, 2..10, JACK, QUEEN, KING / HEARTS, DIAMONDS, CLUBS, SPADES)
 */
export const SUITS = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
export const VALUES = ['ACE', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'JACK', 'QUEEN', 'KING'];
const SUIT_SYMBOLS = {
    HEARTS: '♥',
    DIAMONDS: '♦',
    CLUBS: '♣',
    SPADES: '♠',
};
const VALUE_LABELS = {
    ACE: 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
    '8': '8', '9': '9', '10': '10', JACK: 'V', QUEEN: 'D', KING: 'R',
};
const VALUE_NAMES = {
    ACE: 'As', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
    '8': '8', '9': '9', '10': '10', JACK: 'Valet', QUEEN: 'Dame', KING: 'Roi',
};
const SUIT_NAMES = {
    HEARTS: 'cœur',
    DIAMONDS: 'carreau',
    CLUBS: 'trèfle',
    SPADES: 'pique',
};
class Card {
    // endregion
    // region Constructor
    constructor(id, value, suit) {
        this.id = id;
        this.value = value;
        this.suit = suit;
    }
    // endregion
    // region Public Methods
    /**
     *  Short code, e.g. "AS", "0H" (10 of hearts), "KD"
     */
    get code() {
        const v = this.value === '10' ? '0' : this.value[0];
        return `${v}${this.suit[0]}`;
    }
    get isRed() {
        return this.suit === 'HEARTS' || this.suit === 'DIAMONDS';
    }
    /**
     *  Points of the card at the end of a round
     *  As = 1, numbers = face value, Valet = 11, Dame = 12,
     *  Roi rouge = 0, Roi noir = 13
     */
    get points() {
        switch (this.value) {
            case 'ACE': return 1;
            case 'JACK': return 11;
            case 'QUEEN': return 12;
            case 'KING': return this.isRed ? 0 : 13;
            default: return parseInt(this.value, 10);
        }
    }
    /**
     *  Two cards "match" (can be thrown on each other) when they have the same value
     */
    matches(other) {
        return !!other && other.value === this.value;
    }
    /**
     *  Rank shown in the corner of the card (A, 2..10, V, D, R)
     */
    get rankLabel() {
        return VALUE_LABELS[this.value];
    }
    get suitSymbol() {
        return SUIT_SYMBOLS[this.suit];
    }
    /**
     *  Human readable name, e.g. "Dame de cœur"
     */
    get name() {
        return `${VALUE_NAMES[this.value]} de ${SUIT_NAMES[this.suit]}`;
    }
    toString() {
        return `${this.rankLabel}${this.suitSymbol}`;
    }
}
export default Card;
