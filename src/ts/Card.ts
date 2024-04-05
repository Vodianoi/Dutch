class Card{

    readonly code:string;
    readonly image:string;
    readonly value:string;
    readonly suit:string;

    constructor(code:string, image:string, value:string, suit:string){
        this.code = code;
        this.image = image;
        this.value = value;
        this.suit = suit;
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

}

export default Card;