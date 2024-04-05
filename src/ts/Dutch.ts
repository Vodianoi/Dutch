import Deck from "./Deck.js";
import Player from "./Player.js";

class Dutch {
    deck: Deck;
    players: Player[];
    currentPlayer: number;
    nbCardsPerPlayer: number;

    constructor(deck_id: string) {
        this.deck = new Deck(deck_id)
        this.players = [];
        this.currentPlayer = 0;
        this.nbCardsPerPlayer = 4;
    }

    startGame() {
        this.deal();
    }

    private deal() {
        this.players.forEach(async player => {
            await this.deck.draw(this.nbCardsPerPlayer).then(async cards => {
                await player.setHand(cards, this.deck.deck_id);
            });
        });
    }

    addPlayer(player: Player) {
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

    setCurrentPlayer(player: number) {
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


    static fromJSON(json: any) {
        return Object.assign(new Dutch(json.deck_id), json);
    }
}

export default Dutch;