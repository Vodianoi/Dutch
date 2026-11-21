import * as THREE from 'three';
import {CSS2DObject, CSS2DRenderer} from 'three/addons/renderers/CSS2DRenderer.js';
import {gsap} from 'gsap';
import {ChatMessage} from '../net/Protocol.js';
import {Session, SessionEvent} from '../Session.js';
import {joinNames, points, t} from '../i18n.js';
import {Action, CardView, effectCard, GameView, logText, noticeText} from '../View.js';
import {SANS, SERIF} from '../table/cardArt.js';
import {escape, TableChrome} from '../table/chrome.js';
import {buzz, loadPrefs, Prefs} from '../table/prefs.js';
import {sfx, unlockAudio} from '../table/sound.js';
import type {TableOptions} from '../table/TableView.js';
import {Card3D, CARD_H, CARD_W, CHIP_T, chipStack, Deck3D, LIE, Place, SHARED, STACK, Target} from './pieces.js';
import type {Finish} from './post.js';
import {buildChairs, buildTable, dust, empty, lights, RAIL, reflections, TableMaterials, tableMaterials} from './scenery.js';
import {setSharpness} from './surfaces.js';

/**
 *  The game table in 3D (Three.js), as real as a browser can draw it: an old casino table with a padded leather rail
 *  and brass nails on varnished mahogany, worn green baize printed in gold, linen cards with a thickness,
 *  clay chips for the players, club chairs, a rug on an old floor, one lamp above the table.
 *  Driven by a Session like the flat table: solo, online (host or player), one shared screen; 2 to 10 players.
 *  - `surfaces.ts`: what things are made of (drawn here, no picture files)
 *  - `scenery.ts`: the room, the table, the chairs, the light
 *  - `pieces.ts`: cards, draw pile, chips
 *  - `post.ts`: the finish of a photograph, on the devices that can afford it
 */

// region Sizes (1 unit = 10 cm)
const GAP = .08;
const PILES_Z = -.15;
const DECK_X = -.5;
const DISCARD_X = .5;
const REVEAL_MS = 3000;
/** Below this size on the screen (pixels), a card shows its compact face (big rank and suit) */
const COMPACT_PX = 58;
// endregion

// region Quality of the picture
/**
 *  - high: the finish of a photograph (light bleeding from the brightest glints, 4 samples per pixel), sharp shadows
 *  - medium: the same scene drawn directly, a little less sharp
 *  - low: one sample per screen point, no dust in the light
 *  A device that draws too slowly goes down by itself; `?gfx=high|medium|low` keeps one (to compare).
 */
type Quality = 'high' | 'medium' | 'low';
const LOWER: Record<Quality, Quality | null> = {high: 'medium', medium: 'low', low: null};
/** What this device could do, kept when the table is drawn again */
let remembered: Quality | null = null;

function askedQuality(): Quality | null {
    const asked = new URLSearchParams(location.search).get('gfx');
    return asked === 'high' || asked === 'medium' || asked === 'low' ? asked : null;
}

function firstQuality(): Quality {
    if (remembered) return remembered;
    const phone = matchMedia('(pointer: coarse)').matches;
    const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
    return phone && (memory <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4) ? 'medium' : 'high';
}
// endregion

// region Helpers
function jitter(id: string, salt = 0): number {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    return ((h >>> 0) % 1000) / 1000 - .5;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
// endregion

interface Seat {
    id: number;
    /** Centre of the hand on the table */
    pos: THREE.Vector3;
    /** Turn of the hand: its top faces the centre of the table */
    yaw: number;
    /** Size of the cards of this hand */
    scale: number;
    compact: boolean;
    /** Corners of the hand and the chip on the table (what the camera must show) */
    corners: THREE.Vector3[];
    chip: THREE.Group;
    label: CSS2DObject;
    labelEl: HTMLElement;
    ring: THREE.Mesh;
}

export class Table3DView {
    private readonly screen: HTMLElement;
    private readonly info: HTMLElement;
    private readonly bannerEl: HTMLElement;
    private readonly actionsEl: HTMLElement;
    private readonly panelEl: HTMLElement;
    private readonly live: HTMLElement;
    private readonly chrome: TableChrome;
    private readonly prefs: Prefs = loadPrefs();
    private readonly renderer: THREE.WebGLRenderer;
    private readonly labels: CSS2DRenderer;
    private readonly scene = new THREE.Scene();
    private readonly camera = new THREE.PerspectiveCamera(36, 1, .1, 80);
    private readonly tableGroup = new THREE.Group();
    private readonly chairs = new THREE.Group();
    private readonly deck = new Deck3D();
    private readonly deckCount: CSS2DObject;
    private materials!: TableMaterials;
    private lamp!: THREE.SpotLight;
    private dust!: THREE.Points;
    /** Everything is drawn once the fonts are there (the cards and the baize are printed with them) */
    private ready = false;
    private quality: Quality = firstQuality();
    /** Asked in the address of the page: never changed */
    private readonly pinned = askedQuality();
    private finish: Finish | null = null;
    /** Time of the last frames, to notice a device that draws too slowly */
    private pace = {last: 0, frames: 0, total: 0};
    /** Where the camera stands (set for the size of the screen), and what moves it a little around that place */
    private readonly stand = {look: new THREE.Vector3(), dir: new THREE.Vector3(0, 1, 1).normalize(), distance: 12};
    private readonly intro = {k: 0};
    private readonly sway = new THREE.Vector2();
    private readonly swayTo = new THREE.Vector2();
    private readonly still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    /** Cards that leave the table: their shadows follow them until they are gone */
    private readonly leaving = new Set<Card3D>();
    private readonly discardZone: THREE.Mesh;
    private readonly resizeObserver: ResizeObserver;
    private readonly unsubscribe: () => void;
    private destroyed = false;
    private rx = 5;
    private rz = 3.3;
    private upright = false;

    private readonly seats = new Map<number, Seat>();
    private seatKey = '';
    public readonly sprites = new Map<string, Card3D>();
    private readonly revealed = new Map<string, { view: CardView; timer: number }>();
    private pile: CardView[] = [];
    private shownRound = -1;
    private dealing = false;
    private jackPick: string | null = null;
    private throwPick: string | null = null;
    private dutchArmed = false;
    private dutchTimer = 0;
    private lastLog: { round: number; message: string } | null = null;
    private moveSeq = 0;
    private panelFor = '';
    private actionsKey = '';
    private myTurnBefore = false;
    private readonly bubbles = new Set<HTMLElement>();
    private syncQueued = false;
    private drag: { sprite: Card3D; start: { x: number; y: number }; moved: boolean; canDrag: boolean } | null = null;
    private pressed: THREE.Object3D | null = null;
    private readonly raycaster = new THREE.Raycaster();
    private readonly dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.3);
    private readonly onPointerUp = () => this.pointerUp();

    constructor(root: HTMLElement, private readonly session: Session, private readonly options: TableOptions) {
        document.body.classList.add('in-game');
        this.screen = document.createElement('div');
        this.screen.className = 'table-screen table3d';
        // WebGL: throws if the device can't (the app then shows the flat table)
        this.renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'});
        if (this.pinned) this.quality = this.pinned;
        setSharpness(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
        this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        // Like a film: bright things roll off softly instead of burning out
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        // A dim room: the light falls on the table only
        this.renderer.toneMappingExposure = .86;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.domElement.className = 'table3d-canvas';
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
        // The corners of the picture fall off into the dark, like through a lens
        const vignette = document.createElement('div');
        vignette.className = 'table3d-vignette';
        const labelsEl = document.createElement('div');
        labelsEl.className = 'table3d-labels';
        this.labels = new CSS2DRenderer({element: labelsEl});

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
        this.screen.append(this.renderer.domElement, vignette, labelsEl, bar, this.bannerEl, this.actionsEl, this.panelEl, this.live);
        root.replaceChildren(this.screen);
        this.chrome = new TableChrome({
            session, screen: this.screen, bar: left, prefs: this.prefs, chatBox: options.chatBox, debug: options.debug,
            quitWarning: options.quitWarning, onQuit: options.onQuit, onTableChange: options.onTableChange,
        });

        this.deckCount = new CSS2DObject(Object.assign(document.createElement('div'), {className: 'table3d-count'}));
        this.scene.add(this.deckCount);
        this.discardZone = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W + .12, CARD_H + .12),
            new THREE.MeshBasicMaterial({color: '#000', transparent: true, opacity: .16, depthWrite: false}));
        this.discardZone.rotation.x = -Math.PI / 2;
        this.discardZone.position.set(DISCARD_X, .0008, PILES_Z);
        this.discardZone.userData.discard = true;
        this.scene.add(this.discardZone);

        const canvasEl = this.renderer.domElement;
        canvasEl.addEventListener('pointerdown', e => this.pointerDown(e));
        canvasEl.addEventListener('pointermove', e => this.pointerMove(e));
        canvasEl.addEventListener('pointerleave', () => this.swayTo.set(0, 0));
        window.addEventListener('pointerup', this.onPointerUp);
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.screen);
        this.unsubscribe = session.on(event => this.onSessionEvent(event));
        if (options.debug) (window as unknown as { table: Table3DView }).table = this;
        void this.start();
    }

    private async start() {
        await Promise.all([
            document.fonts.load(`900 40px ${SERIF}`), document.fonts.load(`italic 900 40px ${SERIF}`), document.fonts.load(`600 16px ${SERIF}`),
            document.fonts.load(`800 16px ${SANS}`),
        ]).catch(() => undefined);
        if (this.destroyed) return;
        this.buildScene();
        this.ready = true;
        this.setQuality(this.quality);
        this.resize(true);
        // The camera comes down to the table
        if (!this.still && this.prefs.speed !== 'fast') gsap.fromTo(this.intro, {k: 1}, {k: 0, duration: 2.2, ease: 'power3.out'});
        this.renderer.setAnimationLoop(time => this.tick(time));
    }

    /** One picture: the camera, the shadows of the cards, the dust, then the table and its labels */
    private tick(time: number) {
        const dt = Math.min(.1, (time - this.pace.last) / 1000 || 0);
        this.watchPace(time);
        this.sway.lerp(this.swayTo, Math.min(1, dt * 3));
        const {look, dir, distance} = this.stand;
        const camera = this.camera;
        camera.position.copy(look).addScaledVector(dir, distance * (1 + .3 * this.intro.k));
        camera.position.x += this.sway.x * .28;
        camera.position.y += this.sway.y * .14 + this.intro.k * 1.5;
        camera.lookAt(look);
        for (const sprite of this.sprites.values()) sprite.cast();
        for (const sprite of this.leaving) sprite.cast();
        this.dust.rotation.y += dt * .012;
        this.dust.position.y = Math.sin(time / 9000) * .12;
        if (this.finish) this.finish.render();
        else this.renderer.render(this.scene, camera);
        this.labels.render(this.scene, camera);
        this.keepBubblesInside();
    }

    /** A device that draws too slowly gets a simpler picture (never the other way: no flickering between two) */
    private watchPace(time: number) {
        const pace = this.pace;
        const dt = time - pace.last;
        pace.last = time;
        // Hidden page, first pictures (everything is being sent to the graphics card): not counted
        if (this.pinned || dt > 250 || ++pace.frames <= 40) return;
        pace.total += dt;
        if (pace.frames < 100) return;
        const average = pace.total / 60;
        pace.frames = 0;
        pace.total = 0;
        const lower = LOWER[this.quality];
        if (average > 27 && lower) this.setQuality(lower);
    }

    private setQuality(quality: Quality) {
        this.quality = quality;
        if (!this.pinned) remembered = quality;
        const shadows = quality === 'high' ? 2048 : 1024;
        if (this.lamp.shadow.mapSize.x !== shadows) {
            this.lamp.shadow.mapSize.set(shadows, shadows);
            this.lamp.shadow.map?.dispose();
            this.lamp.shadow.map = null;
        }
        this.dust.visible = quality !== 'low';
        if (quality !== 'high') {
            this.finish?.dispose();
            this.finish = null;
        } else if (!this.finish) {
            import('./post.js').then(module => {
                if (this.destroyed || this.quality !== 'high' || this.finish) return;
                this.finish = module.finish(this.renderer, this.scene, this.camera);
                this.resize();
            }).catch(error => console.warn('3D finish unavailable', error));
        }
        this.resize();
    }

    public render() {
        this.requestSync();
    }

    /** For automated checks: where a point of the table is on the screen, and where the piles are */
    public screenOf(x: number, y: number, z: number) {
        const v = new THREE.Vector3(x, y, z).project(this.camera);
        const r = this.renderer.domElement.getBoundingClientRect();
        return {x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height};
    }

    public readonly piles = {deck: {x: DECK_X, z: PILES_Z}, discard: {x: DISCARD_X, z: PILES_Z}};

    public destroy() {
        this.destroyed = true;
        this.unsubscribe();
        this.resizeObserver.disconnect();
        window.removeEventListener('pointerup', this.onPointerUp);
        this.revealed.forEach(r => clearTimeout(r.timer));
        clearTimeout(this.dutchTimer);
        this.chrome.destroy();
        this.renderer.setAnimationLoop(null);
        gsap.killTweensOf(this.intro);
        for (const s of [...this.sprites.values(), ...this.leaving]) s.dispose();
        this.deck.dispose();
        this.finish?.dispose();
        for (const seat of this.seats.values()) gsap.killTweensOf([seat.chip.position, seat.ring.material]);
        this.scene.traverse(o => {
            if ((o instanceof THREE.Mesh || o instanceof THREE.Points) && !SHARED.has(o.geometry)) o.geometry.dispose();
            if (o instanceof THREE.InstancedMesh) o.dispose();
        });
        this.scene.environment?.dispose();
        if (this.ready) Object.values(this.materials).forEach(m => m.dispose());
        this.renderer.dispose();
        // The graphics memory is given back now, not when the browser gets to it
        this.renderer.forceContextLoss();
        document.body.classList.remove('in-game');
        this.screen.remove();
    }

    private onSessionEvent(event: SessionEvent) {
        if (event.type === 'reveal') {
            const id = event.card.id;
            const previous = this.revealed.get(id);
            if (previous) clearTimeout(previous.timer);
            this.revealed.set(id, {view: event.card, timer: window.setTimeout(() => {
                this.revealed.delete(id);
                this.requestSync();
            }, REVEAL_MS)});
        }
        if (event.type === 'notice') {
            if (event.notice.kind === 'error') {
                sfx.bad();
                buzz(this.prefs, 20);
            }
            this.bubble(this.bottomId(), noticeText(event.notice), event.notice.kind === 'error' ? '#ff6b6b' : '#ffd166');
        }
        if (event.type === 'chat' && !event.history) this.showChat(event.message);
        if (event.type !== 'chat') this.requestSync();
    }

    private requestSync() {
        if (this.syncQueued) return;
        this.syncQueued = true;
        queueMicrotask(() => {
            this.syncQueued = false;
            if (!this.destroyed) this.sync();
        });
    }

    // region Helpers about the state
    private get state(): GameView | null {
        return this.session.state;
    }

    private bottomId(): number {
        return this.state?.viewerId ?? 0;
    }

    private mine(playerId: number): boolean {
        const viewer = this.state?.viewerId;
        return viewer === null || viewer === undefined || viewer === playerId;
    }

    private peeker(s: GameView): number | null {
        if (s.phase !== 'peek' || s.activeEffect) return null;
        if (s.viewerId !== null) return s.players[s.viewerId].ready ? null : s.viewerId;
        return s.players.find(p => !p.ready)?.id ?? null;
    }

    private dispatch(action: Action) {
        unlockAudio();
        this.throwPick = null;
        this.session.dispatch(action);
    }
    // endregion

    // region Scene: room, table, lights
    private buildScene() {
        const scene = this.scene;
        scene.background = new THREE.Color('#070504');
        scene.fog = new THREE.Fog('#070504', 20, 50);
        scene.environment = reflections(this.renderer);
        scene.environmentIntensity = .5;
        this.materials = tableMaterials();
        const light = lights(this.quality === 'high' ? 2048 : 1024);
        this.lamp = light.lamp;
        this.dust = dust();
        this.deck.group.position.set(DECK_X, 0, PILES_Z);
        scene.add(this.tableGroup, this.chairs, light.group, this.dust, this.deck.group);
    }
    // endregion

    // region Seats: everybody around the table, this device's player in front of the camera
    private order(s: GameView): number[] {
        const ids = s.players.map(p => p.id);
        const bottom = Math.max(0, ids.indexOf(this.bottomId()));
        return [...ids.slice(bottom), ...ids.slice(0, bottom)];
    }

    private local(seat: { pos: THREE.Vector3; yaw: number }, x: number, z: number, y = 0): THREE.Vector3 {
        return new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), seat.yaw).add(seat.pos);
    }

    private buildSeats(s: GameView) {
        for (const seat of this.seats.values()) {
            gsap.killTweensOf([seat.chip.position, seat.ring.material]);
            this.scene.remove(seat.chip, seat.label, seat.ring);
            seat.labelEl.remove();
            empty(seat.chip);
            seat.ring.geometry.dispose();
            (seat.ring.material as THREE.Material).dispose();
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
        const arc: number[] = [0];
        const at = (t: number) => new THREE.Vector2(a * Math.cos(t), b * Math.sin(t));
        for (let i = 1; i <= steps; i++) {
            const t0 = Math.PI / 2 + (i - 1) / steps * Math.PI * 2, t1 = Math.PI / 2 + i / steps * Math.PI * 2;
            arc.push(arc[i - 1] + at(t0).distanceTo(at(t1)));
        }
        const perimeter = arc[steps];
        const angleAt = (distance: number) => {
            const d = ((distance % perimeter) + perimeter) % perimeter;
            let i = arc.findIndex(v => v >= d);
            if (i <= 0) i = 1;
            const k = (d - arc[i - 1]) / (arc[i] - arc[i - 1] || 1);
            return Math.PI / 2 + (i - 1 + k) / steps * Math.PI * 2;
        };
        const need = handW + .78;
        const ownMax = this.upright ? 1.3 : 1.15;
        let otherScale = clamp((perimeter - n * .22) / (need * (n - 1 + 1.5)), .4, 1);
        // Radial room: hands must stay between the rail and the piles
        otherScale = Math.min(otherScale, clamp((Math.min(this.rx, this.rz) * .62 - 1) / handD * 1.6, .45, 1));
        let ownScale = clamp(otherScale * 1.5, Math.min(1, ownMax), ownMax);
        const chipW = (scale: number) => 2 * (.2 + .04 * scale) + .14;
        const place = () => {
            const ownShare = ownScale * need + .3, otherShare = otherScale * need + .22;
            // What is left of the oval is shared between the seats
            const stretch = n > 1 ? Math.max(1, perimeter / (ownShare + (n - 1) * otherShare)) : 1;
            return order.map((id, index) => {
                const along = index === 0 ? 0 : (ownShare / 2 + (index - .5) * otherShare) * stretch;
                const angle = angleAt(along);
                const scale = index === 0 ? ownScale : otherScale;
                // Own hand closer to the rail (room for the piles and the held card), but never under its cushion
                const radius = index === 0 ? Math.min(.74, (this.rz - .16 - handD * ownScale / 2) / this.rz) : f;
                const pos = new THREE.Vector3(this.rx * radius * Math.cos(angle), 0, this.rz * radius * Math.sin(angle));
                return {id, index, pos, yaw: Math.atan2(pos.x, pos.z), scale};
            });
        };
        // Footprint of a seat on the table (hand, chip on its left), turned like the seat
        const footprint = (p: { pos: THREE.Vector3; yaw: number; scale: number }) => {
            const w = handW * p.scale, d = handD * p.scale, c = chipW(p.scale);
            const corners = [[-w / 2 - c, -d / 2], [w / 2 + .06, -d / 2], [w / 2 + .06, d / 2], [-w / 2 - c, d / 2]];
            return corners.map(([x, z]) => this.local(p, x, z));
        };
        const overlap = (a: THREE.Vector3[], b: THREE.Vector3[]) => {
            // Separating axis test for two turned rectangles
            for (const poly of [a, b]) {
                for (let i = 0; i < 2; i++) {
                    const e = poly[i + 1].clone().sub(poly[i]);
                    const axis = new THREE.Vector2(-e.z, e.x).normalize();
                    const project = (p: THREE.Vector3[]) => p.map(v => v.x * axis.x + v.z * axis.y);
                    const pa = project(a), pb = project(b);
                    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
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
            if (!clash) break;
            if (ownClash && ownScale > Math.max(.9, otherScale)) ownScale *= .95;
            else if (otherScale > .32) otherScale *= .95;
            else ownScale *= .95;
            placed = place();
        }
        placed.forEach(({id, index, pos, yaw, scale}) => {
            const p = s.players[id];
            const seat = {pos, yaw};
            // A small stack of clay chips on the left of the hand, the name above it
            const chip = new THREE.Group();
            const r = .2 + .04 * scale;
            const chips = index === 0 ? 6 : 5;
            chip.add(chipStack(p.color, r, chips, p.id));
            chip.position.copy(this.local(seat, -(handW * scale / 2 + r + .14), handD * scale * .2, 0));
            const labelEl = document.createElement('div');
            labelEl.className = scale < .62 && index ? 'table3d-tag small' : 'table3d-tag';
            const label = new CSS2DObject(labelEl);
            label.position.copy(chip.position).add(new THREE.Vector3(0, chips * CHIP_T + .1, 0));
            label.center.set(.5, 1);
            const ring = new THREE.Mesh(new THREE.RingGeometry(.97, 1, 96), new THREE.MeshBasicMaterial({color: '#e8c374', transparent: true, opacity: 0, depthWrite: false}));
            ring.rotation.x = -Math.PI / 2;
            ring.rotation.z = -yaw;
            ring.scale.set(handW * scale / 2 + .3, handD * scale / 2 + .3, 1);
            ring.position.copy(pos).setY(.004);
            this.scene.add(chip, label, ring);
            this.seats.set(id, {id, pos, yaw, scale, compact: false, corners: footprint({pos, yaw, scale}), chip, label, labelEl, ring});
        });
        // A chair behind everybody else (this player's own chair is under the camera)
        buildChairs(this.chairs, placed.filter(p => p.index).map(p => p.pos), this.rx, this.rz, this.materials);
    }
    // endregion

    // region Camera: the cards framed for the screen, seen from the player's chair
    private resize(force = false) {
        const w = this.screen.clientWidth || innerWidth, h = this.screen.clientHeight || innerHeight;
        const ratio = Math.min(devicePixelRatio || 1, this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1);
        this.renderer.setPixelRatio(ratio);
        this.renderer.setSize(w, h);
        this.finish?.setSize(w, h, ratio);
        this.labels.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        if (!this.ready) return;
        const upright = w / h < .8;
        if (force || upright !== this.upright || !this.tableGroup.children.length) {
            this.upright = upright;
            // Long table on an upright phone, wide table on a screen held sideways
            [this.rx, this.rz] = upright ? [3.3, 4.7] : [5, 3.3];
            buildTable(this.tableGroup, this.rx, this.rz, this.materials);
            this.seatKey = '';
        }
        this.camera.aspect = w / h;
        if (this.state) this.sync(true);
        else this.frame();
    }

    private frame() {
        const w = this.screen.clientWidth || innerWidth, h = this.screen.clientHeight || innerHeight;
        const aspect = w / h;
        const camera = this.camera;
        // Short screens (phone held sideways): more from above, the height is precious
        const short = h < 500;
        const elevation = aspect < .8 ? 1.08 : short ? 1.12 : aspect < 1.3 ? .98 : .88;
        const dir = new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation));
        const look = new THREE.Vector3(0, 0, aspect < .8 ? .45 : .3);
        // What must be on the screen: every hand and chip, the piles; on a wide screen the whole table
        const points: THREE.Vector3[] = [new THREE.Vector3(DECK_X - .5, 0, PILES_Z - .6), new THREE.Vector3(DISCARD_X + 1.6, 0, PILES_Z + .6)];
        for (const seat of this.seats.values()) {
            points.push(...seat.corners);
            // The name tag stands above the chip
            points.push(seat.chip.position.clone().add(new THREE.Vector3(0, .45, 0)));
        }
        // Big screens show the whole table; on phones the cards matter more than the rail
        if (!this.upright && !short) {
            for (let i = 0; i < 24; i++) {
                const a = i / 24 * Math.PI * 2;
                points.push(new THREE.Vector3((this.rx + RAIL * .7) * Math.cos(a), 0, (this.rz + RAIL * .7) * Math.sin(a)));
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
        // Where the camera stands: every picture is taken from around there
        this.stand.look.copy(look);
        this.stand.dir.copy(dir);
        this.stand.distance = distance;
        // The room is lost in the dark beyond the pool of light
        const fog = this.scene.fog as THREE.Fog;
        fog.near = distance * 1.5;
        fog.far = distance * 3.8;
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
    private sync(instant = false) {
        const s = this.state;
        if (!s || this.destroyed || !this.ready) return;
        const key = this.order(s).join(',') + `|${s.settings.cardsPerPlayer}|${this.rx}`;
        if (key !== this.seatKey) {
            this.seatKey = key;
            this.buildSeats(s);
            this.frame();
            instant = true;
        }
        if (s.round !== this.shownRound) this.startRound(s);
        const roundOver = s.phase === 'roundOver' || s.phase === 'gameOver';
        const roundFaces = new Map<string, CardView>();
        if (roundOver && s.lastResult) s.lastResult.scores.forEach(r => r.hand.forEach(c => roundFaces.set(c.id, c)));
        if (s.activeEffect?.type !== 'JACK') this.jackPick = null;
        const n = s.players.length;
        const cols = Math.ceil(s.settings.cardsPerPlayer / 2);
        const order = this.order(s);
        const seen = new Set<string>();
        const put = (view: CardView, t: Target, place: Place, delay = 0) => {
            seen.add(view.id);
            let sprite = this.sprites.get(view.id);
            const known = view.value ? view : this.revealed.get(view.id)?.view ?? roundFaces.get(view.id);
            if (!sprite) {
                // A new card comes from the top of the draw pile
                sprite = new Card3D(known ?? view, this.scene);
                sprite.group.position.set(DECK_X, this.deck.height + .03, PILES_Z);
                this.sprites.set(view.id, sprite);
            } else if (known) sprite.learn(known);
            if (this.drag?.sprite !== sprite) sprite.moveTo(t, delay, instant && !this.dealing);
            sprite.place = place;
        };

        for (const p of s.players) {
            const seat = this.seats.get(p.id)!;
            const seatIndex = order.indexOf(p.id);
            const rows = Math.max(2, Math.ceil(p.hand.length / cols));
            // Penalty rows: the hand stays in its place, its cards get smaller
            const fit = 2 / rows * (rows > 2 ? 1.04 : 1);
            const scale = seat.scale * Math.min(1, fit);
            p.hand.forEach((card, index) => {
                if (!card) return;
                const col = index % cols, row = Math.floor(index / cols);
                const x = (col - (cols - 1) / 2) * (CARD_W + GAP) * scale;
                const z = (row - (rows - 1) / 2) * (CARD_H + GAP) * scale;
                const picked = this.throwPick === card.id;
                const up = !!card.value || this.revealed.has(card.id) || (roundOver && roundFaces.has(card.id));
                put(card, {pos: this.local(seat, x, z, LIE + (picked ? .25 : 0)), yaw: seat.yaw + jitter(card.id) * .05, up, scale, compact: seat.compact, floor: 0},
                    {zone: 'hand', player: p.id, index},
                    this.dealing ? .5 + (index * n + seatIndex) * .06 : roundOver ? .15 * seatIndex + index * .06 : 0);
            });
        }
        if (s.drawn) {
            const cur = s.currentPlayerIndex;
            const seat = this.seats.get(cur)!;
            const own = cur === this.bottomId();
            // Own card: next to the piles (between the piles and the hand on an upright phone); the others hold theirs above their hand
            const pos = !own ? this.local(seat, 0, 0, .55)
                : this.upright ? new THREE.Vector3(0, .35, PILES_Z + CARD_H + .5) : new THREE.Vector3(DISCARD_X + 1.15, .35, PILES_Z + .15);
            const scale = own ? Math.max(1, seat.scale * .95) : seat.scale;
            put(s.drawn.card, {pos, yaw: own ? -.06 : seat.yaw, up: !!s.drawn.card.value, scale, compact: !own && seat.compact, floor: 0}, {zone: 'held'});
        }
        const top = s.topDiscard;
        if (!top) this.pile = [];
        else {
            const at = this.pile.findIndex(c => c.id === top.id);
            this.pile = at >= 0 ? this.pile.slice(0, at + 1) : [...this.pile, top].slice(-8);
        }
        const visible = this.pile.slice(-6).filter(c => !seen.has(c.id));
        visible.forEach((card, k) => put(card, {
            pos: new THREE.Vector3(DISCARD_X + jitter(card.id, 1) * .1, LIE + k * STACK, PILES_Z + jitter(card.id, 2) * .1),
            yaw: jitter(card.id, 3) * .5, up: true, scale: 1, compact: false, floor: k * STACK,
        }, {zone: 'discard', top: k === visible.length - 1}, this.dealing ? .5 + n * s.settings.cardsPerPlayer * .06 + .2 : 0));
        for (const [id, sprite] of this.sprites) {
            if (seen.has(id)) continue;
            this.sprites.delete(id);
            this.leave(sprite, .6);
        }
        this.dealing = false;
        this.deck.count(s.deckRemaining);
        (this.deckCount.element as HTMLElement).textContent = s.deckRemaining ? `${s.deckRemaining}` : 'vide';
        this.trackMove(s);
        this.highlights(s);
        this.readLog(s);
        this.banner(s);
        this.actions(s);
        this.info.textContent = t('Manche {round} · {target} pts', {round: s.round, target: s.targetScore});
        if (roundOver && s.lastResult) {
            const key = `${s.round}-${s.phase}`;
            if (this.panelFor !== key) {
                this.panelFor = key;
                gsap.delayedCall(instant ? 0 : 1.8, () => this.showPanel());
            }
        } else this.panelEl.hidden = true;
    }

    private startRound(s: GameView) {
        // Every card is gathered back into the draw pile
        for (const sprite of this.sprites.values()) {
            gsap.killTweensOf(sprite.group.position);
            gsap.to(sprite.group.position, {x: DECK_X, z: PILES_Z, y: this.deck.height + .2, duration: .4, delay: Math.random() * .2, ease: 'power2.in'});
            this.leave(sprite, .65);
        }
        this.sprites.clear();
        this.pile = [];
        this.jackPick = this.throwPick = null;
        this.dealing = this.shownRound !== -1 || s.phase === 'peek' || s.log.length < 4;
        this.shownRound = s.round;
        this.panelFor = '';
        this.panelEl.hidden = true;
    }

    /** A card that is not in the game any more: gone after a moment, its shadow with it */
    private leave(sprite: Card3D, after: number) {
        this.leaving.add(sprite);
        gsap.delayedCall(after, () => {
            this.leaving.delete(sprite);
            sprite.dispose();
        });
    }

    private trackMove(s: GameView) {
        const move = s.lastMove;
        if (!move || move.seq === this.moveSeq) return;
        const first = this.moveSeq === 0;
        this.moveSeq = move.seq;
        if (first) return;
        if (move.type === 'throw') sfx.good();
        if (move.type === 'wrongThrow') {
            sfx.bad();
            if (this.mine(move.playerId)) buzz(this.prefs, [40, 30, 40]);
            this.sprites.get(move.cardIds[0])?.shake();
        }
        if (move.type === 'dutch') {
            sfx.dutch();
            buzz(this.prefs, [30, 40, 30]);
            this.bubble(null, s.viewerId === move.playerId ? t('Vous annoncez « Dutch » : dernier tour !') : t('{name} annonce « Dutch » : dernier tour !', {name: s.players[move.playerId].name}), '#e8c374');
        }
    }

    private highlights(s: GameView) {
        const effect = s.activeEffect;
        const cur = s.currentPlayerIndex;
        const running = s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played';
        const myTurn = running && this.mine(cur);
        const myEffect = effect && this.mine(effect.playerId) ? effect.type : null;
        const peeker = this.peeker(s);
        for (const sprite of this.sprites.values()) {
            const place = sprite.place!;
            const inHand = place.zone === 'hand';
            let level = 0;
            if (peeker !== null && inHand && place.player === peeker) level = 1;
            else if (myEffect === 'QUEEN' && inHand && (place.player === effect!.playerId || s.settings.queenAny)) level = 1;
            else if (myEffect === 'JACK' && inHand && (place.player === effect!.playerId || s.dutchCallerId !== place.player)) level = this.jackPick === sprite.view.id ? 2 : 1;
            else if (myEffect === 'ACE' && inHand && s.dutchCallerId !== place.player) level = 1;
            else if (myTurn && !effect && s.phase === 'draw' && place.zone === 'discard' && place.top) level = 1;
            else if (myTurn && !effect && s.phase === 'drawn' && ((inHand && place.player === cur) || (place.zone === 'discard' && place.top && s.drawn?.source === 'pile'))) level = 1;
            else if (this.throwPick === sprite.view.id) level = 2;
            else if (this.throwPick && place.zone === 'discard' && place.top) level = 1;
            sprite.glow(level);
        }
        const canDraw = myTurn && s.phase === 'draw' && !effect && !s.isStuck;
        this.deck.glow(canDraw);
        const turnStarts = s.viewerId !== null && myTurn && s.phase === 'draw';
        if (turnStarts && !this.myTurnBefore) buzz(this.prefs, 15);
        this.myTurnBefore = turnStarts;
        for (const p of s.players) {
            const seat = this.seats.get(p.id);
            if (!seat) continue;
            const active = running && (effect ? effect.playerId === p.id : cur === p.id);
            const ring = seat.ring.material as THREE.MeshBasicMaterial;
            if (active && !seat.labelEl.classList.contains('active')) {
                gsap.fromTo(ring, {opacity: 0}, {opacity: .6, duration: .35});
                gsap.fromTo(seat.chip.position, {y: 0}, {y: .18, duration: .25, yoyo: true, repeat: 1, ease: 'power2.out'});
            } else if (!active && seat.labelEl.classList.contains('active')) {
                gsap.to(ring, {opacity: 0, duration: .3});
            }
            seat.labelEl.classList.toggle('active', active);
            seat.labelEl.classList.toggle('offline', !p.connected);
            const badge = s.dutchCallerId === p.id ? 'DUTCH' : !p.connected ? t('HORS LIGNE') : p.locked ? t('BLOQUÉ') : '';
            const me = p.id === s.viewerId;
            const html = `${escape(me && p.name !== 'Vous' && p.name !== t('Vous') ? t('{name} (vous)', {name: p.name}) : p.name)}${badge ? `<span class="badge">${badge}</span>` : ''}<small>${points(p.score)}</small>`;
            if (seat.labelEl.innerHTML !== html) seat.labelEl.innerHTML = html;
        }
    }
    // endregion

    // region Messages, banner, buttons, score panel
    private bubble(playerId: number | null, text: string, color: string, emote = false) {
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
    private keepBubblesInside() {
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
            if (actions.height && top + r.height + dy > actions.top - 6) dy = actions.top - 6 - (top + r.height);
            if (Math.abs(dx - sx) > .5 || Math.abs(dy - sy) > .5) {
                el.dataset.sx = String(dx);
                el.dataset.sy = String(dy);
                el.style.translate = `${dx}px ${dy}px`;
            }
        }
    }

    private showChat(message: ChatMessage) {
        this.chrome.countUnread(message);
        if (!this.seats.has(message.seat)) return;
        if (message.text) this.bubble(message.seat, `« ${message.text} »`, message.color);
        else if (message.emote) {
            sfx.tap();
            this.bubble(message.seat, message.emote, message.color, true);
        }
    }

    private static readonly SKIP = /^(C'est au tour|Au tour|Dernier tour de|— Ronde|Chaque joueur|Fin de la ronde|Partie terminée)/;
    /** Said to screen readers only: the cards show it (everybody looks at his first cards at the same time) */
    private static readonly QUIET = /regarde ses 2 dernières cartes/;

    private readLog(s: GameView) {
        const log = s.log;
        let fresh = [] as typeof log;
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
        this.lastLog = end ? {round: end.round, message: end.message} : null;
        for (const entry of fresh.slice(-5)) {
            // Tested on the French template: the same whatever the language of this device
            const source = entry.msg?.t ?? entry.message;
            const text = logText(entry);
            if (Table3DView.SKIP.test(source) || entry.kind === 'dutch') continue;
            if (Table3DView.QUIET.test(source)) {
                this.live.textContent = text;
                continue;
            }
            const actor = s.players.find(p => text.startsWith(p.name)) ?? s.players.find(p => text.includes(p.name));
            if (actor && s.viewerId === actor.id && entry.kind === 'info') continue;
            this.bubble(actor ? actor.id : null, text, actor?.color ?? '#e8c374');
        }
    }

    private instruction(s: GameView): string {
        const effect = s.activeEffect;
        const cur = s.players[s.currentPlayerIndex];
        const myTurn = this.mine(cur.id);
        const who = (id: number) => s.viewerId === null ? t('{name} : ', {name: s.players[id].name}) : t('À vous : ');
        const canThrow = s.viewerId !== null && s.players[s.viewerId].canThrow;
        const peeker = this.peeker(s);
        if (s.phase === 'peek' && !effect) {
            if (peeker !== null) return who(peeker) + t('regardez vos 2 cartes les plus proches et retenez-les');
            return t('Les autres regardent leurs cartes…') + (canThrow ? t(' · une carte identique ? Glissez-la sur la défausse') : '');
        }
        if (s.phase === 'roundOver' || s.phase === 'gameOver') return t('Fin de la manche : on retourne les cartes');
        let text: string;
        if (effect) {
            const owner = s.players[effect.playerId];
            if (!this.mine(owner.id)) text = t('{name} utilise {card}…', {name: owner.name, card: effectCard(effect)});
            else if (effect.type === 'QUEEN') text = who(owner.id) + t('Dame : touchez une de vos cartes pour la regarder');
            else if (effect.type === 'JACK') text = this.jackPick ? t('Valet : touchez la 2ᵉ carte à échanger') : who(owner.id) + t('Valet : touchez deux cartes à échanger');
            else text = who(owner.id) + t('As : touchez la carte ou le jeton d\'un joueur, il reçoit une carte');
        } else if (this.throwPick) {
            text = t('Touchez la défausse pour jeter cette carte');
        } else if (myTurn && s.phase === 'draw') {
            text = s.isStuck ? t('Plus rien à piocher : passez votre tour') : who(cur.id) + t('touchez la pioche, ou la défausse');
        } else if (myTurn && s.phase === 'drawn') {
            text = s.drawn?.source === 'pile' ? t('Touchez une de vos cartes pour l\'échanger, ou la défausse pour jeter celle-ci') : t('Touchez la carte de votre jeu à remplacer');
        } else if (myTurn && s.phase === 'played') {
            text = s.dutchCallerId === null ? t('Finissez votre tour… ou annoncez Dutch !') : t('Finissez votre tour');
        } else {
            text = t('Tour de {name}', {name: cur.name}) + (canThrow ? t(' · une carte identique ? Glissez-la sur la défausse') : '');
        }
        return s.isFinalRound ? t('Dernier tour · {text}', {text}) : text;
    }

    private banner(s: GameView) {
        const text = this.instruction(s);
        if (this.bannerEl.textContent !== text) this.bannerEl.textContent = text;
    }

    private actions(s: GameView) {
        const effect = s.activeEffect;
        const cur = s.currentPlayerIndex;
        const running = s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played';
        const myTurn = running && this.mine(cur);
        const peeker = this.peeker(s);
        const list: [string, string, () => void][] = [];
        if (this.throwPick) {
            const id = this.throwPick;
            const owner = s.players.find(p => p.hand.some(c => c?.id === id));
            if (owner) {
                list.push([t('Jeter sur la défausse'), '', () => this.dispatch({type: 'throwCard', playerId: owner.id, cardId: id})]);
                list.push([t('Annuler'), 'ghost', () => {
                    this.throwPick = null;
                    this.requestSync();
                }]);
            }
        } else if (effect && this.mine(effect.playerId)) {
            list.push([t('Passer l\'effet'), 'ghost', () => this.dispatch({type: 'skipEffect', playerId: effect.playerId})]);
        } else if (peeker !== null) {
            list.push([s.viewerId === null ? t('{name} : regarder', {name: s.players[peeker].name}) : t('Regarder mes cartes'), '', () => this.dispatch({type: 'peek', playerId: peeker})]);
        } else if (myTurn && !effect && s.phase === 'played') {
            list.push([t('Finir mon tour'), '', () => this.dispatch({type: 'endTurn', playerId: cur, dutch: false})]);
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
                    this.dispatch({type: 'endTurn', playerId: cur, dutch: true});
                }]);
            }
        } else if (myTurn && !effect && s.phase === 'draw' && s.isStuck) {
            list.push([t('Passer'), '', () => this.dispatch({type: 'endTurn', playerId: cur, dutch: false})]);
        }
        if (!(myTurn && s.phase === 'played')) this.dutchArmed = false;
        const key = list.map(b => b[0]).join('|');
        if (key === this.actionsKey) return;
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

    private showPanel() {
        const s = this.state;
        const result = s?.lastResult;
        if (!s || !result || this.destroyed) return;
        const rows = result.scores.slice().sort((a, b) => a.total - b.total).map(r => {
            const p = s.players[r.playerId];
            return `<li class="${result.winners.includes(r.playerId) ? 'win' : ''}"><span class="dot" style="background:${p.color}"></span>`
                + `<span class="who">${escape(r.playerId === s.viewerId ? t('{name} (vous)', {name: p.name}) : p.name)}${r.playerId === result.dutchCallerId ? ' · Dutch' : ''}</span>`
                + `<span class="pts">+${r.points}${r.penalty ? ` (+${r.penalty})` : ''}</span><span class="total">${r.total}</span></li>`;
        }).join('');
        let title = t('Fin de la manche {round}', {round: result.round});
        if (result.gameOver) {
            const names = result.winners.map(id => id === s.viewerId ? t('vous') : s.players[id].name);
            title = result.winners.length === 1 && result.winners[0] === s.viewerId ? t('Vous gagnez !') : t('Victoire : {names}', {names: joinNames(names)});
        }
        this.panelEl.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="table3d-panel-title"><h2 id="table3d-panel-title">${escape(title)}</h2><ol>${rows}</ol></section>`;
        const section = this.panelEl.querySelector('section')!;
        if (this.session.isHost) {
            const next = document.createElement('button');
            next.type = 'button';
            next.className = 'table3d-button';
            next.textContent = result.gameOver ? t('Nouvelle partie') : t('Manche suivante');
            next.addEventListener('click', () => {
                this.panelEl.hidden = true;
                if (result.gameOver) this.options.onNewGame();
                else this.dispatch({type: 'nextRound', playerId: s.viewerId ?? 0});
            });
            section.append(next);
            this.panelEl.hidden = false;
            next.focus();
        } else {
            section.insertAdjacentHTML('beforeend', `<p class="wait">${escape(result.gameOver ? t('En attente d\'une nouvelle partie…') : t('En attente de {name} pour la suite…', {name: s.players[0].name}))}</p>`);
            this.panelEl.hidden = false;
        }
        this.live.textContent = `${title}. ${result.scores.map(r => `${s.players[r.playerId].name} ${r.total}`).join(', ')}`;
    }
    // endregion

    // region Input: tap or drag cards on the table
    private pick(e: PointerEvent): THREE.Object3D | null {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const pointer = new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(pointer, this.camera);
        const targets: THREE.Object3D[] = [this.discardZone];
        if (this.deck.group.visible) targets.push(this.deck.group);
        for (const seat of this.seats.values()) targets.push(seat.chip);
        for (const sprite of this.sprites.values()) targets.push(sprite.group);
        const hits = this.raycaster.intersectObjects(targets, true).filter(h => h.object.visible);
        return hits[0]?.object ?? null;
    }

    private pointerDown(e: PointerEvent) {
        unlockAudio();
        const s = this.state;
        this.pressed = this.pick(e);
        const sprite = this.pressed?.userData.card as Card3D | undefined;
        if (!s || !sprite?.place) return;
        const place = sprite.place;
        const running = s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played';
        const canDrag = (place.zone === 'hand' && this.mine(place.player) && s.players[place.player].canThrow)
            || (place.zone === 'held' && running && this.mine(s.currentPlayerIndex));
        this.drag = {sprite, start: {x: e.clientX, y: e.clientY}, moved: false, canDrag};
    }

    private pointerMove(e: PointerEvent) {
        const drag = this.drag;
        // The player leans a little to the side his mouse goes: the table is seen in depth
        if (e.pointerType === 'mouse' && !this.still && !drag?.moved) {
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.swayTo.set((e.clientX - rect.left) / rect.width * 2 - 1, .5 - (e.clientY - rect.top) / rect.height);
        }
        if (!drag) return;
        if (!drag.moved) {
            if (!drag.canDrag || Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) < 8) return;
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

    private pointerUp() {
        const d = this.drag;
        this.drag = null;
        const s = this.state;
        if (!s) return;
        if (d?.moved) {
            d.sprite.group.rotation.x = 0;
            const g = d.sprite.group.position;
            const place = d.sprite.place!;
            const cur = s.currentPlayerIndex;
            const before = s.lastMove?.seq;
            if (Math.hypot(g.x - DISCARD_X, g.z - PILES_Z) < .65) {
                if (place.zone === 'held') this.dispatch({type: 'discardDrawn', playerId: cur});
                else if (place.zone === 'hand') this.dispatch({type: 'throwCard', playerId: place.player, cardId: d.sprite.view.id});
            } else if (place.zone === 'held') {
                const target = [...this.sprites.values()].find(o => o.place?.zone === 'hand' && o.place.player === cur
                    && o.group.position.distanceTo(g.clone().setY(0)) < .55);
                if (target) this.dispatch({type: 'swapDrawn', playerId: cur, cardId: target.view.id});
            }
            // Nothing happened (or not yet, online): back to its place for now
            if (this.state?.lastMove?.seq === before) d.sprite.settle();
            return;
        }
        if (this.pressed) this.tap(this.pressed);
        this.pressed = null;
    }

    private tap(object: THREE.Object3D) {
        const s = this.state!;
        const effect = s.activeEffect;
        const cur = s.currentPlayerIndex;
        const myTurn = (s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played') && this.mine(cur);
        const sprite = object.userData.card as Card3D | undefined;
        const place = sprite?.place;
        if (object.userData.player !== undefined) {
            if (effect?.type === 'ACE' && this.mine(effect.playerId)) this.dispatch({type: 'aceGive', playerId: effect.playerId, targetId: object.userData.player});
            return;
        }
        if (object.userData.deck) {
            if (myTurn && s.phase === 'draw' && !effect) this.dispatch({type: 'drawFromPile', playerId: cur});
            return;
        }
        if (object.userData.discard || place?.zone === 'discard') {
            if (this.throwPick) {
                const id = this.throwPick;
                const owner = s.players.find(p => p.hand.some(c => c?.id === id));
                if (owner) this.dispatch({type: 'throwCard', playerId: owner.id, cardId: id});
            } else if (myTurn && !effect && s.phase === 'draw') this.dispatch({type: 'takeDiscard', playerId: cur});
            else if (myTurn && !effect && s.phase === 'drawn' && s.drawn?.source === 'pile') this.dispatch({type: 'discardDrawn', playerId: cur});
            return;
        }
        if (!sprite || !place) return;
        if (effect) {
            if (!this.mine(effect.playerId)) return sprite.shake();
            if (effect.type === 'QUEEN' && place.zone === 'hand' && (place.player === effect.playerId || s.settings.queenAny)) return this.dispatch({type: 'queenPeek', playerId: effect.playerId, cardId: sprite.view.id});
            if (effect.type === 'JACK' && place.zone === 'hand') {
                if (!this.jackPick || this.jackPick === sprite.view.id) {
                    this.jackPick = this.jackPick === sprite.view.id ? null : sprite.view.id;
                    sfx.pick();
                    return this.requestSync();
                }
                const first = this.jackPick;
                this.jackPick = null;
                return this.dispatch({type: 'jackSwap', playerId: effect.playerId, cardIdA: first, cardIdB: sprite.view.id});
            }
            if (effect.type === 'ACE' && place.zone === 'hand') return this.dispatch({type: 'aceGive', playerId: effect.playerId, targetId: place.player});
            return sprite.shake();
        }
        const peeker = this.peeker(s);
        if (peeker !== null && place.zone === 'hand' && place.player === peeker) return this.dispatch({type: 'peek', playerId: peeker});
        if (myTurn && s.phase === 'drawn' && place.zone === 'hand' && place.player === cur) return this.dispatch({type: 'swapDrawn', playerId: cur, cardId: sprite.view.id});
        if (place.zone === 'hand' && this.mine(place.player) && s.players[place.player].canThrow) {
            this.throwPick = this.throwPick === sprite.view.id ? null : sprite.view.id;
            sfx.pick();
            return this.requestSync();
        }
        sprite.shake();
    }
    // endregion
}
