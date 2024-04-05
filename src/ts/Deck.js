var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import Card from './Card.js';
class Deck {
    constructor(id) {
        this.remaining = 52;
        this.shuffled = true;
        this.pile = 'discard';
        this.deck_id = id;
    }
    getId() {
        return this.deck_id;
    }
    getDeck() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}`)
                .then(response => response.json());
        });
    }
    getRemaining() {
        return this.remaining;
    }
    getShuffled() {
        return this.shuffled;
    }
    shuffle() {
        return fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/shuffle/`)
            .then(response => response.json())
            .then(data => {
            return data;
        });
    }
    // public getCards() {
    //     return this.cards;
    // }
    //
    // public setCards(cards: Card[]) {
    //     this.cards = cards;
    // }
    addToPile(card) {
        fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/add/?cards=${card.getCode()}`)
            .then(response => response.json())
            .then(data => {
            console.log(data);
        });
    }
    getPile() {
        return fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/list/`)
            .then(response => response.json())
            .then(data => {
            return data;
        });
    }
    getLastCardFromPile() {
        return fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/draw/?count=1`)
            .then(response => response.json())
            .then(data => {
            return data;
        });
    }
    drawCard() {
        return fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`)
            .then(response => response.json())
            .then(data => {
            return data;
        });
    }
    draw(count) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=${count}`)
                .then(response => response.json())
                .then(data => {
                let cards = [];
                data.cards.forEach((card) => {
                    let c = new Card(card.code, card.image, card.value, card.suit);
                    cards.push(c);
                });
                fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}`)
                    .then(response => response.json())
                    .then(data => {
                    this.remaining = data.remaining;
                });
                return cards;
            });
        });
    }
}
export default Deck;
