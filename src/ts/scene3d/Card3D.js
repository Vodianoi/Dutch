import { AdditiveBlending, BufferGeometry, CanvasTexture, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace, Vector2, } from 'three';
import { gsap } from 'gsap';
import { toCard } from '../View.js';
import { back, CH, compactFace, CW, drawnAt, face, glowArt, halo } from '../table/cardArt.js';
import { sfx } from '../table/sound.js';
import { theme } from '../table/themes.js';
import { CARD_H, CARD_T, CARD_W } from './rig.js';
import { cardEdges, linenRelief } from './textures.js';
/** Corners as round as on the pictures of the cards */
const CORNER = CARD_W * 18 / CW;
/** Margin of light around a card on the picture of the glow */
const GLOW_PAD = 70;
/** Margin of shade around a card on the picture of its shadow */
const SHADE_PAD = 44;
/** Height of a card that lies on the cloth */
export const FLAT = CARD_T / 2 + .0002;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
/** Smallest turn that leads to the same direction */
export function turn(angle) {
    return angle - Math.round(angle / (Math.PI * 2)) * Math.PI * 2;
}
/**
 *  A slab with rounded corners: 1 wide and 1 high would be a square, so it is built at the size of a card.
 *  Three groups: the face (towards +z), the back, the edge.
 */
function slab(thickness) {
    const outline = [];
    const steps = 6;
    const corners = [
        [CARD_W / 2 - CORNER, CARD_H / 2 - CORNER, 0],
        [-CARD_W / 2 + CORNER, CARD_H / 2 - CORNER, Math.PI / 2],
        [-CARD_W / 2 + CORNER, -CARD_H / 2 + CORNER, Math.PI],
        [CARD_W / 2 - CORNER, -CARD_H / 2 + CORNER, Math.PI * 1.5],
    ];
    for (const [cx, cy, from] of corners) {
        for (let i = 0; i <= steps; i++) {
            const angle = from + i / steps * Math.PI / 2;
            outline.push([cx + Math.cos(angle) * CORNER, cy + Math.sin(angle) * CORNER]);
        }
    }
    const n = outline.length;
    const positions = [], normals = [], uvs = [], index = [];
    const geometry = new BufferGeometry();
    const cap = (z, side) => {
        const start = positions.length / 3;
        positions.push(0, 0, z);
        normals.push(0, 0, side);
        uvs.push(.5, .5);
        for (const [x, y] of outline) {
            positions.push(x, y, z);
            normals.push(0, 0, side);
            // The back is seen from behind: its picture is not mirrored
            uvs.push(side * x / CARD_W + .5, y / CARD_H + .5);
        }
        const first = index.length;
        for (let i = 0; i < n; i++) {
            const a = start + 1 + i, b = start + 1 + (i + 1) % n;
            if (side === 1)
                index.push(start, a, b);
            else
                index.push(start, b, a);
        }
        return [first, index.length - first];
    };
    const front = cap(thickness / 2, 1);
    const rear = cap(-thickness / 2, -1);
    const edgeStart = index.length;
    const start = positions.length / 3;
    for (let i = 0; i <= n; i++) {
        const [x, y] = outline[i % n];
        const [px, py] = outline[(i - 1 + n) % n];
        const [nx, ny] = outline[(i + 1) % n];
        // Outwards: across the line that joins the neighbours
        const dx = nx - px, dy = ny - py, length = Math.hypot(dx, dy) || 1;
        for (const z of [thickness / 2, -thickness / 2]) {
            positions.push(x, y, z);
            normals.push(dy / length, -dx / length, 0);
            uvs.push(i / n * 8, z > 0 ? 1 : 0);
        }
    }
    for (let i = 0; i < n; i++) {
        const a = start + i * 2, b = a + 1, c = a + 2, d = a + 3;
        index.push(a, b, c, c, b, d);
    }
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    geometry.addGroup(front[0], front[1], 0);
    geometry.addGroup(rear[0], rear[1], 1);
    geometry.addGroup(edgeStart, index.length - edgeStart, 2);
    return geometry;
}
/** A picture of a card on its paper: nothing see-through is left at the corners */
function onPaper(picture) {
    const c = document.createElement('canvas');
    c.width = picture.width;
    c.height = picture.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = theme().cards.paper[1];
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(picture, 0, 0);
    return c;
}
/**
 *  Everything the cards of one table are made of: one shape, the pictures of the faces (made when first shown),
 *  the back, the lights around the cards that can be played.
 */
export class CardSkins {
    /**
     * @param anisotropy how sharp the pictures stay when seen at a low angle (from the graphics card)
     * @param fine the linen relief of the cards and the bigger pictures (not on small devices)
     */
    constructor(backColor, anisotropy, fine, onChange) {
        this.anisotropy = anisotropy;
        this.fine = fine;
        this.onChange = onChange;
        this.shape = slab(CARD_T);
        /** Shape of the draw pile: as thick as 1, stretched to its height */
        this.pileShape = slab(1);
        this.glowShape = new PlaneGeometry(CARD_W * (CW + 2 * GLOW_PAD) / CW, CARD_H * (CH + 2 * GLOW_PAD) / CH);
        this.shadeShape = new PlaneGeometry(CARD_W * (CW + 2 * SHADE_PAD) / CW, CARD_H * (CH + 2 * SHADE_PAD) / CH);
        this.faces = new Map();
        this.textures = [];
        this.breath = null;
        const paper = theme().cards.paper[1];
        this.relief = fine ? this.keep(new CanvasTexture(linenRelief())) : null;
        if (this.relief) {
            this.relief.wrapS = this.relief.wrapT = RepeatWrapping;
            this.relief.repeat.set(5, 7);
        }
        this.edge = new MeshStandardMaterial({ color: paper, roughness: .8 });
        this.shade = this.keep(new CanvasTexture(halo('rgba(0,0,0,1)', 20, SHADE_PAD, 1)));
        this.blank = this.paper(null);
        this.blank.color.set(paper);
        this.back = this.paper(this.picture(onPaper(drawnAt(fine ? 2 : 1, () => back(backColor)))));
        const edges = this.keep(new CanvasTexture(cardEdges()));
        edges.colorSpace = SRGBColorSpace;
        edges.wrapS = edges.wrapT = RepeatWrapping;
        this.pileEdge = new MeshStandardMaterial({ map: edges, roughness: .85 });
        const { glow, alert } = theme().ui;
        this.glows = [glow, glow, alert].map((color, i) => {
            const texture = this.keep(new CanvasTexture(glowArt(color, GLOW_PAD)));
            texture.colorSpace = SRGBColorSpace;
            return new MeshBasicMaterial({
                map: texture, transparent: true, blending: AdditiveBlending, depthWrite: false,
                opacity: i === 0 ? .55 : 1, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -3,
            });
        });
    }
    /** The cards that can be played breathe softly, all together */
    breathe(on) {
        if (on === !!this.breath)
            return;
        this.breath?.kill();
        this.breath = null;
        if (on) {
            this.breath = gsap.fromTo(this.glows[0], { opacity: .45 }, {
                opacity: .95, duration: .9, ease: 'sine.inOut', yoyo: true, repeat: -1, onUpdate: this.onChange,
            });
        }
    }
    changeBack(backColor) {
        const old = this.back;
        this.back = this.paper(this.picture(onPaper(drawnAt(this.fine ? 2 : 1, () => back(backColor)))));
        old.map?.dispose();
        old.dispose();
    }
    face(card, detail) {
        const key = `${card.value}-${card.suit}-${detail}`;
        let material = this.faces.get(key);
        if (!material) {
            const drawing = detail === 'full' ? drawnAt(this.fine ? 2.5 : 2, () => face(card)) : drawnAt(this.fine ? 1.5 : 1, () => compactFace(card));
            material = this.paper(this.picture(onPaper(drawing)));
            this.faces.set(key, material);
        }
        return material;
    }
    dispose() {
        this.breath?.kill();
        this.shape.dispose();
        this.pileShape.dispose();
        this.glowShape.dispose();
        this.shadeShape.dispose();
        this.textures.forEach(texture => texture.dispose());
        const materials = [this.edge, this.blank, this.back, this.pileEdge, ...this.glows, ...this.faces.values()];
        materials.forEach(material => material.dispose());
    }
    keep(texture) {
        this.textures.push(texture);
        return texture;
    }
    picture(canvas) {
        const texture = this.keep(new CanvasTexture(canvas));
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = this.anisotropy;
        return texture;
    }
    /** Coated card stock: a little shine, the linen relief when the device can afford it */
    paper(map) {
        return new MeshStandardMaterial({
            map, roughness: .62, metalness: 0,
            ...(this.relief ? { normalMap: this.relief, normalScale: new Vector2(.12, .12) } : {}),
        });
    }
}
export class Card3D {
    constructor(view, skins, onChange) {
        this.view = view;
        this.skins = skins;
        this.onChange = onChange;
        this.root = new Group();
        this.place = null;
        /** Where it is going (or is) */
        this.target = null;
        this.pose = { x: 0, y: 0, z: 0, yaw: 0, tilt: 0, flip: 1, scale: 1 };
        /** The player can act on it (pointer cursor, rises under the mouse) */
        this.live = false;
        this.gone = false;
        /** How dark its shade on the cloth is (cards on other cards hardly leave any) */
        this.shadeStrength = 1;
        this.tilter = new Group();
        this.flipper = new Group();
        this.detail = 'compact';
        /** Height added while it flies */
        this.hop = 0;
        /** Height added under the mouse */
        this.rise = 0;
        /** Turn added while it shakes */
        this.sway = 0;
        /** 0 to 1: lifted by its owner who looks at it */
        this.peek = 0;
        this.flight = null;
        this.glowLevel = 0;
        this.card = toCard(view);
        this.mesh = new Mesh(skins.shape, this.materials());
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.userData.card = this;
        this.glow = new Mesh(skins.glowShape, skins.glows[0]);
        // Just above the cloth, under the card: the light spills around it
        this.glow.position.z = -CARD_T / 2 - .00007;
        this.glow.visible = false;
        this.glow.renderOrder = 3;
        this.shade = new Mesh(skins.shadeShape, new MeshBasicMaterial({ map: skins.shade, transparent: true, depthWrite: false, opacity: 0 }));
        this.shade.rotation.x = -Math.PI / 2;
        this.shade.renderOrder = 2;
        this.flipper.add(this.mesh);
        this.tilter.add(this.flipper, this.glow);
        this.root.add(this.tilter, this.shade);
        this.apply();
    }
    /** The face of the card is known now (shown to this device, or to everybody) */
    learn(view) {
        if (this.card || !view.value)
            return;
        this.view = view;
        this.card = toCard(view);
        this.mesh.material = this.materials();
    }
    setDetail(detail) {
        if (detail === this.detail)
            return;
        this.detail = detail;
        if (this.card)
            this.mesh.material = this.materials();
    }
    /** New back chosen in the menu */
    refresh() {
        this.mesh.material = this.materials();
    }
    jump(pose) {
        this.flight?.kill();
        this.flight = null;
        this.target = { ...pose };
        this.pose = { ...pose };
        this.hop = 0;
        this.apply();
    }
    /**
     *  Fly to a place: up, across, down, turning over on the way if needed
     * @param arc how high it rises on the way (by default, higher for a long way or a card that turns over)
     */
    moveTo(target, delay = 0, arc) {
        const t = this.target;
        if (t && Math.abs(t.x - target.x) + Math.abs(t.y - target.y) + Math.abs(t.z - target.z) < 1e-5
            && Math.abs(turn(t.yaw - target.yaw)) < 1e-4 && Math.abs(t.tilt - target.tilt) < 1e-4 && t.flip === target.flip
            && Math.abs(t.scale - target.scale) < 1e-4)
            return;
        this.target = { ...target };
        this.flight?.kill();
        const from = this.pose;
        const to = { ...target, yaw: from.yaw + turn(target.yaw - from.yaw) };
        const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
        const flips = Math.abs(to.flip - from.flip) > .5;
        const still = distance < .004 && !flips;
        const duration = still ? .24 : clamp(.34 + distance * .75, .36, .85) + (flips ? .08 : 0);
        const height = arc ?? (still ? 0 : clamp(distance * .2, .008, .06) + (flips ? CARD_W * .55 : 0));
        this.flight = gsap.timeline({
            delay,
            onStart: () => {
                if (distance > .02)
                    sfx.slide();
            },
            onUpdate: () => this.apply(),
        })
            .to(this.pose, { ...to, duration, ease: 'power2.inOut' }, 0)
            .to(this, { hop: height, duration: duration * .45, ease: 'sine.out' }, 0)
            .to(this, { hop: 0, duration: duration * .55, ease: 'sine.in' }, duration * .45);
        if (flips)
            this.flight.call(() => sfx.flip(), [], duration * .4);
    }
    /** Dragged by the player: follows the finger, nothing else moves it */
    hold(pose) {
        this.flight?.kill();
        this.flight = null;
        this.target = null;
        this.hop = 0;
        this.pose = { ...pose };
        this.apply();
    }
    /** 0: none, 1: can be played, 2: chosen */
    setGlow(level) {
        if (this.glowLevel === 3 || level === this.glowLevel)
            return;
        this.glowLevel = level;
        this.showGlow();
    }
    /** Under the mouse: the card rises a little */
    hover(on) {
        const rise = on && this.live ? .006 : 0;
        if (Math.abs(rise - this.rise) < 1e-6 && !gsap.isTweening(this))
            return;
        gsap.to(this, { rise, duration: .18, ease: 'sine.out', overwrite: 'auto', onUpdate: () => this.apply() });
    }
    /** « No »: a short sway that dies out; in red for a mistake */
    shake(alert = false) {
        if (alert) {
            const before = this.glowLevel === 3 ? 0 : this.glowLevel;
            this.glowLevel = 3;
            this.showGlow();
            gsap.delayedCall(.9, () => {
                if (this.gone)
                    return;
                this.glowLevel = before;
                this.showGlow();
            });
        }
        gsap.fromTo(this, { sway: .2 }, { sway: 0, duration: .6, ease: 'elastic.out(1.3, .22)', onUpdate: () => this.apply() });
    }
    /**
     *  Somebody else looks at this card: it rises towards him, we only see its back.
     *  Added to wherever the card is: if it is played meanwhile, it still lands where it has to.
     */
    peekGesture() {
        gsap.timeline({ delay: .2, onUpdate: () => {
                if (!this.gone)
                    this.apply();
            } })
            .to(this, { peek: 1, duration: .35, ease: 'sine.out' })
            .to(this, { peek: 0, duration: .45, ease: 'sine.inOut' }, '+=.5');
    }
    /** Leaves the table: fades are not for solid things, it just goes */
    dispose() {
        this.gone = true;
        this.flight?.kill();
        gsap.killTweensOf(this);
        this.shade.material.dispose();
        this.root.removeFromParent();
        this.onChange();
    }
    /** A card whose face is not known here shows its back on both sides: nobody can tell which side is up */
    materials() {
        return [this.card ? this.skins.face(this.card, this.detail) : this.skins.back, this.skins.back, this.skins.edge];
    }
    showGlow() {
        this.glow.visible = this.glowLevel > 0;
        if (this.glowLevel > 0)
            this.glow.material = this.skins.glows[this.glowLevel - 1];
        this.onChange();
    }
    apply() {
        const p = this.pose;
        const height = p.y + this.hop + this.rise + this.peek * CARD_H * .42;
        this.root.position.set(p.x, height, p.z);
        this.root.rotation.y = p.yaw + this.sway;
        this.root.scale.setScalar(p.scale);
        // The shade stays on the cloth: it widens and fades as the card rises (the lamp then draws its real shadow)
        const lifted = Math.max(0, height - FLAT);
        const shade = this.shade.material;
        shade.opacity = Math.max(0, 1 - lifted / .03) * (1 - Math.min(1, (p.tilt + this.peek) * 1.5)) * .5 * this.shadeStrength;
        this.shade.visible = shade.opacity > .01;
        this.shade.position.y = (-height + .00012) / p.scale;
        this.shade.scale.setScalar((1 + lifted * 10) / p.scale);
        this.tilter.rotation.x = -Math.PI / 2 + p.tilt + this.peek * .95;
        this.flipper.rotation.y = p.flip * Math.PI;
        this.onChange();
    }
}
/** The draw pile: one block as high as the cards left, the back of the top card on it */
export class DrawPile {
    constructor(skins, onChange) {
        this.skins = skins;
        this.onChange = onChange;
        this.root = new Group();
        this.count = -1;
        this.mesh = new Mesh(skins.pileShape, [skins.back, skins.blank, skins.pileEdge]);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.userData.deck = true;
        this.glow = new Mesh(skins.glowShape, skins.glows[0]);
        this.glow.rotation.x = -Math.PI / 2;
        this.glow.position.y = .0003;
        this.glow.visible = false;
        this.glow.renderOrder = 3;
        this.shade = new Mesh(skins.shadeShape, new MeshBasicMaterial({ map: skins.shade, transparent: true, depthWrite: false, opacity: .75 }));
        this.shade.rotation.x = -Math.PI / 2;
        this.shade.position.y = .00012;
        this.shade.scale.setScalar(1.12);
        this.shade.renderOrder = 2;
        this.root.add(this.mesh, this.glow, this.shade);
    }
    /** Height of the top of the pile */
    get top() {
        return Math.max(1, this.count) * CARD_T;
    }
    set(count) {
        if (count === this.count)
            return;
        this.count = count;
        const height = Math.max(1, count) * CARD_T;
        this.mesh.visible = count > 0;
        this.shade.visible = count > 0;
        this.mesh.scale.z = height;
        this.mesh.position.y = height / 2;
        this.skins.pileEdge.map.repeat.set(1, Math.max(1, count) / 32);
        this.onChange();
    }
    refresh() {
        this.mesh.material = [this.skins.back, this.skins.blank, this.skins.pileEdge];
    }
    light(on) {
        if (this.glow.visible === on)
            return;
        this.glow.visible = on;
        this.onChange();
    }
    /** « Not now »: a small sideways shake */
    nope() {
        gsap.fromTo(this.root.rotation, { y: .12 }, { y: 0, duration: .5, ease: 'elastic.out(1.3, .25)', onUpdate: this.onChange });
    }
}
