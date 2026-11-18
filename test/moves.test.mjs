// Sentences and card tags shown after each move
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Dutch from '../src/ts/Dutch.js';
import Card from '../src/ts/Card.js';
import {buildView} from '../src/ts/View.js';
import {cardTag, comesFromPile, de, describeMove} from '../src/ts/ui/moves.js';

const c = (id, value, suit = 'SPADES') => new Card(id, value, suit);

function newGame() {
    const game = new Dutch({players: ['Eddy', 'Hugo', 'Axel'], deckCount: 2});
    game.startRound();
    return game;
}

const say = (game, viewer) => {
    const view = buildView(game, viewer);
    return describeMove(view, view.lastMove);
};

test('a swap names the thrown card, with "Vous" on the device of the player', () => {
    const game = newGame();
    game.drawFromPile(0);
    game.players[0].hand[0] = c('h1', '9', 'HEARTS');
    game.swapDrawn(0, 'h1');
    assert.equal(say(game, 0).text, 'Vous placez la carte dans votre main et jetez 9 de cœur.');
    assert.equal(say(game, 1).text, 'Eddy place la carte dans sa main et jette 9 de cœur.');
    const move = buildView(game, 1).lastMove;
    assert.equal(cardTag(move, game.players[0].hand[0].id).tag, 'Nouvelle');
    assert.equal(cardTag(move, 'h1').tag, 'Jetée');
});

test('a jack swap says whose cards were exchanged', () => {
    const game = newGame();
    game.deck.drawPile.push(c('j1', 'JACK', 'HEARTS'));
    game.drawFromPile(0);
    game.discardDrawn(0);
    const a = game.players[1].hand[0].id;
    const b = game.players[2].hand[0].id;
    game.jackSwap(0, a, b);
    assert.equal(say(game, null).text, "Eddy (Valet) échange une carte d'Hugo avec une carte d'Axel.");
    assert.equal(say(game, 1).text, "Eddy (Valet) échange une carte de votre main avec une carte d'Axel.");
    const move = buildView(game, 2).lastMove;
    assert.deepEqual([cardTag(move, a), cardTag(move, b)].map(t => t.tag), ['Échangée', 'Échangée']);
    assert.equal(say(game, 2).tone, 'effect');
    // the journal uses the same elision
    assert.equal(game.log.at(-1).message, "Eddy (Valet) échange une carte d'Hugo et une carte d'Axel.");
});

test('a jack swap inside one hand, by its owner', () => {
    const game = newGame();
    game.deck.drawPile.push(c('j1', 'JACK', 'HEARTS'));
    game.drawFromPile(0);
    game.discardDrawn(0);
    const [a, b] = game.players[0].hand.map(h => h.id);
    game.jackSwap(0, a, b);
    assert.equal(say(game, 1).text, 'Eddy (Valet) échange deux cartes de sa main.');
});

test('a wrong throw is red, and the penalty card comes from the pile', () => {
    const game = newGame();
    game.deck.discardPile = [c('d1', '5', 'HEARTS')];
    game.players[1].hand[0] = c('h1', '8');
    game.throwCard(1, 'h1');
    const said = say(game, 1);
    assert.equal(said.tone, 'bad');
    assert.match(said.text, /^Raté : 8 de pique ne va pas sur le rejet\. Vous recevez une carte de pénalité\.$/);
    const move = buildView(game, 0).lastMove;
    assert.equal(cardTag(move, move.cardIds[1]).tag, 'Pénalité');
    assert.ok(comesFromPile(move, move.cardIds[1]));
    assert.ok(!comesFromPile(move, 'h1'));
});

test('an ace gift to the player of this device', () => {
    const game = newGame();
    game.deck.drawPile.push(c('a1', 'ACE', 'HEARTS'));
    game.drawFromPile(0);
    game.discardDrawn(0);
    game.aceGive(0, 2);
    assert.equal(say(game, 2).text, 'Eddy (As) vous donne une carte de la pioche.');
    assert.equal(say(game, 1).text, 'Eddy (As) donne une carte de la pioche à Axel.');
});

test('every kind of move has a sentence', () => {
    const game = newGame();
    game.deck.drawPile.push(c('p1', '4'));
    game.drawFromPile(0);
    assert.equal(say(game, 1).text, 'Eddy pioche une carte.');
    game.discardDrawn(0);
    game.endTurn(0, true);
    assert.match(say(game, 0).text, /^Vous dites «\sDutch\s»/);
});

test('names are elided after "de"', () => {
    assert.equal(de('Axel'), "d'Axel");
    assert.equal(de('Éva'), "d'Éva");
    assert.equal(de('Hugo'), "d'Hugo");
    assert.equal(de('Léa'), 'de Léa');
});
