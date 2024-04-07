import Card from './Card.js';
import Player from "./Player";
import Dutch from "./Dutch";


class Deck {
    private readonly _deck_id: string;
    private pile: string = 'discard';
    private div = document.createElement('div');

    get deck_id() {
        return this._deck_id;
    }

    private _onDraw: Function = () => {
    };
    private _onDrawDiscard: Function = () => {
    };

    constructor(id: string) {
        this._deck_id = id;
        this.div.id = 'deck';
        this._onDraw = () => {
            console.log('Draw event not set');
        }
        this._onDrawDiscard = () => {
            console.log('Draw discard event not set');
        }
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

            // DISCARD
            const discardImg = await this.renderDiscard();

            // DRAW
            const deckImg = await this.renderDraw();

            if (!document.getElementById('deck'))
                document.body.appendChild(this.div);

            discardImg.onclick = (ev) => {
                this._onDrawDiscard(ev);
            }
            deckImg.onclick = (ev) => {
                this._onDraw(ev);
            }

        } catch (error) {
            console.error("Error while rendering deck: ", error);
        }
    }


    private async renderDraw() {
        let deckImg = document.createElement('img');
        deckImg.src = Card.DECK_IMAGE_BACK;
        deckImg.id = 'draw';
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
        return deckImg;
    }

    private updateRemaining() {
        this.getRemaining().then(remaining => {
            let remainingText = this.div.querySelector('p');
            if (remainingText) {
                remainingText.innerHTML = `Remaining: ${remaining}`;
            }
        });
    }

    private async renderDiscard() {
        const discardResponse = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/list/`);
        if (!discardResponse.ok) {
            throw new Error(`Failed to get discard pile: ${discardResponse.status} ${discardResponse.statusText}`);
        }
        const discardData = await this.getDiscard();
        console.log('DISCARD', discardData);
        this.div.innerHTML = '';
        this.div.style.display = 'flex';
        this.div.style.justifyContent = 'center';
        this.div.style.alignItems = 'center';
        this.div.style.flexDirection = 'row';
        if (!discardData) {
            throw new Error('No discard data found');
        }
        let card = discardData[discardData.length - 1];
        console.log('CARD', card);
        let discardImg = document.createElement('img');
        discardImg.id = 'discard';
        discardImg.src = card.image;
        discardImg.style.width = '100px';
        discardImg.style.height = '150px';
        this.div.appendChild(discardImg);
        return discardImg;
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

    public addDrawEvent(player: Player) {
        this._onDraw = (e: Event) => this.drawEvent(e, player);
        this._onDrawDiscard = (e: Event) => this.drawEvent(e, player);
    }

    public removeDrawEvent() {
        this._onDraw = () => {
            console.log('Draw event not set');
        }
        this._onDrawDiscard = () => {
            console.log('Draw discard event not set');
        }
    }

    /**
     * Draw event, place the clicked card in the middle of the screen to let the player choose where he wants to put it
     */
    public drawEvent(e: Event, player: Player) {
        player.renderAction('draw');
        player.game?.allowPlayCard()
        console.log('DRAW EVENT', e);
        let cardDiv = e.target as HTMLImageElement;
        switch (cardDiv.id) {
            case 'discard':
                this.div.removeChild(cardDiv);
                this.drawFromDiscard().then(async discardCard => {
                    console.log('DISCARD CARD', discardCard);
                    if (!discardCard) {
                        throw new Error('No card to draw from discard');
                    }
                    this.renderCardAtMiddle(discardCard);
                    player.onClick = (card: Card) => {
                        this.replaceCardEvent(card, player, discardCard);
                    };
                    player.drawnCard = discardCard;
                });
                break;
            case 'draw':
                this.drawCard().then(async card => {
                    console.log('DRAW CARD', card);
                    this.renderCardAtMiddle(card);
                    player.onClick = (card: Card) => {
                        this.replaceCardEvent(card, player, card);
                    };
                    player.drawnCard = card;
                });
                break;
        }

        // Remove event listeners after handling the event
        this.removeDrawEvent();
    }


    /**
     * EVENT: Replace the selected card in the hand with the drawn card
     * @param card
     * @param player
     * @param discardCard
     * @private
     */
    private async replaceCardEvent(card: Card, player: Player, discardCard: Card) {
        let selectedCardCode = card.code;
        let selectedCardDiv = document.getElementById(selectedCardCode);
        selectedCardDiv?.remove();
        let cards = player.getHand();
        //discard the selected card in hand
        await this.discard(card)
        await this.renderDeck()
        //add the drawn card to the hand
        let index = cards.indexOf(card);
        cards.splice(index, 1, discardCard)
        await player.setHand(cards);
        player.renderHand();
        player.renderAction(player.isTurn ? 'dutch' : '')
        document.getElementById('drawnCard')?.remove();
        player.addListener(async (card: Card) => {
            setTimeout(async () => {
                card.show();
                await player.game?.checkCard(card, player);
            }, 1000);
            card.hide()
        });

        player.game?.allowPlayCard()
    }


    public async discard(card: Card) {
        let discardResponse = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/add/?cards=${card.code}`);
        if (!discardResponse.ok) {
            throw new Error(`Failed to discard card: ${discardResponse.status} ${discardResponse.statusText}`);
        }
        let discardData = await discardResponse.json();
        await this.renderDeck()
        console.log('DISCARDED CARD', discardData);
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


    public async drawCard() {
        const response = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`);
        const data = await response.json();
        let card = data.cards[0];
        card = new Card(card.code, card.image, card.value, card.suit);
        this.updateRemaining();
        return card;
    }

    public async draw(count: number) {
        let response = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=${count}`)
        let data = await response.json();
        let cards = data["cards"];
        let res: Card[] = []
        for (let card of cards) {
            res.push(new Card(card.code, card.image, card.value, card.suit));
        }
        this.updateRemaining();
        return res;
    }

    public async drawFromDiscard() {
        let response = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/draw/?count=1`);
        if (!response.ok) {
            throw new Error(`Failed to draw from discard: ${response.status} ${response.statusText}`);
        }
        let data = await response.json();
        if (!data || !data.cards || data.cards.length === 0) {
            throw new Error('No card data found in the response');
        }
        let card = data.cards[data.cards.length - 1];
        card = new Card(card.code, card.image, card.value, card.suit);
        console.log('DRAW DISCARD', data);
        return card;
    }

    public async getDiscard() {
        let response = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/list/`);
        if (!response.ok) {
            throw new Error(`Failed to get discard pile: ${response.status} ${response.statusText}`);
        }
        let data = await response.json();
        let cards: Card[] = []
        for (let card of data.piles[this.pile].cards) {
            cards.push(new Card(card.code, card.image, card.value, card.suit));
        }
        return cards;
    }

}

export default Deck;