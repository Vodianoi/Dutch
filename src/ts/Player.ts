import Card from "./Card.js";
import Dutch from "./Dutch";

class Player {
    get game(): Dutch | undefined {
        return this._game;
    }

    set game(value: Dutch) {
        this._game = value;
    }

    private readonly id: number;
    private readonly name: string;
    private hand: Card[] = [];
    private isTurn: boolean = false;
    private _game: Dutch | undefined = undefined;

    constructor(id:number, name:string) {
        this.id = id;
        this.name = name;
    }

    public getId(){
        return this.id;
    }

    public getName(){
        return this.name;
    }

    /**
     * Draw Player's hand using Card.render function
     * Display them in a 2*2 grid
     * use card.render() to display each card (returns HTMLElement)
     */
    public render(){
        const playerDiv = document.createElement('div');
        playerDiv.id = `player-${this.id}`;
        playerDiv.innerHTML = '';
        playerDiv.classList.add('player');
        playerDiv.innerHTML = this.isTurn ?`<h2 style="color: rebeccapurple">${this.name}</h2>` : `<h1>${this.name}</h1>`;
        const handDiv = document.createElement('div');
        handDiv.classList.add('hand');
        playerDiv.appendChild(handDiv);
        for (let card of this.hand) {
            handDiv.appendChild(card.render());
        }
        return playerDiv;
    }

    public async getHand(){
        return this.hand;
    }

    public async setHand(hand: Card[]) {
        for (let card of hand) {
            this.hand.push(new Card(card.code, card.image, card.value, card.suit));
        }
    }

    public showLastTwoCards(on: boolean){
        if (on){
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
        this.hand.forEach((card) => {
            // Add event listener to each card
            card.addFlipEvent();
        })
    }
}

export default Player;