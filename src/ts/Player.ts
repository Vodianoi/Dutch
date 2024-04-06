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


    private readonly id: number;
    private readonly name: string;
    private _hand: Card[] = [];
    private isTurn: boolean = false;
    private _game: Dutch | undefined = undefined;
    private handDiv: HTMLElement | null = null;
    private actionDiv: HTMLElement | null = null;
    private _ready: boolean = false;

    constructor(id: number, name: string) {
        this.id = id;
        this.name = name;
    }

    public getId() {
        return this.id;
    }

    public getName() {
        return this.name;
    }

    /**
     * Draw Player's hand using Card.render function
     * use card.render() to display each card (returns HTMLElement)
     */
    public render() {
        this.handDiv = document.getElementById(`player-${this.id}`) ?? document.createElement('div');
        this.handDiv.id = `player-${this.id}`;
        this.handDiv.innerHTML = '';
        this.handDiv.classList.add('player');
        this.handDiv.innerHTML = this.isTurn ? `<h2 style="color: rebeccapurple">${this.name}</h2>` : `<h1>${this.name}</h1>`;
        const handDiv = document.createElement('div');
        handDiv.classList.add('hand');
        this.handDiv.appendChild(handDiv);
        this.getHand().then((cards) => {
            console.log(cards)
            cards.forEach(card => {
                handDiv?.appendChild(card.render());
            })
        })
        return this.handDiv;
    }

    public renderHand() {
        const cards = this.handDiv?.querySelectorAll('.card');
        cards?.forEach((card) => {
            card.remove();
        })
        const handDiv = this.handDiv?.querySelector('.hand');
        this.getHand().then((cards) => {
            cards.forEach(card => {
                console.log(card)
                handDiv?.appendChild(card.render());
            })
        })
    }

    public setHandListeners(callback : Function) {
        this._hand.forEach((card) => {
            card.removeFlipEvent();
            card.div?.addEventListener('click', () => {
                callback(card);
            })
        })
    }

    /**
     * Render Player's action buttons depending on the action
     * Actons: Ready, Dutch or End turn
     */
    public renderAction(action: string) {
        console.log(action);
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
                this.handDiv?.appendChild(this.actionDiv);
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
                this.handDiv?.appendChild(this.actionDiv);
                break;
            default:
                this.actionDiv = document.getElementById(`player-${this.id}-action`) ?? document.createElement('div');
                this.actionDiv.id = `player-${this.id}-action`;
                this.actionDiv.innerHTML = '';
                break;

        }
    }

    public changePlayerNameColor(color: string) {
        this.handDiv?.querySelector('h1')?.setAttribute('style', `color: ${color}`);
    }

    public async getHand() {
        // const response = await fetch(`https://deckofcardsapi.com/api/deck/${this.game?.deck?.deck_id}/pile/${this.id}/list/`);
        // const data = await response.json();
        // const cards: Card[] = []
        // for (let card of data.piles[`player-${this.id}`].cards) {
        //     cards.push(new Card(card.code, card.image, card.value, card.suit));
        // }
        return this._hand;
    }

    public async setHand(hand: Card[]) {
        try {
            // if (this._hand.length > 0)
            //     await fetch(`https://deckofcardsapi.com/api/deck/${this.game?.deck?.deck_id}/pile/${this.id}/return/`);
            const response = await fetch(`https://deckofcardsapi.com/api/deck/${this.game?.deck?.deck_id}/pile/${this.id}/add/?cards=${hand.map(card => card.code).join(',')}`);
            if (!response.ok) {
                throw new Error(`Failed to add cards to pile: ${response.status} ${response.statusText}`);
            }
            this._hand = hand
        } catch (error) {
            console.error('Error:', error);
        }
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
        this._hand.forEach((card) => {
            // Add event listener to each card
            card.addFlipEvent();
        })
        this.game?.deck?.addDrawEvent(this)

        this.changePlayerNameColor('rebeccapurple');
        this.renderAction('dutch');
    }

    endTurn() {
        this.isTurn = false;
        this._hand.forEach((card) => {
            card.removeFlipEvent();
        })
        this.changePlayerNameColor('black');
        this.renderAction('');
    }
}

export default Player;