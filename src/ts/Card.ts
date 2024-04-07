class Card {

    // region Static Properties
    static readonly DECK_IMAGE_BACK = 'https://www.deckofcardsapi.com/static/img/back.png';
    // endregion

    // region Public Properties

    public readonly code: string;
    public readonly image: string;
    public readonly value: string;
    public readonly suit: string;
    public div: HTMLDivElement;
    // endregion

    // region Private Properties

    private readonly CLASS_CARD = 'card';
    private readonly CLASS_CARD_INNER = 'card-inner';
    private readonly CLASS_CARD_FRONT = 'card-front';
    private readonly CLASS_CARD_BACK = 'card-back';
    // endregion

    // region Constructor

    constructor(code: string, image: string, value: string, suit: string) {
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
    public render() {
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
        }
        return this.div;
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
    // endregion

    // region Event Handlers
    public onClick: Function = () => { };
    // endregion
}

export default Card;