import Card from './Card.js';
import { RuleError } from './Dutch.js';
// endregion
// region Cards
export function faceUp(card) {
    return { id: card.id, value: card.value, suit: card.suit };
}
export function faceDown(card) {
    return { id: card.id };
}
/**
 *  Rebuild a Card (for its labels and points) from a face up CardView
 */
export function toCard(view) {
    return view.value && view.suit ? new Card(view.id, view.value, view.suit) : null;
}
/**
 *  Build what `viewerId` sees. On a shared screen (viewerId null) the drawn card is shown
 *  to everybody; online, only the player who drew it sees it.
 *  Hands are always face down: nobody knows his own cards, reveals are sent separately.
 */
export function buildView(game, viewerId, options = {}) {
    const show = (card) => options.showAll ? faceUp(card) : faceDown(card);
    const drawnVisible = viewerId === null || viewerId === game.currentPlayerIndex || options.showAll;
    const effect = game.activeEffect;
    const result = game.lastResult;
    return {
        viewerId,
        phase: game.phase,
        round: game.round,
        targetScore: game.targetScore,
        currentPlayerIndex: game.currentPlayerIndex,
        dutchCallerId: game.dutchCallerId,
        isFinalRound: game.isFinalRound,
        canEndTurn: game.canEndTurn,
        isStuck: game.isRoundRunning && game.isStuck,
        deckRemaining: game.deck.remaining,
        topDiscard: game.deck.topDiscard ? faceUp(game.deck.topDiscard) : null,
        drawn: game.drawn
            ? { card: drawnVisible ? faceUp(game.drawn.card) : faceDown(game.drawn.card), source: game.drawn.source }
            : null,
        activeEffect: effect ? { type: effect.type, playerId: effect.playerId, cardName: effect.card.name } : null,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            roundScores: p.roundScores.slice(),
            ready: p.ready,
            locked: p.locked,
            canThrow: game.canThrow(p.id),
            connected: options.connected ? options.connected(p.id) : true,
            hand: p.hand.map(show),
        })),
        log: game.log.slice(-80),
        lastResult: result ? {
            round: result.round,
            dutchCallerId: result.dutchCallerId,
            gameOver: result.gameOver,
            winners: result.winners.slice(),
            // At the end of a round every hand is shown
            scores: result.scores.map(s => ({ ...s, hand: result.hands[s.playerId].map(faceUp) })),
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
export function applyAction(game, action) {
    const id = action.playerId;
    switch (action.type) {
        case 'peek':
            game.peek(id);
            break;
        case 'drawFromPile':
            game.drawFromPile(id);
            break;
        case 'takeDiscard':
            game.takeDiscard(id);
            break;
        case 'swapDrawn':
            game.swapDrawn(id, action.cardId);
            break;
        case 'discardDrawn':
            game.discardDrawn(id);
            break;
        case 'throwCard':
            if (!game.throwCard(id, action.cardId)) {
                return { text: `Raté ! ${game.players[id].name} reçoit une carte de pénalité.`, kind: 'error' };
            }
            break;
        case 'endTurn':
            game.endTurn(id, action.dutch);
            break;
        case 'jackSwap':
            game.jackSwap(id, action.cardIdA, action.cardIdB);
            break;
        case 'queenPeek':
            game.queenPeek(id, action.cardId);
            break;
        case 'aceGive':
            game.aceGive(id, action.targetId);
            break;
        case 'skipEffect':
            game.skipEffect(id);
            break;
        case 'nextRound':
            game.nextRound();
            break;
        default: throw new RuleError('Action inconnue.');
    }
    return null;
}
// endregion
