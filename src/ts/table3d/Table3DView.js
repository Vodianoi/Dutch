import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { gsap } from 'gsap';
import { joinNames, points, t } from '../i18n.js';
import { effectCard, logText, noticeText, toCard } from '../View.js';
import { compactFace, face, SANS, SERIF, vintageBack } from '../table/cardArt.js';
import { escape, TableChrome } from '../table/chrome.js';
import { buzz, loadPrefs } from '../table/prefs.js';
import { sfx, unlockAudio } from '../table/sound.js';
/**
 *  The game table in 3D (Three.js), in the style of an old casino: padded leather rail on mahogany,
 *  green baize printed in gold, ivory cards, clay chips for the players, a lamp above the table.
 *  Driven by a Session like the flat table: solo, online (host or player), one shared screen; 2 to 10 players.
 */
// region Sizes (1 unit = 10 cm) and shared textures
const CARD_W = .63;
const CARD_H = .88;
const GAP = .08;
const RAIL = .46;
const PILES_Z = -.15;
const DECK_X = -.5;
const DISCARD_X = .5;
const REVEAL_MS = 3000;
/** Below this size on the screen (pixels), a card shows its compact face (big rank and suit) */
const COMPACT_PX = 58;
const cardGeometry = new THREE.PlaneGeometry(CARD_W, CARD_H);
const GLOW = new THREE.Color('#ffe2a0');
const textures = new Map();
let anisotropy = 4;
function texture(key, draw, repeat) {
    let t = textures.get(key);
    if (!t) {
        t = new THREE.CanvasTexture(draw());
        t.colorSpace = THREE.SRGBColorSpace;
        // Sharp cards even seen at a grazing angle
        t.anisotropy = anisotropy;
        if (repeat) {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(repeat, repeat);
        }
        textures.set(key, t);
    }
    return t;
}
const faceTexture = (card, compact) => texture(`${compact ? 'compact' : 'face'}-${card.value}-${card.suit}`, () => compact ? compactFace(card, true) : face(card, true));
const backTexture = () => texture('back', vintageBack);
function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d')];
}
/** Green baize of an old casino table, the layout printed in gold */
function baize() {
    const [c, ctx] = canvas(2048, 2048);
    const g = ctx.createRadialGradient(1024, 900, 0, 1024, 1024, 1300);
    g.addColorStop(0, '#1f6a47');
    g.addColorStop(.6, '#134a31');
    g.addColorStop(1, '#0a2c1d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2048, 2048);
    const img = ctx.getImageData(0, 0, 2048, 2048);
    for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - .5) * 12;
        img.data[i] += n;
        img.data[i + 1] += n;
        img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    const gold = 'rgba(222, 186, 108, .5)';
    ctx.strokeStyle = gold;
    for (const [rx, ry, w] of [[780, 780, 5], [760, 760, 2]]) {
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.ellipse(1024, 1024, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.fillStyle = gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `italic 900 150px ${SERIF}`;
    ctx.fillText('Dutch', 1024, 560);
    ctx.font = `600 38px ${SERIF}`;
    ctx.fillText('LE PLUS PETIT TOTAL GAGNE', 1024, 680);
    ctx.font = `90px ${SERIF}`;
    ctx.fillText('♠   ♥   ♣   ♦', 1024, 1500);
    ctx.font = `600 34px ${SERIF}`;
    ctx.fillText('ROI ROUGE · ZÉRO POINT', 1024, 1600);
    return c;
}
function leather() {
    const [c, ctx] = canvas(512, 512);
    ctx.fillStyle = '#3d1210';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 6000; i++) {
        ctx.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '120,50,40'}, ${Math.random() * .12})`;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
    return c;
}
function mahogany() {
    const [c, ctx] = canvas(512, 512);
    ctx.fillStyle = '#4a1f10';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 110; i++) {
        const y = Math.random() * 512;
        ctx.strokeStyle = Math.random() < .5 ? 'rgba(20, 6, 2, .4)' : 'rgba(150, 70, 35, .25)';
        ctx.lineWidth = .6 + Math.random() * 2.4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32)
            ctx.lineTo(x, y + Math.sin(x / 70 + i) * 4);
        ctx.stroke();
    }
    return c;
}
/** Top of a clay casino chip in the player's colour, with white inserts */
function chipTop(color) {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(128, 128, 128, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f3ead6';
    for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.translate(128, 128);
        ctx.rotate(i * Math.PI / 3);
        ctx.fillRect(-14, -128, 28, 30);
        ctx.restore();
    }
    ctx.strokeStyle = 'rgba(243, 234, 214, .85)';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(128, 128, 76, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const g = ctx.createRadialGradient(110, 100, 10, 128, 128, 70);
    g.addColorStop(0, 'rgba(255,255,255,.18)');
    g.addColorStop(1, 'rgba(0,0,0,.12)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 66, 0, Math.PI * 2);
    ctx.fill();
    return c;
}
function chipSide(color) {
    const [c, ctx] = canvas(256, 32);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 32);
    ctx.fillStyle = '#f3ead6';
    for (let i = 0; i < 6; i++)
        ctx.fillRect(i * 256 / 6 + 8, 0, 14, 32);
    return c;
}
// endregion
// region Helpers
function nearestAngle(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI)
        d -= Math.PI * 2;
    if (d < -Math.PI)
        d += Math.PI * 2;
    return from + d;
}
function jitter(id, salt = 0) {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < id.length; i++)
        h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    return ((h >>> 0) % 1000) / 1000 - .5;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function ellipse(rx, rz) {
    const s = new THREE.Shape();
    s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
    return s;
}
/** A card: two faces back to back lying on the table, turned over by a real 3D rotation */
class Card3D {
    constructor(view) {
        this.group = new THREE.Group();
        this.place = null;
        this.target = null;
        this.compact = false;
        this.glowTween = null;
        this.glowLevel = 0;
        this.moveTween = null;
        this.view = view;
        // Matte card stock: no glare under the lamp
        this.frontMat = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: .78, metalness: 0, alphaTest: .5, emissive: GLOW, emissiveIntensity: 0 });
        this.backMat = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: .72, metalness: 0, alphaTest: .5, emissive: GLOW, emissiveIntensity: 0 });
        const front = new THREE.Mesh(cardGeometry, this.frontMat);
        front.rotation.x = -Math.PI / 2;
        front.position.y = .0015;
        const back = new THREE.Mesh(cardGeometry, this.backMat);
        back.rotation.x = Math.PI / 2;
        back.position.y = -.0015;
        for (const m of [front, back]) {
            m.castShadow = true;
            m.receiveShadow = true;
            m.userData.card = this;
        }
        this.group.add(front, back);
        // Turn on the table first (yaw), then the flip of the card itself
        this.group.rotation.order = 'YZX';
        this.group.rotation.z = Math.PI;
        this.learn(view);
    }
    learn(view) {
        if (!view.value)
            return;
        this.view = view;
        this.drawFace();
    }
    drawFace() {
        const card = toCard(this.view);
        if (!card)
            return;
        const map = faceTexture(card, this.compact);
        if (this.frontMat.map !== map) {
            this.frontMat.map = map;
            this.frontMat.needsUpdate = true;
        }
    }
    moveTo(t, delay = 0, instant = false) {
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
            this.group.position.copy(t.pos);
            this.group.rotation.set(0, yaw, flip);
            this.group.scale.setScalar(t.scale);
            return;
        }
        const travelling = !!this.moveTween && this.moveTween.progress() < 1;
        if (previous && previous.pos.distanceTo(t.pos) < .001 && previous.yaw === t.yaw && previous.up === t.up && previous.scale === t.scale
            && (travelling || this.group.position.distanceTo(t.pos) < .001))
            return;
        const from = this.group.position.clone();
        const distance = from.distanceTo(t.pos);
        const flips = Math.abs(this.group.rotation.z - flip) > .1;
        const duration = Math.min(.75, .32 + distance * .06 + (flips ? .1 : 0));
        // Arc above the table: higher for long moves and for a flip (the card must not go through the baize)
        const height = Math.min(1.1, distance * .15) + (flips ? .4 * t.scale : 0);
        const k = { v: 0 };
        this.moveTween?.kill();
        gsap.killTweensOf(this.group.rotation);
        gsap.killTweensOf(this.group.scale);
        this.moveTween = gsap.to(k, {
            v: 1, duration, delay, ease: 'power2.inOut',
            onStart: () => {
                if (distance > .05)
                    sfx.slide();
            },
            onUpdate: () => {
                this.group.position.lerpVectors(from, t.pos, k.v);
                this.group.position.y += Math.sin(k.v * Math.PI) * height;
            },
        });
        gsap.to(this.group.rotation, { x: 0, y: yaw, z: flip, duration, delay, ease: 'power2.inOut', onComplete: () => flips && sfx.flip() });
        gsap.to(this.group.scale, { x: t.scale, y: t.scale, z: t.scale, duration, delay, ease: 'power2.inOut' });
    }
    /** Back to its place (a drag that went nowhere) */
    settle() {
        const t = this.target;
        this.target = null;
        if (t)
            this.moveTo(t);
    }
    /** 0 nothing, 1 can be chosen (a few pulses, then steady), 2 chosen */
    glow(level) {
        if (level === this.glowLevel)
            return;
        this.glowLevel = level;
        this.glowTween?.kill();
        const mats = [this.frontMat, this.backMat];
        if (level === 0)
            this.glowTween = gsap.to(mats, { emissiveIntensity: 0, duration: .2 });
        else if (level === 1)
            this.glowTween = gsap.fromTo(mats, { emissiveIntensity: .02 }, { emissiveIntensity: .14, duration: .5, yoyo: true, repeat: 4 });
        else
            this.glowTween = gsap.to(mats, { emissiveIntensity: .26, duration: .15 });
    }
    shake() {
        const x = this.group.position.x;
        gsap.fromTo(this.group.position, { x: x - .06 }, { x, duration: .5, ease: 'elastic.out(1.2, .3)' });
    }
    dispose(scene) {
        this.moveTween?.kill();
        this.glowTween?.kill();
        gsap.killTweensOf([this.group.rotation, this.group.scale, this.group.position, this.frontMat, this.backMat]);
        scene.remove(this.group);
        this.frontMat.dispose();
        this.backMat.dispose();
    }
}
export class Table3DView {
    constructor(root, session, options) {
        this.session = session;
        this.options = options;
        this.prefs = loadPrefs();
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(36, 1, .1, 80);
        this.tableGroup = new THREE.Group();
        this.deck = new THREE.Group();
        this.deckLayers = [];
        this.destroyed = false;
        this.rx = 5;
        this.rz = 3.3;
        this.upright = false;
        this.seats = new Map();
        this.seatKey = '';
        this.sprites = new Map();
        this.revealed = new Map();
        this.pile = [];
        this.shownRound = -1;
        this.dealing = false;
        this.jackPick = null;
        this.throwPick = null;
        this.dutchArmed = false;
        this.dutchTimer = 0;
        this.lastLog = null;
        this.moveSeq = 0;
        this.panelFor = '';
        this.actionsKey = '';
        this.myTurnBefore = false;
        this.bubbles = new Set();
        this.syncQueued = false;
        this.drag = null;
        this.pressed = null;
        this.raycaster = new THREE.Raycaster();
        this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.3);
        this.onPointerUp = () => this.pointerUp();
        this.piles = { deck: { x: DECK_X, z: PILES_Z }, discard: { x: DISCARD_X, z: PILES_Z } };
        document.body.classList.add('in-game');
        this.screen = document.createElement('div');
        this.screen.className = 'table-screen table3d';
        // WebGL: throws if the device can't (the app then shows the flat table)
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        // A dim room: the light falls on the table only
        this.renderer.toneMappingExposure = .82;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.domElement.className = 'table3d-canvas';
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
        const labelsEl = document.createElement('div');
        labelsEl.className = 'table3d-labels';
        this.labels = new CSS2DRenderer({ element: labelsEl });
        const bar = document.createElement('div');
        bar.className = 'table-bar';
        const left = document.createElement('div');
        left.className = 'table-bar-group';
        this.info = document.createElement('span');
        this.info.className = 'table-info';
        bar.append(left, this.info);
        this.bannerEl = document.createElement('div');
        this.bannerEl.className = 'table3d-banner';
        this.bannerEl.setAttribute('role', 'status');
        this.actionsEl = document.createElement('div');
        this.actionsEl.className = 'table3d-actions';
        this.actionsEl.setAttribute('role', 'group');
        this.actionsEl.setAttribute('aria-label', t('Actions'));
        this.panelEl = document.createElement('div');
        this.panelEl.className = 'table3d-panel';
        this.panelEl.hidden = true;
        this.live = document.createElement('div');
        this.live.className = 'sr-only';
        this.live.setAttribute('aria-live', 'polite');
        this.screen.append(this.renderer.domElement, labelsEl, bar, this.bannerEl, this.actionsEl, this.panelEl, this.live);
        root.replaceChildren(this.screen);
        this.chrome = new TableChrome({
            session, screen: this.screen, bar: left, prefs: this.prefs, chatBox: options.chatBox, debug: options.debug,
            quitWarning: options.quitWarning, onQuit: options.onQuit, onTableChange: options.onTableChange,
        });
        this.buildScene();
        this.deckCount = new CSS2DObject(Object.assign(document.createElement('div'), { className: 'table3d-count' }));
        this.scene.add(this.deckCount);
        this.discardZone = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W + .12, CARD_H + .12), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: .2, depthWrite: false }));
        this.discardZone.rotation.x = -Math.PI / 2;
        this.discardZone.position.set(DISCARD_X, .001, PILES_Z);
        this.discardZone.userData.discard = true;
        this.scene.add(this.discardZone);
        const canvasEl = this.renderer.domElement;
        canvasEl.addEventListener('pointerdown', e => this.pointerDown(e));
        canvasEl.addEventListener('pointermove', e => this.pointerMove(e));
        window.addEventListener('pointerup', this.onPointerUp);
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.screen);
        this.unsubscribe = session.on(event => this.onSessionEvent(event));
        if (options.debug)
            window.table = this;
        void this.start();
    }
    async start() {
        await Promise.all([
            document.fonts.load(`900 40px ${SERIF}`), document.fonts.load(`italic 900 40px ${SERIF}`), document.fonts.load(`600 16px ${SERIF}`),
            document.fonts.load(`800 16px ${SANS}`),
        ]).catch(() => undefined);
        if (this.destroyed)
            return;
        // Drawn again now that the fonts are there
        for (const t of textures.values())
            t.dispose();
        textures.clear();
        this.resize(true);
        this.renderer.setAnimationLoop(() => {
            this.renderer.render(this.scene, this.camera);
            this.labels.render(this.scene, this.camera);
            this.keepBubblesInside();
        });
    }
    render() {
        this.requestSync();
    }
    /** For automated checks: where a point of the table is on the screen, and where the piles are */
    screenOf(x, y, z) {
        const v = new THREE.Vector3(x, y, z).project(this.camera);
        const r = this.renderer.domElement.getBoundingClientRect();
        return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
    }
    destroy() {
        this.destroyed = true;
        this.unsubscribe();
        this.resizeObserver.disconnect();
        window.removeEventListener('pointerup', this.onPointerUp);
        this.revealed.forEach(r => clearTimeout(r.timer));
        clearTimeout(this.dutchTimer);
        this.chrome.destroy();
        this.renderer.setAnimationLoop(null);
        for (const s of this.sprites.values())
            s.dispose(this.scene);
        this.scene.traverse(o => {
            if (o instanceof THREE.Mesh && o.geometry !== cardGeometry)
                o.geometry.dispose();
        });
        this.renderer.dispose();
        document.body.classList.remove('in-game');
        this.screen.remove();
    }
    onSessionEvent(event) {
        if (event.type === 'reveal') {
            const id = event.card.id;
            const previous = this.revealed.get(id);
            if (previous)
                clearTimeout(previous.timer);
            this.revealed.set(id, { view: event.card, timer: window.setTimeout(() => {
                    this.revealed.delete(id);
                    this.requestSync();
                }, REVEAL_MS) });
        }
        if (event.type === 'notice') {
            if (event.notice.kind === 'error') {
                sfx.bad();
                buzz(this.prefs, 20);
            }
            this.bubble(this.bottomId(), noticeText(event.notice), event.notice.kind === 'error' ? '#ff6b6b' : '#ffd166');
        }
        if (event.type === 'chat' && !event.history)
            this.showChat(event.message);
        if (event.type !== 'chat')
            this.requestSync();
    }
    requestSync() {
        if (this.syncQueued)
            return;
        this.syncQueued = true;
        queueMicrotask(() => {
            this.syncQueued = false;
            if (!this.destroyed)
                this.sync();
        });
    }
    // region Helpers about the state
    get state() {
        return this.session.state;
    }
    bottomId() {
        return this.state?.viewerId ?? 0;
    }
    mine(playerId) {
        const viewer = this.state?.viewerId;
        return viewer === null || viewer === undefined || viewer === playerId;
    }
    peeker(s) {
        if (s.phase !== 'peek' || s.activeEffect)
            return null;
        if (s.viewerId !== null)
            return s.players[s.viewerId].ready ? null : s.viewerId;
        return s.players.find(p => !p.ready)?.id ?? null;
    }
    dispatch(action) {
        unlockAudio();
        this.throwPick = null;
        this.session.dispatch(action);
    }
    // endregion
    // region Scene: room, table, lights
    buildScene() {
        const scene = this.scene;
        scene.background = new THREE.Color('#090605');
        scene.fog = new THREE.Fog('#090605', 14, 30);
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
        scene.environmentIntensity = .22;
        scene.add(this.tableGroup);
        // The lamp above the table: a warm, dim pool of light; the room stays dark
        const lamp = new THREE.SpotLight('#ffd9a8', 165, 0, .7, .85, 2);
        lamp.position.set(0, 9.5, 1);
        lamp.castShadow = true;
        lamp.shadow.mapSize.set(2048, 2048);
        lamp.shadow.bias = -.0003;
        lamp.shadow.normalBias = .02;
        lamp.shadow.radius = 5;
        scene.add(lamp, lamp.target);
        scene.add(new THREE.HemisphereLight('#ffe8cc', '#160d07', .28));
        const fill = new THREE.DirectionalLight('#ffe9c8', .25);
        fill.position.set(-3, 6, 9);
        scene.add(fill);
        // Draw pile: layers of cards, thicker when it has more cards
        this.deck.position.set(DECK_X, 0, PILES_Z);
        for (let i = 0; i < 14; i++) {
            const m = new THREE.Mesh(cardGeometry, new THREE.MeshStandardMaterial({ map: backTexture(), roughness: .72, alphaTest: .5, emissive: GLOW, emissiveIntensity: 0 }));
            m.rotation.x = -Math.PI / 2;
            m.position.set(-i * .002, i * .006, -i * .003);
            m.castShadow = true;
            m.receiveShadow = true;
            m.userData.deck = true;
            this.deckLayers.push(m);
            this.deck.add(m);
        }
        scene.add(this.deck);
    }
    /** Baize, padded leather rail, mahogany band and brass trim, body, floor: for the current table size */
    buildTable() {
        const g = this.tableGroup;
        g.traverse(o => {
            if (o instanceof THREE.Mesh)
                o.geometry.dispose();
        });
        g.clear();
        const { rx, rz } = this;
        const feltGeo = new THREE.ShapeGeometry(ellipse(rx, rz), 120);
        const pos = feltGeo.attributes.position, uv = feltGeo.attributes.uv;
        // Same aspect whatever the table shape: the print stays round
        const span = Math.max(rx, rz);
        for (let i = 0; i < pos.count; i++)
            uv.setXY(i, .5 + pos.getX(i) / (2 * span), .5 + pos.getY(i) / (2 * span));
        const felt = new THREE.Mesh(feltGeo, new THREE.MeshStandardMaterial({ map: texture('baize', baize), roughness: .97 }));
        felt.rotation.x = -Math.PI / 2;
        felt.receiveShadow = true;
        // Padded leather armrest
        const ring = ellipse(rx + RAIL, rz + RAIL);
        ring.holes.push(ellipse(rx + .02, rz + .02));
        const rail = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: .06, bevelEnabled: true, bevelThickness: .12, bevelSize: .1, bevelSegments: 8, curveSegments: 140 }), new THREE.MeshStandardMaterial({ map: texture('leather', leather, 1.2), roughness: .48, metalness: 0, envMapIntensity: 1.3 }));
        rail.rotation.x = -Math.PI / 2;
        rail.position.y = .02;
        rail.castShadow = true;
        rail.receiveShadow = true;
        // Mahogany band under the leather
        const band = ellipse(rx + RAIL + .14, rz + RAIL + .14);
        band.holes.push(ellipse(rx + RAIL - .05, rz + RAIL - .05));
        const wood = new THREE.Mesh(new THREE.ExtrudeGeometry(band, { depth: .16, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 2, curveSegments: 140 }), new THREE.MeshStandardMaterial({ map: texture('mahogany', mahogany, .35), roughness: .35, envMapIntensity: 1.2 }));
        wood.rotation.x = -Math.PI / 2;
        wood.position.y = -.2;
        wood.receiveShadow = true;
        // Brass trim between the baize and the leather
        const brass = new THREE.Mesh(new THREE.RingGeometry(1, 1.012, 180), new THREE.MeshStandardMaterial({ color: '#c9a050', metalness: .95, roughness: .28 }));
        brass.scale.set(rx + .01, rz + .01, 1);
        brass.rotation.x = -Math.PI / 2;
        brass.position.y = .003;
        const body = new THREE.Mesh(new THREE.ExtrudeGeometry(ellipse(rx + RAIL, rz + RAIL), { depth: 1, bevelEnabled: false, curveSegments: 90 }), new THREE.MeshStandardMaterial({ color: '#2a1209', roughness: .6 }));
        body.rotation.x = -Math.PI / 2;
        body.position.y = -1.2;
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: '#150d08', roughness: 1 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -1.2;
        floor.receiveShadow = true;
        g.add(felt, rail, wood, brass, body, floor);
    }
    // endregion
    // region Seats: everybody around the table, this device's player in front of the camera
    order(s) {
        const ids = s.players.map(p => p.id);
        const bottom = Math.max(0, ids.indexOf(this.bottomId()));
        return [...ids.slice(bottom), ...ids.slice(0, bottom)];
    }
    local(seat, x, z, y = 0) {
        return new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), seat.yaw).add(seat.pos);
    }
    buildSeats(s) {
        for (const seat of this.seats.values()) {
            this.scene.remove(seat.chip, seat.label, seat.ring);
            seat.labelEl.remove();
            seat.chip.traverse(o => {
                if (o instanceof THREE.Mesh)
                    o.material.forEach?.(m => m.dispose());
            });
        }
        this.seats.clear();
        const order = this.order(s);
        const n = order.length;
        const cols = Math.ceil(s.settings.cardsPerPlayer / 2);
        const handW = cols * CARD_W + (cols - 1) * GAP;
        const handD = 2 * CARD_H + GAP;
        const f = .69;
        // The players are spread at equal distances along the oval (equal angles would crowd its ends).
        // Each seat needs its hand and its chip: the hands get smaller when the table is crowded,
        // the own hand is bigger and takes a bigger share of the oval.
        const a = this.rx * f, b = this.rz * f;
        const steps = 720;
        const arc = [0];
        const at = (t) => new THREE.Vector2(a * Math.cos(t), b * Math.sin(t));
        for (let i = 1; i <= steps; i++) {
            const t0 = Math.PI / 2 + (i - 1) / steps * Math.PI * 2, t1 = Math.PI / 2 + i / steps * Math.PI * 2;
            arc.push(arc[i - 1] + at(t0).distanceTo(at(t1)));
        }
        const perimeter = arc[steps];
        const angleAt = (distance) => {
            const d = ((distance % perimeter) + perimeter) % perimeter;
            let i = arc.findIndex(v => v >= d);
            if (i <= 0)
                i = 1;
            const k = (d - arc[i - 1]) / (arc[i] - arc[i - 1] || 1);
            return Math.PI / 2 + (i - 1 + k) / steps * Math.PI * 2;
        };
        const need = handW + .78;
        const ownMax = this.upright ? 1.3 : 1.15;
        let otherScale = clamp((perimeter - n * .22) / (need * (n - 1 + 1.5)), .4, 1);
        // Radial room: hands must stay between the rail and the piles
        otherScale = Math.min(otherScale, clamp((Math.min(this.rx, this.rz) * .62 - 1) / handD * 1.6, .45, 1));
        let ownScale = clamp(otherScale * 1.5, Math.min(1, ownMax), ownMax);
        const chipW = (scale) => 2 * (.2 + .04 * scale) + .14;
        const place = () => {
            const ownShare = ownScale * need + .3, otherShare = otherScale * need + .22;
            // What is left of the oval is shared between the seats
            const stretch = n > 1 ? Math.max(1, perimeter / (ownShare + (n - 1) * otherShare)) : 1;
            return order.map((id, index) => {
                const along = index === 0 ? 0 : (ownShare / 2 + (index - .5) * otherShare) * stretch;
                const angle = angleAt(along);
                const scale = index === 0 ? ownScale : otherScale;
                // Own hand closer to the rail: room for the piles and the held card
                const radius = index === 0 ? .74 : f;
                const pos = new THREE.Vector3(this.rx * radius * Math.cos(angle), 0, this.rz * radius * Math.sin(angle));
                return { id, index, pos, yaw: Math.atan2(pos.x, pos.z), scale };
            });
        };
        // Footprint of a seat on the table (hand, chip on its left), turned like the seat
        const footprint = (p) => {
            const w = handW * p.scale, d = handD * p.scale, c = chipW(p.scale);
            const corners = [[-w / 2 - c, -d / 2], [w / 2 + .06, -d / 2], [w / 2 + .06, d / 2], [-w / 2 - c, d / 2]];
            return corners.map(([x, z]) => this.local(p, x, z));
        };
        const overlap = (a, b) => {
            // Separating axis test for two turned rectangles
            for (const poly of [a, b]) {
                for (let i = 0; i < 2; i++) {
                    const e = poly[i + 1].clone().sub(poly[i]);
                    const axis = new THREE.Vector2(-e.z, e.x).normalize();
                    const project = (p) => p.map(v => v.x * axis.x + v.z * axis.y);
                    const pa = project(a), pb = project(b);
                    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa))
                        return false;
                }
            }
            return true;
        };
        let placed = place();
        // Shrink the hands until no two seats overlap (the own hand last)
        for (let tries = 0; tries < 30; tries++) {
            const shapes = placed.map(footprint);
            let clash = false, ownClash = false;
            for (let i = 0; i < shapes.length && !clash; i++) {
                for (let j = i + 1; j < shapes.length; j++) {
                    if (overlap(shapes[i], shapes[j])) {
                        clash = true;
                        ownClash = i === 0;
                        break;
                    }
                }
            }
            if (!clash)
                break;
            if (ownClash && ownScale > Math.max(.9, otherScale))
                ownScale *= .95;
            else if (otherScale > .32)
                otherScale *= .95;
            else
                ownScale *= .95;
            placed = place();
        }
        placed.forEach(({ id, index, pos, yaw, scale }) => {
            const p = s.players[id];
            const seat = { pos, yaw };
            // Clay chip on the left of the hand, the name above it
            const chip = new THREE.Group();
            const r = .2 + .04 * scale;
            const sideMat = new THREE.MeshStandardMaterial({ map: texture(`chip-side-${p.color}`, () => chipSide(p.color)), roughness: .55, emissive: GLOW, emissiveIntensity: 0 });
            const topMat = new THREE.MeshStandardMaterial({ map: texture(`chip-top-${p.color}`, () => chipTop(p.color)), roughness: .5, emissive: GLOW, emissiveIntensity: 0 });
            const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .07, 48), [sideMat, topMat, topMat]);
            disc.castShadow = true;
            disc.userData.player = p.id;
            chip.add(disc);
            chip.position.copy(this.local(seat, -(handW * scale / 2 + r + .14), handD * scale * .2, .035));
            const labelEl = document.createElement('div');
            labelEl.className = scale < .62 && index ? 'table3d-tag small' : 'table3d-tag';
            const label = new CSS2DObject(labelEl);
            label.position.copy(chip.position).add(new THREE.Vector3(0, .22, 0));
            label.center.set(.5, 1);
            const ring = new THREE.Mesh(new THREE.RingGeometry(.97, 1, 96), new THREE.MeshBasicMaterial({ color: '#e8c374', transparent: true, opacity: 0, depthWrite: false }));
            ring.rotation.x = -Math.PI / 2;
            ring.rotation.z = -yaw;
            ring.scale.set(handW * scale / 2 + .3, handD * scale / 2 + .3, 1);
            ring.position.copy(pos).setY(.004);
            this.scene.add(chip, label, ring);
            this.seats.set(id, { id, pos, yaw, scale, compact: false, corners: footprint({ pos, yaw, scale }), chip, label, labelEl, ring });
        });
    }
    // endregion
    // region Camera: the cards framed for the screen, seen from the player's chair
    resize(force = false) {
        const w = this.screen.clientWidth || innerWidth, h = this.screen.clientHeight || innerHeight;
        this.renderer.setSize(w, h);
        this.labels.setSize(w, h);
        const upright = w / h < .8;
        if (force || upright !== this.upright || !this.tableGroup.children.length) {
            this.upright = upright;
            // Long table on an upright phone, wide table on a screen held sideways
            [this.rx, this.rz] = upright ? [3.3, 4.7] : [5, 3.3];
            this.buildTable();
            this.seatKey = '';
        }
        this.camera.aspect = w / h;
        if (this.state)
            this.sync(true);
        else
            this.frame();
    }
    frame() {
        const w = this.screen.clientWidth || innerWidth, h = this.screen.clientHeight || innerHeight;
        const aspect = w / h;
        const camera = this.camera;
        // Short screens (phone held sideways): more from above, the height is precious
        const short = h < 500;
        const elevation = aspect < .8 ? 1.08 : short ? 1.12 : aspect < 1.3 ? .98 : .88;
        const dir = new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation));
        const look = new THREE.Vector3(0, 0, aspect < .8 ? .45 : .3);
        // What must be on the screen: every hand and chip, the piles; on a wide screen the whole table
        const points = [new THREE.Vector3(DECK_X - .5, 0, PILES_Z - .6), new THREE.Vector3(DISCARD_X + 1.6, 0, PILES_Z + .6)];
        for (const seat of this.seats.values()) {
            points.push(...seat.corners);
            // The name tag stands above the chip
            points.push(seat.chip.position.clone().add(new THREE.Vector3(0, .45, 0)));
        }
        // Big screens show the whole table; on phones the cards matter more than the rail
        if (!this.upright && !short) {
            for (let i = 0; i < 24; i++) {
                const a = i / 24 * Math.PI * 2;
                points.push(new THREE.Vector3((this.rx + RAIL * .3) * Math.cos(a), 0, (this.rz + RAIL * .3) * Math.sin(a)));
            }
        }
        // Room for the top bar and the banner at the top, the buttons at the bottom
        const top = 1 - 2 * ((short ? 50 : 104) / h), bottom = -1 + 2 * ((short ? 64 : 78) / h);
        let distance = 12;
        for (let i = 0; i < 8; i++) {
            camera.position.copy(look).addScaledVector(dir, distance);
            camera.lookAt(look);
            camera.updateProjectionMatrix();
            camera.updateMatrixWorld();
            let need = 0;
            for (const p of points) {
                const v = p.clone().project(camera);
                need = Math.max(need, Math.abs(v.x) / .96, v.y > 0 ? v.y / top : v.y / bottom);
            }
            distance *= need;
        }
        camera.position.copy(look).addScaledVector(dir, distance);
        camera.lookAt(look);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        const fog = this.scene.fog;
        fog.near = distance * 1.3;
        fog.far = distance * 2.6;
        // Cards small on the screen show their compact face
        for (const seat of this.seats.values()) {
            const a = this.local(seat, -CARD_W * seat.scale / 2, 0).project(camera);
            const b = this.local(seat, CARD_W * seat.scale / 2, 0).project(camera);
            seat.compact = Math.hypot((a.x - b.x) * w / 2, (a.y - b.y) * h / 2) < COMPACT_PX;
        }
        this.deckCount.position.set(DECK_X, 0, PILES_Z + CARD_H / 2 + .14);
    }
    // endregion
    // region Sync: every card where the state says it is
    sync(instant = false) {
        const s = this.state;
        if (!s || this.destroyed)
            return;
        const key = this.order(s).join(',') + `|${s.settings.cardsPerPlayer}|${this.rx}`;
        if (key !== this.seatKey) {
            this.seatKey = key;
            this.buildSeats(s);
            this.frame();
            instant = true;
        }
        if (s.round !== this.shownRound)
            this.startRound(s);
        const roundOver = s.phase === 'roundOver' || s.phase === 'gameOver';
        const roundFaces = new Map();
        if (roundOver && s.lastResult)
            s.lastResult.scores.forEach(r => r.hand.forEach(c => roundFaces.set(c.id, c)));
        if (s.activeEffect?.type !== 'JACK')
            this.jackPick = null;
        const n = s.players.length;
        const cols = Math.ceil(s.settings.cardsPerPlayer / 2);
        const order = this.order(s);
        const seen = new Set();
        const put = (view, t, place, delay = 0) => {
            seen.add(view.id);
            let sprite = this.sprites.get(view.id);
            const known = view.value ? view : this.revealed.get(view.id)?.view ?? roundFaces.get(view.id);
            if (!sprite) {
                sprite = new Card3D(known ?? view);
                sprite.group.position.set(DECK_X, .12, PILES_Z);
                this.scene.add(sprite.group);
                this.sprites.set(view.id, sprite);
            }
            else if (known)
                sprite.learn(known);
            if (this.drag?.sprite !== sprite)
                sprite.moveTo(t, delay, instant && !this.dealing);
            sprite.place = place;
        };
        for (const p of s.players) {
            const seat = this.seats.get(p.id);
            const seatIndex = order.indexOf(p.id);
            const rows = Math.max(2, Math.ceil(p.hand.length / cols));
            // Penalty rows: the hand stays in its place, its cards get smaller
            const fit = 2 / rows * (rows > 2 ? 1.04 : 1);
            const scale = seat.scale * Math.min(1, fit);
            p.hand.forEach((card, index) => {
                if (!card)
                    return;
                const col = index % cols, row = Math.floor(index / cols);
                const x = (col - (cols - 1) / 2) * (CARD_W + GAP) * scale;
                const z = (row - (rows - 1) / 2) * (CARD_H + GAP) * scale;
                const picked = this.throwPick === card.id;
                const up = !!card.value || this.revealed.has(card.id) || (roundOver && roundFaces.has(card.id));
                put(card, { pos: this.local(seat, x, z, picked ? .25 : 0), yaw: seat.yaw + jitter(card.id) * .05, up, scale, compact: seat.compact }, { zone: 'hand', player: p.id, index }, this.dealing ? .5 + (index * n + seatIndex) * .06 : roundOver ? .15 * seatIndex + index * .06 : 0);
            });
        }
        if (s.drawn) {
            const cur = s.currentPlayerIndex;
            const seat = this.seats.get(cur);
            const own = cur === this.bottomId();
            // Own card: next to the piles (between the piles and the hand on an upright phone); the others hold theirs above their hand
            const pos = !own ? this.local(seat, 0, 0, .55)
                : this.upright ? new THREE.Vector3(0, .35, PILES_Z + CARD_H + .5) : new THREE.Vector3(DISCARD_X + 1.15, .35, PILES_Z + .15);
            const scale = own ? Math.max(1, seat.scale * .95) : seat.scale;
            put(s.drawn.card, { pos, yaw: own ? -.06 : seat.yaw, up: !!s.drawn.card.value, scale, compact: !own && seat.compact }, { zone: 'held' });
        }
        const top = s.topDiscard;
        if (!top)
            this.pile = [];
        else {
            const at = this.pile.findIndex(c => c.id === top.id);
            this.pile = at >= 0 ? this.pile.slice(0, at + 1) : [...this.pile, top].slice(-8);
        }
        const visible = this.pile.slice(-6).filter(c => !seen.has(c.id));
        visible.forEach((card, k) => put(card, {
            pos: new THREE.Vector3(DISCARD_X + jitter(card.id, 1) * .1, .004 + k * .004, PILES_Z + jitter(card.id, 2) * .1),
            yaw: jitter(card.id, 3) * .5, up: true, scale: 1, compact: false,
        }, { zone: 'discard', top: k === visible.length - 1 }, this.dealing ? .5 + n * s.settings.cardsPerPlayer * .06 + .2 : 0));
        for (const [id, sprite] of this.sprites) {
            if (seen.has(id))
                continue;
            this.sprites.delete(id);
            gsap.delayedCall(.6, () => sprite.dispose(this.scene));
        }
        this.dealing = false;
        const layers = Math.min(this.deckLayers.length, Math.ceil(s.deckRemaining / 7));
        this.deckLayers.forEach((m, i) => m.visible = i < layers);
        this.deckCount.element.textContent = s.deckRemaining ? `${s.deckRemaining}` : 'vide';
        this.trackMove(s);
        this.highlights(s);
        this.readLog(s);
        this.banner(s);
        this.actions(s);
        this.info.textContent = t('Manche {round} · {target} pts', { round: s.round, target: s.targetScore });
        if (roundOver && s.lastResult) {
            const key = `${s.round}-${s.phase}`;
            if (this.panelFor !== key) {
                this.panelFor = key;
                gsap.delayedCall(instant ? 0 : 1.8, () => this.showPanel());
            }
        }
        else
            this.panelEl.hidden = true;
    }
    startRound(s) {
        for (const sprite of this.sprites.values()) {
            gsap.to(sprite.group.position, { x: DECK_X, z: PILES_Z, y: .2, duration: .4, delay: Math.random() * .2, ease: 'power2.in', onComplete: () => sprite.dispose(this.scene) });
        }
        this.sprites.clear();
        this.pile = [];
        this.jackPick = this.throwPick = null;
        this.dealing = this.shownRound !== -1 || s.phase === 'peek' || s.log.length < 4;
        this.shownRound = s.round;
        this.panelFor = '';
        this.panelEl.hidden = true;
    }
    trackMove(s) {
        const move = s.lastMove;
        if (!move || move.seq === this.moveSeq)
            return;
        const first = this.moveSeq === 0;
        this.moveSeq = move.seq;
        if (first)
            return;
        if (move.type === 'throw')
            sfx.good();
        if (move.type === 'wrongThrow') {
            sfx.bad();
            if (this.mine(move.playerId))
                buzz(this.prefs, [40, 30, 40]);
            this.sprites.get(move.cardIds[0])?.shake();
        }
        if (move.type === 'dutch') {
            sfx.dutch();
            buzz(this.prefs, [30, 40, 30]);
            this.bubble(null, s.viewerId === move.playerId ? t('Vous annoncez « Dutch » : dernier tour !') : t('{name} annonce « Dutch » : dernier tour !', { name: s.players[move.playerId].name }), '#e8c374');
        }
    }
    highlights(s) {
        const effect = s.activeEffect;
        const cur = s.currentPlayerIndex;
        const running = s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played';
        const myTurn = running && this.mine(cur);
        const myEffect = effect && this.mine(effect.playerId) ? effect.type : null;
        const peeker = this.peeker(s);
        for (const sprite of this.sprites.values()) {
            const place = sprite.place;
            const inHand = place.zone === 'hand';
            let level = 0;
            if (peeker !== null && inHand && place.player === peeker)
                level = 1;
            else if (myEffect === 'QUEEN' && inHand && (place.player === effect.playerId || s.settings.queenAny))
                level = 1;
            else if (myEffect === 'JACK' && inHand && (place.player === effect.playerId || s.dutchCallerId !== place.player))
                level = this.jackPick === sprite.view.id ? 2 : 1;
            else if (myEffect === 'ACE' && inHand && s.dutchCallerId !== place.player)
                level = 1;
            else if (myTurn && !effect && s.phase === 'draw' && place.zone === 'discard' && place.top)
                level = 1;
            else if (myTurn && !effect && s.phase === 'drawn' && ((inHand && place.player === cur) || (place.zone === 'discard' && place.top && s.drawn?.source === 'pile')))
                level = 1;
            else if (this.throwPick === sprite.view.id)
                level = 2;
            else if (this.throwPick && place.zone === 'discard' && place.top)
                level = 1;
            sprite.glow(level);
        }
        const canDraw = myTurn && s.phase === 'draw' && !effect && !s.isStuck;
        this.deckLayers.forEach(m => gsap.to(m.material, { emissiveIntensity: canDraw ? .14 : 0, duration: .3 }));
        const turnStarts = s.viewerId !== null && myTurn && s.phase === 'draw';
        if (turnStarts && !this.myTurnBefore)
            buzz(this.prefs, 15);
        this.myTurnBefore = turnStarts;
        for (const p of s.players) {
            const seat = this.seats.get(p.id);
            if (!seat)
                continue;
            const active = running && (effect ? effect.playerId === p.id : cur === p.id);
            const ring = seat.ring.material;
            if (active && !seat.labelEl.classList.contains('active')) {
                gsap.fromTo(ring, { opacity: 0 }, { opacity: .6, duration: .35 });
                gsap.fromTo(seat.chip.position, { y: .035 }, { y: .22, duration: .25, yoyo: true, repeat: 1, ease: 'power2.out' });
            }
            else if (!active && seat.labelEl.classList.contains('active')) {
                gsap.to(ring, { opacity: 0, duration: .3 });
            }
            seat.labelEl.classList.toggle('active', active);
            seat.labelEl.classList.toggle('offline', !p.connected);
            const badge = s.dutchCallerId === p.id ? 'DUTCH' : !p.connected ? t('HORS LIGNE') : p.locked ? t('BLOQUÉ') : '';
            const me = p.id === s.viewerId;
            const html = `${escape(me && p.name !== 'Vous' && p.name !== t('Vous') ? t('{name} (vous)', { name: p.name }) : p.name)}${badge ? `<span class="badge">${badge}</span>` : ''}<small>${points(p.score)}</small>`;
            if (seat.labelEl.innerHTML !== html)
                seat.labelEl.innerHTML = html;
        }
    }
    // endregion
    // region Messages, banner, buttons, score panel
    bubble(playerId, text, color, emote = false) {
        const seat = playerId === null ? undefined : this.seats.get(playerId);
        const holder = document.createElement('div');
        const el = document.createElement('div');
        holder.append(el);
        el.className = `table3d-bubble${emote ? ' emote' : ''}`;
        el.style.setProperty('--c', color);
        el.textContent = text;
        this.bubbles.add(el);
        const obj = new CSS2DObject(holder);
        obj.position.copy(seat ? seat.chip.position.clone().add(new THREE.Vector3(0, .7, 0)) : new THREE.Vector3(0, .8, PILES_Z - 1.1));
        obj.center.set(.5, 1);
        this.scene.add(obj);
        this.live.textContent = text;
        setTimeout(() => {
            el.classList.add('leaving');
            setTimeout(() => {
                this.scene.remove(obj);
                holder.remove();
                this.bubbles.delete(el);
            }, 320);
        }, emote ? 2200 : 2900);
    }
    /** Bubbles stay inside the screen and away from the top bar and the buttons */
    keepBubblesInside() {
        const w = this.screen.clientWidth, h = this.screen.clientHeight;
        const actions = this.actionsEl.getBoundingClientRect();
        // Under the instructions plaque
        const ceiling = Math.max(96, this.bannerEl.getBoundingClientRect().bottom - this.screen.getBoundingClientRect().top + 6);
        for (const el of this.bubbles) {
            const r = el.getBoundingClientRect();
            const sx = parseFloat(el.dataset.sx ?? '0'), sy = parseFloat(el.dataset.sy ?? '0');
            const left = r.left - sx, top = r.top - sy;
            const dx = Math.min(0, w - 8 - (left + r.width)) + Math.max(0, 8 - left);
            let dy = Math.max(0, ceiling - top);
            if (actions.height && top + r.height + dy > actions.top - 6)
                dy = actions.top - 6 - (top + r.height);
            if (Math.abs(dx - sx) > .5 || Math.abs(dy - sy) > .5) {
                el.dataset.sx = String(dx);
                el.dataset.sy = String(dy);
                el.style.translate = `${dx}px ${dy}px`;
            }
        }
    }
    showChat(message) {
        this.chrome.countUnread(message);
        if (!this.seats.has(message.seat))
            return;
        if (message.text)
            this.bubble(message.seat, `« ${message.text} »`, message.color);
        else if (message.emote) {
            sfx.tap();
            this.bubble(message.seat, message.emote, message.color, true);
        }
    }
    readLog(s) {
        const log = s.log;
        let fresh = [];
        if (this.lastLog) {
            let at = -1;
            for (let i = log.length - 1; i >= 0; i--) {
                if (log[i].round === this.lastLog.round && log[i].message === this.lastLog.message) {
                    at = i;
                    break;
                }
            }
            fresh = log.slice(at + 1);
        }
        const end = log[log.length - 1];
        this.lastLog = end ? { round: end.round, message: end.message } : null;
        for (const entry of fresh.slice(-5)) {
            // Tested on the French template: the same whatever the language of this device
            const source = entry.msg?.t ?? entry.message;
            const text = logText(entry);
            if (Table3DView.SKIP.test(source) || entry.kind === 'dutch')
                continue;
            if (Table3DView.QUIET.test(source)) {
                this.live.textContent = text;
                continue;
            }
            const actor = s.players.find(p => text.startsWith(p.name)) ?? s.players.find(p => text.includes(p.name));
            if (actor && s.viewerId === actor.id && entry.kind === 'info')
                continue;
            this.bubble(actor ? actor.id : null, text, actor?.color ?? '#e8c374');
        }
    }
    instruction(s) {
        const effect = s.activeEffect;
        const cur = s.players[s.currentPlayerIndex];
        const myTurn = this.mine(cur.id);
        const who = (id) => s.viewerId === null ? t('{name} : ', { name: s.players[id].name }) : t('À vous : ');
        const canThrow = s.viewerId !== null && s.players[s.viewerId].canThrow;
        const peeker = this.peeker(s);
        if (s.phase === 'peek' && !effect) {
            if (peeker !== null)
                return who(peeker) + t('regardez vos 2 cartes les plus proches et retenez-les');
            return t('Les autres regardent leurs cartes…') + (canThrow ? t(' · une carte identique ? Glissez-la sur la défausse') : '');
        }
        if (s.phase === 'roundOver' || s.phase === 'gameOver')
            return t('Fin de la manche : on retourne les cartes');
        let text;
        if (effect) {
            const owner = s.players[effect.playerId];
            if (!this.mine(owner.id))
                text = t('{name} utilise {card}…', { name: owner.name, card: effectCard(effect) });
            else if (effect.type === 'QUEEN')
                text = who(owner.id) + t('Dame : touchez une de vos cartes pour la regarder');
            else if (effect.type === 'JACK')
                text = this.jackPick ? t('Valet : touchez la 2ᵉ carte à échanger') : who(owner.id) + t('Valet : touchez deux cartes à échanger');
            else
                text = who(owner.id) + t('As : touchez la carte ou le jeton d\'un joueur, il reçoit une carte');
        }
        else if (this.throwPick) {
            text = t('Touchez la défausse pour jeter cette carte');
        }
        else if (myTurn && s.phase === 'draw') {
            text = s.isStuck ? t('Plus rien à piocher : passez votre tour') : who(cur.id) + t('touchez la pioche, ou la défausse');
        }
        else if (myTurn && s.phase === 'drawn') {
            text = s.drawn?.source === 'pile' ? t('Touchez une de vos cartes pour l\'échanger, ou la défausse pour jeter celle-ci') : t('Touchez la carte de votre jeu à remplacer');
        }
        else if (myTurn && s.phase === 'played') {
            text = s.dutchCallerId === null ? t('Finissez votre tour… ou annoncez Dutch !') : t('Finissez votre tour');
        }
        else {
            text = t('Tour de {name}', { name: cur.name }) + (canThrow ? t(' · une carte identique ? Glissez-la sur la défausse') : '');
        }
        return s.isFinalRound ? t('Dernier tour · {text}', { text }) : text;
    }
    banner(s) {
        const text = this.instruction(s);
        if (this.bannerEl.textContent !== text)
            this.bannerEl.textContent = text;
    }
    actions(s) {
        const effect = s.activeEffect;
        const cur = s.currentPlayerIndex;
        const running = s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played';
        const myTurn = running && this.mine(cur);
        const peeker = this.peeker(s);
        const list = [];
        if (this.throwPick) {
            const id = this.throwPick;
            const owner = s.players.find(p => p.hand.some(c => c?.id === id));
            if (owner) {
                list.push([t('Jeter sur la défausse'), '', () => this.dispatch({ type: 'throwCard', playerId: owner.id, cardId: id })]);
                list.push([t('Annuler'), 'ghost', () => {
                        this.throwPick = null;
                        this.requestSync();
                    }]);
            }
        }
        else if (effect && this.mine(effect.playerId)) {
            list.push([t('Passer l\'effet'), 'ghost', () => this.dispatch({ type: 'skipEffect', playerId: effect.playerId })]);
        }
        else if (peeker !== null) {
            list.push([s.viewerId === null ? t('{name} : regarder', { name: s.players[peeker].name }) : t('Regarder mes cartes'), '', () => this.dispatch({ type: 'peek', playerId: peeker })]);
        }
        else if (myTurn && !effect && s.phase === 'played') {
            list.push([t('Finir mon tour'), '', () => this.dispatch({ type: 'endTurn', playerId: cur, dutch: false })]);
            if (s.dutchCallerId === null) {
                list.push([this.dutchArmed ? t('Confirmer : Dutch !') : 'Dutch !', 'danger', () => {
                        if (!this.dutchArmed) {
                            this.dutchArmed = true;
                            clearTimeout(this.dutchTimer);
                            this.dutchTimer = window.setTimeout(() => {
                                this.dutchArmed = false;
                                this.requestSync();
                            }, 3500);
                            return this.requestSync();
                        }
                        this.dutchArmed = false;
                        this.dispatch({ type: 'endTurn', playerId: cur, dutch: true });
                    }]);
            }
        }
        else if (myTurn && !effect && s.phase === 'draw' && s.isStuck) {
            list.push([t('Passer'), '', () => this.dispatch({ type: 'endTurn', playerId: cur, dutch: false })]);
        }
        if (!(myTurn && s.phase === 'played'))
            this.dutchArmed = false;
        const key = list.map(b => b[0]).join('|');
        if (key === this.actionsKey)
            return;
        this.actionsKey = key;
        this.actionsEl.replaceChildren(...list.map(([text, kind, onClick]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = text;
            b.className = `table3d-button ${kind}`;
            b.addEventListener('click', () => {
                sfx.tap();
                onClick();
            });
            return b;
        }));
    }
    showPanel() {
        const s = this.state;
        const result = s?.lastResult;
        if (!s || !result || this.destroyed)
            return;
        const rows = result.scores.slice().sort((a, b) => a.total - b.total).map(r => {
            const p = s.players[r.playerId];
            return `<li class="${result.winners.includes(r.playerId) ? 'win' : ''}"><span class="dot" style="background:${p.color}"></span>`
                + `<span class="who">${escape(r.playerId === s.viewerId ? t('{name} (vous)', { name: p.name }) : p.name)}${r.playerId === result.dutchCallerId ? ' · Dutch' : ''}</span>`
                + `<span class="pts">+${r.points}${r.penalty ? ` (+${r.penalty})` : ''}</span><span class="total">${r.total}</span></li>`;
        }).join('');
        let title = t('Fin de la manche {round}', { round: result.round });
        if (result.gameOver) {
            const names = result.winners.map(id => id === s.viewerId ? t('vous') : s.players[id].name);
            title = result.winners.length === 1 && result.winners[0] === s.viewerId ? t('Vous gagnez !') : t('Victoire : {names}', { names: joinNames(names) });
        }
        this.panelEl.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="table3d-panel-title"><h2 id="table3d-panel-title">${escape(title)}</h2><ol>${rows}</ol></section>`;
        const section = this.panelEl.querySelector('section');
        if (this.session.isHost) {
            const next = document.createElement('button');
            next.type = 'button';
            next.className = 'table3d-button';
            next.textContent = result.gameOver ? t('Nouvelle partie') : t('Manche suivante');
            next.addEventListener('click', () => {
                this.panelEl.hidden = true;
                if (result.gameOver)
                    this.options.onNewGame();
                else
                    this.dispatch({ type: 'nextRound', playerId: s.viewerId ?? 0 });
            });
            section.append(next);
            this.panelEl.hidden = false;
            next.focus();
        }
        else {
            section.insertAdjacentHTML('beforeend', `<p class="wait">${escape(result.gameOver ? t('En attente d\'une nouvelle partie…') : t('En attente de {name} pour la suite…', { name: s.players[0].name }))}</p>`);
            this.panelEl.hidden = false;
        }
        this.live.textContent = `${title}. ${result.scores.map(r => `${s.players[r.playerId].name} ${r.total}`).join(', ')}`;
    }
    // endregion
    // region Input: tap or drag cards on the table
    pick(e) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const pointer = new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(pointer, this.camera);
        const targets = [this.deck, this.discardZone];
        for (const seat of this.seats.values())
            targets.push(seat.chip);
        for (const sprite of this.sprites.values())
            targets.push(sprite.group);
        const hits = this.raycaster.intersectObjects(targets, true).filter(h => h.object.visible);
        return hits[0]?.object ?? null;
    }
    pointerDown(e) {
        unlockAudio();
        const s = this.state;
        this.pressed = this.pick(e);
        const sprite = this.pressed?.userData.card;
        if (!s || !sprite?.place)
            return;
        const place = sprite.place;
        const running = s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played';
        const canDrag = (place.zone === 'hand' && this.mine(place.player) && s.players[place.player].canThrow)
            || (place.zone === 'held' && running && this.mine(s.currentPlayerIndex));
        this.drag = { sprite, start: { x: e.clientX, y: e.clientY }, moved: false, canDrag };
    }
    pointerMove(e) {
        const drag = this.drag;
        if (!drag)
            return;
        if (!drag.moved) {
            if (!drag.canDrag || Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) < 8)
                return;
            drag.moved = true;
            this.throwPick = null;
            gsap.killTweensOf(drag.sprite.group.rotation);
        }
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
        const at = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.dragPlane, at)) {
            const g = drag.sprite.group;
            // Follows the finger with a little lag, tilting in the direction of the move
            const dx = at.x - g.position.x;
            g.position.lerp(at, .6);
            g.rotation.x = clamp(dx * .8, -.4, .4);
        }
    }
    pointerUp() {
        const d = this.drag;
        this.drag = null;
        const s = this.state;
        if (!s)
            return;
        if (d?.moved) {
            d.sprite.group.rotation.x = 0;
            const g = d.sprite.group.position;
            const place = d.sprite.place;
            const cur = s.currentPlayerIndex;
            const before = s.lastMove?.seq;
            if (Math.hypot(g.x - DISCARD_X, g.z - PILES_Z) < .65) {
                if (place.zone === 'held')
                    this.dispatch({ type: 'discardDrawn', playerId: cur });
                else if (place.zone === 'hand')
                    this.dispatch({ type: 'throwCard', playerId: place.player, cardId: d.sprite.view.id });
            }
            else if (place.zone === 'held') {
                const target = [...this.sprites.values()].find(o => o.place?.zone === 'hand' && o.place.player === cur
                    && o.group.position.distanceTo(g.clone().setY(0)) < .55);
                if (target)
                    this.dispatch({ type: 'swapDrawn', playerId: cur, cardId: target.view.id });
            }
            // Nothing happened (or not yet, online): back to its place for now
            if (this.state?.lastMove?.seq === before)
                d.sprite.settle();
            return;
        }
        if (this.pressed)
            this.tap(this.pressed);
        this.pressed = null;
    }
    tap(object) {
        const s = this.state;
        const effect = s.activeEffect;
        const cur = s.currentPlayerIndex;
        const myTurn = (s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played') && this.mine(cur);
        const sprite = object.userData.card;
        const place = sprite?.place;
        if (object.userData.player !== undefined) {
            if (effect?.type === 'ACE' && this.mine(effect.playerId))
                this.dispatch({ type: 'aceGive', playerId: effect.playerId, targetId: object.userData.player });
            return;
        }
        if (object.userData.deck) {
            if (myTurn && s.phase === 'draw' && !effect)
                this.dispatch({ type: 'drawFromPile', playerId: cur });
            return;
        }
        if (object.userData.discard || place?.zone === 'discard') {
            if (this.throwPick) {
                const id = this.throwPick;
                const owner = s.players.find(p => p.hand.some(c => c?.id === id));
                if (owner)
                    this.dispatch({ type: 'throwCard', playerId: owner.id, cardId: id });
            }
            else if (myTurn && !effect && s.phase === 'draw')
                this.dispatch({ type: 'takeDiscard', playerId: cur });
            else if (myTurn && !effect && s.phase === 'drawn' && s.drawn?.source === 'pile')
                this.dispatch({ type: 'discardDrawn', playerId: cur });
            return;
        }
        if (!sprite || !place)
            return;
        if (effect) {
            if (!this.mine(effect.playerId))
                return sprite.shake();
            if (effect.type === 'QUEEN' && place.zone === 'hand' && (place.player === effect.playerId || s.settings.queenAny))
                return this.dispatch({ type: 'queenPeek', playerId: effect.playerId, cardId: sprite.view.id });
            if (effect.type === 'JACK' && place.zone === 'hand') {
                if (!this.jackPick || this.jackPick === sprite.view.id) {
                    this.jackPick = this.jackPick === sprite.view.id ? null : sprite.view.id;
                    sfx.pick();
                    return this.requestSync();
                }
                const first = this.jackPick;
                this.jackPick = null;
                return this.dispatch({ type: 'jackSwap', playerId: effect.playerId, cardIdA: first, cardIdB: sprite.view.id });
            }
            if (effect.type === 'ACE' && place.zone === 'hand')
                return this.dispatch({ type: 'aceGive', playerId: effect.playerId, targetId: place.player });
            return sprite.shake();
        }
        const peeker = this.peeker(s);
        if (peeker !== null && place.zone === 'hand' && place.player === peeker)
            return this.dispatch({ type: 'peek', playerId: peeker });
        if (myTurn && s.phase === 'drawn' && place.zone === 'hand' && place.player === cur)
            return this.dispatch({ type: 'swapDrawn', playerId: cur, cardId: sprite.view.id });
        if (place.zone === 'hand' && this.mine(place.player) && s.players[place.player].canThrow) {
            this.throwPick = this.throwPick === sprite.view.id ? null : sprite.view.id;
            sfx.pick();
            return this.requestSync();
        }
        sprite.shake();
    }
}
Table3DView.SKIP = /^(C'est au tour|Au tour|Dernier tour de|— Ronde|Chaque joueur|Fin de la ronde|Partie terminée)/;
/** Said to screen readers only: the cards show it (everybody looks at his first cards at the same time) */
Table3DView.QUIET = /regarde ses 2 dernières cartes/;
