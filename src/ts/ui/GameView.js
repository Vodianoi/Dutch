import { toCard } from '../View.js';
import { renderCard } from './CardView.js';
import { clear, el } from './dom.js';
import { describeSettings } from '../Settings.js';
import { icon } from './icons.js';
import { cardTag, comesFromPile, de, describeMove } from './moves.js';
const REVEAL_MS = 2500;
const MESSAGE_MS = 3500;
/** How long the cards of the last move keep their ring and tag */
const HIGHLIGHT_MS = 3000;
/** Duration of a card flying to its new place */
const FLIGHT_MS = 720;
const LOG_ICONS = {
    good: 'check', bad: 'cross', effect: 'star', dutch: 'dutch', score: 'info',
};
/**
 *  Game screen
 *  - Renders the view of the game given by the session (shared screen or one player's view)
 *  - Translates clicks into actions; on a remote device only the actions of its own seat are offered
 *  - Shows the last move: a sentence, a ring + tag on the cards concerned, and the cards fly to their new place
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
        /** Last move of the game and when this screen received it */
        this.move = null;
        /** "Dutch !" was clicked once: ask for a confirmation (until the turn changes) */
        this.confirmDutch = false;
        this.lastTurn = -1;
        /** Element to focus after the next render (data-key) */
        this.pendingFocus = null;
        /** Round result already shown (focus moved into it once) */
        this.resultShown = null;
        /** "Règles de la partie" panel opened by the player (kept across re-renders) */
        this.rulesOpen = false;
        this.lastInstruction = '';
        this.root = root;
        this.session = session;
        this.onNewGame = onNewGame;
        this.debug = debug;
        this.live = el('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
        this.alert = el('div', { class: 'sr-only', 'aria-live': 'assertive', 'aria-atomic': 'true' });
        document.body.append(this.live, this.alert);
        this.unsubscribe = session.on((event) => this.onSessionEvent(event));
    }
    // endregion
    // region Public Methods
    destroy() {
        this.destroyed = true;
        this.unsubscribe();
        window.clearTimeout(this.messageTimer);
        window.clearTimeout(this.moveTimer);
        this.live.remove();
        this.alert.remove();
        clear(this.root);
    }
    render() {
        if (this.destroyed)
            return;
        const state = this.session.state;
        const before = this.snapshot();
        clear(this.root);
        if (!state)
            return;
        if (!state.activeEffect || state.activeEffect.type !== 'JACK')
            this.selectedCardId = null;
        const fresh = this.trackMove(state);
        const running = state.phase === 'draw' || state.phase === 'drawn' || state.phase === 'played';
        if (!running || state.activeEffect || state.currentPlayerIndex !== this.lastTurn)
            this.confirmDutch = false;
        this.lastTurn = state.currentPlayerIndex;
        // Players sit around the table: this device's player at the bottom (player 1 on a shared screen),
        // the others clockwise in turn order. Seats never move, so everybody remembers who sits where.
        const players = state.players.slice();
        const bottom = Math.max(0, players.findIndex(p => p.id === (state.viewerId ?? 0)));
        const [me, ...others] = [...players.slice(bottom), ...players.slice(0, bottom)];
        const seats = seatLayout(others.length);
        const left = others.slice(0, seats.sides);
        const top = others.slice(seats.sides, seats.sides + seats.top);
        const right = others.slice(seats.sides + seats.top);
        const seat = (side, list) => el('div', { class: `seats seats-${side}` }, ...list.map(p => {
            const node = this.renderPlayer(state, p, side);
            // On phones the seats are one list in turn order (see styles.css)
            node.style.setProperty('--turn', String(p === me ? 99 : others.indexOf(p)));
            return node;
        }));
        const board = el('div', { class: 'board' }, el('section', { class: `table-board sides-${seats.sides}`, 'aria-label': 'Table de jeu' }, 
        // Left side is filled from the bottom up (clockwise)
        seat('left', left.slice().reverse()), seat('top', top), seat('right', right), el('div', { class: 'table-center' }, this.renderStatus(state), this.renderCenter(state), this.renderTurnActions(state)), seat('bottom', [me])), el('aside', { class: 'side' }, this.renderScores(state), this.renderRules(state), this.renderLog(state)));
        this.root.appendChild(board);
        if (this.message) {
            this.root.appendChild(el('div', { class: `toast ${this.message.kind}` }, icon(this.message.kind === 'error' ? 'cross' : 'info'), el('span', {}, this.message.text)));
        }
        let dialog = null;
        if (state.phase === 'roundOver' || state.phase === 'gameOver') {
            dialog = this.renderRoundResult(state);
            // Nothing behind the dialog can be focused or clicked
            board.setAttribute('inert', '');
            this.root.appendChild(dialog);
        }
        this.announce(state, fresh);
        this.restore(before, dialog);
        this.animate(before, fresh);
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
    get reducedMotion() {
        return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    }
    /** Last move, while it is still highlighted */
    get activeMove() {
        if (!this.move)
            return null;
        const elapsed = performance.now() - this.move.start;
        return elapsed < HIGHLIGHT_MS ? { view: this.move.view, elapsed } : null;
    }
    /**
     *  Remember the last move of the game.
     *  @returns true when it is a new move to animate (not on the first render of the screen)
     */
    trackMove(state) {
        const move = state.lastMove;
        if (!move) {
            this.move = null;
            return false;
        }
        if (this.move?.view.seq === move.seq)
            return false;
        const first = this.move === null && this.lastInstruction === '';
        this.move = { view: move, start: first ? -HIGHLIGHT_MS : performance.now() };
        window.clearTimeout(this.moveTimer);
        // Re-render once the highlight is over to remove the rings and tags
        if (!first)
            this.moveTimer = window.setTimeout(() => this.render(), HIGHLIGHT_MS + 50);
        return !first;
    }
    snapshot() {
        const rects = new Map();
        const board = this.root.querySelector('.board');
        board?.querySelectorAll('[data-card]').forEach(node => rects.set(node.dataset.card, node.getBoundingClientRect()));
        const active = document.activeElement;
        const hadFocus = !!active && active !== document.body && this.root.contains(active);
        let focusKey = null;
        if (hadFocus && active) {
            if (active.dataset.key)
                focusKey = `[data-key="${CSS.escape(active.dataset.key)}"]`;
            else if (active.dataset.card)
                focusKey = `[data-card="${CSS.escape(active.dataset.card)}"]`;
            else if (active.id)
                focusKey = `#${CSS.escape(active.id)}`;
        }
        return {
            rects,
            pile: this.root.querySelector('[data-key="draw-pile"]')?.getBoundingClientRect() ?? null,
            focusKey,
            hadFocus,
            logScroll: this.root.querySelector('.log ol')?.scrollTop ?? 0,
        };
    }
    /**
     *  After a re-render: same log scroll, same focused element (or a sensible place), dialog focus
     */
    restore(before, dialog) {
        const log = this.root.querySelector('.log ol');
        if (log)
            log.scrollTop = before.logScroll;
        if (dialog) {
            const key = dialog.dataset.result;
            if (this.resultShown !== key) {
                this.resultShown = key;
                dialog.querySelector('button, [role="dialog"]')?.focus();
                return;
            }
        }
        const wanted = this.pendingFocus ? `[data-key="${this.pendingFocus}"]` : before.focusKey;
        this.pendingFocus = null;
        if (!wanted && !before.hadFocus)
            return;
        const scope = dialog ?? this.root;
        const target = wanted ? scope.querySelector(wanted) : null;
        if (target && isFocusable(target)) {
            target.focus({ preventScroll: true });
        }
        else if (before.hadFocus) {
            // The focused card or button is gone (card played, turn over): go back to the instructions
            scope.querySelector('[role="dialog"], .status')?.focus({ preventScroll: true });
        }
    }
    /**
     *  Cards of the last move fly from where they were to where they are now (FLIP).
     *  A re-render during the flight continues the flight from the current position.
     */
    animate(before, fresh) {
        const move = this.move;
        if (!move || this.reducedMotion || typeof Element.prototype.animate !== 'function')
            return;
        const elapsed = performance.now() - move.start;
        if (!fresh && elapsed >= FLIGHT_MS)
            return;
        const duration = fresh ? FLIGHT_MS : FLIGHT_MS - elapsed;
        const board = this.root.querySelector('.board');
        if (!board)
            return;
        for (const id of move.view.cardIds) {
            const node = board.querySelector(`[data-card="${CSS.escape(id)}"]`);
            if (!node)
                continue;
            const from = before.rects.get(id) ?? (comesFromPile(move.view, id) ? before.pile : null);
            if (!from)
                continue;
            const to = node.getBoundingClientRect();
            const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
            const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1)
                continue;
            const scale = to.width > 0 ? from.width / to.width : 1;
            node.classList.add('flying');
            const animation = node.animate([
                { translate: `${dx}px ${dy}px`, scale: String(scale) },
                { translate: '0px 0px', scale: '1' },
            ], { duration, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
            const done = () => node.classList.remove('flying');
            animation.onfinish = done;
            animation.oncancel = done;
        }
    }
    /**
     *  Screen readers: say what just happened, then what to do (only when it changes)
     */
    announce(state, fresh) {
        const instruction = this.instruction(state);
        const parts = [];
        if (fresh && this.move)
            parts.push(describeMove(state, this.move.view).text);
        if (instruction !== this.lastInstruction)
            parts.push(instruction);
        this.lastInstruction = instruction;
        if (parts.length)
            this.live.textContent = parts.join(' ');
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
            case 'closed':
            case 'lobby':
            case 'connection':
                // Handled by the App (connection lost dialog, back to the lobby, reconnection banner)
                return;
        }
        this.render();
    }
    flash(text, kind = 'info') {
        this.message = { text, kind };
        (kind === 'error' ? this.alert : this.live).textContent = text;
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
                if (player.id !== effect.playerId) {
                    this.flash('La Dame permet de regarder une de vos propres cartes.', 'error');
                    return;
                }
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
        if (state.phase === 'roundOver')
            return `Fin de la ronde ${state.round}.`;
        if (state.phase === 'gameOver')
            return 'Partie terminée.';
        if (state.phase === 'peek') {
            if (!online)
                return 'Chaque joueur clique sur «\u00a0Regarder mes 2 cartes\u00a0» pendant que les autres détournent les yeux.';
            return state.players[state.viewerId].ready
                ? 'En attente des autres joueurs…'
                : 'Cliquez sur «\u00a0Regarder mes 2 cartes\u00a0» pour commencer.';
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
                return `${who} : terminez votre tour ou dites «\u00a0Dutch\u00a0».` + throwHint;
            default:
                return '';
        }
    }
    /**
     *  Big line on top: whose turn it is (or which effect is being used)
     */
    renderTurn(state) {
        const effect = state.activeEffect;
        if (state.phase === 'peek')
            return el('p', { class: 'turn-banner' }, icon('eye'), 'Mémorisez vos cartes');
        if (state.phase === 'roundOver' || state.phase === 'gameOver')
            return el('p', { class: 'turn-banner' }, icon('info'), 'Fin de la ronde');
        if (effect) {
            const mine = state.viewerId !== null && state.viewerId === effect.playerId;
            return el('p', { class: 'turn-banner effect' }, icon('star'), mine ? `À vous : effet ${effect.cardName}` : `${state.players[effect.playerId].name} : effet ${effect.cardName}`);
        }
        const current = state.currentPlayerIndex;
        if (state.viewerId === current)
            return el('p', { class: 'turn-banner mine' }, icon('star'), 'À vous de jouer !');
        return el('p', { class: 'turn-banner' }, icon('next'), `Au tour de ${state.players[current].name}`);
    }
    /**
     *  What just happened, in one sentence (always present: the layout does not jump)
     */
    renderMoveFeed(state) {
        if (!this.move) {
            return el('p', { class: 'move-feed tone-move' }, el('span', { class: 'move-icon' }, icon('info')), el('span', {}, `Ronde ${state.round} : les cartes sont distribuées.`));
        }
        const { text, tone, icon: name } = describeMove(state, this.move.view);
        const elapsed = Math.max(0, performance.now() - this.move.start);
        return el('p', {
            class: `move-feed tone-${tone}${elapsed < HIGHLIGHT_MS ? ' active' : ''}`,
            // The entrance animation resumes where it was when the view is re-rendered
            style: { animationDelay: `-${Math.round(elapsed)}ms` },
        }, el('span', { class: 'move-icon' }, icon(name)), el('span', {}, text));
    }
    renderStatus(state) {
        const effect = state.activeEffect;
        return el('section', { class: 'status panel', tabindex: '-1', 'aria-label': 'Déroulement de la partie' }, el('div', { class: 'status-line' }, this.renderTurn(state), el('span', { class: 'round' }, `Ronde ${state.round}`), state.isFinalRound ? el('span', { class: 'badge dutch' }, `Dernier tour : ${this.nameOf(state, state.dutchCallerId)} ${state.dutchCallerId === state.viewerId ? 'avez' : 'a'} dit Dutch`) : null, this.debug && this.session.canShowAll ? el('label', { class: 'debug' }, el('input', { type: 'checkbox', checked: this.showAll, onchange: (e) => {
                this.showAll = e.target.checked;
                this.session.setShowAll(this.showAll);
            } }), ' Tout voir (debug)') : null), this.renderMoveFeed(state), el('p', { class: 'instruction' }, this.instruction(state)), effect && this.mine(state, effect.playerId) ? el('div', { class: 'effect-actions' }, el('button', { class: 'secondary', 'data-key': 'skip-effect', onclick: () => this.dispatch({ type: 'skipEffect', playerId: effect.playerId }) }, icon('skip'), `Ne pas utiliser l'effet (${effect.cardName})`)) : null);
    }
    /** Ring + tag for a card of the last move */
    moveMark(cardId) {
        const move = this.activeMove;
        const mark = move ? cardTag(move.view, cardId) : null;
        return mark ? { tag: mark.tag, highlight: { tone: mark.tone, elapsed: Math.round(move.elapsed) } } : {};
    }
    renderCenter(state) {
        const current = state.currentPlayerIndex;
        const myTurn = this.mine(state, current);
        const canDraw = state.phase === 'draw' && !state.activeEffect && myTurn;
        const top = state.topDiscard ? toCard(state.topDiscard) : null;
        const drawPile = el('div', { class: `pile draw${state.deckRemaining > 1 ? ' stacked' : ''}` }, state.deckRemaining > 0 ? renderCard(null, {
            clickable: canDraw,
            label: canDraw ? 'Piocher' : 'Pioche',
            key: 'draw-pile',
            onClick: myTurn ? () => this.dispatch({ type: 'drawFromPile', playerId: current }) : undefined,
        }) : el('div', { class: 'card empty', 'data-key': 'draw-pile' }), el('span', { class: 'pile-label' }, 'Pioche ', el('span', { class: 'count' }, String(state.deckRemaining))));
        const discardPile = el('div', { class: 'pile' }, top ? renderCard(top, {
            faceUp: true,
            clickable: canDraw,
            label: canDraw ? 'Prendre la carte du rejet' : 'Rejet',
            key: 'discard-pile',
            onClick: myTurn ? () => this.dispatch({ type: 'takeDiscard', playerId: current }) : undefined,
            ...this.moveMark(top.id),
        }) : el('div', { class: 'card empty' }), el('span', { class: 'pile-label' }, 'Rejet'));
        const drawn = state.drawn;
        const drawnCard = drawn ? toCard(drawn.card) : null;
        const drawnArea = drawn
            ? el('div', { class: 'pile drawn' }, renderCard(drawnCard, {
                faceUp: !!drawnCard,
                id: drawn.card.id,
                label: 'Carte en main',
                ...this.moveMark(drawn.card.id),
            }), el('span', { class: 'pile-label' }, state.viewerId === current ? 'Votre carte' : `Carte ${de(state.players[current].name)}`), drawn.source === 'pile' && myTurn
                ? el('button', { id: 'discard-drawn', 'data-key': 'discard-drawn', onclick: () => this.dispatch({ type: 'discardDrawn', playerId: current }) }, icon('discard'), 'Jeter')
                : null)
            : null;
        return el('section', { class: 'center', 'aria-label': 'Pioche et rejet' }, drawPile, discardPile, drawnArea);
    }
    /** Label of a card of a hand for screen readers: what clicking it does */
    handCardAction(state, player, clickable, selected) {
        if (!clickable)
            return undefined;
        const effect = state.activeEffect;
        if (effect?.type === 'QUEEN')
            return 'Regarder';
        if (effect?.type === 'JACK')
            return selected ? 'Annuler la sélection' : this.selectedCardId ? 'Échanger avec la carte choisie' : 'Choisir pour l\'échange';
        if (state.phase === 'drawn' && player.id === state.currentPlayerIndex)
            return 'Remplacer par la carte en main';
        return 'Jeter sur le rejet';
    }
    /**
     *  "Dutch !" / "Fin du tour" in the middle of the table, for the player whose turn it is
     *  (on this device). In the middle so they are always at the same place, whoever plays.
     */
    renderTurnActions(state) {
        const running = state.phase === 'draw' || state.phase === 'drawn' || state.phase === 'played';
        const current = state.currentPlayerIndex;
        if (!running || state.activeEffect || !this.mine(state, current))
            return null;
        const actions = el('div', { class: 'actions turn-actions' });
        if (this.confirmDutch) {
            actions.append(el('p', { class: 'confirm-text' }, 'Dire « Dutch » ? Les autres joueurs jouent un dernier tour.'), el('button', { class: 'secondary', 'data-key': 'cancel-dutch', onclick: () => {
                    this.confirmDutch = false;
                    this.pendingFocus = 'dutch';
                    this.render();
                } }, 'Annuler'), el('button', { class: 'dutch-button', 'data-key': 'confirm-dutch', onclick: () => {
                    this.confirmDutch = false;
                    this.dispatch({ type: 'endTurn', playerId: current, dutch: true });
                } }, icon('dutch'), 'Oui, Dutch !'));
            return actions;
        }
        if (!state.isFinalRound) {
            actions.appendChild(el('button', {
                class: 'dutch-button',
                'data-key': 'dutch',
                disabled: !state.canEndTurn,
                onclick: () => {
                    this.confirmDutch = true;
                    this.pendingFocus = 'confirm-dutch';
                    this.render();
                },
            }, icon('dutch'), 'Dutch !'));
        }
        actions.appendChild(el('button', {
            class: 'primary end-turn',
            'data-key': 'end-turn',
            disabled: !state.canEndTurn,
            onclick: () => this.dispatch({ type: 'endTurn', playerId: current, dutch: false }),
        }, 'Fin du tour', icon('next')));
        return actions;
    }
    renderPlayer(state, player, side) {
        const running = state.phase === 'draw' || state.phase === 'drawn' || state.phase === 'played';
        const isCurrent = running && player.id === state.currentPlayerIndex;
        const effect = state.activeEffect;
        const immune = state.dutchCallerId === player.id;
        const mine = this.mine(state, player.id);
        const effectMine = !!effect && this.mine(state, effect.playerId);
        const isViewer = state.viewerId === player.id;
        const move = this.activeMove;
        const classes = ['player', 'panel', 'seat', `seat-${side}`];
        if (isCurrent)
            classes.push('current');
        if (immune)
            classes.push('immune');
        if (effect?.playerId === player.id)
            classes.push('effect-owner');
        if (isViewer)
            classes.push('me');
        if (!player.connected)
            classes.push('offline');
        // Players concerned by the last move flash briefly
        if (move && move.view.type !== 'endTurn' && (move.view.playerId === player.id || move.view.playerIds.includes(player.id))) {
            classes.push('touched', `tone-${describeMove(state, move.view).tone}`);
        }
        const handClickable = running && ((effectMine && effect?.type === 'QUEEN' && effect.playerId === player.id)
            || (effectMine && effect?.type === 'JACK' && (!immune || effect.playerId === player.id))
            || (!effect && mine && state.phase === 'drawn' && isCurrent)
            || (!effect && mine && player.canThrow));
        // Cards in a square of 2 rows (4 cards: 2 x 2), each card keeps its place:
        // a card that leaves the hand leaves an empty place, so players remember their cards by position
        const columns = Math.max(1, Math.ceil(state.settings.cardsPerPlayer / 2));
        const owner = isViewer ? 'de vous' : de(player.name);
        const empty = player.hand.every(view => view === null);
        const hand = el('div', { class: 'hand', style: { gridTemplateColumns: `repeat(${columns}, var(--card-w))` } }, ...(empty ? [] : player.hand.map((view, i) => {
            if (!view)
                return el('div', { class: 'card slot', role: 'img', 'aria-label': `place ${i + 1} ${owner} : vide` });
            const reveal = this.revealed.get(view.id);
            const known = toCard(view);
            const revealCard = reveal ? toCard(reveal.card) : null;
            const selected = this.selectedCardId === view.id;
            const mark = this.moveMark(view.id);
            return renderCard(known ?? revealCard, {
                id: view.id,
                faceUp: !!known,
                revealElapsed: !known && revealCard ? Math.min(performance.now() - reveal.start, REVEAL_MS) : undefined,
                revealDuration: REVEAL_MS,
                selected: effect?.type === 'JACK' && handClickable ? selected : undefined,
                clickable: handClickable,
                label: [this.handCardAction(state, player, handClickable, selected), `carte ${i + 1} ${owner}`].filter(Boolean).join(' : '),
                tag: selected ? 'Choisie' : mark.tag,
                highlight: selected ? { tone: 'effect', elapsed: 0 } : mark.highlight,
                onClick: () => this.onHandCardClick(state, player, view),
            });
        })));
        if (empty)
            hand.appendChild(el('span', { class: 'empty-hand' }, 'Plus de carte !'));
        const actions = el('div', { class: 'actions' });
        if (state.phase === 'peek' && !player.ready && mine) {
            actions.appendChild(el('button', { class: 'primary peek', 'data-key': `peek-${player.id}`, onclick: () => this.dispatch({ type: 'peek', playerId: player.id }) }, icon('eye'), 'Regarder mes 2 cartes'));
        }
        if (effect?.type === 'ACE' && effectMine && !immune) {
            actions.appendChild(el('button', {
                class: 'primary give',
                'data-key': `give-${player.id}`,
                onclick: () => this.dispatch({ type: 'aceGive', playerId: effect.playerId, targetId: player.id }),
            }, icon('gift'), isViewer || (state.viewerId === null && player.id === effect.playerId) ? 'Me donner une carte' : `Donner une carte à ${player.name}`));
        }
        return el('div', { class: classes.join(' '), id: `player-${player.id}`, role: 'group', 'aria-label': isViewer ? `${player.name} (vous)` : player.name }, el('header', {}, el('span', { class: 'avatar', 'aria-hidden': 'true', style: { background: player.color ?? seatColor(player.id) } }, initial(player.name)), el('h2', {}, player.name, isViewer ? el('small', {}, ' (vous)') : null), el('span', { class: 'score' }, `${player.score} pts`), isCurrent ? el('span', { class: 'badge turn' }, isViewer ? 'À vous' : 'À son tour') : null, immune ? el('span', { class: 'badge dutch' }, 'Dutch · protégé') : null, player.locked ? el('span', { class: 'badge locked' }, 'Bloqué ce tour') : null, state.phase === 'peek' && player.ready ? el('span', { class: 'badge turn' }, 'Prêt') : null, !player.connected ? el('span', { class: 'badge locked' }, 'Déconnecté') : null), hand, actions);
    }
    renderScores(state) {
        const rounds = Math.max(0, ...state.players.map(p => p.roundScores.length));
        const best = Math.min(...state.players.map(p => p.score));
        return el('section', { class: 'scores panel' }, el('h3', {}, 'Scores ', el('small', {}, `fin à ${state.targetScore}`)), el('div', { class: 'table-scroll' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Joueur'), ...Array.from({ length: rounds }, (_, i) => el('th', { scope: 'col' }, `R${i + 1}`)), el('th', { scope: 'col' }, 'Total'))), el('tbody', {}, ...state.players.map(p => el('tr', { class: p.id === state.viewerId ? 'me' : '' }, el('th', { scope: 'row' }, p.name), ...p.roundScores.map(s => el('td', {}, s)), el('td', { class: 'total' }, p.score, rounds > 0 && p.score === best ? el('span', { class: 'lead' }, icon('star'), el('span', { class: 'sr-only' }, ' (en tête)')) : null)))))));
    }
    /**
     *  Rules chosen for this game, folded by default
     */
    renderRules(state) {
        const details = el('details', { class: 'rules panel', open: this.rulesOpen }, el('summary', {}, el('h3', {}, 'Règles de la partie')), el('ul', {}, ...describeSettings(state.settings).map(line => el('li', {}, line))));
        details.addEventListener('toggle', () => this.rulesOpen = details.open);
        return details;
    }
    /**
     *  Game log (issue #6), latest first
     */
    renderLog(state) {
        const entries = state.log.slice().reverse();
        return el('section', { class: 'log panel' }, el('h3', {}, 'Journal'), el('ol', { tabindex: '0', 'aria-label': 'Journal de la partie, du plus récent au plus ancien' }, ...entries.map((entry) => {
            const name = LOG_ICONS[entry.kind];
            return el('li', { class: entry.kind }, name ? icon(name) : el('span', { class: 'dot', 'aria-hidden': 'true' }), el('span', {}, entry.message));
        })));
    }
    renderRoundResult(state) {
        const result = state.lastResult;
        const caller = result.dutchCallerId !== null ? state.players[result.dutchCallerId] : null;
        const lowest = Math.min(...result.scores.map(s => s.points));
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
            }, 'Ronde suivante', icon('next'));
        }
        let title = `Fin de la ronde ${result.round}`;
        if (result.gameOver) {
            const names = result.winners.map(id => this.nameOf(state, id)).join(' et ');
            if (result.winners.length > 1)
                title = `${names} gagnent la partie !`;
            else if (result.winners[0] === state.viewerId)
                title = 'Vous gagnez la partie !';
            else
                title = `${names} gagne la partie !`;
        }
        return el('div', { class: 'overlay', 'data-result': `${result.round}-${result.gameOver}` }, el('section', { class: 'result panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'result-title', tabindex: '-1' }, el('h2', { id: 'result-title' }, result.gameOver ? icon('star') : null, title), caller ? el('p', {}, `${this.nameOf(state, caller.id)} ${caller.id === state.viewerId ? 'avez' : 'a'} dit Dutch.`) : null, el('div', { class: 'table-scroll' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Joueur'), el('th', { scope: 'col' }, 'Main'), el('th', { scope: 'col' }, 'Points'), el('th', { scope: 'col' }, 'Pénalité'), el('th', { scope: 'col' }, 'Total'))), el('tbody', {}, ...result.scores.map(s => el('tr', { class: s.points === lowest ? 'best' : '' }, el('th', { scope: 'row' }, state.players[s.playerId].name), el('td', { class: 'result-hand' }, ...s.hand.map(card => renderCard(toCard(card), { faceUp: true, small: true }))), el('td', {}, s.points, s.points === lowest ? el('span', { class: 'sr-only' }, ' (meilleure main)') : null), el('td', {}, s.penalty ? `+${s.penalty}` : ''), el('td', { class: 'total' }, s.total)))))), button));
    }
}
function isFocusable(node) {
    if (node.disabled)
        return false;
    return node.tabIndex >= 0 || node.getAttribute('tabindex') === '-1';
}
function initial(name) {
    return (name.trim()[0] ?? '?').toUpperCase();
}
/**
 *  Where the other players sit, clockwise from the bottom (this device):
 *  up to 3 across the top; beyond, the sides take 1 to 3 players each
 */
function seatLayout(others) {
    const sides = others <= 3 ? 0 : others <= 5 ? 1 : others <= 8 ? 2 : 3;
    return { sides, top: others - 2 * sides };
}
/** A distinct, dark enough color per seat (the white initial on it stays readable) */
function seatColor(id) {
    return `hsl(${(id * 67 + 200) % 360} 55% 34%)`;
}
export default GameView;
