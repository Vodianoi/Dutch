// The 3D table: where the players sit and what the camera shows, in its two versions (upright and wide screens)
import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD_H, CARD_W, fitCamera, HAND_D, handW, makePlan, outline, pathAt, pathLength, pickRig, slotOf} from '../src/ts/scene3d/rig.js';

const RIGS = ['desktop', 'mobile'];
const order = n => Array.from({length: n}, (_, i) => i);

/** Corners of a hand on the table */
function corners(seat, cols, grow = 0) {
    const w = handW(cols) / 2 + grow, d = HAND_D / 2 + grow;
    const cos = Math.cos(seat.yaw), sin = Math.sin(seat.yaw);
    return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([u, v]) => [seat.x + u * cos + v * sin, seat.z - u * sin + v * cos]);
}

/** Do two boxes (lists of corners) overlap? Separating axis test */
function overlap(a, b) {
    for (const box of [a, b]) {
        for (let i = 0; i < 4; i++) {
            const [x1, z1] = box[i], [x2, z2] = box[(i + 1) % 4];
            const nx = z2 - z1, nz = x1 - x2;
            const span = points => {
                const along = points.map(([x, z]) => x * nx + z * nz);
                return [Math.min(...along), Math.max(...along)];
            };
            const [a1, a2] = span(a), [b1, b2] = span(b);
            if (a2 <= b1 || b2 <= a1) return false;
        }
    }
    return true;
}

/** Is a point on the cloth (a rounded rectangle)? */
function onCloth(plan, x, z, margin = 0) {
    const a = plan.a + margin, b = plan.b + margin, r = plan.r + margin;
    const dx = Math.abs(x) - (a - r), dz = Math.abs(z) - (b - r);
    if (dx <= 0) return Math.abs(z) <= b;
    if (dz <= 0) return Math.abs(x) <= a;
    return Math.hypot(dx, dz) <= r;
}

test('upright screens get the seated view, wide screens the oval table', () => {
    assert.equal(pickRig(390, 844), 'mobile');
    assert.equal(pickRig(820, 1180), 'mobile');
    assert.equal(pickRig(1440, 900), 'desktop');
    assert.equal(pickRig(844, 390), 'desktop');
    assert.equal(pickRig(1000, 1000), 'desktop');
});

test('the line around the table closes on itself and points outwards', () => {
    const a = .5, b = .3, r = .1;
    const total = pathLength(a, b, r);
    const start = pathAt(a, b, r, 0), end = pathAt(a, b, r, total - 1e-9);
    assert.ok(Math.hypot(start.x - end.x, start.z - end.z) < 1e-6);
    // Starts in front of this device's player, then goes towards -x: clockwise for the player at +z
    assert.ok(Math.abs(start.x) < 1e-12 && start.z === b && start.nz === 1);
    assert.ok(pathAt(a, b, r, .1).x < 0);
    let previous = null;
    for (const p of outline(a, b, r, .01)) {
        assert.ok(Math.abs(Math.hypot(p.nx, p.nz) - 1) < 1e-9);
        assert.ok(p.x * p.nx + p.z * p.nz > 0, 'outwards');
        if (previous) assert.ok(Math.hypot(p.x - previous.x, p.z - previous.z) < .011, 'no jump');
        previous = p;
    }
});

test('every player has his place: no hand over another, over the piles or off the cloth', () => {
    for (const rig of RIGS) {
        for (let n = 2; n <= 10; n++) {
            for (const cards of [3, 4, 5, 6]) {
                const plan = makePlan(rig, order(n), cards);
                const label = `${rig}, ${n} players, ${cards} cards`;
                assert.equal(plan.seats.size, n, label);
                assert.equal(plan.cols, Math.ceil(cards / 2));
                const seats = [...plan.seats.values()];
                const piles = [plan.deck, plan.discard].map(p => [[-1, -1], [1, -1], [1, 1], [-1, 1]]
                    .map(([u, v]) => [p.x + u * CARD_W / 2, p.z + v * CARD_H / 2]));
                seats.forEach((seat, i) => {
                    const box = corners(seat, plan.cols);
                    for (const [x, z] of box) assert.ok(onCloth(plan, x, z, 1e-6), `${label}: hand ${i} on the cloth`);
                    for (const pile of piles) assert.ok(!overlap(box, pile), `${label}: hand ${i} off the piles`);
                    for (let j = i + 1; j < n; j++) {
                        assert.ok(!overlap(corners(seat, plan.cols, .004), corners(seats[j], plan.cols, .004)), `${label}: hands ${i} and ${j} apart`);
                    }
                    // The token sits on the rim, in front of the player
                    assert.ok(!onCloth(plan, seat.token.x, seat.token.z), `${label}: token ${i} on the rim`);
                });
                assert.ok(!overlap(piles[0], piles[1]));
                // The turn buttons: between the piles and this device's hand
                const own = plan.seats.get(0);
                assert.ok(plan.buttons.z > plan.discard.z + CARD_H / 2 && plan.buttons.z < own.z - HAND_D / 2, `${label}: buttons`);
            }
        }
    }
});

test('this device\'s player sits at the bottom, the others clockwise in turn order', () => {
    for (const rig of RIGS) {
        for (let n = 2; n <= 10; n++) {
            // Player 3 looks at the table: he is first, then 4, 5… 0, 1, 2
            const ids = order(n);
            const viewer = Math.min(3, n - 1);
            const turn = [...ids.slice(viewer), ...ids.slice(0, viewer)];
            const plan = makePlan(rig, turn, 4);
            const own = plan.seats.get(viewer);
            assert.equal(own.yaw, 0, `${rig} ${n}`);
            assert.ok(own.own && [...plan.seats.values()].filter(seat => seat.own).length === 1);
            assert.ok(Math.abs(own.x) < 1e-9);
            for (const seat of plan.seats.values()) assert.ok(seat.z <= own.z + 1e-9, `${rig} ${n}: nobody nearer than this device's player`);
            // Clockwise seen from above with this device's player at the bottom: the angle around the table only grows
            const angles = turn.map(id => {
                const s = plan.seats.get(id);
                const angle = Math.atan2(-s.x, s.z - (rig === 'mobile' ? own.z : 0));
                return angle < -1e-9 ? angle + Math.PI * 2 : angle;
            });
            for (let i = 1; i < n; i++) assert.ok(angles[i] > angles[i - 1] - 1e-9, `${rig} ${n}: seat ${i} after seat ${i - 1} (${angles.map(a => a.toFixed(2))})`);
        }
    }
});

test('a card keeps its place in the hand; penalty cards overlap instead of pushing the hand out', () => {
    const plan = makePlan('desktop', order(4), 4);
    const seat = plan.seats.get(0);
    const four = [0, 1, 2, 3].map(i => slotOf(seat, i, 4, plan.cols));
    // Two rows of two: the first row away from the player, cards side by side
    assert.ok(four[0].z < four[2].z && Math.abs(four[0].x - four[2].x) < 1e-9);
    assert.ok(four[0].x < four[1].x && Math.abs(four[0].z - four[1].z) < 1e-9);
    assert.ok(four[1].x - four[0].x > CARD_W, 'no overlap in a row');
    assert.ok(four[2].z - four[0].z > CARD_H, 'no overlap between two rows');
    assert.ok(four.every(s => s.layer === 0));
    // The place of a card does not depend on the other cards being there (a hole keeps its place)
    assert.deepEqual(slotOf(seat, 3, 4, plan.cols), four[3]);
    // Six cards: three rows inside the same depth, each row over the one before
    const six = [0, 1, 2, 3, 4, 5].map(i => slotOf(seat, i, 6, plan.cols));
    assert.ok(Math.abs(six[0].z - four[0].z) < 1e-9 && Math.abs(six[4].z - four[2].z) < 1e-9, 'same depth as two rows');
    assert.deepEqual(six.map(s => s.layer), [0, 0, 1, 1, 2, 2]);
    // The hand of the player opposite is the same, turned around
    const opposite = plan.seats.get(2);
    const far = slotOf(opposite, 0, 4, plan.cols), near = slotOf(opposite, 2, 4, plan.cols);
    assert.ok(far.z > near.z, 'his first row is on our side');
});

test('the camera shows everything, whatever the screen and the number of players', () => {
    const screens = [[390, 844], [360, 640], [820, 1180], [1440, 900], [1920, 1080], [844, 390], [1024, 768]];
    for (const [w, h] of screens) {
        const rig = pickRig(w, h);
        for (const n of [2, 3, 4, 6, 10]) {
            const plan = makePlan(rig, order(n), 4);
            const margin = {top: 110 / h, bottom: 16 / h, side: 6 / w};
            for (const pitch of [plan.pitchMin, plan.pitch]) {
                const cam = fitCamera(plan.mustSee, pitch, plan.fov, w / h, margin, plan.align);
                const p = pitch * Math.PI / 180, tan = Math.tan(plan.fov * Math.PI / 360);
                for (const [x, y, z] of plan.mustSee) {
                    const dy = y - cam.y, dz = z - cam.z;
                    const ahead = -dy * Math.sin(p) - dz * Math.cos(p);
                    const up = dy * Math.cos(p) - dz * Math.sin(p);
                    assert.ok(ahead > 0, `${w}x${h} ${n}: in front of the camera`);
                    const sx = (x - cam.x) / ahead / (tan * w / h), sy = up / ahead / tan;
                    assert.ok(Math.abs(sx) <= 1 - 2 * margin.side + 1e-6, `${w}x${h} ${n} players, ${pitch}°: inside the width (${sx.toFixed(3)})`);
                    assert.ok(sy <= 1 - 2 * margin.top + 1e-6 && sy >= -(1 - 2 * margin.bottom) - 1e-6, `${w}x${h} ${n} players, ${pitch}°: inside the height (${sy.toFixed(3)})`);
                }
            }
        }
    }
});
