import Card from './Card.js';


class Deck {
    public deck_id: string;
    private pile: string = 'discard';
    private cards: Card[] = [];
    private div = document.createElement('div');

    constructor(id: string) {
        this.deck_id = id;
        this.div.id = 'deck';
    }

    public getId() {
        return this.deck_id;
    }

    public async getDeck() {
        return await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}`)
            .then(response => response.json())
    }

    public async getRemaining() {
        return await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}`)
            .then(response => response.json())
            .then(data => {
                return data.remaining;
            })
    }

    /**
     * Render the last card in the discard pile beside the deck
     */
    public renderDiscardPile() {
        fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/list/`)
            .then(response => response.json())
            .then(data => {


            });
    }

    /**
     * @returns
     */
    public async renderDeck() {
        return await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`)
            .then(response => response.json())
            .then(async data => {

                // DISCARD
                fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/list/`)
                    .then(response => response.json())
                    .then(data => {
                        this.div.innerHTML = '';
                        this.div.style.display = 'flex';
                        this.div.style.justifyContent = 'center';
                        this.div.style.alignItems = 'center';
                        this.div.style.flexDirection = 'row';
                        let card = data.piles[this.pile].cards[0];
                        let img = document.createElement('img');
                        img.src = card.image;
                        img.style.width = '100px';
                        img.style.height = '150px';

                        this.div.appendChild(img);

                    });



                // DECK
                let card = data.cards[0];
                let img = document.createElement('img');
                card = new Card(card.code, card.image, card.value, card.suit);
                img.src = await card.getBackImage();
                img.style.width = '100px';
                img.style.height = '150px';

                const remaining = await this.getRemaining();
                let remainingText = document.createElement('p');
                remainingText.style.fontSize = '20px';
                remainingText.style.fontWeight = 'bold';
                remainingText.style.color = 'white';
                remainingText.innerHTML = `Remaining: ${remaining}`;


                this.div.appendChild(img);
                this.div.appendChild(remainingText);
                this.div.style.transform = 'translateX(35%)';
                if (!document.getElementById('deck'))
                    document.body.appendChild(this.div);
            });
    }


    public shuffle() {
        return fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/shuffle/`)
            .then(response => response.json())
            .then(data => {
                return data;
            });
    }

    public addToPile(card: Card) {
        fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/add/?cards=${card.getCode()}`)
            .then(response => response.json())
            .then(data => {
                console.log(data);
            });
    }

    public async discard() {
        try {
            //get the last card in the deck
            let response = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`)
            let data = await response.json();
            let card = data["cards"][0];
            //add the card to the discard pile
            await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/add/?cards=${card.code}`)
            console.log(data);
            return card;
        } catch (e) {
            console.log("Error while discarding: " + e);
        }
    }


    public drawCard() {
        return fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`)
            .then(response => response.json())
            .then(data => {
                return data;
            });
    }

    public async draw(count: number) {
        try {
            let response = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=${count}`)
            let data = await response.json();
            let cards = data["cards"];
            console.log(data);
            return cards;
        } catch (e) {
            console.log("Error while drawing: " + e);
        }
    }
}

export default Deck;