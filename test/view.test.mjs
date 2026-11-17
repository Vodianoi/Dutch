// Per-player views: what a device is allowed to know
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Dutch, {RuleError} from '../src/ts/Dutch.js';
import Card from '../src/ts/Card.js';
import {applyAction, buildView} from '../src/ts/View.js';

const c = (id, value, suit = 'SPADES') => new Card(id, value, suit);

function newGame() {
    const game = new Dutch({players: ['Eddy', 'Hugo', 'Axel'], deckCount: 2});
    game.startRound();
    return game;
}

test('card ids do not tell which card it is', () => {
    const game = newGame();
    const byId = new Map();
    for (const card of game.deck.drawPile) {
        assert.ok(!card.id.includes(card.code), card.id);
        byId.set(card.id, card.code);
    }
    assert.equal(byId.size, game.deck.drawPile.length);
    // two rounds use different ids
    const first = game.players[0].hand[0].id;
    game.startRound();
    assert.notEqual(game.players[0].hand[0].id, first);
});

test('hands are face down for everybody, the top of the discard is face up', () => {
    const game = newGame();
    for (const viewer of [null, 0, 1, 2]) {
        const view = buildView(game, viewer);
        for (const p of view.players) {
            for (const card of p.hand) {
                assert.deepEqual(Object.keys(card), ['id']);
            }
        }
        assert.ok(view.topDiscard.value);
    }
});

test('the drawn card is only visible to the player who drew it (and on a shared screen)', () => {
    const game = newGame();
    game.drawFromPile(0);
    assert.ok(buildView(game, 0).drawn.card.value);
    assert.ok(buildView(game, null).drawn.card.value);
    assert.equal(buildView(game, 1).drawn.card.value, undefined);
    const json = JSON.stringify(buildView(game, 2));
    const drawn = game.drawn.card;
    assert.ok(!json.includes(`"id":"${drawn.id}","value"`));
});

test('the view is plain JSON and round results show every hand', () => {
    const game = new Dutch({players: ['A', 'B'], deckCount: 1});
    game.startRound();
    game.players[0].hand = [c('x1', '2')];
    game.players[1].hand = [c('x2', '9')];
    game.deck.drawPile.push(c('x3', '3'));
    game.drawFromPile(0);
    game.discardDrawn(0);
    game.endTurn(0, true);
    game.deck.drawPile.push(c('x4', '4'));
    game.drawFromPile(1);
    game.discardDrawn(1);
    game.endTurn(1);
    const view = buildView(game, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(view)), view);
    assert.deepEqual(view.lastResult.scores.map(s => s.hand.map(h => h.value)), [['2'], ['9']]);
});

test('applyAction runs actions, returns notices and throws rule errors', () => {
    const game = newGame();
    assert.throws(() => applyAction(game, {type: 'drawFromPile', playerId: 1}), RuleError);
    game.deck.discardPile = [c('d1', '5', 'HEARTS')];
    game.players[1].hand = [c('h1', '8')];
    const notice = applyAction(game, {type: 'throwCard', playerId: 1, cardId: 'h1'});
    assert.equal(notice.kind, 'error');
    assert.equal(applyAction(game, {type: 'drawFromPile', playerId: 0}), null);
    assert.throws(() => applyAction(game, {type: 'bogus', playerId: 0}), RuleError);
});

test('a wrong throw is revealed to everybody, a queen peek only to its owner', () => {
    const game = newGame();
    const events = [];
    game.on(e => e.type === 'reveal' && events.push(e));
    game.deck.discardPile = [c('d1', '5', 'HEARTS')];
    game.players[1].hand[0] = c('h1', '8');
    game.throwCard(1, 'h1');
    assert.equal(events.at(-1).public, true);
    game.deck.drawPile.push(c('q1', 'QUEEN', 'HEARTS'));
    game.drawFromPile(0);
    game.discardDrawn(0);
    game.queenPeek(0, game.players[0].hand[0].id);
    assert.deepEqual([events.at(-1).playerId, events.at(-1).public], [0, false]);
});
