import Deck from './Deck.js';
import Player from './Player.js';
/**
 *  Thrown when an action is not allowed by the rules; the message is shown to the players
 */
export class RuleError extends Error {
    constructor(message) {
        super(message);
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
        this.players = options.players.map((name, i) => new Player(i, name));
        this.deckCount = options.deckCount ?? 2;
        this.cardsPerPlayer = options.cardsPerPlayer ?? 4;
        this.targetScore = options.targetScore ?? 100;
        this.dutchPenalty = options.dutchPenalty ?? 10;
        this.peekVariant = options.peekVariant ?? false;
        this.rng = options.rng ?? Math.random;
        this.deck = new Deck(this.deckCount, this.rng);
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
            throw new RuleError(`Joueur inconnu (${id}).`);
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
     */
    canThrow(playerId) {
        const player = this.players[playerId];
        return !!player
            && (this.phase === 'draw' || this.phase === 'played')
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
            && (this.currentPlayer.hand.length === 0 || !this.deck.topDiscard);
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
    addLog(message, kind = 'info') {
        this.log.push({ round: this.round, kind, message });
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
        this.addLog(`— Ronde ${this.round} — ${this.deck.deckCount * 52} cartes, ${this.cardsPerPlayer} cartes chacun.`, 'info');
        if (this.peekVariant) {
            this.phase = 'peek';
            this.addLog('Chaque joueur regarde ses 2 dernières cartes.', 'info');
        }
        else {
            this.phase = 'draw';
            this.addLog(`C'est au tour de ${this.currentPlayer.name}.`, 'info');
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
            throw new RuleError(`${player.name} a déjà regardé ses cartes.`);
        const cards = player.hand.slice(-2);
        cards.forEach(card => this.reveal(player, card));
        player.ready = true;
        this.move('peek', player.id, cards.map(c => c.id));
        this.addLog(`${player.name} regarde ses 2 dernières cartes.`, 'info');
        if (this.players.every(p => p.ready)) {
            this.phase = 'draw';
            this.addLog(`C'est au tour de ${this.currentPlayer.name}.`, 'info');
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
            hands[p.id] = p.hand.slice();
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
        this.addLog(`Fin de la ronde ${this.round} : ` + scores
            .map(s => `${this.players[s.playerId].name} ${s.points}${s.penalty ? ` (+${s.penalty})` : ''}`)
            .join(', '), 'score');
        const gameOver = this.players.some(p => p.score >= this.targetScore);
        let winners = [];
        if (gameOver) {
            const best = Math.min(...this.players.map(p => p.score));
            winners = this.players.filter(p => p.score === best).map(p => p.id);
            this.addLog(`Partie terminée ! Victoire de ${winners.map(id => this.players[id].name).join(' et ')} avec ${best} points.`, 'dutch');
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
    // endregion
    // region Turn actions
    assertCurrent(playerId) {
        if (!this.isRoundRunning)
            throw new RuleError('Aucune ronde en cours.');
        if (playerId !== this.currentPlayerIndex) {
            throw new RuleError(`Ce n'est pas le tour de ${this.getPlayer(playerId).name}.`);
        }
    }
    assertNoEffect() {
        const effect = this.activeEffect;
        if (effect) {
            throw new RuleError(`${this.players[effect.playerId].name} doit d'abord résoudre l'effet de: ${effect.card.name}.`);
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
            this.addLog('La pioche est vide : la pile de rejet est mélangée pour refaire la pioche.', 'info');
        this.drawn = { card, source: 'pile' };
        this.phase = 'drawn';
        this.move('draw', playerId, [card.id]);
        this.addLog(`${this.currentPlayer.name} pioche une carte.`, 'info');
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
        if (this.currentPlayer.hand.length === 0) {
            throw new RuleError('Sans carte en main, impossible d\'échanger : piochez plutôt.');
        }
        const card = this.deck.takeDiscard();
        if (!card)
            throw new RuleError('La pile de rejet est vide.');
        this.drawn = { card, source: 'discard' };
        this.phase = 'drawn';
        this.move('takeDiscard', playerId, [card.id], [], card);
        this.addLog(`${this.currentPlayer.name} prend ${card} de la pile de rejet.`, 'info');
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
        this.addLog(`${player.name} échange une carte et jette ${old}.`, 'info');
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
        this.addLog(`${this.currentPlayer.name} jette ${card}.`, 'info');
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
        if (!this.isRoundRunning)
            throw new RuleError('Aucune ronde en cours.');
        this.assertNoEffect();
        if (this.phase === 'drawn') {
            throw new RuleError(`Attendez que ${this.currentPlayer.name} ait joué sa carte.`);
        }
        if (player.locked)
            throw new RuleError(`${player.name} s'est trompé : plus de carte à jeter durant ce tour.`);
        const card = player.getCard(cardId);
        if (!card)
            throw new RuleError('Cette carte n\'est pas dans votre main.');
        const top = this.deck.topDiscard;
        if (!top)
            throw new RuleError('La pile de rejet est vide.');
        if (card.matches(top)) {
            player.removeCard(cardId);
            this.addLog(`${player.name} jette ${card} sur ${top} !`, 'good');
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
            this.addLog(`${player.name} se trompe (${card} ≠ ${top}) : carte de pénalité.`, 'bad');
        }
        else {
            this.addLog(`${player.name} se trompe (${card} ≠ ${top}), mais il n'y a plus de carte de pénalité.`, 'bad');
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
                throw new RuleError(`${this.players[this.dutchCallerId].name} a déjà dit Dutch.`);
            }
            this.dutchCallerId = player.id;
            this.finalTurnsLeft = this.players.length - 1;
            this.addLog(`${player.name} dit «\u00a0Dutch\u00a0» ! Dernier tour pour les autres joueurs.`, 'dutch');
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
        this.addLog(`${this.isFinalRound ? 'Dernier tour' : 'Au tour'} de ${this.currentPlayer.name}.`, 'info');
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
        if (type) {
            this.effects.push({ type, playerId: player.id, card });
            this.addLog(`${card.name} : ${player.name} gagne un effet.`, 'effect');
        }
    }
    assertEffect(playerId, type) {
        const effect = this.activeEffect;
        if (!effect || effect.type !== type)
            throw new RuleError('Aucun effet de ce type à résoudre.');
        if (effect.playerId !== playerId) {
            throw new RuleError(`C'est à ${this.players[effect.playerId].name} de résoudre l'effet.`);
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
                throw new RuleError(`${owner.name} a dit Dutch : ses cartes sont protégées.`);
            }
        }
        const indexA = ownerA.hand.findIndex(c => c.id === cardIdA);
        const indexB = ownerB.hand.findIndex(c => c.id === cardIdB);
        const cardA = ownerA.hand[indexA];
        ownerA.hand[indexA] = ownerB.hand[indexB];
        ownerB.hand[indexB] = cardA;
        const who = ownerA === ownerB ? `deux cartes ${de(ownerA.name)}` : `une carte ${de(ownerA.name)} et une carte ${de(ownerB.name)}`;
        this.addLog(`${this.players[playerId].name} (Valet) échange ${who}.`, 'effect');
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
        this.addLog(`${player.name} (Dame) regarde une de ses cartes.`, 'effect');
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
            throw new RuleError(`${target.name} a dit Dutch : il est protégé.`);
        const card = this.deck.draw();
        this.move('aceGive', playerId, card ? [card.id] : [], [target.id]);
        if (card) {
            target.addCard(card);
            this.addLog(`${this.players[playerId].name} (As) donne une carte de la pioche à ${target.name}.`, 'effect');
        }
        else {
            this.addLog('Plus de carte dans la pioche : l\'As n\'a pas d\'effet.', 'effect');
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
            throw new RuleError(`C'est à ${this.players[effect.playerId].name} de résoudre l'effet.`);
        }
        this.addLog(`${this.players[playerId].name} n'utilise pas l'effet de ${effect.card.name}.`, 'effect');
        this.move('skipEffect', playerId, [], [], effect.card);
        this.effects.shift();
        this.changed();
    }
}
export default Dutch;
