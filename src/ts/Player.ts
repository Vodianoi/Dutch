import Card from "./Card.js";
import Dutch from "./Dutch";

class Player {
    get game(): Dutch | undefined {
        return this._game;
    }

    set game(value: Dutch) {
        this._game = value;
    }

    get ready(): boolean {
        return this._ready;
    }

    set ready(value: boolean) {
        this._ready = value;
    }

    get onClick(): Function {
        return this._onClick;
    }

    set onClick(value: Function) {
        this._onClick = value;
        this._hand.forEach((card) => {
            card.onClick = (e: Event) => {
                value(e);
            }
        })
    }

    get currentAction(): string {
        return this._currentAction;
    }

    set currentAction(value: string) {
        this._currentAction = value;
    }

    get isTurn(): boolean {
        return this._isTurn;
    }

    set isTurn(value: boolean) {
        this._isTurn = value;
    }


    private readonly id: number;
    private readonly name: string;
    private _hand: Card[] = [];
    private _isTurn: boolean = false;
    private _game: Dutch | undefined = undefined;
    private playerDiv: HTMLElement;
    private readonly handDiv: HTMLElement;
    private actionDiv: HTMLElement;
    private _ready: boolean = false;

    private _currentAction: string = '';

    public _onClick: Function = () => {
    };

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

    public getId() {
        return this.id;
    }

    public getName() {
        return this.name;
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

        this._hand.forEach(card => {
            this.handDiv.appendChild(card.render());
            card.onClick = (e: Event) => {
                this.onClick(e);
            }

        })

        return this.playerDiv;
    }

    public renderHand() {
        this.handDiv.innerHTML = '';
        this._hand.forEach(card => {
            this.handDiv.appendChild(card.render());
            card.onClick = (e: Event) => {
                this.onClick(e);
            }
        })
    }

    // public setHandListeners(callback : Function) {
    //     this._hand.forEach((card) => {
    //         console.log('setting listeners', callback);
    //         card.onClick = (e: Event) => {
    //             callback(e);
    //         }
    //     })
    // }

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
            default:
                this.actionDiv = document.getElementById(`player-${this.id}-action`) ?? document.createElement('div');
                this.actionDiv.id = `player-${this.id}-action`;
                this.actionDiv.innerHTML = '';
                break;

        }
    }

    public changePlayerNameColor(color: string) {
        this.playerDiv?.querySelector('h1')?.setAttribute('style', `color: ${color}`);
    }

    public getHand() {
        // const response = await fetch(`https://deckofcardsapi.com/api/deck/${this.game?.deck?.deck_id}/pile/${this.id}/list/`);
        // const data = await response.json();
        // const cards: Card[] = []
        // for (let card of data.piles[`player-${this.id}`].cards) {
        //     cards.push(new Card(card.code, card.image, card.value, card.suit));
        // }
        return this._hand;
    }

    public async setHand(hand: Card[]) {
        const response = await fetch(`https://deckofcardsapi.com/api/deck/${this.game?.deck?.deck_id}/pile/${this.id}/add/?cards=${hand.map(card => card.code).join(',')}`);
        if (!response.ok) {
            throw new Error(`Failed to add cards to pile: ${response.status} ${response.statusText}`);
        }
        this._hand = hand
    }


    public toggleLastTwoCards(on: boolean) {
        if (on) {
            this._hand[this._hand.length - 1].show();
            this._hand[this._hand.length - 2].show();
        } else {
            this._hand[this._hand.length - 1].hide();
            this._hand[this._hand.length - 2].hide();
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

    public addListener(callback: Function) {
        this._hand.forEach((card) => {
            // Add event listener to each card
            card.addClickEvent(callback);
        })
    }

    endTurn() {
        this.isTurn = false;
        this.changePlayerNameColor('black');
        this.renderAction('');
    }

    discard(card: Card) {
        this._hand = this._hand.filter((c) => c !== card);
        this.renderHand();
    }

    addCard(card: Card) {
        this._hand.push(card);
        this.renderHand();

    }
}

export default Player;