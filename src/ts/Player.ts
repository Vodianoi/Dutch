import Card from "./Card.js";

class Player {
    private id: number;
    private name: string;

    constructor(id:number, name:string) {
        this.id = id;
        this.name = name;
    }

    public getId(){
        return this.id;
    }

    public getName(){
        return this.name;
    }

    public getHand(deck_id: string){
        return fetch(`https://www.deckofcardsapi.com/api/deck/${deck_id}/pile/${this.id}/list/`)
    }

    public setHand(hand: Card[], deck_id: string){

        fetch(`https://www.deckofcardsapi.com/api/deck/${deck_id}/pile/${this.id}/add/?cards=${hand.map(card => card.getCode()).join(",")}`)
            .then(response => response.json())
    }
}

export default Player;