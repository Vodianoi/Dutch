class Card {
    constructor(code, image, value, suit) {
        this.code = code;
        this.image = image;
        this.value = value;
        this.suit = suit;
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
}
export default Card;
