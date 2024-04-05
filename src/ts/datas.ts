import Deck from "./Deck.js";
import Player from "./Player.js";



let data = fetchDeck().then((data) => {
    let deck = new Deck(data.deck_id);
    let player1 = new Player(1, "Eddy");
    let player2 = new Player(2, "Hugo");
    let player3 = new Player(3, "Axel");
    let player4 = new Player(3, "Léa");

    return {
        deck: deck
        , players: [player1, player2, player3, player4]
    };
});




async function fetchDeck(): Promise<Deck>{
    const response = await fetch("https://www.deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1");
    return await response.json();
}

export default data;

