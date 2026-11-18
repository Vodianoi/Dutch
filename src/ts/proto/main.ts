import {Application, Container, FederatedPointerEvent, Graphics, Rectangle, Sprite, Text, Texture} from 'pixi.js';
import {gsap} from 'gsap';
import Card from '../Card.js';
import Dutch, {RuleError} from '../Dutch.js';
import {loadSetup} from '../ui/SetupView.js';
import {Art, CH, CW, drawTable, makeArt, SANS, SERIF, TableShape} from './art.js';
import {Bots} from './bots.js';
import {isMuted, setMuted, sfx, unlockAudio} from './sound.js';

/**
 *  PixiJS prototype of the game screen: a real card table drawn with WebGL.
 *  The rules are the real engine (Dutch.ts); you play against 3 simple bots on this device.
 */

const YOU = 0;
const RATIO = CH / CW;
const GAP = .12;
const GOLD = 0xffd166;

// region Layout
interface Point { x: number; y: number }

interface Seat extends Point {
    /** Width of a card of this hand */
    cw: number;
    /** Extra rows of cards (penalties) grow upwards (own hand at the bottom of the screen) */
    growUp: boolean;
    avatar: Point & { r: number };
    label: 'right' | 'below';
    /** Where the drawn card is held */
    held: Point & { cw: number };
    /** Where messages about this player pop up */
    chip: Point;
}

interface Layout {
    w: number;
    h: number;
    portrait: boolean;
    ui: number;
    table: TableShape;
    seats: Seat[];
    deck: Point;
    discard: Point;
    pileW: number;
    banner: Point & { maxW: number };
    buttons: Point & { vertical: boolean };
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const handW = (cw: number, cols = 2) => cols * cw + (cols - 1) * cw * GAP;
const handH = (cw: number, rows = 2) => rows * cw * RATIO + (rows - 1) * cw * GAP;

function computeLayout(w: number, h: number, top: number): Layout {
    const pad = 12;
    const portrait = h > w * 1.05;
    const ui = clamp(Math.min(w, h) / 640, .85, 1.3);
    const seats: Seat[] = [];

    if (portrait) {
        const my = clamp(Math.min(w * .2, (h - top) * .105), 46, 110);
        const opp = clamp(Math.min(w * .115, my * .62), 26, 64);
        const pileW = my * .88;
        const r = clamp(opp * .4, 13, 20);
        const topY = top + r * 2 + 10 + handH(opp) / 2;
        const sideY = topY + Math.max(40, h * .055);
        const oppSeat = (x: number, y: number): Seat => ({
            x, y, cw: opp, growUp: false,
            avatar: {x: x - handW(opp) / 2 + r, y: y - handH(opp) / 2 - r - 6, r}, label: 'right',
            held: {x: 0, y: 0, cw: opp * 1.05},
            chip: {x, y: y + handH(opp) / 2 + 18},
        });
        const sideX = Math.max(pad + handW(opp) / 2, w * .19);
        const myY = h - pad - handH(my) / 2;
        seats[0] = {
            x: w / 2, y: myY, cw: my, growUp: true,
            avatar: {x: Math.max(pad + 24, w / 2 - handW(my) / 2 - 34), y: myY - handH(my) * .1, r: 22}, label: 'below',
            held: {x: 0, y: 0, cw: my * 1.05},
            chip: {x: w / 2, y: myY - handH(my) / 2 - 22},
        };
        seats[1] = oppSeat(sideX, sideY);
        seats[2] = oppSeat(w / 2, topY);
        seats[3] = oppSeat(w - sideX, sideY);
        const oppBottom = sideY + handH(opp) / 2;
        const myTop = myY - handH(my) / 2;
        const pilesY = oppBottom + (myTop - oppBottom) * .38;
        seats[0].held = {x: w / 2, y: pilesY + pileW * RATIO / 2 + my * 1.05 * RATIO / 2 + 12, cw: my * 1.05};
        const table = {cx: w / 2, cy: (top + h) / 2, rx: w * .5 + 6, ry: (h - top) * .47};
        for (const seat of seats.slice(1)) {
            seat.held = {x: seat.x + (table.cx - seat.x) * .4, y: seat.y + (pilesY - seat.y) * .55, cw: opp * 1.05};
        }
        return {
            w, h, portrait, ui, table, seats, pileW,
            deck: {x: w / 2 - pileW * .72, y: pilesY},
            discard: {x: w / 2 + pileW * .72, y: pilesY},
            banner: {x: w / 2, y: pilesY - pileW * RATIO / 2 - 24, maxW: w - 24},
            buttons: {x: w / 2, y: myTop - 32, vertical: false},
        };
    }

    const my = clamp(Math.min((h - top) * .15, w * .075), 38, 100);
    const opp = my * .66;
    const pileW = my * .9;
    const r = clamp(opp * .4, 13, 20);
    const myY = h - pad - handH(my) / 2;
    const topY = top + 4 + handH(opp) / 2;
    const pilesY = (topY + handH(opp) / 2 + myY - handH(my) / 2) / 2;
    const table = {cx: w / 2, cy: (top + h) / 2 + 4, rx: w * .48, ry: (h - top) * .5};
    const sideX = Math.max(pad + handW(opp) / 2, w * .13);
    const sideSeat = (x: number): Seat => ({
        x, y: pilesY + r, cw: opp, growUp: false,
        avatar: {x: x - handW(opp) / 2 + r, y: pilesY + r - handH(opp) / 2 - r - 6, r}, label: 'right',
        held: {x: x + (w / 2 - x) * .35, y: pilesY + r, cw: opp * 1.05},
        chip: {x, y: pilesY + r + handH(opp) / 2 + 18},
    });
    seats[0] = {
        x: w / 2, y: myY, cw: my, growUp: true,
        avatar: {x: w / 2 - handW(my) / 2 - 40, y: myY - 10, r: 22}, label: 'below',
        held: {x: w / 2 + pileW * .72 + pileW * 1.9, y: pilesY, cw: my},
        chip: {x: w / 2, y: myY - handH(my) / 2 - 20},
    };
    seats[1] = sideSeat(sideX);
    seats[2] = {
        x: w / 2, y: topY, cw: opp, growUp: false,
        avatar: {x: w / 2 - handW(opp) / 2 - r - 16, y: topY - 8, r}, label: 'below',
        held: {x: w / 2 - pileW * 2.4, y: pilesY, cw: opp * 1.05},
        chip: {x: w / 2 + handW(opp) / 2 + 110, y: topY},
    };
    seats[3] = sideSeat(w - sideX);
    return {
        w, h, portrait, ui, table, seats, pileW,
        deck: {x: w / 2 - pileW * .72, y: pilesY},
        discard: {x: w / 2 + pileW * .72, y: pilesY},
        banner: {x: w / 2, y: top / 2, maxW: w - 300},
        buttons: {x: w / 2 + handW(my) / 2 + 96, y: myY, vertical: true},
    };
}

/** Place of a card in a hand: rows of ceil(cardsPerPlayer / 2) cards, holes keep their place */
function slot(seat: Seat, index: number, length: number, perPlayer: number): Point {
    const cols = Math.ceil(perPlayer / 2);
    const rows = Math.max(2, Math.ceil(length / cols));
    const col = index % cols;
    const row = Math.floor(index / cols);
    const step = seat.cw * (1 + GAP);
    const stepY = seat.cw * (RATIO + GAP);
    const x = seat.x - handW(seat.cw, cols) / 2 + seat.cw / 2 + col * step;
    // The first two rows stay where they are, extra rows are added away from the table centre
    const firstY = seat.y - handH(seat.cw) / 2 + seat.cw * RATIO / 2 - (seat.growUp ? (rows - 2) * stepY : 0);
    return {x, y: firstY + row * stepY};
}

/** Stable small random number for a card (slight tilt, position on the discard pile) */
function jitter(id: string, salt = 0): number {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    return ((h >>> 0) % 1000) / 1000 - .5;
}
// endregion

// region Card sprite
interface Target extends Point {
    rotation: number;
    scale: number;
    z: number;
    up: boolean;
}

type Place =
    | { zone: 'hand'; player: number; index: number }
    | { zone: 'discard'; top: boolean }
    | { zone: 'held' };

class CardSprite extends Container {
    public target: Target | null = null;
    public place: Place | null = null;
    public faceUp = false;
    private readonly shadow: Sprite;
    private readonly glow: Sprite;
    private readonly lifter = new Container();
    private readonly body = new Container();
    private readonly front: Sprite;
    private readonly backSide: Sprite;
    private glowTween: gsap.core.Tween | null = null;
    private glowLevel = 0;
    private liftValue = 0;
    private flipTimeline: gsap.core.Timeline | null = null;

    constructor(public card: Card, art: Art) {
        super();
        this.shadow = centered(new Sprite(art.shadow));
        this.glow = centered(new Sprite(art.glow));
        this.glow.alpha = 0;
        this.front = centered(new Sprite(art.face(card)));
        this.backSide = centered(new Sprite(art.back));
        this.front.visible = false;
        this.body.addChild(this.front, this.backSide);
        this.lifter.addChild(this.glow, this.body);
        this.addChild(this.shadow, this.lifter);
        this.lift = 0;
        this.eventMode = 'static';
        this.hitArea = new Rectangle(-CW / 2, -CH / 2, CW, CH);
    }

    /** 0 on the table, 1 in the air (bigger, shadow further away) */
    get lift() {
        return this.liftValue;
    }

    set lift(v: number) {
        this.liftValue = v;
        this.shadow.position.set(6 + v * 22, 10 + v * 36);
        this.shadow.alpha = .7 - v * .25;
        this.lifter.scale.set(1 + v * .08);
    }

    public setFace(up: boolean, delay = 0, instant = false) {
        if (up === this.faceUp) return;
        this.faceUp = up;
        this.flipTimeline?.kill();
        if (instant) {
            this.body.scale.x = 1;
            this.showFace();
            return;
        }
        this.flipTimeline = gsap.timeline({delay})
            .to(this.body.scale, {x: 0, duration: .13, ease: 'power2.in', onComplete: () => {
                this.showFace();
                sfx.flip();
            }})
            .to(this.body.scale, {x: 1, duration: .17, ease: 'power2.out'});
    }

    private showFace() {
        this.front.visible = this.faceUp;
        this.backSide.visible = !this.faceUp;
    }

    /** 0 nothing, 1 can be chosen (pulsing), 2 chosen */
    public setGlow(level: number) {
        if (level === this.glowLevel) return;
        this.glowLevel = level;
        this.glowTween?.kill();
        if (level === 0) {
            this.glowTween = gsap.to(this.glow, {alpha: 0, duration: .2});
        } else if (level === 1) {
            this.glow.alpha = .2;
            this.glowTween = gsap.to(this.glow, {alpha: .75, duration: .8, yoyo: true, repeat: -1, ease: 'sine.inOut'});
        } else {
            this.glowTween = gsap.to(this.glow, {alpha: 1, duration: .15});
        }
    }

    public moveTo(target: Target, delay = 0, instant = false) {
        const previous = this.target;
        this.target = target;
        if (instant) {
            gsap.killTweensOf(this);
            gsap.killTweensOf(this.scale);
            this.position.set(target.x, target.y);
            this.rotation = target.rotation;
            this.scale.set(target.scale);
            this.zIndex = target.z;
            this.lift = 0;
            return;
        }
        if (previous && Math.hypot(previous.x - target.x, previous.y - target.y) < .5
            && previous.scale === target.scale && previous.rotation === target.rotation) {
            this.zIndex = target.z;
            return;
        }
        const distance = Math.hypot(this.x - target.x, this.y - target.y);
        const duration = clamp(.28 + distance / 1500, .3, .62);
        gsap.killTweensOf(this);
        gsap.killTweensOf(this.scale);
        this.zIndex = 1000 + target.z;
        gsap.to(this, {
            x: target.x, y: target.y, rotation: target.rotation, duration, delay, ease: 'power3.inOut',
            onStart: () => {
                if (distance > 6) sfx.slide();
            },
            onComplete: () => {
                this.zIndex = target.z;
            },
        });
        gsap.to(this.scale, {x: target.scale, y: target.scale, duration, delay, ease: 'power3.inOut'});
        if (distance > 40) {
            gsap.to(this, {lift: 1, duration: duration / 2, delay, yoyo: true, repeat: 1, ease: 'sine.inOut'});
        } else {
            this.lift = 0;
        }
    }

    /** Back to its place (after a drag that went nowhere) */
    public settle() {
        const target = this.target;
        this.target = null;
        if (target) this.moveTo(target);
    }

    public shake(color?: number) {
        if (color !== undefined) {
            this.front.tint = color;
            this.backSide.tint = color;
            gsap.delayedCall(.9, () => {
                this.front.tint = 0xffffff;
                this.backSide.tint = 0xffffff;
            });
        }
        gsap.fromTo(this.lifter, {x: -10}, {x: 0, duration: .5, ease: 'elastic.out(1.2, .3)'});
    }
}

/**
 *  Destroy a display object and stop its animations first
 *  (a tween left on a destroyed object throws on every frame and stops the other animations)
 */
function dispose(object: Container) {
    if (object.destroyed) return;
    const stop = (o: Container) => {
        gsap.killTweensOf(o);
        gsap.killTweensOf(o.scale);
        o.children.forEach(stop);
    };
    stop(object);
    object.destroy({children: true});
}

function centered<T extends Sprite>(sprite: T): T {
    sprite.anchor.set(.5);
    return sprite;
}
// endregion

// region Small widgets
function label(text: string, size: number, color = 0xf6ead0, weight: '400' | '600' | '800' = '600'): Text {
    return new Text({text, style: {fontFamily: SANS, fontSize: size, fill: color, fontWeight: weight}});
}

type ButtonKind = 'primary' | 'danger' | 'ghost';

function button(text: string, kind: ButtonKind, scale: number, onTap: () => void): Container {
    const box = new Container();
    const t = label(text, 15 * scale, kind === 'primary' ? 0x2a1805 : 0xffffff, '800');
    t.anchor.set(.5);
    const w = Math.max(t.width + 36 * scale, 110 * scale);
    const h = 44 * scale;
    const bg = new Graphics().roundRect(-w / 2, -h / 2, w, h, h / 2);
    if (kind === 'primary') bg.fill(0xf2c14e).stroke({width: 2, color: 0xffe7a3});
    else if (kind === 'danger') bg.fill(0xc8323c).stroke({width: 2, color: 0xff8a8a});
    else bg.fill({color: 0x000000, alpha: .35}).stroke({width: 1.5, color: 0xffffff, alpha: .45});
    const shine = new Graphics().roundRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * .42, h / 2).fill({color: 0xffffff, alpha: kind === 'ghost' ? .05 : .22});
    box.addChild(bg, shine, t);
    box.eventMode = 'static';
    box.cursor = 'pointer';
    box.on('pointerdown', () => gsap.to(box.scale, {x: .94, y: .94, duration: .08}));
    box.on('pointerupoutside', () => gsap.to(box.scale, {x: 1, y: 1, duration: .15}));
    box.on('pointerup', () => {
        gsap.to(box.scale, {x: 1, y: 1, duration: .2, ease: 'back.out(3)'});
        sfx.tap();
        navigator.vibrate?.(8);
        onTap();
    });
    return box;
}

class SeatView extends Container {
    private readonly ring = new Graphics();
    private readonly disc = new Graphics();
    private readonly initial: Text;
    private readonly nameText: Text;
    private readonly scoreText: Text;
    private readonly badge = new Container();
    private pulse: gsap.core.Tween | null = null;
    private activeState = false;
    public readonly spot: Sprite;

    constructor(public readonly playerId: number, private readonly color: string, name: string, art: Art) {
        super();
        this.initial = label(name[0]?.toUpperCase() ?? '?', 16, 0xffffff, '800');
        this.initial.anchor.set(.5);
        this.nameText = label(name, 13, 0xf6ead0, '800');
        this.scoreText = label('', 12, 0xd9c9a3, '400');
        const badgeText = label('DUTCH', 10, 0x2a1805, '800');
        badgeText.anchor.set(.5);
        this.badge.addChild(new Graphics().roundRect(-26, -9, 52, 18, 9).fill(GOLD), badgeText);
        this.badge.visible = false;
        this.addChild(this.ring, this.disc, this.initial, this.nameText, this.scoreText, this.badge);
        this.spot = centered(new Sprite(art.glow));
        this.spot.alpha = 0;
        this.eventMode = 'static';
    }

    public layout(seat: Seat, ui: number) {
        const r = seat.avatar.r;
        this.position.set(seat.avatar.x, seat.avatar.y);
        this.ring.clear().circle(0, 0, r + 4).stroke({width: 3, color: GOLD});
        this.ring.alpha = this.activeState ? 1 : 0;
        this.disc.clear().circle(0, 0, r).fill(this.color).stroke({width: 2, color: 0xffffff, alpha: .8});
        this.initial.style.fontSize = r * .85;
        this.nameText.style.fontSize = 13 * ui;
        this.scoreText.style.fontSize = 11.5 * ui;
        if (seat.label === 'right') {
            this.nameText.anchor.set(0, 1);
            this.scoreText.anchor.set(0, 0);
            this.nameText.position.set(r + 8, 1);
            this.scoreText.position.set(r + 8, 2);
            this.badge.position.set(r + 8 + Math.max(this.nameText.width, this.scoreText.width) + 32, 0);
        } else {
            this.nameText.anchor.set(.5, 0);
            this.scoreText.anchor.set(.5, 0);
            this.nameText.position.set(0, r + 6);
            this.scoreText.position.set(0, r + 6 + 15 * ui);
            this.badge.position.set(0, -r - 14);
        }
        this.hitArea = new Rectangle(-r - 6, -r - 6, r * 2 + 12 + 90, r * 2 + 12);
        const hand = seat.cw;
        this.spot.position.set(seat.x, seat.y);
        this.spot.scale.set(handW(hand) * 1.6 / CW, handH(hand) * 1.25 / CH);
    }

    public update(score: number, active: boolean, dutch: boolean, choosable: boolean) {
        this.scoreText.text = `${score} pt${score > 1 ? 's' : ''}`;
        this.badge.visible = dutch;
        this.cursor = choosable ? 'pointer' : 'default';
        const lit = active || choosable;
        if (lit !== this.activeState) {
            this.activeState = lit;
            this.pulse?.kill();
            if (lit) {
                this.ring.alpha = 1;
                this.pulse = gsap.fromTo(this.ring.scale, {x: 1, y: 1}, {x: 1.12, y: 1.12, duration: .7, yoyo: true, repeat: -1, ease: 'sine.inOut'});
                gsap.to(this.spot, {alpha: .22, duration: .4});
            } else {
                this.ring.alpha = 0;
                this.ring.scale.set(1);
                gsap.to(this.spot, {alpha: 0, duration: .4});
            }
        }
    }
}
// endregion

async function main() {
    await Promise.all([
        document.fonts.load(`900 40px ${SERIF}`),
        document.fonts.load(`italic 900 40px ${SERIF}`),
        document.fonts.load(`800 16px ${SANS}`),
        document.fonts.load(`400 16px ${SANS}`),
    ]).catch(() => undefined);

    const app = new Application();
    await app.init({resizeTo: window, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 3), background: '#0a0705'});
    document.body.appendChild(app.canvas);
    document.getElementById('loading')?.remove();
    const art = makeArt();

    // region Scene
    const tableSprite = new Sprite();
    const spots = new Container();
    const slots = new Graphics();
    const deckView = new Container();
    const deckGlow = centered(new Sprite(art.glow));
    deckGlow.alpha = 0;
    const deckCount = label('', 12, 0xf6ead0, '600');
    deckCount.anchor.set(.5, 0);
    const discardZone = new Graphics();
    const seatsLayer = new Container();
    const cardsLayer = new Container();
    cardsLayer.sortableChildren = true;
    const uiLayer = new Container();
    const fxLayer = new Container();
    const bannerBox = new Container();
    const bannerBg = new Graphics();
    const bannerText = label('', 15, 0xf6ead0, '600');
    bannerText.anchor.set(.5);
    bannerBox.addChild(bannerBg, bannerText);
    const buttons = new Container();
    uiLayer.addChild(bannerBox, buttons);
    app.stage.addChild(tableSprite, spots, slots, discardZone, deckView, seatsLayer, cardsLayer, uiLayer, fxLayer);
    deckView.addChild(deckGlow);
    const deckStack: Sprite[] = [];
    for (let i = 0; i < 6; i++) {
        const s = centered(new Sprite(art.back));
        deckStack.push(s);
        deckView.addChild(s);
    }
    deckView.addChild(deckCount);
    deckView.eventMode = 'static';
    deckView.cursor = 'pointer';
    discardZone.eventMode = 'static';
    // endregion

    // region Game
    const setup = loadSetup();
    const myName = (setup.onlineName || setup.names?.[0] || 'Vous').slice(0, 14);
    let game!: Dutch;
    let bots!: Bots;
    let seatViews: SeatView[] = [];
    let layout!: Layout;
    const sprites = new Map<string, CardSprite>();
    const revealed = new Map<string, ReturnType<typeof setTimeout>>();
    let shownRound = 0;
    let logSeen = 0;
    let jackPick: string | null = null;
    let panel: Container | null = null;
    let panelRound = 0;

    function newGame() {
        bots?.stop();
        game = new Dutch({
            players: [myName, 'Léa', 'Hugo', 'Inès'],
            playerColors: [setup.onlineColor, null, null, null],
            peekVariant: true,
            targetScore: 100,
        });
        bots = new Bots(game, [1, 2, 3]);
        seatsLayer.removeChildren().forEach(dispose);
        spots.removeChildren();
        seatViews = game.players.map(p => {
            const view = new SeatView(p.id, p.color, p.name, art);
            view.on('pointertap', () => tapSeat(p.id));
            seatsLayer.addChild(view);
            spots.addChild(view.spot);
            return view;
        });
        game.on(event => {
            if (event.type === 'reveal') onReveal(event.cardId, event.playerId, event.public);
            requestSync();
        });
        shownRound = 0;
        logSeen = 0;
        hidePanel();
        relayout();
        game.startRound();
    }

    let syncQueued = false;

    function requestSync() {
        if (syncQueued) return;
        syncQueued = true;
        queueMicrotask(() => {
            syncQueued = false;
            sync();
            bots.schedule();
        });
    }
    // endregion

    // region Layout and table
    function relayout() {
        const top = document.querySelector('header')?.getBoundingClientRect().bottom ?? 40;
        layout = computeLayout(app.screen.width, app.screen.height, top);
        const old = tableSprite.texture;
        tableSprite.texture = Texture.from(drawTable(layout.w, layout.h, layout.table, Math.min(app.renderer.resolution, 2)));
        tableSprite.width = layout.w;
        tableSprite.height = layout.h;
        if (old && old !== Texture.EMPTY) old.destroy(true);

        const pileScale = layout.pileW / CW;
        deckView.position.set(layout.deck.x, layout.deck.y);
        deckStack.forEach((s, i) => {
            s.scale.set(pileScale);
            s.position.set(-i * .7, -i * 1.3);
        });
        deckGlow.scale.set(pileScale);
        deckCount.position.set(0, layout.pileW * RATIO / 2 + 6);
        deckCount.style.fontSize = 12 * layout.ui;
        deckView.hitArea = new Rectangle(-layout.pileW / 2, -layout.pileW * RATIO / 2, layout.pileW, layout.pileW * RATIO);

        const zw = layout.pileW, zh = zw * RATIO;
        discardZone.clear()
            .roundRect(layout.discard.x - zw / 2, layout.discard.y - zh / 2, zw, zh, zw * .08)
            .fill({color: 0x000000, alpha: .12})
            .stroke({width: 2, color: 0xffecbe, alpha: .25});
        discardZone.hitArea = new Rectangle(layout.discard.x - zw / 2, layout.discard.y - zh / 2, zw, zh);

        bannerText.style.fontSize = 15 * layout.ui;
        // Landscape: one line in the top band (shrunk to fit), portrait: wrapped above the piles
        bannerText.style.wordWrap = layout.portrait;
        bannerText.style.wordWrapWidth = Math.min(layout.banner.maxW, 520) - 32;
        bannerText.style.align = 'center';
        bannerBox.position.set(layout.banner.x, layout.banner.y);
        seatViews.forEach((v, i) => v.layout(layout.seats[i], layout.ui));
        if (panel) showPanel(true);
        sync(true);
    }

    app.renderer.on('resize', () => relayout());
    // endregion

    // region Sync: put every card where the engine says it is
    function sync(instant = false) {
        if (!game) return;
        const g = game;
        if (g.round !== shownRound) {
            // New round: the cards of the previous round are gathered on the draw pile
            for (const s of sprites.values()) {
                s.eventMode = 'none';
                gsap.killTweensOf(s);
                gsap.to(s, {x: layout.deck.x, y: layout.deck.y, rotation: 0, duration: .45, delay: Math.random() * .2, ease: 'power2.in'});
                gsap.to(s, {alpha: 0, duration: .2, delay: .5, onComplete: () => dispose(s)});
            }
            sprites.clear();
            jackPick = null;
            shownRound = g.round;
            logSeen = g.log.length;
            hidePanel();
            dealing = true;
        }
        const roundOver = g.phase === 'roundOver' || g.phase === 'gameOver';
        const seen = new Set<string>();
        const dealDelay = (player: number, index: number) => dealing ? .55 + (index * g.players.length + player) * .075 : 0;
        const lastDeal = dealDelay(g.players.length - 1, g.cardsPerPlayer - 1);

        g.players.forEach((p, pid) => {
            const seat = layout.seats[pid];
            p.hand.forEach((card, index) => {
                if (!card) return;
                const pos = slot(seat, index, p.hand.length, g.cardsPerPlayer);
                const up = roundOver || revealed.has(card.id);
                const flipDelay = roundOver ? .15 * pid + index * .08 : 0;
                put(card, {...pos, rotation: jitter(card.id) * .06, scale: seat.cw / CW, z: 10 + index, up},
                    {zone: 'hand', player: pid, index}, dealDelay(pid, index), flipDelay);
            });
        });

        const pile = g.deck.discardPile;
        const first = Math.max(0, pile.length - 5);
        pile.slice(first).forEach((card, k) => {
            const isTop = first + k === pile.length - 1;
            put(card, {
                x: layout.discard.x + jitter(card.id, 1) * layout.pileW * .12,
                y: layout.discard.y + jitter(card.id, 2) * layout.pileW * .12,
                rotation: jitter(card.id, 3) * .45, scale: layout.pileW / CW, z: 100 + k, up: true,
            }, {zone: 'discard', top: isTop}, dealing ? lastDeal + .3 : 0);
        });

        if (g.drawn) {
            const cur = g.currentPlayerIndex;
            const held = layout.seats[cur].held;
            const up = cur === YOU || g.drawn.source === 'discard';
            put(g.drawn.card, {...held, rotation: cur === YOU ? -.04 : 0, scale: held.cw / CW, z: 500, up}, {zone: 'held'});
        }

        for (const [id, s] of sprites) {
            if (seen.has(id)) continue;
            // Covered by other discarded cards (or shuffled back into the draw pile)
            sprites.delete(id);
            s.eventMode = 'none';
            gsap.to(s, {alpha: 0, duration: .3, delay: .6, onComplete: () => dispose(s)});
        }

        function put(card: Card, target: Target, place: Place, delay = 0, flipDelay = 0) {
            seen.add(card.id);
            let s = sprites.get(card.id);
            if (!s) {
                s = new CardSprite(card, art);
                s.position.set(layout.deck.x, layout.deck.y);
                s.scale.set(layout.pileW / CW);
                s.zIndex = 900;
                s.on('pointerdown', (e: FederatedPointerEvent) => pressCard(card.id, e));
                cardsLayer.addChild(s);
                sprites.set(card.id, s);
                if (instant) s.moveTo(target, 0, true);
                else s.moveTo(target, delay);
                s.setFace(target.up, instant ? 0 : delay + .12, instant);
            } else if (drag?.sprite !== s) {
                s.moveTo(target, delay, instant);
                s.setFace(target.up, flipDelay || (instant ? 0 : .1), instant);
            }
            s.place = place;
        }

        dealing = false;
        updateTable();
        readLog();
        if (roundOver && panelRound !== g.round) {
            panelRound = g.round;
            gsap.delayedCall(1.6, () => showPanel());
        }
    }

    let dealing = false;

    function updateTable() {
        const g = game;
        const myTurn = g.currentPlayerIndex === YOU && g.isRoundRunning;
        const effect = g.activeEffect;
        const myEffect = effect?.playerId === YOU ? effect.type : null;

        // Draw pile
        const stack = Math.min(deckStack.length, Math.ceil(g.deck.remaining / 8));
        deckStack.forEach((s, i) => s.visible = i < stack);
        deckCount.text = `${g.deck.remaining}`;
        const canDraw = myTurn && g.phase === 'draw' && !effect && g.deck.remaining + g.deck.discardPile.length > 1;
        deckGlow.alpha = canDraw ? .85 : 0;

        // Hand slots: the empty places stay visible
        slots.clear();
        g.players.forEach((p, pid) => {
            const seat = layout.seats[pid];
            p.hand.forEach((_, index) => {
                const pos = slot(seat, index, p.hand.length, g.cardsPerPlayer);
                const w = seat.cw, h = w * RATIO;
                slots.roundRect(pos.x - w / 2, pos.y - h / 2, w, h, w * .08);
            });
        });
        slots.fill({color: 0x000000, alpha: .14}).stroke({width: 1.5, color: 0xffecbe, alpha: .18});

        // Highlights
        for (const s of sprites.values()) {
            const place = s.place!;
            let glow = 0;
            const mine = place.zone === 'hand' && place.player === YOU;
            if (g.phase === 'peek' && mine && !g.players[YOU].ready) glow = 1;
            else if (myEffect === 'QUEEN' && mine) glow = 1;
            else if (myEffect === 'JACK' && place.zone === 'hand' && (place.player === YOU || !g.isImmune(place.player))) {
                glow = jackPick === s.card.id ? 2 : 1;
            } else if (myTurn && !effect && g.phase === 'draw' && place.zone === 'discard' && place.top) glow = 1;
            else if (myTurn && !effect && g.phase === 'drawn') {
                if (mine) glow = 1;
                if (place.zone === 'discard' && place.top && g.drawn?.source === 'pile') glow = 1;
            }
            s.setGlow(glow);
            const draggable = (mine && g.canThrow(YOU)) || (place.zone === 'held' && myTurn);
            s.cursor = glow || draggable ? 'pointer' : 'default';
        }

        seatViews.forEach((v, pid) => v.update(
            g.players[pid].score,
            g.isRoundRunning && (effect ? effect.playerId === pid : g.currentPlayerIndex === pid),
            g.dutchCallerId === pid,
            myEffect === 'ACE' && pid !== YOU && !g.isImmune(pid),
        ));

        updateBanner();
        updateButtons();
    }

    function updateBanner() {
        const g = game;
        const effect = g.activeEffect;
        const cur = g.players[g.currentPlayerIndex];
        const myTurn = g.currentPlayerIndex === YOU;
        let text = '';
        if (g.phase === 'peek') {
            text = g.players[YOU].ready ? 'Les autres regardent leurs cartes…' : 'Regardez vos 2 cartes du bas : retenez-les !';
        } else if (g.phase === 'roundOver' || g.phase === 'gameOver') {
            text = 'Fin de la manche : on retourne les cartes';
        } else if (effect) {
            const who = g.players[effect.playerId];
            if (effect.playerId !== YOU) text = `${who.name} utilise ${effect.card.name}…`;
            else if (effect.type === 'QUEEN') text = 'Dame : touchez une de vos cartes pour la regarder';
            else if (effect.type === 'JACK') text = jackPick ? 'Valet : touchez la 2ᵉ carte à échanger' : 'Valet : touchez deux cartes à échanger';
            else text = 'As : touchez un adversaire, il reçoit une carte';
        } else if (myTurn && g.phase === 'draw') {
            text = g.isStuck ? 'Plus rien à piocher : passez votre tour' : 'À vous : piochez, ou prenez la défausse';
        } else if (myTurn && g.phase === 'drawn') {
            text = g.drawn?.source === 'pile'
                ? 'Touchez une de vos cartes pour l\'échanger, ou la défausse pour la jeter'
                : 'Touchez la carte de votre jeu à remplacer';
        } else if (myTurn && g.phase === 'played') {
            text = g.dutchCallerId === null ? 'Finissez votre tour… ou annoncez Dutch !' : 'Finissez votre tour';
        } else {
            text = `Tour de ${cur.name}`;
            if (g.canThrow(YOU)) text += ' · une carte identique ? Glissez-la sur la défausse';
        }
        if (g.isFinalRound && g.isRoundRunning) text = `Dernier tour · ${text}`;
        if (bannerText.text === text) return;
        bannerText.text = text;
        bannerBox.scale.set(Math.min(1, layout.banner.maxW / (bannerText.width + 32)));
        const w = bannerText.width + 32;
        const h = bannerText.height + 14;
        bannerBg.clear().roundRect(-w / 2, -h / 2, w, h, h / 2).fill({color: 0x0a0705, alpha: .55}).stroke({width: 1, color: 0xffecbe, alpha: .2});
        gsap.fromTo(bannerBox, {alpha: .3}, {alpha: 1, duration: .3});
    }

    let buttonsKey = '';

    function updateButtons() {
        const g = game;
        const effect = g.activeEffect;
        const myTurn = g.currentPlayerIndex === YOU && g.isRoundRunning;
        const list: [string, ButtonKind, () => void][] = [];
        if (g.phase === 'peek' && !g.players[YOU].ready) list.push(['Regarder mes cartes', 'primary', () => act(() => g.peek(YOU))]);
        else if (effect?.playerId === YOU) list.push(['Passer l\'effet', 'ghost', () => act(() => g.skipEffect(YOU))]);
        else if (myTurn && !effect && g.phase === 'played') {
            list.push(['Finir mon tour', 'primary', () => act(() => g.endTurn(YOU))]);
            if (g.dutchCallerId === null) list.push(['Dutch !', 'danger', () => act(() => g.endTurn(YOU, true))]);
        } else if (myTurn && !effect && g.phase === 'draw' && g.isStuck) {
            list.push(['Passer', 'primary', () => act(() => g.endTurn(YOU))]);
        }
        const key = list.map(b => b[0]).join('|') + layout.w + 'x' + layout.h;
        if (key === buttonsKey) return;
        buttonsKey = key;
        buttons.removeChildren().forEach(dispose);
        const views = list.map(([text, kind, onTap]) => button(text, kind, layout.ui, onTap));
        const gap = 12 * layout.ui;
        if (layout.buttons.vertical) {
            const total = views.reduce((s, v) => s + v.height, 0) + gap * (views.length - 1);
            let y = layout.buttons.y - total / 2;
            for (const v of views) {
                v.position.set(layout.buttons.x, y + v.height / 2);
                y += v.height + gap;
            }
        } else {
            const total = views.reduce((s, v) => s + v.width, 0) + gap * (views.length - 1);
            let x = layout.buttons.x - total / 2;
            for (const v of views) {
                v.position.set(x + v.width / 2, layout.buttons.y);
                x += v.width + gap;
            }
        }
        views.forEach((v, i) => {
            buttons.addChild(v);
            gsap.from(v, {alpha: 0, y: v.y + 12, duration: .3, delay: i * .06, ease: 'back.out(2)'});
        });
    }
    // endregion

    // region Messages and effects
    function onReveal(cardId: string, playerId: number, isPublic: boolean) {
        if (playerId === YOU || isPublic) {
            clearTimeout(revealed.get(cardId));
            revealed.set(cardId, setTimeout(() => {
                revealed.delete(cardId);
                requestSync();
            }, isPublic ? 2200 : 3000));
            if (isPublic) queueMicrotask(() => sprites.get(cardId)?.shake(0xff9a9a));
        } else {
            // A bot looks at one of its cards: it lifts it a little
            const s = sprites.get(cardId);
            if (s) gsap.to(s, {lift: .7, duration: .3, yoyo: true, repeat: 1, delay: .3, ease: 'sine.inOut'});
        }
    }

    const chips = new Map<number, Container>();

    function chip(seatIndex: number | null, text: string, color: number) {
        const pos = seatIndex === null ? {x: layout.w / 2, y: layout.banner.y + 40} : layout.seats[seatIndex].chip;
        const key = seatIndex ?? -1;
        const previous = chips.get(key);
        if (previous) dispose(previous);
        const box = new Container();
        const t = label(text, 12.5 * layout.ui, 0xffffff, '600');
        t.style.wordWrap = true;
        t.style.wordWrapWidth = Math.min(230 * layout.ui, layout.w - 40);
        t.style.align = 'center';
        t.anchor.set(.5);
        const w = t.width + 22, h = t.height + 12;
        const bg = new Graphics().roundRect(-w / 2, -h / 2, w, h, 10).fill({color: 0x0d0f14, alpha: .88}).stroke({width: 2, color});
        box.addChild(bg, t);
        box.position.set(clamp(pos.x, w / 2 + 8, layout.w - w / 2 - 8), pos.y);
        fxLayer.addChild(box);
        chips.set(key, box);
        gsap.from(box, {alpha: 0, y: box.y + 8, duration: .25, ease: 'back.out(2)'});
        gsap.to(box, {alpha: 0, duration: .4, delay: 2.6, onComplete: () => {
            if (chips.get(key) === box) chips.delete(key);
            dispose(box);
        }});
    }

    const SKIP = /^(C'est au tour|Au tour|Dernier tour de|— Ronde|Chaque joueur|Fin de la ronde|Partie terminée)/;

    function readLog() {
        const entries = game.log.slice(logSeen);
        logSeen = game.log.length;
        for (const entry of entries) {
            if (SKIP.test(entry.message)) continue;
            // The player the message is about: named first, or else named anywhere ("Valet de cœur : Léa gagne un effet")
            const actor = game.players.find(p => entry.message.startsWith(p.name))
                ?? game.players.find(p => entry.message.includes(p.name));
            if (entry.kind === 'good') sparks(layout.discard);
            if (entry.kind === 'bad') sfx.bad();
            if (entry.kind === 'good') sfx.good();
            if (entry.kind === 'dutch' && actor) dutchBanner(actor.name);
            // Own routine moves are not announced: you just did them
            if (actor?.id === YOU && entry.kind === 'info') continue;
            // "Dutch" already has its big banner
            if (entry.kind === 'dutch') continue;
            const color = actor ? parseInt(actor.color.slice(1), 16) : GOLD;
            chip(actor ? actor.id : null, entry.message, color);
        }
    }

    function sparks(at: Point) {
        for (let i = 0; i < 22; i++) {
            const s = centered(new Sprite(art.spark));
            s.position.set(at.x, at.y);
            s.blendMode = 'add';
            const a = Math.random() * Math.PI * 2;
            const d = 40 + Math.random() * 70;
            s.scale.set(.6 + Math.random() * .8);
            fxLayer.addChild(s);
            gsap.to(s, {x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d, alpha: 0, duration: .7 + Math.random() * .3, ease: 'power2.out', onComplete: () => dispose(s)});
        }
    }

    function dutchBanner(name: string) {
        sfx.dutch();
        navigator.vibrate?.([30, 40, 30]);
        const box = new Container();
        const big = new Text({
            text: 'DUTCH !',
            style: {
                fontFamily: SERIF, fontStyle: 'italic', fontWeight: '900', fontSize: Math.min(layout.w, layout.h) * .17,
                fill: GOLD, stroke: {color: 0x5a0f1d, width: 10},
                dropShadow: {color: 0x000000, alpha: .6, blur: 12, distance: 6, angle: Math.PI / 2},
            },
        });
        big.anchor.set(.5);
        const small = label(`${name} annonce la fin : dernier tour pour les autres`, 15 * layout.ui, 0xffffff, '800');
        small.anchor.set(.5, 0);
        small.y = big.height / 2;
        box.addChild(big, small);
        box.position.set(layout.w / 2, layout.h * .45);
        fxLayer.addChild(box);
        gsap.timeline({onComplete: () => dispose(box)})
            .from(box.scale, {x: 2.4, y: 2.4, duration: .45, ease: 'back.out(1.6)'})
            .from(box, {alpha: 0, duration: .25}, 0)
            .to(box, {alpha: 0, duration: .4}, '+=1.2');
        gsap.fromTo(app.stage, {x: -8}, {x: 0, duration: .6, ease: 'elastic.out(1.4, .25)'});
    }
    // endregion

    // region Score panel
    function hidePanel() {
        if (!panel) return;
        const p = panel;
        panel = null;
        gsap.to(p, {alpha: 0, duration: .2, onComplete: () => dispose(p)});
    }

    function showPanel(instant = false) {
        const result = game.lastResult;
        if (!result) return;
        if (panel) dispose(panel);
        const ui = layout.ui;
        const p = new Container();
        const w = Math.min(380 * ui, layout.w - 24);
        const rowH = 40 * ui;
        const h = 120 * ui + rowH * result.scores.length;
        const dim = new Graphics().rect(0, 0, layout.w, layout.h).fill({color: 0x000000, alpha: .45});
        dim.eventMode = 'static';
        const box = new Container();
        box.position.set(layout.w / 2, layout.h / 2);
        box.addChild(new Graphics()
            .roundRect(-w / 2, -h / 2, w, h, 18).fill({color: 0x12100d, alpha: .96}).stroke({width: 2, color: GOLD, alpha: .5}));
        const title = new Text({
            text: result.gameOver ? 'Partie terminée' : `Fin de la manche ${result.round}`,
            style: {fontFamily: SERIF, fontWeight: '900', fontSize: 24 * ui, fill: GOLD},
        });
        title.anchor.set(.5, 0);
        title.y = -h / 2 + 16 * ui;
        box.addChild(title);
        const sorted = result.scores.slice().sort((a, b) => a.total - b.total);
        sorted.forEach((s, i) => {
            const player = game.players[s.playerId];
            const y = -h / 2 + 64 * ui + i * rowH;
            const won = result.winners.includes(s.playerId);
            box.addChild(new Graphics().circle(-w / 2 + 28 * ui, y + rowH / 2, 9 * ui).fill(player.color));
            const name = label(`${player.name}${s.playerId === result.dutchCallerId ? ' · Dutch' : ''}${won ? ' · gagne !' : ''}`, 15 * ui, won ? GOLD : 0xf6ead0, '800');
            name.anchor.set(0, .5);
            name.position.set(-w / 2 + 46 * ui, y + rowH / 2);
            const pts = label(`+${s.points}${s.penalty ? ` (+${s.penalty})` : ''}`, 14 * ui, s.penalty ? 0xff8a8a : 0xd9c9a3, '600');
            pts.anchor.set(1, .5);
            pts.position.set(w / 2 - 80 * ui, y + rowH / 2);
            const total = label(`${s.total}`, 17 * ui, 0xffffff, '800');
            total.anchor.set(1, .5);
            total.position.set(w / 2 - 22 * ui, y + rowH / 2);
            box.addChild(name, pts, total);
        });
        const next = button(result.gameOver ? 'Nouvelle partie' : 'Manche suivante', 'primary', ui, () => {
            if (result.gameOver) newGame();
            else act(() => game.nextRound());
        });
        next.y = h / 2 - 34 * ui;
        box.addChild(next);
        p.addChild(dim, box);
        fxLayer.addChild(p);
        panel = p;
        if (!instant) {
            gsap.from(dim, {alpha: 0, duration: .3});
            gsap.from(box.scale, {x: .8, y: .8, duration: .35, ease: 'back.out(1.8)'});
            gsap.from(box, {alpha: 0, duration: .25});
        }
    }
    // endregion

    // region Input
    function act(fn: () => unknown) {
        unlockAudio();
        try {
            fn();
        } catch (e) {
            if (!(e instanceof RuleError)) throw e;
            sfx.bad();
            chip(YOU, e.message, 0xff6b6b);
        }
    }

    function nope(s?: CardSprite) {
        s?.shake();
        navigator.vibrate?.(20);
    }

    let drag: { sprite: CardSprite; id: string; start: Point; offset: Point; moved: boolean; canDrag: boolean; lastX: number } | null = null;

    function pressCard(id: string, e: FederatedPointerEvent) {
        unlockAudio();
        const s = sprites.get(id);
        if (!s || !s.place) return;
        const g = game;
        const myTurn = g.currentPlayerIndex === YOU && g.isRoundRunning;
        const mine = s.place.zone === 'hand' && s.place.player === YOU;
        const canDrag = (mine && g.canThrow(YOU)) || (s.place.zone === 'held' && myTurn);
        drag = {sprite: s, id, start: {x: e.global.x, y: e.global.y}, offset: {x: s.x - e.global.x, y: s.y - e.global.y}, moved: false, canDrag, lastX: e.global.x};
    }

    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('globalpointermove', (e: FederatedPointerEvent) => {
        if (!drag) return;
        if (!drag.moved) {
            if (!drag.canDrag || Math.hypot(e.global.x - drag.start.x, e.global.y - drag.start.y) < 8) return;
            drag.moved = true;
            gsap.killTweensOf(drag.sprite);
            gsap.killTweensOf(drag.sprite.scale);
            drag.sprite.zIndex = 3000;
            gsap.to(drag.sprite, {lift: 1, duration: .15});
            const big = Math.max(layout.seats[YOU].cw, layout.pileW) / CW * 1.05;
            gsap.to(drag.sprite.scale, {x: big, y: big, duration: .15});
        }
        const s = drag.sprite;
        s.position.set(e.global.x + drag.offset.x, e.global.y + drag.offset.y);
        // Tilt with the speed of the finger
        const vx = e.global.x - drag.lastX;
        drag.lastX = e.global.x;
        s.rotation += (clamp(vx * .02, -.35, .35) - s.rotation) * .3;
    });

    const release = () => {
        if (!drag) return;
        const d = drag;
        drag = null;
        if (!d.moved) return tapCard(d.id);
        const s = d.sprite;
        gsap.to(s, {lift: 0, duration: .2});
        const g = game;
        const overDiscard = Math.hypot(s.x - layout.discard.x, s.y - layout.discard.y) < layout.pileW * 1.1;
        const before = g.lastMove?.seq;
        if (overDiscard) {
            if (s.place?.zone === 'held') act(() => g.discardDrawn(YOU));
            else act(() => g.throwCard(YOU, d.id));
        } else if (s.place?.zone === 'held') {
            const seat = layout.seats[YOU];
            const target = [...sprites.values()].find(o => o.place?.zone === 'hand' && o.place.player === YOU
                && Math.hypot(o.x - s.x, o.y - s.y) < seat.cw * .8);
            if (target) act(() => g.swapDrawn(YOU, target.card.id));
        }
        // Nothing happened: the card goes back to its place
        if (g.lastMove?.seq === before) s.settle();
    };
    app.stage.on('pointerup', release);
    app.stage.on('pointerupoutside', release);

    function tapCard(id: string) {
        const g = game;
        const s = sprites.get(id);
        const place = s?.place;
        if (!s || !place) return;
        const effect = g.activeEffect;
        if (effect && effect.playerId === YOU) {
            if (effect.type === 'QUEEN' && place.zone === 'hand' && place.player === YOU) return act(() => g.queenPeek(YOU, id));
            if (effect.type === 'JACK' && place.zone === 'hand') {
                if (!jackPick || jackPick === id) {
                    jackPick = jackPick === id ? null : id;
                    sfx.tap();
                    return requestSync();
                }
                const first = jackPick;
                jackPick = null;
                return act(() => g.jackSwap(YOU, first, id));
            }
            if (effect.type === 'ACE' && place.zone === 'hand' && place.player !== YOU) return act(() => g.aceGive(YOU, place.player));
            return nope(s);
        }
        if (g.phase === 'peek' && place.zone === 'hand' && place.player === YOU && !g.players[YOU].ready) return act(() => g.peek(YOU));
        const myTurn = g.currentPlayerIndex === YOU && g.isRoundRunning;
        if (myTurn && g.phase === 'draw' && place.zone === 'discard') return act(() => g.takeDiscard(YOU));
        if (myTurn && g.phase === 'drawn') {
            if (place.zone === 'hand' && place.player === YOU) return act(() => g.swapDrawn(YOU, id));
            if (place.zone === 'discard') return act(() => g.discardDrawn(YOU));
        }
        nope(s);
    }

    function tapSeat(playerId: number) {
        const effect = game.activeEffect;
        if (effect?.playerId === YOU && effect.type === 'ACE' && playerId !== YOU) act(() => game.aceGive(YOU, playerId));
    }

    deckView.on('pointertap', () => {
        const g = game;
        if (g.currentPlayerIndex === YOU && g.phase === 'draw') act(() => g.drawFromPile(YOU));
        else gsap.fromTo(deckView, {x: layout.deck.x - 6}, {x: layout.deck.x, duration: .4, ease: 'elastic.out(1.2, .3)'});
    });
    discardZone.on('pointertap', () => {
        const g = game;
        if (g.currentPlayerIndex === YOU && g.phase === 'drawn') act(() => g.discardDrawn(YOU));
    });

    const soundButton = document.getElementById('sound') as HTMLButtonElement;
    soundButton.addEventListener('click', () => {
        setMuted(!isMuted());
        soundButton.textContent = isMuted() ? 'Son : non' : 'Son : oui';
        soundButton.setAttribute('aria-pressed', String(!isMuted()));
    });
    // endregion

    newGame();
    // For the automated checks of the prototype
    (window as unknown as { dutch: unknown }).dutch = {get game() { return game; }, sprites};
}

void main();
