// Table layout: nothing overlaps, for every number of players, cards per player, penalty rows and screen size
import test from 'node:test';
import assert from 'node:assert/strict';
import {cardWidth, computeLayout, RATIO, slot} from '../src/ts/table/layout.js';

const SIZES = [[360, 640], [390, 844], [430, 932], [640, 360], [844, 390], [768, 1024], [1024, 768], [1366, 768], [1920, 1080]];
const TOP = 44;

const hit = (a, b, margin = 1) => Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > margin && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > margin;

/** Everything drawn for one configuration, as rectangles */
function boxes(w, h, n, cards, extraRows) {
    const order = Array.from({length: n}, (_, i) => i);
    const lay = computeLayout(w, h, TOP, order, cards);
    const list = [];
    for (const [id, seat] of lay.seats) {
        const length = cards + extraRows * lay.cols;
        const cw = cardWidth(seat, length, lay.cols);
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (let i = 0; i < length; i++) {
            const s = slot(seat, i, length, lay.cols);
            x1 = Math.min(x1, s.x - cw / 2); x2 = Math.max(x2, s.x + cw / 2);
            y1 = Math.min(y1, s.y - cw * RATIO / 2); y2 = Math.max(y2, s.y + cw * RATIO / 2);
        }
        list.push({name: `hand ${id}`, owner: id, x1, y1, x2, y2});
        const a = seat.avatar;
        list.push(seat.label === 'right'
            ? {name: `name ${id}`, owner: id, x1: a.x - a.r, y1: a.y - a.r, x2: a.x + a.r + 8 + seat.labelW, y2: a.y + a.r}
            : {name: `name ${id}`, owner: id, x1: a.x - Math.max(a.r, seat.labelW / 2), y1: a.y - a.r, x2: a.x + Math.max(a.r, seat.labelW / 2), y2: a.y + a.r + 36 * lay.ui});
    }
    for (const zone of lay.zones) list.push({name: zone.name, owner: -1, ...zone.rect});
    return {lay, list};
}

test('the table layout: no overlap and nothing off the screen (2–10 players, 3–6 cards, penalty rows, 9 screen sizes)', () => {
    const problems = [];
    for (const [w, h] of SIZES) for (let n = 2; n <= 10; n++) for (const cards of [3, 4, 5, 6]) for (const extra of [0, 1, 2]) {
        const {lay, list} = boxes(w, h, n, cards, extra);
        // Too many players for a small screen held sideways: allowed, the table asks to hold the phone upright
        if (lay.cramped) {
            assert.ok(h < 400 && w > h, `${w}x${h} ${n}p ${cards}c: cramped`);
            continue;
        }
        for (const b of list) {
            if (b.x1 < -1 || b.x2 > w + 1 || b.y2 > h + 1 || b.y1 < TOP - 1) problems.push(`${w}x${h} ${n}p ${cards}c +${extra}: ${b.name} off screen`);
        }
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
            const A = list[i], B = list[j];
            if (A.owner === B.owner && A.owner >= 0) continue;
            if (A.owner === -1 && B.owner === -1) continue;
            if (hit(A, B)) problems.push(`${w}x${h} ${n}p ${cards}c +${extra}: ${A.name} × ${B.name}`);
        }
    }
    assert.deepEqual(problems.slice(0, 30), [], `${problems.length} problems`);
});

test('cards stay big enough to read and tap', () => {
    for (const [w, h] of SIZES) for (let n = 2; n <= 10; n++) {
        const {lay} = boxes(w, h, n, 4, 0);
        const me = lay.seats.get(0);
        // Landscape phones are low: own cards a bit smaller there
        assert.ok(me.cw >= (h < 400 ? 32 : 40), `${w}x${h} ${n}p: own cards ${me.cw.toFixed(0)}px`);
        for (const [id, seat] of lay.seats) if (id) assert.ok(seat.cw >= 14, `${w}x${h} ${n}p: player ${id} cards ${seat.cw.toFixed(0)}px`);
    }
});
