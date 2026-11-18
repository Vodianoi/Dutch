import test from 'node:test';
import assert from 'node:assert/strict';
import Dutch from '../src/ts/Dutch.js';
import {Bots} from '../src/ts/Bots.js';
import {SoloSession} from '../src/ts/SoloSession.js';

const fast = {speed: 0, setTimer: (fn) => setImmediate(fn), clearTimer: (h) => clearImmediate(h)};

function playToTheEnd(game, bots) {
    return new Promise((resolve, reject) => {
        let changes = 0;
        game.on(event => {
            if (event.type !== 'change') return;
            if (++changes > 20000) return reject(new Error('the game never ends'));
            if (game.phase === 'gameOver') return resolve();
            if (game.phase === 'roundOver') return setImmediate(() => game.nextRound());
            bots.schedule();
        });
        game.startRound();
    });
}

for (const [players, settings] of [[2, {}], [4, {peekVariant: true}], [7, {cardsPerPlayer: 6, deckCount: 2}]]) {
    test(`${players} bots play a whole game by the rules (${JSON.stringify(settings)})`, async () => {
        const game = new Dutch({players: Array.from({length: players}, (_, i) => `Bot ${i}`), targetScore: 50, ...settings});
        const bots = new Bots(game, game.players.map(p => p.id), fast);
        await playToTheEnd(game, bots);
        bots.stop();
        assert.equal(game.phase, 'gameOver');
        assert.ok(game.players.some(p => p.score >= 50));
        assert.ok(game.lastResult.winners.length >= 1);
    });
}

test('solo: the player only acts for his seat and only sees his own reveals', () => {
    const game = new Dutch({players: ['Moi', 'Léa', 'Hugo'], peekVariant: true});
    const solo = new SoloSession(game, undefined, {speed: 1000});
    const reveals = [];
    solo.on(e => e.type === 'reveal' && reveals.push(e.card.id));
    game.startRound();
    // Bots peek too, but their cards are not shown to this device
    solo.dispatch({type: 'peek', playerId: 2});
    assert.equal(game.players[0].ready, true, 'the action is played for seat 0 whatever the player id');
    assert.equal(game.players[2].ready, false);
    game.peek(1);
    assert.deepEqual(reveals.sort(), game.players[0].cards.slice(-2).map(c => c.id).sort());
    assert.ok(solo.state.players[1].hand.every(c => c.value === undefined), 'other hands stay face down');
    solo.close();
});

test('solo: every change is saved and the game can be restored', () => {
    const game = new Dutch({players: ['Moi', 'Léa']});
    let saved = null;
    const solo = new SoloSession(game, snapshot => saved = snapshot, {speed: 1000});
    game.startRound();
    solo.dispatch({type: 'drawFromPile', playerId: 0});
    const again = Dutch.restore(saved);
    assert.equal(again.phase, 'drawn');
    assert.equal(again.drawn.card.id, game.drawn.card.id);
    solo.close();
});
