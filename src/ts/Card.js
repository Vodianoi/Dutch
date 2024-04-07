class Card {
    // endregion
    // region Constructor
    constructor(code, image, value, suit) {
        // endregion
        // region Private Properties
        this.CLASS_CARD = 'card';
        this.CLASS_CARD_INNER = 'card-inner';
        this.CLASS_CARD_FRONT = 'card-front';
        this.CLASS_CARD_BACK = 'card-back';
        // endregion
        // region Event Handlers
        this.onClick = () => { };
        this.code = code;
        this.image = image;
        this.value = value;
        this.suit = suit;
        this.div = document.createElement('div');
    }
    // endregion
    // region Public Methods
    /**
     * Render the card to the screen
     * Use card with 2 divs card-back, card-front as css classes and img tag for the image
     */
    render() {
        this.div.classList.add(this.CLASS_CARD);
        this.div.id = this.code;
        this.div.innerHTML = '';
        const cardFront = document.createElement('div');
        cardFront.classList.add(this.CLASS_CARD_INNER);
        cardFront.classList.add(this.CLASS_CARD_FRONT);
        const cardBack = document.createElement('div');
        cardBack.classList.add(this.CLASS_CARD_INNER);
        cardBack.classList.add(this.CLASS_CARD_BACK);
        const frontImage = document.createElement('img');
        frontImage.src = this.image;
        const backImage = document.createElement('img');
        backImage.src = Card.DECK_IMAGE_BACK;
        cardBack.appendChild(backImage);
        cardFront.appendChild(frontImage);
        this.div.appendChild(cardFront);
        this.div.appendChild(cardBack);
        this.div.onclick = () => {
            this.onClick(this);
        };
        return this.div;
    }
    show() {
        this.div.classList.remove('is-flipped');
    }
    hide() {
        this.div.classList.add('is-flipped');
    }
    addClickEvent(callback) {
        this.onClick = callback;
    }
}
// region Static Properties
Card.DECK_IMAGE_BACK = 'https://www.deckofcardsapi.com/static/img/back.png';
export default Card;
