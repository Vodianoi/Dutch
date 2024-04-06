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
    dutched: boolean = false;

    constructor(deck_id: string) {
        this.deck = new Deck(deck_id)
        this.players = [];
        this.currentPlayer = 0;
        this.nbCardsPerPlayer = 4;
    }

    public async init() {
        await this.deal();
        await this.render();

        for (let player of this.players) {
            player.renderAction("ready");
            player.game = this;
        }
    }

    public async startGame() {

        const players = this.getPlayers();

        setTimeout(() => {
            for (let player of players) {
                player.toggleLastTwoCards(true);
            }
        }, 2000);
        for (let player of players) {

            player.toggleLastTwoCards(false);

        }
        await this.play();
    }

    private async deal() {
        for (let player of this.players) {

            player.game = this;
            let [cards] = await Promise.all([this.deck.draw(this.nbCardsPerPlayer)]);

            await player.setHand(cards);
        }
    }

    public async render() {
        const game = document.getElementById('game') ?? document.createElement('div');
        game.id = 'game';
        game.innerHTML = '';
        const players = this.getPlayers();
        for (let player of players) {
            const playerDiv = player.render()
            game.appendChild(playerDiv);
        }
        await this.deck.discardOneFromDraw();
        await this.deck.renderDeck();
        // this.deck.renderDiscardPile();
    }

    public updatePlayer(player: Player) {


    }

    public ready(player: Player) {
        player.ready = true;
        player.changePlayerNameColor('green')
        console.log('player ready', player.getName());
        if (this.getPlayers().every(player => player.ready)) {
            this.startGame().then(r => {
                this.players.forEach((player) => player.changePlayerNameColor('black'))
                console.log('game started');
            });
        }
    }

    public dutch(player: Player) {
        const currentPlayer = this.getCurrentPlayer();
        if (player.getId() === currentPlayer.getId()) {
            this.dutched = true;
            this.nextPlayer();
            this.play();
        }
    }

    public endTurn(player: Player) {
        const currentPlayer = this.getCurrentPlayer();
        if (player.getId() === currentPlayer.getId()) {
            currentPlayer.endTurn();
            this.nextPlayer();
            this.play();
        }
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
        return this.players.map(player => player.getHand());
    }


    static fromJSON(json: any) {
        return Object.assign(new Dutch(json.deck_id), json);
    }

    private async play() {
        const players = this.getPlayers();
        const currentPlayer = this.getCurrentPlayer();
        currentPlayer.play();

    }

}

export default Dutch;