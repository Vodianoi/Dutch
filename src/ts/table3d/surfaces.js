import * as THREE from 'three';
import { SERIF } from '../table/cardArt.js';
/**
 *  What the things of the 3D table are made of: felt, leather, varnished wood, brass, floor boards, a rug.
 *  Everything is drawn here (no picture files): a colour picture, and a relief picture turned into a normal map
 *  so that the light catches the fibres, the grain of the leather, the pores of the wood.
 */
// region Drawing tools
export function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d', { willReadFrequently: true })];
}
/** Random numbers that are the same on every device and every time (same table for everybody) */
function random(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** Smooth noise that repeats without a seam: nx by ny random values, blended over w by h pixels */
function lattice(w, h, nx, ny, rand) {
    const grid = new Float32Array(nx * ny);
    for (let i = 0; i < grid.length; i++)
        grid[i] = rand();
    const out = new Float32Array(w * h);
    const xs = new Float32Array(w * 3);
    for (let x = 0; x < w; x++) {
        const fx = x / w * nx, x0 = Math.floor(fx), t = fx - x0;
        xs[x * 3] = x0 % nx;
        xs[x * 3 + 1] = (x0 + 1) % nx;
        xs[x * 3 + 2] = t * t * (3 - 2 * t);
    }
    for (let y = 0; y < h; y++) {
        const fy = y / h * ny, y0 = Math.floor(fy), ty0 = fy - y0;
        const ty = ty0 * ty0 * (3 - 2 * ty0);
        const r0 = (y0 % ny) * nx, r1 = ((y0 + 1) % ny) * nx;
        for (let x = 0; x < w; x++) {
            const a = xs[x * 3], b = xs[x * 3 + 1], tx = xs[x * 3 + 2];
            const top = grid[r0 + a] + (grid[r0 + b] - grid[r0 + a]) * tx;
            const bottom = grid[r1 + a] + (grid[r1 + b] - grid[r1 + a]) * tx;
            out[y * w + x] = top + (bottom - top) * ty;
        }
    }
    return out;
}
/** Several layers of noise, finer and fainter each time; values between 0 and 1 */
function clouds(w, h, nx, ny, octaves, seed, gain = .5) {
    const rand = random(seed);
    const out = new Float32Array(w * h);
    let amp = 1, total = 0;
    for (let o = 0; o < octaves; o++) {
        const layer = lattice(w, h, Math.min(w, nx << o), Math.min(h, ny << o), rand);
        for (let i = 0; i < out.length; i++)
            out[i] += layer[i] * amp;
        total += amp;
        amp *= gain;
    }
    for (let i = 0; i < out.length; i++)
        out[i] /= total;
    return out;
}
/** Relief (0 low, 1 high) turned into a normal map; `wrap` when the picture repeats */
function normals(height, w, h, strength, wrap = true) {
    const [c, ctx] = canvas(w, h);
    const img = ctx.createImageData(w, h);
    const at = (x, y) => {
        if (wrap) {
            x = (x + w) % w;
            y = (y + h) % h;
        }
        else {
            x = Math.max(0, Math.min(w - 1, x));
            y = Math.max(0, Math.min(h - 1, y));
        }
        return height[y * w + x];
    };
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
            // Canvas rows go down, the green of a normal map goes up
            const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
            const l = 1 / Math.hypot(dx, dy, 1);
            const i = (y * w + x) * 4;
            img.data[i] = (dx * l * .5 + .5) * 255;
            img.data[i + 1] = (dy * l * .5 + .5) * 255;
            img.data[i + 2] = (l * .5 + .5) * 255;
            img.data[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return c;
}
/** Grey picture from values between 0 and 1 */
function grey(values, w, h) {
    const [c, ctx] = canvas(w, h);
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < values.length; i++) {
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(0, Math.min(1, values[i])) * 255;
        img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
}
/** Picture from a relief and a few colours: 0 gives the first colour, 1 the last */
function tint(height, w, h, stops) {
    const ramp = stops.map(s => {
        const c = new THREE.Color(s).convertLinearToSRGB();
        return [c.r, c.g, c.b];
    });
    const [c, ctx] = canvas(w, h);
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < height.length; i++) {
        const v = Math.max(0, Math.min(.9999, height[i])) * (ramp.length - 1);
        const k = Math.floor(v), f = v - k;
        const a = ramp[k], b = ramp[k + 1];
        img.data[i * 4] = (a[0] + (b[0] - a[0]) * f) * 255;
        img.data[i * 4 + 1] = (a[1] + (b[1] - a[1]) * f) * 255;
        img.data[i * 4 + 2] = (a[2] + (b[2] - a[2]) * f) * 255;
        img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
}
// endregion
// region Textures, made once and kept
const kept = new Map();
let sharpness = 4;
/** How sharp the textures stay when seen at a grazing angle (what the graphics card can do) */
export function setSharpness(value) {
    sharpness = value;
}
/** Texture drawn once; `colour` false for normal maps and other data */
export function texture(key, draw, repeat, colour = true) {
    let t = kept.get(key);
    if (!t) {
        t = new THREE.CanvasTexture(draw());
        t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = sharpness;
        if (repeat) {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            if (typeof repeat === 'number')
                t.repeat.set(repeat, repeat);
            else
                t.repeat.set(repeat[0], repeat[1]);
        }
        kept.set(key, t);
    }
    return t;
}
export function forgetTextures() {
    for (const t of kept.values())
        t.dispose();
    kept.clear();
    drawings.clear();
}
/** A drawing made once, whatever the number of textures that show it (the same leather on the rail and on the chairs) */
const drawings = new Map();
function once(name, draw) {
    return () => {
        let c = drawings.get(name);
        if (!c)
            drawings.set(name, c = draw());
        return c;
    };
}
// endregion
// region Felt
/** Green baize of an old casino table: worn a little where the cards slide, the layout printed in gold */
function baize() {
    const size = 2048;
    const [c, ctx] = canvas(size, size);
    const g = ctx.createRadialGradient(size / 2, size * .46, 0, size / 2, size / 2, size * .64);
    g.addColorStop(0, '#1b5f40');
    g.addColorStop(.55, '#124a30');
    g.addColorStop(1, '#0a2e1f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const gold = 'rgba(214, 180, 104, .5)';
    ctx.strokeStyle = gold;
    for (const [r, w] of [[780, 5], [760, 2]]) {
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.ellipse(size / 2, size / 2, r, r, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.fillStyle = gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `italic 900 150px ${SERIF}`;
    ctx.fillText('Dutch', size / 2, 560);
    ctx.font = `600 38px ${SERIF}`;
    ctx.fillText('LE PLUS PETIT TOTAL GAGNE', size / 2, 680);
    ctx.font = `90px ${SERIF}`;
    ctx.fillText('♠   ♥   ♣   ♦', size / 2, 1500);
    ctx.font = `600 34px ${SERIF}`;
    ctx.fillText('ROI ROUGE · ZÉRO POINT', size / 2, 1600);
    // Fibres (fine) and wear (large patches, a little lighter and greyer), over the cloth and its print
    const wear = clouds(size, size, 5, 5, 4, 11);
    const rand = random(7);
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
        const n = (rand() - .5) * 15 + (wear[i >> 2] - .5) * 22;
        img.data[i] += n * .9;
        img.data[i + 1] += n;
        img.data[i + 2] += n * .8;
    }
    ctx.putImageData(img, 0, 0);
    return c;
}
/** Short fibres going every way */
function fibres() {
    const size = 512;
    const fine = clouds(size, size, 128, 128, 2, 21, .7);
    const soft = clouds(size, size, 24, 24, 3, 22);
    const height = new Float32Array(size * size);
    for (let i = 0; i < height.length; i++)
        height[i] = fine[i] * .75 + soft[i] * .25;
    return normals(height, size, size, 3.2);
}
export function feltMaterial() {
    return new THREE.MeshPhysicalMaterial({
        map: texture('baize', baize),
        normalMap: texture('fibres', fibres, 9, false),
        normalScale: new THREE.Vector2(.55, .55),
        roughness: 1, metalness: 0,
        // Cloth: a soft sheen at grazing angles, no highlight
        sheen: 1, sheenRoughness: .55, sheenColor: new THREE.Color('#5cae84'),
        envMapIntensity: .35,
    });
}
// endregion
// region Leather
function leatherRelief() {
    const size = 512;
    // Creases: the valleys between the cells of the grain
    const a = clouds(size, size, 30, 30, 3, 31, .55);
    const b = clouds(size, size, 9, 9, 3, 32);
    const out = new Float32Array(size * size);
    for (let i = 0; i < out.length; i++) {
        const crease = Math.abs(a[i] - .5) * 2;
        out[i] = Math.min(1, Math.pow(crease, .45)) * .8 + b[i] * .2;
    }
    return out;
}
function leatherColour() {
    const size = 512;
    const height = leatherRelief();
    const shade = clouds(size, size, 4, 4, 4, 33);
    const mix = new Float32Array(size * size);
    for (let i = 0; i < mix.length; i++)
        mix[i] = height[i] * .45 + shade[i] * .55;
    // Oxblood, darker in the creases and where hands rubbed it less
    return tint(mix, size, size, ['#1c0504', '#3a0d0b', '#521513', '#5e1b17']);
}
/** `shade` darkens it (the chairs are older than the rail of the table) */
export function leatherMaterial(repeat = 2.6, shade = '#ffffff') {
    return new THREE.MeshPhysicalMaterial({
        color: shade,
        map: texture(`leather-${repeat}`, once('leather', leatherColour), repeat),
        normalMap: texture(`leather-grain-${repeat}`, once('leather-grain', () => normals(leatherRelief(), 512, 512, 2.4)), repeat, false),
        normalScale: new THREE.Vector2(.45, .45),
        roughness: .5, metalness: 0,
        // Waxed: a thin shine over the grain
        clearcoat: .35, clearcoatRoughness: .42,
        envMapIntensity: 1,
    });
}
// endregion
// region Wood
/** Relief of a board: long fibres, darker veins, small pores */
function grain(size, seed) {
    const long = clouds(size, size, 3, 48, 4, seed);
    const waves = clouds(size, size, 2, 6, 3, seed + 1);
    const pores = clouds(size, size, 16, 256, 2, seed + 2, .6);
    const out = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = y * size + x;
            // Growth rings cut along the board: bands that wander with the fibres (a whole number of them: no seam)
            const ring = .5 + .5 * Math.sin((y / size * 22 + waves[i] * 9 + long[i] * 3) * Math.PI * 2);
            out[i] = long[i] * .5 + ring * .3 + pores[i] * .2;
        }
    }
    return out;
}
const MAHOGANY = ['#1f0a05', '#3b140a', '#5a2110', '#74301a', '#8a3d22'];
const OAK = ['#120a06', '#24150c', '#382213', '#4a2f1c', '#5b3b24'];
export function woodMaterial(repeat = .32) {
    const size = 512;
    return new THREE.MeshPhysicalMaterial({
        map: texture(`mahogany-${repeat}`, once('mahogany', () => tint(grain(size, 41), size, size, MAHOGANY)), repeat),
        normalMap: texture(`mahogany-grain-${repeat}`, once('mahogany-grain', () => normals(grain(size, 41), size, size, 1.2)), repeat, false),
        normalScale: new THREE.Vector2(.25, .25),
        roughness: .38, metalness: 0,
        // French polish: a deep, glossy varnish over the wood
        clearcoat: 1, clearcoatRoughness: .1,
        envMapIntensity: 1.1,
    });
}
/** Boards of an old floor: each its own shade, dark joints, worn varnish */
function boards() {
    const size = 1024, rows = 8;
    const fibre = grain(size, 51);
    const rand = random(52);
    const height = new Float32Array(size * size);
    const shade = new Float32Array(size * size);
    const board = size / rows;
    for (let r = 0; r < rows; r++) {
        // Boards of different lengths, joints never aligned
        const cuts = [];
        let x = Math.floor(rand() * size * .3);
        while (x < size) {
            cuts.push(x);
            x += Math.floor(size * (.28 + rand() * .3));
        }
        const tones = cuts.map(() => .32 + rand() * .5);
        const shifts = cuts.map(() => Math.floor(rand() * size));
        for (let px = 0; px < size; px++) {
            // The board this pixel is on: the last cut on its left (the last board goes round to the first cut)
            let k = cuts.length - 1;
            for (let j = 0; j < cuts.length; j++)
                if (px >= cuts[j])
                    k = j;
            const start = px >= cuts[0] ? cuts[k] : cuts[k] - size;
            const end = k + 1 < cuts.length && px >= cuts[0] ? cuts[k + 1] : px >= cuts[0] ? cuts[0] + size : cuts[0];
            for (let y = 0; y < board; y++) {
                const py = Math.floor(r * board + y);
                const i = py * size + px;
                // Each board is another piece of wood: the fibres are read somewhere else
                const f = fibre[((py * 3 + shifts[k]) % size) * size + ((px + shifts[k]) % size)];
                const joint = Math.min(y, board - 1 - y, px - start, end - px);
                const gap = Math.min(1, joint / 2.5);
                height[i] = (.5 + f * .5) * gap;
                shade[i] = (f * .55 + tones[k] * .45) * (.35 + .65 * gap);
            }
        }
    }
    // Worn varnish: dull paths, shinier corners
    const wornBy = clouds(size, size, 4, 4, 4, 53);
    const rough = new Float32Array(size * size);
    for (let i = 0; i < rough.length; i++)
        rough[i] = .42 + wornBy[i] * .5 + (1 - height[i]) * .2;
    return { colour: tint(shade, size, size, OAK), normal: normals(height, size, size, 2.2), rough: grey(rough, size, size) };
}
export function floorMaterial(repeat) {
    let made = null;
    const part = (name) => () => (made ?? (made = boards()))[name];
    return new THREE.MeshStandardMaterial({
        map: texture('floor', part('colour'), repeat),
        normalMap: texture('floor-normal', part('normal'), repeat, false),
        normalScale: new THREE.Vector2(.8, .8),
        roughnessMap: texture('floor-rough', part('rough'), repeat, false),
        roughness: 1, metalness: 0,
        envMapIntensity: .7,
    });
}
// endregion
// region Rug
/** An old woven rug: a dark red field, borders, a medallion in the middle */
function rug() {
    const w = 1024, h = 720;
    const [c, ctx] = canvas(w, h);
    const rand = random(61);
    const red = '#5a1414', deep = '#2c0a0c', navy = '#141c33', cream = '#b9a57c', gold = '#9c7a3c';
    ctx.fillStyle = deep;
    ctx.fillRect(0, 0, w, h);
    const band = (inset, colour) => {
        ctx.fillStyle = colour;
        ctx.fillRect(inset, inset, w - 2 * inset, h - 2 * inset);
    };
    band(14, cream);
    band(20, navy);
    band(64, cream);
    band(69, red);
    const flower = (x, y, r, a, b) => {
        ctx.fillStyle = a;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.ellipse(x + Math.cos(i * Math.PI / 2) * r * .55, y + Math.sin(i * Math.PI / 2) * r * .55, r * .5, r * .32, i * Math.PI / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = b;
        ctx.beginPath();
        ctx.arc(x, y, r * .26, 0, Math.PI * 2);
        ctx.fill();
    };
    // Border: a row of small flowers
    for (let x = 42; x < w - 30; x += 44) {
        flower(x, 42, 15, cream, gold);
        flower(x, h - 42, 15, cream, gold);
    }
    for (let y = 86; y < h - 70; y += 44) {
        flower(42, y, 15, cream, gold);
        flower(w - 42, y, 15, cream, gold);
    }
    // Field: a lattice of small diamonds
    ctx.save();
    ctx.beginPath();
    ctx.rect(69, 69, w - 138, h - 138);
    ctx.clip();
    ctx.strokeStyle = 'rgba(20, 28, 51, .55)';
    ctx.lineWidth = 3;
    for (let k = -h; k < w + h; k += 56) {
        ctx.beginPath();
        ctx.moveTo(k, 0);
        ctx.lineTo(k + h, h);
        ctx.moveTo(k, h);
        ctx.lineTo(k + h, 0);
        ctx.stroke();
    }
    for (let y = 0; y < h + 28; y += 28) {
        for (let x = (y / 28 % 2) * 28; x < w + 28; x += 56)
            flower(x + 4, y, 7, 'rgba(185, 165, 124, .7)', gold);
    }
    ctx.restore();
    // Medallion
    const cx = w / 2, cy = h / 2;
    for (const [rx, ry, colour] of [[300, 210, navy], [286, 198, cream], [280, 192, deep], [200, 132, gold], [194, 127, navy], [110, 74, red]]) {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(cx - rx, cy);
        ctx.quadraticCurveTo(cx - rx * .45, cy - ry * .5, cx, cy - ry);
        ctx.quadraticCurveTo(cx + rx * .45, cy - ry * .5, cx + rx, cy);
        ctx.quadraticCurveTo(cx + rx * .45, cy + ry * .5, cx, cy + ry);
        ctx.quadraticCurveTo(cx - rx * .45, cy + ry * .5, cx - rx, cy);
        ctx.fill();
    }
    for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        flower(cx + Math.cos(a) * 240, cy + Math.sin(a) * 160, 13, cream, red);
    }
    flower(cx, cy, 46, cream, gold);
    // Old wool: uneven dye, faded where people walked; every knot catches the light a little differently
    const fade = clouds(w, h, 5, 4, 4, 62);
    const img = ctx.getImageData(0, 0, w, h);
    const weave = new Float32Array(w * h);
    for (let i = 0; i < weave.length; i++) {
        const x = i % w, y = Math.floor(i / w);
        const knot = ((x & 3) < 2 ? .55 : .45) + ((y & 3) < 2 ? .1 : -.1) + rand() * .5;
        weave[i] = knot;
        const k = .62 + fade[i] * .42 + (knot - .7) * .16;
        img.data[i * 4] *= k;
        img.data[i * 4 + 1] *= k;
        img.data[i * 4 + 2] *= k;
    }
    ctx.putImageData(img, 0, 0);
    return { colour: c, normal: normals(weave, w, h, 1.6, false) };
}
export function rugMaterial() {
    let made = null;
    const part = (name) => () => (made ?? (made = rug()))[name];
    return new THREE.MeshPhysicalMaterial({
        map: texture('rug', part('colour')),
        normalMap: texture('rug-normal', part('normal'), undefined, false),
        normalScale: new THREE.Vector2(.6, .6),
        roughness: 1, metalness: 0,
        sheen: .6, sheenRoughness: .7, sheenColor: new THREE.Color('#a04a3a'),
        envMapIntensity: .3,
    });
}
// endregion
// region Brass, cards, chips
export function brassMaterial() {
    const size = 256;
    // Years of polishing: fine scratches that blur the reflections a little
    const scratches = () => {
        const s = clouds(size, size, 2, 128, 2, 71, .6);
        for (let i = 0; i < s.length; i++)
            s[i] = .5 + s[i] * .5;
        return grey(s, size, size);
    };
    return new THREE.MeshStandardMaterial({
        color: '#c99b45', metalness: 1, roughness: .42,
        roughnessMap: texture('brass-rough', scratches, 3, false),
        envMapIntensity: 1.25,
    });
}
/** Linen finish of playing cards: a fine woven embossing that breaks up the reflections */
export function linen() {
    return texture('linen', () => {
        const size = 128;
        const height = new Float32Array(size * size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                height[y * size + x] = .5 + .25 * Math.sin(x / size * Math.PI * 2 * 16) + .25 * Math.sin(y / size * Math.PI * 2 * 16);
            }
        }
        return normals(height, size, size, 1.4);
    }, [5, 7], false);
}
/** Edge of a stack of cards: one thin line per card */
export function cardEdges() {
    const [c, ctx] = canvas(64, 256);
    const rand = random(81);
    for (let y = 0; y < 256; y++) {
        const dark = y % 4 === 3;
        const v = dark ? 150 + rand() * 30 : 222 + rand() * 22;
        ctx.fillStyle = `rgb(${v}, ${v * .96}, ${v * .86})`;
        ctx.fillRect(0, y, 64, 1);
    }
    return c;
}
/** Soft shadow of a card lying on the table (white on black: used as the opacity of a black sheet) */
export function cardShadow() {
    const w = 128, h = 176;
    const [c, ctx] = canvas(w, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    // Only the blurred shadow of the rectangle is drawn: the rectangle itself is outside of the picture
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 1000;
    ctx.fillStyle = '#fff';
    ctx.fillRect(24 - 1000, 24, w - 48, h - 48);
    return c;
}
/** Top of a clay casino chip in the player's colour, with ivory inserts */
export function chipTop(color) {
    const size = 512, m = size / 2;
    const [c, ctx] = canvas(size, size);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#efe5cf';
    for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.translate(m, m);
        ctx.rotate(i * Math.PI / 3);
        ctx.fillRect(-30, -m, 60, 66);
        ctx.restore();
    }
    ctx.strokeStyle = 'rgba(239, 229, 207, .9)';
    ctx.lineWidth = 7;
    ctx.setLineDash([18, 15]);
    ctx.beginPath();
    ctx.arc(m, m, 158, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Inlay in the middle: a paler disc with a spade
    const g = ctx.createRadialGradient(m - 30, m - 40, 10, m, m, 140);
    g.addColorStop(0, 'rgba(255, 255, 255, .22)');
    g.addColorStop(1, 'rgba(0, 0, 0, .14)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(m, m, 136, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, .28)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(239, 229, 207, .88)';
    ctx.font = `150px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♠', m, m + 8);
    // Clay: a fine speckle
    const rand = random(91);
    for (let i = 0; i < 5000; i++) {
        ctx.fillStyle = `rgba(${rand() < .5 ? '0,0,0' : '255,255,255'}, ${rand() * .07})`;
        ctx.fillRect(rand() * size, rand() * size, 2, 2);
    }
    return c;
}
export function chipSide(color) {
    const [c, ctx] = canvas(512, 32);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 32);
    ctx.fillStyle = '#efe5cf';
    for (let i = 0; i < 6; i++)
        ctx.fillRect(i * 512 / 6 + 24, 0, 38, 32);
    ctx.fillStyle = 'rgba(0, 0, 0, .22)';
    ctx.fillRect(0, 0, 512, 3);
    ctx.fillRect(0, 29, 512, 3);
    return c;
}
// endregion
