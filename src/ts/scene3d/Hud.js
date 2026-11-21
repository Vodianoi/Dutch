import { sfx, unlockAudio } from '../table/sound.js';
function make(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined)
        element.textContent = text;
    return element;
}
export class Hud {
    /**
     * @param onSeat a name plate was touched
     */
    constructor(screen, onSeat) {
        this.onSeat = onSeat;
        this.root = make('div', 's3-hud');
        this.bannerBox = make('p', 's3-banner');
        this.toasts = make('div', 's3-toasts');
        this.actions = make('div', 's3-actions');
        this.countBox = make('span', 's3-count');
        this.tags = new Map();
        this.chips = new Map();
        this.throwBox = null;
        this.scoresBox = null;
        this.reopenBox = null;
        this.actionsKey = '';
        this.width = 0;
        this.height = 0;
        this.top = 0;
        this.bannerBox.setAttribute('aria-live', 'polite');
        this.actions.setAttribute('role', 'group');
        this.countBox.setAttribute('aria-hidden', 'true');
        this.root.append(this.bannerBox, this.toasts, this.countBox, this.actions);
        screen.append(this.root);
    }
    destroy() {
        this.chips.forEach(chip => clearTimeout(chip.timer));
        this.root.remove();
    }
    /**
     *  Size of the table on the screen, and where the top bar ends
     */
    resize(width, height, top, compact) {
        this.width = width;
        this.height = height;
        this.top = top;
        this.root.classList.toggle('compact', compact);
        this.root.style.setProperty('--s3-top', `${top}px`);
    }
    // region What to do now
    banner(text) {
        if (this.bannerBox.textContent === text)
            return;
        this.bannerBox.textContent = text;
        this.bannerBox.classList.remove('fresh');
        // Starts the small entrance again
        void this.bannerBox.offsetWidth;
        this.bannerBox.classList.add('fresh');
        this.root.style.setProperty('--s3-under-banner', `${this.bannerBottom}px`);
    }
    /** Bottom of the instructions, in pixels: the table is kept under it */
    get bannerBottom() {
        return this.top + 8 + Math.max(34, this.bannerBox.offsetHeight);
    }
    buttons(list, at) {
        this.actions.style.left = `${at.x}px`;
        this.actions.style.top = `${at.y}px`;
        const key = list.map(b => `${b.kind}:${b.label}`).join('|');
        if (key === this.actionsKey)
            return;
        this.actionsKey = key;
        this.actions.replaceChildren(...list.map((b, i) => {
            const button = make('button', `s3-button ${b.kind === 'call' ? 'dutch-button' : b.kind === 'ghost' ? 's3-ghost' : ''}`, b.label);
            button.type = 'button';
            button.style.animationDelay = `${i * 60}ms`;
            button.addEventListener('click', () => {
                unlockAudio();
                sfx.tap();
                b.onTap();
            });
            return button;
        }));
    }
    /** « Jeter »: over the card chosen to be thrown (null: no card chosen) */
    throwButton(label, at, onTap) {
        if (!at) {
            this.throwBox?.remove();
            this.throwBox = null;
            return;
        }
        if (!this.throwBox) {
            this.throwBox = make('button', 's3-button s3-throw', label);
            this.throwBox.type = 'button';
            this.root.append(this.throwBox);
        }
        const box = this.throwBox;
        box.onclick = () => {
            unlockAudio();
            sfx.tap();
            onTap?.();
        };
        const half = box.offsetWidth / 2 + 8;
        box.style.left = `${Math.max(half, Math.min(this.width - half, at.x))}px`;
        box.style.top = `${Math.max(this.top + 30, at.y)}px`;
    }
    /** Cards left in the draw pile, written next to it */
    count(text, at) {
        this.countBox.textContent = text;
        this.countBox.style.left = `${at.x}px`;
        this.countBox.style.top = `${at.y}px`;
    }
    // endregion
    // region Players
    setSeats(players) {
        this.tags.forEach(tag => tag.box.remove());
        this.tags.clear();
        for (const p of players) {
            const box = make('div', 's3-tag');
            const dot = make('span', 's3-dot');
            dot.style.background = p.color;
            const score = make('span', 's3-score');
            const badge = make('span', 's3-badge');
            badge.hidden = true;
            box.append(dot, make('span', 's3-name', p.name), score, badge);
            box.addEventListener('click', () => {
                if (box.classList.contains('choosable'))
                    this.onSeat(p.id);
            });
            box.addEventListener('keydown', e => {
                if ((e.key === 'Enter' || e.key === ' ') && box.classList.contains('choosable'))
                    this.onSeat(p.id);
            });
            this.root.append(box);
            this.tags.set(p.id, { id: p.id, box, score, badge, x: 0, y: 0, w: 0, h: 0, anchor: null });
        }
    }
    /**
     *  A name plate next to its token: on the side away from the cards of the player.
     *  Call placeTags() once every plate has been given its token.
     * @param at the token, on the screen
     * @param away direction from the cards to the token, on the screen (unit)
     * @param clear radius of the token on the screen: the plate stays off it
     * @param narrow name above score, for the players along the sides of a narrow screen
     */
    placeTag(id, at, away, clear, narrow = false) {
        const tag = this.tags.get(id);
        if (!tag || !Number.isFinite(at.x) || !Number.isFinite(at.y))
            return;
        tag.box.classList.toggle('narrow', narrow);
        tag.anchor = { at, away, clear };
    }
    /**
     *  Every plate next to its token, then the plates that cover each other are moved apart: side by side when
     *  their tokens are side by side (the far end of the table), one above the other when their tokens are
     *  (along a side). Done again whenever a plate changes size (a score, a badge): see refreshTags.
     */
    placeTags() {
        const list = [...this.tags.values()].filter(tag => tag.anchor);
        const minY = (tag) => this.top + tag.h / 2 + 4;
        const maxY = (tag) => this.height - tag.h / 2 - 6;
        const keepIn = (tag) => {
            tag.x = Math.max(tag.w / 2 + 4, Math.min(this.width - tag.w / 2 - 4, tag.x));
            tag.y = Math.max(minY(tag), Math.min(maxY(tag), tag.y));
        };
        for (const tag of list) {
            const { at, away, clear } = tag.anchor;
            tag.w = tag.box.offsetWidth;
            tag.h = tag.box.offsetHeight;
            const reach = clear + 5 + (Math.abs(away.x) * tag.w + Math.abs(away.y) * tag.h) / 2;
            tag.x = at.x + away.x * reach;
            tag.y = at.y + away.y * reach;
            keepIn(tag);
        }
        for (let pass = 0; pass < 30; pass++) {
            let moved = false;
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    const a = list[i], b = list[j];
                    const gx = (a.w + b.w) / 2 + 6 - Math.abs(a.x - b.x);
                    const gy = (a.h + b.h) / 2 + 3 - Math.abs(a.y - b.y);
                    if (gx <= 0 || gy <= 0)
                        continue;
                    moved = true;
                    // The plates keep the order of their tokens
                    const dx = a.anchor.at.x - b.anchor.at.x, dy = a.anchor.at.y - b.anchor.at.y;
                    if (Math.abs(dx) >= Math.abs(dy)) {
                        const side = dx < 0 || (dx === 0 && a.id < b.id) ? -1 : 1;
                        a.x += side * gx / 2;
                        b.x -= side * gx / 2;
                    }
                    else {
                        const side = dy < 0 ? -1 : 1;
                        a.y += side * gy / 2;
                        b.y -= side * gy / 2;
                    }
                    keepIn(a);
                    keepIn(b);
                }
            }
            if (!moved)
                break;
        }
        for (const tag of list) {
            tag.box.style.left = `${tag.x}px`;
            tag.box.style.top = `${tag.y}px`;
        }
    }
    /** A plate changed size (its score, a badge, the fonts or the styles arriving late): every plate is placed again */
    refreshTags() {
        for (const tag of this.tags.values()) {
            if (tag.anchor && (tag.box.offsetWidth !== tag.w || tag.box.offsetHeight !== tag.h)) {
                this.placeTags();
                return;
            }
        }
    }
    updateTag(id, state) {
        const tag = this.tags.get(id);
        if (!tag)
            return;
        tag.score.textContent = `${state.score}`;
        tag.badge.hidden = !state.badge;
        tag.badge.textContent = state.badge ?? '';
        tag.box.classList.toggle('active', state.active);
        tag.box.classList.toggle('offline', !state.connected);
        tag.box.classList.toggle('choosable', state.choosable);
        if (state.choosable) {
            tag.box.setAttribute('role', 'button');
            tag.box.tabIndex = 0;
        }
        else {
            tag.box.removeAttribute('role');
            tag.box.removeAttribute('tabindex');
        }
    }
    /**
     *  A short notice. Next to a player (over his cards) when `at` is given, otherwise under the instructions.
     * @param key one notice at a time per key (a player, or -1 for this device)
     */
    chip(key, text, color, at, seconds = 2.8) {
        const previous = this.chips.get(key);
        if (previous) {
            clearTimeout(previous.timer);
            previous.box.remove();
        }
        const box = make('div', `s3-chip ${at ? 'at-seat' : ''}`, text);
        box.style.borderColor = color;
        if (at) {
            this.root.append(box);
            const w = box.offsetWidth, h = box.offsetHeight;
            box.style.left = `${Math.max(w / 2 + 6, Math.min(this.width - w / 2 - 6, at.x))}px`;
            box.style.top = `${Math.max(this.bannerBottom + h / 2 + 4, Math.min(this.height - h / 2 - 6, at.y))}px`;
        }
        else {
            this.toasts.append(box);
        }
        const timer = window.setTimeout(() => {
            box.classList.add('leaving');
            window.setTimeout(() => box.remove(), 350);
            if (this.chips.get(key)?.box === box)
                this.chips.delete(key);
        }, seconds * 1000);
        this.chips.set(key, { box, timer });
    }
    /** A reaction pops next to the player and floats away */
    emote(emote, color, at) {
        const bubble = make('div', 's3-emote', emote);
        bubble.style.borderColor = color;
        bubble.style.left = `${Math.max(30, Math.min(this.width - 30, at.x))}px`;
        bubble.style.top = `${Math.max(this.top + 30, at.y)}px`;
        bubble.setAttribute('aria-hidden', 'true');
        this.root.append(bubble);
        window.setTimeout(() => bubble.remove(), 2400);
    }
    // endregion
    // region Big moments
    /** The big « DUTCH ! » across the table */
    call(text, sub) {
        const box = make('div', 's3-call');
        box.setAttribute('aria-hidden', 'true');
        box.append(make('strong', '', text), make('span', '', sub));
        this.root.append(box);
        window.setTimeout(() => box.remove(), 2300);
    }
    /** Victory: paper confetti falling over the table */
    confetti(colors) {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches)
            return;
        const box = make('div', 's3-confetti');
        box.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 80; i++) {
            const piece = make('i', '');
            piece.style.left = `${Math.random() * 100}%`;
            piece.style.background = colors[i % colors.length];
            piece.style.animationDelay = `${Math.random() * .8}s`;
            piece.style.animationDuration = `${2.2 + Math.random() * 1.6}s`;
            piece.style.setProperty('--drift', `${(Math.random() - .5) * 160}px`);
            piece.style.setProperty('--spin', `${(Math.random() - .5) * 1400}deg`);
            box.append(piece);
        }
        this.root.append(box);
        window.setTimeout(() => box.remove(), 5000);
    }
    get scoresShown() {
        return !!this.scoresBox;
    }
    /**
     *  Scores of the round, over the table. A touch beside the plaque puts it aside to look at the cards;
     *  a button brings it back.
     */
    scores(model, instant, onAside) {
        this.hideScores();
        const veil = make('div', `s3-scores ${instant ? 'instant' : ''}`);
        const plaque = make('section', 'panel s3-plaque');
        plaque.setAttribute('role', 'dialog');
        plaque.setAttribute('aria-label', model.title);
        plaque.append(make('h2', '', model.title));
        const list = make('ol', '');
        for (const row of model.rows) {
            const item = make('li', row.won ? 'won' : '');
            const dot = make('span', 's3-dot');
            dot.style.background = row.color;
            item.append(dot, make('span', 'who', row.name), make('span', `pts ${row.penalty ? 'penalty' : ''}`, row.points), make('span', 'total', `${row.total}`));
            list.append(item);
        }
        plaque.append(list);
        if (model.action) {
            const action = model.action;
            const button = make('button', 'primary', action.label);
            button.type = 'button';
            button.addEventListener('click', () => {
                unlockAudio();
                sfx.tap();
                action.onTap();
            });
            plaque.append(button);
        }
        else if (model.wait) {
            plaque.append(make('p', 'wait', model.wait));
        }
        veil.append(plaque, make('p', 's3-aside', model.aside));
        veil.addEventListener('click', e => {
            if (!plaque.contains(e.target))
                onAside();
        });
        this.root.append(veil);
        this.scoresBox = veil;
        plaque.querySelector('button')?.focus({ preventScroll: true });
    }
    hideScores() {
        this.scoresBox?.remove();
        this.scoresBox = null;
        this.reopenBox?.remove();
        this.reopenBox = null;
    }
    /** The plaque is put aside: a button to bring it back */
    scoresAside(label, onBack) {
        this.hideScores();
        const button = make('button', 's3-button s3-reopen', label);
        button.type = 'button';
        button.addEventListener('click', () => {
            sfx.tap();
            onBack();
        });
        this.root.append(button);
        this.reopenBox = button;
    }
}
