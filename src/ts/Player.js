var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import Card from "./Card.js";
class Player {
    get game() {
        return this._game;
    }
    set game(value) {
        this._game = value;
    }
    constructor(id, name) {
        this.hand = [];
        this.isTurn = false;
        this._game = undefined;
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
     * Display them in a 2*2 grid
     * use card.render() to display each card (returns HTMLElement)
     */
    render() {
        const playerDiv = document.createElement('div');
        playerDiv.id = `player-${this.id}`;
        playerDiv.innerHTML = '';
        playerDiv.classList.add('player');
        playerDiv.innerHTML = this.isTurn ? `<h2 style="color: rebeccapurple">${this.name}</h2>` : `<h1>${this.name}</h1>`;
        const handDiv = document.createElement('div');
        handDiv.classList.add('hand');
        playerDiv.appendChild(handDiv);
        for (let card of this.hand) {
            handDiv.appendChild(card.render());
        }
        return playerDiv;
    }
    getHand(deck_id) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.hand;
        });
    }
    setHand(hand) {
        return __awaiter(this, void 0, void 0, function* () {
            for (let card of hand) {
                this.hand.push(new Card(card.code, card.image, card.value, card.suit));
            }
        });
    }
    /**
     * Play logic for the player
     */
    play() {
        this.isTurn = true;
    }
}
export default Player;
