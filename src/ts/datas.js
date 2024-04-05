var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import Deck from "./Deck.js";
import Player from "./Player.js";
export const data = fetchDeck().then(data => {
    let deck = new Deck(data.deck_id);
    let player1 = new Player(1, "Eddy");
    let player2 = new Player(2, "Hugo");
    let player3 = new Player(3, "Axel");
    return {
        deck: deck,
        players: [player1, player2, player3]
    };
});
function fetchDeck() {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield fetch("https://www.deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1");
        return yield response.json();
    });
}
