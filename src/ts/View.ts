import {cardLabel, CardRef, msg, Msg, Params, render, t} from './i18n.js';
import Card, {Suit, Value} from './Card.js';
import Dutch, {EffectType, LogEntry, MoveType, Phase, RuleError} from './Dutch.js';
import {GameSettings} from './Settings.js';

/**
 *  What one player is allowed to see of the game.
 *  - Built by the host from the engine (buildView) and sent as JSON to remote players
 *  - Face down cards only carry their id: their value never leaves the host
 */

// region Types
export interface CardView {
    id: string;
    /** Only present when the card is face up for this viewer */
    value?: Value;
    suit?: Suit;
}

export interface PlayerView {
    id: number;
    name: string;
    color: string;
    score: number;
    roundScores: number[];
    ready: boolean;
    locked: boolean;
    canThrow: boolean;
    connected: boolean;
    /** By position: null is an empty place (a card left the hand, the others keep their place) */
    hand: (CardView | null)[];
}

/**
 *  Last move on the table (see Move in Dutch.ts). Only public information:
 *  card ids and, for thrown / discarded cards, their face.
 */
export interface MoveView {
    seq: number;
    type: MoveType;
    playerId: number;
    playerIds: number[];
    cardIds: string[];
    card?: CardView;
}

export interface RoundResultView {
    round: number;
    dutchCallerId: number | null;
    gameOver: boolean;
    winners: number[];
    scores: { playerId: number; points: number; penalty: number; total: number; hand: CardView[] }[];
}

export interface GameView {
    /** Seat of the player looking at the table, null on a shared screen */
    viewerId: number | null;
    phase: Phase;
    round: number;
    targetScore: number;
    /** Rules of this game */
    settings: GameSettings;
    currentPlayerIndex: number;
    dutchCallerId: number | null;
    isFinalRound: boolean;
    canEndTurn: boolean;
    isStuck: boolean;
    deckRemaining: number;
    topDiscard: CardView | null;
    drawn: { card: CardView; source: 'pile' | 'discard' } | null;
    activeEffect: { type: EffectType; playerId: number; cardName: string; card?: CardRef } | null;
    players: PlayerView[];
    log: LogEntry[];
    lastMove: MoveView | null;
    lastResult: RoundResultView | null;
}

/**
 *  Everything a player can ask the game to do. `playerId` is the seat doing the action:
 *  in online games the host overwrites it with the seat of the connection.
 */
export type Action =
    | { type: 'peek'; playerId: number }
    | { type: 'drawFromPile'; playerId: number }
    | { type: 'takeDiscard'; playerId: number }
    | { type: 'swapDrawn'; playerId: number; cardId: string }
    | { type: 'discardDrawn'; playerId: number }
    | { type: 'throwCard'; playerId: number; cardId: string }
    | { type: 'endTurn'; playerId: number; dutch: boolean }
    | { type: 'jackSwap'; playerId: number; cardIdA: string; cardIdB: string }
    | { type: 'queenPeek'; playerId: number; cardId: string }
    | { type: 'aceGive'; playerId: number; targetId: number }
    | { type: 'skipEffect'; playerId: number }
    | { type: 'nextRound'; playerId: number };

export interface Notice {
    /** In French (older pages show this one) */
    text: string;
    kind: 'error' | 'info';
    /** The same, shown by each device in its own language */
    msg?: Msg;
}

/** A notice in French, with its message for every language */
export function notice(kind: Notice['kind'], template: string | Msg, params?: Params): Notice {
    const m = typeof template === 'string' ? msg(template, params) : template;
    return {text: render(m, 'fr'), kind, msg: m};
}

/** Name of the card whose effect is being played, in the language of this device */
export function effectCard(effect: NonNullable<GameView['activeEffect']>): string {
    return effect.card ? cardLabel(effect.card) : effect.cardName;
}

/** Line of the game log in the language of this device */
export function logText(entry: { message: string; msg?: Msg }): string {
    return entry.msg ? render(entry.msg) : entry.message;
}

/** Text of a notice in the language of this device */
export function noticeText(n: Notice): string {
    return n.msg ? render(n.msg) : t(n.text);
}
// endregion

// region Cards
export function faceUp(card: Card): CardView {
    return {id: card.id, value: card.value, suit: card.suit};
}

export function faceDown(card: Card): CardView {
    return {id: card.id};
}

/**
 *  Rebuild a Card (for its labels and points) from a face up CardView
 */
export function toCard(view: CardView): Card | null {
    return view.value && view.suit ? new Card(view.id, view.value, view.suit) : null;
}
// endregion

// region View
export interface ViewOptions {
    /** Debug: show every card */
    showAll?: boolean;
    /** Seats currently connected (online games), everybody by default */
    connected?: (playerId: number) => boolean;
}

/**
 *  Build what `viewerId` sees. On a shared screen (viewerId null) the drawn card is shown
 *  to everybody; online, only the player who drew it sees it.
 *  Hands are always face down: nobody knows his own cards, reveals are sent separately.
 */
/** Is the player who said "Dutch" out of reach of this special card, in this game? */
export function isProtected(view: GameView, playerId: number, from: 'JACK' | 'ACE'): boolean {
    return view.dutchCallerId === playerId && (from === 'JACK' ? view.settings.protectFromJack : view.settings.protectFromAce);
}

export function buildView(game: Dutch, viewerId: number | null, options: ViewOptions = {}): GameView {
    const show = (card: Card) => options.showAll ? faceUp(card) : faceDown(card);
    const drawnVisible = viewerId === null || viewerId === game.currentPlayerIndex || options.showAll;
    const effect = game.activeEffect;
    const result = game.lastResult;

    return {
        viewerId,
        phase: game.phase,
        round: game.round,
        targetScore: game.targetScore,
        settings: {
            deckCount: game.deckCount,
            cardsPerPlayer: game.cardsPerPlayer,
            targetScore: game.targetScore,
            dutchPenalty: game.dutchPenalty,
            peekVariant: game.peekVariant,
            effects: game.effectsEnabled.slice(),
            protectFromJack: game.protectFromJack,
            protectFromAce: game.protectFromAce,
            queenAny: game.queenAny,
        },
        currentPlayerIndex: game.currentPlayerIndex,
        dutchCallerId: game.dutchCallerId,
        isFinalRound: game.isFinalRound,
        canEndTurn: game.canEndTurn,
        isStuck: game.isRoundRunning && game.isStuck,
        deckRemaining: game.deck.remaining,
        topDiscard: game.deck.topDiscard ? faceUp(game.deck.topDiscard) : null,
        drawn: game.drawn
            ? {card: drawnVisible ? faceUp(game.drawn.card) : faceDown(game.drawn.card), source: game.drawn.source}
            : null,
        activeEffect: effect ? {type: effect.type, playerId: effect.playerId, cardName: effect.card.name, card: effect.card.longRef} : null,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            color: p.color,
            score: p.score,
            roundScores: p.roundScores.slice(),
            ready: p.ready,
            locked: p.locked,
            canThrow: game.canThrow(p.id),
            connected: options.connected ? options.connected(p.id) : true,
            hand: p.hand.map(card => card ? show(card) : null),
        })),
        log: game.log.slice(-80),
        lastMove: game.lastMove ? {
            seq: game.lastMove.seq,
            type: game.lastMove.type,
            playerId: game.lastMove.playerId,
            playerIds: game.lastMove.playerIds.slice(),
            cardIds: game.lastMove.cardIds.slice(),
            ...(game.lastMove.card ? {card: faceUp(game.lastMove.card)} : {}),
        } : null,
        lastResult: result ? {
            round: result.round,
            dutchCallerId: result.dutchCallerId,
            gameOver: result.gameOver,
            winners: result.winners.slice(),
            // At the end of a round every hand is shown
            scores: result.scores.map(s => ({...s, hand: result.hands[s.playerId].map(faceUp)})),
        } : null,
    };
}
// endregion

// region Actions
/**
 *  Run an action on the engine.
 *  @returns a notice for the player who acted (e.g. a wrong throw), if any
 *  @throws RuleError when the rules refuse the action
 */
export function applyAction(game: Dutch, action: Action): Notice | null {
    const id = action.playerId;
    switch (action.type) {
        case 'peek': game.peek(id); break;
        case 'drawFromPile': game.drawFromPile(id); break;
        case 'takeDiscard': game.takeDiscard(id); break;
        case 'swapDrawn': game.swapDrawn(id, action.cardId); break;
        case 'discardDrawn': game.discardDrawn(id); break;
        case 'throwCard':
            if (!game.throwCard(id, action.cardId)) {
                return notice('error', 'Raté ! {name} reçoit une carte de pénalité.', {name: game.players[id].name});
            }
            break;
        case 'endTurn': game.endTurn(id, action.dutch); break;
        case 'jackSwap': game.jackSwap(id, action.cardIdA, action.cardIdB); break;
        case 'queenPeek': game.queenPeek(id, action.cardId); break;
        case 'aceGive': game.aceGive(id, action.targetId); break;
        case 'skipEffect': game.skipEffect(id); break;
        case 'nextRound': game.nextRound(); break;
        default: throw new RuleError('Action inconnue.');
    }
    return null;
}
// endregion
