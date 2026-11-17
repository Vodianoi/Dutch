/**
 *  Card model
 *  - Pure data, no DOM: the UI renders cards from this model (see ui/GameView.ts)
 *  - Value and suit names follow the deckofcardsapi.com conventions used before
 *    (ACE, 2..10, JACK, QUEEN, KING / HEARTS, DIAMONDS, CLUBS, SPADES)
 */

export type Suit = 'HEARTS' | 'DIAMONDS' | 'CLUBS' | 'SPADES';
export type Value = 'ACE' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'JACK' | 'QUEEN' | 'KING';

export const SUITS: Suit[] = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
export const VALUES: Value[] = ['ACE', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'JACK', 'QUEEN', 'KING'];

const SUIT_SYMBOLS: Record<Suit, string> = {
    HEARTS: '♥',
    DIAMONDS: '♦',
    CLUBS: '♣',
    SPADES: '♠',
};

const VALUE_LABELS: Record<Value, string> = {
    ACE: 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
    '8': '8', '9': '9', '10': '10', JACK: 'V', QUEEN: 'D', KING: 'R',
};

const VALUE_NAMES: Record<Value, string> = {
    ACE: 'As', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
    '8': '8', '9': '9', '10': '10', JACK: 'Valet', QUEEN: 'Dame', KING: 'Roi',
};

const SUIT_NAMES: Record<Suit, string> = {
    HEARTS: 'cœur',
    DIAMONDS: 'carreau',
    CLUBS: 'trèfle',
    SPADES: 'pique',
};

class Card {

    // region Public Properties
    /**
     *  Unique id of this physical card (two decks can contain the same code twice)
     */
    public readonly id: string;

    /**
     *  Card value (ACE, 2..10, JACK, QUEEN, KING)
     */
    public readonly value: Value;

    /**
     *  Card suit
     */
    public readonly suit: Suit;
    // endregion

    // region Constructor
    constructor(id: string, value: Value, suit: Suit) {
        this.id = id;
        this.value = value;
        this.suit = suit;
    }
    // endregion

    // region Public Methods
    /**
     *  Short code, e.g. "AS", "0H" (10 of hearts), "KD"
     */
    public get code(): string {
        const v = this.value === '10' ? '0' : this.value[0];
        return `${v}${this.suit[0]}`;
    }

    public get isRed(): boolean {
        return this.suit === 'HEARTS' || this.suit === 'DIAMONDS';
    }

    /**
     *  Points of the card at the end of a round
     *  As = 1, numbers = face value, Valet = 11, Dame = 12,
     *  Roi rouge = 0, Roi noir = 13
     */
    public get points(): number {
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
    public matches(other: Card | undefined): boolean {
        return !!other && other.value === this.value;
    }

    /**
     *  Rank shown in the corner of the card (A, 2..10, V, D, R)
     */
    public get rankLabel(): string {
        return VALUE_LABELS[this.value];
    }

    public get suitSymbol(): string {
        return SUIT_SYMBOLS[this.suit];
    }

    /**
     *  Human readable name, e.g. "Dame de cœur"
     */
    public get name(): string {
        return `${VALUE_NAMES[this.value]} de ${SUIT_NAMES[this.suit]}`;
    }

    public toString(): string {
        return `${this.rankLabel}${this.suitSymbol}`;
    }
    // endregion
}

export default Card;
