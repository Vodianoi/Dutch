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
        this.pile = 'discard';
        this.cards = [];
        this.div = document.createElement('div');
        this.deck_id = id;
        this.div.id = 'deck';
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
        return __awaiter(this, void 0, void 0, function* () {
            return yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}`)
                .then(response => response.json())
                .then(data => {
                return data.remaining;
            });
        });
    }
    /**
     * Render the last card in the discard pile beside the deck
     */
    renderDiscardPile() {
        fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/list/`)
            .then(response => response.json())
            .then(data => {
        });
    }
    /**
     * @returns
     */
    renderDeck() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`)
                .then(response => response.json())
                .then((data) => __awaiter(this, void 0, void 0, function* () {
                // DISCARD
                fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/list/`)
                    .then(response => response.json())
                    .then(data => {
                    this.div.innerHTML = '';
                    this.div.style.display = 'flex';
                    this.div.style.justifyContent = 'center';
                    this.div.style.alignItems = 'center';
                    this.div.style.flexDirection = 'row';
                    let card = data.piles[this.pile].cards[0];
                    let img = document.createElement('img');
                    img.src = card.image;
                    img.style.width = '100px';
                    img.style.height = '150px';
                    this.div.appendChild(img);
                });
                // DECK
                let card = data.cards[0];
                let img = document.createElement('img');
                card = new Card(card.code, card.image, card.value, card.suit);
                img.src = yield card.getBackImage();
                img.style.width = '100px';
                img.style.height = '150px';
                const remaining = yield this.getRemaining();
                let remainingText = document.createElement('p');
                remainingText.style.fontSize = '20px';
                remainingText.style.fontWeight = 'bold';
                remainingText.style.color = 'white';
                remainingText.innerHTML = `Remaining: ${remaining}`;
                this.div.appendChild(img);
                this.div.appendChild(remainingText);
                this.div.style.transform = 'translateX(35%)';
                if (!document.getElementById('deck'))
                    document.body.appendChild(this.div);
            }));
        });
    }
    shuffle() {
        return fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/shuffle/`)
            .then(response => response.json())
            .then(data => {
            return data;
        });
    }
    addToPile(card) {
        fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/add/?cards=${card.getCode()}`)
            .then(response => response.json())
            .then(data => {
            console.log(data);
        });
    }
    discard() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                //get the last card in the deck
                let response = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`);
                let data = yield response.json();
                let card = data["cards"][0];
                //add the card to the discard pile
                yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/add/?cards=${card.code}`);
                console.log(data);
                return card;
            }
            catch (e) {
                console.log("Error while discarding: " + e);
            }
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
            try {
                let response = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=${count}`);
                let data = yield response.json();
                let cards = data["cards"];
                console.log(data);
                return cards;
            }
            catch (e) {
                console.log("Error while drawing: " + e);
            }
        });
    }
}
export default Deck;
