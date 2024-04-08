import Deck from "./Deck.js";
import Player from "./Player.js";
import Card from "./Card";

const gameContainer = document.createElement('div');
gameContainer.id = 'game';
document.body.appendChild(gameContainer);

class Dutch {

    // region Public Properties
    /**
     *  Deck of the game
     */
    public deck: Deck;


    /**
     *  Players in the game
     */
    public players: Player[];


    /**
     *  Current player index
     */
    public currentPlayer: number;


    /**
     *  Number of cards per player
     */
    public nbCardsPerPlayer: number;

    /**
     *  Verify if one player has already said dutch
     */
    public oneDutch: boolean = false;
    // endregion

    // region Constructor
    /**
     *  Initialize the game
     *  - Set the deck
     *  - Set the players
     *  - Set the current player
     *  - Set the number of cards per player
     * @param deck_id
     */
    constructor(deck_id: string) {
        this.deck = new Deck(deck_id)
        this.players = [];
        this.currentPlayer = 0;
        this.nbCardsPerPlayer = 4;
    }
    // endregion

    // region Public Methods

    /**
     *  Initialize the game
     *  - Deal the cards
     *  - Render the game
     *  - Set the game for all players
     */
    public async init() {
        await this.deal();
        await this.render();

        for (let player of this.players) {
            player.renderAction("ready");
            player.game = this;
        }
    }

    /**
     *  Start the game
     *  Change the action of all players to play
     *  Toggle the last two cards for all players for 2 seconds
     */
    public async startGame() {
        for (let player of this.players) {
            player.renderAction("play");
        }
        setTimeout(() => {
            for (let player of this.players) {
                player.toggleLastTwoCards(true);
            }
        }, 2000);
        for (let player of this.players) {
            player.toggleLastTwoCards(false);
        }
        setTimeout(() => {
            this.play();
        }, 3000);
    }

    /**
     *  Flip all cards for all players
     *  DEBUGGING PURPOSE
     */
    public flipAllCards() {
        for (let player of this.players) {
            player.flipAllCards();
        }
    }


    /**
     *  Ready the player
     *  - Set the player to ready
     *  - Change the player name color to green
     *  - Start the game if all players are ready
     * @param player
     */
    public ready(player: Player) {
        if (player.ready) return;
        player.ready = true;
        player.changePlayerNameColor('green')
        console.log('player ready', player.name);
        if (this.players.every(player => player.ready)) {
            this.startGame().then(() => {
                this.players.forEach((player) => player.changePlayerNameColor('black'))
                console.log('game started');
            });
        }
    }

    /**
     * TODO: Implement the dutch function
     * @param player
     */
    public dutch(player: Player) {
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
    public endTurn(player: Player) {
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
    public addPlayer(player: Player) {
        this.players.push(player);
    }


    /**
     * Allow playing a card for all players
     * - Check if one player is drawing a card
     *  - If yes, set onClick to empty function for all players and return
     *  - If no, set onClick to checkCard for all players
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
        //Check if one player is playing a card TODO
        this.players.forEach(player => {
            if (player.currentAction === 'play') return;
        });
        for (const player of this.players) {
            // Set listeners for the current player to check if flipped card correspond to the card in the discard pile
            player.addListenerToHand(async (card: Card) => {
                await this.checkCard(card, player);
            });
        }
    }
    // endregion

    // region Private Methods
    /**
     *  Deal the cards to the players and discard one card from the draw pile
     * @private
     */
    private async deal() {
        for (let player of this.players) {

            player.game = this;
            let [cards] = await Promise.all([this.deck.draw(this.nbCardsPerPlayer)]);

            await player.setHand(cards);
        }
        await this.deck.discardOneFromDraw();
    }

    /**
     *  Render the game
     *  - Get the game container
     *  - Render the players
     *  - Render the deck
     */
    private async render() {
        const gameContainer = document.getElementById('game') ?? document.createElement('div');
        gameContainer.id = 'game';
        gameContainer.innerHTML = '';
        const players = this.players;
        for (let player of players) {
            const playerDiv = player.render()
            gameContainer.appendChild(playerDiv);
        }
        await this.deck.renderDeck();
    }


    /**
     *  Get the next player to play
     */
    private nextPlayer() {
        this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
    }

    /**
     *  Get the current player
     */
    private getCurrentPlayer() {
        return this.players[this.currentPlayer];
    }


    /**
     *  Play a card for the current player
     *  - Get the current player
     *  - Set the current player to play
     *  - Allow playing a card for all players
     *  - Allow currentPlayer to draw
     * @private
     */
    private play() {
        const currentPlayer = this.getCurrentPlayer();
        currentPlayer.play();
        this.allowPlayCard().then(() => {
            console.log('allow play card')
            this.deck.addDrawEvent(currentPlayer);
        });
    }
    // endregion

    // region Event Handlers
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
    public async checkCard(card: Card, player: Player) {
        setTimeout(async () => {
            card.show();
            const discardPile = await this.deck.getDiscard();

            if (discardPile?.length === 0) return;
            if (discardPile) {
                const topCard = discardPile[discardPile.length - 1];

                if (card.value === topCard.value) {
                    player.discard(card);
                } else {
                    const card = await this.deck.drawCard()
                    player.addCard(card);
                }
                await this.allowPlayCard()
            }
        }, 1000);
        card.hide();

    }
    // endregion
}

export default Dutch;