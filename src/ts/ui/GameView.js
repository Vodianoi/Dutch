import { toCard } from '../View.js';
import { renderCard } from './CardView.js';
import { clear, el } from './dom.js';
const REVEAL_MS = 2500;
const MESSAGE_MS = 3500;
/**
 *  Game screen
 *  - Renders the view of the game given by the session (shared screen or one player's view)
 *  - Translates clicks into actions; on a remote device only the actions of its own seat are offered
 */
class GameView {
    // endregion
    // region Constructor
    constructor(root, session, onNewGame, debug = false) {
        /** card id -> reveal start time and face of the card */
        this.revealed = new Map();
        /** First card selected for a Valet exchange */
        this.selectedCardId = null;
        this.message = null;
        this.showAll = false;
        this.destroyed = false;
        this.root = root;
        this.session = session;
        this.onNewGame = onNewGame;
        this.debug = debug;
        this.unsubscribe = session.on((event) => this.onSessionEvent(event));
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
        const state = this.session.state;
        clear(this.root);
        if (!state)
            return;
        if (!state.activeEffect || state.activeEffect.type !== 'JACK')
            this.selectedCardId = null;
        // Online, the player of this device is shown first
        const players = state.players.slice();
        if (state.viewerId !== null) {
            const me = players.findIndex(p => p.id === state.viewerId);
            players.unshift(...players.splice(me, 1));
        }
        this.root.appendChild(el('div', { class: 'board' }, el('div', { class: 'table-area' }, this.renderStatus(state), this.renderCenter(state), el('section', { class: 'players' }, ...players.map(p => this.renderPlayer(state, p)))), el('aside', { class: 'side' }, this.renderScores(state), this.renderLog(state))));
        if (state.phase === 'roundOver' || state.phase === 'gameOver') {
            this.root.appendChild(this.renderRoundResult(state));
        }
    }
    // endregion
    // region Helpers
    /**
     *  Can this device act for the player? (always on a shared screen)
     */
    mine(state, playerId) {
        return state.viewerId === null || state.viewerId === playerId;
    }
    nameOf(state, playerId) {
        return state.viewerId === playerId ? 'Vous' : state.players[playerId].name;
    }
    dispatch(action) {
        this.session.dispatch(action);
    }
    // endregion
    // region Events
    onSessionEvent(event) {
        switch (event.type) {
            case 'reveal': {
                const id = event.card.id;
                this.revealed.set(id, { start: performance.now(), card: event.card });
                window.setTimeout(() => {
                    this.revealed.delete(id);
                    this.render();
                }, REVEAL_MS);
                break;
            }
            case 'notice':
                this.flash(event.notice.text, event.notice.kind);
                return;
        }
        this.render();
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
    onHandCardClick(state, player, card) {
        const effect = state.activeEffect;
        if (state.phase === 'peek') {
            this.flash('Attendez que tout le monde ait regardé ses cartes.', 'error');
            return;
        }
        if (effect) {
            if (!this.mine(state, effect.playerId)) {
                this.flash(`${state.players[effect.playerId].name} utilise l'effet de: ${effect.cardName}.`, 'error');
            }
            else if (effect.type === 'QUEEN') {
                this.dispatch({ type: 'queenPeek', playerId: effect.playerId, cardId: card.id });
            }
            else if (effect.type === 'JACK') {
                if (state.dutchCallerId === player.id && player.id !== effect.playerId) {
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
                    this.dispatch({ type: 'jackSwap', playerId: effect.playerId, cardIdA: first, cardIdB: card.id });
                }
            }
            else {
                this.flash('Choisissez le joueur qui reçoit une carte.', 'error');
            }
            return;
        }
        if (!this.mine(state, player.id)) {
            this.flash('Ce n\'est pas votre carte.', 'error');
            return;
        }
        if (state.phase === 'drawn' && player.id === state.currentPlayerIndex) {
            this.dispatch({ type: 'swapDrawn', playerId: player.id, cardId: card.id });
            return;
        }
        this.dispatch({ type: 'throwCard', playerId: player.id, cardId: card.id });
    }
    // endregion
    // region Rendering
    /**
     *  Instruction for the players, depending on the state and on who is looking
     */
    instruction(state) {
        const current = state.currentPlayerIndex;
        const effect = state.activeEffect;
        const online = state.viewerId !== null;
        if (state.phase === 'peek') {
            if (!online)
                return 'Chaque joueur clique sur « Regarder mes 2 cartes » pendant que les autres détournent les yeux.';
            return state.players[state.viewerId].ready
                ? 'En attente des autres joueurs…'
                : 'Cliquez sur « Regarder mes 2 cartes » pour commencer.';
        }
        if (effect) {
            const who = this.nameOf(state, effect.playerId);
            if (!this.mine(state, effect.playerId))
                return `${who} utilise l'effet de: ${effect.cardName}…`;
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
        const who = this.nameOf(state, current);
        const throwHint = ' Une carte de même valeur que le rejet ? Cliquez-la pour la jeter !';
        if (!this.mine(state, current)) {
            switch (state.phase) {
                case 'draw': return `Au tour de ${who}.` + throwHint;
                case 'drawn': return `${who} a pioché et choisit quoi faire…`;
                case 'played': return `${who} termine son tour.` + throwHint;
                default: return '';
            }
        }
        switch (state.phase) {
            case 'draw':
                if (state.isStuck)
                    return `${who} : plus aucune carte à piocher, terminez votre tour.`;
                return `${who} : piochez une carte ou prenez la carte de la pile de rejet.`;
            case 'drawn':
                return state.drawn?.source === 'discard'
                    ? `${who} : cliquez sur la carte de votre main à remplacer.`
                    : `${who} : cliquez sur une carte de votre main pour l'échanger, ou jetez la carte piochée.`;
            case 'played':
                return `${who} : terminez votre tour ou dites « Dutch ».` + throwHint;
            default:
                return '';
        }
    }
    renderStatus(state) {
        const effect = state.activeEffect;
        return el('section', { class: 'status panel' }, el('div', { class: 'status-line' }, el('span', { class: 'round' }, `Ronde ${state.round}`), state.isFinalRound ? el('span', { class: 'badge dutch' }, `Dernier tour (${state.players[state.dutchCallerId].name} a dit Dutch)`) : null, this.debug && this.session.canShowAll ? el('label', { class: 'debug' }, el('input', { type: 'checkbox', checked: this.showAll, onchange: (e) => {
                this.showAll = e.target.checked;
                this.session.setShowAll(this.showAll);
            } }), ' Tout voir (debug)') : null), el('p', { class: 'instruction', 'aria-live': 'polite' }, this.instruction(state)), effect && this.mine(state, effect.playerId) ? el('div', { class: 'effect-actions' }, el('button', { class: 'secondary', onclick: () => this.dispatch({ type: 'skipEffect', playerId: effect.playerId }) }, `Ne pas utiliser l'effet (${effect.cardName})`)) : null, this.message ? el('p', { class: `message ${this.message.kind}`, role: 'alert' }, this.message.text) : null);
    }
    renderCenter(state) {
        const current = state.currentPlayerIndex;
        const myTurn = this.mine(state, current);
        const canDraw = state.phase === 'draw' && !state.activeEffect && myTurn;
        const top = state.topDiscard ? toCard(state.topDiscard) : null;
        const drawPile = el('div', { class: 'pile' }, renderCard(null, {
            clickable: canDraw && state.deckRemaining > 0,
            title: 'Piocher',
            onClick: myTurn ? () => this.dispatch({ type: 'drawFromPile', playerId: current }) : undefined,
        }), el('span', { class: 'pile-label' }, `Pioche (${state.deckRemaining})`));
        const discardPile = el('div', { class: 'pile' }, top ? renderCard(top, {
            faceUp: true,
            clickable: canDraw,
            title: 'Prendre la carte du rejet',
            onClick: myTurn ? () => this.dispatch({ type: 'takeDiscard', playerId: current }) : undefined,
        }) : el('div', { class: 'card empty' }), el('span', { class: 'pile-label' }, 'Rejet'));
        const drawn = state.drawn;
        const drawnCard = drawn ? toCard(drawn.card) : null;
        const drawnArea = drawn
            ? el('div', { class: 'pile drawn' }, renderCard(drawnCard, { faceUp: !!drawnCard }), el('span', { class: 'pile-label' }, state.viewerId === current ? 'Votre carte' : `Carte de ${state.players[current].name}`), drawn.source === 'pile' && myTurn
                ? el('button', { id: 'discard-drawn', onclick: () => this.dispatch({ type: 'discardDrawn', playerId: current }) }, 'Jeter')
                : null)
            : null;
        return el('section', { class: 'center' }, drawPile, discardPile, drawnArea);
    }
    renderPlayer(state, player) {
        const running = state.phase === 'draw' || state.phase === 'drawn' || state.phase === 'played';
        const isCurrent = running && player.id === state.currentPlayerIndex;
        const effect = state.activeEffect;
        const immune = state.dutchCallerId === player.id;
        const mine = this.mine(state, player.id);
        const effectMine = !!effect && this.mine(state, effect.playerId);
        const classes = ['player', 'panel'];
        if (isCurrent)
            classes.push('current');
        if (immune)
            classes.push('immune');
        if (effect?.playerId === player.id)
            classes.push('effect-owner');
        if (state.viewerId === player.id)
            classes.push('me');
        if (!player.connected)
            classes.push('offline');
        const handClickable = running && ((effectMine && effect?.type === 'QUEEN' && effect.playerId === player.id)
            || (effectMine && effect?.type === 'JACK' && (!immune || effect.playerId === player.id))
            || (!effect && mine && state.phase === 'drawn' && isCurrent)
            || (!effect && mine && player.canThrow));
        const hand = el('div', { class: 'hand' }, ...player.hand.map(view => {
            const reveal = this.revealed.get(view.id);
            const known = toCard(view);
            const revealCard = reveal ? toCard(reveal.card) : null;
            return renderCard(known ?? revealCard, {
                faceUp: !!known,
                revealElapsed: !known && revealCard ? Math.min(performance.now() - reveal.start, REVEAL_MS) : undefined,
                revealDuration: REVEAL_MS,
                selected: this.selectedCardId === view.id,
                clickable: handClickable,
                onClick: () => this.onHandCardClick(state, player, view),
            });
        }));
        if (player.hand.length === 0)
            hand.appendChild(el('span', { class: 'empty-hand' }, 'Plus de carte !'));
        const actions = el('div', { class: 'actions' });
        if (state.phase === 'peek' && !player.ready && mine) {
            actions.appendChild(el('button', { class: 'peek', onclick: () => this.dispatch({ type: 'peek', playerId: player.id }) }, 'Regarder mes 2 cartes'));
        }
        if (isCurrent && !effect && mine) {
            actions.appendChild(el('button', {
                class: 'end-turn',
                disabled: !state.canEndTurn,
                onclick: () => this.dispatch({ type: 'endTurn', playerId: player.id, dutch: false }),
            }, 'Fin du tour'));
            if (!state.isFinalRound) {
                actions.appendChild(el('button', {
                    class: 'dutch-button',
                    disabled: !state.canEndTurn,
                    onclick: () => this.dispatch({ type: 'endTurn', playerId: player.id, dutch: true }),
                }, 'Dutch !'));
            }
        }
        if (effect?.type === 'ACE' && effectMine && !immune) {
            actions.appendChild(el('button', {
                class: 'give',
                onclick: () => this.dispatch({ type: 'aceGive', playerId: effect.playerId, targetId: player.id }),
            }, 'Donner une carte'));
        }
        return el('div', { class: classes.join(' '), id: `player-${player.id}` }, el('header', {}, el('h2', {}, player.name, state.viewerId === player.id ? el('small', {}, ' (vous)') : null), el('span', { class: 'score' }, `${player.score} pts`), isCurrent ? el('span', { class: 'badge turn' }, 'À son tour') : null, immune ? el('span', { class: 'badge dutch' }, 'Dutch · protégé') : null, player.locked ? el('span', { class: 'badge locked' }, 'Bloqué ce tour') : null, state.phase === 'peek' && player.ready ? el('span', { class: 'badge turn' }, 'Prêt') : null, !player.connected ? el('span', { class: 'badge locked' }, 'Déconnecté') : null), hand, actions);
    }
    renderScores(state) {
        const rounds = Math.max(0, ...state.players.map(p => p.roundScores.length));
        return el('section', { class: 'scores panel' }, el('h3', {}, `Scores (fin à ${state.targetScore})`), el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Joueur'), ...Array.from({ length: rounds }, (_, i) => el('th', {}, `R${i + 1}`)), el('th', {}, 'Total'))), el('tbody', {}, ...state.players.map(p => el('tr', {}, el('td', {}, p.name), ...p.roundScores.map(s => el('td', {}, s)), el('td', { class: 'total' }, p.score))))));
    }
    /**
     *  Game log (issue #6), latest first
     */
    renderLog(state) {
        const entries = state.log.slice().reverse();
        return el('section', { class: 'log panel' }, el('h3', {}, 'Journal'), el('ol', {}, ...entries.map((entry) => el('li', { class: entry.kind }, entry.message))));
    }
    renderRoundResult(state) {
        const result = state.lastResult;
        const caller = result.dutchCallerId !== null ? state.players[result.dutchCallerId] : null;
        const winners = result.winners.map(id => state.players[id].name).join(' et ');
        let button;
        if (!this.session.isHost) {
            button = el('p', { class: 'hint waiting' }, result.gameOver
                ? 'Partie terminée. L\'hôte peut relancer une partie.'
                : 'En attente de l\'hôte pour la ronde suivante…');
        }
        else if (result.gameOver) {
            button = el('button', { class: 'primary', id: 'new-game', onclick: () => this.onNewGame() }, 'Nouvelle partie');
        }
        else {
            button = el('button', {
                class: 'primary',
                id: 'next-round',
                onclick: () => this.dispatch({ type: 'nextRound', playerId: state.viewerId ?? 0 }),
            }, 'Ronde suivante');
        }
        return el('div', { class: 'overlay' }, el('section', { class: 'result panel', role: 'dialog', 'aria-modal': 'true' }, el('h2', {}, result.gameOver ? `🏆 ${winners} gagne${result.winners.length > 1 ? 'nt' : ''} !` : `Fin de la ronde ${result.round}`), caller ? el('p', {}, `${caller.name} a dit Dutch.`) : null, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Joueur'), el('th', {}, 'Main'), el('th', {}, 'Points'), el('th', {}, 'Pénalité'), el('th', {}, 'Total'))), el('tbody', {}, ...result.scores.map(s => el('tr', {}, el('td', {}, state.players[s.playerId].name), el('td', { class: 'result-hand' }, ...s.hand.map(card => renderCard(toCard(card), { faceUp: true, small: true }))), el('td', {}, s.points), el('td', {}, s.penalty ? `+${s.penalty}` : ''), el('td', { class: 'total' }, s.total))))), button));
    }
}
export default GameView;
