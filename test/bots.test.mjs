import test from 'node:test';
import assert from 'node:assert/strict';
import Dutch from '../src/ts/Dutch.js';
import {Bots, PEEK_MIN_MS, PEEK_SPREAD_MS} from '../src/ts/Bots.js';
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

test('solo: emotes only, the player can send them and they are kept', () => {
    const game = new Dutch({players: ['Moi', 'Léa']});
    const solo = new SoloSession(game, undefined, {speed: 1000});
    assert.equal(solo.chat.text, false);
    solo.chat.emote('🎉');
    solo.chat.emote('pas un emote');
    assert.deepEqual(solo.chat.messages.map(m => [m.seat, m.emote]), [[0, '🎉']]);
    solo.close();
});

test('the bots look at their cards all at the same time, quickly but not instantly', () => {
    const game = new Dutch({players: ['B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'], peekVariant: true});
    const timers = [];
    const bots = new Bots(game, game.players.map(p => p.id), {
        setTimer: (fn, ms) => timers.push({fn, ms}) - 1,
        clearTimer: () => {},
    });
    game.startRound();
    assert.equal(game.phase, 'peek');
    bots.schedule();
    assert.equal(timers.length, 10, 'one timer per bot, all planned together');
    for (const {ms} of timers) {
        assert.ok(ms >= PEEK_MIN_MS && ms <= PEEK_MIN_MS + PEEK_SPREAD_MS, `waits ${ms} ms`);
        assert.ok(ms >= 800, 'not instant');
    }
    // Planning again (any change) doesn't add a second peek for the same bot
    bots.schedule();
    assert.equal(timers.length, 10);
    timers.splice(0).forEach(t => t.fn());
    assert.equal(game.phase, 'draw', 'everybody has looked: the round goes on');
    bots.stop();
});

test('the bots look again at the start of the next round', async () => {
    const game = new Dutch({players: ['B0', 'B1', 'B2'], peekVariant: true, targetScore: 200});
    const bots = new Bots(game, game.players.map(p => p.id), fast);
    let rounds = 0;
    await new Promise((resolve, reject) => {
        game.on(event => {
            if (event.type !== 'change') return;
            if (game.phase === 'roundOver') {
                if (++rounds === 2) return resolve();
                return setImmediate(() => game.nextRound());
            }
            if (game.phase === 'gameOver') return reject(new Error('game over too soon'));
            bots.schedule();
        });
        game.startRound();
    });
    bots.stop();
    assert.equal(rounds, 2, 'the second round could start: every bot looked again');
});
