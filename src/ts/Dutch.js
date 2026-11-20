import Card from './Card.js';
import Deck from './Deck.js';
import Player from './Player.js';
import { msg, render } from './i18n.js';
import { ALL_EFFECTS, assignColors, settingsProblem } from './Settings.js';
const cardData = (card) => ({ id: card.id, value: card.value, suit: card.suit });
const toCard = (data) => new Card(data.id, data.value, data.suit);
/**
 *  Thrown when an action is not allowed by the rules; the message is shown to the players
 */
export class RuleError extends Error {
    constructor(message, params) {
        const m = typeof message === 'string' ? msg(message, params) : message;
        super(render(m, 'fr'));
        this.msg = m;
        this.name = 'RuleError';
    }
}
// endregion
/**
 *  "de Hugo" -> "d'Hugo", "de Léa": elision before a vowel or a mute h
 */
export function de(name) {
    return /^[aeiouyhàâäéèêëîïôöûüÿæœ]/i.test(name) ? `d'${name}` : `de ${name}`;
}
/**
 *  Dutch game engine
 *  - Holds the whole game state and enforces the rules of the README
 *  - No DOM access: the UI calls the actions and listens to the events
 */
class Dutch {
    // endregion
    // region Constructor
    constructor(options) {
        this.phase = 'draw';
        this.round = 0;
        /**
         *  Index of the player whose turn it is
         */
        this.currentPlayerIndex = 0;
        /**
         *  Card held by the current player after drawing
         */
        this.drawn = null;
        /**
         *  Special card effects waiting to be resolved, in the order the cards were played
         */
        this.effects = [];
        /**
         *  Player who said "Dutch" this round (immune until the end of the round)
         */
        this.dutchCallerId = null;
        /**
         *  Turns left to play after "Dutch" was called
         */
        this.finalTurnsLeft = 0;
        this.log = [];
        this.lastMove = null;
        this.moveSeq = 0;
        this.lastResult = null;
        this.firstPlayerIndex = 0;
        this.listeners = [];
        if (options.players.length < 2 || options.players.length > 10) {
            throw new RuleError('Le Dutch se joue de 2 à 10 joueurs.');
        }
        const colors = assignColors(options.players.map((_, i) => options.playerColors?.[i]));
        this.players = options.players.map((name, i) => new Player(i, name, colors[i]));
        this.deckCount = options.deckCount ?? 2;
        this.cardsPerPlayer = options.cardsPerPlayer ?? 4;
        this.targetScore = options.targetScore ?? 100;
        this.dutchPenalty = options.dutchPenalty ?? 10;
        this.peekVariant = options.peekVariant ?? false;
        this.effectsEnabled = ALL_EFFECTS.filter(e => (options.effects ?? ALL_EFFECTS).includes(e));
        const problem = settingsProblem(this.players.length, { deckCount: this.deckCount, cardsPerPlayer: this.cardsPerPlayer });
        if (problem)
            throw new RuleError(problem);
        this.rng = options.rng ?? Math.random;
        this.deck = new Deck(this.deckCount, this.rng);
    }
    // endregion
    // region Snapshot
    snapshot() {
        const move = this.lastMove;
        const result = this.lastResult;
        return {
            v: 1,
            players: this.players.map(p => ({
                name: p.name, color: p.color, hand: p.hand.map(card => card ? cardData(card) : null), score: p.score,
                roundScores: p.roundScores.slice(), ready: p.ready, locked: p.locked,
            })),
            deckCount: this.deckCount,
            cardsPerPlayer: this.cardsPerPlayer,
            targetScore: this.targetScore,
            dutchPenalty: this.dutchPenalty,
            peekVariant: this.peekVariant,
            effectsEnabled: this.effectsEnabled.slice(),
            drawPile: this.deck.drawPile.map(cardData),
            discardPile: this.deck.discardPile.map(cardData),
            phase: this.phase,
            round: this.round,
            currentPlayerIndex: this.currentPlayerIndex,
            firstPlayerIndex: this.firstPlayerIndex,
            drawn: this.drawn ? { card: cardData(this.drawn.card), source: this.drawn.source } : null,
            effects: this.effects.map(e => ({ type: e.type, playerId: e.playerId, card: cardData(e.card) })),
            dutchCallerId: this.dutchCallerId,
            finalTurnsLeft: this.finalTurnsLeft,
            log: this.log.map(entry => ({ ...entry })),
            lastMove: move ? { ...move, playerIds: move.playerIds.slice(), cardIds: move.cardIds.slice(), card: move.card ? cardData(move.card) : undefined } : null,
            moveSeq: this.moveSeq,
            lastResult: result ? {
                ...result,
                scores: result.scores.map(s => ({ ...s })),
                winners: result.winners.slice(),
                hands: Object.fromEntries(Object.entries(result.hands).map(([id, hand]) => [id, hand.map(cardData)])),
            } : null,
        };
    }
    /**
     *  Rebuild a game saved with snapshot(). Listeners are not saved: subscribe again.
     */
    static restore(data, rng) {
        if (!data || data.v !== 1)
            throw new RuleError('Sauvegarde de partie invalide.');
        const game = new Dutch({
            players: data.players.map(p => p.name),
            deckCount: data.deckCount,
            cardsPerPlayer: data.cardsPerPlayer,
            targetScore: data.targetScore,
            dutchPenalty: data.dutchPenalty,
            peekVariant: data.peekVariant,
            effects: data.effectsEnabled ?? ALL_EFFECTS,
            playerColors: data.players.map(p => p.color),
            rng,
        });
        data.players.forEach((saved, i) => {
            const player = game.players[i];
            player.hand = saved.hand.map(card => card ? toCard(card) : null);
            player.score = saved.score;
            player.roundScores = saved.roundScores.slice();
            player.ready = saved.ready;
            player.locked = saved.locked;
        });
        game.deck.drawPile = data.drawPile.map(toCard);
        game.deck.discardPile = data.discardPile.map(toCard);
        game.phase = data.phase;
        game.round = data.round;
        game.currentPlayerIndex = data.currentPlayerIndex;
        game.firstPlayerIndex = data.firstPlayerIndex;
        game.drawn = data.drawn ? { card: toCard(data.drawn.card), source: data.drawn.source } : null;
        game.effects = data.effects.map(e => ({ type: e.type, playerId: e.playerId, card: toCard(e.card) }));
        game.dutchCallerId = data.dutchCallerId;
        game.finalTurnsLeft = data.finalTurnsLeft;
        game.log = data.log.map(entry => ({ ...entry }));
        const move = data.lastMove;
        game.lastMove = move ? { ...move, card: move.card ? toCard(move.card) : undefined } : null;
        game.moveSeq = data.moveSeq;
        const result = data.lastResult;
        game.lastResult = result ? {
            ...result,
            hands: Object.fromEntries(Object.entries(result.hands).map(([id, hand]) => [id, hand.map(toCard)])),
        } : null;
        return game;
    }
    // endregion
    // region Getters
    get currentPlayer() {
        return this.players[this.currentPlayerIndex];
    }
    /**
     *  Effect being resolved right now (the first of the queue)
     */
    get activeEffect() {
        return this.effects[0];
    }
    get isFinalRound() {
        return this.dutchCallerId !== null;
    }
    get isRoundRunning() {
        return this.phase === 'draw' || this.phase === 'drawn' || this.phase === 'played';
    }
    getPlayer(id) {
        const player = this.players[id];
        if (!player)
            throw new RuleError('Joueur inconnu ({id}).', { id });
        return player;
    }
    /**
     *  The player who said "Dutch" is immune: his cards can't be exchanged and he can't receive cards
     */
    isImmune(playerId) {
        return this.dutchCallerId === playerId;
    }
    /**
     *  Find which player holds a card
     */
    ownerOf(cardId) {
        return this.players.find(p => p.hasCard(cardId));
    }
    /**
     *  Can this player try to throw a card on the discard pile right now?
     *  Also while the players look at their first cards (peek variant): the discard is already there.
     */
    canThrow(playerId) {
        const player = this.players[playerId];
        return !!player
            && (this.phase === 'peek' || this.phase === 'draw' || this.phase === 'played')
            && this.effects.length === 0
            && !player.locked
            && !!this.deck.topDiscard;
    }
    /**
     *  Can the current player end his turn? (issue #4: he must have played first)
     */
    get canEndTurn() {
        if (this.effects.length > 0)
            return false;
        if (this.phase === 'played')
            return true;
        // Nothing left to draw at all: the player is allowed to pass
        return this.phase === 'draw' && this.isStuck;
    }
    /**
     *  No card can be drawn and the discard can't be taken
     */
    get isStuck() {
        return this.deck.remaining === 0
            && this.deck.discardPile.length <= 1
            && (this.currentPlayer.cards.length === 0 || !this.deck.topDiscard);
    }
    // endregion
    // region Events
    on(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }
    emit(event) {
        for (const listener of this.listeners)
            listener(event);
    }
    changed() {
        this.emit({ type: 'change' });
    }
    reveal(player, card, isPublic = false) {
        this.emit({ type: 'reveal', cardId: card.id, playerId: player.id, public: isPublic });
    }
    move(type, playerId, cardIds = [], playerIds = [], card) {
        this.lastMove = { seq: ++this.moveSeq, type, playerId, playerIds, cardIds, card };
    }
    addLog(template, params, kind = 'info') {
        const m = msg(template, params);
        this.log.push({ round: this.round, kind, message: render(m, 'fr'), msg: m });
    }
    // endregion
    // region Round lifecycle
    /**
     *  Start a new round
     *  - New shuffled shoe
     *  - Deal 4 cards face down to each player
     *  - Put the top card of the draw pile on the discard pile
     */
    startRound() {
        if (this.phase === 'gameOver')
            throw new RuleError('La partie est terminée.');
        this.round++;
        this.deck = new Deck(this.deckCount, this.rng);
        for (const player of this.players) {
            player.resetForRound();
            player.hand = this.deck.drawMany(this.cardsPerPlayer);
        }
        this.deck.discard(this.deck.draw());
        this.drawn = null;
        this.effects = [];
        this.dutchCallerId = null;
        this.finalTurnsLeft = 0;
        this.lastResult = null;
        this.lastMove = null;
        this.currentPlayerIndex = this.firstPlayerIndex;
        this.addLog('— Ronde {round} — {cards} cartes, {each} cartes chacun.', { round: this.round, cards: this.deck.deckCount * 52, each: this.cardsPerPlayer }, 'info');
        if (this.peekVariant) {
            this.phase = 'peek';
            this.addLog('Chaque joueur regarde ses 2 dernières cartes.', undefined, 'info');
        }
        else {
            this.phase = 'draw';
            this.addLog('C\'est au tour de {name}.', { name: this.currentPlayer.name }, 'info');
        }
        this.changed();
    }
    /**
     *  Variant: a player looks at his 2 last cards and is ready
     * @returns the revealed cards
     */
    peek(playerId) {
        if (this.phase !== 'peek')
            throw new RuleError('Ce n\'est pas le moment de regarder ses cartes.');
        const player = this.getPlayer(playerId);
        if (player.ready)
            throw new RuleError('{name} a déjà regardé ses cartes.', { name: player.name });
        // The 2 last places: the bottom row of the square, the cards nearest to the player
        const cards = player.cards.slice(-2);
        cards.forEach(card => this.reveal(player, card));
        player.ready = true;
        this.move('peek', player.id, cards.map(c => c.id));
        this.addLog('{name} regarde ses 2 dernières cartes.', { name: player.name }, 'info');
        if (this.players.every(p => p.ready)) {
            this.phase = 'draw';
            this.addLog('C\'est au tour de {name}.', { name: this.currentPlayer.name }, 'info');
        }
        this.changed();
        return cards;
    }
    /**
     *  Count the points of the round and check the end of the game
     */
    endRound() {
        const hands = {};
        const points = this.players.map(p => {
            hands[p.id] = p.cards;
            return p.handPoints;
        });
        const lowest = Math.min(...points);
        const scores = this.players.map((p, i) => {
            let penalty = 0;
            // A player who says "Dutch" and doesn't have the lowest score gets a penalty.
            // On a tie, the player who said "Dutch" has the advantage.
            if (p.id === this.dutchCallerId && points[i] > lowest)
                penalty = this.dutchPenalty;
            const roundTotal = points[i] + penalty;
            p.roundScores.push(roundTotal);
            p.score += roundTotal;
            return { playerId: p.id, points: points[i], penalty, total: p.score };
        });
        this.addLog('Fin de la ronde {round} : {scores}', {
            round: this.round,
            scores: scores.map(s => `${this.players[s.playerId].name} ${s.points}${s.penalty ? ` (+${s.penalty})` : ''}`).join(', '),
        }, 'score');
        const gameOver = this.players.some(p => p.score >= this.targetScore);
        let winners = [];
        if (gameOver) {
            const best = Math.min(...this.players.map(p => p.score));
            winners = this.players.filter(p => p.score === best).map(p => p.id);
            const names = winners.map(id => this.players[id].name);
            this.addLog(names.length > 1 ? 'Partie terminée ! Victoire de {names} et {last} avec {best} points.' : 'Partie terminée ! Victoire de {last} avec {best} points.', { names: names.slice(0, -1).join(', '), last: names[names.length - 1], best }, 'dutch');
        }
        this.lastResult = { round: this.round, dutchCallerId: this.dutchCallerId, scores, hands, gameOver, winners };
        this.phase = gameOver ? 'gameOver' : 'roundOver';
        this.drawn = null;
        this.effects = [];
        this.firstPlayerIndex = (this.firstPlayerIndex + 1) % this.players.length;
        this.changed();
    }
    nextRound() {
        if (this.phase !== 'roundOver')
            throw new RuleError('La ronde n\'est pas terminée.');
        this.startRound();
    }
    /**
     *  A player who arrived during the game sits down between two rounds (last in the turn order).
     *  He starts with the average score of the others: no advantage for coming late (the lowest
     *  score wins), and still a chance to win.
     *  @return his id
     */
    addPlayer(name, color) {
        if (this.phase !== 'roundOver')
            throw new RuleError('Un joueur ne peut arriver qu\'entre deux manches.');
        if (this.players.length >= 10)
            throw new RuleError('La partie est complète (10 joueurs).');
        const problem = settingsProblem(this.players.length + 1, { deckCount: this.deckCount, cardsPerPlayer: this.cardsPerPlayer });
        if (problem)
            throw new RuleError(problem);
        const colors = assignColors([...this.players.map(p => p.color), color]);
        const player = new Player(this.players.length, name, colors[this.players.length]);
        player.score = Math.round(this.players.reduce((sum, p) => sum + p.score, 0) / this.players.length);
        this.players.push(player);
        this.addLog('{name} arrive dans la partie, avec {score} points (la moyenne des autres).', { name, score: player.score }, 'info');
        this.changed();
        return player.id;
    }
    // endregion
    // region Turn actions
    assertCurrent(playerId) {
        if (!this.isRoundRunning)
            throw new RuleError('Aucune ronde en cours.');
        if (playerId !== this.currentPlayerIndex) {
            throw new RuleError('Ce n\'est pas le tour de {name}.', { name: this.getPlayer(playerId).name });
        }
    }
    assertNoEffect() {
        const effect = this.activeEffect;
        if (effect) {
            throw new RuleError('{name} doit d\'abord résoudre l\'effet de: {card}.', { name: this.players[effect.playerId].name, card: effect.card.longRef });
        }
    }
    /**
     *  Draw the top card of the draw pile (pioche)
     */
    drawFromPile(playerId) {
        this.assertCurrent(playerId);
        this.assertNoEffect();
        if (this.phase !== 'draw')
            throw new RuleError('Vous avez déjà pioché ce tour-ci.');
        const reshuffled = this.deck.remaining === 0 && this.deck.discardPile.length > 1;
        const card = this.deck.draw();
        if (!card)
            throw new RuleError('Il n\'y a plus de carte dans la pioche.');
        if (reshuffled)
            this.addLog('La pioche est vide : la pile de rejet est mélangée pour refaire la pioche.', undefined, 'info');
        this.drawn = { card, source: 'pile' };
        this.phase = 'drawn';
        this.move('draw', playerId, [card.id]);
        this.addLog('{name} pioche une carte.', { name: this.currentPlayer.name }, 'info');
        this.changed();
        return card;
    }
    /**
     *  Take the visible card of the discard pile. The player must then swap it with one of his cards.
     */
    takeDiscard(playerId) {
        this.assertCurrent(playerId);
        this.assertNoEffect();
        if (this.phase !== 'draw')
            throw new RuleError('Vous avez déjà pioché ce tour-ci.');
        if (this.currentPlayer.cards.length === 0) {
            throw new RuleError('Sans carte en main, impossible d\'échanger : piochez plutôt.');
        }
        const card = this.deck.takeDiscard();
        if (!card)
            throw new RuleError('La pile de rejet est vide.');
        this.drawn = { card, source: 'discard' };
        this.phase = 'drawn';
        this.move('takeDiscard', playerId, [card.id], [], card);
        this.addLog('{name} prend {card} de la pile de rejet.', { name: this.currentPlayer.name, card: card.ref }, 'info');
        this.changed();
        return card;
    }
    /**
     *  Swap the drawn card with a card of the hand; the hand card goes to the discard pile
     */
    swapDrawn(playerId, handCardId) {
        this.assertCurrent(playerId);
        if (this.phase !== 'drawn' || !this.drawn)
            throw new RuleError('Piochez d\'abord une carte.');
        const player = this.currentPlayer;
        const newCard = this.drawn.card;
        const old = player.replaceCard(handCardId, newCard);
        if (!old)
            throw new RuleError('Cette carte n\'est pas dans votre main.');
        this.drawn = null;
        this.phase = 'played';
        this.addLog('{name} échange une carte et jette {card}.', { name: player.name, card: old.ref }, 'info');
        this.move('swap', player.id, [newCard.id, old.id], [], old);
        this.discardCard(player, old);
        // The player now knows the card he just placed
        this.reveal(player, newCard);
        this.changed();
    }
    /**
     *  Throw the card drawn from the draw pile without keeping it
     */
    discardDrawn(playerId) {
        this.assertCurrent(playerId);
        if (this.phase !== 'drawn' || !this.drawn)
            throw new RuleError('Piochez d\'abord une carte.');
        if (this.drawn.source === 'discard') {
            throw new RuleError('Une carte prise dans la pile de rejet doit être échangée.');
        }
        const card = this.drawn.card;
        this.drawn = null;
        this.phase = 'played';
        this.addLog('{name} jette {card}.', { name: this.currentPlayer.name, card: card.ref }, 'info');
        this.move('discardDrawn', playerId, [card.id], [], card);
        this.discardCard(this.currentPlayer, card);
        this.changed();
    }
    /**
     *  Any player (not only the current one) throws a card of the same value as the visible discard.
     *  - Right value: the card goes to the discard pile (and its effect is triggered)
     *  - Wrong value: the card stays, the player gets a penalty card and can't throw again this turn
     * @returns true if the card matched
     */
    throwCard(playerId, cardId) {
        const player = this.getPlayer(playerId);
        if (!this.isRoundRunning && this.phase !== 'peek')
            throw new RuleError('Aucune ronde en cours.');
        this.assertNoEffect();
        if (this.phase === 'drawn') {
            throw new RuleError('Attendez que {name} ait joué sa carte.', { name: this.currentPlayer.name });
        }
        if (player.locked)
            throw new RuleError('{name} s\'est trompé : plus de carte à jeter durant ce tour.', { name: player.name });
        const card = player.getCard(cardId);
        if (!card)
            throw new RuleError('Cette carte n\'est pas dans votre main.');
        const top = this.deck.topDiscard;
        if (!top)
            throw new RuleError('La pile de rejet est vide.');
        if (card.matches(top)) {
            player.removeCard(cardId);
            this.addLog('{name} jette {card} sur {top} !', { name: player.name, card: card.ref, top: top.ref }, 'good');
            this.move('throw', player.id, [card.id], [], card);
            this.discardCard(player, card);
            this.changed();
            return true;
        }
        player.locked = true;
        // A wrong card is shown to everybody before going back in the hand
        this.reveal(player, card, true);
        const penalty = this.deck.draw();
        this.move('wrongThrow', player.id, penalty ? [card.id, penalty.id] : [card.id], [], card);
        if (penalty) {
            player.addCard(penalty);
            this.addLog('{name} se trompe ({card} ≠ {top}) : carte de pénalité.', { name: player.name, card: card.ref, top: top.ref }, 'bad');
        }
        else {
            this.addLog('{name} se trompe ({card} ≠ {top}), mais il n\'y a plus de carte de pénalité.', { name: player.name, card: card.ref, top: top.ref }, 'bad');
        }
        this.changed();
        return false;
    }
    /**
     *  End the turn of the current player, optionally saying "Dutch"
     */
    endTurn(playerId, callDutch = false) {
        this.assertCurrent(playerId);
        this.assertNoEffect();
        if (!this.canEndTurn)
            throw new RuleError('Vous devez jouer (piocher ou prendre le rejet) avant de finir votre tour.');
        const player = this.currentPlayer;
        if (callDutch) {
            if (this.dutchCallerId !== null) {
                throw new RuleError('{name} a déjà dit Dutch.', { name: this.players[this.dutchCallerId].name });
            }
            this.dutchCallerId = player.id;
            this.finalTurnsLeft = this.players.length - 1;
            this.addLog('{name} dit «\u00a0Dutch\u00a0» ! Dernier tour pour les autres joueurs.', { name: player.name }, 'dutch');
            this.move('dutch', player.id);
        }
        else {
            if (this.dutchCallerId !== null)
                this.finalTurnsLeft--;
            this.move('endTurn', player.id);
        }
        this.players.forEach(p => p.locked = false);
        if (this.dutchCallerId !== null && this.finalTurnsLeft <= 0) {
            this.endRound();
            return;
        }
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.phase = 'draw';
        this.addLog(this.isFinalRound ? 'Dernier tour de {name}.' : 'Au tour de {name}.', { name: this.currentPlayer.name }, 'info');
        this.changed();
    }
    // endregion
    // region Special cards
    /**
     *  Put a card on the discard pile and queue its effect if it is a special card
     */
    discardCard(player, card) {
        this.deck.discard(card);
        let type = null;
        switch (card.value) {
            case 'JACK':
                type = 'JACK';
                break;
            case 'QUEEN':
                type = 'QUEEN';
                break;
            case 'ACE':
                type = 'ACE';
                break;
        }
        if (type && this.effectsEnabled.includes(type)) {
            this.effects.push({ type, playerId: player.id, card });
            this.addLog('{card} : {name} gagne un effet.', { card: card.longRef, name: player.name }, 'effect');
        }
    }
    assertEffect(playerId, type) {
        const effect = this.activeEffect;
        if (!effect || effect.type !== type)
            throw new RuleError('Aucun effet de ce type à résoudre.');
        if (effect.playerId !== playerId) {
            throw new RuleError('C\'est à {name} de résoudre l\'effet.', { name: this.players[effect.playerId].name });
        }
        return effect;
    }
    /**
     *  Valet: exchange two cards on the table, from any players (but not the immune "Dutch" player)
     */
    jackSwap(playerId, cardIdA, cardIdB) {
        this.assertEffect(playerId, 'JACK');
        if (cardIdA === cardIdB)
            throw new RuleError('Choisissez deux cartes différentes.');
        const ownerA = this.ownerOf(cardIdA);
        const ownerB = this.ownerOf(cardIdB);
        if (!ownerA || !ownerB)
            throw new RuleError('Carte introuvable.');
        for (const owner of [ownerA, ownerB]) {
            if (this.isImmune(owner.id) && owner.id !== playerId) {
                throw new RuleError('{name} a dit Dutch : ses cartes sont protégées.', { name: owner.name });
            }
        }
        const indexA = ownerA.hand.findIndex(c => c?.id === cardIdA);
        const indexB = ownerB.hand.findIndex(c => c?.id === cardIdB);
        const cardA = ownerA.hand[indexA];
        ownerA.hand[indexA] = ownerB.hand[indexB];
        ownerB.hand[indexB] = cardA;
        const name = this.players[playerId].name;
        if (ownerA === ownerB)
            this.addLog('{name} (Valet) échange deux cartes {deA}.', { name, a: ownerA.name, deA: de(ownerA.name) }, 'effect');
        else
            this.addLog('{name} (Valet) échange une carte {deA} et une carte {deB}.', { name, a: ownerA.name, b: ownerB.name, deA: de(ownerA.name), deB: de(ownerB.name) }, 'effect');
        this.move('jackSwap', playerId, [cardIdA, cardIdB], [ownerA.id, ownerB.id]);
        this.effects.shift();
        this.changed();
    }
    /**
     *  Dame: look at one of your cards without penalty
     * @returns the card
     */
    queenPeek(playerId, cardId) {
        this.assertEffect(playerId, 'QUEEN');
        const player = this.getPlayer(playerId);
        const card = player.getCard(cardId);
        if (!card)
            throw new RuleError('Choisissez une de vos cartes.');
        this.reveal(player, card);
        this.addLog('{name} (Dame) regarde une de ses cartes.', { name: player.name }, 'effect');
        this.move('queenPeek', playerId, [card.id]);
        this.effects.shift();
        this.changed();
        return card;
    }
    /**
     *  As: give a card from the draw pile to a player
     */
    aceGive(playerId, targetId) {
        this.assertEffect(playerId, 'ACE');
        const target = this.getPlayer(targetId);
        if (this.isImmune(target.id))
            throw new RuleError('{name} a dit Dutch : il est protégé.', { name: target.name });
        const card = this.deck.draw();
        this.move('aceGive', playerId, card ? [card.id] : [], [target.id]);
        if (card) {
            target.addCard(card);
            this.addLog('{name} (As) donne une carte de la pioche à {target}.', { name: this.players[playerId].name, target: target.name }, 'effect');
        }
        else {
            this.addLog('Plus de carte dans la pioche : l\'As n\'a pas d\'effet.', undefined, 'effect');
        }
        this.effects.shift();
        this.changed();
    }
    /**
     *  Choose not to use the effect
     */
    skipEffect(playerId) {
        const effect = this.activeEffect;
        if (!effect)
            throw new RuleError('Aucun effet à résoudre.');
        if (effect.playerId !== playerId) {
            throw new RuleError('C\'est à {name} de résoudre l\'effet.', { name: this.players[effect.playerId].name });
        }
        this.addLog('{name} n\'utilise pas l\'effet de {card}.', { name: this.players[playerId].name, card: effect.card.longRef }, 'effect');
        this.move('skipEffect', playerId, [], [], effect.card);
        this.effects.shift();
        this.changed();
    }
}
export default Dutch;
