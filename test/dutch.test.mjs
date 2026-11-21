// Engine tests: run with `npm test` (compiles TypeScript then runs node --test)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Dutch, {RuleError} from '../src/ts/Dutch.js';
import Deck from '../src/ts/Deck.js';
import Card from '../src/ts/Card.js';
import {buildView} from '../src/ts/View.js';

function seeded(seed = 42) {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

let uid = 0;
const c = (value, suit = 'SPADES') => new Card(`t${uid++}`, value, suit);

function newGame(opts = {}) {
    const game = new Dutch({players: ['Eddy', 'Hugo', 'Axel'], deckCount: 1, rng: seeded(), ...opts});
    game.startRound();
    return game;
}

test('card points follow the rules (red kings 0, black kings 13)', () => {
    assert.equal(c('ACE').points, 1);
    assert.equal(c('7').points, 7);
    assert.equal(c('10').points, 10);
    assert.equal(c('JACK').points, 11);
    assert.equal(c('QUEEN').points, 12);
    assert.equal(c('KING', 'HEARTS').points, 0);
    assert.equal(c('KING', 'DIAMONDS').points, 0);
    assert.equal(c('KING', 'SPADES').points, 13);
    assert.equal(c('KING', 'CLUBS').points, 13);
    assert.equal(c('10', 'HEARTS').code, '0H');
});

test('two decks = 104 unique cards, deal 4 each and 1 discard', () => {
    const deck = new Deck(2, seeded());
    assert.equal(deck.remaining, 104);
    assert.equal(new Set(deck.drawPile.map(x => x.id)).size, 104);
    const game = newGame({deckCount: 2});
    for (const p of game.players) assert.equal(p.hand.length, 4);
    assert.equal(game.deck.discardPile.length, 1);
    assert.equal(game.deck.remaining, 104 - 12 - 1);
    assert.equal(game.phase, 'draw');
});

test('empty draw pile is refilled from the discard pile except its top card (#5)', () => {
    const deck = new Deck(1, seeded());
    const all = deck.drawMany(52);
    all.forEach(x => deck.discard(x));
    const top = deck.topDiscard;
    const drawn = deck.draw();
    assert.ok(drawn);
    assert.equal(deck.topDiscard, top);
    assert.equal(deck.remaining + deck.discardPile.length + 1, 52);
});

test('cannot end turn without playing (#4) and only the current player acts', () => {
    const game = newGame();
    assert.throws(() => game.endTurn(0), RuleError);
    assert.throws(() => game.drawFromPile(1), RuleError);
    game.drawFromPile(0);
    assert.throws(() => game.drawFromPile(0), RuleError);
    assert.throws(() => game.endTurn(0), RuleError);
    game.discardDrawn(0);
    game.effects = []; // ignore a possible special card for this test
    game.endTurn(0);
    assert.equal(game.currentPlayerIndex, 1);
});

test('a card taken from the discard must be swapped', () => {
    const game = newGame();
    const top = game.deck.topDiscard;
    game.takeDiscard(0);
    assert.throws(() => game.discardDrawn(0), RuleError);
    const handCard = game.players[0].hand[2];
    game.swapDrawn(0, handCard.id);
    assert.equal(game.players[0].hand[2], top);
    assert.equal(game.deck.topDiscard, handCard);
    assert.equal(game.phase, 'played');
});

test('throwing a matching card works for any player, a wrong one gives a penalty and locks', () => {
    const game = newGame();
    game.deck.discardPile = [c('5', 'HEARTS')];
    game.players[1].hand = [c('5', 'CLUBS'), c('8'), c('9'), c('2')];
    game.players[2].hand = [c('8'), c('3'), c('4'), c('6')];

    assert.equal(game.throwCard(1, game.players[1].hand[0].id), true);
    // the thrown card leaves its place empty: the other cards don't move
    assert.equal(game.players[1].hand.length, 4);
    assert.equal(game.players[1].hand[0], null);
    assert.equal(game.players[1].cards.length, 3);
    assert.equal(game.deck.topDiscard.value, '5');

    assert.equal(game.throwCard(2, game.players[2].hand[0].id), false);
    assert.equal(game.players[2].hand.length, 5);
    assert.ok(game.players[2].locked);
    assert.throws(() => game.throwCard(2, game.players[2].hand[1].id), RuleError);

    // lock is lifted at the end of the turn
    game.drawFromPile(0);
    game.discardDrawn(0);
    game.effects = [];
    game.endTurn(0);
    assert.equal(game.players[2].locked, false);
});

test('no throw while the current player holds a drawn card', () => {
    const game = newGame();
    game.deck.discardPile = [c('5', 'HEARTS')];
    game.players[1].hand = [c('5', 'CLUBS')];
    game.drawFromPile(0);
    assert.throws(() => game.throwCard(1, game.players[1].hand[0].id), RuleError);
});

test('Queen effect: look at one of your cards, blocks the turn until resolved', () => {
    const game = newGame();
    const events = [];
    game.on(e => e.type === 'reveal' && events.push(e));
    game.deck.drawPile.push(c('QUEEN', 'HEARTS'));
    game.drawFromPile(0);
    game.discardDrawn(0);
    assert.equal(game.activeEffect.type, 'QUEEN');
    assert.throws(() => game.endTurn(0), RuleError);
    assert.throws(() => game.queenPeek(1, game.players[1].hand[0].id), RuleError);
    const target = game.players[0].hand[1];
    game.queenPeek(0, target.id);
    assert.deepEqual(events.at(-1), {type: 'reveal', cardId: target.id, playerId: 0, public: false});
    game.endTurn(0);
});

test('Jack effect swaps two cards between players', () => {
    const game = newGame();
    game.deck.drawPile.push(c('JACK', 'CLUBS'));
    game.drawFromPile(0);
    game.discardDrawn(0);
    const a = game.players[1].hand[0];
    const b = game.players[2].hand[3];
    game.jackSwap(0, a.id, b.id);
    assert.equal(game.players[1].hand[0], b);
    assert.equal(game.players[2].hand[3], a);
    assert.equal(game.effects.length, 0);
});

test('Ace effect gives a card of the draw pile to a player', () => {
    const game = newGame();
    game.deck.drawPile.push(c('7'), c('ACE', 'CLUBS'));
    game.drawFromPile(0);
    game.discardDrawn(0);
    game.aceGive(0, 2);
    assert.equal(game.players[2].hand.length, 5);
    assert.equal(game.players[2].hand[4].value, '7');
});

test('only a card drawn and thrown at once has its effect, or the second card thrown in a row from a hand', () => {
    const game = newGame();
    game.deck.drawPile.push(c('ACE', 'HEARTS'));
    game.players[1].hand[0] = c('ACE', 'SPADES');
    game.players[1].hand[1] = c('ACE', 'CLUBS');
    game.players[2].hand[0] = c('ACE', 'DIAMONDS');
    game.drawFromPile(0);
    game.discardDrawn(0);
    assert.equal(game.activeEffect.playerId, 0, 'drawn from the deck and thrown: effect');
    game.skipEffect(0);
    // Hugo throws an As of his hand: no effect
    game.throwCard(1, game.players[1].hand[0].id);
    assert.ok(!game.activeEffect);
    // ...then a second one, in a row: the effect of this last one plays
    game.throwCard(1, game.players[1].hand[1].id);
    assert.equal(game.activeEffect.playerId, 1);
    assert.equal(game.effects.length, 1);
    game.skipEffect(1);
    // Axel throws on Hugo's card: it's not his row, no effect
    game.throwCard(2, game.players[2].hand[0].id);
    assert.ok(!game.activeEffect);
    // The row is kept in a saved game
    assert.deepEqual(Dutch.restore(game.snapshot()).snapshot().handThrow, {playerId: 2, cardId: game.deck.topDiscard.id});
});

test('a card swapped out of the hand has no effect, nor a card thrown on a row of somebody else', () => {
    const game = newGame();
    game.players[0].hand[0] = c('QUEEN', 'HEARTS');
    game.players[0].hand[1] = c('QUEEN', 'SPADES');
    game.deck.drawPile.push(c('5'));
    game.drawFromPile(0);
    game.swapDrawn(0, game.players[0].hand[0].id);
    assert.ok(!game.activeEffect, 'swapped out: no effect');
    // Throwing on one's own swapped card is not a row of throws either
    game.throwCard(0, game.players[0].hand[1].id);
    assert.ok(!game.activeEffect);
});

test('Dutch: last turn for the others, immunity, then scoring', () => {
    const game = newGame();
    game.players[0].hand = [c('KING', 'HEARTS'), c('ACE')];          // 1 point
    game.players[1].hand = [c('KING', 'SPADES'), c('9')];            // 22
    game.players[2].hand = [c('2'), c('3')];                         // 5
    game.deck.drawPile.push(c('KING', 'DIAMONDS'));
    game.drawFromPile(0);
    game.swapDrawn(0, game.players[0].hand[1].id); // ace -> discard: no effect, it was in the hand
    game.endTurn(0, true);
    assert.equal(game.dutchCallerId, 0);
    assert.ok(game.isFinalRound);

    // Hugo: draws a jack and tries to swap with Eddy -> refused (immunity)
    game.deck.drawPile.push(c('JACK', 'HEARTS'));
    game.drawFromPile(1);
    game.discardDrawn(1);
    assert.throws(() => game.jackSwap(1, game.players[0].hand[0].id, game.players[1].hand[0].id), RuleError);
    game.skipEffect(1);
    assert.throws(() => game.endTurn(1, true), RuleError); // Dutch already called
    game.endTurn(1);

    // Axel plays his last turn
    game.deck.drawPile.push(c('4'));
    game.drawFromPile(2);
    game.discardDrawn(2);
    game.endTurn(2);

    assert.equal(game.phase, 'roundOver');
    const s = game.lastResult.scores;
    assert.deepEqual(s.map(x => x.points), [0, 22, 5]);
    assert.deepEqual(s.map(x => x.penalty), [0, 0, 0]);
    assert.equal(game.currentPlayerIndex, 2);
});

test('Dutch caller without the lowest score gets +10, ties favour the caller', () => {
    const game = newGame({players: ['A', 'B']});
    game.players[0].hand = [c('5')];
    game.players[1].hand = [c('3')];
    game.deck.drawPile.push(c('2'));
    game.drawFromPile(0);
    game.discardDrawn(0);
    game.endTurn(0, true);
    game.deck.drawPile.push(c('9'));
    game.drawFromPile(1);
    game.discardDrawn(1);
    game.endTurn(1);
    assert.deepEqual(game.lastResult.scores.map(x => [x.points, x.penalty, x.total]), [[5, 10, 15], [3, 0, 3]]);

    game.nextRound();
    assert.equal(game.round, 2);
    assert.equal(game.currentPlayerIndex, 1, 'next player starts the next round');
    game.players[0].hand = [c('4')];
    game.players[1].hand = [c('4')];
    game.deck.drawPile.push(c('2'));
    game.drawFromPile(1);
    game.discardDrawn(1);
    game.endTurn(1, true);
    game.deck.drawPile.push(c('9'));
    game.drawFromPile(0);
    game.discardDrawn(0);
    game.endTurn(0);
    assert.deepEqual(game.lastResult.scores.map(x => x.penalty), [0, 0]);
});

test('the game ends when someone reaches 100 points, lowest total wins', () => {
    const game = newGame({players: ['A', 'B']});
    game.players[0].score = 95;
    game.players[1].score = 40;
    game.players[0].hand = [c('KING', 'SPADES')];
    game.players[1].hand = [c('2')];
    game.deck.drawPile.push(c('3'));
    game.drawFromPile(0);
    game.discardDrawn(0);
    game.endTurn(0, true);
    game.deck.drawPile.push(c('3'));
    game.drawFromPile(1);
    game.discardDrawn(1);
    game.endTurn(1);
    assert.equal(game.phase, 'gameOver');
    assert.deepEqual(game.lastResult.winners, [1]);
    assert.throws(() => game.nextRound(), RuleError);
});

test('peek variant: everyone looks at his 2 last cards before playing', () => {
    const game = newGame({peekVariant: true});
    const revealed = [];
    game.on(e => e.type === 'reveal' && revealed.push(e.cardId));
    assert.equal(game.phase, 'peek');
    assert.throws(() => game.drawFromPile(0), RuleError);
    game.peek(0);
    game.peek(1);
    assert.throws(() => game.peek(1), RuleError);
    game.peek(2);
    assert.equal(game.phase, 'draw');
    assert.equal(revealed.length, 6);
});

test('the game log records what happens (#6)', () => {
    const game = newGame();
    game.deck.discardPile = [c('5', 'HEARTS')];
    game.players[1].hand = [c('5', 'CLUBS'), c('8')];
    game.throwCard(1, game.players[1].cards[0].id);
    game.throwCard(1, game.players[1].cards[0].id);
    const kinds = game.log.map(e => e.kind);
    assert.equal(game.log[0].round, 1);
    assert.ok(kinds.includes('good'));
    assert.ok(kinds.includes('bad'));
    assert.match(game.log.at(-1).message, /Hugo se trompe/);
});

test('random full games always terminate with consistent card count', () => {
    for (let seed = 1; seed <= 30; seed++) {
        const rng = seeded(seed);
        const n = 2 + (seed % 9);
        const game = new Dutch({players: Array.from({length: n}, (_, i) => `P${i}`), deckCount: seed % 2 + 1, rng});
        const total = game.deckCount * 52;
        game.startRound();
        let guard = 0;
        while (game.phase !== 'gameOver' && guard++ < 100000) {
            if (game.phase === 'roundOver') { game.nextRound(); continue; }
            const effect = game.activeEffect;
            if (effect) {
                const me = game.players[effect.playerId];
                const others = game.players.filter(p => !game.isProtected(p.id, 'JACK') && !game.isProtected(p.id, 'ACE') && p.cards.length);
                if (effect.type === 'QUEEN' && me.cards.length) game.queenPeek(me.id, me.cards[0].id);
                else if (effect.type === 'ACE' && others.length) game.aceGive(me.id, others[Math.floor(rng() * others.length)].id);
                else if (effect.type === 'JACK' && others.length >= 2) game.jackSwap(me.id, others[0].cards[0].id, others[1].cards[0].id);
                else game.skipEffect(me.id);
                continue;
            }
            // random throw attempts
            const thrower = game.players[Math.floor(rng() * n)];
            if (rng() < 0.3 && game.canThrow(thrower.id) && thrower.cards.length) {
                game.throwCard(thrower.id, thrower.cards[Math.floor(rng() * thrower.cards.length)].id);
                continue;
            }
            const p = game.currentPlayer;
            if (game.phase === 'draw') {
                if (game.isStuck) { game.endTurn(p.id); continue; }
                const mustTake = game.deck.remaining === 0 && game.deck.discardPile.length <= 1;
                if ((mustTake || rng() < 0.4) && p.cards.length && game.deck.topDiscard) game.takeDiscard(p.id);
                else game.drawFromPile(p.id);
            } else if (game.phase === 'drawn') {
                if (game.drawn.source === 'discard' || (p.cards.length && rng() < 0.6)) game.swapDrawn(p.id, p.cards[Math.floor(rng() * p.cards.length)].id);
                else game.discardDrawn(p.id);
            } else if (game.phase === 'played' && !game.activeEffect) {
                game.endTurn(p.id, game.dutchCallerId === null && (p.handPoints < 12 || guard % 500 === 0));
            }
            if (game.isRoundRunning) {
                const inPlay = game.players.reduce((s, pl) => s + pl.cards.length, 0)
                    + game.deck.remaining + game.deck.discardPile.length + (game.drawn ? 1 : 0);
                assert.equal(inPlay, total, `cards lost or duplicated (seed ${seed})`);
            }
        }
        assert.equal(game.phase, 'gameOver', `seed ${seed} did not finish`);
        assert.ok(game.players.some(p => p.score >= 100));
    }
});

test('a game saved as JSON is restored exactly and can go on', () => {
    const game = new Dutch({players: ['Eddy', 'Hugo', 'Axel'], deckCount: 1});
    game.startRound();
    game.drawFromPile(0);
    game.swapDrawn(0, game.players[0].hand[2].id);
    while (game.activeEffect) game.skipEffect(game.activeEffect.playerId);
    game.endTurn(0, true);
    game.drawFromPile(1);

    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    const copy = Dutch.restore(saved);
    assert.deepEqual(JSON.parse(JSON.stringify(copy.snapshot())), saved);
    assert.equal(copy.phase, 'drawn');
    assert.equal(copy.dutchCallerId, 0);
    assert.equal(copy.drawn.card.id, game.drawn.card.id);
    // both games play on the same way
    copy.discardDrawn(1);
    game.discardDrawn(1);
    assert.deepEqual(copy.snapshot().discardPile, game.snapshot().discardPile);
    assert.equal(copy.lastMove.seq, game.lastMove.seq);
});

test('cards keep their place: a thrown card leaves a hole, a new card fills the first hole', () => {
    const game = newGame();
    game.deck.discardPile = [c('5', 'HEARTS')];
    const [a, b, d, e] = [c('5', 'CLUBS'), c('8'), c('5', 'SPADES'), c('2')];
    game.players[1].hand = [a, b, d, e];
    game.throwCard(1, a.id);
    game.throwCard(1, d.id);
    assert.deepEqual(game.players[1].hand, [null, b, null, e]);
    assert.equal(game.players[1].handPoints, 10);
    // A wrong throw: the penalty card takes the first empty place
    game.throwCard(1, b.id);
    assert.equal(game.players[1].hand.length, 4);
    assert.equal(game.players[1].hand[1], b);
    assert.notEqual(game.players[1].hand[0], null);
    assert.equal(game.players[1].hand[2], null);
    // The holes are part of the views (and of the saves), at the same place
    const view = buildView(game, 2).players[1].hand;
    assert.deepEqual(view.map(card => card === null), [false, false, true, false]);
    const copy = Dutch.restore(JSON.parse(JSON.stringify(game.snapshot())));
    assert.equal(copy.players[1].hand[2], null);
});

test('peek variant: a card can be thrown while the players are still looking at their cards', () => {
    const game = newGame({peekVariant: true});
    assert.equal(game.phase, 'peek');
    game.deck.discardPile = [c('5', 'HEARTS')];
    game.players[1].hand = [c('5', 'CLUBS'), c('8'), c('9'), c('2')];
    assert.equal(game.canThrow(1), true);
    // Right value: thrown, the hole stays
    assert.equal(game.throwCard(1, game.players[1].hand[0].id), true);
    assert.equal(game.players[1].hand[0], null);
    // Wrong value: penalty card, locked, still in the peek phase
    game.players[2].hand = [c('7'), c('8'), c('9'), c('10')];
    assert.equal(game.throwCard(2, game.players[2].hand[0].id), false);
    assert.equal(game.players[2].cards.length, 5);
    assert.equal(game.players[2].locked, true);
    assert.equal(game.phase, 'peek');
    // Two special cards thrown in a row during the peek: the last one gives its effect, to resolve before going on
    game.deck.discardPile.push(c('QUEEN', 'HEARTS'));
    game.players[0].hand[0] = c('QUEEN', 'SPADES');
    game.players[0].hand[1] = c('QUEEN', 'CLUBS');
    game.throwCard(0, game.players[0].hand[0].id);
    assert.ok(!game.activeEffect);
    game.throwCard(0, game.players[0].hand[1].id);
    assert.equal(game.activeEffect.type, 'QUEEN');
    game.queenPeek(0, game.players[0].cards[0].id);
    game.peek(0);
    game.peek(1);
    game.peek(2);
    assert.equal(game.phase, 'draw');
});

test('a player arriving during the game sits down between two rounds, with the average score', () => {
    const game = new Dutch({players: ['Léa', 'Hugo', 'Inès'], peekVariant: false, deckCount: 1});
    game.startRound();
    assert.throws(() => game.addPlayer('Zoé'), /entre deux manches/, 'not during a round');
    game.players[0].score = 10;
    game.players[1].score = 21;
    game.players[2].score = 4;
    game.phase = 'roundOver';
    const id = game.addPlayer('Zoé', '#2f6db5');
    assert.equal(id, 3);
    assert.equal(game.players[3].name, 'Zoé');
    assert.equal(game.players[3].score, 12, 'rounded average of 10, 21 and 4');
    assert.notEqual(game.players[3].color, game.players[0].color);
    assert.match(game.log.at(-1).message, /Zoé arrive dans la partie, avec 12 points/);
    game.nextRound();
    assert.equal(game.players[3].hand.length, 4, 'dealt in like the others');
    // Saved and restored with the others
    const copy = Dutch.restore(JSON.parse(JSON.stringify(game.snapshot())));
    assert.equal(copy.players.length, 4);
    assert.equal(copy.players[3].score, 12);
});

test('nobody arrives if the deck would be too small or the table full', () => {
    const game = new Dutch({players: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], peekVariant: false, deckCount: 1, cardsPerPlayer: 5});
    game.phase = 'roundOver';
    assert.throws(() => game.addPlayer('I'), /Pas assez de cartes/);
    const full = new Dutch({players: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], peekVariant: false, deckCount: 2});
    full.phase = 'roundOver';
    assert.throws(() => full.addPlayer('K'), /complète/);
});

test('rules: the protection after Dutch can be off for the Valet, for the As, or both', () => {
    for (const [protectFromJack, protectFromAce] of [[true, true], [false, true], [true, false], [false, false]]) {
        const game = newGame({protectFromJack, protectFromAce});
        game.drawFromPile(0);
        game.discardDrawn(0);
        game.effects.length = 0;
        game.endTurn(0, true);
        assert.equal(game.isProtected(0, 'JACK'), protectFromJack);
        assert.equal(game.isProtected(0, 'ACE'), protectFromAce);
        // Hugo has a Valet then an As to play
        game.deck.drawPile.push(c('ACE', 'CLUBS'), c('JACK', 'CLUBS'));
        game.drawFromPile(1);
        game.discardDrawn(1);
        const swap = () => game.jackSwap(1, game.players[0].hand[0].id, game.players[1].hand[0].id);
        if (protectFromJack) {
            assert.throws(swap, RuleError);
            game.skipEffect(1);
        } else {
            swap();
        }
        game.throwCard(1, game.players[1].hand.find(card => card).id); // anything: just to keep playing
        if (game.activeEffect) game.skipEffect(1);
        game.endTurn(1);
        game.drawFromPile(2);
        const before = game.players[0].cards.length;
        game.discardDrawn(2);
        if (game.activeEffect?.type === 'ACE') {
            const give = () => game.aceGive(2, 0);
            if (protectFromAce) assert.throws(give, RuleError);
            else {
                give();
                assert.equal(game.players[0].cards.length, before + 1);
            }
        }
        const copy = Dutch.restore(game.snapshot());
        assert.equal(copy.protectFromJack, protectFromJack);
        assert.equal(copy.protectFromAce, protectFromAce);
    }
});

test('rules: the Dame can look at any card on the table', () => {
    const own = newGame();
    own.deck.drawPile.push(c('QUEEN', 'CLUBS'));
    own.drawFromPile(0);
    own.discardDrawn(0);
    assert.throws(() => own.queenPeek(0, own.players[1].hand[0].id), RuleError);

    const game = newGame({queenAny: true});
    const events = [];
    game.on(e => events.push(e));
    game.deck.drawPile.push(c('QUEEN', 'CLUBS'));
    game.drawFromPile(0);
    game.discardDrawn(0);
    const target = game.players[2].hand[1];
    game.queenPeek(0, target.id);
    assert.deepEqual(events.find(e => e.type === 'reveal'), {type: 'reveal', cardId: target.id, playerId: 0, public: false},
        'only the player of the Dame sees it');
    assert.match(game.log.at(-1).message, /Eddy \(Dame\) regarde une carte d'Axel/);
    assert.equal(Dutch.restore(game.snapshot()).queenAny, true);
});
