import Deck from "./Deck.js";
import Player from "./Player.js";
import Card from "./Card";

const gameContainer = document.createElement('div');
gameContainer.id = 'game';
document.body.appendChild(gameContainer);


class Dutch {
    deck: Deck;
    players: Player[];
    currentPlayer: number;
    nbCardsPerPlayer: number;
    oneDutch: boolean = false;

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
    }

    public flipAllCards() {
        for (let player of this.players) {
            player.flipAllCards();
        }
    }

    private async deal() {
        for (let player of this.players) {

            player.game = this;
            let [cards] = await Promise.all([this.deck.draw(this.nbCardsPerPlayer)]);

            await player.setHand(cards);
        }
        await this.deck.discardOneFromDraw();
    }

    public async render() {
        const gameContainer = document.getElementById('game') ?? document.createElement('div');
        gameContainer.id = 'game';
        gameContainer.innerHTML = '';
        const players = this.getPlayers();
        for (let player of players) {
            const playerDiv = player.render()
            gameContainer.appendChild(playerDiv);
        }
        await this.deck.renderDeck();
    }

    public ready(player: Player) {
        if (player.ready) return;
        player.ready = true;
        player.changePlayerNameColor('green')
        console.log('player ready', player.getName());
        if (this.getPlayers().every(player => player.ready)) {
            this.startGame().then(() => {
                this.players.forEach((player) => player.changePlayerNameColor('black'))
                console.log('game started');
            });
        }
    }

    public dutch(player: Player) {
        const currentPlayer = this.getCurrentPlayer();
        if (player.getId() === currentPlayer.getId()) {
            this.oneDutch = true;
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

    getCurrentPlayer() {
        return this.players[this.currentPlayer];
    }

    async checkCard(card: Card, player: Player) {
        setTimeout(async () => {
            card.show();
            const discardPile = await this.deck.getDiscard();

            if (discardPile?.length === 0) return;
            if (discardPile) {
                const topCard = discardPile[discardPile.length - 1];

                if (card.value === topCard.value) {
                    player.discard(card);
                    await this.deck.discard(card);
                    await this.deck.renderDeck()
                    // this.endTurn(player);
                } else {
                    const card = await this.deck.drawCard()
                    player.addCard(card);
                    // this.endTurn(player);
                }
                await this.allowPlayCard()
            }
        }, 1000);
        card.hide();

    }

    private play() {
        const currentPlayer = this.getCurrentPlayer();
        currentPlayer.play();
        this.allowPlayCard().then(() => {
            console.log('allow play card')
            this.deck.addDrawEvent(currentPlayer);
        });
    }

    /**
     * allow playing a card for all players
     */
    public async allowPlayCard() {
        //Check if one player is drawing a card
        console.log("CURRENT ACTION", this.getCurrentPlayer().currentAction)
        if (this.getCurrentPlayer().currentAction === 'draw') {
            this.players.forEach(player => {
                player.onClick = () => { };
            });
            return;
        }
        //Check if one player is playing a card
        this.players.forEach(player => {
            if (player.currentAction === 'play') return;
        });
        for (const player of this.players) {
            // Set listeners for the current player to check if flipped card correspond to the card in the discard pile
            player.addListener(async (card: Card) => {
                await this.checkCard(card, player);
            });
        }
    }

}

export default Dutch;