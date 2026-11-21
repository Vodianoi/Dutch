import {sfx, unlockAudio} from '../table/sound.js';

/**
 *  Everything written over the 3D table, in plain HTML (sharp at any size, read by screen readers):
 *  what to do now, the turn buttons, the name plates of the players, short notices, the scores.
 *  The table tells where each thing goes on the screen; nothing here knows about 3D.
 */

export interface Point {
    x: number;
    y: number;
}

/** `key`: an ordinary action. `call`: the « Dutch » call. `ghost`: a way out */
export type ButtonKind = 'key' | 'call' | 'ghost';

export interface HudButton {
    label: string;
    kind: ButtonKind;
    onTap(): void;
}

export interface TagState {
    score: number;
    badge: string | null;
    active: boolean;
    connected: boolean;
    /** Can be touched to choose this player (As) */
    choosable: boolean;
}

export interface ScoreRow {
    color: string;
    name: string;
    points: string;
    penalty: boolean;
    total: number;
    won: boolean;
}

export interface Scores {
    title: string;
    rows: ScoreRow[];
    /** Host: next round or new game */
    action: { label: string; onTap(): void } | null;
    /** The others: who they are waiting for */
    wait: string | null;
    /** Under the plaque: how to look at the cards */
    aside: string;
    /** What the scores button says once the plaque is put aside */
    reopen: string;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

export class Hud {
    public readonly root = make('div', 's3-hud');
    private readonly bannerBox = make('p', 's3-banner');
    private readonly toasts = make('div', 's3-toasts');
    private readonly actions = make('div', 's3-actions');
    private readonly countBox = make('span', 's3-count');
    private readonly tags = new Map<number, { box: HTMLElement; score: HTMLElement; badge: HTMLElement; x: number; y: number }>();
    private readonly chips = new Map<number, { box: HTMLElement; timer: number }>();
    private throwBox: HTMLButtonElement | null = null;
    private scoresBox: HTMLElement | null = null;
    private reopenBox: HTMLButtonElement | null = null;
    private actionsKey = '';
    private width = 0;
    private height = 0;
    private top = 0;

    /**
     * @param onSeat a name plate was touched
     */
    constructor(screen: HTMLElement, private readonly onSeat: (playerId: number) => void) {
        this.bannerBox.setAttribute('aria-live', 'polite');
        this.actions.setAttribute('role', 'group');
        this.countBox.setAttribute('aria-hidden', 'true');
        this.root.append(this.bannerBox, this.toasts, this.countBox, this.actions);
        screen.append(this.root);
    }

    public destroy() {
        this.chips.forEach(chip => clearTimeout(chip.timer));
        this.root.remove();
    }

    /**
     *  Size of the table on the screen, and where the top bar ends
     */
    public resize(width: number, height: number, top: number, compact: boolean) {
        this.width = width;
        this.height = height;
        this.top = top;
        this.root.classList.toggle('compact', compact);
        this.root.style.setProperty('--s3-top', `${top}px`);
    }

    // region What to do now
    public banner(text: string) {
        if (this.bannerBox.textContent === text) return;
        this.bannerBox.textContent = text;
        this.bannerBox.classList.remove('fresh');
        // Starts the small entrance again
        void this.bannerBox.offsetWidth;
        this.bannerBox.classList.add('fresh');
        this.root.style.setProperty('--s3-under-banner', `${this.bannerBottom}px`);
    }

    /** Bottom of the instructions, in pixels: the table is kept under it */
    public get bannerBottom(): number {
        return this.top + 8 + Math.max(34, this.bannerBox.offsetHeight);
    }

    public buttons(list: HudButton[], at: Point) {
        this.actions.style.left = `${at.x}px`;
        this.actions.style.top = `${at.y}px`;
        const key = list.map(b => `${b.kind}:${b.label}`).join('|');
        if (key === this.actionsKey) return;
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
    public throwButton(label: string, at: Point | null, onTap?: () => void) {
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
    public count(text: string, at: Point) {
        this.countBox.textContent = text;
        this.countBox.style.left = `${at.x}px`;
        this.countBox.style.top = `${at.y}px`;
    }
    // endregion

    // region Players
    public setSeats(players: { id: number; name: string; color: string }[]) {
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
                if (box.classList.contains('choosable')) this.onSeat(p.id);
            });
            box.addEventListener('keydown', e => {
                if ((e.key === 'Enter' || e.key === ' ') && box.classList.contains('choosable')) this.onSeat(p.id);
            });
            this.root.append(box);
            this.tags.set(p.id, {box, score, badge, x: 0, y: 0});
        }
    }

    /**
     *  A name plate next to its token: on the side away from the cards of the player
     * @param at the token, on the screen
     * @param away direction from the cards to the token, on the screen (unit)
     * @param clear radius of the token on the screen: the plate stays off it
     * @param narrow name above score, for the players along the sides of a narrow screen
     */
    public placeTag(id: number, at: Point, away: Point, clear: number, narrow = false) {
        const tag = this.tags.get(id);
        if (!tag) return;
        tag.box.classList.toggle('narrow', narrow);
        const w = tag.box.offsetWidth, h = tag.box.offsetHeight;
        const reach = clear + 5 + (Math.abs(away.x) * w + Math.abs(away.y) * h) / 2;
        tag.x = Math.max(w / 2 + 4, Math.min(this.width - w / 2 - 4, at.x + away.x * reach));
        tag.y = Math.max(this.top + h / 2 + 4, Math.min(this.height - h / 2 - 6, at.y + away.y * reach));
        tag.box.style.left = `${tag.x}px`;
        tag.box.style.top = `${tag.y}px`;
    }

    /** Name plates that cover each other (many players at the far end of the table) move up, one above the other */
    public settleTags() {
        const placed: { x: number; y: number; w: number; h: number }[] = [];
        // From the bottom of the screen up: the plates nearest to this device's player keep their place
        for (const tag of [...this.tags.values()].sort((a, b) => b.y - a.y)) {
            const w = tag.box.offsetWidth, h = tag.box.offsetHeight;
            for (let tries = 0; tries < 8; tries++) {
                const hit = placed.find(o => Math.abs(o.x - tag.x) < (o.w + w) / 2 + 2 && Math.abs(o.y - tag.y) < (o.h + h) / 2 + 2);
                if (!hit) break;
                tag.y = Math.max(this.top + h / 2 + 4, hit.y - (hit.h + h) / 2 - 3);
            }
            tag.box.style.top = `${tag.y}px`;
            placed.push({x: tag.x, y: tag.y, w, h});
        }
    }

    public updateTag(id: number, state: TagState) {
        const tag = this.tags.get(id);
        if (!tag) return;
        tag.score.textContent = `${state.score}`;
        tag.badge.hidden = !state.badge;
        tag.badge.textContent = state.badge ?? '';
        tag.box.classList.toggle('active', state.active);
        tag.box.classList.toggle('offline', !state.connected);
        tag.box.classList.toggle('choosable', state.choosable);
        if (state.choosable) {
            tag.box.setAttribute('role', 'button');
            tag.box.tabIndex = 0;
        } else {
            tag.box.removeAttribute('role');
            tag.box.removeAttribute('tabindex');
        }
    }

    /**
     *  A short notice. Next to a player (over his cards) when `at` is given, otherwise under the instructions.
     * @param key one notice at a time per key (a player, or -1 for this device)
     */
    public chip(key: number, text: string, color: string, at: Point | null, seconds = 2.8) {
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
        } else {
            this.toasts.append(box);
        }
        const timer = window.setTimeout(() => {
            box.classList.add('leaving');
            window.setTimeout(() => box.remove(), 350);
            if (this.chips.get(key)?.box === box) this.chips.delete(key);
        }, seconds * 1000);
        this.chips.set(key, {box, timer});
    }

    /** A reaction pops next to the player and floats away */
    public emote(emote: string, color: string, at: Point) {
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
    public call(text: string, sub: string) {
        const box = make('div', 's3-call');
        box.setAttribute('aria-hidden', 'true');
        box.append(make('strong', '', text), make('span', '', sub));
        this.root.append(box);
        window.setTimeout(() => box.remove(), 2300);
    }

    /** Victory: paper confetti falling over the table */
    public confetti(colors: string[]) {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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

    public get scoresShown(): boolean {
        return !!this.scoresBox;
    }

    /**
     *  Scores of the round, over the table. A touch beside the plaque puts it aside to look at the cards;
     *  a button brings it back.
     */
    public scores(model: Scores, instant: boolean, onAside: () => void) {
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
        } else if (model.wait) {
            plaque.append(make('p', 'wait', model.wait));
        }
        veil.append(plaque, make('p', 's3-aside', model.aside));
        veil.addEventListener('click', e => {
            if (!plaque.contains(e.target as Node)) onAside();
        });
        this.root.append(veil);
        this.scoresBox = veil;
        plaque.querySelector<HTMLElement>('button')?.focus({preventScroll: true});
    }

    public hideScores() {
        this.scoresBox?.remove();
        this.scoresBox = null;
        this.reopenBox?.remove();
        this.reopenBox = null;
    }

    /** The plaque is put aside: a button to bring it back */
    public scoresAside(label: string, onBack: () => void) {
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
    // endregion
}
