/**
 *  The two versions of the 3D table, in metres (the top of the table is at height 0, this device's player sits at +z):
 *  - `mobile` (screen held upright): the player sits at the head of a long table and looks down at his own cards,
 *    close and big; the others sit around the far end
 *  - `desktop` (wide screen): an oval table seen from above the player's shoulder, everybody around it
 *  No rendering here: only where things are, so that it can be checked without a browser.
 */
/** A playing card (poker size) */
export const CARD_W = .064;
export const CARD_H = CARD_W * 1.4;
/** A little thicker than a real card, so that its edge shows */
export const CARD_T = .0007;
/** Between two cards of a hand */
export const GAP = .008;
/** Width of the wooden rim around the cloth */
export const RIM = .07;
/** From the edge of the cloth to the cards */
const EDGE = .016;
/** A hand is two rows deep; penalty cards add rows that overlap */
export const HAND_D = 2 * CARD_H + GAP;
export const handW = (cols) => cols * CARD_W + (cols - 1) * GAP;
/** Screens held upright get the seated view, the others the oval table */
export function pickRig(width, height) {
    return height > width * 1.08 ? 'mobile' : 'desktop';
}
/**
 *  A rounded rectangle walked from the middle of its near side (z = +b), first towards -x:
 *  clockwise for the player looking at the table from +z.
 */
export function pathAt(a, b, r, s) {
    const sa = a - r, sb = b - r, arc = Math.PI * r / 2;
    const total = 4 * sa + 4 * sb + 4 * arc;
    let d = ((s % total) + total) % total;
    const point = (x, z, nx, nz, curved) => ({ x, z, nx, nz, s, curved });
    const corner = (cx, cz, from) => {
        const angle = from + d / r;
        const nx = Math.cos(angle), nz = Math.sin(angle);
        return point(cx + nx * r, cz + nz * r, nx, nz, true);
    };
    if (d < sa)
        return point(-d, b, 0, 1, false);
    d -= sa;
    if (d < arc)
        return corner(-sa, sb, Math.PI / 2);
    d -= arc;
    if (d < 2 * sb)
        return point(-a, sb - d, -1, 0, false);
    d -= 2 * sb;
    if (d < arc)
        return corner(-sa, -sb, Math.PI);
    d -= arc;
    if (d < 2 * sa)
        return point(-sa + d, -b, 0, -1, false);
    d -= 2 * sa;
    if (d < arc)
        return corner(sa, -sb, Math.PI * 1.5);
    d -= arc;
    if (d < 2 * sb)
        return point(a, -sb + d, 1, 0, false);
    d -= 2 * sb;
    if (d < arc)
        return corner(sa, sb, 0);
    d -= arc;
    return point(sa - d, b, 0, 1, false);
}
export function pathLength(a, b, r) {
    return 4 * (a - r) + 4 * (b - r) + 2 * Math.PI * r;
}
/** Points of the rounded rectangle, evenly spaced, about `step` apart */
export function outline(a, b, r, step = .012) {
    const total = pathLength(a, b, r);
    const count = Math.max(24, Math.ceil(total / step));
    return Array.from({ length: count }, (_, i) => pathAt(a, b, r, i * total / count));
}
// endregion
// region Hands
/**
 *  Place of a card in a hand: rows of `cols` cards, the first row away from the player.
 *  A hole keeps its place. More than two rows (penalty cards): the rows overlap, each one over the row before,
 *  so that the hand keeps its room on the table and the cards their size.
 */
export function slotOf(seat, index, length, cols) {
    const rows = Math.max(2, Math.ceil(length / cols));
    const pitch = Math.min(CARD_H + GAP, (HAND_D - CARD_H) / (rows - 1));
    const col = index % cols, row = Math.floor(index / cols);
    const u = (col - (cols - 1) / 2) * (CARD_W + GAP);
    const v = -(HAND_D - CARD_H) / 2 + row * pitch;
    const cos = Math.cos(seat.yaw), sin = Math.sin(seat.yaw);
    return { x: seat.x + u * cos + v * sin, z: seat.z - u * sin + v * cos, layer: rows > 2 ? row : 0 };
}
/**
 * @param edge from the hand to the edge of the cloth
 */
function seat(id, x, z, yaw, own, edge = EDGE) {
    const out = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const toRim = HAND_D / 2 + edge + RIM / 2;
    return {
        id, own, x, z, yaw, out,
        token: { x: x + out.x * toRim, z: z + out.z * toRim },
        chair: { x: x + out.x * (toRim + RIM / 2 + .4), z: z + out.z * (toRim + RIM / 2 + .4) },
    };
}
/** Corners of every hand and every token: what a camera has to show */
function seen(seats, cols) {
    const points = [];
    const w = handW(cols) / 2, d = HAND_D / 2;
    for (const s of seats) {
        const cos = Math.cos(s.yaw), sin = Math.sin(s.yaw);
        for (const [u, v] of [[-w, -d], [w, -d], [w, d], [-w, d]])
            points.push([s.x + u * cos + v * sin, 0, s.z - u * sin + v * cos]);
        points.push([s.token.x, .012, s.token.z]);
        // The name plate of the others sits beyond their token
        if (!s.own)
            points.push([s.token.x + s.out.x * .042, .012, s.token.z + s.out.z * .042]);
    }
    return points;
}
// endregion
// region Plans
/**
 * @param order player ids, this device's player first, then clockwise
 */
export function makePlan(rig, order, cardsPerPlayer) {
    const cols = Math.ceil(cardsPerPlayer / 2);
    return rig === 'mobile' ? seatedPlan(order, cols) : ovalPlan(order, cols);
}
/**
 *  Wide screens: an oval table (a circle up to three players), everybody evenly around it.
 *  Hands need more room on the round ends, where they point to the middle, than on the straight sides.
 */
function ovalPlan(order, cols) {
    const n = order.length;
    const w = handW(cols);
    // Deep enough for: this device's hand, the turn buttons, the piles, the hand opposite.
    // On the round ends the corners of a hand come close to the rim: a wide hand sits a little further in.
    let edge = EDGE, b = 0;
    for (let i = 0; i < 6; i++) {
        b = HAND_D + .1 + edge;
        edge = Math.max(EDGE, b - Math.sqrt((b - .008) ** 2 - (w / 2) ** 2));
    }
    const inset = edge + HAND_D / 2;
    const rho = b - inset;
    const onCurve = rho * (w * 1.12) / (rho - HAND_D / 2);
    const onStraight = w * 1.3;
    // From four players on, the table is at least a little longer than deep: the players on the sides
    // leave the middle free for the piles, the turn buttons and a card held up
    const straight = Math.max(n >= 4 ? .05 : 0, (n - 2 * Math.PI * rho / onCurve) * onStraight / 4 * 1.04);
    const a = b + straight;
    // Walk the line of the hands, counting room in seats
    const ta = a - inset, tb = b - inset, tr = rho;
    const total = pathLength(ta, tb, tr);
    const steps = 1440;
    const room = [0];
    for (let i = 0; i < steps; i++) {
        const p = pathAt(ta, tb, tr, (i + .5) * total / steps);
        room.push(room[i] + total / steps / (p.curved ? onCurve : onStraight));
    }
    const seats = new Map();
    order.forEach((id, k) => {
        const wanted = k * room[steps] / n;
        let i = 0;
        while (i < steps && room[i + 1] < wanted)
            i++;
        const part = room[i + 1] > room[i] ? (wanted - room[i]) / (room[i + 1] - room[i]) : 0;
        const p = pathAt(ta, tb, tr, (i + part) * total / steps);
        if (k === 0)
            seats.set(id, seat(id, 0, tb, 0, true, edge));
        else
            seats.set(id, seat(id, p.x, p.z, Math.atan2(p.nx, p.nz), false, edge));
    });
    const ownEdge = b - edge - HAND_D;
    const pilesZ = ownEdge - .069 - CARD_H / 2;
    const mustSee = seen(seats.values(), cols);
    for (const p of outline(a, b, b, .08))
        mustSee.push([p.x, 0, p.z]);
    return {
        rig: 'desktop', a, b, r: b, cols, seats,
        deck: { x: -(CARD_W / 2 + .013), z: pilesZ },
        discard: { x: CARD_W / 2 + .013, z: pilesZ },
        buttons: { x: 0, z: ownEdge - .033 },
        mustSee, pitch: 50, pitchMin: 40, fov: 34, align: .5,
    };
}
/**
 *  Screens held upright: this device's player at the head of a long table. From his chair he sees his own cards
 *  just under his eyes, then the turn buttons, the piles, and the others around the far end:
 *  up to three side by side at the end, the next ones face to face along the sides.
 */
function seatedPlan(order, cols) {
    const others = order.length - 1;
    const w = handW(cols);
    const between = .03;
    const endMax = Math.max(1, Math.floor((.5 + between) / (w + between)));
    const perSide = others > endMax ? Math.ceil((others - endMax) / 2) : 0;
    const atEnd = others - 2 * perSide;
    const rowW = atEnd > 0 ? atEnd * w + (atEnd - 1) * between : 0;
    const a = Math.max(rowW / 2 + .04, perSide ? HAND_D + EDGE + .035 : 0, w / 2 + .1, .21);
    // Distances from the near edge of the cloth
    const buttonsU = EDGE + HAND_D + .038;
    const pilesU = EDGE + HAND_D + .078 + CARD_H / 2;
    const sideU = pilesU + CARD_H / 2 + .05;
    const sideEnd = sideU + perSide * (w + between);
    const endU = sideEnd + (perSide ? 0 : .012) + HAND_D / 2;
    const length = (atEnd > 0 ? endU + HAND_D / 2 : sideEnd - between) + EDGE + .004;
    const b = length / 2;
    const z = (u) => b - u;
    const seats = new Map();
    seats.set(order[0], seat(order[0], 0, z(EDGE + HAND_D / 2), 0, true));
    const sideX = a - EDGE - HAND_D / 2;
    for (let j = 0; j < others; j++) {
        const id = order[j + 1];
        if (j < perSide) {
            seats.set(id, seat(id, -sideX, z(sideU + w / 2 + j * (w + between)), -Math.PI / 2, false));
        }
        else if (j < perSide + atEnd) {
            const i = j - perSide;
            seats.set(id, seat(id, -rowW / 2 + w / 2 + i * (w + between), z(endU), Math.PI, false));
        }
        else {
            // Right side, from the far end back towards this device's player
            const k = perSide - 1 - (j - perSide - atEnd);
            seats.set(id, seat(id, sideX, z(sideU + w / 2 + k * (w + between)), Math.PI / 2, false));
        }
    }
    const mustSee = seen(seats.values(), cols);
    // Room on both sides of the own hand: the cards stay a comfortable size, never huge
    const side = Math.max(w / 2 + .02, .15);
    mustSee.push([-side, 0, z(EDGE)], [side, 0, z(EDGE)], [-side, 0, z(EDGE + HAND_D)], [side, 0, z(EDGE + HAND_D)]);
    return {
        rig: 'mobile', a, b, r: .07, cols, seats,
        deck: { x: -(CARD_W / 2 + .013), z: z(pilesU) },
        discard: { x: CARD_W / 2 + .013, z: z(pilesU) },
        buttons: { x: 0, z: z(buttonsU) },
        mustSee, pitch: 58, pitchMin: 42, fov: 62, align: 1,
    };
}
/**
 *  Where to put a camera that looks down by `pitch` so that every point is inside the picture, as big as possible.
 *  The camera only moves back and forth along its line of sight and up and down across it: the answer is exact.
 * @param aspect width / height of the picture
 * @param margin parts of the picture kept free: top, bottom (of its height), side (of its width)
 */
export function fitCamera(points, pitch, fov, aspect, margin, align) {
    const p = pitch * Math.PI / 180;
    const forward = [0, -Math.sin(p), -Math.cos(p)];
    const up = [0, Math.cos(p), -Math.sin(p)];
    const tan = Math.tan(fov * Math.PI / 360);
    const tx = tan * aspect * (1 - 2 * margin.side);
    const top = tan * (1 - 2 * margin.top);
    const bottom = -tan * (1 - 2 * margin.bottom);
    // Seen from a camera at the middle of the table: across, up, ahead
    const local = points.map(q => [q[0], q[1] * up[1] + q[2] * up[2], q[1] * forward[1] + q[2] * forward[2]]);
    const range = (d) => {
        let low = -Infinity, high = Infinity;
        for (const q of local) {
            low = Math.max(low, q[1] - top * (q[2] + d));
            high = Math.min(high, q[1] - bottom * (q[2] + d));
        }
        return [low, high];
    };
    let near = .05;
    for (const q of local)
        near = Math.max(near, Math.abs(q[0]) / tx - q[2], .05 - q[2]);
    let far = near + 30;
    const [low, high] = range(near);
    const tall = low > high;
    if (tall) {
        for (let i = 0; i < 40; i++) {
            const mid = (near + far) / 2;
            const [l, h] = range(mid);
            if (l > h)
                near = mid;
            else
                far = mid;
        }
        near = far;
    }
    const [l, h] = range(near);
    const shift = l + (h - l) * align;
    return { x: 0, y: -forward[1] * near + up[1] * shift, z: -forward[2] * near + up[2] * shift, tall, back: near };
}
// endregion
