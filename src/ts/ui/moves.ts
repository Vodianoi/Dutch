import {de} from '../Dutch.js';
import {GameView, MoveView, toCard} from '../View.js';
import type {HighlightTone} from './CardView.js';
import type {IconName} from './icons.js';

/**
 *  Words for the last move: a sentence for everybody ("Vous …" for the player of this device),
 *  an icon and a short tag on each card concerned. No DOM here, so it can be tested in node.
 */
export interface MoveText {
    text: string;
    icon: IconName;
    tone: HighlightTone;
}

export function describeMove(state: GameView, move: MoveView): MoveText {
    const you = state.viewerId === move.playerId;
    const actor = you ? 'Vous' : state.players[move.playerId]?.name ?? '?';
    const v = (yours: string, theirs: string) => you ? yours : theirs;
    const card = move.card ? toCard(move.card)?.name ?? 'une carte' : 'une carte';

    switch (move.type) {
        case 'peek':
            return {icon: 'eye', tone: 'move', text: `${actor} ${v('regardez vos', 'regarde ses')} 2 dernières cartes.`};
        case 'draw':
            return {icon: 'draw', tone: 'move', text: `${actor} ${v('piochez', 'pioche')} une carte.`};
        case 'takeDiscard':
            return {icon: 'draw', tone: 'move', text: `${actor} ${v('prenez', 'prend')} ${card} sur le rejet.`};
        case 'swap':
            return {icon: 'swap', tone: 'move', text: `${actor} ${v('placez la carte dans votre main et jetez', 'place la carte dans sa main et jette')} ${card}.`};
        case 'discardDrawn':
            return {icon: 'discard', tone: 'move', text: `${actor} ${v('jetez', 'jette')} la carte piochée : ${card}.`};
        case 'throw':
            return {icon: 'check', tone: 'move', text: `Bien vu ! ${actor} ${v('jetez', 'jette')} ${card} sur le rejet.`};
        case 'wrongThrow': {
            const penalty = move.cardIds.length > 1;
            return {
                icon: 'cross', tone: 'bad',
                text: `Raté : ${card} ne va pas sur le rejet. ` + (penalty
                    ? `${actor} ${v('recevez', 'reçoit')} une carte de pénalité.`
                    : 'Plus de carte de pénalité dans la pioche.'),
            };
        }
        case 'endTurn':
            return {icon: 'next', tone: 'move', text: `${actor} ${v('terminez votre', 'termine son')} tour.`};
        case 'dutch':
            return {icon: 'dutch', tone: 'effect', text: `${actor} ${v('dites', 'dit')} «\u00a0Dutch\u00a0» ! Dernier tour pour ${v('les autres joueurs', 'tout le monde')}.`};
        case 'jackSwap': {
            const [a, b] = move.playerIds;
            const what = a === b
                ? `deux cartes ${owner(state, move, a)}`
                : `une carte ${owner(state, move, a)} avec une carte ${owner(state, move, b)}`;
            return {icon: 'swap', tone: 'effect', text: `${actor} (Valet) ${v('échangez', 'échange')} ${what}.`};
        }
        case 'queenPeek':
            return {icon: 'eye', tone: 'effect', text: `${actor} (Dame) ${v('regardez une de vos', 'regarde une de ses')} cartes.`};
        case 'aceGive': {
            const target = move.playerIds[0];
            if (move.cardIds.length === 0) return {icon: 'gift', tone: 'effect', text: 'As : plus de carte dans la pioche, pas d\'effet.'};
            if (target === state.viewerId) return {icon: 'gift', tone: 'effect', text: `${actor} (As) vous donne une carte de la pioche.`};
            const to = target === move.playerId ? v('vous-même', 'lui-même') : state.players[target]?.name ?? '?';
            return {icon: 'gift', tone: 'effect', text: `${actor} (As) ${v('donnez', 'donne')} une carte de la pioche à ${to}.`};
        }
        case 'skipEffect':
            return {icon: 'skip', tone: 'effect', text: `${actor} ${v('n\'utilisez pas', 'n\'utilise pas')} l'effet : ${card}.`};
    }
}

/**
 *  Whose hand a card comes from: "de Léa", "de votre main", "de sa main"
 */
function owner(state: GameView, move: MoveView, playerId: number): string {
    if (playerId === state.viewerId) return 'de votre main';
    if (playerId === move.playerId) return 'de sa main';
    return de(state.players[playerId]?.name ?? '?');
}

export {de};

/**
 *  Tag shown on a card concerned by the move ("Échangée", "Pénalité"…), null if none
 */
export function cardTag(move: MoveView, cardId: string): { tag: string; tone: HighlightTone } | null {
    const index = move.cardIds.indexOf(cardId);
    if (index < 0) return null;
    switch (move.type) {
        case 'draw': return {tag: 'Piochée', tone: 'move'};
        case 'takeDiscard': return {tag: 'Prise', tone: 'move'};
        case 'swap': return index === 0 ? {tag: 'Nouvelle', tone: 'move'} : {tag: 'Jetée', tone: 'move'};
        case 'discardDrawn': return {tag: 'Jetée', tone: 'move'};
        case 'throw': return {tag: 'Jetée', tone: 'move'};
        case 'wrongThrow': return index === 0 ? {tag: 'Raté', tone: 'bad'} : {tag: 'Pénalité', tone: 'bad'};
        case 'jackSwap': return {tag: 'Échangée', tone: 'effect'};
        case 'queenPeek': return {tag: 'Regardée', tone: 'effect'};
        case 'aceGive': return {tag: 'Donnée', tone: 'effect'};
        default: return null;
    }
}

/**
 *  Cards that appear from the draw pile with this move (animated from the pile)
 */
export function comesFromPile(move: MoveView, cardId: string): boolean {
    const index = move.cardIds.indexOf(cardId);
    return (move.type === 'draw' && index === 0)
        || (move.type === 'wrongThrow' && index === 1)
        || (move.type === 'aceGive' && index === 0);
}
