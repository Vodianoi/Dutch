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
const div = document.createElement('div');
div.id = 'game';
document.body.appendChild(div);
class Dutch {
    constructor(deck_id) {
        this.dutched = false;
        this.deck = new Deck(deck_id);
        this.players = [];
        this.currentPlayer = 0;
        this.nbCardsPerPlayer = 4;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.deal();
            yield this.render();
            for (let player of this.players) {
                player.renderAction("ready");
                player.game = this;
            }
        });
    }
    startGame() {
        return __awaiter(this, void 0, void 0, function* () {
            const players = this.getPlayers();
            setTimeout(() => {
                for (let player of players) {
                    player.toggleLastTwoCards(true);
                }
            }, 2000);
            for (let player of players) {
                player.toggleLastTwoCards(false);
            }
            yield this.play();
        });
    }
    deal() {
        return __awaiter(this, void 0, void 0, function* () {
            for (let player of this.players) {
                player.game = this;
                let [cards] = yield Promise.all([this.deck.draw(this.nbCardsPerPlayer)]);
                yield player.setHand(cards);
            }
        });
    }
    render() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const game = (_a = document.getElementById('game')) !== null && _a !== void 0 ? _a : document.createElement('div');
            game.id = 'game';
            game.innerHTML = '';
            const players = this.getPlayers();
            for (let player of players) {
                const playerDiv = player.render();
                game.appendChild(playerDiv);
            }
            yield this.deck.discardOneFromDraw();
            yield this.deck.renderDeck();
            // this.deck.renderDiscardPile();
        });
    }
    updatePlayer(player) {
    }
    ready(player) {
        player.ready = true;
        player.changePlayerNameColor('green');
        console.log('player ready', player.getName());
        if (this.getPlayers().every(player => player.ready)) {
            this.startGame().then(r => {
                this.players.forEach((player) => player.changePlayerNameColor('black'));
                console.log('game started');
            });
        }
    }
    dutch(player) {
        const currentPlayer = this.getCurrentPlayer();
        if (player.getId() === currentPlayer.getId()) {
            this.dutched = true;
            this.nextPlayer();
            this.play();
        }
    }
    endTurn(player) {
        const currentPlayer = this.getCurrentPlayer();
        if (player.getId() === currentPlayer.getId()) {
            currentPlayer.endTurn();
            this.nextPlayer();
            this.play();
        }
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
        return this.players.map(player => player.getHand());
    }
    static fromJSON(json) {
        return Object.assign(new Dutch(json.deck_id), json);
    }
    play() {
        return __awaiter(this, void 0, void 0, function* () {
            const players = this.getPlayers();
            const currentPlayer = this.getCurrentPlayer();
            currentPlayer.play();
        });
    }
}
export default Dutch;
