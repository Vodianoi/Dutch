import Card from '../Card.js';
import Dutch, {GameEvent, RuleError} from '../Dutch.js';
import Player from '../Player.js';
import {renderCard} from './CardView.js';
import {clear, el} from './dom.js';

const REVEAL_MS = 2500;
const MESSAGE_MS = 3500;

/**
 *  Game screen
 *  - Re-renders everything from the engine state on each change
 *  - Translates clicks into engine actions and shows rule errors
 */
class GameView {

    // region Private Properties
    private readonly root: HTMLElement;
    private readonly game: Dutch;
    private readonly onNewGame: () => void;
    private readonly debug: boolean;

    /** card id -> time the reveal started */
    private revealed = new Map<string, number>();
    private message: { text: string; kind: 'error' | 'info' } | null = null;
    private messageTimer: number | undefined;
    private showAll = false;
    private unsubscribe: () => void;
    private destroyed = false;
    // endregion

    // region Constructor
    constructor(root: HTMLElement, game: Dutch, onNewGame: () => void, debug = false) {
        this.root = root;
        this.game = game;
        this.onNewGame = onNewGame;
        this.debug = debug;
        this.unsubscribe = game.on((event) => this.onGameEvent(event));
    }
    // endregion

    // region Public Methods
    public destroy() {
        this.destroyed = true;
        this.unsubscribe();
        window.clearTimeout(this.messageTimer);
        clear(this.root);
    }

    public render() {
        if (this.destroyed) return;
        const game = this.game;

        clear(this.root);
        this.root.appendChild(el('div', {class: 'board'},
            el('div', {class: 'table-area'},
                this.renderStatus(),
                this.renderCenter(),
                el('section', {class: 'players'}, ...game.players.map(p => this.renderPlayer(p)))),
            el('aside', {class: 'side'},
                this.renderScores())));

        if (game.phase === 'roundOver' || game.phase === 'gameOver') {
            this.root.appendChild(this.renderRoundResult());
        }
    }
    // endregion

    // region Events
    private onGameEvent(event: GameEvent) {
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
    private act(action: () => void) {
        try {
            action();
        } catch (e) {
            if (e instanceof RuleError) {
                this.flash(e.message, 'error');
            } else {
                throw e;
            }
        }
    }

    private flash(text: string, kind: 'error' | 'info' = 'info') {
        this.message = {text, kind};
        window.clearTimeout(this.messageTimer);
        this.messageTimer = window.setTimeout(() => {
            this.message = null;
            this.render();
        }, MESSAGE_MS);
        this.render();
    }

    /**
     *  Click on a card of a hand: depends on the phase
     *  - Current player holding a drawn card: swap
     *  - Otherwise: try to throw the card on the discard pile
     */
    private onHandCardClick(player: Player, card: Card) {
        const game = this.game;
        if (game.phase === 'peek') {
            this.flash('Attendez que tout le monde ait regardé ses cartes.', 'error');
            return;
        }
        if (game.phase === 'drawn' && player.id === game.currentPlayerIndex) {
            this.act(() => game.swapDrawn(player.id, card.id));
            return;
        }
        this.act(() => {
            const ok = game.throwCard(player.id, card.id);
            if (!ok) this.flash(`Raté ! ${player.name} reçoit une carte de pénalité.`, 'error');
        });
    }
    // endregion

    // region Rendering
    /**
     *  Instruction for the players, depending on the state
     */
    private instruction(): string {
        const game = this.game;
        const current = game.currentPlayer;
        if (game.phase === 'peek') return 'Chaque joueur clique sur « Regarder mes 2 cartes » pendant que les autres détournent les yeux.';
        switch (game.phase) {
            case 'draw':
                if (game.isStuck) return `${current.name} : plus aucune carte à piocher, terminez votre tour.`;
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

    private renderStatus(): HTMLElement {
        const game = this.game;
        return el('section', {class: 'status panel'},
            el('div', {class: 'status-line'},
                el('span', {class: 'round'}, `Ronde ${game.round}`),
                game.isFinalRound ? el('span', {class: 'badge dutch'}, `Dernier tour (${game.players[game.dutchCallerId!].name} a dit Dutch)`) : null,
                this.debug ? el('label', {class: 'debug'},
                    el('input', {type: 'checkbox', checked: this.showAll, onchange: (e: Event) => {
                        this.showAll = (e.target as HTMLInputElement).checked;
                        this.render();
                    }}), ' Tout voir (debug)') : null),
            el('p', {class: 'instruction', 'aria-live': 'polite'}, this.instruction()),
            this.message ? el('p', {class: `message ${this.message.kind}`, role: 'alert'}, this.message.text) : null);
    }

    private renderCenter(): HTMLElement {
        const game = this.game;
        const current = game.currentPlayer;
        const canDraw = game.phase === 'draw';
        const top = game.deck.topDiscard;

        const drawPile = el('div', {class: 'pile'},
            renderCard(null, {
                clickable: canDraw && game.deck.remaining > 0,
                title: 'Piocher',
                onClick: () => this.act(() => game.drawFromPile(current.id)),
            }),
            el('span', {class: 'pile-label'}, `Pioche (${game.deck.remaining})`));

        const discardPile = el('div', {class: 'pile'},
            top ? renderCard(top, {
                faceUp: true,
                clickable: canDraw,
                title: 'Prendre la carte du rejet',
                onClick: () => this.act(() => game.takeDiscard(current.id)),
            }) : el('div', {class: 'card empty'}),
            el('span', {class: 'pile-label'}, 'Rejet'));

        const drawn = game.drawn;
        const drawnArea = drawn
            ? el('div', {class: 'pile drawn'},
                renderCard(drawn.card, {faceUp: true}),
                el('span', {class: 'pile-label'}, `Carte de ${current.name}`),
                drawn.source === 'pile'
                    ? el('button', {id: 'discard-drawn', onclick: () => this.act(() => game.discardDrawn(current.id))}, 'Jeter')
                    : null)
            : null;

        return el('section', {class: 'center'}, drawPile, discardPile, drawnArea);
    }

    private renderPlayer(player: Player): HTMLElement {
        const game = this.game;
        const isCurrent = game.isRoundRunning && player.id === game.currentPlayerIndex;
        const saidDutch = game.dutchCallerId === player.id;

        const classes = ['player', 'panel'];
        if (isCurrent) classes.push('current');
        if (saidDutch) classes.push('said-dutch');

        const handClickable = game.isRoundRunning
            && ((game.phase === 'drawn' && isCurrent) || game.canThrow(player.id));

        const hand = el('div', {class: 'hand'},
            ...player.hand.map(card => {
                const start = this.revealed.get(card.id);
                return renderCard(card, {
                    faceUp: this.showAll,
                    revealElapsed: start !== undefined && !this.showAll ? Math.min(performance.now() - start, REVEAL_MS) : undefined,
                    revealDuration: REVEAL_MS,
                    clickable: handClickable,
                    onClick: () => this.onHandCardClick(player, card),
                });
            }));
        if (player.hand.length === 0) hand.appendChild(el('span', {class: 'empty-hand'}, 'Plus de carte !'));

        const actions = el('div', {class: 'actions'});
        if (game.phase === 'peek' && !player.ready) {
            actions.appendChild(el('button', {onclick: () => this.act(() => game.peek(player.id))}, 'Regarder mes 2 cartes'));
        }
        if (isCurrent) {
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
        return el('div', {class: classes.join(' '), id: `player-${player.id}`},
            el('header', {},
                el('h2', {}, player.name),
                el('span', {class: 'score'}, `${player.score} pts`),
                isCurrent ? el('span', {class: 'badge turn'}, 'À son tour') : null,
                saidDutch ? el('span', {class: 'badge dutch'}, 'A dit Dutch') : null,
                player.locked ? el('span', {class: 'badge locked'}, 'Bloqué ce tour') : null,
                game.phase === 'peek' && player.ready ? el('span', {class: 'badge turn'}, 'Prêt') : null),
            hand,
            actions);
    }

    private renderScores(): HTMLElement {
        const game = this.game;
        const rounds = Math.max(0, ...game.players.map(p => p.roundScores.length));
        return el('section', {class: 'scores panel'},
            el('h3', {}, `Scores (fin à ${game.targetScore})`),
            el('table', {},
                el('thead', {}, el('tr', {},
                    el('th', {}, 'Joueur'),
                    ...Array.from({length: rounds}, (_, i) => el('th', {}, `R${i + 1}`)),
                    el('th', {}, 'Total'))),
                el('tbody', {}, ...game.players.map(p => el('tr', {},
                    el('td', {}, p.name),
                    ...p.roundScores.map(s => el('td', {}, s)),
                    el('td', {class: 'total'}, p.score))))));
    }

    private renderRoundResult(): HTMLElement {
        const game = this.game;
        const result = game.lastResult!;
        const caller = result.dutchCallerId !== null ? game.players[result.dutchCallerId] : null;
        const winners = result.winners.map(id => game.players[id].name).join(' et ');

        return el('div', {class: 'overlay'},
            el('section', {class: 'result panel', role: 'dialog', 'aria-modal': 'true'},
                el('h2', {}, result.gameOver ? `🏆 ${winners} gagne${result.winners.length > 1 ? 'nt' : ''} !` : `Fin de la ronde ${result.round}`),
                caller ? el('p', {}, `${caller.name} a dit Dutch.`) : null,
                el('table', {},
                    el('thead', {}, el('tr', {},
                        el('th', {}, 'Joueur'), el('th', {}, 'Main'), el('th', {}, 'Points'), el('th', {}, 'Pénalité'), el('th', {}, 'Total'))),
                    el('tbody', {}, ...result.scores.map(s => el('tr', {},
                        el('td', {}, game.players[s.playerId].name),
                        el('td', {class: 'result-hand'}, ...result.hands[s.playerId].map(card => renderCard(card, {faceUp: true, small: true}))),
                        el('td', {}, s.points),
                        el('td', {}, s.penalty ? `+${s.penalty}` : ''),
                        el('td', {class: 'total'}, s.total))))),
                result.gameOver
                    ? el('button', {class: 'primary', id: 'new-game', onclick: () => this.onNewGame()}, 'Nouvelle partie')
                    : el('button', {class: 'primary', id: 'next-round', onclick: () => this.act(() => game.nextRound())}, 'Ronde suivante')));
    }
    // endregion
}

export default GameView;
