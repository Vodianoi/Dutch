import Card from './Card.js';

class Deck {
    public deck_id: string;
    private remaining: number = 52;
    private shuffled: boolean = true;
    private pile: string = 'discard';

    constructor(id:string) {
        this.deck_id = id;
    }

    public getId() {
        return this.deck_id;
    }

    public async getDeck(){
        return await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}`)
            .then(response => response.json())
    }

    public getRemaining() {
        return this.remaining;
    }

    public getShuffled() {
        return this.shuffled;
    }

    public shuffle() {
        return fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/shuffle/`)
            .then(response => response.json())
            .then(data => {
                return data;
            });
    }

    // public getCards() {
    //     return this.cards;
    // }
    //
    // public setCards(cards: Card[]) {
    //     this.cards = cards;
    // }

    public addToPile(card: Card) {
        fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/add/?cards=${card.getCode()}`)
            .then(response => response.json())
            .then(data => {
                console.log(data);
            });
    }

    public getPile() {
        return fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/list/`)
            .then(response => response.json())
            .then(data => {
                return data;
            });
    }

    public getLastCardFromPile() {
        return fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/draw/?count=1`)
            .then(response => response.json())
            .then(data => {
                return data;
            });
    }

    public drawCard() {
        return fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`)
            .then(response => response.json())
            .then(data => {
                return data;
            });
    }

    public async draw(count: number) {
        return await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=${count}`)
            .then(response => response.json())
            .then(data => {
                let cards: Card[] = [];
                data.cards.forEach((card: Card) => {
                    let c = new Card(card.code, card.image, card.value, card.suit);
                    cards.push(c);
                })
                fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}`)
                    .then(response => response.json())
                    .then(data => {
                        this.remaining = data.remaining;
                    });
                return cards;
            });
    }
}

export default Deck;