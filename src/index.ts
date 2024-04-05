import Dutch from "./ts/Dutch.js";
import { data } from "./ts/datas.js";
import Deck from "./ts/Deck";

data.then( async (data) => {
    let dutch = new Dutch(data.deck.deck_id);
    data.players.forEach(player => {
        dutch.addPlayer(player);
    });
    dutch.startGame();
    console.log(dutch)
});







