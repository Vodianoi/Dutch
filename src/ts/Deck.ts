import Card from './Card.js';
import Player from "./Player";
import card from "./Card.js";


class Deck {
    public deck_id: string;
    private pile: string = 'discard';
    private div = document.createElement('div');

    constructor(id: string) {
        this.deck_id = id;
        this.div.id = 'deck';
    }

    public getId() {
        return this.deck_id;
    }

    public async getDeck() {
        return await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/`)
            .then(response => response.json())
    }

    public async getRemaining() {
        return await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/`)
            .then(response => response.json())
            .then(data => {
                return data.remaining;
            })
    }


    /**
     * @returns
     */
    public async renderDeck() {
        try {
            // const response = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`);
            // if (!response.ok) {
            //     throw new Error(`Failed to draw card from deck: ${response.status} ${response.statusText}`);
            // }
            // const data = await response.json();

            // DISCARD
            const discardResponse = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/list/`);
            if (!discardResponse.ok) {
                throw new Error(`Failed to get discard pile: ${discardResponse.status} ${discardResponse.statusText}`);
            }
            const discardData = await discardResponse.json();
            console.log('DISCARD', discardData);
            this.div.innerHTML = '';
            this.div.style.display = 'flex';
            this.div.style.justifyContent = 'center';
            this.div.style.alignItems = 'center';
            this.div.style.flexDirection = 'row';
            let card = discardData.piles[this.pile].cards[0];
            console.log('CARD', card);
            let img = document.createElement('img');
            img.id = 'discard';
            img.src = card.image;
            img.style.width = '100px';
            img.style.height = '150px';
            this.div.appendChild(img);

            // DECK
            let deckImg = document.createElement('img');
            deckImg.src = Card.backImage;
            deckImg.id = 'deck';
            deckImg.style.width = '100px';
            deckImg.style.height = '150px';

            const remaining = await this.getRemaining();
            let remainingText = document.createElement('p');
            remainingText.style.fontSize = '20px';
            remainingText.style.fontWeight = 'bold';
            remainingText.style.color = 'white';
            remainingText.innerHTML = `Remaining: ${remaining}`;

            this.div.appendChild(deckImg);
            this.div.appendChild(remainingText);
            this.div.style.transform = 'translateX(35%)';
            if (!document.getElementById('deck'))
                document.body.appendChild(this.div);
        } catch (error) {
            console.error("Error while rendering deck: ", error);
        }
    }


    public renderCardAtMiddle(card: Card) {
        let img = document.createElement('img');
        img.src = card.image;
        img.style.width = '100px';
        img.style.height = '150px';
        img.style.position = 'absolute';
        img.style.top = '50%';
        img.style.left = '50%';
        img.style.transform = 'translate(-50%, -50%)';
        img.style.zIndex = '1000';
        img.style.cursor = 'pointer';
        img.id = 'drawnCard';
        document.body.appendChild(img);
    }

    /**
     *
     */
    public addDrawEvent(player: Player) {
        this.div.querySelector('#discard')?.addEventListener('click', this.drawEvent(player));
        this.div.querySelector('#deck')?.addEventListener('click', this.drawEvent(player));
    }

    /**
     * Draw event, place the clicked card in the middle of the screen to let the player choose where he wants to put it
     */
    public drawEvent(player: Player) {
        return (e: Event) => {
            let cardDiv = e.target as HTMLImageElement;
            this.drawFromDiscard().then(async discardCard => {
                if (!discardCard) {
                    throw new Error('No card to draw from discard');
                }
                cardDiv?.remove();
                this.renderCardAtMiddle(discardCard);
                // let cards = await player.getHand() as Card[];
                player.setHandListeners((card: Card) => this.replaceCardEvent(card, player, discardCard) )
                // cards.forEach(handCard => {
                //     handCard.removeFlipEvent();
                //     // Add Listener to select one of the cards in the hand
                //     handCard.div.addEventListener('click', );
                //     console.log("ADDED EVENT", handCard.div)
                // });
            });
        }
    }

    /**
     * EVENT: Replace the selected card in the hand with the drawn card
     * @param card
     * @param player
     * @param discardCard
     * @private
     */
    private async replaceCardEvent(card: Card, player: Player, discardCard: Card) {
        // let selectedCard = e.currentTarget as HTMLImageElement;
        console.log("EVENT: REPLACE CARD", card)
        let selectedCardCode = card.code;
        let selectedCardDiv = document.getElementById(selectedCardCode);
        selectedCardDiv?.remove();
        console.log("SELECTED CARD", selectedCardCode);
        let cards = await player.getHand();
        console.log("HAND CARD", card);
        console.log("CARDS", cards);
        //discard the selected card in hand
        await this.discard(card)
        await this.renderDeck()
        //add the drawn card to the hand
        let index = cards.indexOf(card);
        cards.splice(index, 1, discardCard)
        await player.setHand(cards);
        player.renderHand();
        document.getElementById('drawnCard')?.remove();

    }

    public shuffle() {
        return fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/shuffle/`)
            .then(response => response.json())
            .then(data => {
                return data;
            });
    }

    public async discard(card: Card) {
        try {
            // Return the card to deck before adding to discard pile
            let returnResponse = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/return/?cards=${card.code}`);
            if (!returnResponse.ok) {
                throw new Error(`Failed to return card to deck: ${returnResponse.status} ${returnResponse.statusText}`);
            }
            let returnData = await returnResponse.json();
            console.log('RETURNED CARD', returnData);

            let discardResponse = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/add/?cards=${card.code}`);
            if (!discardResponse.ok) {
                throw new Error(`Failed to discard card: ${discardResponse.status} ${discardResponse.statusText}`);
            }
            let discardData = await discardResponse.json();
            console.log('DISCARDED CARD', discardData);
        } catch (error) {
            console.error("Error while adding card to pile: ", error);
        }
    }


    public async discardOneFromDraw() {
        try {
            //get the last card in the deck
            let response = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`)
            let data = await response.json();
            let card = data["cards"][0];
            //add the card to the discard pile
            await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/add/?cards=${card.code}`)
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
        let response = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=${count}`)
        let data = await response.json();
        let cards = data["cards"];
        let res: Card[] = []
        for (let card of cards) {
            res.push(new Card(card.code, card.image, card.value, card.suit));
        }
        return res;
    }

    public async drawFromDiscard() {
        try {
            let response = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/draw/?count=1`);
            if (!response.ok) {
                throw new Error(`Failed to draw from discard: ${response.status} ${response.statusText}`);
            }
            let data = await response.json();
            if (!data || !data.cards || data.cards.length === 0) {
                throw new Error('No card data found in the response');
            }
            let card = data.cards[0];
            card = new Card(card.code, card.image, card.value, card.suit);
            console.log('DRAW DISCARD', data);
            return card;
        } catch (error) {
            console.error("Error while drawing from discard: ", error);
            return null; // Or return a default card object
        }
    }

}

export default Deck;