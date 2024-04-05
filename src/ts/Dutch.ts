import Deck from "./Deck.js";
import Player from "./Player.js";
import Card from "./Card";

const div = document.createElement('div');
div.id = 'game';
document.body.appendChild(div);


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

    public async startGame() {
        await this.deal();
        await this.render();

        const players = this.getPlayers();
        for(let player of players) {
            player.game = this;
        }

        this.play();
    }

    private async deal() {
        for(let player of this.players) {
            let [cards] = await Promise.all([this.deck.draw(this.nbCardsPerPlayer)]);

            await player.setHand(cards);
        }
    }

    public async render() {
        const game = document.getElementById('game') ?? document.createElement('div');
        game.innerHTML = '';
        const players = this.getPlayers();
        for(let player of players) {
            const playerDiv = player.render()
            game.appendChild(playerDiv);
        }
        await this.deck.renderDeck();
        await this.deck.discard();
        this.deck.renderDiscardPile();
    }

    public updatePlayer(player: Player) {


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

    private play() {
        const players = this.getPlayers();
        const currentPlayer = this.getCurrentPlayer();
        currentPlayer.play();

    }

}

export default Dutch;