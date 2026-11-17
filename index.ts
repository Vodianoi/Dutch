import Dutch, {DutchOptions} from './src/ts/Dutch.js';
import GameView from './src/ts/ui/GameView.js';
import {renderSetup} from './src/ts/ui/SetupView.js';

const root = document.getElementById('app')!;
const debug = new URLSearchParams(location.search).has('debug');

let view: GameView | null = null;

function showSetup() {
    view?.destroy();
    view = null;
    renderSetup(root, startGame);
}

function startGame(options: DutchOptions) {
    const game = new Dutch(options);
    view = new GameView(root, game, showSetup, debug);
    game.startRound();
    // Handy in the console while developing
    (window as unknown as { dutch: Dutch }).dutch = game;
}

showSetup();
