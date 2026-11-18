import * as THREE from 'three';
import {CSS2DObject, CSS2DRenderer} from 'three/addons/renderers/CSS2DRenderer.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {gsap} from 'gsap';
import Card from '../Card.js';
import Dutch from '../Dutch.js';
import {SoloSession} from '../SoloSession.js';
import {back, face, SANS, SERIF} from '../table/cardArt.js';
import {setMuted, sfx, unlockAudio} from '../table/sound.js';
import {BOT_NAMES, loadSetup} from '../ui/SetupView.js';
import {Action, CardView, GameView, toCard} from '../View.js';

/**
 *  3D prototype of the game table with Three.js: a real table under a lamp, cards that turn over in 3D.
 *  The rules are the real engine; you play against the computer (SoloSession).
 */

// region Sizes (1 unit = 10 cm)
const CARD_W = .63;
const CARD_H = .88;
const GAP = .08;
/** Half sizes of the table: wide on a screen held sideways, long on an upright phone */
let RX = 5;
let RZ = 3.3;
const isUpright = () => innerWidth / innerHeight < .8;
const RAIL = .42;
const PILES_Z = -.15;
const DECK_X = -.5;
const DISCARD_X = .5;
const REVEAL_MS = 3000;
// endregion

// region Renderer, scene, camera
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);
renderer.domElement.setAttribute('aria-hidden', 'true');

const labels = new CSS2DRenderer({element: document.getElementById('labels')!});
labels.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0806');
scene.fog = new THREE.Fog('#0b0806', 14, 30);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
scene.environmentIntensity = .35;

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .1, 80);
const ANISOTROPY = renderer.capabilities.getMaxAnisotropy();
// endregion

// region Textures
function texture(canvas: HTMLCanvasElement, repeat?: number): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    // Sharp cards even seen at a grazing angle
    t.anisotropy = ANISOTROPY;
    if (repeat) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat, repeat);
    }
    return t;
}

const faces = new Map<string, THREE.CanvasTexture>();
function faceTexture(card: Card) {
    const key = `${card.value}-${card.suit}`;
    let t = faces.get(key);
    if (!t) faces.set(key, t = texture(face(card)));
    return t;
}
const backTexture = texture(back('red'));

function feltCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 1536;
    c.height = 1024;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(768, 420, 0, 768, 512, 900);
    g.addColorStop(0, '#2a9563');
    g.addColorStop(.55, '#1a6c46');
    g.addColorStop(1, '#0d4129');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - .5) * 14;
        img.data[i] += n;
        img.data[i + 1] += n;
        img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(255, 236, 190, .14)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(768, 512, 610, 400, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 236, 190, .08)';
    ctx.font = `italic 900 150px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Dutch', 768, 300);
    return c;
}

function woodCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#6b3c1c';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 90; i++) {
        const y = Math.random() * 512;
        ctx.strokeStyle = Math.random() < .5 ? 'rgba(40, 18, 5, .35)' : 'rgba(170, 110, 60, .25)';
        ctx.lineWidth = .6 + Math.random() * 2.4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x / 70 + i) * 4);
        ctx.stroke();
    }
    return c;
}
// endregion

// region Table and room
function ellipse(rx: number, rz: number): THREE.Shape {
    const s = new THREE.Shape();
    s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
    return s;
}

const tableGroup = new THREE.Group();
scene.add(tableGroup);

/** Felt, rail, inlay, body and floor, for the current size of the table */
function buildTable() {
    tableGroup.traverse(o => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    tableGroup.clear();
    [RX, RZ] = isUpright() ? [3.3, 4.6] : [5, 3.3];
    // Felt (UVs stretched over the ellipse)
    const feltGeo = new THREE.ShapeGeometry(ellipse(RX, RZ), 96);
    const pos = feltGeo.attributes.position;
    const uv = feltGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + RX) / (2 * RX), (pos.getY(i) + RZ) / (2 * RZ));
    const felt = new THREE.Mesh(feltGeo, new THREE.MeshStandardMaterial({map: texture(feltCanvas()), roughness: .95, metalness: 0}));
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    tableGroup.add(felt);

    // Wooden rail, bevelled
    const ring = ellipse(RX + RAIL, RZ + RAIL);
    ring.holes.push(ellipse(RX, RZ));
    const wood = new THREE.MeshStandardMaterial({map: texture(woodCanvas(), .35), roughness: .42, metalness: 0, envMapIntensity: 1.4});
    const rail = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, {depth: .1, bevelEnabled: true, bevelThickness: .06, bevelSize: .07, bevelSegments: 4, curveSegments: 120}), wood);
    rail.rotation.x = -Math.PI / 2;
    rail.position.y = -.04;
    rail.castShadow = true;
    rail.receiveShadow = true;
    tableGroup.add(rail);

    // Gold inlay between the rail and the felt
    const inlay = new THREE.Mesh(new THREE.RingGeometry(1, 1.006, 160), new THREE.MeshStandardMaterial({color: '#e9c46a', metalness: .9, roughness: .3}));
    inlay.scale.set(RX - .02, RZ - .02, 1);
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.y = .002;
    tableGroup.add(inlay);

    // Table body and floor
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(ellipse(RX + RAIL - .1, RZ + RAIL - .1), {depth: 1, bevelEnabled: false, curveSegments: 80}),
        new THREE.MeshStandardMaterial({color: '#3a200d', roughness: .6}));
    body.rotation.x = -Math.PI / 2;
    body.position.y = -1.06;
    tableGroup.add(body);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({color: '#1a120c', roughness: 1}));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.06;
    floor.receiveShadow = true;
    tableGroup.add(floor);

}

{
    // A warm lamp above the table, a soft fill light
    const lamp = new THREE.SpotLight('#ffe2b8', 260, 0, .62, .65, 2);
    lamp.position.set(0, 9.5, 1.2);
    lamp.target.position.set(0, 0, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.bias = -.0003;
    lamp.shadow.normalBias = .02;
    // Soft edges
    lamp.shadow.radius = 5;
    scene.add(lamp, lamp.target);
    scene.add(new THREE.HemisphereLight('#ffeedd', '#20140c', .35));
    const fill = new THREE.DirectionalLight('#c8d8ff', .35);
    fill.position.set(-4, 6, 9);
    scene.add(fill);}
// endregion

// region Cards
const cardGeometry = new THREE.PlaneGeometry(CARD_W, CARD_H);
const GOLD = new THREE.Color('#ffe2a0');

interface Target {
    pos: THREE.Vector3;
    yaw: number;
    up: boolean;
}

type Place = { zone: 'hand'; player: number; index: number } | { zone: 'discard'; top: boolean } | { zone: 'held' };

/** A card: two thin faces back to back, lying on the table; turned over by a real 3D rotation */
class Card3D {
    readonly group = new THREE.Group();
    readonly frontMat: THREE.MeshStandardMaterial;
    readonly backMat: THREE.MeshStandardMaterial;
    view: CardView;
    place: Place | null = null;
    target: Target | null = null;
    private glowTween: gsap.core.Tween | null = null;
    private glowLevel = 0;
    private moveTween: gsap.core.Tween | null = null;
    selected = false;

    constructor(view: CardView) {
        this.view = view;
        this.frontMat = new THREE.MeshStandardMaterial({map: backTexture, roughness: .42, metalness: 0, alphaTest: .5, emissive: GOLD, emissiveIntensity: 0});
        this.backMat = new THREE.MeshStandardMaterial({map: backTexture, roughness: .5, metalness: 0, alphaTest: .5, emissive: GOLD, emissiveIntensity: 0});
        const front = new THREE.Mesh(cardGeometry, this.frontMat);
        front.rotation.x = -Math.PI / 2;
        front.position.y = .0015;
        const backMesh = new THREE.Mesh(cardGeometry, this.backMat);
        backMesh.rotation.x = Math.PI / 2;
        backMesh.position.y = -.0015;
        for (const m of [front, backMesh]) {
            m.castShadow = true;
            m.receiveShadow = true;
            m.userData.card = this;
        }
        this.group.add(front, backMesh);
        // Turn (yaw) on the table first, then the flip of the card itself
        this.group.rotation.order = 'YZX';
        this.group.rotation.z = Math.PI;
        this.learn(view);
    }

    learn(view: CardView) {
        if (!view.value) return;
        this.view = view;
        const card = toCard(view);
        if (card && this.frontMat.map !== faceTexture(card)) {
            this.frontMat.map = faceTexture(card);
            this.frontMat.needsUpdate = true;
        }
    }

    get up() {
        return Math.abs(this.group.rotation.z) < Math.PI / 2;
    }

    moveTo(t: Target, delay = 0, instant = false) {
        const previous = this.target;
        this.target = t;
        const flip = t.up && this.view.value ? 0 : Math.PI;
        const yaw = nearestAngle(this.group.rotation.y, t.yaw);
        if (instant) {
            this.moveTween?.kill();
            this.group.position.copy(t.pos);
            this.group.rotation.y = yaw;
            this.group.rotation.z = flip;
            return;
        }
        const travelling = !!this.moveTween && this.moveTween.progress() < 1;
        if (previous && previous.pos.distanceTo(t.pos) < .001 && previous.yaw === t.yaw && previous.up === t.up
            && (travelling || this.group.position.distanceTo(t.pos) < .001)) return;
        const from = this.group.position.clone();
        const distance = from.distanceTo(t.pos);
        const flips = Math.abs(this.group.rotation.z - flip) > .1;
        const duration = Math.min(.75, .32 + distance * .07 + (flips ? .1 : 0));
        // Arc above the table: higher for long moves and for a flip (the card must not go through the felt)
        const height = Math.min(1.1, distance * .16) + (flips ? .38 : 0);
        const k = {v: 0};
        this.moveTween?.kill();
        gsap.killTweensOf(this.group.rotation);
        this.moveTween = gsap.to(k, {
            v: 1, duration, delay, ease: 'power2.inOut',
            onStart: () => {
                if (distance > .05) sfx.slide();
            },
            onUpdate: () => {
                this.group.position.lerpVectors(from, t.pos, k.v);
                this.group.position.y += Math.sin(k.v * Math.PI) * height;
            },
        });
        gsap.to(this.group.rotation, {y: yaw, z: flip, duration, delay, ease: 'power2.inOut', onComplete: () => flips && sfx.flip()});
    }

    /** 0 nothing, 1 can be chosen (two pulses, then steady), 2 chosen */
    glow(level: number) {
        if (level === this.glowLevel) return;
        this.glowLevel = level;
        this.glowTween?.kill();
        const mats = [this.frontMat, this.backMat];
        if (level === 0) this.glowTween = gsap.to(mats, {emissiveIntensity: 0, duration: .2});
        else if (level === 1) this.glowTween = gsap.fromTo(mats, {emissiveIntensity: .03}, {emissiveIntensity: .17, duration: .5, yoyo: true, repeat: 4});
        else this.glowTween = gsap.to(mats, {emissiveIntensity: .3, duration: .15});
    }

    shake() {
        gsap.fromTo(this.group.position, {x: this.group.position.x - .06}, {x: this.group.position.x, duration: .5, ease: 'elastic.out(1.2, .3)'});
    }

    dispose() {
        this.moveTween?.kill();
        gsap.killTweensOf(this.group.rotation);
        gsap.killTweensOf([this.frontMat, this.backMat]);
        scene.remove(this.group);
        this.frontMat.dispose();
        this.backMat.dispose();
    }
}

function nearestAngle(from: number, to: number): number {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return from + d;
}

function jitter(id: string, salt = 0): number {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    return ((h >>> 0) % 1000) / 1000 - .5;
}
// endregion

// region Seats
interface Seat {
    id: number;
    /** Centre of the hand on the table */
    pos: THREE.Vector3;
    /** Turn of the hand: its top faces the centre of the table */
    yaw: number;
    token: THREE.Mesh;
    label: CSS2DObject;
    labelEl: HTMLElement;
    ring: THREE.Mesh;
}

const seats = new Map<number, Seat>();

function seatOf(index: number, n: number) {
    // Clockwise from the player of this device (in front of the camera)
    const angle = Math.PI / 2 + index * 2 * Math.PI / n;
    const f = index === 0 ? .7 : .68;
    const pos = new THREE.Vector3(RX * f * Math.cos(angle), 0, RZ * f * Math.sin(angle));
    return {pos, yaw: Math.atan2(pos.x, pos.z)};
}

/** A point given in the frame of a seat (x to the player's right, z towards him) */
function local(seat: { pos: THREE.Vector3; yaw: number }, x: number, z: number, y = 0): THREE.Vector3 {
    return new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), seat.yaw).add(seat.pos);
}

function buildSeats(s: GameView) {
    for (const seat of seats.values()) {
        scene.remove(seat.token, seat.label, seat.ring);
        seat.labelEl.remove();
    }
    seats.clear();
    const n = s.players.length;
    const cols = Math.ceil(s.settings.cardsPerPlayer / 2);
    const handW = cols * CARD_W + (cols - 1) * GAP;
    s.players.forEach((p, index) => {
        const {pos, yaw} = seatOf(index, n);
        const token = new THREE.Mesh(new THREE.CylinderGeometry(.2, .22, .09, 40),
            new THREE.MeshStandardMaterial({color: p.color, roughness: .35, metalness: .1, emissive: GOLD, emissiveIntensity: 0}));
        token.position.copy(local({pos, yaw}, -(handW / 2 + .42), .35, .045));
        token.castShadow = true;
        token.userData.player = p.id;
        const labelEl = document.createElement('div');
        labelEl.className = 'seat-label';
        const label = new CSS2DObject(labelEl);
        label.position.copy(token.position).add(new THREE.Vector3(0, .28, 0));
        label.center.set(.5, 1);
        // Gold ring on the felt around the hand of the player whose turn it is
        const ring = new THREE.Mesh(new THREE.RingGeometry(.98, 1, 96), new THREE.MeshBasicMaterial({color: '#ffd166', transparent: true, opacity: 0, depthWrite: false}));
        ring.rotation.x = -Math.PI / 2;
        ring.scale.set(handW / 2 + .32, CARD_H + .32, 1);
        ring.rotation.z = -yaw;
        ring.position.copy(pos).setY(.003);
        scene.add(token, label, ring);
        seats.set(p.id, {id: p.id, pos, yaw, token, label, labelEl, ring});
    });
}
// endregion

// region Camera: the table framed for the screen, seen from the player's chair
function frame() {
    const aspect = innerWidth / innerHeight;
    camera.aspect = aspect;
    // Upright phone: more from above; wide screen: lower, more of a perspective
    const elevation = aspect < .8 ? 1.12 : aspect < 1.3 ? .98 : .86;
    const dir = new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation));
    const look = new THREE.Vector3(0, 0, aspect < .8 ? .55 : .35);
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 32; i++) {
        const a = i / 32 * Math.PI * 2;
        points.push(new THREE.Vector3((RX + RAIL * .5) * Math.cos(a), 0, (RZ + RAIL * .5) * Math.sin(a)));
    }
    // Room for the top bar and the banner at the top, the buttons at the bottom
    const top = 1 - 2 * (100 / innerHeight), bottom = -1 + 2 * (70 / innerHeight);
    let distance = 12;
    for (let i = 0; i < 8; i++) {
        camera.position.copy(look).addScaledVector(dir, distance);
        camera.lookAt(look);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        let need = 0;
        for (const p of points) {
            const v = p.clone().project(camera);
            need = Math.max(need, Math.abs(v.x) / .97, v.y > 0 ? v.y / top : v.y / bottom);
        }
        distance *= need;
    }
    camera.position.copy(look).addScaledVector(dir, distance);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
    // Fog only far behind the table, whatever the distance of the camera
    const fog = scene.fog as THREE.Fog;
    fog.near = distance * 1.3;
    fog.far = distance * 2.6;
}
// endregion

// region Deck and discard zone
const deck = new THREE.Group();
deck.position.set(DECK_X, 0, PILES_Z);
const deckLayers: THREE.Mesh[] = [];
for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(cardGeometry, new THREE.MeshStandardMaterial({map: backTexture, roughness: .5, alphaTest: .5, emissive: GOLD, emissiveIntensity: 0}));
    m.rotation.x = -Math.PI / 2;
    m.position.set(-i * .002, i * .006, -i * .003);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.deck = true;
    deckLayers.push(m);
    deck.add(m);
}
scene.add(deck);
const deckCountEl = document.createElement('div');
deckCountEl.className = 'deck-count';
const deckCount = new CSS2DObject(deckCountEl);
deckCount.position.set(DECK_X, 0, PILES_Z + CARD_H / 2 + .12);
scene.add(deckCount);
const discardZone = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W + .1, CARD_H + .1), new THREE.MeshBasicMaterial({color: '#000', transparent: true, opacity: .18, depthWrite: false}));
discardZone.rotation.x = -Math.PI / 2;
discardZone.position.set(DISCARD_X, .001, PILES_Z);
discardZone.userData.discard = true;
scene.add(discardZone);
// endregion

// region Game
const setup = loadSetup();
const myName = (setup.onlineName || 'Vous').slice(0, 14);
let session: SoloSession;
const sprites = new Map<string, Card3D>();
const revealed = new Map<string, { view: CardView; timer: number }>();
let pile: CardView[] = [];
let shownRound = -1;
let dealing = false;
let jackPick: string | null = null;
let throwPick: string | null = null;
let dutchArmed = false;
let lastLog: { round: number; message: string } | null = null;
let panelFor = '';

function newGame() {
    session?.close();
    const game = new Dutch({
        players: [myName, ...BOT_NAMES.slice(0, 3)],
        playerColors: [setup.onlineColor],
        peekVariant: true,
    });
    session = new SoloSession(game);
    session.on(event => {
        if (event.type === 'reveal') {
            const previous = revealed.get(event.card.id);
            if (previous) clearTimeout(previous.timer);
            revealed.set(event.card.id, {view: event.card, timer: window.setTimeout(() => {
                revealed.delete(event.card.id);
                requestSync();
            }, REVEAL_MS)});
        }
        if (event.type === 'notice') bubble(0, event.notice.text, '#ff6b6b');
        if (event.type === 'chat' && event.message.emote) bubble(event.message.seat, event.message.emote, event.message.color, true);
        requestSync();
    });
    for (const s of sprites.values()) s.dispose();
    sprites.clear();
    shownRound = -1;
    lastLog = null;
    game.startRound();
    // For the automated checks: the game, the cards, and where a point of the table is on the screen
    (window as unknown as { dutch: unknown }).dutch = {
        game, sprites,
        screen: (x: number, y: number, z: number) => {
            const v = new THREE.Vector3(x, y, z).project(camera);
            return {x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight};
        },
        deck: {x: DECK_X, z: PILES_Z}, discard: {x: DISCARD_X, z: PILES_Z},
    };
}

let queued = false;
function requestSync() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
        queued = false;
        sync();
    });
}

const mine = (id: number) => id === 0;

function sync(instant = false) {
    const s = session.state;
    if (!s) return;
    if (seats.size !== s.players.length) buildSeats(s);
    if (s.round !== shownRound) {
        for (const sprite of sprites.values()) {
            gsap.to(sprite.group.position, {x: DECK_X, z: PILES_Z, y: .2, duration: .4, delay: Math.random() * .2, ease: 'power2.in', onComplete: () => sprite.dispose()});
        }
        sprites.clear();
        pile = [];
        jackPick = throwPick = null;
        dealing = true;
        shownRound = s.round;
        panelFor = '';
        hidePanel();
    }
    const roundOver = s.phase === 'roundOver' || s.phase === 'gameOver';
    const roundFaces = new Map<string, CardView>();
    if (roundOver && s.lastResult) s.lastResult.scores.forEach(r => r.hand.forEach(c => roundFaces.set(c.id, c)));
    if (s.activeEffect?.type !== 'JACK') jackPick = null;
    const n = s.players.length;
    const cols = Math.ceil(s.settings.cardsPerPlayer / 2);
    const seen = new Set<string>();
    const put = (view: CardView, t: Target, place: Place, delay = 0) => {
        seen.add(view.id);
        let sprite = sprites.get(view.id);
        const known = view.value ? view : revealed.get(view.id)?.view ?? roundFaces.get(view.id);
        if (!sprite) {
            sprite = new Card3D(known ?? view);
            sprite.group.position.set(DECK_X, .12, PILES_Z);
            scene.add(sprite.group);
            sprites.set(view.id, sprite);
        } else if (known) sprite.learn(known);
        if (drag?.sprite !== sprite) sprite.moveTo(t, delay, instant);
        sprite.place = place;
    };

    s.players.forEach((p, seatIndex) => {
        const seat = seats.get(p.id)!;
        const rows = Math.max(2, Math.ceil(p.hand.length / cols));
        p.hand.forEach((card, index) => {
            if (!card) return;
            const col = index % cols, row = Math.floor(index / cols);
            const x = (col - (cols - 1) / 2) * (CARD_W + GAP);
            const z = (row - (rows - 1) / 2) * (CARD_H + GAP);
            const picked = throwPick === card.id;
            const up = !!card.value || revealed.has(card.id) || (roundOver && roundFaces.has(card.id));
            put(card, {pos: local(seat, x, z, picked ? .22 : 0), yaw: seat.yaw + jitter(card.id) * .05, up},
                {zone: 'hand', player: p.id, index}, dealing ? .5 + (index * n + seatIndex) * .07 : roundOver ? .15 * seatIndex + index * .06 : 0);
        });
    });
    if (s.drawn) {
        const cur = s.currentPlayerIndex;
        const seat = seats.get(cur)!;
        // Own card: next to the piles, raised; the others hold theirs above their hand
        const pos = !mine(cur) ? local(seat, 0, 0, .55)
            : isUpright() ? new THREE.Vector3(0, .35, PILES_Z + CARD_H + .5) : new THREE.Vector3(DISCARD_X + 1.15, .35, PILES_Z + .15);
        put(s.drawn.card, {pos, yaw: mine(cur) ? -.06 : seat.yaw, up: !!s.drawn.card.value}, {zone: 'held'});
    }
    const top = s.topDiscard;
    if (!top) pile = [];
    else {
        const at = pile.findIndex(c => c.id === top.id);
        pile = at >= 0 ? pile.slice(0, at + 1) : [...pile, top].slice(-8);
    }
    const visible = pile.slice(-6).filter(c => !seen.has(c.id));
    visible.forEach((card, k) => put(card, {
        pos: new THREE.Vector3(DISCARD_X + jitter(card.id, 1) * .1, .004 + k * .004, PILES_Z + jitter(card.id, 2) * .1),
        yaw: jitter(card.id, 3) * .5, up: true,
    }, {zone: 'discard', top: k === visible.length - 1}, dealing ? .5 + n * s.settings.cardsPerPlayer * .07 + .2 : 0));
    for (const [id, sprite] of sprites) {
        if (seen.has(id)) continue;
        sprites.delete(id);
        gsap.delayedCall(.6, () => sprite.dispose());
    }
    dealing = false;
    // Draw pile: thickness follows the cards left
    const layers = Math.min(deckLayers.length, Math.ceil(s.deckRemaining / 7));
    deckLayers.forEach((m, i) => m.visible = i < layers);
    deckCountEl.textContent = s.deckRemaining ? `${s.deckRemaining}` : 'vide';
    highlights(s);
    readLog(s);
    banner(s);
    actions(s);
    document.getElementById('info')!.textContent = `Manche ${s.round} · ${s.targetScore} pts`;
    if (roundOver && s.lastResult && panelFor !== `${s.round}-${s.phase}`) {
        panelFor = `${s.round}-${s.phase}`;
        gsap.delayedCall(1.8, showPanel);
    }
}

function highlights(s: GameView) {
    const effect = s.activeEffect;
    const cur = s.currentPlayerIndex;
    const running = s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played';
    const myTurn = running && mine(cur);
    const myEffect = effect && mine(effect.playerId) ? effect.type : null;
    for (const sprite of sprites.values()) {
        const place = sprite.place!;
        const inHand = place.zone === 'hand';
        const own = inHand && mine(place.player);
        let level = 0;
        if (!effect && s.phase === 'peek' && own && !s.players[0].ready) level = 1;
        else if (myEffect === 'QUEEN' && own) level = 1;
        else if (myEffect === 'JACK' && inHand && (place.player === 0 || s.dutchCallerId !== place.player)) level = jackPick === sprite.view.id ? 2 : 1;
        else if (myEffect === 'ACE' && inHand && !own && s.dutchCallerId !== place.player) level = 1;
        else if (myTurn && !effect && s.phase === 'draw' && place.zone === 'discard' && place.top) level = 1;
        else if (myTurn && !effect && s.phase === 'drawn' && (own || (place.zone === 'discard' && place.top && s.drawn?.source === 'pile'))) level = 1;
        else if (throwPick === sprite.view.id) level = 2;
        else if (throwPick && place.zone === 'discard' && place.top) level = 1;
        sprite.glow(level);
    }
    const canDraw = myTurn && s.phase === 'draw' && !effect && !s.isStuck;
    deckLayers.forEach(m => gsap.to(m.material, {emissiveIntensity: canDraw ? .22 : 0, duration: .3}));
    for (const p of s.players) {
        const seat = seats.get(p.id)!;
        const active = running && (effect ? effect.playerId === p.id : cur === p.id);
        const tokenMat = seat.token.material as THREE.MeshStandardMaterial;
        const ringMat = seat.ring.material as THREE.MeshBasicMaterial;
        if (active && !seat.labelEl.classList.contains('active')) {
            gsap.fromTo(tokenMat, {emissiveIntensity: .1}, {emissiveIntensity: .6, duration: .45, yoyo: true, repeat: 3});
            gsap.fromTo(ringMat, {opacity: 0}, {opacity: .55, duration: .35});
            gsap.fromTo(seat.token.position, {y: .045}, {y: .2, duration: .25, yoyo: true, repeat: 1, ease: 'power2.out'});
        } else if (!active && seat.labelEl.classList.contains('active')) {
            gsap.to(tokenMat, {emissiveIntensity: 0, duration: .3});
            gsap.to(ringMat, {opacity: 0, duration: .3});
        }
        seat.labelEl.classList.toggle('active', active);
        const badge = s.dutchCallerId === p.id ? '<span class="badge">DUTCH</span>' : p.locked ? '<span class="badge">BLOQUÉ</span>' : '';
        seat.labelEl.innerHTML = `${escape(p.name)}${p.id === 0 && p.name !== 'Vous' ? ' (vous)' : ''}${badge}<small>${p.score} pt${p.score > 1 ? 's' : ''}</small>`;
    }
}

function escape(text: string) {
    return text.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]!));
}
// endregion

// region Messages, banner, buttons, score panel
/** Bubbles shown now: moved back inside the screen after each frame */
const bubbles = new Set<HTMLElement>();

function keepBubblesInside() {
    for (const el of bubbles) {
        const r = el.getBoundingClientRect();
        const shift = parseFloat(el.dataset.shift ?? '0');
        const left = r.left - shift;
        const dx = Math.min(0, innerWidth - 8 - (left + r.width)) + Math.max(0, 8 - left);
        if (Math.abs(dx - shift) > .5) {
            el.dataset.shift = String(dx);
            el.style.translate = `${dx}px 0`;
        }
    }
}

function bubble(playerId: number | null, text: string, color: string, emote = false) {
    const seat = playerId === null ? undefined : seats.get(playerId);
    const holder = document.createElement('div');
    const el = document.createElement('div');
    holder.append(el);
    bubbles.add(el);
    el.className = 'bubble';
    el.style.setProperty('--c', color);
    if (emote) el.style.fontSize = '30px';
    el.textContent = text;
    const obj = new CSS2DObject(holder);
    obj.position.copy(seat ? local(seat, 0, -.2, .6) : new THREE.Vector3(0, .6, PILES_Z - .9));
    obj.center.set(.5, 1);
    scene.add(obj);
    setTimeout(() => {
        el.style.transition = 'opacity 300ms';
        el.style.opacity = '0';
        setTimeout(() => {
            scene.remove(obj);
            holder.remove();
            bubbles.delete(el);
        }, 320);
    }, emote ? 2000 : 2800);
}

const SKIP = /^(C'est au tour|Au tour|Dernier tour de|— Ronde|Chaque joueur|Fin de la ronde|Partie terminée)/;

function readLog(s: GameView) {
    const log = s.log;
    let fresh = [] as typeof log;
    if (lastLog) {
        let at = -1;
        for (let i = log.length - 1; i >= 0; i--) if (log[i].round === lastLog.round && log[i].message === lastLog.message) {
            at = i;
            break;
        }
        fresh = log.slice(at + 1);
    }
    const end = log[log.length - 1];
    lastLog = end ? {round: end.round, message: end.message} : null;
    for (const entry of fresh.slice(-5)) {
        if (entry.kind === 'good') sfx.good();
        if (entry.kind === 'bad') sfx.bad();
        if (entry.kind === 'dutch') sfx.dutch();
        if (SKIP.test(entry.message)) continue;
        const actor = s.players.find(p => entry.message.startsWith(p.name)) ?? s.players.find(p => entry.message.includes(p.name));
        if (actor?.id === 0 && entry.kind === 'info') continue;
        bubble(actor ? actor.id : null, entry.message, actor?.color ?? '#ffd166');
    }
}

function instruction(s: GameView): string {
    const effect = s.activeEffect;
    const cur = s.players[s.currentPlayerIndex];
    if (s.phase === 'peek' && !effect) return s.players[0].ready ? 'Les autres regardent leurs cartes…' : 'Regardez vos 2 cartes les plus proches de vous';
    if (s.phase === 'roundOver' || s.phase === 'gameOver') return 'Fin de la manche : on retourne les cartes';
    if (effect) {
        if (!mine(effect.playerId)) return `${s.players[effect.playerId].name} utilise ${effect.cardName}…`;
        if (effect.type === 'QUEEN') return 'Dame : touchez une de vos cartes pour la regarder';
        if (effect.type === 'JACK') return jackPick ? 'Valet : touchez la 2ᵉ carte à échanger' : 'Valet : touchez deux cartes à échanger';
        return 'As : touchez une carte d\'un adversaire, il reçoit une carte';
    }
    if (throwPick) return 'Touchez la défausse pour jeter cette carte (ou touchez-la encore pour annuler)';
    if (mine(cur.id) && s.phase === 'draw') return s.isStuck ? 'Plus rien à piocher : passez votre tour' : 'À vous : touchez la pioche, ou la défausse';
    if (mine(cur.id) && s.phase === 'drawn') return s.drawn?.source === 'pile' ? 'Touchez une de vos cartes pour l\'échanger, ou la défausse pour jeter celle-ci' : 'Touchez la carte de votre jeu à remplacer';
    if (mine(cur.id) && s.phase === 'played') return 'Finissez votre tour… ou annoncez Dutch !';
    return `Tour de ${cur.name}${s.players[0].canThrow ? ' · une carte identique ? Faites-la glisser sur la défausse' : ''}`;
}

const bannerEl = document.getElementById('banner')!;
function banner(s: GameView) {
    const text = (s.isFinalRound && s.phase !== 'roundOver' && s.phase !== 'gameOver' ? 'Dernier tour · ' : '') + instruction(s);
    if (bannerEl.textContent !== text) bannerEl.textContent = text;
}

const actionsEl = document.getElementById('actions')!;
let actionsKey = '';
function actions(s: GameView) {
    const effect = s.activeEffect;
    const running = s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played';
    const list: [string, string, () => void][] = [];
    if (effect && mine(effect.playerId)) list.push(['Passer l\'effet', 'ghost', () => act({type: 'skipEffect', playerId: 0})]);
    else if (s.phase === 'peek' && !s.players[0].ready) list.push(['Regarder mes cartes', '', () => act({type: 'peek', playerId: 0})]);
    else if (running && mine(s.currentPlayerIndex) && s.phase === 'played') {
        list.push(['Finir mon tour', '', () => act({type: 'endTurn', playerId: 0, dutch: false})]);
        if (s.dutchCallerId === null) list.push([dutchArmed ? 'Confirmer : Dutch !' : 'Dutch !', 'danger', () => {
            if (!dutchArmed) {
                dutchArmed = true;
                setTimeout(() => {
                    dutchArmed = false;
                    requestSync();
                }, 3500);
                return requestSync();
            }
            dutchArmed = false;
            act({type: 'endTurn', playerId: 0, dutch: true});
        }]);
    } else if (running && mine(s.currentPlayerIndex) && s.phase === 'draw' && s.isStuck) list.push(['Passer', '', () => act({type: 'endTurn', playerId: 0, dutch: false})]);
    const key = list.map(b => b[0]).join('|');
    if (key === actionsKey) return;
    actionsKey = key;
    actionsEl.replaceChildren(...list.map(([text, kind, onClick]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        if (kind) b.className = kind;
        b.addEventListener('click', () => {
            sfx.tap();
            onClick();
        });
        return b;
    }));
}

const panelEl = document.getElementById('panel')!;
function hidePanel() {
    panelEl.hidden = true;
}

function showPanel() {
    const s = session.state;
    const result = s?.lastResult;
    if (!s || !result) return;
    const rows = result.scores.slice().sort((a, b) => a.total - b.total).map(r => {
        const p = s.players[r.playerId];
        return `<li class="${result.winners.includes(r.playerId) ? 'win' : ''}"><span class="dot" style="background:${p.color}"></span>`
            + `<span class="who">${escape(p.name)}${r.playerId === 0 ? ' (vous)' : ''}${r.playerId === result.dutchCallerId ? ' · Dutch' : ''}</span>`
            + `<span class="pts">+${r.points}${r.penalty ? ` (+${r.penalty})` : ''}</span><span class="total">${r.total}</span></li>`;
    }).join('');
    const title = result.gameOver ? (result.winners.includes(0) ? 'Vous gagnez !' : 'Partie terminée') : `Fin de la manche ${result.round}`;
    panelEl.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="panel-title"><h2 id="panel-title">${title}</h2><ol>${rows}</ol>`
        + `<div id="actions-panel"></div></section>`;
    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = result.gameOver ? 'Nouvelle partie' : 'Manche suivante';
    Object.assign(next.style, {minHeight: '46px', borderRadius: '999px', font: `800 15px ${SANS}`, border: '1px solid #ffe7a3', background: 'linear-gradient(180deg,#ffe08a,#f2c14e 55%,#d9a531)', color: '#2a1805', cursor: 'pointer'});
    next.addEventListener('click', () => {
        hidePanel();
        if (result.gameOver) newGame();
        else act({type: 'nextRound', playerId: 0});
    });
    panelEl.querySelector('#actions-panel')!.append(next);
    panelEl.hidden = false;
    next.focus();
}
// endregion

// region Input: tap or drag cards on the table
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.3);
let drag: { sprite: Card3D; start: { x: number; y: number }; moved: boolean; canDrag: boolean } | null = null;
let pressed: THREE.Object3D | null = null;

function act(action: Action) {
    unlockAudio();
    throwPick = null;
    session.dispatch(action);
    requestSync();
}

function pick(e: PointerEvent): THREE.Object3D | null {
    pointer.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const targets: THREE.Object3D[] = [deck, discardZone];
    for (const seat of seats.values()) targets.push(seat.token);
    for (const sprite of sprites.values()) targets.push(sprite.group);
    const hits = raycaster.intersectObjects(targets, true).filter(h => h.object.visible);
    return hits[0]?.object ?? null;
}

renderer.domElement.addEventListener('pointerdown', e => {
    unlockAudio();
    const s = session.state;
    pressed = pick(e);
    const sprite = pressed?.userData.card as Card3D | undefined;
    if (!s || !sprite?.place) return;
    const place = sprite.place;
    const canDrag = (place.zone === 'hand' && mine(place.player) && s.players[0].canThrow) || (place.zone === 'held' && mine(s.currentPlayerIndex));
    drag = {sprite, start: {x: e.clientX, y: e.clientY}, moved: false, canDrag};
});

renderer.domElement.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved) {
        if (!drag.canDrag || Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) < 8) return;
        drag.moved = true;
        throwPick = null;
        gsap.killTweensOf(drag.sprite.group.rotation);
    }
    pointer.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const at = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(dragPlane, at)) {
        const g = drag.sprite.group.position;
        // Follows the finger with a little lag, tilting in the direction of the move
        const dx = at.x - g.x;
        g.lerp(at, .6);
        drag.sprite.group.rotation.x = THREE.MathUtils.clamp(dx * .8, -.4, .4);
    }
});

window.addEventListener('pointerup', () => {
    const d = drag;
    drag = null;
    const s = session.state;
    if (!s) return;
    if (d?.moved) {
        d.sprite.group.rotation.x = 0;
        const g = d.sprite.group.position;
        const place = d.sprite.place!;
        const before = s.lastMove?.seq;
        if (Math.hypot(g.x - DISCARD_X, g.z - PILES_Z) < .6) {
            if (place.zone === 'held') act({type: 'discardDrawn', playerId: 0});
            else if (place.zone === 'hand') act({type: 'throwCard', playerId: 0, cardId: d.sprite.view.id});
        } else if (place.zone === 'held') {
            const target = [...sprites.values()].find(o => o.place?.zone === 'hand' && o.place.player === 0 && o.group.position.distanceTo(g.clone().setY(0)) < .5);
            if (target) act({type: 'swapDrawn', playerId: 0, cardId: target.view.id});
        }
        if (session.state?.lastMove?.seq === before) {
            const t = d.sprite.target;
            d.sprite.target = null;
            if (t) d.sprite.moveTo(t);
        }
        return;
    }
    if (pressed) tap(pressed);
    pressed = null;
});

function tap(object: THREE.Object3D) {
    const s = session.state!;
    const effect = s.activeEffect;
    const cur = s.currentPlayerIndex;
    const myTurn = (s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played') && mine(cur);
    const sprite = object.userData.card as Card3D | undefined;
    const place = sprite?.place;
    if (object.userData.player !== undefined) {
        if (effect && mine(effect.playerId) && effect.type === 'ACE') act({type: 'aceGive', playerId: 0, targetId: object.userData.player});
        return;
    }
    if (object.userData.deck) {
        if (myTurn && s.phase === 'draw' && !effect) act({type: 'drawFromPile', playerId: 0});
        return;
    }
    const onDiscard = object.userData.discard || place?.zone === 'discard';
    if (onDiscard) {
        if (throwPick) act({type: 'throwCard', playerId: 0, cardId: throwPick});
        else if (myTurn && !effect && s.phase === 'draw') act({type: 'takeDiscard', playerId: 0});
        else if (myTurn && !effect && s.phase === 'drawn' && s.drawn?.source === 'pile') act({type: 'discardDrawn', playerId: 0});
        return;
    }
    if (!sprite || !place) return;
    if (effect && mine(effect.playerId)) {
        if (effect.type === 'QUEEN' && place.zone === 'hand' && mine(place.player)) return act({type: 'queenPeek', playerId: 0, cardId: sprite.view.id});
        if (effect.type === 'JACK' && place.zone === 'hand') {
            if (!jackPick || jackPick === sprite.view.id) {
                jackPick = jackPick === sprite.view.id ? null : sprite.view.id;
                sfx.tap();
                return requestSync();
            }
            const first = jackPick;
            jackPick = null;
            return act({type: 'jackSwap', playerId: 0, cardIdA: first, cardIdB: sprite.view.id});
        }
        if (effect.type === 'ACE' && place.zone === 'hand' && !mine(place.player)) return act({type: 'aceGive', playerId: 0, targetId: place.player});
        return sprite.shake();
    }
    if (s.phase === 'peek' && place.zone === 'hand' && mine(place.player) && !s.players[0].ready) return act({type: 'peek', playerId: 0});
    if (myTurn && s.phase === 'drawn' && place.zone === 'hand' && mine(place.player)) return act({type: 'swapDrawn', playerId: 0, cardId: sprite.view.id});
    if (place.zone === 'hand' && mine(place.player) && s.players[0].canThrow) {
        throwPick = throwPick === sprite.view.id ? null : sprite.view.id;
        sfx.tap();
        return requestSync();
    }
    sprite.shake();
}
// endregion

// region Loop, resize, sound
let upright = isUpright();

function resize() {
    renderer.setSize(innerWidth, innerHeight);
    labels.setSize(innerWidth, innerHeight);
    if (isUpright() !== upright) {
        // Phone turned: the table changes shape, everybody sits around the new one
        upright = isUpright();
        buildTable();
        if (session?.state) {
            buildSeats(session.state);
            sync(true);
        }
    }
    frame();
}
addEventListener('resize', resize);

const soundButton = document.getElementById('sound')!;
soundButton.addEventListener('click', () => {
    const muted = soundButton.getAttribute('aria-pressed') === 'true';
    setMuted(muted);
    soundButton.setAttribute('aria-pressed', String(!muted));
    soundButton.textContent = muted ? 'Son : non' : 'Son : oui';
});

if (matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.globalTimeline.timeScale(2.5);

async function start() {
    await Promise.all([
        document.fonts.load(`900 40px ${SERIF}`), document.fonts.load(`italic 900 40px ${SERIF}`), document.fonts.load(`800 16px ${SANS}`),
    ]).catch(() => undefined);
    // The back was drawn before the fonts were there: drawn again with them
    backTexture.image = back('red');
    backTexture.needsUpdate = true;
    buildTable();
    frame();
    newGame();
    document.getElementById('loading')?.remove();
    renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);
        labels.render(scene, camera);
        keepBubblesInside();
    });
}

void start();
