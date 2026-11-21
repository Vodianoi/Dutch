import * as THREE from 'three';
import {gsap} from 'gsap';
import Card from '../Card.js';
import {CardView, toCard} from '../View.js';
import {compactFace, CW, face, vintageBack} from '../table/cardArt.js';
import {sfx} from '../table/sound.js';
import {LAMP} from './scenery.js';
import {cardEdges, cardShadow, chipSide, chipTop, linen, texture} from './surfaces.js';

/**
 *  What is played with on the 3D table: cards with a thickness and a linen finish, the draw pile, clay chips.
 *  Sizes: 1 unit = 10 cm (a poker card is 6.3 by 8.8 cm).
 */

export const CARD_W = .63;
export const CARD_H = .88;
/** Thickness of a card: a little more than a real one, to be seen */
export const CARD_T = .0055;
/** Height of the middle of a card lying on something */
export const LIE = CARD_T / 2 + .0006;
/** How much higher each card of a pile lies */
export const STACK = CARD_T + .0004;

const GLOW = new THREE.Color('#ffe2a0');

// region Shapes
/** The drawing of a card has a thin transparent border: the shape stays inside it */
const INSET = 1.5 / CW;

function cardOutline(): THREE.Shape {
    const w = CARD_W * (1 - 2 * INSET), h = CARD_H - 2 * INSET * CARD_W, r = CARD_W * 17 / CW;
    const x = -w / 2, y = -h / 2;
    const s = new THREE.Shape();
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r);
    s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h);
    s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r);
    s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
}

/** One side of a card, lying flat and looking up; the whole drawing of the card on it */
const faceGeometry = (() => {
    const g = new THREE.ShapeGeometry(cardOutline(), 5);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / CARD_W + .5, pos.getY(i) / CARD_H + .5);
    g.rotateX(-Math.PI / 2);
    return g;
})();

/** The edge of a card or of a pile of cards, 1 high (stretched to the height wanted) */
const edgeGeometry = (() => {
    const g = new THREE.ExtrudeGeometry(cardOutline(), {depth: 1, bevelEnabled: false, curveSegments: 5});
    g.rotateX(-Math.PI / 2);
    // The sides only: the faces are separate
    const sides = g.groups.find(group => group.materialIndex === 1)!;
    const index = g.index;
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv'] as const) {
        const a = g.attributes[name];
        out.setAttribute(name, new THREE.BufferAttribute((a.array as Float32Array).slice(sides.start * a.itemSize, (sides.start + sides.count) * a.itemSize), a.itemSize));
    }
    if (index) throw new Error('unexpected indexed shape');
    g.dispose();
    return out;
})();

const shadowGeometry = (() => {
    const g = new THREE.PlaneGeometry(CARD_W * 128 / 80, CARD_H * 176 / 128);
    g.rotateX(-Math.PI / 2);
    return g;
})();

/** Shapes shared by every table: never freed */
export const SHARED = new Set<THREE.BufferGeometry>([faceGeometry, edgeGeometry, shadowGeometry]);
// endregion

// region Materials
const faceTexture = (card: Card, compact: boolean) => texture(`${compact ? 'compact' : 'face'}-${card.value}-${card.suit}`,
    () => compact ? compactFace(card, true) : face(card, true));
const backTexture = () => texture('back', vintageBack);

/** Card stock with a linen finish: it catches the lamp softly, never a glare that hides the card */
function cardMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
        // A little darker than the drawing: right under the lamp, white paper would burn out and hide the card
        map, color: '#d9d3c8', normalMap: linen(), normalScale: new THREE.Vector2(.16, .16),
        roughness: .66, metalness: 0, envMapIntensity: .45, emissive: GLOW, emissiveIntensity: 0,
    });
}

let paper: THREE.MeshStandardMaterial | null = null;
/** The cut edge of a card */
const paperEdge = () => paper ??= new THREE.MeshStandardMaterial({color: '#e4d9bf', roughness: .9, envMapIntensity: .4});

export function forgetPieces() {
    paper?.dispose();
    paper = null;
    chipMaterials.forEach(pair => pair.forEach(m => m.dispose()));
    chipMaterials.clear();
}
// endregion

// region Card
export interface Target {
    pos: THREE.Vector3;
    yaw: number;
    up: boolean;
    scale: number;
    compact: boolean;
    /** Height of what the card lies on, or hovers above (the table: 0) */
    floor: number;
}

export type Place = { zone: 'hand'; player: number; index: number } | { zone: 'discard'; top: boolean } | { zone: 'held' };

function nearestAngle(from: number, to: number): number {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return from + d;
}

/** A card: two printed faces and a paper edge, turned over by a real 3D rotation, its shadow under it */
export class Card3D {
    readonly group = new THREE.Group();
    readonly frontMat: THREE.MeshStandardMaterial;
    readonly backMat: THREE.MeshStandardMaterial;
    private readonly shadow: THREE.Mesh;
    private readonly shadowMat: THREE.MeshBasicMaterial;
    view: CardView;
    place: Place | null = null;
    target: Target | null = null;
    private compact = false;
    private glowTween: gsap.core.Tween | null = null;
    private glowLevel = 0;
    private moveTween: gsap.core.Tween | null = null;

    constructor(view: CardView, private readonly scene: THREE.Scene) {
        this.view = view;
        this.frontMat = cardMaterial(backTexture());
        this.backMat = cardMaterial(backTexture());
        const front = new THREE.Mesh(faceGeometry, this.frontMat);
        front.position.y = CARD_T / 2;
        const back = new THREE.Mesh(faceGeometry, this.backMat);
        back.rotation.z = Math.PI;
        back.position.y = -CARD_T / 2;
        const edge = new THREE.Mesh(edgeGeometry, paperEdge());
        edge.scale.y = CARD_T;
        edge.position.y = -CARD_T / 2;
        for (const m of [front, back, edge]) {
            m.receiveShadow = true;
            m.userData.card = this;
        }
        this.group.add(front, back, edge);
        // Turn on the table first (yaw), then the flip of the card itself
        this.group.rotation.order = 'YZX';
        this.group.rotation.z = Math.PI;
        // The shadow lies on the table, whatever the card does above it
        this.shadowMat = new THREE.MeshBasicMaterial({color: '#000', alphaMap: texture('card-shadow', cardShadow, undefined, false), transparent: true, opacity: 0, depthWrite: false, fog: false});
        this.shadow = new THREE.Mesh(shadowGeometry, this.shadowMat);
        this.shadow.renderOrder = 1;
        scene.add(this.group, this.shadow);
        this.learn(view);
    }

    learn(view: CardView) {
        if (!view.value) return;
        this.view = view;
        this.drawFace();
    }

    private drawFace() {
        const card = toCard(this.view);
        if (!card) return;
        const map = faceTexture(card, this.compact);
        if (this.frontMat.map !== map) {
            this.frontMat.map = map;
            this.frontMat.needsUpdate = true;
        }
    }

    moveTo(t: Target, delay = 0, instant = false) {
        if (t.compact !== this.compact) {
            this.compact = t.compact;
            this.drawFace();
        }
        const previous = this.target;
        this.target = t;
        const flip = t.up && this.view.value ? 0 : Math.PI;
        const yaw = nearestAngle(this.group.rotation.y, t.yaw);
        if (instant) {
            this.moveTween?.kill();
            gsap.killTweensOf(this.group.rotation);
            gsap.killTweensOf(this.group.scale);
            this.group.position.copy(t.pos);
            this.group.rotation.set(0, yaw, flip);
            this.group.scale.setScalar(t.scale);
            return;
        }
        const travelling = !!this.moveTween && this.moveTween.progress() < 1;
        if (previous && previous.pos.distanceTo(t.pos) < .001 && previous.yaw === t.yaw && previous.up === t.up && previous.scale === t.scale
            && (travelling || this.group.position.distanceTo(t.pos) < .001)) return;
        const from = this.group.position.clone();
        const distance = from.distanceTo(t.pos);
        const flips = Math.abs(this.group.rotation.z - flip) > .1;
        const duration = Math.min(.8, .34 + distance * .065 + (flips ? .12 : 0));
        // A card is dealt low over the baize; it is lifted to be turned over (it must not go through the table)
        const height = Math.min(.5, .1 + distance * .07) + (flips ? .42 * t.scale : 0);
        // It leans into the move, like a card thrown by hand
        const lean = flips ? 0 : Math.min(.22, distance * .05);
        const k = {v: 0};
        this.moveTween?.kill();
        gsap.killTweensOf(this.group.rotation);
        gsap.killTweensOf(this.group.scale);
        this.moveTween = gsap.to(k, {
            v: 1, duration, delay, ease: 'power2.inOut',
            onStart: () => {
                if (distance > .05) sfx.slide();
            },
            onUpdate: () => {
                const arc = Math.sin(k.v * Math.PI);
                this.group.position.lerpVectors(from, t.pos, k.v);
                this.group.position.y += arc * height;
                this.group.rotation.x = -arc * lean;
            },
        });
        gsap.to(this.group.rotation, {y: yaw, z: flip, duration, delay, ease: 'power2.inOut', onComplete: () => flips && sfx.flip()});
        gsap.to(this.group.scale, {x: t.scale, y: t.scale, z: t.scale, duration, delay, ease: 'power2.inOut'});
    }

    /** Back to its place (a drag that went nowhere) */
    settle() {
        const t = this.target;
        this.target = null;
        if (t) this.moveTo(t);
    }

    /** Every frame: the shadow follows the card, wider and fainter when the card is lifted */
    cast() {
        const g = this.group, floor = this.target?.floor ?? 0;
        const lift = Math.max(0, g.position.y - floor - LIE);
        // The lamp is a point above the table: the shadow moves away from it as the card rises
        const away = lift / Math.max(1, LAMP.y - g.position.y);
        const grow = 1 + lift * .9;
        // A card seen edge-on by the lamp (while it turns over) casts a thin shadow
        const facing = Math.max(.12, Math.abs(Math.cos(g.rotation.z)));
        this.shadow.position.set(g.position.x + (g.position.x - LAMP.x) * away, floor + .0012, g.position.z + (g.position.z - LAMP.z) * away);
        this.shadow.rotation.y = g.rotation.y;
        this.shadow.scale.set(g.scale.x * grow * facing, 1, g.scale.z * grow);
        this.shadowMat.opacity = .62 / (1 + lift * 5);
    }

    /** 0 nothing, 1 can be chosen (a few pulses, then steady), 2 chosen */
    glow(level: number) {
        if (level === this.glowLevel) return;
        this.glowLevel = level;
        this.glowTween?.kill();
        const mats = [this.frontMat, this.backMat];
        if (level === 0) this.glowTween = gsap.to(mats, {emissiveIntensity: 0, duration: .2});
        else if (level === 1) this.glowTween = gsap.fromTo(mats, {emissiveIntensity: .02}, {emissiveIntensity: .1, duration: .5, yoyo: true, repeat: 4});
        else this.glowTween = gsap.to(mats, {emissiveIntensity: .2, duration: .15});
    }

    shake() {
        const x = this.group.position.x;
        gsap.fromTo(this.group.position, {x: x - .06}, {x, duration: .5, ease: 'elastic.out(1.2, .3)'});
    }

    dispose() {
        this.moveTween?.kill();
        this.glowTween?.kill();
        gsap.killTweensOf([this.group.rotation, this.group.scale, this.group.position, this.frontMat, this.backMat]);
        this.scene.remove(this.group, this.shadow);
        this.frontMat.dispose();
        this.backMat.dispose();
        this.shadowMat.dispose();
    }
}
// endregion

// region Draw pile
/** The draw pile: a real stack, as high as it has cards, never perfectly squared */
export class Deck3D {
    readonly group = new THREE.Group();
    /** Height of the top of the pile above the table */
    height = 0;
    private readonly blocks: THREE.Mesh[] = [];
    private readonly top: THREE.Mesh;
    private readonly topMat: THREE.MeshStandardMaterial;
    private readonly sideMat: THREE.MeshStandardMaterial;
    private readonly shadow: THREE.Mesh;
    private lit = false;

    constructor() {
        // A texture of its own: its lines are counted for the height of the pile
        const lines = new THREE.CanvasTexture(cardEdges());
        lines.colorSpace = THREE.SRGBColorSpace;
        lines.wrapS = lines.wrapT = THREE.RepeatWrapping;
        this.sideMat = new THREE.MeshStandardMaterial({map: lines, roughness: .9, envMapIntensity: .4, emissive: GLOW, emissiveIntensity: 0});
        this.topMat = cardMaterial(backTexture());
        for (let i = 0; i < 5; i++) {
            const block = new THREE.Mesh(edgeGeometry, this.sideMat);
            block.castShadow = block.receiveShadow = true;
            block.userData.deck = true;
            this.blocks.push(block);
            this.group.add(block);
        }
        this.top = new THREE.Mesh(faceGeometry, this.topMat);
        this.top.receiveShadow = true;
        this.top.userData.deck = true;
        this.shadow = new THREE.Mesh(shadowGeometry, new THREE.MeshBasicMaterial({color: '#000', alphaMap: texture('card-shadow', cardShadow, undefined, false), transparent: true, opacity: .7, depthWrite: false, fog: false}));
        this.shadow.position.y = .001;
        this.shadow.scale.set(1.08, 1, 1.06);
        // Never touched: a tap next to the pile is not a tap on the pile
        this.shadow.raycast = () => undefined;
        this.group.add(this.top, this.shadow);
    }

    /** As many cards as the game says */
    count(cards: number) {
        this.height = cards * CARD_T * .62;
        this.group.visible = cards > 0;
        // 64 lines on the texture, 4 pixels each: one line per card
        this.sideMat.map!.repeat.set(1, Math.max(1, cards) / 64);
        const each = this.height / this.blocks.length;
        this.blocks.forEach((block, i) => {
            // The pile was cut and put back: its blocks are a little out of line
            const skew = Math.sin(i * 7.3 + 1) * .5;
            block.scale.set(1, Math.max(each, .0001), 1);
            block.position.set(skew * .012, i * each, Math.cos(i * 4.1) * .008);
            block.rotation.y = skew * .03;
        });
        const last = this.blocks[this.blocks.length - 1];
        this.top.position.set(last.position.x, this.height + .0004, last.position.z);
        this.top.rotation.y = last.rotation.y;
        (this.shadow.material as THREE.Material).opacity = Math.min(.75, .35 + cards * .01);
    }

    /** Lit when the player can draw */
    glow(on: boolean) {
        if (on === this.lit) return;
        this.lit = on;
        gsap.to([this.topMat, this.sideMat], {emissiveIntensity: on ? .1 : 0, duration: .3});
    }

    dispose() {
        gsap.killTweensOf([this.topMat, this.sideMat]);
        this.sideMat.map?.dispose();
        this.sideMat.dispose();
        this.topMat.dispose();
        (this.shadow.material as THREE.Material).dispose();
    }
}
// endregion

// region Chips
/** Thickness of a chip */
export const CHIP_T = .042;

const chipMaterials = new Map<string, [THREE.Material, THREE.Material]>();

/** One clay chip of radius 1 and thickness 1: a rounded rim (group 0) and two printed faces (group 1) */
const chipGeometry = (() => {
    const bevel = .09;
    const rim = new THREE.LatheGeometry([
        new THREE.Vector2(1 - bevel, 0), new THREE.Vector2(1 - bevel * .3, .04), new THREE.Vector2(1, .22),
        new THREE.Vector2(1, .78), new THREE.Vector2(1 - bevel * .3, .96), new THREE.Vector2(1 - bevel, 1),
    ], 40).toNonIndexed();
    const top = new THREE.CircleGeometry(1 - bevel, 40).toNonIndexed();
    top.rotateX(-Math.PI / 2);
    top.translate(0, 1, 0);
    const bottom = new THREE.CircleGeometry(1 - bevel, 40).toNonIndexed();
    bottom.rotateX(Math.PI / 2);
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv'] as const) {
        const parts = [rim, top, bottom].map(p => p.attributes[name].array as Float32Array);
        const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
        let at = 0;
        for (const p of parts) {
            all.set(p, at);
            at += p.length;
        }
        g.setAttribute(name, new THREE.BufferAttribute(all, name === 'uv' ? 2 : 3));
    }
    const rimCount = rim.attributes.position.count;
    g.addGroup(0, rimCount, 0);
    g.addGroup(rimCount, top.attributes.position.count + bottom.attributes.position.count, 1);
    return g;
})();
SHARED.add(chipGeometry);

/** A small stack of chips in the player's colour, standing on the table at 0 */
export function chipStack(color: string, radius: number, count: number, player: number): THREE.InstancedMesh {
    let materials = chipMaterials.get(color);
    if (!materials) {
        materials = [
            new THREE.MeshStandardMaterial({map: texture(`chip-side-${color}`, () => chipSide(color)), roughness: .68, envMapIntensity: .5}),
            new THREE.MeshStandardMaterial({map: texture(`chip-top-${color}`, () => chipTop(color)), roughness: .64, envMapIntensity: .5}),
        ];
        chipMaterials.set(color, materials);
    }
    const stack = new THREE.InstancedMesh(chipGeometry, materials, count);
    const chip = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
        // Stacked by hand: each chip turned its own way, a hair off the one below
        const a = Math.sin((player + 1) * 91.7 + i * 37.1) * Math.PI;
        chip.position.set(Math.cos(a * 3) * radius * .05, i * CHIP_T, Math.sin(a * 5) * radius * .05);
        chip.rotation.y = a;
        chip.scale.set(radius, CHIP_T, radius);
        chip.updateMatrix();
        stack.setMatrixAt(i, chip.matrix);
    }
    stack.castShadow = stack.receiveShadow = true;
    stack.userData.player = player;
    return stack;
}
// endregion
