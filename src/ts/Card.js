class Card {
    constructor(code, image, value, suit) {
        this.onClick = () => { };
        this.code = code;
        this.image = image;
        this.value = value;
        this.suit = suit;
        this.div = document.createElement('div');
    }
    /**
     * Render the card to the screen
     * Use card with 2 divs card-back, card-front as css classes and img tag for the image
     */
    render() {
        this.div.remove();
        this.div = document.createElement('div');
        this.div.classList.add('card');
        this.div.id = this.code;
        this.div.innerHTML = '';
        let cardFront = document.createElement('div');
        cardFront.classList.add('card-inner');
        cardFront.classList.add('card-front');
        let cardBack = document.createElement('div');
        cardBack.classList.add('card-inner');
        cardBack.classList.add('card-back');
        let frontImage = document.createElement('img');
        frontImage.src = this.image;
        let backImage = document.createElement('img');
        backImage.src = Card.backImage;
        cardBack.appendChild(backImage);
        cardFront.appendChild(frontImage);
        this.div.appendChild(cardFront);
        this.div.appendChild(cardBack);
        this.div.onclick = () => {
            this.onClick(this);
        };
        return this.div;
    }
    flip() {
        this.div.classList.toggle('is-flipped');
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
    addFlipEvent() {
        this.div.addEventListener('click', () => this.flip());
    }
    removeFlipEvent() {
        this.div.removeEventListener('click', () => this.flip());
    }
    removeClickEvent() {
        this.div.removeEventListener('click', () => this.onClick(this));
    }
    removeListeners() {
        console.log('removing listeners');
        this.div.replaceWith(this.div.cloneNode(true));
    }
}
Card.backImage = 'https://www.deckofcardsapi.com/static/img/back.png';
export default Card;
