class Card {
    static readonly backImage = 'https://www.deckofcardsapi.com/static/img/back.png';
    readonly code: string;
    readonly image: string;
    readonly value: string;
    readonly suit: string;
    div: HTMLDivElement;

    public onClick: Function = () => { };

    constructor(code: string, image: string, value: string, suit: string) {
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
    public render() {
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
        }
        return this.div;
    }


    public flip() {
        this.div.classList.toggle('is-flipped');
    }

    public show() {
        this.div.classList.remove('is-flipped');
    }

    public hide() {
        this.div.classList.add('is-flipped');
    }

    public addClickEvent(callback: Function) {
        this.onClick = callback;
    }

    public addFlipEvent() {
        this.div.addEventListener('click', () => this.flip());
    }

    public removeFlipEvent() {
        this.div.removeEventListener('click', () => this.flip());
    }

    public removeClickEvent() {
        this.div.removeEventListener('click', () => this.onClick(this));
    }


    public removeListeners() {
        console.log('removing listeners');
        this.div.replaceWith(this.div.cloneNode(true));
    }
}

export default Card;