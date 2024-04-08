var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import Dutch from "./src/ts/Dutch.js";
import fetchData from "./src/ts/datas.js";
fetchData.then((data) => __awaiter(void 0, void 0, void 0, function* () {
    let dutch = new Dutch(data.deck.deck_id);
    data.players.forEach(player => {
        dutch.addPlayer(player);
    });
    yield dutch.init();
    let flip = document.createElement('button');
    flip.textContent = 'Flip';
    flip.addEventListener('click', () => {
        dutch.flipAllCards();
    });
    document.body.appendChild(flip);
}));
