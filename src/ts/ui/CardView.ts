import Card from '../Card.js';
import {el} from './dom.js';

export type HighlightTone = 'move' | 'effect' | 'bad';

export interface CardViewOptions {
    /** Show the face of the card */
    faceUp?: boolean;
    /** Temporary reveal: the card flips, stays visible and flips back. Value = ms already elapsed */
    revealElapsed?: number;
    /** Total duration of a reveal animation in ms */
    revealDuration?: number;
    selected?: boolean;
    /** The card can be used now: it becomes a button (keyboard focus, pointer cursor) */
    clickable?: boolean;
    small?: boolean;
    /** What clicking the card does, read by screen readers before the card itself ("Piocher") */
    label?: string;
    /** Short visible label above the card for the last move ("Échangée", "Pénalité"…) */
    tag?: string;
    /** Ring around the card for the last move; `elapsed` keeps the pulse in step across re-renders */
    highlight?: { tone: HighlightTone; elapsed: number };
    /** Id of the card when its face is unknown (face down cards): animations follow it */
    id?: string;
    /** Used to find the element again (pile cards have no id): focus and animations */
    key?: string;
    /** Called on click, even when the card is not clickable (to explain why nothing happens) */
    onClick?: () => void;
}

const FACE_CARDS: Record<string, string> = {JACK: 'V', QUEEN: 'D', KING: 'R'};

/**
 *  Render a card with a front (rank + suit) and a back, both in CSS: no image to download.
 *  - .card.face-up shows the front
 *  - .card.revealing plays the flip / wait / flip back animation (see styles.css)
 */
export function renderCard(card: Card | null, options: CardViewOptions = {}): HTMLElement {
    const classes = ['card'];
    if (card?.isRed) classes.push('red');
    if (options.faceUp) classes.push('face-up');
    if (options.revealElapsed !== undefined) classes.push('revealing');
    if (options.selected) classes.push('selected');
    if (options.clickable) classes.push('clickable');
    if (options.small) classes.push('small');
    if (options.highlight) classes.push('highlight', `tone-${options.highlight.tone}`);

    let center: HTMLElement | null = null;
    if (card) {
        const face = FACE_CARDS[card.value];
        center = face
            ? el('span', {class: 'pip face'}, el('span', {class: 'face-letter'}, face), el('span', {class: 'face-suit'}, card.suitSymbol))
            : el('span', {class: 'pip'}, card.suitSymbol);
    }
    const front = card
        ? el('div', {class: 'card-face card-front', 'aria-hidden': 'true'},
            el('span', {class: 'corner top'}, card.rankLabel, el('br'), card.suitSymbol),
            center,
            el('span', {class: 'corner bottom'}, card.rankLabel, el('br'), card.suitSymbol))
        : el('div', {class: 'card-face card-front', 'aria-hidden': 'true'});

    const inner = el('div', {class: 'card-inner'},
        front,
        el('div', {class: 'card-face card-back', 'aria-hidden': 'true'}));

    if (options.revealElapsed !== undefined) {
        inner.style.animationDuration = `${options.revealDuration ?? 2500}ms`;
        // A negative delay resumes the animation where it was when the view is re-rendered
        inner.style.animationDelay = `-${options.revealElapsed}ms`;
    }

    const showFace = options.faceUp || options.revealElapsed !== undefined;
    const description = showFace && card ? card.name : 'carte face cachée';
    const div = el('div', {
        class: classes.join(' '),
        role: options.clickable ? 'button' : 'img',
        tabindex: options.clickable ? '0' : undefined,
        'aria-label': [options.label, description, options.tag].filter(Boolean).join(', '),
        'aria-pressed': options.clickable && options.selected !== undefined ? String(options.selected) : undefined,
        'data-card': options.id ?? card?.id,
        'data-key': options.key,
    }, inner, options.tag ? el('span', {class: 'card-tag', 'aria-hidden': 'true'}, options.tag) : null);

    if (options.highlight) div.style.setProperty('--hl-delay', `-${options.highlight.elapsed}ms`);

    if (options.onClick) {
        const handler = options.onClick;
        div.addEventListener('click', () => handler());
        if (options.clickable) {
            div.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handler();
                }
            });
        }
    }
    return div;
}
