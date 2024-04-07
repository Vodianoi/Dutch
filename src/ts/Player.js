var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
        var _a;
        this.playerDiv = (_a = document.getElementById(`player-${this.id}`)) !== null && _a !== void 0 ? _a : document.createElement('div');
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
        var _a, _b, _c, _d, _e, _f, _g;
        console.log(action);
        this.currentAction = action;
        switch (action) {
            case "ready":
                this.actionDiv = (_a = document.getElementById(`player-${this.id}-action`)) !== null && _a !== void 0 ? _a : document.createElement('div');
                this.actionDiv.id = `player-${this.id}-action`;
                this.actionDiv.innerHTML = '';
                this.actionDiv.classList.add('action');
                const readyButton = document.createElement('button');
                readyButton.innerHTML = 'Ready';
                readyButton.onclick = () => {
                    var _a;
                    (_a = this.game) === null || _a === void 0 ? void 0 : _a.ready(this);
                };
                this.actionDiv.appendChild(readyButton);
                (_b = this.playerDiv) === null || _b === void 0 ? void 0 : _b.appendChild(this.actionDiv);
                break;
            case "dutch":
                this.actionDiv = (_c = document.getElementById(`player-${this.id}-action`)) !== null && _c !== void 0 ? _c : document.createElement('div');
                this.actionDiv.id = `player-${this.id}-action`;
                this.actionDiv.innerHTML = '';
                this.actionDiv.classList.add('action');
                const dutchButton = document.createElement('button');
                dutchButton.innerHTML = 'Dutch';
                dutchButton.onclick = () => {
                    var _a;
                    (_a = this.game) === null || _a === void 0 ? void 0 : _a.dutch(this);
                };
                const endTurnButton = document.createElement('button');
                endTurnButton.innerHTML = 'End Turn';
                endTurnButton.onclick = () => {
                    var _a;
                    (_a = this.game) === null || _a === void 0 ? void 0 : _a.endTurn(this);
                };
                this.actionDiv.appendChild(endTurnButton);
                this.actionDiv.appendChild(dutchButton);
                (_d = this.playerDiv) === null || _d === void 0 ? void 0 : _d.appendChild(this.actionDiv);
                break;
            case 'draw':
                this.actionDiv = (_e = document.getElementById(`player-${this.id}-action`)) !== null && _e !== void 0 ? _e : document.createElement('div');
                this.actionDiv.id = `player-${this.id}-action`;
                this.actionDiv.innerHTML = '';
                this.actionDiv.classList.add('action');
                const discardButton = document.createElement('button');
                discardButton.innerHTML = 'Discard';
                discardButton.onclick = () => {
                    var _a, _b;
                    console.log("Drawn Card", this.drawnCard);
                    this.discard(this.drawnCard);
                    (_a = this.game) === null || _a === void 0 ? void 0 : _a.endTurn(this);
                    (_b = document.getElementById('drawnCard')) === null || _b === void 0 ? void 0 : _b.remove();
                };
                this.actionDiv.appendChild(discardButton);
                (_f = this.playerDiv) === null || _f === void 0 ? void 0 : _f.appendChild(this.actionDiv);
                break;
            default:
                this.actionDiv = (_g = document.getElementById(`player-${this.id}-action`)) !== null && _g !== void 0 ? _g : document.createElement('div');
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
        var _a, _b;
        (_b = (_a = this.playerDiv) === null || _a === void 0 ? void 0 : _a.querySelector('h1')) === null || _b === void 0 ? void 0 : _b.setAttribute('style', `color: ${color}`);
    }
    /**
     *  Set the player's hand
     * @param hand
     */
    setHand(hand) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const response = yield fetch(`https://deckofcardsapi.com/api/deck/${(_b = (_a = this.game) === null || _a === void 0 ? void 0 : _a.deck) === null || _b === void 0 ? void 0 : _b.deck_id}/pile/${this.id}/add/?cards=${hand.map(card => card.code).join(',')}`);
            if (!response.ok) {
                throw new Error(`Failed to add cards to pile: ${response.status} ${response.statusText}`);
            }
            this.hand = hand;
        });
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
        var _a;
        this.hand = this.hand.filter(c => c.code !== card.code);
        this.renderHand();
        (_a = this.game) === null || _a === void 0 ? void 0 : _a.deck.discard(card);
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
