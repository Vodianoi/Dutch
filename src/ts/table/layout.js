import { CH, CW } from './size.js';
/**
 *  Where everything goes on the screen, for 2 to 10 players and 3 to 6 cards each.
 *  - The player of this device sits at the bottom, the others clockwise in turn order
 *  - Phone held upright: regions from top to bottom (opponents, piles, buttons, own hand)
 *  - Landscape: the others around the oval table
 *  Sizes are the largest ones where nothing overlaps (checked by test/layout.test.mjs).
 *  Every hand has a fixed box: penalty cards (extra rows) make its cards smaller instead of overflowing.
 */
export const RATIO = CH / CW;
export const GAP = .12;
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const handW = (cw, cols) => cols * cw + (cols - 1) * cw * GAP;
export const handH = (cw, rows = 2) => rows * cw * RATIO + (rows - 1) * cw * GAP;
const overlaps = (a, b, margin = 0) => a.x1 < b.x2 + margin && b.x1 < a.x2 + margin && a.y1 < b.y2 + margin && b.y1 < a.y2 + margin;
/** Width of the name next to a token */
const labelWidth = (ui) => 72 * ui;
/**
 * @param order player ids, this device's player first, then clockwise
 */
export function computeLayout(w, h, top, order, cardsPerPlayer) {
    const cols = Math.ceil(cardsPerPlayer / 2);
    const portrait = h > w * 1.05;
    const ui = clamp(Math.min(w, h) / 640, .85, 1.3);
    return portrait ? portraitLayout(w, h, top, order, cols, ui) : landscapeLayout(w, h, top, order, cols, ui);
}
/** Own seat: hand at the bottom, token on its left with the name under it */
function ownSeat(id, w, y, my, cols, ui) {
    const hw = handW(my, cols), hh = handH(my);
    const r = 22;
    const ax = Math.max(12 + r + 8, w / 2 - hw / 2 - r - 14);
    return {
        playerId: id, x: w / 2, y, cw: my, growUp: true,
        avatar: { x: ax, y: y - hh * .1, r }, label: 'below', labelW: Math.min(labelWidth(ui) * 1.2, (w / 2 - hw / 2 - 8) * 2),
        held: { x: 0, y: 0, cw: my }, chip: { x: w / 2, y: y - hh / 2 - 22 },
        block: { x1: w / 2 - hw / 2, y1: y - hh / 2, x2: w / 2 + hw / 2, y2: y + hh / 2 },
    };
}
function piles(cx, cy, pileW, heldW) {
    // Draw pile, discard pile and the card being held, side by side
    const gap = pileW * .3;
    const total = pileW * 2 + gap * 2 + heldW;
    const x0 = cx - total / 2;
    return {
        deck: { x: x0 + pileW / 2, y: cy },
        discard: { x: x0 + pileW * 1.5 + gap, y: cy },
        held: { x: x0 + pileW * 2 + gap * 2 + heldW / 2, y: cy },
        rect: { x1: x0 - 6, y1: cy - pileW * RATIO * .6, x2: x0 + total + 6, y2: cy + pileW * RATIO * .5 + 22 },
    };
}
function portraitLayout(w, h, top, order, cols, ui) {
    // More rows give each opponent more width: keep the number of rows with the biggest cards
    const k = order.length - 1;
    const options = [1, 2, 3].filter(rows => rows === 1 ? k <= 3 : rows <= Math.max(1, Math.ceil(k / 2)));
    let best = null;
    for (const rows of options) {
        const layout = portraitRows(w, h, top, order, cols, ui, rows);
        const score = (l) => (l.seats.get(order[1])?.cw ?? 0) + l.seats.get(order[0]).cw * .35;
        if (!best || score(layout) > score(best) + .5)
            best = layout;
    }
    return best;
}
function portraitRows(w, h, top, order, cols, ui, rows) {
    const pad = 12;
    const others = order.slice(1);
    const k = others.length;
    // Top row in the middle, lower rows on the sides with an empty middle (the players sit around the table)
    let perRow = Math.max(1, Math.ceil(k / rows));
    const lowTotal = () => Math.max(0, k - perRow);
    const leftCount = () => Math.floor(lowTotal() / 2);
    const fits = () => rows === 1 || Math.ceil(leftCount() / (rows - 1)) + Math.ceil((lowTotal() - leftCount()) / (rows - 1)) <= perRow - 1 + (lowTotal() ? 0 : 1);
    while (!fits())
        perRow++;
    const topCount = Math.min(k, perRow);
    const slotW = (w - 2 * pad) / perRow;
    const buttonsH = 56 * ui;
    const bannerH = 50;
    // Largest scale where every region fits in the height
    const sizes = (s) => {
        const my = Math.min(w * .6 / (cols * (1 + GAP)), 112, (w - 2 * (pad + 72)) / (cols * (1 + GAP) - GAP)) * s;
        const opp = Math.min(my * .64, (slotW - 10) / (cols * (1 + GAP) - GAP), 66 * s);
        const r = clamp(opp * .42, 11, 18);
        const blockH = 2 * r + 6 + handH(opp);
        const arc = rows === 1 && k > 1 ? Math.min(40, h * .04) : 0;
        const pileW = clamp(my * .82, 30, 92);
        const centerH = bannerH + pileW * RATIO + 26;
        const total = top + 6 + rows * blockH + (rows - 1) * 8 + arc + centerH + buttonsH + handH(my) + pad;
        return { my, opp, r, blockH, arc, pileW, centerH, total };
    };
    let lo = .2, hi = 1;
    if (sizes(1).total <= h)
        lo = 1;
    else
        for (let i = 0; i < 18; i++) {
            const mid = (lo + hi) / 2;
            if (sizes(mid).total <= h)
                lo = mid;
            else
                hi = mid;
        }
    const { my, opp, r, blockH, arc, pileW, total } = sizes(lo);
    // Space left: shared between the regions
    const spare = Math.max(0, h - total) / 4;
    const seats = new Map();
    const oppH = handH(opp), oppW = handW(opp, cols);
    const labelW = Math.max(oppW - 2 * r - 8, Math.min(labelWidth(ui), slotW - 2 * r - 14));
    const firstTop = top + 6 + spare * .5;
    const place = (id, x, blockTop) => {
        const y = blockTop + 2 * r + 6 + oppH / 2;
        seats.set(id, {
            playerId: id, x, y, cw: opp, growUp: false,
            avatar: { x: x - oppW / 2 + r, y: blockTop + r, r }, label: 'right', labelW,
            // Holding a card: over his own hand
            held: { x, y: y - oppH * .08, cw: opp * 1.12 },
            // Over the cards of the player (the space under the hand is the next region)
            chip: { x, y: y + oppH * .2 },
            block: { x1: x - oppW / 2, y1: blockTop, x2: Math.max(x + oppW / 2, x - oppW / 2 + 2 * r + 8 + labelW), y2: blockTop + blockH },
        });
    };
    const rowTop = (row) => firstTop + row * (blockH + 8) + (row ? arc : 0);
    const slotX = (j) => pad + slotW * (j + .5);
    // Clockwise from the own seat: up the left side (lowest row first, inner seat first), across the top row,
    // down the right side (outer seat first)
    const left = others.slice(0, leftCount());
    const topRow = others.slice(left.length, left.length + topCount);
    const right = others.slice(left.length + topCount);
    const lower = rows - 1;
    const perLeft = lower ? Math.ceil(left.length / lower) : 0;
    const perRight = lower ? Math.ceil(right.length / lower) : 0;
    left.forEach((id, i) => {
        const row = rows - 1 - Math.floor(i / perLeft);
        const inRow = Math.min(perLeft, left.length - Math.floor(i / perLeft) * perLeft);
        place(id, slotX(inRow - 1 - (i % perLeft)), rowTop(row));
    });
    const topSlot = (w - 2 * pad) / Math.max(1, topRow.length);
    topRow.forEach((id, i) => {
        const spread = topRow.length > 1 ? (i / (topRow.length - 1)) * 2 - 1 : 0;
        place(id, pad + topSlot * (i + .5), firstTop + arc * spread * spread);
    });
    right.forEach((id, i) => {
        const row = 1 + Math.floor(i / perRight);
        place(id, slotX(perRow - 1 - (i % perRight)), rowTop(row));
    });
    const oppBottom = Math.max(top, ...[...seats.values()].map(s => s.block.y2));
    const centerTop = oppBottom + spare;
    const pilesY = centerTop + bannerH + pileW * RATIO / 2;
    const heldW = Math.min(my, (w - 2 * pad - pileW * 2.6) - 8);
    const center = piles(w / 2, pilesY, pileW, heldW);
    const myY = h - pad - handH(my) / 2 - spare * .5;
    const me = ownSeat(order[0], w, myY, my, cols, ui);
    me.held = { ...center.held, cw: heldW };
    // Own messages: in the gap between the piles and the buttons (never on the buttons)
    me.chip = { x: w / 2, y: (center.rect.y2 + me.block.y1 - buttonsH) / 2 };
    seats.set(order[0], me);
    const buttonsY = me.block.y1 - buttonsH / 2 - 2;
    return {
        w, h, portrait: true, ui, seats, pileW, cols,
        table: { cx: w / 2, cy: (top + h) / 2, rx: w * .5 + 6, ry: (h - top) * .47 },
        deck: center.deck, discard: center.discard,
        banner: { x: w / 2, y: centerTop + bannerH / 2, maxW: w - 24 },
        buttons: { x: w / 2, y: buttonsY, vertical: false, scale: ui },
        zones: [
            { name: 'piles', rect: center.rect },
            { name: 'banner', rect: { x1: 12, y1: centerTop + 2, x2: w - 12, y2: centerTop + bannerH - 2 } },
            { name: 'buttons', rect: { x1: 12, y1: buttonsY - buttonsH / 2 + 4, x2: w - 12, y2: buttonsY + buttonsH / 2 - 4 } },
        ],
        cramped: false,
    };
}
function landscapeLayout(w, h, top, order, cols, ui) {
    const pad = 12;
    const n = order.length;
    const others = order.slice(1);
    const table = { cx: w / 2, cy: (top + h) / 2 + 4, rx: w * .48, ry: (h - top) * .5 };
    const buttonsW = 180 * ui;
    // Own hand, then the opponents around and the centre (piles, then the held card or the buttons)
    const attempt = (my, opp) => {
        const myY = h - pad - handH(my) / 2;
        const me = ownSeat(order[0], w, myY, my, cols, ui);
        const r = clamp(opp * .42, 12, 20);
        const oppW = handW(opp, cols), oppH = handH(opp);
        const labelW = Math.max(oppW - 2 * r - 8, labelWidth(ui) * (n > 6 ? .8 : 1));
        // Seat at the top of the table: token on the left of the hand (saves height); elsewhere above it
        const sideW = Math.max(oppW, 2 * r + 8 + labelW), sideH = 2 * r + 6 + oppH;
        const avatarCol = Math.max(2 * r, labelW * .85) + 10;
        const topW = oppW + avatarCol, topH = Math.max(oppH, 2 * r + 6 + 30 * ui);
        const cy = top + (h - top) / 2;
        const blocks = [];
        const seats = [];
        others.forEach((id, i) => {
            const angle = Math.PI / 2 + (i + 1) * 2 * Math.PI / n;
            const atTop = Math.sin(angle) < -.92;
            const bw = atTop ? topW : sideW, bh = atTop ? topH : sideH;
            const ex = w / 2 - pad - bw / 2, ey = (h - top) / 2 - bh / 2 - 4;
            const bx = w / 2 + ex * Math.cos(angle), by = cy + ey * Math.sin(angle);
            const block = { x1: bx - bw / 2, y1: by - bh / 2, x2: bx + bw / 2, y2: by + bh / 2 };
            blocks.push(block);
            if (atTop) {
                const x = block.x2 - oppW / 2, y = block.y1 + oppH / 2;
                seats.push({
                    playerId: id, x, y, cw: opp, growUp: false,
                    avatar: { x: block.x1 + avatarCol / 2 - 5, y: block.y1 + r + 2, r }, label: 'below', labelW: avatarCol - 6,
                    held: { x, y: y - oppH * .08, cw: opp * 1.12 },
                    chip: { x, y: y + oppH * .2 },
                    block,
                });
            }
            else {
                // Token at the left edge, the name after it, the hand under them from the same edge
                const x = block.x1 + oppW / 2, y = block.y1 + 2 * r + 6 + oppH / 2;
                seats.push({
                    playerId: id, x, y, cw: opp, growUp: false,
                    avatar: { x: x - oppW / 2 + r, y: block.y1 + r, r }, label: 'right', labelW,
                    held: { x, y: y - oppH * .08, cw: opp * 1.12 },
                    chip: { x, y: y + oppH * .2 },
                    block,
                });
            }
        });
        // Own area: hand, token and name
        const mine = { x1: me.avatar.x - me.labelW / 2, y1: me.block.y1, x2: me.block.x2, y2: h };
        // Centre: between the seats above it and the own hand
        const groupW = (pile) => pile * 2.6 + Math.max(my, buttonsW) + 12;
        const above = (pile) => blocks.filter(b => b.y2 < cy + 10 && b.x1 < w / 2 + groupW(pile) / 2 && b.x2 > w / 2 - groupW(pile) / 2);
        const upper = Math.max(top + 4, ...above(my).map(b => b.y2));
        const space = me.block.y1 - upper;
        const pileW = Math.max(24, Math.min(my * .9, 96, (space - 34) / (RATIO * 1.1)));
        const pilesY = upper + 6 + (space - 22) / 2;
        const center = piles(w / 2, pilesY, pileW, Math.max(my, buttonsW));
        let ok = (space - 34) / (RATIO * 1.1) >= 24;
        for (let i = 0; ok && i < blocks.length; i++) {
            const b = blocks[i];
            if (b.x1 < 0 || b.x2 > w || b.y1 < top || b.y2 > h)
                ok = false;
            if (overlaps(b, mine, 4) || overlaps(b, center.rect, 4))
                ok = false;
            for (let j = i + 1; ok && j < blocks.length; j++)
                if (overlaps(b, blocks[j], 6))
                    ok = false;
        }
        return { ok, me, seats, center, pileW };
    };
    const build = (my, opp) => {
        const best = attempt(my, opp);
        const seats = new Map(best.seats.map(s => [s.playerId, s]));
        best.me.held = { x: best.center.held.x - Math.max(my, buttonsW) / 2 + my / 2, y: best.center.held.y, cw: my };
        seats.set(order[0], best.me);
        const zone = { x1: best.center.held.x - Math.max(my, buttonsW) / 2, x2: best.center.held.x + Math.max(my, buttonsW) / 2 };
        const centerH = best.center.rect.y2 - best.center.rect.y1;
        return {
            w, h, portrait: false, ui, table, seats, pileW: best.pileW, cols,
            deck: best.center.deck, discard: best.center.discard,
            banner: { x: w / 2, y: top / 2, maxW: Math.max(240, w - 2 * (top + 220)) },
            // Buttons where the held card goes (never both at once), smaller if the centre is low
            buttons: { x: (zone.x1 + zone.x2) / 2, y: best.center.held.y, vertical: true, scale: Math.min(ui, centerH / 112) },
            zones: [{ name: 'centre', rect: best.center.rect }],
            cramped: !best.ok,
        };
    };
    // Own cards as big as the height allows; opponents the biggest that fit; own cards smaller if they get too small
    let my = clamp(Math.min((h - top) * .18, w * .17 / cols), 30, 104);
    let last = { my, opp: 14 };
    for (let tries = 0; tries < 14; tries++) {
        const maxOpp = my * (n <= 4 ? .7 : n <= 6 ? .6 : .52);
        let lo = 0, hi = maxOpp;
        if (attempt(my, 14).ok) {
            lo = 14;
            for (let i = 0; i < 14; i++) {
                const mid = (lo + hi) / 2;
                if (attempt(my, mid).ok)
                    lo = mid;
                else
                    hi = mid;
            }
            last = { my, opp: lo };
            if (lo >= Math.min(maxOpp * .8, 22))
                return build(my, lo);
        }
        if (my <= 34)
            break;
        my *= .92;
    }
    return build(last.my, last.opp);
}
/** Width of the cards of a hand: smaller when penalty cards add rows */
export function cardWidth(seat, length, cols) {
    const rows = Math.max(2, Math.ceil(length / cols));
    return Math.min(seat.cw, handH(seat.cw) / (rows * RATIO + (rows - 1) * GAP));
}
/** Place of a card in a hand: rows of `cols` cards, holes keep their place, inside the box of the hand */
export function slot(seat, index, length, cols) {
    const cw = cardWidth(seat, length, cols);
    const col = index % cols;
    const row = Math.floor(index / cols);
    const rows = Math.max(2, Math.ceil(length / cols));
    const x = seat.x - handW(cw, cols) / 2 + cw / 2 + col * cw * (1 + GAP);
    // The box keeps its place: the bottom hand is anchored at the bottom, the others at the top
    const boxTop = seat.y - handH(seat.cw) / 2;
    const top = seat.growUp ? boxTop + handH(seat.cw) - handH(cw, rows) : boxTop;
    return { x, y: top + cw * RATIO / 2 + row * cw * (RATIO + GAP) };
}
/** Stable small random number for a card (tilt, position on the discard pile) */
export function jitter(id, salt = 0) {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < id.length; i++)
        h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    return ((h >>> 0) % 1000) / 1000 - .5;
}
