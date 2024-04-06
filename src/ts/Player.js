var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class Player {
    get game() {
        return this._game;
    }
    set game(value) {
        this._game = value;
    }
    get ready() {
        return this._ready;
    }
    set ready(value) {
        this._ready = value;
    }
    constructor(id, name) {
        this._hand = [];
        this.isTurn = false;
        this._game = undefined;
        this.handDiv = null;
        this.actionDiv = null;
        this._ready = false;
        this.id = id;
        this.name = name;
    }
    getId() {
        return this.id;
    }
    getName() {
        return this.name;
    }
    /**
     * Draw Player's hand using Card.render function
     * use card.render() to display each card (returns HTMLElement)
     */
    render() {
        var _a;
        this.handDiv = (_a = document.getElementById(`player-${this.id}`)) !== null && _a !== void 0 ? _a : document.createElement('div');
        this.handDiv.id = `player-${this.id}`;
        this.handDiv.innerHTML = '';
        this.handDiv.classList.add('player');
        this.handDiv.innerHTML = this.isTurn ? `<h2 style="color: rebeccapurple">${this.name}</h2>` : `<h1>${this.name}</h1>`;
        const handDiv = document.createElement('div');
        handDiv.classList.add('hand');
        this.handDiv.appendChild(handDiv);
        this.getHand().then((cards) => {
            console.log(cards);
            cards.forEach(card => {
                handDiv === null || handDiv === void 0 ? void 0 : handDiv.appendChild(card.render());
            });
        });
        return this.handDiv;
    }
    renderHand() {
        var _a, _b;
        const cards = (_a = this.handDiv) === null || _a === void 0 ? void 0 : _a.querySelectorAll('.card');
        cards === null || cards === void 0 ? void 0 : cards.forEach((card) => {
            card.remove();
        });
        const handDiv = (_b = this.handDiv) === null || _b === void 0 ? void 0 : _b.querySelector('.hand');
        this.getHand().then((cards) => {
            cards.forEach(card => {
                console.log(card);
                handDiv === null || handDiv === void 0 ? void 0 : handDiv.appendChild(card.render());
            });
        });
    }
    setHandListeners(callback) {
        this._hand.forEach((card) => {
            var _a;
            card.removeFlipEvent();
            (_a = card.div) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
                callback(card);
            });
        });
    }
    /**
     * Render Player's action buttons depending on the action
     * Actons: Ready, Dutch or End turn
     */
    renderAction(action) {
        var _a, _b, _c, _d, _e;
        console.log(action);
        switch (action) {
            case "ready":
                this.actionDiv = (_a = document.getElementById(`player-${this.id}-action`)) !== null && _a !== void 0 ? _a : document.createElement('div');
                this.actionDiv.id = `player-${this.id}-action`;
                this.actionDiv.innerHTML = '';
                this.actionDiv.classList.add('action');
                const readyButton = document.createElement('button');
                readyButton.innerHTML = 'Ready';
                readyButton.onclick = () => {
                    var _a;
                    (_a = this.game) === null || _a === void 0 ? void 0 : _a.ready(this);
                };
                this.actionDiv.appendChild(readyButton);
                (_b = this.handDiv) === null || _b === void 0 ? void 0 : _b.appendChild(this.actionDiv);
                break;
            case "dutch":
                this.actionDiv = (_c = document.getElementById(`player-${this.id}-action`)) !== null && _c !== void 0 ? _c : document.createElement('div');
                this.actionDiv.id = `player-${this.id}-action`;
                this.actionDiv.innerHTML = '';
                this.actionDiv.classList.add('action');
                const dutchButton = document.createElement('button');
                dutchButton.innerHTML = 'Dutch';
                dutchButton.onclick = () => {
                    var _a;
                    (_a = this.game) === null || _a === void 0 ? void 0 : _a.dutch(this);
                };
                const endTurnButton = document.createElement('button');
                endTurnButton.innerHTML = 'End Turn';
                endTurnButton.onclick = () => {
                    var _a;
                    (_a = this.game) === null || _a === void 0 ? void 0 : _a.endTurn(this);
                };
                this.actionDiv.appendChild(endTurnButton);
                this.actionDiv.appendChild(dutchButton);
                (_d = this.handDiv) === null || _d === void 0 ? void 0 : _d.appendChild(this.actionDiv);
                break;
            default:
                this.actionDiv = (_e = document.getElementById(`player-${this.id}-action`)) !== null && _e !== void 0 ? _e : document.createElement('div');
                this.actionDiv.id = `player-${this.id}-action`;
                this.actionDiv.innerHTML = '';
                break;
        }
    }
    changePlayerNameColor(color) {
        var _a, _b;
        (_b = (_a = this.handDiv) === null || _a === void 0 ? void 0 : _a.querySelector('h1')) === null || _b === void 0 ? void 0 : _b.setAttribute('style', `color: ${color}`);
    }
    getHand() {
        return __awaiter(this, void 0, void 0, function* () {
            // const response = await fetch(`https://deckofcardsapi.com/api/deck/${this.game?.deck?.deck_id}/pile/${this.id}/list/`);
            // const data = await response.json();
            // const cards: Card[] = []
            // for (let card of data.piles[`player-${this.id}`].cards) {
            //     cards.push(new Card(card.code, card.image, card.value, card.suit));
            // }
            return this._hand;
        });
    }
    setHand(hand) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                // if (this._hand.length > 0)
                //     await fetch(`https://deckofcardsapi.com/api/deck/${this.game?.deck?.deck_id}/pile/${this.id}/return/`);
                const response = yield fetch(`https://deckofcardsapi.com/api/deck/${(_b = (_a = this.game) === null || _a === void 0 ? void 0 : _a.deck) === null || _b === void 0 ? void 0 : _b.deck_id}/pile/${this.id}/add/?cards=${hand.map(card => card.code).join(',')}`);
                if (!response.ok) {
                    throw new Error(`Failed to add cards to pile: ${response.status} ${response.statusText}`);
                }
                this._hand = hand;
            }
            catch (error) {
                console.error('Error:', error);
            }
        });
    }
    toggleLastTwoCards(on) {
        if (on) {
            this._hand[this._hand.length - 1].show();
            this._hand[this._hand.length - 2].show();
        }
        else {
            this._hand[this._hand.length - 1].hide();
            this._hand[this._hand.length - 2].hide();
        }
    }
    /**
     * Play logic for the player
     */
    play() {
        var _a, _b;
        this.isTurn = true;
        this._hand.forEach((card) => {
            // Add event listener to each card
            card.addFlipEvent();
        });
        (_b = (_a = this.game) === null || _a === void 0 ? void 0 : _a.deck) === null || _b === void 0 ? void 0 : _b.addDrawEvent(this);
        this.changePlayerNameColor('rebeccapurple');
        this.renderAction('dutch');
    }
    endTurn() {
        this.isTurn = false;
        this._hand.forEach((card) => {
            card.removeFlipEvent();
        });
        this.changePlayerNameColor('black');
        this.renderAction('');
    }
}
export default Player;
