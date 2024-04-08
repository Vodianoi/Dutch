import Dutch from "./src/ts/Dutch.js";
import fetchData from "./src/ts/datas.js";

fetchData.then(async(data) => {
    let dutch = new Dutch(data.deck.deck_id);
    data.players.forEach(player => {
        dutch.addPlayer(player);
    });
    await dutch.init();

    let flip = document.createElement('button');
    flip.textContent = 'Flip';
    flip.addEventListener('click', () => {
        dutch.flipAllCards();
    });
    document.body.appendChild(flip);
});







