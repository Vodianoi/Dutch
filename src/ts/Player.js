class Player {
    constructor(id, name) {
        this.id = id;
        this.name = name;
    }
    getId() {
        return this.id;
    }
    getName() {
        return this.name;
    }
    getHand(deck_id) {
        return fetch(`https://www.deckofcardsapi.com/api/deck/${deck_id}/pile/${this.id}/list/`);
    }
    setHand(hand, deck_id) {
        fetch(`https://www.deckofcardsapi.com/api/deck/${deck_id}/pile/${this.id}/add/?cards=${hand.map(card => card.getCode()).join(",")}`)
            .then(response => response.json());
    }
}
export default Player;
