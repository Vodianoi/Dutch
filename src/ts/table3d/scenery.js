import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { brassMaterial, canvas, feltMaterial, floorMaterial, leatherMaterial, rugMaterial, texture, woodMaterial } from './surfaces.js';
/**
 *  The room of the 3D table: a card table with a padded leather rail on turned legs, standing on a rug
 *  on an old wooden floor, club chairs around it, one lamp hanging above. Sizes: 1 unit = 10 cm.
 */
/** Width of the leather rail */
export const RAIL = .46;
/** The floor, under the table top (a table 74 cm high) */
export const FLOOR = -7.4;
/** Where the lamp hangs */
export const LAMP = new THREE.Vector3(0, 9.5, 1);
export function ellipse(rx, rz) {
    const s = new THREE.Shape();
    s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
    return s;
}
/** Free everything a group holds (shapes only: the materials are shared and freed with the table) */
export function empty(group) {
    group.traverse(o => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Points)
            o.geometry.dispose();
        if (o instanceof THREE.InstancedMesh)
            o.dispose();
    });
    group.clear();
}
// region Light
/**
 *  What the shiny things reflect (varnish, brass, the wax of the leather): a dim room with the lamp above the table,
 *  the glow of a bar at the back, wall lamps, a window at night. Never seen directly.
 */
export function reflections(renderer) {
    const room = new THREE.Scene();
    const glow = (colour, strength) => {
        const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
        m.color.set(colour).multiplyScalar(strength);
        return m;
    };
    const walls = new THREE.Mesh(new THREE.BoxGeometry(44, 26, 44), new THREE.MeshBasicMaterial({ color: '#0b0705', side: THREE.BackSide }));
    walls.position.y = 5;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), glow('#3a2314', .5));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -7.9;
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), glow('#ffd2a0', 34));
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, 10, 1);
    const shade = new THREE.Mesh(new THREE.RingGeometry(2.6, 5, 32), glow('#5a2a12', 1.2));
    shade.rotation.x = Math.PI / 2;
    shade.position.copy(lamp.position);
    // The back bar: a long warm glow that slides over the varnish
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(26, 3.2), glow('#ffb46a', 5));
    bar.position.set(0, 13, -21.8);
    const shelf = new THREE.Mesh(new THREE.PlaneGeometry(22, 1.2), glow('#ffdcae', 9));
    shelf.position.set(0, 8.5, -21.7);
    const window = new THREE.Mesh(new THREE.PlaneGeometry(5, 9), glow('#6f8fc4', 2.2));
    window.position.set(21.8, 8, -4);
    window.rotation.y = -Math.PI / 2;
    room.add(walls, ground, lamp, shade, bar, shelf, window);
    for (const [x, z, turn] of [[-21.8, -8, 1], [-21.8, 8, 1], [21.8, 10, -1], [-9, 21.8, 2], [9, 21.8, 2]]) {
        const sconce = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), glow('#ffc98c', 12));
        sconce.position.set(x, 9, z);
        sconce.rotation.y = turn * Math.PI / 2;
        room.add(sconce);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    const map = pmrem.fromScene(room, .035).texture;
    pmrem.dispose();
    room.traverse(o => {
        if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            o.material.dispose();
        }
    });
    return map;
}
/** The lamp above the table: a warm pool of light that falls on the baize, the room stays in the dark */
export function lights(shadowSize) {
    const group = new THREE.Group();
    const lamp = new THREE.SpotLight('#ffd6a2', 170, 0, .74, .9, 2);
    lamp.position.copy(LAMP);
    lamp.target.position.set(0, 0, .2);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(shadowSize, shadowSize);
    lamp.shadow.camera.near = 5;
    lamp.shadow.camera.far = 24;
    lamp.shadow.bias = -.0004;
    lamp.shadow.normalBias = .03;
    // A lamp shade is wide: soft edges
    lamp.shadow.radius = 6;
    // What the walls and the wood send back: a faint warm light from everywhere
    const bounce = new THREE.HemisphereLight('#ffe2c0', '#1a0e07', .3);
    const fill = new THREE.DirectionalLight('#ffe6c4', .22);
    fill.position.set(-3, 6, 9);
    group.add(lamp, lamp.target, bounce, fill);
    return { lamp, group };
}
/** Dust floating in the light of the lamp */
export function dust() {
    const count = 260;
    const positions = new Float32Array(count * 3);
    let seed = 5;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < count; i++) {
        // Inside the cone of the lamp, above the cards
        const y = .9 + rand() * 6.5;
        const reach = (LAMP.y - y) * .62;
        const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * reach;
        positions.set([Math.cos(a) * r, y, LAMP.z * .3 + Math.sin(a) * r], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const speck = texture('speck', () => {
        const [c, ctx] = canvas(32, 32);
        const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        g.addColorStop(0, 'rgba(255, 255, 255, 1)');
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 32, 32);
        return c;
    });
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
        map: speck, color: '#ffd9a6', size: .045, sizeAttenuation: true, transparent: true, opacity: .2,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    points.frustumCulled = false;
    return points;
}
// endregion
// region Table
/** Closed line around the table, at a distance of its edge */
function around(rx, rz, y) {
    const points = [];
    for (let i = 0; i < 96; i++) {
        const a = i / 96 * Math.PI * 2;
        points.push(new THREE.Vector3(rx * Math.cos(a), y, rz * Math.sin(a)));
    }
    return new THREE.CatmullRomCurve3(points, true);
}
/** A turned table leg, from the floor to the top */
function leg(height) {
    const profile = [
        [0, 0], [.34, 0], [.36, .12], [.26, .3], [.22, .55], [.3, .8], [.34, 1.05], [.24, 1.3], [.19, 2.2], [.23, 3.6],
        [.31, 4.3], [.36, 4.7], [.28, 5], [.3, 5.2], [.42, 5.5], [.42, height],
    ];
    return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, Math.min(y, height))), 20);
}
export function tableMaterials() {
    return {
        felt: feltMaterial(),
        leather: leatherMaterial(2.6),
        wood: woodMaterial(.32),
        turned: woodMaterial([2, .25]),
        brass: brassMaterial(),
        floor: floorMaterial(15),
        rug: rugMaterial(),
        chairLeather: leatherMaterial(8, '#a89488'),
        chairWood: woodMaterial([.5, .3]),
    };
}
/** Baize, padded leather rail with its brass nails, varnished mahogany, turned legs; the rug and the floor under it */
export function buildTable(group, rx, rz, m) {
    empty(group);
    const flat = (mesh, y) => {
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = y;
        return mesh;
    };
    const feltGeo = new THREE.ShapeGeometry(ellipse(rx + .03, rz + .03), 120);
    const pos = feltGeo.attributes.position, uv = feltGeo.attributes.uv;
    // Same aspect whatever the table shape: the print stays round
    const span = Math.max(rx, rz);
    for (let i = 0; i < pos.count; i++)
        uv.setXY(i, .5 + pos.getX(i) / (2 * span), .5 + pos.getY(i) / (2 * span));
    const felt = flat(new THREE.Mesh(feltGeo, m.felt), 0);
    felt.receiveShadow = true;
    // Padded armrest: a fat cushion of leather all around
    const ring = ellipse(rx + RAIL, rz + RAIL);
    ring.holes.push(ellipse(rx + .1, rz + .1));
    const rail = flat(new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: .04, bevelEnabled: true, bevelThickness: .15, bevelSize: .1, bevelSegments: 10, curveSegments: 140 }), m.leather), .03);
    rail.castShadow = rail.receiveShadow = true;
    // Brass piping where the baize meets the leather
    const piping = new THREE.Mesh(new THREE.TubeGeometry(around(rx + .012, rz + .012, .014), 220, .016, 8, true), m.brass);
    // Mahogany band under the leather, with a moulding
    const band = ellipse(rx + RAIL + .16, rz + RAIL + .16);
    band.holes.push(ellipse(rx + RAIL - .1, rz + RAIL - .1));
    const wood = flat(new THREE.Mesh(new THREE.ExtrudeGeometry(band, { depth: .2, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 3, curveSegments: 140 }), m.wood), -.24);
    wood.castShadow = wood.receiveShadow = true;
    const moulding = new THREE.Mesh(new THREE.TubeGeometry(around(rx + RAIL + .17, rz + RAIL + .17, -.27), 220, .05, 8, true), m.wood);
    // Upholstery nails along the edge of the leather
    const edge = around(rx + RAIL + .192, rz + RAIL + .192, -.085);
    const count = Math.round(edge.getLength() / .2);
    const nails = new THREE.InstancedMesh(new THREE.SphereGeometry(.042, 10, 6), m.brass, count);
    const nail = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
        nail.position.copy(edge.getPointAt(i / count));
        const out = Math.atan2(nail.position.x / (rx * rx), nail.position.z / (rz * rz));
        nail.rotation.set(0, out, 0);
        // Flat heads, pushed into the wood
        nail.scale.set(1, 1, .45);
        nail.updateMatrix();
        nails.setMatrixAt(i, nail.matrix);
    }
    // Apron: the box of the table under its top
    const apron = flat(new THREE.Mesh(new THREE.ExtrudeGeometry(ellipse(rx + RAIL - .12, rz + RAIL - .12), { depth: 1.1, bevelEnabled: false, curveSegments: 110 }), m.wood), -1.36);
    apron.castShadow = apron.receiveShadow = true;
    const legGeo = leg(-FLOOR - 1.3);
    const legs = new THREE.InstancedMesh(legGeo, m.turned, 4);
    const at = new THREE.Object3D();
    [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([sx, sz], i) => {
        at.position.set(sx * (rx + RAIL) * .64, FLOOR, sz * (rz + RAIL) * .64);
        at.updateMatrix();
        legs.setMatrixAt(i, at.matrix);
    });
    legs.castShadow = true;
    const floor = flat(new THREE.Mesh(new THREE.PlaneGeometry(120, 120), m.floor), FLOOR);
    floor.receiveShadow = true;
    // The rug lies along the table
    const long = Math.max(rx, rz) + 5.2;
    const carpet = flat(new THREE.Mesh(new THREE.PlaneGeometry(2 * long, 2 * long * .7), m.rug), FLOOR + .03);
    if (rz > rx)
        carpet.rotation.z = Math.PI / 2;
    carpet.receiveShadow = true;
    group.add(felt, rail, piping, wood, moulding, nails, apron, legs, floor, carpet);
}
// endregion
// region Chairs
let chairParts = null;
/** A club chair: leather seat and back, mahogany frame. Standing on the floor at 0, facing +z */
function chair() {
    if (chairParts)
        return chairParts;
    const part = (g, x, y, z, tilt = 0) => {
        const out = g.index ? g.toNonIndexed() : g;
        out.rotateX(tilt);
        out.translate(x, y, z);
        return out;
    };
    const seat = part(new RoundedBoxGeometry(4.3, 1, 4.1, 4, .32), 0, 4.15, .1);
    const back = part(new RoundedBoxGeometry(4, 3.9, .8, 4, .3), 0, 7.3, -2.05, -.13);
    const wood = [part(new THREE.BoxGeometry(4.6, .55, 4.4), 0, 3.5, 0)];
    for (const x of [-2.05, 2.05]) {
        wood.push(part(new THREE.CylinderGeometry(.21, .13, 3.5, 12), x, 1.75, 1.95));
        // The back legs go up and carry the back
        wood.push(part(new THREE.CylinderGeometry(.17, .15, 9.6, 12), x, 4.75, -2.3, -.1));
    }
    wood.push(part(new RoundedBoxGeometry(4.7, .6, .55, 2, .16), 0, 9.55, -2.82));
    chairParts = { leather: mergeGeometries([seat, back]), wood: mergeGeometries(wood) };
    return chairParts;
}
/**
 *  A chair behind every other player (the one of this device's player is under the camera).
 *  `seats`: where their hands are on the table. On a crowded table the chairs are pushed back, as if everybody leaned in.
 */
export function buildChairs(group, seats, rx, rz, m) {
    group.traverse(o => {
        if (o instanceof THREE.InstancedMesh)
            o.dispose();
    });
    group.clear();
    if (!seats.length)
        return;
    const a = rx + RAIL + .3, b = rz + RAIL + .3;
    const place = (back) => seats.map(seat => {
        const u = new THREE.Vector3(seat.x, 0, seat.z).normalize();
        // Where this direction leaves the table, then the room for the knees
        const edge = 1 / Math.hypot(u.x / a, u.z / b);
        return u.multiplyScalar(edge + 2.5 + back);
    });
    let back = 0, spots = place(back);
    const crowded = () => spots.some((p, i) => spots.some((q, j) => j > i && p.distanceTo(q) < 5));
    while (crowded() && back < 7)
        spots = place(back += .35);
    const parts = chair();
    const leather = new THREE.InstancedMesh(parts.leather, m.chairLeather, spots.length);
    const wood = new THREE.InstancedMesh(parts.wood, m.chairWood, spots.length);
    const at = new THREE.Object3D();
    spots.forEach((p, i) => {
        at.position.set(p.x, FLOOR, p.z);
        // Facing the table, never perfectly straight
        at.rotation.y = Math.atan2(-p.x, -p.z) + Math.sin(i * 12.9898) * .12;
        at.updateMatrix();
        leather.setMatrixAt(i, at.matrix);
        wood.setMatrixAt(i, at.matrix);
    });
    for (const mesh of [leather, wood]) {
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        group.add(mesh);
    }
}
// endregion
