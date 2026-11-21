// Game settings and player colours
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Dutch, {RuleError} from '../src/ts/Dutch.js';
import Card from '../src/ts/Card.js';
import {buildView} from '../src/ts/View.js';
import {
    assignColors, checkSettings, cleanSettings, DEFAULT_SETTINGS, DEFAULTS_VERSION, describeSettings, PLAYER_COLORS, upgradeDefaults,
} from '../src/ts/Settings.js';

const c = (id, value, suit = 'SPADES') => new Card(id, value, suit);

test('the chosen rules are used by the engine', () => {
    const game = new Dutch({players: ['A', 'B', 'C'], deckCount: 1, cardsPerPlayer: 6, targetScore: 50, dutchPenalty: 0});
    game.startRound();
    assert.ok(game.players.every(p => p.hand.length === 6));
    const view = buildView(game, 1);
    assert.deepEqual(view.settings, {deckCount: 1, cardsPerPlayer: 6, targetScore: 50, dutchPenalty: 0, peekVariant: false, effects: ['JACK', 'QUEEN', 'ACE'],
        protectFromJack: true, protectFromAce: true, queenAny: false});
    assert.equal(view.targetScore, 50);
});

test('a special card that is turned off has no effect', () => {
    const game = new Dutch({players: ['A', 'B'], deckCount: 1, effects: ['QUEEN']});
    game.startRound();
    game.deck.drawPile.push(c('j1', 'JACK', 'HEARTS'));
    game.drawFromPile(0);
    game.discardDrawn(0);
    assert.equal(game.activeEffect, undefined);
    assert.equal(game.phase, 'played');
    game.endTurn(0);
    game.deck.drawPile.push(c('q1', 'QUEEN', 'HEARTS'));
    game.drawFromPile(1);
    game.discardDrawn(1);
    assert.equal(game.activeEffect.type, 'QUEEN');
});

test('too many cards for the deck is refused, with a clear message', () => {
    assert.match(checkSettings(10, {deckCount: 1, cardsPerPlayer: 6}), /Pas assez de cartes pour 10 joueurs/);
    assert.equal(checkSettings(10, {deckCount: 2, cardsPerPlayer: 6}), null);
    assert.equal(checkSettings(10, {deckCount: 1, cardsPerPlayer: 4}), null);
    assert.throws(() => new Dutch({players: Array.from({length: 10}, (_, i) => `P${i}`), deckCount: 1, cardsPerPlayer: 6}), RuleError);
});

test('settings from storage or the network are cleaned', () => {
    assert.deepEqual(cleanSettings({deckCount: 7, cardsPerPlayer: 5, targetScore: '100', effects: ['ACE', 'BOGUS'], peekVariant: 'yes', queenAny: 1, protectFromAce: false}),
        {deckCount: 1, cardsPerPlayer: 5, targetScore: 50, dutchPenalty: 10, peekVariant: true, effects: ['ACE'],
            protectFromJack: true, protectFromAce: false, queenAny: false});
    assert.deepEqual(cleanSettings(null).effects, ['JACK', 'QUEEN', 'ACE']);
});

test('each player gets a colour: his own if free, otherwise a free one', () => {
    const [blue, red] = PLAYER_COLORS.map(p => p.value);
    assert.deepEqual(assignColors([red, red, 'pink', undefined]).slice(0, 1), [red]);
    const colors = assignColors([red, red, 'pink', undefined]);
    assert.equal(new Set(colors).size, 4);
    assert.equal(colors[0], red);
    assert.equal(colors[1], blue);
    const game = new Dutch({players: ['A', 'B'], playerColors: [red, red]});
    assert.notEqual(game.players[0].color, game.players[1].color);
    assert.equal(buildView(game, 0).players[0].color, red);
});

test('settings and colours survive a save', () => {
    const [, , teal] = PLAYER_COLORS.map(p => p.value);
    const game = new Dutch({players: ['A', 'B'], deckCount: 1, cardsPerPlayer: 3, effects: ['ACE'], playerColors: [teal]});
    game.startRound();
    const copy = Dutch.restore(JSON.parse(JSON.stringify(game.snapshot())));
    assert.deepEqual(copy.effectsEnabled, ['ACE']);
    assert.equal(copy.cardsPerPlayer, 3);
    assert.equal(copy.players[0].color, teal);
    assert.deepEqual(copy.players.map(p => p.color), game.players.map(p => p.color));
});

test('the rules are described for the players', () => {
    const lines = describeSettings(cleanSettings({cardsPerPlayer: 5, deckCount: 1, dutchPenalty: 0, effects: ['JACK'], peekVariant: true}));
    assert.deepEqual(lines, [
        '5 cartes par joueur, 1 paquet',
        'Fin de partie à 50 points',
        'Dutch raté : pas de pénalité',
        'Cartes spéciales : Valet seulement',
        'Chacun regarde ses 2 dernières cartes en début de ronde',
    ]);
});

test('a new game proposes the variant, 50 points and one deck', () => {
    assert.deepEqual(cleanSettings(null), {
        deckCount: 1, cardsPerPlayer: 4, targetScore: 50, dutchPenalty: 10, peekVariant: true, effects: ['JACK', 'QUEEN', 'ACE'],
        protectFromJack: true, protectFromAce: true, queenAny: false,
    });
    assert.deepEqual(DEFAULT_SETTINGS, cleanSettings(null));
    // One deck is enough for 10 players with the default 4 cards
    assert.equal(checkSettings(10, DEFAULT_SETTINGS), null);
});

test('saved rules left on the old defaults take the new ones, chosen rules are kept', () => {
    const old = {deckCount: 2, cardsPerPlayer: 5, targetScore: 100, dutchPenalty: 0, peekVariant: false, effects: ['JACK']};
    assert.deepEqual(upgradeDefaults(old, undefined),
        {deckCount: 1, cardsPerPlayer: 5, targetScore: 50, dutchPenalty: 0, peekVariant: true, effects: ['JACK']});
    const chosen = {...old, deckCount: 1, targetScore: 150, peekVariant: true};
    assert.deepEqual(upgradeDefaults(chosen, undefined), chosen);
    // Saved with the new defaults: never changed again (2 decks chosen after the update stay)
    assert.deepEqual(upgradeDefaults(old, DEFAULTS_VERSION), old);
});

test('the rules say when the Dutch protection or the Dame differ from the usual rules', () => {
    const lines = settings => describeSettings(cleanSettings(settings));
    assert.ok(!lines({}).some(l => /Après « Dutch »|La Dame/.test(l)), 'nothing to say about the usual rules');
    assert.ok(lines({protectFromJack: false}).includes('Après « Dutch » : protégé de l\'As seulement'));
    assert.ok(lines({protectFromAce: false}).includes('Après « Dutch » : protégé du Valet seulement'));
    assert.ok(lines({protectFromJack: false, protectFromAce: false}).includes('Après « Dutch » : pas de protection'));
    assert.ok(!lines({protectFromJack: false, effects: ['QUEEN', 'ACE']}).some(l => /Après « Dutch »/.test(l)), 'no Valet in this game');
    assert.ok(lines({queenAny: true}).includes('La Dame regarde n\'importe quelle carte'));
});
