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
    get onClick() {
        return this._onClick;
    }
    set onClick(value) {
        this._onClick = value;
        this._hand.forEach((card) => {
            card.onClick = (e) => {
                value(e);
            };
        });
    }
    get currentAction() {
        return this._currentAction;
    }
    set currentAction(value) {
        this._currentAction = value;
    }
    get isTurn() {
        return this._isTurn;
    }
    set isTurn(value) {
        this._isTurn = value;
    }
    constructor(id, name) {
        this._hand = [];
        this._isTurn = false;
        this._game = undefined;
        this._ready = false;
        this.drawnCard = undefined;
        this._currentAction = '';
        this._onClick = () => {
        };
        this.id = id;
        this.name = name;
        this.playerDiv = document.createElement('div');
        this.playerDiv.id = `player-${this.id}`;
        this.actionDiv = document.createElement('div');
        this.actionDiv.id = `player-${this.id}-action`;
        this.handDiv = document.createElement('div');
        this.handDiv.id = `player-${this.id}-hand`;
        this.handDiv.classList.add('hand');
    }
    getId() {
        return this.id;
    }
    getName() {
        return this.name;
    }
    /**
     * Draw Player's hand
     * use card.render() to display each card (returns HTMLElement)
     */
    render() {
        var _a;
        this.playerDiv = (_a = document.getElementById(`player-${this.id}`)) !== null && _a !== void 0 ? _a : document.createElement('div');
        this.playerDiv.id = `player-${this.id}`;
        this.playerDiv.innerHTML = '';
        this.playerDiv.classList.add('player');
        this.playerDiv.innerHTML = this.isTurn ? `<h2 style="color: rebeccapurple">${this.name}</h2>` : `<h1>${this.name}</h1>`;
        this.playerDiv.appendChild(this.handDiv);
        this._hand.forEach(card => {
            this.handDiv.appendChild(card.render());
            card.onClick = (e) => {
                this.onClick(e);
            };
        });
        return this.playerDiv;
    }
    renderHand() {
        this.handDiv.innerHTML = '';
        this._hand.forEach(card => {
            this.handDiv.appendChild(card.render());
            card.onClick = (e) => {
                this.onClick(e);
            };
        });
    }
    /**
     * Render Player's action buttons depending on the action
     * Actions: Ready, Dutch or End turn
     */
    renderAction(action) {
        var _a, _b, _c, _d, _e, _f, _g;
        console.log(action);
        this.currentAction = action;
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
                (_b = this.playerDiv) === null || _b === void 0 ? void 0 : _b.appendChild(this.actionDiv);
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
                (_d = this.playerDiv) === null || _d === void 0 ? void 0 : _d.appendChild(this.actionDiv);
                break;
            case 'draw':
                this.actionDiv = (_e = document.getElementById(`player-${this.id}-action`)) !== null && _e !== void 0 ? _e : document.createElement('div');
                this.actionDiv.id = `player-${this.id}-action`;
                this.actionDiv.innerHTML = '';
                this.actionDiv.classList.add('action');
                const discardButton = document.createElement('button');
                discardButton.innerHTML = 'Discard';
                discardButton.onclick = () => {
                    var _a, _b, _c;
                    console.log("Drawn Card", this.drawnCard);
                    (_a = this.game) === null || _a === void 0 ? void 0 : _a.deck.discard(this.drawnCard);
                    (_b = this.game) === null || _b === void 0 ? void 0 : _b.endTurn(this);
                    (_c = document.getElementById('drawnCard')) === null || _c === void 0 ? void 0 : _c.remove();
                };
                this.actionDiv.appendChild(discardButton);
                (_f = this.playerDiv) === null || _f === void 0 ? void 0 : _f.appendChild(this.actionDiv);
                break;
            default:
                this.actionDiv = (_g = document.getElementById(`player-${this.id}-action`)) !== null && _g !== void 0 ? _g : document.createElement('div');
                this.actionDiv.id = `player-${this.id}-action`;
                this.actionDiv.innerHTML = '';
                break;
        }
    }
    changePlayerNameColor(color) {
        var _a, _b;
        (_b = (_a = this.playerDiv) === null || _a === void 0 ? void 0 : _a.querySelector('h1')) === null || _b === void 0 ? void 0 : _b.setAttribute('style', `color: ${color}`);
    }
    getHand() {
        // const response = await fetch(`https://deckofcardsapi.com/api/deck/${this.game?.deck?.deck_id}/pile/${this.id}/list/`);
        // const data = await response.json();
        // const cards: Card[] = []
        // for (let card of data.piles[`player-${this.id}`].cards) {
        //     cards.push(new Card(card.code, card.image, card.value, card.suit));
        // }
        return this._hand;
    }
    setHand(hand) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const response = yield fetch(`https://deckofcardsapi.com/api/deck/${(_b = (_a = this.game) === null || _a === void 0 ? void 0 : _a.deck) === null || _b === void 0 ? void 0 : _b.deck_id}/pile/${this.id}/add/?cards=${hand.map(card => card.code).join(',')}`);
            if (!response.ok) {
                throw new Error(`Failed to add cards to pile: ${response.status} ${response.statusText}`);
            }
            this._hand = hand;
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
        this.isTurn = true;
        this.changePlayerNameColor('rebeccapurple');
        this.renderAction('dutch');
    }
    addListener(callback) {
        this._hand.forEach((card) => {
            // Add event listener to each card
            card.addClickEvent(callback);
        });
    }
    endTurn() {
        this.isTurn = false;
        this.changePlayerNameColor('black');
        this.renderAction('');
    }
    discard(card) {
        var _a;
        this._hand = this._hand.filter(c => c.code !== card.code);
        this.renderHand();
        (_a = this.game) === null || _a === void 0 ? void 0 : _a.deck.discard(card);
    }
    addCard(card) {
        this._hand.push(card);
        this.renderHand();
    }
    flipAllCards() {
        this._hand.forEach(card => {
            card.show();
        });
        setTimeout(() => {
            this._hand.forEach(card => {
                card.hide();
            });
        }, 2000);
    }
}
export default Player;
