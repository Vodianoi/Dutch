import {Application, Container, FederatedPointerEvent, Graphics, Rectangle, Sprite, Text, Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {ChatMessage} from '../net/Protocol.js';
import {Session, SessionEvent} from '../Session.js';
import {ChatBox} from '../ui/ChatBox.js';
import {joinNames, t} from '../i18n.js';
import {Action, CardView, effectCard, GameView, logText, noticeText, PlayerView} from '../View.js';
import {Art, BackColor, CW, drawTable, EMOJI, makeArt, SANS, SERIF} from './art.js';
import {TableChrome} from './chrome.js';
import {CardSprite, centered, dispose, Place, Target} from './CardSprite.js';
import {cardWidth, clamp, computeLayout, jitter, Layout, Point, RATIO, Rect, slot} from './layout.js';
import {buzz, loadPrefs, Prefs} from './prefs.js';
import {sfx, unlockAudio} from './sound.js';
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
    /** Chat of the online game, coming from the waiting room (otherwise the table makes its own if the session has a chat) */
    chatBox?: ChatBox;
    /** The player chose the other table (flat / 3D) */
    onTableChange?(mode: '2d' | '3d'): void;
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
        document.fonts.load(`32px ${EMOJI}`, '😀👍😂😮😬😡🎉🤔😎🙏🔥'),
    ]).catch(() => undefined);
    return fontsReady;
}

export class TableView {
    private readonly screen: HTMLElement;
    private readonly host: HTMLElement;
    private readonly info: HTMLElement;
    private readonly live: HTMLElement;
    /** Menu, reactions and chat (HTML, shared with the 3D table) */
    private readonly chrome: TableChrome;
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
    private deckLit = false;
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
    /** Where each message would like to be (it moves away from buttons and piles) */
    private readonly chipAnchors = new Map<Container, Point>();
    /** Turn buttons on the table, while they are shown */
    private buttonsRect: Rect | null = null;
    private drag: { sprite: CardSprite; id: string; start: Point; offset: Point; moved: boolean; canDrag: boolean; lastX: number } | null = null;
    private syncQueued = false;
    /** "Hold the phone upright" when the table is too crowded for a screen held sideways */
    private readonly hint: HTMLElement;
    private myTurnBefore = false;

    constructor(root: HTMLElement, private readonly session: Session, private readonly options: TableOptions) {
        document.body.classList.add('in-game');
        this.screen = document.createElement('div');
        this.screen.className = 'table-screen';
        this.host = document.createElement('div');
        this.host.className = 'table-canvas';
        const bar = document.createElement('div');
        bar.className = 'table-bar';
        this.info = document.createElement('span');
        this.info.className = 'table-info';
        const left = document.createElement('div');
        left.className = 'table-bar-group';
        bar.append(left, this.info);
        this.live = document.createElement('div');
        this.live.className = 'sr-only';
        this.live.setAttribute('aria-live', 'polite');
        this.hint = document.createElement('p');
        this.hint.className = 'table-hint';
        this.hint.hidden = true;
        this.hint.textContent = t('Tenez le téléphone droit pour mieux voir la table');
        this.screen.append(this.host, bar, this.live, this.hint);
        root.replaceChildren(this.screen);
        this.chrome = new TableChrome({
            session, screen: this.screen, bar: left, prefs: this.prefs, chatBox: options.chatBox, debug: options.debug,
            quitWarning: options.quitWarning, onQuit: options.onQuit, onBackChange: () => this.changeBack(), onTableChange: options.onTableChange,
        });
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
            resolution: Math.min(devicePixelRatio || 1, 2), background: '#0a0705',
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
        this.chrome.destroy();
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
        if (event.type === 'chat' && !event.history) this.showChat(event.message);
        if (event.type === 'notice') {
            if (event.notice.kind === 'error') {
                sfx.bad();
                buzz(this.prefs, 20);
            }
            this.chip(this.bottomId(), noticeText(event.notice), event.notice.kind === 'error' ? 0xff6b6b : GOLD);
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
        return s.viewerId === playerId ? t('vous') : s.players[playerId].name;
    }

    private order(s: GameView): number[] {
        const ids = s.players.map(p => p.id);
        const bottom = Math.max(0, ids.indexOf(this.bottomId()));
        return [...ids.slice(bottom), ...ids.slice(0, bottom)];
    }

    private dispatch(action: Action) {
        unlockAudio();
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
        this.hint.hidden = !L.cramped;
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
        this.chrome.placeEmotes(L.emote);
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
                view = new SeatView(p.id, p.color, p.id === s.viewerId && p.name !== 'Vous' && p.name !== t('Vous') ? t('{name} (vous)', {name: p.name}) : p.name, this.art);
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
                const created = sprite;
                created.on('pointerover', (e: FederatedPointerEvent) => {
                    if (e.pointerType === 'mouse' && !this.drag && created.cursor === 'pointer') created.hover(true);
                });
                created.on('pointerout', () => created.hover(false));
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
                const cw = cardWidth(seat, p.hand.length, L.cols);
                put(card, {
                    x: pos.x, y: pos.y - (picked ? cw * .25 : 0), rotation: jitter(card.id) * .06,
                    scale: cw / CW * (picked ? 1.08 : 1), z: 10 + index + (picked ? 50 : 0), up,
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
            if (this.mine(move.playerId)) buzz(this.prefs, [40, 30, 40]);
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
        // Your turn starts: a short vibration (not on a shared screen, where every turn is "yours")
        const turnStarts = s.viewerId !== null && myTurn && s.phase === 'draw';
        if (turnStarts && !this.myTurnBefore) buzz(this.prefs, 15);
        this.myTurnBefore = turnStarts;
        const stack = Math.min(this.deckStack.length, Math.ceil(s.deckRemaining / 8));
        this.deckStack.forEach((sprite, i) => sprite.visible = i < stack);
        this.deckCount.text = s.deckRemaining ? `${s.deckRemaining}` : t('vide');
        if (canDraw !== this.deckLit) {
            this.deckLit = canDraw;
            gsap.killTweensOf(this.deckGlow);
            // The draw pile breathes softly while it can be taken
            if (canDraw) gsap.timeline().to(this.deckGlow, {alpha: .85, duration: .35, ease: 'sine.out'})
                .to(this.deckGlow, {alpha: .45, duration: .9, ease: 'sine.inOut', yoyo: true, repeat: 3})
                .to(this.deckGlow, {alpha: .75, duration: .5, ease: 'sine.inOut'});
            else gsap.to(this.deckGlow, {alpha: 0, duration: .3, ease: 'sine.out'});
        }

        // Places of the hands: an empty place stays visible
        this.slots.clear();
        for (const p of s.players) {
            const seat = this.layout.seats.get(p.id)!;
            p.hand.forEach((_, index) => {
                const pos = slot(seat, index, p.hand.length, this.layout.cols);
                const w = cardWidth(seat, p.hand.length, this.layout.cols), h = w * RATIO;
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
            const peeking = !effect && s.phase === 'peek' && own && !s.players[place.player].ready && this.peeker(s) === place.player;
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
            if (!glow && !draggable) sprite.hover(false);
        }

        for (const p of s.players) {
            const running = s.phase === 'peek' ? !!effect : s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played';
            const badge = s.dutchCallerId === p.id ? 'DUTCH' : !p.connected ? t('HORS LIGNE') : p.locked ? t('BLOQUÉ') : null;
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
        const who = (id: number) => s.viewerId === null ? t('{name} : ', {name: s.players[id].name}) : t('À vous : ');
        const canThrow = s.viewerId !== null && s.players[s.viewerId].canThrow;
        if (s.phase === 'peek' && !effect) {
            const peeker = this.peeker(s);
            if (peeker !== null) return who(peeker) + t('regardez vos 2 cartes du bas et retenez-les !');
            return t('Les autres regardent leurs cartes…') + (canThrow ? t(' · une carte identique ? Glissez-la sur la défausse') : '');
        }
        if (s.phase === 'roundOver' || s.phase === 'gameOver') return t('Fin de la manche : on retourne les cartes');
        let text: string;
        if (effect) {
            const owner = s.players[effect.playerId];
            if (!this.mine(owner.id)) text = t('{name} utilise {card}…', {name: owner.name, card: effectCard(effect)});
            else if (effect.type === 'QUEEN') text = who(owner.id) + t('Dame : touchez une de vos cartes pour la regarder');
            else if (effect.type === 'JACK') text = this.jackPick ? t('Valet : touchez la 2ᵉ carte à échanger') : who(owner.id) + t('Valet : touchez deux cartes à échanger');
            else text = who(owner.id) + t('As : touchez un joueur, il reçoit une carte');
        } else if (myTurn && s.phase === 'draw') {
            text = s.isStuck ? t('Plus rien à piocher : passez votre tour') : who(cur.id) + t('piochez, ou prenez la défausse');
        } else if (myTurn && s.phase === 'drawn') {
            text = s.drawn?.source === 'pile'
                ? t('Touchez une de vos cartes pour l\'échanger, ou la défausse pour jeter celle-ci')
                : t('Touchez la carte de votre jeu à remplacer');
        } else if (myTurn && s.phase === 'played') {
            text = s.dutchCallerId === null ? t('Finissez votre tour… ou annoncez Dutch !') : t('Finissez votre tour');
        } else {
            text = t('Tour de {name}', {name: cur.name});
            if (canThrow) text += t(' · une carte identique ? Glissez-la sur la défausse');
        }
        if (s.isFinalRound) text = t('Dernier tour · {text}', {text});
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
        if (effect && this.mine(effect.playerId)) {
            list.push([t('Passer l\'effet'), 'ghost', () => this.dispatch({type: 'skipEffect', playerId: effect.playerId})]);
        } else if (peeker !== null && !effect) {
            list.push([s.viewerId === null ? t('{name} : regarder', {name: s.players[peeker].name}) : t('Regarder mes cartes'), 'primary',
                () => this.dispatch({type: 'peek', playerId: peeker})]);
        } else if (myTurn && !effect && s.phase === 'played') {
            list.push([t('Finir mon tour'), 'primary', () => this.dispatch({type: 'endTurn', playerId: cur, dutch: false})]);
            if (s.dutchCallerId === null) {
                list.push([this.dutchArmed ? t('Confirmer : Dutch !') : 'Dutch !', 'danger', () => {
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
            list.push([t('Passer'), 'primary', () => this.dispatch({type: 'endTurn', playerId: cur, dutch: false})]);
        }
        if (!(myTurn && s.phase === 'played')) this.dutchArmed = false;
        const L = this.layout;
        const key = list.map(b => b[0]).join('|');
        if (key === this.buttonsKey) return;
        this.buttonsKey = key;
        this.buttons.removeChildren().forEach(dispose);
        const views = list.map(([text, kind, onTap]) => button(text, kind, L.buttons.scale, onTap));
        const gap = 10 * L.buttons.scale;
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
        this.buttonsRect = views.length ? {
            x1: Math.min(...views.map(v => v.x - v.width / 2)) - 4, y1: Math.min(...views.map(v => v.y - v.height / 2)) - 4,
            x2: Math.max(...views.map(v => v.x + v.width / 2)) + 4, y2: Math.max(...views.map(v => v.y + v.height / 2)) + 4,
        } : null;
        views.forEach((v, i) => {
            this.buttons.addChild(v);
            gsap.from(v, {alpha: 0, y: v.y + 12, duration: .3, delay: i * .06, ease: 'back.out(2)'});
        });
        this.relocateChips();
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
        this.throwButton = button(t('Jeter sur la défausse'), 'primary', this.layout.ui * .85, () => {
            this.dispatch({type: 'throwCard', playerId: owner, cardId: id!});
        });
        const target = sprite.target!;
        const seat = this.layout.seats.get(owner)!;
        this.throwButton.position.set(
            clamp(target.x, 110, this.layout.w - 110),
            target.y - cardWidth(seat, s.players[owner].hand.length, this.layout.cols) * RATIO / 2 - 28 * this.layout.ui);
        this.uiLayer.addChild(this.throwButton);
        this.relocateChips();
        gsap.from(this.throwButton, {alpha: 0, y: this.throwButton.y + 10, duration: .2});
    }

    private updateInfo(s: GameView) {
        const text = t('Manche {round} · {target} pts', {round: s.round, target: s.targetScore});
        if (this.info.textContent !== text) this.info.textContent = text;
    }
    // endregion

    // region Messages and effects
    private chip(playerId: number | null, text: string, color: number, seconds = 2.8) {
        if (!this.app) return;
        const L = this.layout;
        const seat = playerId === null ? undefined : L.seats.get(playerId);
        // General messages go where the own messages go: between the piles and the buttons
        const pos = seat ? seat.chip : L.seats.get(this.bottomId())!.chip;
        const key = playerId ?? -1;
        const previous = this.chips.get(key);
        if (previous) {
            this.chipAnchors.delete(previous);
            dispose(previous);
        }
        const box = new Container();
        const t = label(text, 12.5 * L.ui, 0xffffff, '600');
        t.style.wordWrap = true;
        t.style.wordWrapWidth = Math.min(230 * L.ui, L.w - 40);
        t.style.align = 'center';
        t.anchor.set(.5);
        const w = t.width + 22, h = t.height + 12;
        box.addChild(new Graphics().roundRect(-w / 2, -h / 2, w, h, 10).fill({color: 0x0d0f14, alpha: .9}).stroke({width: 2, color}), t);
        this.fxLayer.addChild(box);
        this.chips.set(key, box);
        this.chipAnchors.set(box, pos);
        this.placeChip(box);
        gsap.from(box, {alpha: 0, y: box.y + 8, duration: .25, ease: 'back.out(2)'});
        gsap.to(box, {alpha: 0, duration: .4, delay: seconds, onComplete: () => {
            if (this.chips.get(key) === box) this.chips.delete(key);
            this.chipAnchors.delete(box);
            dispose(box);
        }});
    }

    /** Areas a message must not cover: turn buttons, « Jeter » button, piles, the other messages */
    private chipObstacles(except: Container): Rect[] {
        const list: Rect[] = this.layout.zones.filter(z => z.name !== 'banner').map(z => z.rect);
        if (this.buttonsRect) list.push(this.buttonsRect);
        const around = (c: Container): Rect => {
            const b = c.getBounds();
            return {x1: b.minX, y1: b.minY, x2: b.maxX, y2: b.maxY};
        };
        if (this.throwButton) list.push(around(this.throwButton));
        for (const other of this.chips.values()) if (other !== except && !other.destroyed) list.push(around(other));
        return list;
    }

    /**
     *  Put a message as close as possible to where it wants to be, without covering anything that can be touched
     */
    private placeChip(box: Container) {
        const L = this.layout;
        const anchor = this.chipAnchors.get(box);
        if (!anchor || box.destroyed) return;
        const w = box.width, h = box.height;
        const x = clamp(anchor.x, w / 2 + 8, L.w - w / 2 - 8);
        const minY = 48 + h / 2, maxY = L.h - h / 2 - 4;
        const obstacles = this.chipObstacles(box);
        const free = (y: number) => !obstacles.some(o => o.x1 < x + w / 2 && x - w / 2 < o.x2 && o.y1 < y + h / 2 && y - h / 2 < o.y2);
        let y = clamp(anchor.y, minY, maxY);
        if (!free(y)) {
            // Just above or just below an obstacle, the nearest free place
            const candidates = obstacles.flatMap(o => [o.y1 - h / 2 - 6, o.y2 + h / 2 + 6])
                .filter(c => c >= minY && c <= maxY && free(c))
                .sort((a, b) => Math.abs(a - y) - Math.abs(b - y));
            if (candidates.length) y = candidates[0];
        }
        gsap.to(box, {x, y, duration: box.x || box.y ? .2 : 0, ease: 'power2.out'});
    }

    /** Buttons appeared or moved: the messages make room */
    private relocateChips() {
        for (const box of this.chips.values()) this.placeChip(box);
    }

    private static readonly SKIP = /^(C'est au tour|Au tour|Dernier tour de|— Ronde|Chaque joueur|Fin de la ronde|Partie terminée)/;
    /** Said to screen readers only: the cards show it (everybody looks at his first cards at the same time) */
    private static readonly QUIET = /regarde ses 2 dernières cartes/;

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
            // Tested on the French template: the same whatever the language of this device
            const source = entry.msg?.t ?? entry.message;
            const text = logText(entry);
            if (TableView.SKIP.test(source) || entry.kind === 'dutch') continue;
            if (TableView.QUIET.test(source)) {
                this.live.textContent = text;
                continue;
            }
            const actor = s.players.find(p => text.startsWith(p.name)) ?? s.players.find(p => text.includes(p.name));
            // This device's own routine moves are not announced: the player just did them
            if (actor && s.viewerId === actor.id && entry.kind === 'info') continue;
            const color = actor ? parseInt(actor.color.slice(1), 16) : GOLD;
            this.chip(actor ? actor.id : null, text, color);
            this.live.textContent = text;
        }
    }

    /**
     *  A card lands well: a soft flash, a round wave of light, and specks that spiral out and fade
     */
    private sparks(at: Point) {
        const size = this.layout.pileW / CW;
        const flash = centered(new Sprite(this.art.spark));
        flash.position.set(at.x, at.y);
        flash.blendMode = 'add';
        flash.scale.set(size * 1.2);
        this.fxLayer.addChild(flash);
        gsap.timeline({onComplete: () => dispose(flash)})
            .to(flash.scale, {x: size * 5, y: size * 5, duration: .5, ease: 'sine.out'}, 0)
            .fromTo(flash, {alpha: .95}, {alpha: 0, duration: .55, ease: 'sine.in'}, 0);

        const wave = centered(new Sprite(this.art.ring));
        wave.position.set(at.x, at.y);
        wave.blendMode = 'add';
        wave.scale.set(size * .35);
        this.fxLayer.addChild(wave);
        gsap.timeline({onComplete: () => dispose(wave)})
            .to(wave.scale, {x: size * 1.7, y: size * 1.7, duration: .75, ease: 'power2.out'}, 0)
            .fromTo(wave, {alpha: .9}, {alpha: 0, duration: .75, ease: 'sine.in'}, 0);

        const count = 16;
        const turn = Math.random() < .5 ? 1 : -1;
        for (let i = 0; i < count; i++) {
            const s = centered(new Sprite(this.art.spark));
            s.blendMode = 'add';
            s.position.set(at.x, at.y);
            this.fxLayer.addChild(s);
            const start = (i / count) * Math.PI * 2 + Math.random() * .3;
            const reach = (55 + Math.random() * 45) * Math.max(.7, size * 1.4);
            const grow = .35 + Math.random() * .35;
            // Each speck follows a curve: it leaves straight, then bends the same way as the others
            const path = {p: 0};
            gsap.to(path, {
                p: 1, duration: .8 + Math.random() * .35, delay: Math.random() * .06, ease: 'power3.out',
                onUpdate: () => {
                    const a = start + turn * path.p * .9;
                    const d = reach * path.p;
                    s.position.set(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d);
                    s.scale.set(grow * (1 - path.p * .8));
                    s.alpha = 1 - path.p * path.p;
                },
                onComplete: () => dispose(s),
            });
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
        const small = label(me ? t('Vous annoncez la fin : dernier tour pour les autres') : t('{name} annonce la fin : dernier tour pour les autres', {name}), 15 * L.ui, 0xffffff, '800');
        small.anchor.set(.5, 0);
        small.y = big.height / 2;
        box.addChild(big, small);
        box.position.set(L.w / 2, L.h * .45);
        this.fxLayer.addChild(box);
        this.live.textContent = me ? t('Vous dites Dutch !') : t('{name} dit Dutch !', {name});
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
    /** Victory: paper confetti falling over the table */
    private confetti() {
        const L = this.layout;
        const colors = [0xffd166, 0xef476f, 0x06d6a0, 0x118ab2, 0xf6ead0, 0xc8323c];
        sfx.dutch();
        for (let i = 0; i < 90; i++) {
            const piece = new Graphics().rect(-4, -7, 8, 14).fill(colors[i % colors.length]);
            piece.position.set(Math.random() * L.w, -20 - Math.random() * L.h * .3);
            piece.rotation = Math.random() * Math.PI;
            this.fxLayer.addChild(piece);
            const fall = 2.2 + Math.random() * 1.6;
            gsap.to(piece, {y: L.h + 30, x: piece.x + (Math.random() - .5) * 160, rotation: piece.rotation + (Math.random() - .5) * 12,
                duration: fall, delay: Math.random() * .8, ease: 'power1.in', onComplete: () => dispose(piece)});
            gsap.to(piece.scale, {x: -1, duration: .25 + Math.random() * .3, repeat: Math.ceil(fall / .4), yoyo: true, ease: 'sine.inOut'});
        }
    }

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
        let title = t('Fin de la manche {round}', {round: result.round});
        if (result.gameOver) {
            const names = result.winners.map(id => id === s.viewerId ? t('vous') : s.players[id].name);
            title = result.winners.length === 1 && result.winners[0] === s.viewerId ? t('Vous gagnez !') : t('Victoire : {names}', {names: joinNames(names)});
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
            const name = label(`${r.playerId === s.viewerId ? t('{name} (vous)', {name: player.name}) : player.name}${r.playerId === result.dutchCallerId ? ' · Dutch' : ''}`, 15 * ui, won ? GOLD : CREAM, '800');
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
            const next = button(result.gameOver ? t('Nouvelle partie') : t('Manche suivante'), 'primary', ui, () => {
                if (result.gameOver) this.options.onNewGame();
                else this.dispatch({type: 'nextRound', playerId: s.viewerId ?? 0});
            });
            next.y = bottom;
            box.addChild(next);
        } else {
            const wait = label(result.gameOver ? t('En attente d\'une nouvelle partie…') : t('En attente de {name} pour la suite…', {name: s.players[0].name}), 14 * ui, 0xd9c9a3, '600');
            wait.anchor.set(.5);
            wait.y = bottom;
            box.addChild(wait);
        }
        p.addChild(dim, box);
        this.fxLayer.addChild(p);
        this.panel = p;
        this.live.textContent = `${title}. ${result.scores.map(r => `${s.players[r.playerId].name} ${r.total}`).join(', ')}`;
        if (!instant && result.gameOver && (s.viewerId === null || result.winners.includes(s.viewerId))) this.confetti();
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
            drag.sprite.pickUp();
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

    // region Chat
    /** A message on the table: emotes pop above the player, text lines in a bubble next to him */
    private showChat(message: ChatMessage) {
        const s = this.state;
        if (!this.app || !s || !this.layout) return;
        this.chrome.countUnread(message);
        const seat = this.layout.seats.get(message.seat);
        if (!seat || !s.players[message.seat]) return;
        if (message.text) {
            this.chip(message.seat, `« ${message.text} »`, parseInt(message.color.slice(1), 16), 4);
            this.live.textContent = t('{name} : {text}', {name: message.name, text: message.text});
            return;
        }
        if (!message.emote) return;
        sfx.tap();
        const ui = this.layout.ui;
        const bubble = new Container();
        const size = 34 * ui;
        bubble.addChild(new Graphics().circle(0, 0, size * .78).fill({color: 0xffffff, alpha: .95}).stroke({width: 3, color: parseInt(message.color.slice(1), 16)}),
            Object.assign(new Text({text: message.emote, style: {fontSize: size, fontFamily: EMOJI}}), {anchor: {x: .5, y: .5}}));
        // Own reactions fly out of the reactions button; the others' pop above their token
        const from = message.seat === s.viewerId && this.layout.emote
            ? {x: this.layout.emote.x, y: this.layout.emote.y - this.layout.emote.r}
            : {x: seat.avatar.x + seat.avatar.r * .6, y: seat.avatar.y - seat.avatar.r};
        const at = {x: clamp(from.x, size, this.layout.w - size), y: Math.max(size, from.y - size * .6)};
        bubble.position.set(at.x, at.y);
        this.fxLayer.addChild(bubble);
        this.live.textContent = t('{name} : {text}', {name: message.name, text: message.emote});
        gsap.timeline({onComplete: () => dispose(bubble)})
            .from(bubble.scale, {x: 0, y: 0, duration: .35, ease: 'back.out(2.5)'})
            .to(bubble, {y: at.y - 26 * ui, duration: 1.6, ease: 'sine.out'}, '+=.3')
            .to(bubble, {alpha: 0, duration: .4}, '-=.4');
    }
    // endregion

    // region Card back
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

export type {PlayerView};
