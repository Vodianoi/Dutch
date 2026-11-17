import { el } from './dom.js';
/**
 *  Render a card with a front (rank + suit) and a back, both in CSS: no image to download.
 *  - .card.face-up shows the front
 *  - .card.revealing plays the flip / wait / flip back animation (see styles.css)
 */
export function renderCard(card, options = {}) {
    const classes = ['card'];
    if (card?.isRed)
        classes.push('red');
    if (options.faceUp)
        classes.push('face-up');
    if (options.revealElapsed !== undefined)
        classes.push('revealing');
    if (options.selected)
        classes.push('selected');
    if (options.clickable)
        classes.push('clickable');
    if (options.disabled)
        classes.push('disabled');
    if (options.small)
        classes.push('small');
    const front = card
        ? el('div', { class: 'card-face card-front' }, el('span', { class: 'corner top' }, card.rankLabel, el('br'), card.suitSymbol), el('span', { class: 'pip' }, card.suitSymbol), el('span', { class: 'corner bottom' }, card.rankLabel, el('br'), card.suitSymbol))
        : el('div', { class: 'card-face card-front' });
    const inner = el('div', { class: 'card-inner' }, front, el('div', { class: 'card-face card-back' }));
    if (options.revealElapsed !== undefined) {
        inner.style.animationDuration = `${options.revealDuration ?? 2500}ms`;
        // A negative delay resumes the animation where it was when the view is re-rendered
        inner.style.animationDelay = `-${options.revealElapsed}ms`;
    }
    const showFace = options.faceUp || options.revealElapsed !== undefined;
    const div = el('div', {
        class: classes.join(' '),
        title: options.title,
        role: options.onClick ? 'button' : undefined,
        tabindex: options.onClick ? '0' : undefined,
        'aria-label': showFace && card ? card.name : 'Carte face cachée',
        'data-card': card?.id,
    }, inner);
    if (options.onClick) {
        const handler = options.onClick;
        div.addEventListener('click', () => handler());
        div.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handler();
            }
        });
    }
    return div;
}
