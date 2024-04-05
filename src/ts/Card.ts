class Card{

    readonly code:string;
    readonly image:string;
    readonly value:string;
    readonly suit:string;
    div:HTMLDivElement;

    constructor(code:string, image:string, value:string, suit:string){
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
    public render(){
        this.div.classList.add('card');
        let cardFront = document.createElement('div');
        cardFront.classList.add('card-inner');
        cardFront.classList.add('card-front');
        let cardBack = document.createElement('div');
        cardBack.classList.add('card-inner');
        cardBack.classList.add('card-back');
        let frontImage = document.createElement('img');
        frontImage.src = this.image;
        let backImage = document.createElement('img');
        this.getBackImage().then((url) => {
            backImage.src = url;
        });
        cardBack.appendChild(backImage);
        cardFront.appendChild(frontImage);
        this.div.appendChild(cardFront);
        this.div.appendChild(cardBack);
        return this.div;
    }

    public getCode(){
        return this.code;
    }

    public getImage(){
        return this.image;
    }

    public getValue(){
        return this.value;
    }

    public getSuit(){
        return this.suit;
    }

    public async getBackImage() {
        const response = await fetch('https://www.deckofcardsapi.com/static/img/back.png');
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    }

    public flip(){
        this.div.classList.toggle('is-flipped');
    }

    public addClickEvent(callback:Function){
        this.div.addEventListener('click', () => {
            callback(this);
        });
    }

    public addFlipEvent(callback:Function){
        this.div.addEventListener('click', () => this.flip());
    }

    public removeFlipEvent(){
        this.div.removeEventListener('click', () => this.flip());
    }

    public removeClickEvent(){
        this.div.removeEventListener('click', () => {});
    }



}

export default Card;