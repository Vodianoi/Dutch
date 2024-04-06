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
        this.div = document.createElement('div');
        this.deck_id = id;
        this.div.id = 'deck';
    }
    getId() {
        return this.deck_id;
    }
    getDeck() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/`)
                .then(response => response.json());
        });
    }
    getRemaining() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/`)
                .then(response => response.json())
                .then(data => {
                return data.remaining;
            });
        });
    }
    /**
     * @returns
     */
    renderDeck() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // const response = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`);
                // if (!response.ok) {
                //     throw new Error(`Failed to draw card from deck: ${response.status} ${response.statusText}`);
                // }
                // const data = await response.json();
                // DISCARD
                const discardResponse = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/list/`);
                if (!discardResponse.ok) {
                    throw new Error(`Failed to get discard pile: ${discardResponse.status} ${discardResponse.statusText}`);
                }
                const discardData = yield discardResponse.json();
                console.log('DISCARD', discardData);
                this.div.innerHTML = '';
                this.div.style.display = 'flex';
                this.div.style.justifyContent = 'center';
                this.div.style.alignItems = 'center';
                this.div.style.flexDirection = 'row';
                let card = discardData.piles[this.pile].cards[0];
                console.log('CARD', card);
                let img = document.createElement('img');
                img.id = 'discard';
                img.src = card.image;
                img.style.width = '100px';
                img.style.height = '150px';
                this.div.appendChild(img);
                // DECK
                let deckImg = document.createElement('img');
                deckImg.src = Card.backImage;
                deckImg.id = 'deck';
                deckImg.style.width = '100px';
                deckImg.style.height = '150px';
                const remaining = yield this.getRemaining();
                let remainingText = document.createElement('p');
                remainingText.style.fontSize = '20px';
                remainingText.style.fontWeight = 'bold';
                remainingText.style.color = 'white';
                remainingText.innerHTML = `Remaining: ${remaining}`;
                this.div.appendChild(deckImg);
                this.div.appendChild(remainingText);
                this.div.style.transform = 'translateX(35%)';
                if (!document.getElementById('deck'))
                    document.body.appendChild(this.div);
            }
            catch (error) {
                console.error("Error while rendering deck: ", error);
            }
        });
    }
    renderCardAtMiddle(card) {
        let img = document.createElement('img');
        img.src = card.image;
        img.style.width = '100px';
        img.style.height = '150px';
        img.style.position = 'absolute';
        img.style.top = '50%';
        img.style.left = '50%';
        img.style.transform = 'translate(-50%, -50%)';
        img.style.zIndex = '1000';
        img.style.cursor = 'pointer';
        img.id = 'drawnCard';
        document.body.appendChild(img);
    }
    /**
     *
     */
    addDrawEvent(player) {
        var _a, _b;
        (_a = this.div.querySelector('#discard')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', this.drawEvent(player));
        (_b = this.div.querySelector('#deck')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', this.drawEvent(player));
    }
    /**
     * Draw event, place the clicked card in the middle of the screen to let the player choose where he wants to put it
     */
    drawEvent(player) {
        return (e) => {
            let cardDiv = e.target;
            this.drawFromDiscard().then((discardCard) => __awaiter(this, void 0, void 0, function* () {
                if (!discardCard) {
                    throw new Error('No card to draw from discard');
                }
                cardDiv === null || cardDiv === void 0 ? void 0 : cardDiv.remove();
                this.renderCardAtMiddle(discardCard);
                // let cards = await player.getHand() as Card[];
                player.setHandListeners((card) => this.replaceCardEvent(card, player, discardCard));
                // cards.forEach(handCard => {
                //     handCard.removeFlipEvent();
                //     // Add Listener to select one of the cards in the hand
                //     handCard.div.addEventListener('click', );
                //     console.log("ADDED EVENT", handCard.div)
                // });
            }));
        };
    }
    /**
     * EVENT: Replace the selected card in the hand with the drawn card
     * @param card
     * @param player
     * @param discardCard
     * @private
     */
    replaceCardEvent(card, player, discardCard) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // let selectedCard = e.currentTarget as HTMLImageElement;
            console.log("EVENT: REPLACE CARD", card);
            let selectedCardCode = card.code;
            let selectedCardDiv = document.getElementById(selectedCardCode);
            selectedCardDiv === null || selectedCardDiv === void 0 ? void 0 : selectedCardDiv.remove();
            console.log("SELECTED CARD", selectedCardCode);
            let cards = yield player.getHand();
            console.log("HAND CARD", card);
            console.log("CARDS", cards);
            //discard the selected card in hand
            yield this.discard(card);
            yield this.renderDeck();
            //add the drawn card to the hand
            let index = cards.indexOf(card);
            cards.splice(index, 1, discardCard);
            yield player.setHand(cards);
            player.renderHand();
            (_a = document.getElementById('drawnCard')) === null || _a === void 0 ? void 0 : _a.remove();
        });
    }
    shuffle() {
        return fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/shuffle/`)
            .then(response => response.json())
            .then(data => {
            return data;
        });
    }
    discard(card) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Return the card to deck before adding to discard pile
                let returnResponse = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/return/?cards=${card.code}`);
                if (!returnResponse.ok) {
                    throw new Error(`Failed to return card to deck: ${returnResponse.status} ${returnResponse.statusText}`);
                }
                let returnData = yield returnResponse.json();
                console.log('RETURNED CARD', returnData);
                let discardResponse = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/add/?cards=${card.code}`);
                if (!discardResponse.ok) {
                    throw new Error(`Failed to discard card: ${discardResponse.status} ${discardResponse.statusText}`);
                }
                let discardData = yield discardResponse.json();
                console.log('DISCARDED CARD', discardData);
            }
            catch (error) {
                console.error("Error while adding card to pile: ", error);
            }
        });
    }
    discardOneFromDraw() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                //get the last card in the deck
                let response = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`);
                let data = yield response.json();
                let card = data["cards"][0];
                //add the card to the discard pile
                yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/add/?cards=${card.code}`);
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
            let response = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=${count}`);
            let data = yield response.json();
            let cards = data["cards"];
            let res = [];
            for (let card of cards) {
                res.push(new Card(card.code, card.image, card.value, card.suit));
            }
            return res;
        });
    }
    drawFromDiscard() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let response = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/draw/?count=1`);
                if (!response.ok) {
                    throw new Error(`Failed to draw from discard: ${response.status} ${response.statusText}`);
                }
                let data = yield response.json();
                if (!data || !data.cards || data.cards.length === 0) {
                    throw new Error('No card data found in the response');
                }
                let card = data.cards[0];
                card = new Card(card.code, card.image, card.value, card.suit);
                console.log('DRAW DISCARD', data);
                return card;
            }
            catch (error) {
                console.error("Error while drawing from discard: ", error);
                return null; // Or return a default card object
            }
        });
    }
}
export default Deck;
