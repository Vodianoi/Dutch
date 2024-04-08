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
/**
 *  Deck class
 */
class Deck {
    // endregion
    // region Constructor
    /**
     *  Create a new deck
     *   - Set the deck id
     *   - Set the discard pile
     *   - Set the div id
     *   - Set the draw and discard event listener to the default event
     * @param id
     */
    constructor(id) {
        // endregion
        // region Private Properties
        /**
         *  Discard pile
         * @private
         */
        this.pile = 'discard';
        /**
         *  Container for the deck
         * @private
         */
        this.container = document.createElement('div');
        /**
         * Draw clicked event
         */
        this._onDraw = () => {
        };
        /**
         *  Draw discard clicked event
         */
        this._onDrawDiscard = () => {
        };
        this.deck_id = id;
        this.container.id = 'deck';
        this._onDraw = () => {
            console.log('Draw event not set');
        };
        this._onDrawDiscard = () => {
            console.log('Draw discard event not set');
        };
    }
    // endregion
    // region Public Methods
    /**
     *  Get the remaining cards in the deck
     */
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
     *  Render the deck
     *   - Draw pile
     *   - Remaining cards
     *   - Discard pile
     * @returns
     */
    renderDeck() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // DISCARD
                const discardImg = yield this.renderDiscard();
                // DRAW
                const deckImg = yield this.renderDraw();
                if (!document.getElementById('deck'))
                    document.body.appendChild(this.container);
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
    /**
     *  Discard a card
     *   - Add the card to the discard pile
     *   - Render the deck
     *   - Log the discarded card
     *
     * @param card Card to discard
     */
    discard(card) {
        return __awaiter(this, void 0, void 0, function* () {
            let discardResponse = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/add/?cards=${card.code}`);
            if (!discardResponse.ok) {
                throw new Error(`Failed to discard card: ${discardResponse.status} ${discardResponse.statusText}`);
            }
            let discardData = yield discardResponse.json();
            let discardDiv = this.container.querySelector('#discard');
            if (discardDiv) {
                discardDiv.src = card.image;
            }
            console.log('DISCARDED CARD', discardData);
        });
    }
    /**
     *  Discard one card from the draw pile
     *  - Get the last card in the deck
     *  - Add the card to the discard pile
     *  - Return the discarded card
     */
    // @ts-ignore
    discardOneFromDraw() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                //get the last card in the deck
                let response = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`);
                let data = yield response.json();
                let card = data["cards"][0];
                card = new Card(card.code, card.image, card.value, card.suit);
                //add the card to the discard pile
                yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/add/?cards=${card.code}`);
                return card;
            }
            catch (e) {
                console.log("Error while discarding: " + e);
            }
        });
    }
    /**
     *  Draw a card from the deck
     */
    drawCard() {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`);
            const data = yield response.json();
            let card = data.cards[0];
            card = new Card(card.code, card.image, card.value, card.suit);
            this.updateRemaining();
            return card;
        });
    }
    /**
     *  Draw multiple cards from the deck
     * @param count
     */
    draw(count) {
        return __awaiter(this, void 0, void 0, function* () {
            let response = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=${count}`);
            let data = yield response.json();
            let cards = data["cards"];
            let res = [];
            for (let card of cards) {
                res.push(new Card(card.code, card.image, card.value, card.suit));
            }
            this.updateRemaining();
            return res;
        });
    }
    /**
     *  Get the discard pile
     */
    getDiscard() {
        return __awaiter(this, void 0, void 0, function* () {
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
        });
    }
    // endregion
    // region Private Methods
    /**
     *  Render the draw pile
     * @private
     */
    renderDraw() {
        return __awaiter(this, void 0, void 0, function* () {
            let deckImg = document.createElement('img');
            deckImg.src = Card.DECK_IMAGE_BACK;
            deckImg.id = 'draw';
            deckImg.style.width = '100px';
            deckImg.style.height = '150px';
            const remaining = yield this.getRemaining();
            let remainingText = document.createElement('p');
            remainingText.style.fontSize = '20px';
            remainingText.style.fontWeight = 'bold';
            remainingText.style.color = 'white';
            remainingText.innerHTML = `Remaining: ${remaining}`;
            this.container.appendChild(deckImg);
            this.container.appendChild(remainingText);
            this.container.style.transform = 'translateX(35%)';
            return deckImg;
        });
    }
    /**
     *  Update remaining cards displayed on the deck
     * @private
     */
    updateRemaining() {
        this.getRemaining().then(remaining => {
            let remainingText = this.container.querySelector('p');
            if (remainingText) {
                remainingText.innerHTML = `Remaining: ${remaining}`;
            }
        });
    }
    /**
     * Render the discard pile
     * @private
     */
    renderDiscard() {
        return __awaiter(this, void 0, void 0, function* () {
            const discardResponse = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/list/`);
            if (!discardResponse.ok) {
                throw new Error(`Failed to get discard pile: ${discardResponse.status} ${discardResponse.statusText}`);
            }
            const discardData = yield this.getDiscard();
            console.log('DISCARD', discardData);
            this.container.innerHTML = '';
            this.container.style.display = 'flex';
            this.container.style.justifyContent = 'center';
            this.container.style.alignItems = 'center';
            this.container.style.flexDirection = 'row';
            if (!discardData) {
                throw new Error('No discard data found');
            }
            let card = discardData[discardData.length - 1];
            console.log('CARD', card);
            let discardImg = document.createElement('img');
            discardImg.id = 'discard';
            discardImg.src = card.image;
            discardImg.style.width = '100px';
            discardImg.style.height = '150px';
            this.container.appendChild(discardImg);
            return discardImg;
        });
    }
    /**
     * Render the card in the middle of the screen
     * @param card Card to render
     */
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
     *  Draw a card from the discard pile
     */
    drawFromDiscard() {
        return __awaiter(this, void 0, void 0, function* () {
            let response = yield fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/draw/?count=1`);
            if (!response.ok) {
                throw new Error(`Failed to draw from discard: ${response.status} ${response.statusText}`);
            }
            let data = yield response.json();
            if (!data || !data.cards || data.cards.length === 0) {
                throw new Error('No card data found in the response');
            }
            let card = data.cards[data.cards.length - 1];
            card = new Card(card.code, card.image, card.value, card.suit);
            console.log('DRAW DISCARD', data);
            return card;
        });
    }
    // endregion
    // region Event Handlers
    /**
     *  Add the draw event listeners to the deck
     * @param player Player that will draw the card
     */
    addDrawEvent(player) {
        this._onDraw = (e) => this.drawEvent(e, player);
        this._onDrawDiscard = (e) => this.drawEvent(e, player);
    }
    /**
     *  Remove the draw event listeners from the deck and set the default event
     */
    removeDrawEvent() {
        this._onDraw = () => {
            console.log('Draw event not set');
        };
        this._onDrawDiscard = () => {
            console.log('Draw discard event not set');
        };
    }
    /**
     * Draw event, place the clicked card in the middle of the screen to let the player choose where he wants to put it
     */
    drawEvent(e, player) {
        var _a;
        (_a = player.game) === null || _a === void 0 ? void 0 : _a.allowPlayCard();
        console.log('DRAW EVENT', e);
        let cardDiv = e.target;
        switch (cardDiv.id) {
            case 'discard':
                this.container.removeChild(cardDiv);
                this.drawFromDiscard().then((discardCard) => __awaiter(this, void 0, void 0, function* () {
                    if (!discardCard) {
                        throw new Error('No card to draw from discard');
                    }
                    this.renderCardAtMiddle(discardCard);
                    player.onClick = (handCard) => {
                        this.replaceCardEvent(handCard, player, discardCard);
                    };
                    player.drawnCard = discardCard;
                }));
                break;
            case 'draw':
                player.renderAction('draw');
                this.drawCard().then((drawnCard) => __awaiter(this, void 0, void 0, function* () {
                    this.renderCardAtMiddle(drawnCard);
                    player.onClick = (handCard) => {
                        this.replaceCardEvent(handCard, player, drawnCard);
                    };
                    player.drawnCard = drawnCard;
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
            var _a, _b;
            let selectedCardCode = card.code;
            let selectedCardDiv = document.getElementById(selectedCardCode);
            selectedCardDiv === null || selectedCardDiv === void 0 ? void 0 : selectedCardDiv.remove();
            let cards = player.hand;
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
            player.addListenerToHand((card) => __awaiter(this, void 0, void 0, function* () {
                setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                    var _c;
                    card.show();
                    yield ((_c = player.game) === null || _c === void 0 ? void 0 : _c.checkCard(card, player));
                }), 1000);
                card.hide();
            }));
            (_b = player.game) === null || _b === void 0 ? void 0 : _b.allowPlayCard();
        });
    }
}
export default Deck;
