import Card from "./Card.js";
import Dutch from "./Dutch";

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
     *  Player's id
     */
    readonly id: number;
    /**
     *  Player's name
     */
    readonly name: string;
    /**
     *  Player's hand
     */
    public hand: Card[] = [];
    /**
     *  Player's turn status
     */
    public isTurn: boolean = false;
    /**
     *
     * @public
     */
    public game: Dutch | undefined = undefined;
    /**
     *  Player's main div
     * @public
     */
    private playerDiv: HTMLElement;
    /**
     *  Player's hand div
     * @private
     */
    private readonly handDiv: HTMLElement;
    /**
     *  Player's action div
     * @private
     */
    private actionDiv: HTMLElement;
    /**
     *  Player's ready status
     * @private
     */
    public ready: boolean = false;

    /**
     *  The card that the player has drawn (if any)
     */
    public drawnCard: Card | undefined = undefined;

    /**
     *  Player's current action
     * @private
     */
    currentAction: string = '';

    /**
     *  Player's onClick event
     *   - Default is an empty function
     *   - Can be set to a function that takes an event as an argument
     *   - This function will be called when a card in player's hand is clicked
     */
    public _onClick: Function = () => {
    };


    /**
     *  Get the player's onClick event
     */
    get onClick(): Function {
        return this._onClick;
    }

    /**
     *  Set the player's onClick event
     *   - Default is an empty function
     *   - Can be set to a function that takes an event as an argument
     *   - This function will be called when a card in player's hand is clicked
     * @param value
     */
    set onClick(value: Function) {
        this._onClick = value;
        this.hand.forEach((card) => {
            card.onClick = (e: Event) => {
                value(e);
            }
        })
    }

    /**
     *  Player constructor
     * @param id
     * @param name
     */
    constructor(id: number, name: string) {
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

    /**
     * Draw Player's hand
     * use card.render() to display each card (returns HTMLElement)
     */
    public render() {
        this.playerDiv = document.getElementById(`player-${this.id}`) ?? document.createElement('div');
        this.playerDiv.id = `player-${this.id}`;
        this.playerDiv.innerHTML = '';
        this.playerDiv.classList.add('player');
        this.playerDiv.innerHTML = this.isTurn ? `<h2 style="color: rebeccapurple">${this.name}</h2>` : `<h1>${this.name}</h1>`;
        this.playerDiv.appendChild(this.handDiv);

        this.hand.forEach(card => {
            this.handDiv.appendChild(card.render());
            card.onClick = (e: Event) => {
                this.onClick(e);
            }

        })

        return this.playerDiv;
    }

    /**
     *  Render the player's hand
     */
    public renderHand() {
        this.handDiv.innerHTML = '';
        this.hand.forEach(card => {
            this.handDiv.appendChild(card.render());
            card.onClick = (e: Event) => {
                this.onClick(e);
            }
        })
    }

    /**
     * Render Player's action buttons depending on the action
     * Actions: Ready, Dutch or End turn
     */
    public renderAction(action: string) {
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
                }
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
                }

                const endTurnButton = document.createElement('button');
                endTurnButton.innerHTML = 'End Turn';
                endTurnButton.onclick = () => {
                    this.game?.endTurn(this);
                }
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
                    this.game?.deck.discard(this.drawnCard!);
                    this.game?.endTurn(this);
                    document.getElementById('drawnCard')?.remove();

                }
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
    public changePlayerNameColor(color: string) {
        this.playerDiv?.querySelector('h1')?.setAttribute('style', `color: ${color}`);
    }

    /**
     *  Get the player's hand
     */
    public getHand() {
        return this.hand;
    }

    /**
     *  Set the player's hand
     * @param hand
     */
    public async setHand(hand: Card[]) {
        const response = await fetch(`https://deckofcardsapi.com/api/deck/${this.game?.deck?.deck_id}/pile/${this.id}/add/?cards=${hand.map(card => card.code).join(',')}`);
        if (!response.ok) {
            throw new Error(`Failed to add cards to pile: ${response.status} ${response.statusText}`);
        }
        this.hand = hand
    }


    /**
     *  Toggle the last two cards in the player's hand
     * @param on
     */
    public toggleLastTwoCards(on: boolean) {
        if (on) {
            this.hand[this.hand.length - 1].show();
            this.hand[this.hand.length - 2].show();
        } else {
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
    public addListenerToHand(callback: Function) {
        this.hand.forEach((card) => {
            // Add event listener to each card
            card.addClickEvent(callback);
        })
    }

    /**
     *  End the player's turn
     */
    endTurn() {
        this.isTurn = false;
        this.changePlayerNameColor('black');
        this.renderAction('');
    }

    /**
     *  Discard a card from the player's hand
     * @param card
     */
    discard(card: Card) {
        this.hand = this.hand.filter(c => c.code !== card.code);
        this.renderHand();
        this.game?.deck.discard(card);
    }

    /**
     *  Add a card to the player's hand
     * @param card
     */
    addCard(card: Card) {
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
        })
        setTimeout(() => {
            this.hand.forEach(card => {
                card.hide();
            })
        }, 2000)
    }
}

export default Player;