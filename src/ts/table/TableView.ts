import {Application, Container, FederatedPointerEvent, Graphics, Rectangle, Sprite, Text, Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {Session, SessionEvent} from '../Session.js';
import {describeSettings} from '../Settings.js';
import {Action, CardView, GameView, PlayerView} from '../View.js';
import {Art, BACK_COLORS, BackColor, CW, drawTable, makeArt, SANS, SERIF} from './art.js';
import {CardSprite, centered, dispose, Place, Target} from './CardSprite.js';
import {clamp, computeLayout, jitter, Layout, Point, RATIO, slot} from './layout.js';
import {buzz, loadPrefs, Prefs, savePrefs} from './prefs.js';
import {setMuted, sfx, unlockAudio} from './sound.js';
import {button, ButtonKind, CREAM, GOLD, label, SeatView} from './widgets.js';

/**
 *  The game screen: a card table drawn with PixiJS (WebGL) and animated with GSAP.
 *  Driven by a Session like the rest of the app, so it works for every mode:
 *  solo against bots, online (host or player) and one shared screen.
 */

const REVEAL_MS = 3000;

export interface TableOptions {
    /** End of the game: start another one (host) */
    onNewGame(): void;
    /** Leave the game (menu) */
    onQuit(): void;
    /** Text of the confirmation before leaving, if leaving has consequences for the others */
    quitWarning?: string;
    debug?: boolean;
}

const arts = new Map<BackColor, Art>();

function artFor(back: BackColor): Art {
    let art = arts.get(back);
    if (!art) {
        art = makeArt(back);
        arts.set(back, art);
    }
    return art;
}

let fontsReady: Promise<unknown> | null = null;

function loadFonts() {
    fontsReady ??= Promise.all([
        document.fonts.load(`900 40px ${SERIF}`),
        document.fonts.load(`italic 900 40px ${SERIF}`),
        document.fonts.load(`800 16px ${SANS}`),
        document.fonts.load(`600 16px ${SANS}`),
        document.fonts.load(`400 16px ${SANS}`),
    ]).catch(() => undefined);
    return fontsReady;
}

export class TableView {
    private readonly screen: HTMLElement;
    private readonly host: HTMLElement;
    private readonly info: HTMLElement;
    private readonly live: HTMLElement;
    private menu: HTMLElement | null = null;
    private app: Application | null = null;
    private art!: Art;
    private prefs: Prefs = loadPrefs();
    private destroyed = false;
    private readonly unsubscribe: () => void;

    // Scene
    private readonly tableSprite = new Sprite();
    private readonly spots = new Container();
    private readonly slots = new Graphics();
    private readonly discardZone = new Graphics();
    private readonly deckView = new Container();
    private readonly deckStack: Sprite[] = [];
    private deckGlow!: Sprite;
    private readonly deckCount = label('', 12, CREAM, '600');
    private readonly seatsLayer = new Container();
    private readonly cardsLayer = new Container();
    private readonly uiLayer = new Container();
    private readonly fxLayer = new Container();
    private readonly bannerBox = new Container();
    private readonly bannerBg = new Graphics();
    private readonly bannerText = label('', 15, CREAM, '600');
    private readonly buttons = new Container();
    private throwButton: Container | null = null;

    // State shown
    public layout!: Layout;
    private seatViews = new Map<number, SeatView>();
    private seatKey = '';
    public readonly sprites = new Map<string, CardSprite>();
    /** Cards shown to this device for a moment: id -> face */
    private readonly revealed = new Map<string, { view: CardView; timer: number }>();
    /** Discard pile as seen from here (the view only gives its top card) */
    private pile: CardView[] = [];
    private shownRound = -1;
    private dealing = false;
    private lastLog: { round: number; message: string } | null = null;
    private logLength = 0;
    private moveSeq = 0;
    private jackPick: string | null = null;
    private throwPick: string | null = null;
    private dutchArmed = false;
    private dutchTimer = 0;
    private panel: Container | null = null;
    private panelFor = '';
    private buttonsKey = '';
    private readonly chips = new Map<number, Container>();
    private drag: { sprite: CardSprite; id: string; start: Point; offset: Point; moved: boolean; canDrag: boolean; lastX: number } | null = null;
    private syncQueued = false;

    constructor(root: HTMLElement, private readonly session: Session, private readonly options: TableOptions) {
        document.body.classList.add('in-game');
        this.screen = document.createElement('div');
        this.screen.className = 'table-screen';
        this.host = document.createElement('div');
        this.host.className = 'table-canvas';
        const bar = document.createElement('div');
        bar.className = 'table-bar';
        const menuButton = document.createElement('button');
        menuButton.type = 'button';
        menuButton.className = 'table-menu-button';
        menuButton.setAttribute('aria-haspopup', 'dialog');
        menuButton.innerHTML = '<span aria-hidden="true">☰</span> Menu';
        menuButton.addEventListener('click', () => this.openMenu());
        this.info = document.createElement('span');
        this.info.className = 'table-info';
        bar.append(menuButton, this.info);
        this.live = document.createElement('div');
        this.live.className = 'sr-only';
        this.live.setAttribute('aria-live', 'polite');
        this.screen.append(this.host, bar, this.live);
        root.replaceChildren(this.screen);
        this.applyPrefs();
        this.unsubscribe = session.on(event => this.onSessionEvent(event));
        void this.init();
        // Automated checks find the cards on the canvas through this
        if (options.debug) (window as unknown as { table: TableView }).table = this;
    }

    // region Lifecycle
    private async init() {
        await loadFonts();
        if (this.destroyed) return;
        const app = new Application();
        await app.init({
            resizeTo: this.host, antialias: true, autoDensity: true,
            resolution: Math.min(devicePixelRatio || 1, 3), background: '#0a0705',
        });
        if (this.destroyed) {
            app.destroy(true, {children: true});
            return;
        }
        this.app = app;
        this.host.appendChild(app.canvas);
        app.canvas.setAttribute('aria-hidden', 'true');
        this.art = artFor(this.prefs.back);
        this.buildScene();
        app.renderer.on('resize', () => this.relayout());
        this.relayout();
    }

    public render() {
        this.requestSync();
    }

    public destroy() {
        this.destroyed = true;
        this.unsubscribe();
        this.revealed.forEach(r => clearTimeout(r.timer));
        clearTimeout(this.dutchTimer);
        this.menu?.remove();
        document.body.classList.remove('in-game');
        if (this.app) {
            for (const s of this.sprites.values()) dispose(s);
            gsap.killTweensOf(this.app.stage);
            this.app.destroy(true, {children: true});
            this.app = null;
        }
        this.screen.remove();
    }

    private onSessionEvent(event: SessionEvent) {
        if (event.type === 'state') this.requestSync();
        if (event.type === 'reveal') {
            const id = event.card.id;
            const previous = this.revealed.get(id);
            if (previous) clearTimeout(previous.timer);
            this.revealed.set(id, {view: event.card, timer: window.setTimeout(() => {
                this.revealed.delete(id);
                this.requestSync();
            }, REVEAL_MS)});
            this.requestSync();
        }
        if (event.type === 'notice') {
            if (event.notice.kind === 'error') sfx.bad();
            this.chip(this.bottomId(), event.notice.text, event.notice.kind === 'error' ? 0xff6b6b : GOLD);
        }
    }

    private requestSync() {
        if (this.syncQueued) return;
        this.syncQueued = true;
        queueMicrotask(() => {
            this.syncQueued = false;
            if (!this.destroyed && this.app) this.sync();
        });
    }
    // endregion

    // region Helpers about the state
    private get state(): GameView | null {
        return this.session.state;
    }

    /** Player at the bottom of the screen: this device's player, the first one on a shared screen */
    private bottomId(): number {
        return this.state?.viewerId ?? 0;
    }

    /** This device plays for this player (every player on a shared screen) */
    private mine(playerId: number): boolean {
        const viewer = this.state?.viewerId;
        return viewer === null || viewer === undefined || viewer === playerId;
    }

    private nameOf(playerId: number): string {
        const s = this.state!;
        return s.viewerId === playerId ? 'vous' : s.players[playerId].name;
    }

    private order(s: GameView): number[] {
        const ids = s.players.map(p => p.id);
        const bottom = Math.max(0, ids.indexOf(this.bottomId()));
        return [...ids.slice(bottom), ...ids.slice(0, bottom)];
    }

    private dispatch(action: Action) {
        unlockAudio();
        buzz(this.prefs, 8);
        this.throwPick = null;
        this.session.dispatch(action);
    }
    // endregion

    // region Scene
    private buildScene() {
        const app = this.app!;
        this.deckGlow = centered(new Sprite(this.art.glow));
        this.deckGlow.alpha = 0;
        this.deckView.addChild(this.deckGlow);
        for (let i = 0; i < 6; i++) {
            const s = centered(new Sprite(this.art.back));
            this.deckStack.push(s);
            this.deckView.addChild(s);
        }
        this.deckCount.anchor.set(.5, 0);
        this.deckView.addChild(this.deckCount);
        this.deckView.eventMode = 'static';
        this.deckView.cursor = 'pointer';
        this.deckView.on('pointertap', () => this.tapDeck());
        this.discardZone.eventMode = 'static';
        this.discardZone.on('pointertap', () => this.tapDiscard());
        this.cardsLayer.sortableChildren = true;
        this.bannerText.anchor.set(.5);
        this.bannerBox.addChild(this.bannerBg, this.bannerText);
        this.uiLayer.addChild(this.bannerBox, this.buttons);
        app.stage.addChild(this.tableSprite, this.spots, this.slots, this.discardZone, this.deckView,
            this.seatsLayer, this.cardsLayer, this.uiLayer, this.fxLayer);

        app.stage.eventMode = 'static';
        app.stage.hitArea = app.screen;
        app.stage.on('globalpointermove', e => this.onPointerMove(e));
        app.stage.on('pointerup', () => this.onPointerUp());
        app.stage.on('pointerupoutside', () => this.onPointerUp());
        app.stage.on('pointerdown', e => {
            // Tap on the table: forget the card chosen to be thrown
            if (this.throwPick && !(e.target instanceof CardSprite) && e.target !== this.throwButton
                && !this.throwButton?.children.includes(e.target as never)) {
                this.throwPick = null;
                this.requestSync();
            }
        });
    }

    private relayout() {
        const app = this.app;
        const s = this.state;
        if (!app || !s) return;
        const bar = this.screen.querySelector('.table-bar')?.getBoundingClientRect();
        const top = bar ? bar.bottom - this.host.getBoundingClientRect().top : 44;
        this.layout = computeLayout(app.screen.width, app.screen.height, top, this.order(s), s.settings.cardsPerPlayer);
        const L = this.layout;
        const old = this.tableSprite.texture;
        this.tableSprite.texture = Texture.from(drawTable(L.w, L.h, L.table, Math.min(app.renderer.resolution, 2)));
        this.tableSprite.width = L.w;
        this.tableSprite.height = L.h;
        if (old && old !== Texture.EMPTY) old.destroy(true);

        const pileScale = L.pileW / CW;
        this.deckView.position.set(L.deck.x, L.deck.y);
        this.deckStack.forEach((sprite, i) => {
            sprite.scale.set(pileScale);
            sprite.position.set(-i * .7, -i * 1.3);
        });
        this.deckGlow.scale.set(pileScale);
        this.deckCount.position.set(0, L.pileW * RATIO / 2 + 6);
        this.deckCount.style.fontSize = 12 * L.ui;
        this.deckView.hitArea = new Rectangle(-L.pileW / 2, -L.pileW * RATIO / 2, L.pileW, L.pileW * RATIO);
        const zw = L.pileW, zh = zw * RATIO;
        this.discardZone.clear()
            .roundRect(L.discard.x - zw / 2, L.discard.y - zh / 2, zw, zh, zw * .08)
            .fill({color: 0x000000, alpha: .12})
            .stroke({width: 2, color: 0xffecbe, alpha: .25});
        this.discardZone.hitArea = new Rectangle(L.discard.x - zw / 2, L.discard.y - zh / 2, zw, zh);
        this.bannerText.style.fontSize = 15 * L.ui;
        this.bannerText.style.wordWrap = L.portrait;
        this.bannerText.style.wordWrapWidth = Math.min(L.banner.maxW, 520) - 32;
        this.bannerText.style.align = 'center';
        this.bannerText.text = '';
        this.bannerBox.position.set(L.banner.x, L.banner.y);
        this.buttonsKey = '';
        this.seatKey = '';
        this.sync(true);
    }

    private ensureSeats(s: GameView) {
        const key = s.players.map(p => `${p.id}:${p.name}:${p.color}`).join('|') + this.layout.w + 'x' + this.layout.h;
        if (key === this.seatKey) return;
        this.seatKey = key;
        if (this.seatViews.size !== s.players.length || [...this.seatViews.values()].some(v => !s.players[v.playerId])) {
            this.seatViews.forEach(v => {
                dispose(v.spot);
                dispose(v);
            });
            this.seatViews.clear();
        }
        for (const p of s.players) {
            let view = this.seatViews.get(p.id);
            if (!view) {
                view = new SeatView(p.id, p.color, p.id === s.viewerId && p.name !== 'Vous' ? `${p.name} (vous)` : p.name, this.art);
                view.on('pointertap', () => this.tapSeat(p.id));
                this.seatsLayer.addChild(view);
                this.spots.addChild(view.spot);
                this.seatViews.set(p.id, view);
            }
            view.layout(this.layout.seats.get(p.id)!, this.layout.ui, this.layout.cols);
        }
    }
    // endregion

    // region Sync: every card where the state says it is
    private sync(instant = false) {
        const s = this.state;
        if (!s || !this.app) return;
        if (!this.layout || this.layout.seats.size !== s.players.length) {
            this.relayout();
            return;
        }
        this.ensureSeats(s);
        const L = this.layout;
        const newRound = s.round !== this.shownRound;
        if (newRound) this.startRound(s);
        const roundOver = s.phase === 'roundOver' || s.phase === 'gameOver';
        const roundFaces = new Map<string, CardView>();
        if (roundOver && s.lastResult) s.lastResult.scores.forEach(r => r.hand.forEach(c => roundFaces.set(c.id, c)));
        if (s.activeEffect?.type !== 'JACK') this.jackPick = null;
        const seen = new Set<string>();
        const n = s.players.length;
        const dealDelay = (seatIndex: number, index: number) => this.dealing ? .55 + (index * n + seatIndex) * .07 : 0;
        const lastDeal = dealDelay(n - 1, s.settings.cardsPerPlayer - 1);
        const order = this.order(s);

        const put = (view: CardView, target: Target, place: Place, delay = 0, flipDelay = 0) => {
            seen.add(view.id);
            let sprite = this.sprites.get(view.id);
            const face = view.value ? view : this.revealed.get(view.id)?.view ?? roundFaces.get(view.id);
            if (!sprite) {
                sprite = new CardSprite(face ?? view, this.art);
                sprite.position.set(L.deck.x, L.deck.y);
                sprite.scale.set(L.pileW / CW);
                sprite.zIndex = 900;
                const id = view.id;
                sprite.on('pointerdown', (e: FederatedPointerEvent) => this.pressCard(id, e));
                this.cardsLayer.addChild(sprite);
                this.sprites.set(view.id, sprite);
                sprite.moveTo(target, delay, instant);
                sprite.setFace(target.up, instant ? 0 : delay + .12, instant);
            } else {
                if (face) sprite.learn(face);
                if (this.drag?.sprite !== sprite) {
                    sprite.moveTo(target, delay, instant);
                    sprite.setFace(target.up, flipDelay || (instant ? 0 : .1), instant);
                }
            }
            sprite.place = place;
        };

        // Hands
        for (const p of s.players) {
            const seat = L.seats.get(p.id)!;
            const seatIndex = order.indexOf(p.id);
            p.hand.forEach((card, index) => {
                if (!card) return;
                const pos = slot(seat, index, p.hand.length, L.cols);
                const up = !!card.value || this.revealed.has(card.id) || (roundOver && roundFaces.has(card.id));
                const picked = this.throwPick === card.id;
                put(card, {
                    x: pos.x, y: pos.y - (picked ? seat.cw * .25 : 0), rotation: jitter(card.id) * .06,
                    scale: seat.cw / CW * (picked ? 1.08 : 1), z: 10 + index + (picked ? 50 : 0), up,
                }, {zone: 'hand', player: p.id, index}, dealDelay(seatIndex, index), roundOver ? .15 * seatIndex + index * .08 : 0);
            });
        }

        // Drawn card
        if (s.drawn) {
            const cur = s.currentPlayerIndex;
            const held = L.seats.get(cur)!.held;
            put(s.drawn.card, {...held, rotation: this.mine(cur) ? -.04 : 0, scale: held.cw / CW, z: 500, up: !!s.drawn.card.value}, {zone: 'held'});
        }

        // Discard pile: the last cards, the top one on top
        this.trackPile(s);
        const visible = this.pile.slice(-5).filter(c => !seen.has(c.id));
        visible.forEach((card, k) => {
            put(card, {
                x: L.discard.x + jitter(card.id, 1) * L.pileW * .12,
                y: L.discard.y + jitter(card.id, 2) * L.pileW * .12,
                rotation: jitter(card.id, 3) * .45, scale: L.pileW / CW, z: 100 + k, up: true,
            }, {zone: 'discard', top: k === visible.length - 1}, this.dealing ? lastDeal + .3 : 0);
        });

        for (const [id, sprite] of this.sprites) {
            if (seen.has(id)) continue;
            // Under other discarded cards, or shuffled back into the draw pile
            this.sprites.delete(id);
            sprite.eventMode = 'none';
            gsap.to(sprite, {alpha: 0, duration: .3, delay: .6, onComplete: () => dispose(sprite)});
        }

        this.dealing = false;
        this.trackMove(s);
        this.updateTable(s);
        this.readLog(s);
        this.updateInfo(s);
        if (roundOver && s.lastResult) {
            const key = `${s.round}-${s.phase}`;
            if (this.panelFor !== key) {
                this.panelFor = key;
                gsap.delayedCall(newRound || instant ? 0 : 1.8, () => this.showPanel());
            } else if (instant && this.panel) {
                this.showPanel(true);
            }
        } else if (this.panel) {
            this.hidePanel();
        }
    }

    private startRound(s: GameView) {
        const L = this.layout;
        // The cards of the previous round go back on the draw pile
        for (const sprite of this.sprites.values()) {
            sprite.eventMode = 'none';
            gsap.killTweensOf(sprite);
            gsap.to(sprite, {x: L.deck.x, y: L.deck.y, rotation: 0, duration: .45, delay: Math.random() * .2, ease: 'power2.in'});
            gsap.to(sprite, {alpha: 0, duration: .2, delay: .5, onComplete: () => dispose(sprite)});
        }
        this.sprites.clear();
        this.pile = [];
        this.jackPick = null;
        this.throwPick = null;
        // Dealt one by one when a round starts in front of us, not when a game in progress is opened
        this.dealing = this.shownRound !== -1 || (s.phase === 'peek' || s.log.length < 4);
        this.shownRound = s.round;
        this.panelFor = '';
        this.hidePanel();
    }

    private trackPile(s: GameView) {
        const top = s.topDiscard;
        if (!top) {
            this.pile = [];
            return;
        }
        const at = this.pile.findIndex(c => c.id === top.id);
        if (at >= 0) this.pile = this.pile.slice(0, at + 1);
        else this.pile.push(top);
        if (this.pile.length > 8) this.pile = this.pile.slice(-8);
    }

    /** Effects of the last move: sparks, shakes, a bot looking at its cards */
    private trackMove(s: GameView) {
        const move = s.lastMove;
        if (!move || move.seq === this.moveSeq) return;
        const first = this.moveSeq === 0;
        this.moveSeq = move.seq;
        if (first) return;
        if (move.type === 'throw') {
            this.sparks(this.layout.discard);
            sfx.good();
        }
        if (move.type === 'wrongThrow') {
            sfx.bad();
            this.sprites.get(move.cardIds[0])?.shake(0xff9a9a);
        }
        if ((move.type === 'peek' || move.type === 'queenPeek') && !this.mine(move.playerId)) {
            move.cardIds.forEach(id => this.sprites.get(id)?.peekGesture());
        }
        if (move.type === 'dutch') this.dutchBanner(s.players[move.playerId].name, move.playerId === s.viewerId);
    }
    // endregion

    // region Table, banner, buttons
    private updateTable(s: GameView) {
        const effect = s.activeEffect;
        const cur = s.currentPlayerIndex;
        const myTurn = s.phase !== 'peek' && (s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played') && this.mine(cur);
        const myEffect = effect && this.mine(effect.playerId) ? effect.type : null;
        const canDraw = myTurn && s.phase === 'draw' && !effect && !s.isStuck;
        const stack = Math.min(this.deckStack.length, Math.ceil(s.deckRemaining / 8));
        this.deckStack.forEach((sprite, i) => sprite.visible = i < stack);
        this.deckCount.text = s.deckRemaining ? `${s.deckRemaining}` : 'vide';
        this.deckGlow.alpha = canDraw ? .85 : 0;

        // Places of the hands: an empty place stays visible
        this.slots.clear();
        for (const p of s.players) {
            const seat = this.layout.seats.get(p.id)!;
            p.hand.forEach((_, index) => {
                const pos = slot(seat, index, p.hand.length, this.layout.cols);
                const w = seat.cw, h = w * RATIO;
                this.slots.roundRect(pos.x - w / 2, pos.y - h / 2, w, h, w * .08);
            });
        }
        this.slots.fill({color: 0x000000, alpha: .14}).stroke({width: 1.5, color: 0xffecbe, alpha: .18});

        for (const sprite of this.sprites.values()) {
            const place = sprite.place;
            if (!place) continue;
            let glow = 0;
            const inHand = place.zone === 'hand';
            const own = inHand && this.mine(place.player);
            const peeking = s.phase === 'peek' && own && !s.players[place.player].ready && this.peeker(s) === place.player;
            if (peeking) glow = 1;
            else if (myEffect === 'QUEEN' && inHand && place.player === effect!.playerId) glow = 1;
            else if (myEffect === 'JACK' && inHand && (place.player === effect!.playerId || s.dutchCallerId !== place.player)) {
                glow = this.jackPick === sprite.view.id ? 2 : 1;
            } else if (myEffect === 'ACE' && inHand && s.dutchCallerId !== place.player) glow = 1;
            else if (myTurn && !effect && s.phase === 'draw' && place.zone === 'discard' && place.top) glow = 1;
            else if (myTurn && !effect && s.phase === 'drawn') {
                if (inHand && place.player === cur) glow = 1;
                if (place.zone === 'discard' && place.top && s.drawn?.source === 'pile') glow = 1;
            } else if (this.throwPick === sprite.view.id) glow = 2;
            sprite.setGlow(glow);
            const draggable = (own && s.players[place.player].canThrow) || (place.zone === 'held' && myTurn);
            sprite.cursor = glow || draggable ? 'pointer' : 'default';
        }

        for (const p of s.players) {
            const running = s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played';
            const badge = s.dutchCallerId === p.id ? 'DUTCH' : !p.connected ? 'HORS LIGNE' : p.locked ? 'BLOQUÉ' : null;
            this.seatViews.get(p.id)?.update({
                score: p.score,
                active: running && (effect ? effect.playerId === p.id : cur === p.id),
                badge,
                choosable: myEffect === 'ACE' && s.dutchCallerId !== p.id,
                connected: p.connected,
            });
        }
        this.updateBanner(s);
        this.updateButtons(s);
        this.updateThrowButton(s);
    }

    /** Who looks at his cards now (peek variant): this device's player, or on a shared screen the next one */
    private peeker(s: GameView): number | null {
        if (s.phase !== 'peek') return null;
        if (s.viewerId !== null) return s.players[s.viewerId].ready ? null : s.viewerId;
        return s.players.find(p => !p.ready)?.id ?? null;
    }

    private instruction(s: GameView): string {
        const effect = s.activeEffect;
        const cur = s.players[s.currentPlayerIndex];
        const myTurn = this.mine(cur.id);
        const who = (id: number) => s.viewerId === null ? `${s.players[id].name} : ` : 'À vous : ';
        if (s.phase === 'peek') {
            const peeker = this.peeker(s);
            if (peeker !== null) return `${who(peeker)}regardez vos 2 cartes du bas et retenez-les !`;
            return 'Les autres regardent leurs cartes…';
        }
        if (s.phase === 'roundOver' || s.phase === 'gameOver') return 'Fin de la manche : on retourne les cartes';
        let text: string;
        if (effect) {
            const owner = s.players[effect.playerId];
            if (!this.mine(owner.id)) text = `${owner.name} utilise ${effect.cardName}…`;
            else if (effect.type === 'QUEEN') text = `${who(owner.id)}Dame : touchez une de vos cartes pour la regarder`;
            else if (effect.type === 'JACK') text = this.jackPick ? 'Valet : touchez la 2ᵉ carte à échanger' : `${who(owner.id)}Valet : touchez deux cartes à échanger`;
            else text = `${who(owner.id)}As : touchez un joueur, il reçoit une carte`;
        } else if (myTurn && s.phase === 'draw') {
            text = s.isStuck ? 'Plus rien à piocher : passez votre tour' : `${who(cur.id)}piochez, ou prenez la défausse`;
        } else if (myTurn && s.phase === 'drawn') {
            text = s.drawn?.source === 'pile'
                ? 'Touchez une de vos cartes pour l\'échanger, ou la défausse pour jeter celle-ci'
                : 'Touchez la carte de votre jeu à remplacer';
        } else if (myTurn && s.phase === 'played') {
            text = s.dutchCallerId === null ? 'Finissez votre tour… ou annoncez Dutch !' : 'Finissez votre tour';
        } else {
            text = `Tour de ${cur.name}`;
            if (s.viewerId !== null && s.players[s.viewerId].canThrow) text += ' · une carte identique ? Glissez-la sur la défausse';
        }
        if (s.isFinalRound) text = `Dernier tour · ${text}`;
        return text;
    }

    private updateBanner(s: GameView) {
        const text = this.instruction(s);
        if (this.bannerText.text === text) return;
        this.bannerText.text = text;
        this.live.textContent = text;
        this.bannerBox.scale.set(Math.min(1, this.layout.banner.maxW / (this.bannerText.width + 32)));
        const w = this.bannerText.width + 32;
        const h = this.bannerText.height + 14;
        this.bannerBg.clear().roundRect(-w / 2, -h / 2, w, h, h / 2).fill({color: 0x0a0705, alpha: .55}).stroke({width: 1, color: 0xffecbe, alpha: .2});
        gsap.fromTo(this.bannerBox, {alpha: .3}, {alpha: 1, duration: .3});
    }

    private updateButtons(s: GameView) {
        const effect = s.activeEffect;
        const cur = s.currentPlayerIndex;
        const running = s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played';
        const myTurn = running && this.mine(cur);
        const list: [string, ButtonKind, () => void][] = [];
        const peeker = this.peeker(s);
        if (peeker !== null) {
            list.push([s.viewerId === null ? `${s.players[peeker].name} : regarder` : 'Regarder mes cartes', 'primary',
                () => this.dispatch({type: 'peek', playerId: peeker})]);
        } else if (effect && this.mine(effect.playerId)) {
            list.push(['Passer l\'effet', 'ghost', () => this.dispatch({type: 'skipEffect', playerId: effect.playerId})]);
        } else if (myTurn && !effect && s.phase === 'played') {
            list.push(['Finir mon tour', 'primary', () => this.dispatch({type: 'endTurn', playerId: cur, dutch: false})]);
            if (s.dutchCallerId === null) {
                list.push([this.dutchArmed ? 'Confirmer : Dutch !' : 'Dutch !', 'danger', () => {
                    if (!this.dutchArmed) {
                        // Saying Dutch ends the round: one more tap to be sure
                        this.dutchArmed = true;
                        clearTimeout(this.dutchTimer);
                        this.dutchTimer = window.setTimeout(() => {
                            this.dutchArmed = false;
                            this.requestSync();
                        }, 3500);
                        this.requestSync();
                        return;
                    }
                    this.dutchArmed = false;
                    this.dispatch({type: 'endTurn', playerId: cur, dutch: true});
                }]);
            }
        } else if (myTurn && !effect && s.phase === 'draw' && s.isStuck) {
            list.push(['Passer', 'primary', () => this.dispatch({type: 'endTurn', playerId: cur, dutch: false})]);
        }
        if (!(myTurn && s.phase === 'played')) this.dutchArmed = false;
        const L = this.layout;
        const key = list.map(b => b[0]).join('|');
        if (key === this.buttonsKey) return;
        this.buttonsKey = key;
        this.buttons.removeChildren().forEach(dispose);
        const views = list.map(([text, kind, onTap]) => button(text, kind, L.ui, onTap));
        const gap = 12 * L.ui;
        if (L.buttons.vertical) {
            const total = views.reduce((sum, v) => sum + v.height, 0) + gap * (views.length - 1);
            let y = L.buttons.y - total / 2;
            for (const v of views) {
                v.position.set(L.buttons.x, y + v.height / 2);
                y += v.height + gap;
            }
        } else {
            const total = views.reduce((sum, v) => sum + v.width, 0) + gap * (views.length - 1);
            let x = L.buttons.x - total / 2;
            for (const v of views) {
                v.position.set(x + v.width / 2, L.buttons.y);
                x += v.width + gap;
            }
        }
        views.forEach((v, i) => {
            this.buttons.addChild(v);
            gsap.from(v, {alpha: 0, y: v.y + 12, duration: .3, delay: i * .06, ease: 'back.out(2)'});
        });
    }

    /** A card chosen to be thrown: a "Jeter" button above it */
    private updateThrowButton(s: GameView) {
        const id = this.throwPick;
        const sprite = id ? this.sprites.get(id) : undefined;
        const place = sprite?.place;
        const valid = sprite && place?.zone === 'hand' && s.players[place.player].canThrow && this.mine(place.player);
        if (!valid) {
            if (this.throwButton) dispose(this.throwButton);
            this.throwButton = null;
            if (id) this.throwPick = null;
            return;
        }
        if (this.throwButton) return;
        const owner = place.player;
        this.throwButton = button('Jeter sur la défausse', 'primary', this.layout.ui * .85, () => {
            this.dispatch({type: 'throwCard', playerId: owner, cardId: id!});
        });
        const target = sprite.target!;
        const seat = this.layout.seats.get(owner)!;
        this.throwButton.position.set(
            clamp(target.x, 110, this.layout.w - 110),
            target.y - seat.cw * RATIO / 2 - 28 * this.layout.ui);
        this.uiLayer.addChild(this.throwButton);
        gsap.from(this.throwButton, {alpha: 0, y: this.throwButton.y + 10, duration: .2});
    }

    private updateInfo(s: GameView) {
        const text = `Manche ${s.round} · ${s.targetScore} pts`;
        if (this.info.textContent !== text) this.info.textContent = text;
    }
    // endregion

    // region Messages and effects
    private chip(playerId: number | null, text: string, color: number) {
        if (!this.app) return;
        const L = this.layout;
        const seat = playerId === null ? undefined : L.seats.get(playerId);
        const pos = seat ? seat.chip : {x: L.w / 2, y: L.banner.y + 40};
        const key = playerId ?? -1;
        const previous = this.chips.get(key);
        if (previous) dispose(previous);
        const box = new Container();
        const t = label(text, 12.5 * L.ui, 0xffffff, '600');
        t.style.wordWrap = true;
        t.style.wordWrapWidth = Math.min(230 * L.ui, L.w - 40);
        t.style.align = 'center';
        t.anchor.set(.5);
        const w = t.width + 22, h = t.height + 12;
        box.addChild(new Graphics().roundRect(-w / 2, -h / 2, w, h, 10).fill({color: 0x0d0f14, alpha: .9}).stroke({width: 2, color}), t);
        box.position.set(clamp(pos.x, w / 2 + 8, L.w - w / 2 - 8), clamp(pos.y, h / 2 + 4, L.h - h / 2 - 4));
        this.fxLayer.addChild(box);
        this.chips.set(key, box);
        gsap.from(box, {alpha: 0, y: box.y + 8, duration: .25, ease: 'back.out(2)'});
        gsap.to(box, {alpha: 0, duration: .4, delay: 2.8, onComplete: () => {
            if (this.chips.get(key) === box) this.chips.delete(key);
            dispose(box);
        }});
    }

    private static readonly SKIP = /^(C'est au tour|Au tour|Dernier tour de|— Ronde|Chaque joueur|Fin de la ronde|Partie terminée)/;

    /** New lines of the game log, shown next to the player concerned */
    private readLog(s: GameView) {
        const log = s.log;
        let fresh: typeof log;
        if (!this.lastLog) {
            fresh = [];
        } else {
            const last = this.lastLog;
            let at = -1;
            for (let i = log.length - 1; i >= 0; i--) {
                if (log[i].round === last.round && log[i].message === last.message) {
                    at = i;
                    break;
                }
            }
            fresh = at >= 0 ? log.slice(at + 1) : log.slice(Math.max(0, log.length - Math.max(1, log.length - this.logLength)));
        }
        this.logLength = log.length;
        const end = log[log.length - 1];
        this.lastLog = end ? {round: end.round, message: end.message} : null;
        for (const entry of fresh.slice(-6)) {
            if (TableView.SKIP.test(entry.message) || entry.kind === 'dutch') continue;
            const actor = s.players.find(p => entry.message.startsWith(p.name)) ?? s.players.find(p => entry.message.includes(p.name));
            // This device's own routine moves are not announced: the player just did them
            if (actor && s.viewerId === actor.id && entry.kind === 'info') continue;
            const color = actor ? parseInt(actor.color.slice(1), 16) : GOLD;
            this.chip(actor ? actor.id : null, entry.message, color);
            this.live.textContent = entry.message;
        }
    }

    private sparks(at: Point) {
        for (let i = 0; i < 22; i++) {
            const s = centered(new Sprite(this.art.spark));
            s.position.set(at.x, at.y);
            s.blendMode = 'add';
            const a = Math.random() * Math.PI * 2;
            const d = 40 + Math.random() * 70;
            s.scale.set(.6 + Math.random() * .8);
            this.fxLayer.addChild(s);
            gsap.to(s, {x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d, alpha: 0, duration: .7 + Math.random() * .3, ease: 'power2.out', onComplete: () => dispose(s)});
        }
    }

    private dutchBanner(name: string, me: boolean) {
        sfx.dutch();
        buzz(this.prefs, [30, 40, 30]);
        const L = this.layout;
        const box = new Container();
        const big = new Text({
            text: 'DUTCH !',
            style: {
                fontFamily: SERIF, fontStyle: 'italic', fontWeight: '900', fontSize: Math.min(L.w, L.h) * .17,
                fill: GOLD, stroke: {color: 0x5a0f1d, width: 10},
                dropShadow: {color: 0x000000, alpha: .6, blur: 12, distance: 6, angle: Math.PI / 2},
            },
        });
        big.anchor.set(.5);
        const small = label(me ? 'Vous annoncez la fin : dernier tour pour les autres' : `${name} annonce la fin : dernier tour pour les autres`, 15 * L.ui, 0xffffff, '800');
        small.anchor.set(.5, 0);
        small.y = big.height / 2;
        box.addChild(big, small);
        box.position.set(L.w / 2, L.h * .45);
        this.fxLayer.addChild(box);
        this.live.textContent = me ? 'Vous dites Dutch !' : `${name} dit Dutch !`;
        gsap.timeline({onComplete: () => dispose(box)})
            .from(box.scale, {x: 2.4, y: 2.4, duration: .45, ease: 'back.out(1.6)'})
            .from(box, {alpha: 0, duration: .25}, 0)
            .to(box, {alpha: 0, duration: .4}, '+=1.2');
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
            gsap.fromTo(this.app!.stage, {x: -8}, {x: 0, duration: .6, ease: 'elastic.out(1.4, .25)'});
        }
    }
    // endregion

    // region Score panel
    private hidePanel() {
        if (!this.panel) return;
        const p = this.panel;
        this.panel = null;
        gsap.to(p, {alpha: 0, duration: .2, onComplete: () => dispose(p)});
    }

    private showPanel(instant = false) {
        const s = this.state;
        const result = s?.lastResult;
        if (!s || !result || this.destroyed || !this.app) return;
        if (this.panel) dispose(this.panel);
        const L = this.layout;
        const ui = L.ui;
        const p = new Container();
        const w = Math.min(400 * ui, L.w - 24);
        const rows = result.scores.length;
        const rowH = Math.min(40 * ui, (L.h - 220 * ui) / rows);
        const h = 130 * ui + rowH * rows;
        const dim = new Graphics().rect(0, 0, L.w, L.h).fill({color: 0x000000, alpha: .45});
        dim.eventMode = 'static';
        const box = new Container();
        box.position.set(L.w / 2, L.h / 2);
        box.addChild(new Graphics().roundRect(-w / 2, -h / 2, w, h, 18).fill({color: 0x12100d, alpha: .96}).stroke({width: 2, color: GOLD, alpha: .5}));
        let title = `Fin de la manche ${result.round}`;
        if (result.gameOver) {
            const names = result.winners.map(id => id === s.viewerId ? 'vous' : s.players[id].name);
            title = result.winners.length === 1 && result.winners[0] === s.viewerId ? 'Vous gagnez !' : `Victoire : ${names.join(' et ')}`;
        }
        const titleText = new Text({text: title, style: {fontFamily: SERIF, fontWeight: '900', fontSize: 24 * ui, fill: GOLD}});
        titleText.anchor.set(.5, 0);
        titleText.y = -h / 2 + 16 * ui;
        box.addChild(titleText);
        result.scores.slice().sort((a, b) => a.total - b.total).forEach((r, i) => {
            const player = s.players[r.playerId];
            const y = -h / 2 + 62 * ui + i * rowH + rowH / 2;
            const won = result.winners.includes(r.playerId);
            box.addChild(new Graphics().circle(-w / 2 + 28 * ui, y, 9 * ui).fill(player.color));
            const name = label(`${player.name}${r.playerId === s.viewerId ? ' (vous)' : ''}${r.playerId === result.dutchCallerId ? ' · Dutch' : ''}`, 15 * ui, won ? GOLD : CREAM, '800');
            name.anchor.set(0, .5);
            name.position.set(-w / 2 + 46 * ui, y);
            const pts = label(`+${r.points}${r.penalty ? ` (+${r.penalty})` : ''}`, 14 * ui, r.penalty ? 0xff8a8a : 0xd9c9a3, '600');
            pts.anchor.set(1, .5);
            pts.position.set(w / 2 - 80 * ui, y);
            const total = label(`${r.total}`, 17 * ui, 0xffffff, '800');
            total.anchor.set(1, .5);
            total.position.set(w / 2 - 22 * ui, y);
            box.addChild(name, pts, total);
        });
        const bottom = h / 2 - 34 * ui;
        if (this.session.isHost) {
            const next = button(result.gameOver ? 'Nouvelle partie' : 'Manche suivante', 'primary', ui, () => {
                if (result.gameOver) this.options.onNewGame();
                else this.dispatch({type: 'nextRound', playerId: s.viewerId ?? 0});
            });
            next.y = bottom;
            box.addChild(next);
        } else {
            const wait = label(result.gameOver ? 'En attente d\'une nouvelle partie…' : `En attente de ${s.players[0].name} pour la suite…`, 14 * ui, 0xd9c9a3, '600');
            wait.anchor.set(.5);
            wait.y = bottom;
            box.addChild(wait);
        }
        p.addChild(dim, box);
        this.fxLayer.addChild(p);
        this.panel = p;
        this.live.textContent = `${title}. ${result.scores.map(r => `${s.players[r.playerId].name} ${r.total}`).join(', ')}`;
        if (!instant) {
            gsap.from(dim, {alpha: 0, duration: .3});
            gsap.from(box.scale, {x: .8, y: .8, duration: .35, ease: 'back.out(1.8)'});
            gsap.from(box, {alpha: 0, duration: .25});
        }
    }
    // endregion

    // region Input
    private nope(sprite?: CardSprite) {
        sprite?.shake();
        buzz(this.prefs, 20);
    }

    private pressCard(id: string, e: FederatedPointerEvent) {
        unlockAudio();
        const s = this.state;
        const sprite = this.sprites.get(id);
        if (!s || !sprite?.place) return;
        const place = sprite.place;
        const running = s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played';
        const own = place.zone === 'hand' && this.mine(place.player);
        const canDrag = (own && s.players[place.player].canThrow) || (place.zone === 'held' && running && this.mine(s.currentPlayerIndex));
        this.drag = {sprite, id, start: {x: e.global.x, y: e.global.y}, offset: {x: sprite.x - e.global.x, y: sprite.y - e.global.y}, moved: false, canDrag, lastX: e.global.x};
    }

    private onPointerMove(e: FederatedPointerEvent) {
        const drag = this.drag;
        if (!drag) return;
        if (!drag.moved) {
            if (!drag.canDrag || Math.hypot(e.global.x - drag.start.x, e.global.y - drag.start.y) < 8) return;
            drag.moved = true;
            this.throwPick = null;
            gsap.killTweensOf(drag.sprite);
            gsap.killTweensOf(drag.sprite.scale);
            drag.sprite.zIndex = 3000;
            gsap.to(drag.sprite, {lift: 1, duration: .15});
            const big = Math.max(this.layout.seats.get(this.bottomId())!.cw, this.layout.pileW) / CW * 1.05;
            gsap.to(drag.sprite.scale, {x: big, y: big, duration: .15});
        }
        const sprite = drag.sprite;
        sprite.position.set(e.global.x + drag.offset.x, e.global.y + drag.offset.y);
        // Tilt with the speed of the finger
        const vx = e.global.x - drag.lastX;
        drag.lastX = e.global.x;
        sprite.rotation += (clamp(vx * .02, -.35, .35) - sprite.rotation) * .3;
    }

    private onPointerUp() {
        const drag = this.drag;
        if (!drag) return;
        this.drag = null;
        if (!drag.moved) return this.tapCard(drag.id);
        const sprite = drag.sprite;
        gsap.to(sprite, {lift: 0, duration: .2});
        const s = this.state!;
        const L = this.layout;
        const before = s.lastMove?.seq;
        const overDiscard = Math.hypot(sprite.x - L.discard.x, sprite.y - L.discard.y) < L.pileW * 1.1;
        const place = sprite.place;
        const cur = s.currentPlayerIndex;
        if (overDiscard && place) {
            if (place.zone === 'held') this.dispatch({type: 'discardDrawn', playerId: cur});
            else if (place.zone === 'hand') this.dispatch({type: 'throwCard', playerId: place.player, cardId: drag.id});
        } else if (place?.zone === 'held') {
            const seat = L.seats.get(cur)!;
            const target = [...this.sprites.values()].find(o => o.place?.zone === 'hand' && o.place.player === cur
                && Math.hypot(o.x - sprite.x, o.y - sprite.y) < seat.cw * .8);
            if (target) this.dispatch({type: 'swapDrawn', playerId: cur, cardId: target.view.id});
        }
        // Nothing happened (or not yet: online, the answer comes back later): back to its place for now
        if (this.state?.lastMove?.seq === before) sprite.settle();
    }

    private tapCard(id: string) {
        const s = this.state;
        const sprite = this.sprites.get(id);
        const place = sprite?.place;
        if (!s || !sprite || !place) return;
        const effect = s.activeEffect;
        const cur = s.currentPlayerIndex;
        if (effect) {
            if (!this.mine(effect.playerId)) return this.nope(sprite);
            if (effect.type === 'QUEEN' && place.zone === 'hand' && place.player === effect.playerId) {
                return this.dispatch({type: 'queenPeek', playerId: effect.playerId, cardId: id});
            }
            if (effect.type === 'JACK' && place.zone === 'hand') {
                if (!this.jackPick || this.jackPick === id) {
                    this.jackPick = this.jackPick === id ? null : id;
                    sfx.tap();
                    return this.requestSync();
                }
                const first = this.jackPick;
                this.jackPick = null;
                return this.dispatch({type: 'jackSwap', playerId: effect.playerId, cardIdA: first, cardIdB: id});
            }
            if (effect.type === 'ACE' && place.zone === 'hand') return this.dispatch({type: 'aceGive', playerId: effect.playerId, targetId: place.player});
            return this.nope(sprite);
        }
        const peeker = this.peeker(s);
        if (peeker !== null && place.zone === 'hand' && place.player === peeker) return this.dispatch({type: 'peek', playerId: peeker});
        const myTurn = (s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played') && this.mine(cur);
        if (myTurn && s.phase === 'draw' && place.zone === 'discard') return this.dispatch({type: 'takeDiscard', playerId: cur});
        if (myTurn && s.phase === 'drawn') {
            if (place.zone === 'hand' && place.player === cur) return this.dispatch({type: 'swapDrawn', playerId: cur, cardId: id});
            if (place.zone === 'discard' || place.zone === 'held') return this.tapDiscard();
        }
        // Own card while throwing is allowed: choose it, a button confirms
        if (place.zone === 'hand' && this.mine(place.player) && s.players[place.player].canThrow) {
            this.throwPick = this.throwPick === id ? null : id;
            sfx.tap();
            return this.requestSync();
        }
        this.nope(sprite);
    }

    private tapDeck() {
        const s = this.state;
        if (!s) return;
        const cur = s.currentPlayerIndex;
        if (s.phase === 'draw' && this.mine(cur) && !s.activeEffect) this.dispatch({type: 'drawFromPile', playerId: cur});
        else gsap.fromTo(this.deckView, {x: this.layout.deck.x - 6}, {x: this.layout.deck.x, duration: .4, ease: 'elastic.out(1.2, .3)'});
    }

    private tapDiscard() {
        const s = this.state;
        if (!s) return;
        const cur = s.currentPlayerIndex;
        if (!this.mine(cur) || s.activeEffect) return;
        if (s.phase === 'drawn' && s.drawn?.source === 'pile') this.dispatch({type: 'discardDrawn', playerId: cur});
        else if (s.phase === 'draw') this.dispatch({type: 'takeDiscard', playerId: cur});
    }

    private tapSeat(playerId: number) {
        const effect = this.state?.activeEffect;
        if (effect?.type === 'ACE' && this.mine(effect.playerId)) this.dispatch({type: 'aceGive', playerId: effect.playerId, targetId: playerId});
    }
    // endregion

    // region Menu
    private applyPrefs() {
        setMuted(!this.prefs.sound);
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        gsap.globalTimeline.timeScale(reduced ? 2.5 : this.prefs.speed === 'fast' ? 1.6 : 1);
    }

    private openMenu() {
        if (this.menu) return;
        const s = this.state;
        const opener = document.activeElement as HTMLElement | null;
        const dialog = document.createElement('div');
        dialog.className = 'overlay table-menu';
        const close = () => {
            dialog.remove();
            this.menu = null;
            opener?.focus();
        };
        const rules = s ? describeSettings(s.settings).map(line => `<li>${escape(line)}</li>`).join('') : '';
        const backs = (Object.keys(BACK_COLORS) as BackColor[]).map(key =>
            `<label class="back-choice"><input type="radio" name="back" value="${key}" ${this.prefs.back === key ? 'checked' : ''}><span class="back-swatch back-${key}" aria-hidden="true"></span>${BACK_COLORS[key].name}</label>`).join('');
        dialog.innerHTML = `
            <section class="panel menu-panel" role="dialog" aria-modal="true" aria-labelledby="menu-title">
                <h2 id="menu-title">Menu</h2>
                <button type="button" class="primary" data-act="close">Reprendre la partie</button>
                <details><summary>Règles de la partie</summary><ul>${rules}</ul></details>
                <fieldset><legend>Réglages de cet appareil</legend>
                    <label class="switch"><input type="checkbox" name="sound" ${this.prefs.sound ? 'checked' : ''}> Sons</label>
                    <label class="switch"><input type="checkbox" name="vibration" ${this.prefs.vibration ? 'checked' : ''}> Vibrations</label>
                    <label class="switch"><input type="checkbox" name="fast" ${this.prefs.speed === 'fast' ? 'checked' : ''}> Animations rapides</label>
                    <div class="backs" role="radiogroup" aria-label="Dos des cartes">${backs}</div>
                    ${this.options.debug && this.session.canShowAll ? '<label class="switch"><input type="checkbox" name="showAll"> Voir toutes les cartes (debug)</label>' : ''}
                </fieldset>
                <button type="button" class="secondary danger" data-act="quit">Quitter la partie</button>
            </section>`;
        dialog.addEventListener('click', e => {
            const target = e.target as HTMLElement;
            if (target === dialog || target.dataset.act === 'close') close();
            if (target.dataset.act === 'quit') {
                if (!this.options.quitWarning || confirm(this.options.quitWarning)) {
                    close();
                    this.options.onQuit();
                }
            }
        });
        dialog.addEventListener('keydown', e => {
            if (e.key === 'Escape') close();
        });
        dialog.addEventListener('change', e => {
            const input = e.target as HTMLInputElement;
            if (input.name === 'sound') this.prefs.sound = input.checked;
            if (input.name === 'vibration') this.prefs.vibration = input.checked;
            if (input.name === 'fast') this.prefs.speed = input.checked ? 'fast' : 'normal';
            if (input.name === 'showAll') this.session.setShowAll(input.checked);
            if (input.name === 'back') {
                this.prefs.back = input.value as BackColor;
                this.changeBack();
            }
            savePrefs(this.prefs);
            this.applyPrefs();
        });
        document.body.appendChild(dialog);
        this.menu = dialog;
        dialog.querySelector<HTMLElement>('[data-act="close"]')?.focus();
    }

    /** New card back: every card and the draw pile are drawn again */
    private changeBack() {
        if (!this.app) return;
        this.art = artFor(this.prefs.back);
        this.deckStack.forEach(s => s.texture = this.art.back);
        for (const sprite of this.sprites.values()) dispose(sprite);
        this.sprites.clear();
        this.seatViews.forEach(v => {
            dispose(v.spot);
            dispose(v);
        });
        this.seatViews.clear();
        this.seatKey = '';
        this.sync(true);
    }
    // endregion
}

function escape(text: string): string {
    return text.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]!));
}

export type {PlayerView};
