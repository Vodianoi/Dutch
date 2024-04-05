import Dutch from "./ts/Dutch.js";
import fetchData from "./ts/datas.js";

fetchData.then(async(data) => {
    let dutch = new Dutch(data.deck.deck_id);
    data.players.forEach(player => {
        dutch.addPlayer(player);
    });
    await dutch.startGame();

    let remaining = await dutch.deck.getRemaining()
    console.log(remaining);
    console.log(dutch.players);
    console.log(dutch.deck);
});







