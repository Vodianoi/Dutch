import {CH, CW, TableShape} from './art.js';

/**
 *  Where everything goes on the screen, for 2 to 10 players.
 *  - The player of this device sits at the bottom, the others clockwise in turn order
 *  - Phone (portrait): the others sit on one or two rows above the centre
 *  - Landscape: everybody sits around the oval table
 */

export const RATIO = CH / CW;
export const GAP = .12;

export interface Point { x: number; y: number }

export interface Seat extends Point {
    playerId: number;
    /** Width of a card of this hand */
    cw: number;
    /** Extra rows (penalty cards) grow upwards: only the hand at the bottom of the screen */
    growUp: boolean;
    avatar: Point & { r: number };
    label: 'right' | 'below';
    /** Where this player holds the card he drew */
    held: Point & { cw: number };
    /** Where messages about this player pop up */
    chip: Point;
}

export interface Layout {
    w: number;
    h: number;
    portrait: boolean;
    /** Scale of texts and buttons */
    ui: number;
    table: TableShape;
    /** By player id */
    seats: Map<number, Seat>;
    deck: Point;
    discard: Point;
    pileW: number;
    banner: Point & { maxW: number };
    buttons: Point & { vertical: boolean };
    /** Columns of a hand (cards per player / 2) */
    cols: number;
}

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const handW = (cw: number, cols: number) => cols * cw + (cols - 1) * cw * GAP;
export const handH = (cw: number, rows = 2) => rows * cw * RATIO + (rows - 1) * cw * GAP;

/**
 * @param order player ids, this device's player first, then clockwise
 */
export function computeLayout(w: number, h: number, top: number, order: number[], cardsPerPlayer: number): Layout {
    const pad = 12;
    const cols = Math.ceil(cardsPerPlayer / 2);
    const portrait = h > w * 1.05;
    const ui = clamp(Math.min(w, h) / 640, .85, 1.3);
    const n = order.length;
    const others = order.slice(1);
    const seats = new Map<number, Seat>();
    const width = (cw: number) => handW(cw, cols);

    if (portrait) {
        const my = clamp(Math.min(w * .6 / (cols * 1.12), (h - top) * .105), 40, 110);
        const k = others.length;
        const rows = k <= 3 ? 1 : 2;
        const topCount = rows === 1 ? k : Math.ceil(k / 2);
        const lowCount = k - topCount;
        const perRow = Math.max(topCount, lowCount ? lowCount + 1 : 0);
        const slotW = (w - 2 * pad) / perRow;
        const opp = clamp(Math.min(my * .62, slotW / (cols * 1.12 + .3)), 18, 64);
        const r = clamp(opp * .42, 11, 20);
        const oppH = handH(opp);
        const topY = top + r * 2 + 10 + oppH / 2;
        const arc = rows === 1 ? Math.max(30, h * .05) : Math.max(16, h * .025);
        const lowY = topY + arc + oppH + 2 * r + 16;
        const myY = h - pad - handH(my) / 2;
        const myTop = myY - handH(my) / 2;
        const place = (id: number, x: number, y: number) => seats.set(id, {
            playerId: id, x, y, cw: opp, growUp: false,
            avatar: {x: x - width(opp) / 2 + r, y: y - oppH / 2 - r - 6, r}, label: 'right',
            held: {x: 0, y: 0, cw: opp * 1.05},
            // Over the cards of the player (the space under the hand is taken by the instructions)
            chip: {x, y: y + oppH * .2},
        });
        // Top row, left to right, a little lower on the sides (an arc around the table)
        const topRow = others.slice(Math.floor(lowCount / 2), Math.floor(lowCount / 2) + topCount);
        const topSlot = (w - 2 * pad) / Math.max(1, topRow.length);
        topRow.forEach((id, i) => {
            const x = pad + topSlot * (i + .5);
            const spread = topRow.length > 1 ? (i / (topRow.length - 1)) * 2 - 1 : 0;
            place(id, x, topY + arc * spread * spread);
        });
        // Lower row: the first players on the left (inner first), the last ones on the right (outer first)
        const left = others.slice(0, Math.floor(lowCount / 2));
        const right = others.slice(Math.floor(lowCount / 2) + topCount);
        left.forEach((id, j) => place(id, pad + slotW * (left.length - 1 - j + .5), lowY));
        right.forEach((id, j) => place(id, w - pad - slotW * (j + .5), lowY));

        const oppBottom = Math.max(...[...seats.values()].map(s => s.y + oppH / 2), top + 60);
        const pileW = clamp(my * .88, 36, (myTop - oppBottom) / RATIO * .42);
        const pilesY = oppBottom + (myTop - oppBottom) * .38;
        seats.set(order[0], {
            playerId: order[0], x: w / 2, y: myY, cw: my, growUp: true,
            avatar: {x: Math.max(pad + 24, w / 2 - width(my) / 2 - 34), y: myY - handH(my) * .1, r: 22}, label: 'below',
            held: {x: w / 2, y: Math.min(pilesY + pileW * RATIO / 2 + my * 1.05 * RATIO / 2 + 12, myTop - 10), cw: my * 1.05},
            chip: {x: w / 2, y: myTop - 22},
        });
        const table = {cx: w / 2, cy: (top + h) / 2, rx: w * .5 + 6, ry: (h - top) * .47};
        for (const id of others) {
            const seat = seats.get(id)!;
            seat.held = {x: seat.x + (table.cx - seat.x) * .4, y: seat.y + (pilesY - seat.y) * .55, cw: opp * 1.05};
        }
        return {
            w, h, portrait, ui, table, seats, pileW, cols,
            deck: {x: w / 2 - pileW * .72, y: pilesY},
            discard: {x: w / 2 + pileW * .72, y: pilesY},
            banner: {x: w / 2, y: pilesY - pileW * RATIO / 2 - 24, maxW: w - 24},
            buttons: {x: w / 2, y: myTop - 32, vertical: false},
        };
    }

    // Landscape: around the oval
    const my = clamp(Math.min((h - top) * .15, w * .075 * 2 / cols), 34, 100);
    const table = {cx: w / 2, cy: (top + h) / 2 + 4, rx: w * .48, ry: (h - top) * .5};
    const ex = table.rx * .78, ey = table.ry * .7;
    // Two neighbours on the side of the table must not overlap: hands no taller than the space between them
    const between = ey * 2 * Math.sin(Math.PI / n) - 18;
    const opp = Math.max(18, Math.min(my * (n <= 4 ? .66 : n <= 6 ? .56 : .46), between / (2 * RATIO + GAP)));
    const pileW = my * .9;
    const r = clamp(opp * .4, 12, 20);
    const myY = h - pad - handH(my) / 2;
    const myTop = myY - handH(my) / 2;
    const oppH = handH(opp);
    let upper = top + 40;
    others.forEach((id, i) => {
        const angle = Math.PI / 2 + (i + 1) * 2 * Math.PI / n;
        let x = table.cx + ex * Math.cos(angle);
        let y = table.cy + ey * Math.sin(angle);
        // Keep the hands inside the screen
        x = clamp(x, pad + width(opp) / 2 + (Math.cos(angle) < -.5 ? 0 : 0), w - pad - width(opp) / 2);
        y = clamp(y, top + 4 + oppH / 2, h - pad - oppH / 2);
        const highUp = y - oppH / 2 - 2 * r - 8 < top;
        const avatar = highUp
            ? {x: x - width(opp) / 2 - r - 16, y: y - 8, r}
            : {x: x - width(opp) / 2 + r, y: y - oppH / 2 - r - 6, r};
        // Seats right above the piles push them down
        if (y < table.cy && Math.abs(x - table.cx) < width(opp) / 2 + pileW * 1.8) upper = Math.max(upper, y + oppH / 2);
        seats.set(id, {
            playerId: id, x, y, cw: opp, growUp: false, avatar, label: highUp ? 'below' : 'right',
            held: {x: x + (table.cx - x) * .35, y: y + (table.cy - y) * .35, cw: opp * 1.05},
            chip: highUp ? {x: x + width(opp) / 2 + 100, y} : {x, y: y + oppH / 2 + 16},
        });
    });
    const pilesY = (upper + myTop) / 2;
    seats.set(order[0], {
        playerId: order[0], x: w / 2, y: myY, cw: my, growUp: true,
        avatar: {x: w / 2 - width(my) / 2 - 40, y: myY - 10, r: 22}, label: 'below',
        held: {x: w / 2 + pileW * .72 + pileW * 1.9, y: pilesY, cw: my},
        chip: {x: w / 2, y: myTop - 20},
    });
    return {
        w, h, portrait, ui, table, seats, pileW, cols,
        deck: {x: w / 2 - pileW * .72, y: pilesY},
        discard: {x: w / 2 + pileW * .72, y: pilesY},
        banner: {x: w / 2, y: top / 2, maxW: Math.max(240, w - 300)},
        buttons: {x: w / 2 + width(my) / 2 + 96, y: myY, vertical: true},
    };
}

/** Place of a card in a hand: rows of `cols` cards, holes keep their place */
export function slot(seat: Seat, index: number, length: number, cols: number): Point {
    const rows = Math.max(2, Math.ceil(length / cols));
    const col = index % cols;
    const row = Math.floor(index / cols);
    const step = seat.cw * (1 + GAP);
    const stepY = seat.cw * (RATIO + GAP);
    const x = seat.x - handW(seat.cw, cols) / 2 + seat.cw / 2 + col * step;
    // The first two rows stay in place, extra rows go away from the table centre
    const firstY = seat.y - handH(seat.cw) / 2 + seat.cw * RATIO / 2 - (seat.growUp ? (rows - 2) * stepY : 0);
    return {x, y: firstY + row * stepY};
}

/** Stable small random number for a card (tilt, position on the discard pile) */
export function jitter(id: string, salt = 0): number {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    return ((h >>> 0) % 1000) / 1000 - .5;
}
