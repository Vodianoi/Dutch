import Dutch from './src/ts/Dutch.js';
import { LocalSession } from './src/ts/Session.js';
import GameView from './src/ts/ui/GameView.js';
import { renderSetup } from './src/ts/ui/SetupView.js';
const root = document.getElementById('app');
const debug = new URLSearchParams(location.search).has('debug');
let view = null;
function showSetup() {
    view?.destroy();
    view = null;
    renderSetup(root, startGame);
}
function startGame(options) {
    const game = new Dutch(options);
    view = new GameView(root, new LocalSession(game), showSetup, debug);
    game.startRound();
    // Handy in the console while developing
    window.dutch = game;
}
showSetup();
