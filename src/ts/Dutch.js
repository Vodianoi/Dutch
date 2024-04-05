var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import Deck from "./Deck.js";
class Dutch {
    constructor(deck_id) {
        this.deck = new Deck(deck_id);
        this.players = [];
        this.currentPlayer = 0;
        this.nbCardsPerPlayer = 4;
    }
    startGame() {
        this.deal();
    }
    deal() {
        this.players.forEach((player) => __awaiter(this, void 0, void 0, function* () {
            yield this.deck.draw(this.nbCardsPerPlayer).then((cards) => __awaiter(this, void 0, void 0, function* () {
                yield player.setHand(cards, this.deck.deck_id);
            }));
        }));
    }
    addPlayer(player) {
        this.players.push(player);
    }
    nextPlayer() {
        this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
    }
    getPlayers() {
        return this.players;
    }
    getDeck() {
        return this.deck.getDeck();
    }
    getCurrentPlayer() {
        return this.players[this.currentPlayer];
    }
    setCurrentPlayer(player) {
        this.currentPlayer = player;
    }
    getPlayersCount() {
        return this.players.length;
    }
    getPlayersNames() {
        return this.players.map(player => player.getName());
    }
    getPlayersIds() {
        return this.players.map(player => player.getId());
    }
    getPlayersHands() {
        return this.players.map(player => player.getHand(this.deck.deck_id));
    }
    static fromJSON(json) {
        return Object.assign(new Dutch(json.deck_id), json);
    }
}
export default Dutch;
