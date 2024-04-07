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
        this.oneDutch = false;
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
            for (let player of players) {
                player.renderAction("play");
            }
            setTimeout(() => {
                for (let player of players) {
                    player.toggleLastTwoCards(true);
                }
            }, 2000);
            for (let player of players) {
                player.toggleLastTwoCards(false);
            }
            setTimeout(() => {
                this.play();
            }, 3000);
        });
    }
    flipAllCards() {
        for (let player of this.players) {
            player.flipAllCards();
        }
    }
    deal() {
        return __awaiter(this, void 0, void 0, function* () {
            for (let player of this.players) {
                player.game = this;
                let [cards] = yield Promise.all([this.deck.draw(this.nbCardsPerPlayer)]);
                yield player.setHand(cards);
            }
            yield this.deck.discardOneFromDraw();
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
            yield this.deck.renderDeck();
            // this.deck.renderDiscardPile();
        });
    }
    ready(player) {
        if (player.ready)
            return;
        player.ready = true;
        player.changePlayerNameColor('green');
        console.log('player ready', player.getName());
        if (this.getPlayers().every(player => player.ready)) {
            this.startGame().then(() => {
                this.players.forEach((player) => player.changePlayerNameColor('black'));
                console.log('game started');
            });
        }
    }
    dutch(player) {
        const currentPlayer = this.getCurrentPlayer();
        if (player.getId() === currentPlayer.getId()) {
            this.oneDutch = true;
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
    getCurrentPlayer() {
        return this.players[this.currentPlayer];
    }
    checkCard(card, player) {
        return __awaiter(this, void 0, void 0, function* () {
            setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                card.show();
                const discardPile = yield this.deck.getDiscard();
                if ((discardPile === null || discardPile === void 0 ? void 0 : discardPile.length) === 0)
                    return;
                if (discardPile) {
                    const topCard = discardPile[discardPile.length - 1];
                    if (card.value === topCard.value) {
                        player.discard(card);
                        yield this.deck.discard(card);
                        yield this.deck.renderDeck();
                        // this.endTurn(player);
                    }
                    else {
                        const card = yield this.deck.drawCard();
                        player.addCard(card);
                        // this.endTurn(player);
                    }
                    yield this.allowPlayCard();
                }
            }), 1000);
            card.hide();
        });
    }
    play() {
        const currentPlayer = this.getCurrentPlayer();
        currentPlayer.play();
        this.allowPlayCard().then(() => {
            console.log('allow play card');
            this.deck.addDrawEvent(currentPlayer);
        });
    }
    /**
     * allow playing a card for all players
     */
    allowPlayCard() {
        return __awaiter(this, void 0, void 0, function* () {
            //Check if one player is drawing a card
            if (this.getCurrentPlayer().currentAction === 'draw') {
                this.players.forEach(player => {
                    player.onClick = () => { };
                });
                return;
            }
            //Check if one player is playing a card
            this.players.forEach(player => {
                if (player.currentAction === 'play')
                    return;
            });
            for (const player of this.players) {
                // Set listeners for the current player to check if flipped card correspond to the card in the discard pile
                player.addListener((card) => __awaiter(this, void 0, void 0, function* () {
                    yield this.checkCard(card, player);
                }));
            }
        });
    }
}
export default Dutch;
