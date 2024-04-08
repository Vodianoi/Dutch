import Card from './Card.js';
import Player from "./Player";

/**
 *  Deck class
 */
class Deck {

    // region Public Properties

    /**
     *  Deck id from the API
     */
    public readonly deck_id: string;
    // endregion

    // region Private Properties
    /**
     *  Discard pile
     * @private
     */
    private pile: string = 'discard';

    /**
     *  Container for the deck
     * @private
     */
    private container = document.createElement('div');

    /**
     * Draw clicked event
     */
    private _onDraw: Function = () => {
    };

    /**
     *  Draw discard clicked event
     */
    private _onDrawDiscard: Function = () => {
    };
    // endregion

    // region Constructor
    /**
     *  Create a new deck
     *   - Set the deck id
     *   - Set the discard pile
     *   - Set the div id
     *   - Set the draw and discard event listener to the default event
     * @param id
     */
    constructor(id: string) {
        this.deck_id = id;
        this.container.id = 'deck';
        this._onDraw = () => {
            console.log('Draw event not set');
        }
        this._onDrawDiscard = () => {
            console.log('Draw discard event not set');
        }
    }
    // endregion

    // region Public Methods
    /**
     *  Get the remaining cards in the deck
     */
    public async getRemaining(): Promise<number> {
        return await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/`)
            .then(response => response.json())
            .then(data => {
                return data.remaining;
            })
    }


    /**
     *  Render the deck
     *   - Draw pile
     *   - Remaining cards
     *   - Discard pile
     * @returns
     */
    public async renderDeck() {
        try {

            // DISCARD
            const discardImg = await this.renderDiscard();

            // DRAW
            const deckImg = await this.renderDraw();

            if (!document.getElementById('deck'))
                document.body.appendChild(this.container);

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

    /**
     *  Discard a card
     *   - Add the card to the discard pile
     *   - Render the deck
     *   - Log the discarded card
     *
     * @param card Card to discard
     */
    public async discard(card: Card) {
        let discardResponse = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/add/?cards=${card.code}`);
        if (!discardResponse.ok) {
            throw new Error(`Failed to discard card: ${discardResponse.status} ${discardResponse.statusText}`);
        }
        let discardData = await discardResponse.json();
        let discardDiv = this.container.querySelector('#discard') as HTMLImageElement;
        if (discardDiv) {
            discardDiv.src = card.image;
        }

        console.log('DISCARDED CARD', discardData);
    }


    /**
     *  Discard one card from the draw pile
     *  - Get the last card in the deck
     *  - Add the card to the discard pile
     *  - Return the discarded card
     */
    // @ts-ignore
    public async discardOneFromDraw(): Promise<Card>{
        try {
            //get the last card in the deck
            let response = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`)
            let data = await response.json();
            let card = data["cards"][0];
            card = new Card(card.code, card.image, card.value, card.suit);
            //add the card to the discard pile
            await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/add/?cards=${card.code}`)
            return card;
        } catch (e) {
            console.log("Error while discarding: " + e);
        }
    }

    /**
     *  Draw a card from the deck
     */
    public async drawCard(): Promise<Card> {
        const response = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/draw/?count=1`);
        const data = await response.json();
        let card = data.cards[0];
        card = new Card(card.code, card.image, card.value, card.suit);
        this.updateRemaining();
        return card;
    }

    /**
     *  Draw multiple cards from the deck
     * @param count
     */
    public async draw(count: number): Promise<Card[]> {
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

    /**
     *  Get the discard pile
     */
    public async getDiscard(): Promise<Card[]>{
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
    // endregion

    // region Private Methods
    /**
     *  Render the draw pile
     * @private
     */
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

        this.container.appendChild(deckImg);
        this.container.appendChild(remainingText);
        this.container.style.transform = 'translateX(35%)';
        return deckImg;
    }

    /**
     *  Update remaining cards displayed on the deck
     * @private
     */
    private updateRemaining() {
        this.getRemaining().then(remaining => {
            let remainingText = this.container.querySelector('p');
            if (remainingText) {
                remainingText.innerHTML = `Remaining: ${remaining}`;
            }
        });
    }

    /**
     * Render the discard pile
     * @private
     */
    private async renderDiscard() {
        const discardResponse = await fetch(`https://www.deckofcardsapi.com/api/deck/${this.deck_id}/pile/${this.pile}/list/`);
        if (!discardResponse.ok) {
            throw new Error(`Failed to get discard pile: ${discardResponse.status} ${discardResponse.statusText}`);
        }
        const discardData = await this.getDiscard();
        console.log('DISCARD', discardData);
        this.container.innerHTML = '';
        this.container.style.display = 'flex';
        this.container.style.justifyContent = 'center';
        this.container.style.alignItems = 'center';
        this.container.style.flexDirection = 'row';
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
        this.container.appendChild(discardImg);
        return discardImg;
    }

    /**
     * Render the card in the middle of the screen
     * @param card Card to render
     */
    private renderCardAtMiddle(card: Card) {
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
     *  Draw a card from the discard pile
     */
    private async drawFromDiscard(): Promise<Card>{
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
    // endregion

    // region Event Handlers
    /**
     *  Add the draw event listeners to the deck
     * @param player Player that will draw the card
     */
    public addDrawEvent(player: Player) {
        this._onDraw = (e: Event) => this.drawEvent(e, player);
        this._onDrawDiscard = (e: Event) => this.drawEvent(e, player);
    }

    /**
     *  Remove the draw event listeners from the deck and set the default event
     */
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
        player.game?.allowPlayCard()
        console.log('DRAW EVENT', e);
        let cardDiv = e.target as HTMLImageElement;
        switch (cardDiv.id) {
            case 'discard':
                this.container.removeChild(cardDiv);
                this.drawFromDiscard().then(async discardCard => {
                    if (!discardCard) {
                        throw new Error('No card to draw from discard');
                    }
                    this.renderCardAtMiddle(discardCard);
                    player.onClick = (handCard: Card) => {
                        this.replaceCardEvent(handCard, player, discardCard);
                    };
                    player.drawnCard = discardCard;
                });
                break;
            case 'draw':
                player.renderAction('draw');
                this.drawCard().then(async drawnCard => {
                    this.renderCardAtMiddle(drawnCard);
                    player.onClick = (handCard: Card) => {
                        this.replaceCardEvent(handCard, player, drawnCard);
                    };
                    player.drawnCard = drawnCard;
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
        let cards = player.hand;
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
        player.addListenerToHand(async (card: Card) => {
            setTimeout(async () => {
                card.show();
                await player.game?.checkCard(card, player);
            }, 1000);
            card.hide()
        });

        player.game?.allowPlayCard()
    }
    // endregion
}

export default Deck;