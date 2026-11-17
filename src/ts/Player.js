/**
 *  Player class
 *  - Represents a player in the game
 *  - Has a hand of cards
 *  - Can play cards
 *  - Can draw cards
 *  - Can discard cards
 *  - Can dutch
 */
class Player {
    /**
     *  Get the player's onClick event
     */
    get onClick() {
        return this._onClick;
    }
    /**
     *  Set the player's onClick event
     *   - Default is an empty function
     *   - Can be set to a function that takes an event as an argument
     *   - This function will be called when a card in player's hand is clicked
     * @param value
     */
    set onClick(value) {
        this._onClick = value;
        this.hand.forEach((card) => {
            card.onClick = (e) => {
                value(e);
            };
        });
    }
    // endregion
    // region Constructor
    /**
     *  Player constructor
     * @param id
     * @param name
     */
    constructor(id, name) {
        /**
         *  Player's hand
         */
        this.hand = [];
        /**
         *  Player's turn status
         */
        this.isTurn = false;
        /**
         * Player's game
         * @public
         */
        this.game = undefined;
        /**
         *  Player's ready status
         * @private
         */
        this.ready = false;
        /**
         *  The card that the player has drawn (if any)
         */
        this.drawnCard = undefined;
        /**
         *  Player's current action
         * @public
         */
        this.currentAction = '';
        // endregion
        // region Event Handlers
        /**
         *  Player's onClick event
         *   - Default is an empty function
         *   - Can be set to a function that takes an event as an argument
         *   - This function will be called when a card in player's hand is clicked
         */
        this._onClick = () => {
        };
        this.id = id;
        this.name = name;
        this.playerDiv = document.createElement('div');
        this.playerDiv.id = `player-${this.id}`;
        this.actionDiv = document.createElement('div');
        this.actionDiv.id = `player-${this.id}-action`;
        this.handDiv = document.createElement('div');
        this.handDiv.id = `player-${this.id}-hand`;
        this.handDiv.classList.add('hand');
    }
    // endregion
    // region Public Methods
    /**
     * Draw Player's hand
     * use card.render() to display each card (returns HTMLElement)
     */
    render() {
        this.playerDiv = document.getElementById(`player-${this.id}`) ?? document.createElement('div');
        this.playerDiv.id = `player-${this.id}`;
        this.playerDiv.innerHTML = '';
        this.playerDiv.classList.add('player');
        this.playerDiv.innerHTML = this.isTurn ? `<h2 style="color: rebeccapurple">${this.name}</h2>` : `<h1>${this.name}</h1>`;
        this.playerDiv.appendChild(this.handDiv);
        this.hand.forEach(card => {
            this.handDiv.appendChild(card.render());
            card.onClick = (e) => {
                this.onClick(e);
            };
        });
        return this.playerDiv;
    }
    /**
     *  Render the player's hand
     */
    renderHand() {
        this.handDiv.innerHTML = '';
        this.hand.forEach(card => {
            this.handDiv.appendChild(card.render());
            card.onClick = (e) => {
                this.onClick(e);
            };
        });
    }
    /**
     * Render Player's action buttons depending on the action
     * Actions: Ready, Dutch or End turn
     */
    renderAction(action) {
        console.log(action);
        this.currentAction = action;
        switch (action) {
            case "ready":
                this.actionDiv = document.getElementById(`player-${this.id}-action`) ?? document.createElement('div');
                this.actionDiv.id = `player-${this.id}-action`;
                this.actionDiv.innerHTML = '';
                this.actionDiv.classList.add('action');
                const readyButton = document.createElement('button');
                readyButton.innerHTML = 'Ready';
                readyButton.onclick = () => {
                    this.game?.ready(this);
                };
                this.actionDiv.appendChild(readyButton);
                this.playerDiv?.appendChild(this.actionDiv);
                break;
            case "dutch":
                this.actionDiv = document.getElementById(`player-${this.id}-action`) ?? document.createElement('div');
                this.actionDiv.id = `player-${this.id}-action`;
                this.actionDiv.innerHTML = '';
                this.actionDiv.classList.add('action');
                const dutchButton = document.createElement('button');
                dutchButton.innerHTML = 'Dutch';
                dutchButton.onclick = () => {
                    this.game?.dutch(this);
                };
                const endTurnButton = document.createElement('button');
                endTurnButton.innerHTML = 'End Turn';
                endTurnButton.onclick = () => {
                    this.game?.endTurn(this);
                };
                this.actionDiv.appendChild(endTurnButton);
                this.actionDiv.appendChild(dutchButton);
                this.playerDiv?.appendChild(this.actionDiv);
                break;
            case 'draw':
                this.actionDiv = document.getElementById(`player-${this.id}-action`) ?? document.createElement('div');
                this.actionDiv.id = `player-${this.id}-action`;
                this.actionDiv.innerHTML = '';
                this.actionDiv.classList.add('action');
                const discardButton = document.createElement('button');
                discardButton.innerHTML = 'Discard';
                discardButton.onclick = () => {
                    console.log("Drawn Card", this.drawnCard);
                    this.discard(this.drawnCard);
                    document.getElementById('drawnCard')?.remove();
                };
                this.actionDiv.appendChild(discardButton);
                this.playerDiv?.appendChild(this.actionDiv);
                break;
            default:
                this.actionDiv = document.getElementById(`player-${this.id}-action`) ?? document.createElement('div');
                this.actionDiv.id = `player-${this.id}-action`;
                this.actionDiv.innerHTML = '';
                break;
        }
    }
    /**
     *  Change the player's name color
     * @param color
     */
    changePlayerNameColor(color) {
        this.playerDiv?.querySelector('h1')?.setAttribute('style', `color: ${color}`);
    }
    /**
     *  Set the player's hand
     * @param hand
     */
    async setHand(hand) {
        const response = await fetch(`https://deckofcardsapi.com/api/deck/${this.game?.deck?.deck_id}/pile/${this.id}/add/?cards=${hand.map(card => card.code).join(',')}`);
        if (!response.ok) {
            throw new Error(`Failed to add cards to pile: ${response.status} ${response.statusText}`);
        }
        this.hand = hand;
    }
    /**
     *  Toggle the last two cards in the player's hand
     * @param on
     */
    toggleLastTwoCards(on) {
        if (on) {
            this.hand[this.hand.length - 1].show();
            this.hand[this.hand.length - 2].show();
        }
        else {
            this.hand[this.hand.length - 1].hide();
            this.hand[this.hand.length - 2].hide();
        }
    }
    /**
     * Play logic for the player
     */
    play() {
        this.isTurn = true;
        this.changePlayerNameColor('rebeccapurple');
        this.renderAction('dutch');
    }
    /**
     *  Add event listener to each card in the player's hand
     * @param callback
     */
    addListenerToHand(callback) {
        this.hand.forEach((card) => {
            // Add event listener to each card
            card.addClickEvent(callback);
        });
    }
    /**
     *  End the player's turn
     */
    endTurn() {
        //TODO #4 - Check if player has drawn a card before ending turn
        this.isTurn = false;
        this.changePlayerNameColor('black');
        this.renderAction('');
    }
    /**
     *  Discard a card from the player's hand
     * @param card
     */
    discard(card) {
        this.hand = this.hand.filter(c => c.code !== card.code);
        this.renderHand();
        this.game?.deck.discard(card);
        //TODO #2 - Check for card to apply effect
    }
    /**
     *  Add a card to the player's hand
     * @param card
     */
    addCard(card) {
        this.hand.push(card);
        this.renderHand();
    }
    /**
     *  Flip all cards in the player's hand
     *  DEBUGGING PURPOSES
     */
    flipAllCards() {
        this.hand.forEach(card => {
            card.show();
        });
        setTimeout(() => {
            this.hand.forEach(card => {
                card.hide();
            });
        }, 2000);
    }
}
export default Player;
