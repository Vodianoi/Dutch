var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class Card {
    constructor(code, image, value, suit) {
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
        this.div.classList.add('card');
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
        this.getBackImage().then((url) => {
            backImage.src = url;
        });
        cardBack.appendChild(backImage);
        cardFront.appendChild(frontImage);
        this.div.appendChild(cardFront);
        this.div.appendChild(cardBack);
        return this.div;
    }
    getCode() {
        return this.code;
    }
    getImage() {
        return this.image;
    }
    getValue() {
        return this.value;
    }
    getSuit() {
        return this.suit;
    }
    getBackImage() {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch('https://www.deckofcardsapi.com/static/img/back.png');
            const blob = yield response.blob();
            return URL.createObjectURL(blob);
        });
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
        this.div.addEventListener('click', () => {
            callback(this);
        });
    }
    addFlipEvent() {
        this.div.addEventListener('click', () => this.flip());
    }
    removeFlipEvent() {
        this.div.removeEventListener('click', () => this.flip());
    }
    removeClickEvent() {
        this.div.removeEventListener('click', () => { });
    }
}
export default Card;
