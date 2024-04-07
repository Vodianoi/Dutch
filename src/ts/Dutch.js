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
const gameContainer = document.createElement('div');
gameContainer.id = 'game';
document.body.appendChild(gameContainer);
class Dutch {
    /**
     *  Initialize the game
     *  - Set the deck
     *  - Set the players
     *  - Set the current player
     *  - Set the number of cards per player
     * @param deck_id
     */
    constructor(deck_id) {
        /**
         *  Verify if one player has already said dutch
         */
        this.oneDutch = false;
        this.deck = new Deck(deck_id);
        this.players = [];
        this.currentPlayer = 0;
        this.nbCardsPerPlayer = 4;
    }
    /**
     *  Initialize the game
     *  - Deal the cards
     *  - Render the game
     *  - Set the game for all players
     */
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
    /**
     *  Start the game
     *  Change the action of all players to play
     *  Toggle the last two cards for all players for 2 seconds
     */
    startGame() {
        return __awaiter(this, void 0, void 0, function* () {
            const players = this.players;
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
    /**
     *  Flip all cards for all players
     *  DEBUGGING PURPOSE
     */
    flipAllCards() {
        for (let player of this.players) {
            player.flipAllCards();
        }
    }
    /**
     *  Deal the cards to the players and discard one card from the draw pile
     * @private
     */
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
    /**
     *  Render the game
     *  - Get the game container
     *  - Render the players
     *  - Render the deck
     */
    render() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const gameContainer = (_a = document.getElementById('game')) !== null && _a !== void 0 ? _a : document.createElement('div');
            gameContainer.id = 'game';
            gameContainer.innerHTML = '';
            const players = this.players;
            for (let player of players) {
                const playerDiv = player.render();
                gameContainer.appendChild(playerDiv);
            }
            yield this.deck.renderDeck();
        });
    }
    /**
     *  Ready the player
     *  - Set the player to ready
     *  - Change the player name color to green
     *  - Start the game if all players are ready
     * @param player
     */
    ready(player) {
        if (player.ready)
            return;
        player.ready = true;
        player.changePlayerNameColor('green');
        console.log('player ready', player.name);
        if (this.players.every(player => player.ready)) {
            this.startGame().then(() => {
                this.players.forEach((player) => player.changePlayerNameColor('black'));
                console.log('game started');
            });
        }
    }
    /**
     * TODO: Implement the dutch function
     * @param player
     */
    dutch(player) {
        const currentPlayer = this.getCurrentPlayer();
        if (player.id === currentPlayer.id) {
            this.oneDutch = true;
            this.nextPlayer();
            this.play();
        }
    }
    /**
     * End the turn for the current player
     * @param player
     */
    endTurn(player) {
        const currentPlayer = this.getCurrentPlayer();
        if (player.id === currentPlayer.id) {
            currentPlayer.endTurn();
            this.nextPlayer();
            this.play();
        }
    }
    /**
     *  Add a player to the game
     * @param player
     */
    addPlayer(player) {
        this.players.push(player);
    }
    /**
     *  Get the next player to play
     */
    nextPlayer() {
        this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
    }
    /**
     *  Get the current player
     */
    getCurrentPlayer() {
        return this.players[this.currentPlayer];
    }
    /**
     *  - Show the card
     *  - Get the discard pile
     *  - Check if the card correspond to the top card of the discard pile
     *  - If yes, discard the card and end the turn
     *  - If no, draw a card and end the turn
     *  - Allow playing a card again for all players
     * @param card
     * @param player
     */
    checkCard(card, player) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("CHECK CARD", card);
            setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                card.show();
                const discardPile = yield this.deck.getDiscard();
                if ((discardPile === null || discardPile === void 0 ? void 0 : discardPile.length) === 0)
                    return;
                if (discardPile) {
                    const topCard = discardPile[discardPile.length - 1];
                    if (card.value === topCard.value) {
                        player.discard(card);
                        // await this.deck.discard(card);
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
    /**
     *  Play a card for the current player
     *  - Get the current player
     *  - Set the current player to play
     *  - Allow playing a card for all players
     *  - Allow currentPlayer to draw
     * @private
     */
    play() {
        const currentPlayer = this.getCurrentPlayer();
        currentPlayer.play();
        this.allowPlayCard().then(() => {
            console.log('allow play card');
            this.deck.addDrawEvent(currentPlayer);
        });
    }
    /**
     * Allow playing a card for all players
     * - Check if one player is drawing a card
     *  - If yes, set onClick to empty function for all players and return
     *  - If no, set onClick to checkCard for all players
     */
    allowPlayCard() {
        return __awaiter(this, void 0, void 0, function* () {
            //Check if one player is drawing a card
            console.log("CURRENT ACTION", this.getCurrentPlayer().currentAction);
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
                player.addListenerToHand((card) => __awaiter(this, void 0, void 0, function* () {
                    yield this.checkCard(card, player);
                }));
            }
        });
    }
}
export default Dutch;
