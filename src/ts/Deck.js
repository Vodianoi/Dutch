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
        this._onDraw = (e) => {
        };
        this._onDrawDiscard = (e) => {
        };
        this.deck_id = id;
        this.div.id = 'deck';
        this._onDraw = (e) => {
            console.log('Draw event not set');
        };
        this._onDrawDiscard = (e) => {
            console.log('Draw discard event not set');
        };
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
                const cardLength = discardData.piles[this.pile].cards.length;
                let card = discardData.piles[this.pile].cards[cardLength - 1];
                console.log('CARD', card);
                let discardImg = document.createElement('img');
                discardImg.id = 'discard';
                discardImg.src = card.image;
                discardImg.style.width = '100px';
                discardImg.style.height = '150px';
                this.div.appendChild(discardImg);
                // DECK
                let deckImg = document.createElement('img');
                deckImg.src = Card.backImage;
                deckImg.id = 'draw';
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
                discardImg.onclick = (ev) => {
                    this._onDrawDiscard(ev);
                };
                deckImg.onclick = (ev) => {
                    this._onDraw(ev);
                };
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
    addDrawEvent(player) {
        this._onDraw = (e) => this.drawEvent(e, player);
        this._onDrawDiscard = (e) => this.drawEvent(e, player);
        // this.div.querySelector('#discard')?.addEventListener('click', () => this._onDrawDiscard);
        // this.div.querySelector('#draw')?.addEventListener('click', () => this._onDraw);
        // console.log(this._onDraw);
        // console.log(this._onDrawDiscard);
    }
    removeDrawEvent() {
        this._onDraw = (e) => {
            console.log('Draw event not set');
        };
        this._onDrawDiscard = (e) => {
            console.log('Draw discard event not set');
        };
        // this.div.querySelector('#discard')?.removeEventListener('click', () => this._onDrawDiscard, true);
        // this.div.querySelector('#draw')?.removeEventListener('click', () => this._onDraw, true);
    }
    /**
     * Draw event, place the clicked card in the middle of the screen to let the player choose where he wants to put it
     */
    drawEvent(e, player) {
        player.renderAction('draw');
        console.log('DRAW EVENT', e);
        let cardDiv = e.target;
        switch (cardDiv.id) {
            case 'discard':
                this.div.removeChild(cardDiv);
                this.drawFromDiscard().then((discardCard) => __awaiter(this, void 0, void 0, function* () {
                    console.log('DISCARD CARD', discardCard);
                    if (!discardCard) {
                        throw new Error('No card to draw from discard');
                    }
                    this.renderCardAtMiddle(discardCard);
                    player.onClick = (card) => {
                        this.replaceCardEvent(card, player, discardCard);
                    };
                }));
                break;
            case 'draw':
                this.drawCard().then((card) => __awaiter(this, void 0, void 0, function* () {
                    console.log('DRAW CARD', card);
                    // cardDiv?.remove();
                    this.renderCardAtMiddle(card);
                    player.onClick = (card) => {
                        this.replaceCardEvent(card, player, card);
                    };
                }));
                break;
        }
        // Remove event listeners after handling the event
        this.removeDrawEvent();
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
            let selectedCardCode = card.code;
            let selectedCardDiv = document.getElementById(selectedCardCode);
            selectedCardDiv === null || selectedCardDiv === void 0 ? void 0 : selectedCardDiv.remove();
            let cards = player.getHand();
            //discard the selected card in hand
            yield this.discard(card);
            yield this.renderDeck();
            //add the drawn card to the hand
            let index = cards.indexOf(card);
            cards.splice(index, 1, discardCard);
            yield player.setHand(cards);
            player.renderHand();
            player.renderAction(player.isTurn ? 'dutch' : '');
            (_a = document.getElementById('drawnCard')) === null || _a === void 0 ? void 0 : _a.remove();
            player.addListener((card) => __awaiter(this, void 0, void 0, function* () {
                setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                    var _b;
                    card.show();
                    yield ((_b = player.game) === null || _b === void 0 ? void 0 : _b.checkCard(card, player));
                }), 1000);
                card.hide();
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
    discard(card) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
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
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`);
            const data = yield response.json();
            let card = data.cards[0];
            card = new Card(card.code, card.image, card.value, card.suit);
            return card;
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
    getDiscard() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let response = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/list/`);
                if (!response.ok) {
                    throw new Error(`Failed to get discard pile: ${response.status} ${response.statusText}`);
                }
                let data = yield response.json();
                let cards = [];
                for (let card of data.piles[this.pile].cards) {
                    cards.push(new Card(card.code, card.image, card.value, card.suit));
                }
                return cards;
            }
            catch (error) {
                console.error("Error while getting discard pile: ", error);
                return null; // Or return a default card object
            }
        });
    }
}
export default Deck;
