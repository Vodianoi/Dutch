import { RuleError } from '../Dutch.js';
import { renderCard } from './CardView.js';
import { clear, el } from './dom.js';
const REVEAL_MS = 2500;
const MESSAGE_MS = 3500;
/**
 *  Game screen
 *  - Re-renders everything from the engine state on each change
 *  - Translates clicks into engine actions and shows rule errors
 */
class GameView {
    // endregion
    // region Constructor
    constructor(root, game, onNewGame, debug = false) {
        /** card id -> time the reveal started */
        this.revealed = new Map();
        /** First card selected for a Valet exchange */
        this.selectedCardId = null;
        this.message = null;
        this.showAll = false;
        this.destroyed = false;
        this.root = root;
        this.game = game;
        this.onNewGame = onNewGame;
        this.debug = debug;
        this.unsubscribe = game.on((event) => this.onGameEvent(event));
    }
    // endregion
    // region Public Methods
    destroy() {
        this.destroyed = true;
        this.unsubscribe();
        window.clearTimeout(this.messageTimer);
        clear(this.root);
    }
    render() {
        if (this.destroyed)
            return;
        const game = this.game;
        if (!game.activeEffect || game.activeEffect.type !== 'JACK')
            this.selectedCardId = null;
        clear(this.root);
        this.root.appendChild(el('div', { class: 'board' }, el('div', { class: 'table-area' }, this.renderStatus(), this.renderCenter(), el('section', { class: 'players' }, ...game.players.map(p => this.renderPlayer(p)))), el('aside', { class: 'side' }, this.renderScores(), this.renderLog())));
        if (game.phase === 'roundOver' || game.phase === 'gameOver') {
            this.root.appendChild(this.renderRoundResult());
        }
    }
    // endregion
    // region Events
    onGameEvent(event) {
        if (event.type === 'reveal') {
            this.revealed.set(event.cardId, performance.now());
            window.setTimeout(() => {
                this.revealed.delete(event.cardId);
                this.render();
            }, REVEAL_MS);
        }
        this.render();
    }
    /**
     *  Run an engine action and show the rule error if it is refused
     */
    act(action) {
        try {
            action();
        }
        catch (e) {
            if (e instanceof RuleError) {
                this.flash(e.message, 'error');
            }
            else {
                throw e;
            }
        }
    }
    flash(text, kind = 'info') {
        this.message = { text, kind };
        window.clearTimeout(this.messageTimer);
        this.messageTimer = window.setTimeout(() => {
            this.message = null;
            this.render();
        }, MESSAGE_MS);
        this.render();
    }
    /**
     *  Click on a card of a hand: depends on the phase
     *  - Effect to resolve: Valet selection / Dame peek
     *  - Current player holding a drawn card: swap
     *  - Otherwise: try to throw the card on the discard pile
     */
    onHandCardClick(player, card) {
        const game = this.game;
        const effect = game.activeEffect;
        if (game.phase === 'peek') {
            this.flash('Attendez que tout le monde ait regardé ses cartes.', 'error');
            return;
        }
        if (effect) {
            if (effect.type === 'QUEEN') {
                this.act(() => game.queenPeek(effect.playerId, card.id));
            }
            else if (effect.type === 'JACK') {
                if (game.isImmune(player.id) && player.id !== effect.playerId) {
                    this.flash(`${player.name} a dit Dutch : ses cartes sont protégées.`, 'error');
                }
                else if (this.selectedCardId === null) {
                    this.selectedCardId = card.id;
                    this.render();
                }
                else if (this.selectedCardId === card.id) {
                    this.selectedCardId = null;
                    this.render();
                }
                else {
                    const first = this.selectedCardId;
                    this.selectedCardId = null;
                    this.act(() => game.jackSwap(effect.playerId, first, card.id));
                }
            }
            else {
                this.flash(`${game.players[effect.playerId].name} doit choisir à qui donner une carte.`, 'error');
            }
            return;
        }
        if (game.phase === 'drawn' && player.id === game.currentPlayerIndex) {
            this.act(() => game.swapDrawn(player.id, card.id));
            return;
        }
        this.act(() => {
            const ok = game.throwCard(player.id, card.id);
            if (!ok)
                this.flash(`Raté ! ${player.name} reçoit une carte de pénalité.`, 'error');
        });
    }
    // endregion
    // region Rendering
    /**
     *  Instruction for the players, depending on the state
     */
    instruction() {
        const game = this.game;
        const current = game.currentPlayer;
        const effect = game.activeEffect;
        if (game.phase === 'peek')
            return 'Chaque joueur clique sur « Regarder mes 2 cartes » pendant que les autres détournent les yeux.';
        if (effect) {
            const who = game.players[effect.playerId].name;
            switch (effect.type) {
                case 'JACK':
                    return this.selectedCardId
                        ? `${who} (Valet) : choisissez la deuxième carte à échanger.`
                        : `${who} (Valet) : choisissez deux cartes sur la table à échanger, ou passez.`;
                case 'QUEEN':
                    return `${who} (Dame) : cliquez sur une de vos cartes pour la regarder.`;
                case 'ACE':
                    return `${who} (As) : choisissez le joueur qui reçoit une carte de la pioche.`;
            }
        }
        switch (game.phase) {
            case 'draw':
                if (game.isStuck)
                    return `${current.name} : plus aucune carte à piocher, terminez votre tour.`;
                return `${current.name} : piochez une carte ou prenez la carte de la pile de rejet.`;
            case 'drawn':
                return game.drawn?.source === 'discard'
                    ? `${current.name} : cliquez sur la carte de votre main à remplacer.`
                    : `${current.name} : cliquez sur une carte de votre main pour l'échanger, ou jetez la carte piochée.`;
            case 'played':
                return `${current.name} : terminez votre tour ou dites « Dutch ». Une carte de même valeur que le rejet ? Cliquez-la pour la jeter !`;
            default:
                return '';
        }
    }
    renderStatus() {
        const game = this.game;
        const effect = game.activeEffect;
        return el('section', { class: 'status panel' }, el('div', { class: 'status-line' }, el('span', { class: 'round' }, `Ronde ${game.round}`), game.isFinalRound ? el('span', { class: 'badge dutch' }, `Dernier tour (${game.players[game.dutchCallerId].name} a dit Dutch)`) : null, this.debug ? el('label', { class: 'debug' }, el('input', { type: 'checkbox', checked: this.showAll, onchange: (e) => {
                this.showAll = e.target.checked;
                this.render();
            } }), ' Tout voir (debug)') : null), el('p', { class: 'instruction', 'aria-live': 'polite' }, this.instruction()), effect ? el('div', { class: 'effect-actions' }, el('button', { class: 'secondary', onclick: () => this.act(() => game.skipEffect(effect.playerId)) }, `Ne pas utiliser l'effet (${effect.card.name})`)) : null, this.message ? el('p', { class: `message ${this.message.kind}`, role: 'alert' }, this.message.text) : null);
    }
    renderCenter() {
        const game = this.game;
        const current = game.currentPlayer;
        const canDraw = game.phase === 'draw' && !game.activeEffect;
        const top = game.deck.topDiscard;
        const drawPile = el('div', { class: 'pile' }, renderCard(null, {
            clickable: canDraw && game.deck.remaining > 0,
            title: 'Piocher',
            onClick: () => this.act(() => game.drawFromPile(current.id)),
        }), el('span', { class: 'pile-label' }, `Pioche (${game.deck.remaining})`));
        const discardPile = el('div', { class: 'pile' }, top ? renderCard(top, {
            faceUp: true,
            clickable: canDraw,
            title: 'Prendre la carte du rejet',
            onClick: () => this.act(() => game.takeDiscard(current.id)),
        }) : el('div', { class: 'card empty' }), el('span', { class: 'pile-label' }, 'Rejet'));
        const drawn = game.drawn;
        const drawnArea = drawn
            ? el('div', { class: 'pile drawn' }, renderCard(drawn.card, { faceUp: true }), el('span', { class: 'pile-label' }, `Carte de ${current.name}`), drawn.source === 'pile'
                ? el('button', { id: 'discard-drawn', onclick: () => this.act(() => game.discardDrawn(current.id)) }, 'Jeter')
                : null)
            : null;
        return el('section', { class: 'center' }, drawPile, discardPile, drawnArea);
    }
    renderPlayer(player) {
        const game = this.game;
        const isCurrent = game.isRoundRunning && player.id === game.currentPlayerIndex;
        const effect = game.activeEffect;
        const immune = game.isImmune(player.id);
        const classes = ['player', 'panel'];
        if (isCurrent)
            classes.push('current');
        if (immune)
            classes.push('immune');
        if (effect?.playerId === player.id)
            classes.push('effect-owner');
        const handClickable = game.isRoundRunning && ((effect?.type === 'QUEEN' && effect.playerId === player.id)
            || (effect?.type === 'JACK' && (!immune || effect.playerId === player.id))
            || (!effect && game.phase === 'drawn' && isCurrent)
            || (!effect && game.canThrow(player.id)));
        const hand = el('div', { class: 'hand' }, ...player.hand.map(card => {
            const start = this.revealed.get(card.id);
            return renderCard(card, {
                faceUp: this.showAll,
                revealElapsed: start !== undefined && !this.showAll ? Math.min(performance.now() - start, REVEAL_MS) : undefined,
                revealDuration: REVEAL_MS,
                selected: this.selectedCardId === card.id,
                clickable: handClickable,
                onClick: () => this.onHandCardClick(player, card),
            });
        }));
        if (player.hand.length === 0)
            hand.appendChild(el('span', { class: 'empty-hand' }, 'Plus de carte !'));
        const actions = el('div', { class: 'actions' });
        if (game.phase === 'peek' && !player.ready) {
            actions.appendChild(el('button', { onclick: () => this.act(() => game.peek(player.id)) }, 'Regarder mes 2 cartes'));
        }
        if (isCurrent && !effect) {
            actions.appendChild(el('button', {
                class: 'end-turn',
                disabled: !game.canEndTurn,
                onclick: () => this.act(() => game.endTurn(player.id)),
            }, 'Fin du tour'));
            if (!game.isFinalRound) {
                actions.appendChild(el('button', {
                    class: 'dutch-button',
                    disabled: !game.canEndTurn,
                    onclick: () => this.act(() => game.endTurn(player.id, true)),
                }, 'Dutch !'));
            }
        }
        if (effect?.type === 'ACE' && !immune) {
            actions.appendChild(el('button', {
                class: 'give',
                onclick: () => this.act(() => game.aceGive(effect.playerId, player.id)),
            }, 'Donner une carte'));
        }
        return el('div', { class: classes.join(' '), id: `player-${player.id}` }, el('header', {}, el('h2', {}, player.name), el('span', { class: 'score' }, `${player.score} pts`), isCurrent ? el('span', { class: 'badge turn' }, 'À son tour') : null, immune ? el('span', { class: 'badge dutch' }, 'Dutch · protégé') : null, player.locked ? el('span', { class: 'badge locked' }, 'Bloqué ce tour') : null, game.phase === 'peek' && player.ready ? el('span', { class: 'badge turn' }, 'Prêt') : null), hand, actions);
    }
    renderScores() {
        const game = this.game;
        const rounds = Math.max(0, ...game.players.map(p => p.roundScores.length));
        return el('section', { class: 'scores panel' }, el('h3', {}, `Scores (fin à ${game.targetScore})`), el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Joueur'), ...Array.from({ length: rounds }, (_, i) => el('th', {}, `R${i + 1}`)), el('th', {}, 'Total'))), el('tbody', {}, ...game.players.map(p => el('tr', {}, el('td', {}, p.name), ...p.roundScores.map(s => el('td', {}, s)), el('td', { class: 'total' }, p.score))))));
    }
    /**
     *  Game log (issue #6), latest first
     */
    renderLog() {
        const entries = this.game.log.slice(-80).reverse();
        return el('section', { class: 'log panel' }, el('h3', {}, 'Journal'), el('ol', {}, ...entries.map((entry) => el('li', { class: entry.kind }, entry.message))));
    }
    renderRoundResult() {
        const game = this.game;
        const result = game.lastResult;
        const caller = result.dutchCallerId !== null ? game.players[result.dutchCallerId] : null;
        const winners = result.winners.map(id => game.players[id].name).join(' et ');
        return el('div', { class: 'overlay' }, el('section', { class: 'result panel', role: 'dialog', 'aria-modal': 'true' }, el('h2', {}, result.gameOver ? `🏆 ${winners} gagne${result.winners.length > 1 ? 'nt' : ''} !` : `Fin de la ronde ${result.round}`), caller ? el('p', {}, `${caller.name} a dit Dutch.`) : null, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Joueur'), el('th', {}, 'Main'), el('th', {}, 'Points'), el('th', {}, 'Pénalité'), el('th', {}, 'Total'))), el('tbody', {}, ...result.scores.map(s => el('tr', {}, el('td', {}, game.players[s.playerId].name), el('td', { class: 'result-hand' }, ...result.hands[s.playerId].map(card => renderCard(card, { faceUp: true, small: true }))), el('td', {}, s.points), el('td', {}, s.penalty ? `+${s.penalty}` : ''), el('td', { class: 'total' }, s.total))))), result.gameOver
            ? el('button', { class: 'primary', id: 'new-game', onclick: () => this.onNewGame() }, 'Nouvelle partie')
            : el('button', { class: 'primary', id: 'next-round', onclick: () => this.act(() => game.nextRound()) }, 'Ronde suivante')));
    }
}
export default GameView;
