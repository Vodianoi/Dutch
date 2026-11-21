import { Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { gsap } from 'gsap';
import { joinNames, t } from '../i18n.js';
import { effectCard, isProtected, logText, noticeText } from '../View.js';
import { EMOJI } from '../table/cardArt.js';
import { TableChrome } from '../table/chrome.js';
import { jitter } from '../table/layout.js';
import { buzz, loadPrefs } from '../table/prefs.js';
import { sfx, unlockAudio } from '../table/sound.js';
import { theme, themeId } from '../table/themes.js';
import { Card3D, CardSkins, DrawPile, FLAT } from './Card3D.js';
import { Hud } from './Hud.js';
import { CARD_H, CARD_T, CARD_W, GAP, makePlan, pickRig, slotOf } from './rig.js';
import { Stage } from './Stage.js';
/**
 *  The game screen in 3D (Three.js): a real card table in a room, in two versions (see rig.ts):
 *  the seated view for screens held upright, the oval table for wide screens.
 *  Driven by a Session like the flat table (table/TableView.ts), so it works for every mode:
 *  solo against bots, online (host or player) and one shared screen.
 */
const REVEAL_MS = 3000;
/** End of a round: the cards are turned over, the scores come after this time (s) */
const SCORES_DELAY_S = 3.2;
/** After a long time in the background, the page comes back with a new table */
const REBUILD_AFTER_MS = 60000;
/** Fonts of each theme already asked for */
const fontsReady = new Map();
/** The fonts the cards and the tokens are drawn with: those of the theme of this device */
function loadFonts() {
    const { display, body, cards } = theme();
    let ready = fontsReady.get(themeId());
    if (!ready) {
        ready = Promise.all([
            document.fonts.load(`${cards.rank.weight} 40px ${cards.rank.family}`),
            document.fonts.load(`800 40px ${display}`),
            document.fonts.load(`700 16px ${body}`),
            document.fonts.load(`32px ${EMOJI}`, '😀👍😂😮😬😡🎉🤔😎🙏🔥'),
        ]).catch(() => undefined);
        fontsReady.set(themeId(), ready);
    }
    return ready;
}
/** Stylesheet of the 3D table, only loaded by the devices that use it */
function loadStyles() {
    if (document.getElementById('scene3d-styles'))
        return;
    const link = document.createElement('link');
    link.id = 'scene3d-styles';
    link.rel = 'stylesheet';
    link.href = new URL('../../css/scene3d.css', import.meta.url).href;
    document.head.append(link);
}
export class Table3D {
    constructor(root, session, options) {
        this.session = session;
        this.options = options;
        this.skins = null;
        this.pile = null;
        this.prefs = loadPrefs();
        this.destroyed = false;
        this.drawingLost = false;
        this.hiddenAt = null;
        this.rebuilding = false;
        // State shown
        this.plan = null;
        this.planKey = '';
        this.marksKey = '';
        this.cards = new Map();
        /** Cards shown to this device for a moment: id -> face */
        this.revealed = new Map();
        /** Discard pile as seen from here (the view only gives its top card) */
        this.discards = [];
        this.shownRound = -1;
        this.dealing = false;
        this.lastLog = null;
        this.logLength = 0;
        this.moveSeq = 0;
        this.jackPick = null;
        this.throwPick = null;
        this.dutchArmed = false;
        this.dutchTimer = 0;
        this.scoresFor = '';
        /** The players put the scores aside to look at the cards of the round */
        this.lookingAtTable = false;
        this.drag = null;
        this.hovered = null;
        this.pressed = null;
        this.syncQueued = false;
        this.myTurnBefore = false;
        /**
         *  Phones take the graphics memory of a page left in the background. When the drawing is lost,
         *  or the page comes back after a long time, the table is made again.
         */
        this.onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                this.hiddenAt = Date.now();
                return;
            }
            const away = this.hiddenAt === null ? 0 : Date.now() - this.hiddenAt;
            this.hiddenAt = null;
            if (this.drawingLost || this.stage.renderer.getContext().isContextLost() || away > REBUILD_AFTER_MS)
                this.rebuild();
            else
                this.stage.invalidate();
        };
        const rig = new URLSearchParams(location.search).get('rig');
        this.forcedRig = rig === 'mobile' || rig === 'desktop' ? rig : null;
        this.host = document.createElement('div');
        this.host.className = 'table-canvas';
        // Before anything is shown: without WebGL this throws, and the app falls back to the flat table
        const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700;
        this.stage = new Stage(this.host, !phone);
        loadStyles();
        document.body.classList.add('in-game', 'scene3d-on');
        this.screen = document.createElement('div');
        this.screen.className = 'table-screen scene3d';
        this.bar = document.createElement('div');
        this.bar.className = 'table-bar';
        this.info = document.createElement('span');
        this.info.className = 'table-info';
        const left = document.createElement('div');
        left.className = 'table-bar-group';
        this.bar.append(left, this.info);
        this.live = document.createElement('div');
        this.live.className = 'sr-only';
        this.live.setAttribute('aria-live', 'polite');
        const shade = document.createElement('div');
        shade.className = 's3-vignette';
        this.hint = document.createElement('p');
        this.hint.className = 'table-hint';
        this.hint.hidden = true;
        this.hint.textContent = t('Tenez le téléphone droit pour mieux voir la table');
        this.screen.append(this.host, shade, this.bar, this.live, this.hint);
        root.replaceChildren(this.screen);
        this.hud = new Hud(this.screen, id => this.tapSeat(id));
        this.chrome = new TableChrome({
            session, screen: this.screen, bar: left, prefs: this.prefs, chatBox: options.chatBox, debug: options.debug,
            quitWarning: options.quitWarning, onQuit: options.onQuit, onBackChange: () => this.changeBack(), onFeltChange: () => this.relayout(true),
            onTableChange: options.onTableChange,
            // Another theme: the same game on a new table, drawn with it
            onThemeChange: options.onRebuild,
        });
        this.discardPad = new Mesh(new PlaneGeometry(CARD_W * 1.3, CARD_H * 1.25), new MeshBasicMaterial());
        this.discardPad.rotation.x = -Math.PI / 2;
        this.discardPad.visible = false;
        this.discardPad.userData.discard = true;
        this.stage.cards.add(this.discardPad);
        this.unsubscribe = session.on(event => this.onSessionEvent(event));
        this.observer = new ResizeObserver(() => {
            if (this.stage.resize())
                this.relayout();
        });
        this.overlays = new MutationObserver(() => {
            const covered = !!document.querySelector('body > .overlay');
            this.stage.cover(covered);
            this.skins?.hold(covered);
        });
        this.overlays.observe(document.body, { childList: true });
        this.listen();
        void this.init();
        // Automated checks find the cards on the screen through this
        if (options.debug)
            window.table = this;
    }
    // region Lifecycle
    async init() {
        await loadFonts();
        if (this.destroyed)
            return;
        this.skins = new CardSkins(this.prefs.back, this.stage.renderer.capabilities.getMaxAnisotropy(), this.stage.fine, this.stage.repaint);
        this.pile = new DrawPile(this.skins, this.stage.invalidate);
        this.stage.cards.add(this.pile.root);
        this.stage.resize();
        this.observer.observe(this.host);
        this.relayout();
    }
    render() {
        this.requestSync();
    }
    destroy() {
        this.destroyed = true;
        document.removeEventListener('visibilitychange', this.onVisibility);
        this.observer.disconnect();
        this.overlays.disconnect();
        this.unsubscribe();
        this.revealed.forEach(r => clearTimeout(r.timer));
        clearTimeout(this.dutchTimer);
        this.chrome.destroy();
        this.hud.destroy();
        document.body.classList.remove('in-game', 'scene3d-on');
        for (const card of this.cards.values())
            card.dispose();
        this.cards.clear();
        if (this.pile)
            gsap.killTweensOf(this.pile.root.rotation);
        this.skins?.dispose();
        this.discardPad.geometry.dispose();
        this.stage.dispose();
        this.screen.remove();
    }
    rebuild() {
        if (this.destroyed || this.rebuilding)
            return;
        this.rebuilding = true;
        if (this.options.onRebuild)
            this.options.onRebuild();
        else
            this.rebuilding = false;
    }
    onSessionEvent(event) {
        if (event.type === 'state')
            this.requestSync();
        if (event.type === 'reveal') {
            const id = event.card.id;
            const previous = this.revealed.get(id);
            if (previous)
                clearTimeout(previous.timer);
            this.revealed.set(id, { view: event.card, timer: window.setTimeout(() => {
                    this.revealed.delete(id);
                    this.requestSync();
                }, REVEAL_MS) });
            this.requestSync();
        }
        if (event.type === 'chat' && !event.history)
            this.showChat(event.message);
        if (event.type === 'notice') {
            if (event.notice.kind === 'error') {
                sfx.bad();
                buzz(this.prefs, 20);
            }
            this.hud.chip(-1, noticeText(event.notice), event.notice.kind === 'error' ? theme().ui.alert : theme().ui.accent, null);
        }
    }
    requestSync() {
        if (this.syncQueued)
            return;
        this.syncQueued = true;
        queueMicrotask(() => {
            this.syncQueued = false;
            if (!this.destroyed && this.skins)
                this.sync();
        });
    }
    // endregion
    // region Helpers about the state
    get state() {
        return this.session.state;
    }
    /** Player at the bottom of the screen: this device's player, the first one on a shared screen */
    bottomId() {
        return this.state?.viewerId ?? 0;
    }
    /** This device plays for this player (every player on a shared screen) */
    mine(playerId) {
        const viewer = this.state?.viewerId;
        return viewer === null || viewer === undefined || viewer === playerId;
    }
    order(s) {
        const ids = s.players.map(p => p.id);
        const bottom = Math.max(0, ids.indexOf(this.bottomId()));
        return [...ids.slice(bottom), ...ids.slice(0, bottom)];
    }
    dispatch(action) {
        unlockAudio();
        this.throwPick = null;
        this.session.dispatch(action);
    }
    /** Who looks at his cards now (peek variant): this device's player, or on a shared screen the next one */
    peeker(s) {
        if (s.phase !== 'peek')
            return null;
        if (s.viewerId !== null)
            return s.players[s.viewerId].ready ? null : s.viewerId;
        return s.players.find(p => !p.ready)?.id ?? null;
    }
    // endregion
    // region Layout
    /**
     *  The table for this screen and these players: built again when the version (upright / wide), the players
     *  or the look change, then the camera is placed and everything written over the table goes to its place
     */
    relayout(remake = false) {
        const s = this.state;
        if (!s || !this.skins || this.destroyed)
            return;
        const stage = this.stage;
        const rig = this.forcedRig ?? pickRig(stage.width, stage.height);
        const key = `${rig}|${s.settings.cardsPerPlayer}|${this.order(s).join(',')}|${s.players.map(p => `${p.name}:${p.color}`).join(',')}|${this.prefs.felt}`;
        if (key !== this.planKey || remake || !this.plan) {
            this.planKey = key;
            this.plan = makePlan(rig, this.order(s), s.settings.cardsPerPlayer);
            stage.build(this.plan, s.players.map(p => ({ id: p.id, color: p.color, initial: (p.name.trim()[0] ?? '?').toUpperCase() })), this.prefs.felt);
            this.hud.setSeats(s.players.map(p => ({
                id: p.id, color: p.color,
                name: p.id === s.viewerId && p.name !== 'Vous' && p.name !== t('Vous') ? t('{name} (vous)', { name: p.name }) : p.name,
            })));
            this.marksKey = '';
        }
        const plan = this.plan;
        const mobile = plan.rig === 'mobile';
        this.hint.hidden = mobile || stage.height > 460 || !matchMedia('(pointer: coarse)').matches;
        const top = this.bar.getBoundingClientRect().bottom - this.host.getBoundingClientRect().top;
        this.hud.resize(stage.width, stage.height, top, stage.width < 560);
        // The camera leaves room for the top bar and the instructions, and for the name plates of the far players
        stage.frame({ top: top + (mobile ? 78 : 64), bottom: mobile ? 16 : 22, side: mobile ? 4 : 28 });
        const center = stage.toScreen(0, 0, 0);
        for (const seat of plan.seats.values()) {
            const at = stage.toScreen(seat.token.x, .015, seat.token.z);
            const hand = stage.toScreen(seat.x, 0, seat.z);
            let dx = at.x - hand.x, dy = at.y - hand.y;
            if (seat.own) {
                // This device's player: his plate sits beside his token, at the bottom of the screen
                dx = 1;
                dy = 0;
            }
            else if (Math.hypot(dx, dy) < 1) {
                dx = at.x - center.x;
                dy = at.y - center.y;
            }
            const length = Math.hypot(dx, dy) || 1;
            const radius = stage.cardWidthAt(seat.token.x, .015, seat.token.z) * .0185 / CARD_W;
            // Along the sides of a narrow screen there is only the rim to write on
            const narrow = mobile && Math.abs(Math.sin(seat.yaw)) > .7;
            this.hud.placeTag(seat.id, at, { x: dx / length, y: dy / length }, radius, narrow);
        }
        this.hud.settleTags();
        this.discardPad.position.set(plan.discard.x, .0006, plan.discard.z);
        this.pile.root.position.set(plan.deck.x, 0, plan.deck.z);
        // Reactions: under the thumb on phones, in the top bar elsewhere
        this.chrome.placeEmotes(mobile ? { x: 32, y: stage.height - 34, r: 22 } : null);
        this.throwPick = null;
        this.sync(true);
    }
    seatOf(playerId) {
        return this.plan.seats.get(playerId);
    }
    /** A point above the cards of a player, on the screen */
    overHand(playerId) {
        const seat = this.seatOf(playerId);
        return this.stage.toScreen(seat.x, .03, seat.z);
    }
    // endregion
    // region Sync: every card where the state says it is
    sync(instant = false) {
        const s = this.state;
        const skins = this.skins, pile = this.pile;
        if (!s || !skins || !pile || this.destroyed)
            return;
        if (!this.plan || this.plan.seats.size !== s.players.length || !this.planKey.includes(`|${this.order(s).join(',')}|`)) {
            this.relayout();
            return;
        }
        const plan = this.plan;
        const stage = this.stage;
        const newRound = s.round !== this.shownRound;
        if (newRound)
            this.startRound(s);
        const roundOver = s.phase === 'roundOver' || s.phase === 'gameOver';
        const roundFaces = new Map();
        if (roundOver && s.lastResult)
            s.lastResult.scores.forEach(r => r.hand.forEach(c => roundFaces.set(c.id, c)));
        if (s.activeEffect?.type !== 'JACK')
            this.jackPick = null;
        pile.set(s.deckRemaining);
        const seen = new Set();
        const n = s.players.length;
        const dealDelay = (seatIndex, index) => this.dealing ? .55 + (index * n + seatIndex) * .08 : 0;
        const lastDeal = dealDelay(n - 1, s.settings.cardsPerPlayer - 1);
        const order = this.order(s);
        const fromDeck = () => ({ x: plan.deck.x, y: pile.top + CARD_T, z: plan.deck.z, yaw: 0, tilt: 0, flip: 1, scale: 1 });
        const put = (view, pose, place, detail, delay = 0) => {
            seen.add(view.id);
            let card = this.cards.get(view.id);
            const face = view.value ? view : this.revealed.get(view.id)?.view ?? roundFaces.get(view.id);
            if (!card) {
                card = new Card3D(face ?? view, skins, stage.invalidate);
                card.jump(fromDeck());
                stage.cards.add(card.root);
                this.cards.set(view.id, card);
            }
            else if (face) {
                card.learn(face);
            }
            card.setDetail(detail);
            card.place = place;
            if (this.drag?.card === card && this.drag.moved)
                return;
            if (instant)
                card.jump(pose);
            else
                card.moveTo(pose, delay);
        };
        // Hands
        const mobile = plan.rig === 'mobile';
        for (const p of s.players) {
            const seat = this.seatOf(p.id);
            const seatIndex = order.indexOf(p.id);
            p.hand.forEach((card, index) => {
                if (!card)
                    return;
                const slot = slotOf(seat, index, p.hand.length, plan.cols);
                const delay = dealDelay(seatIndex, index);
                const place = { zone: 'hand', player: p.id, index };
                if (this.revealed.has(card.id)) {
                    // Shown to this device: lifted off the table and held up to be read. Two cards side by side
                    // (the first look at the hand) move apart to make room for each other.
                    const natural = stage.cardWidthAt(slot.x, 0, slot.z);
                    const wanted = Math.max(mobile ? 100 : 132, natural * 1.3);
                    const apart = Math.max(1, (wanted + 8) / (natural * (CARD_W + GAP) / CARD_W));
                    const across = (slot.x - seat.x) * Math.cos(seat.yaw) - (slot.z - seat.z) * Math.sin(seat.yaw);
                    const x = slot.x + across * (apart - 1) * Math.cos(seat.yaw), z = slot.z - across * (apart - 1) * Math.sin(seat.yaw);
                    put(card, { ...stage.heldUp(x, z, .06, wanted), flip: 0 }, place, 'full', delay);
                    return;
                }
                const up = !!card.value || (roundOver && roundFaces.has(card.id));
                const picked = this.throwPick === card.id;
                // Turned over at the end of the round: the faces read the right way up from this device's seat
                const yaw = seat.yaw + (up && Math.cos(seat.yaw) < -.01 ? Math.PI : 0) + jitter(card.id) * .05;
                put(card, {
                    x: slot.x + jitter(card.id, 1) * .0016, y: FLAT + slot.layer * CARD_T * 1.4 + (picked ? .02 : 0),
                    z: slot.z + jitter(card.id, 2) * .0016, yaw, tilt: picked ? .3 : 0, flip: up ? 0 : 1, scale: 1,
                }, place, 'compact', roundOver && !this.dealing ? .15 * seatIndex + index * .08 : delay);
            });
        }
        // Drawn card: held up next to the piles by this device's player, above his cards by another player
        if (s.drawn) {
            const cur = s.currentPlayerIndex;
            const seat = this.seatOf(cur);
            if (s.drawn.card.value) {
                const x = plan.discard.x + CARD_W * 1.42, z = plan.discard.z;
                const wanted = Math.max(mobile ? 92 : 124, stage.cardWidthAt(x, 0, z) * 1.25);
                put(s.drawn.card, { ...stage.heldUp(x, z, .055, wanted, 1.8), flip: 0 }, { zone: 'held' }, 'full');
            }
            else {
                put(s.drawn.card, {
                    x: seat.x - seat.out.x * .03, y: CARD_H * .62, z: seat.z - seat.out.z * .03, yaw: seat.yaw, tilt: 1.2, flip: 0, scale: 1,
                }, { zone: 'held' }, 'compact');
            }
        }
        // Discard pile: the last cards, the top one on top
        this.trackDiscards(s);
        const visible = this.discards.slice(-6).filter(c => !seen.has(c.id));
        visible.forEach((card, k) => {
            put(card, {
                x: plan.discard.x + jitter(card.id, 1) * .007, y: FLAT + k * CARD_T * 1.15, z: plan.discard.z + jitter(card.id, 2) * .007,
                yaw: jitter(card.id, 3) * .3, tilt: 0, flip: 0, scale: 1,
            }, { zone: 'discard', top: k === visible.length - 1 }, 'compact', this.dealing ? lastDeal + .3 : 0);
            this.cards.get(card.id).shadeStrength = k === 0 ? 1 : .2;
        });
        for (const [id, card] of this.cards) {
            if (seen.has(id))
                continue;
            this.cards.delete(id);
            card.live = false;
            card.setGlow(0);
            if (card.place?.zone === 'discard') {
                // Covered by the cards thrown after it
                gsap.delayedCall(.7, () => card.dispose());
            }
            else {
                // Shuffled back into the draw pile
                card.moveTo(fromDeck());
                gsap.delayedCall(.9, () => card.dispose());
            }
        }
        this.dealing = false;
        this.updateMarks(s);
        this.trackMove(s);
        this.updateTable(s);
        this.readLog(s);
        this.updateInfo(s);
        if (roundOver && s.lastResult) {
            const key = `${s.round}-${s.phase}`;
            if (this.scoresFor !== key) {
                this.scoresFor = key;
                this.lookingAtTable = false;
                // Time to see the cards turned over before the scores cover the table
                gsap.delayedCall(newRound || instant ? 0 : SCORES_DELAY_S, () => {
                    if (this.scoresFor === key && !this.lookingAtTable && !this.destroyed)
                        this.showScores();
                });
            }
            else if (instant && this.hud.scoresShown) {
                this.showScores(true);
            }
        }
        else if (this.scoresFor) {
            this.scoresFor = '';
            this.lookingAtTable = false;
            this.hud.hideScores();
        }
        stage.invalidate();
    }
    startRound(s) {
        const plan = this.plan;
        // The cards of the previous round go back on the draw pile
        for (const card of this.cards.values()) {
            card.live = false;
            card.setGlow(0);
            card.moveTo({ x: plan.deck.x, y: FLAT + CARD_T * 4, z: plan.deck.z, yaw: 0, tilt: 0, flip: 1, scale: 1 }, Math.random() * .2);
            gsap.delayedCall(1.1, () => card.dispose());
        }
        this.cards.clear();
        this.discards = [];
        this.jackPick = null;
        this.throwPick = null;
        // Dealt one by one when a round starts in front of us, not when a game in progress is opened
        this.dealing = this.shownRound !== -1 || (s.phase === 'peek' || s.log.length < 4);
        this.shownRound = s.round;
        this.scoresFor = '';
        this.lookingAtTable = false;
        this.hud.hideScores();
    }
    trackDiscards(s) {
        const top = s.topDiscard;
        if (!top) {
            this.discards = [];
            return;
        }
        const at = this.discards.findIndex(c => c.id === top.id);
        if (at >= 0)
            this.discards = this.discards.slice(0, at + 1);
        else
            this.discards.push(top);
        if (this.discards.length > 8)
            this.discards = this.discards.slice(-8);
    }
    /** Places of the cards, printed on the cloth: an empty place stays visible */
    updateMarks(s) {
        const plan = this.plan;
        const key = s.players.map(p => p.hand.length).join(',');
        if (key === this.marksKey)
            return;
        this.marksKey = key;
        const marks = [{ x: plan.discard.x, z: plan.discard.z, yaw: 0 }];
        for (const p of s.players) {
            const seat = this.seatOf(p.id);
            // Overlapping rows (penalty cards) would only draw a blur of lines
            if (p.hand.length > plan.cols * 2)
                continue;
            p.hand.forEach((_, index) => {
                const slot = slotOf(seat, index, p.hand.length, plan.cols);
                marks.push({ x: slot.x, z: slot.z, yaw: seat.yaw });
            });
        }
        this.stage.marks(marks);
    }
    /** Effects of the last move: sparks, shakes, a player looking at his cards */
    trackMove(s) {
        const move = s.lastMove;
        if (!move || move.seq === this.moveSeq)
            return;
        const first = this.moveSeq === 0;
        this.moveSeq = move.seq;
        if (first)
            return;
        if (move.type === 'throw') {
            gsap.delayedCall(.35, () => {
                if (!this.destroyed && this.plan)
                    this.stage.burst(this.plan.discard.x, this.plan.discard.z);
            });
            sfx.good();
        }
        if (move.type === 'wrongThrow') {
            sfx.bad();
            if (this.mine(move.playerId))
                buzz(this.prefs, [40, 30, 40]);
            this.cards.get(move.cardIds[0])?.shake(true);
        }
        if ((move.type === 'peek' || move.type === 'queenPeek') && !this.mine(move.playerId)) {
            move.cardIds.forEach(id => this.cards.get(id)?.peekGesture());
        }
        if (move.type === 'dutch')
            this.dutchCall(s.players[move.playerId].name, move.playerId === s.viewerId);
    }
    // endregion
    // region Table, instructions, buttons
    updateTable(s) {
        const effect = s.activeEffect;
        const cur = s.currentPlayerIndex;
        const running = s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played';
        const myTurn = running && this.mine(cur);
        const myEffect = effect && this.mine(effect.playerId) ? effect.type : null;
        const canDraw = myTurn && s.phase === 'draw' && !effect && !s.isStuck;
        // Your turn starts: a short vibration (not on a shared screen, where every turn is "yours")
        const turnStarts = s.viewerId !== null && myTurn && s.phase === 'draw';
        if (turnStarts && !this.myTurnBefore)
            buzz(this.prefs, 15);
        this.myTurnBefore = turnStarts;
        this.pile.light(canDraw);
        const plan = this.plan;
        // How many cards are left: written just beyond the draw pile
        this.hud.count(s.deckRemaining ? `${s.deckRemaining}` : t('vide'), this.stage.toScreen(plan.deck.x, this.pile.top, plan.deck.z - CARD_H * .5 - .004));
        let breathing = canDraw;
        for (const card of this.cards.values()) {
            const place = card.place;
            if (!place)
                continue;
            let glow = 0;
            const inHand = place.zone === 'hand';
            const own = inHand && this.mine(place.player);
            const peeking = !effect && s.phase === 'peek' && own && !s.players[place.player].ready && this.peeker(s) === place.player;
            if (peeking)
                glow = 1;
            else if (myEffect === 'QUEEN' && inHand && (place.player === effect.playerId || s.settings.queenAny))
                glow = 1;
            else if (myEffect === 'JACK' && inHand && (place.player === effect.playerId || !isProtected(s, place.player, 'JACK'))) {
                glow = this.jackPick === card.view.id ? 2 : 1;
            }
            else if (myEffect === 'ACE' && inHand && !isProtected(s, place.player, 'ACE'))
                glow = 1;
            else if (myTurn && !effect && s.phase === 'draw' && place.zone === 'discard' && place.top)
                glow = 1;
            else if (myTurn && !effect && s.phase === 'drawn') {
                if (inHand && place.player === cur)
                    glow = 1;
                if (place.zone === 'discard' && place.top && s.drawn?.source === 'pile')
                    glow = 1;
            }
            else if (this.throwPick === card.view.id)
                glow = 2;
            // A card held up to the eye needs no light around it
            if (this.revealed.has(card.view.id))
                glow = 0;
            card.setGlow(glow);
            if (glow === 1)
                breathing = true;
            const draggable = (own && s.players[place.player].canThrow) || (place.zone === 'held' && myTurn);
            card.live = glow > 0 || draggable;
            if (!card.live)
                card.hover(false);
        }
        this.skins.breathe(breathing);
        const lit = running || (s.phase === 'peek' && !!effect);
        for (const p of s.players) {
            const badge = s.dutchCallerId === p.id ? 'DUTCH' : !p.connected ? t('HORS LIGNE') : p.locked ? t('BLOQUÉ') : null;
            this.hud.updateTag(p.id, {
                score: p.score,
                active: lit && (effect ? effect.playerId === p.id : cur === p.id),
                badge,
                choosable: myEffect === 'ACE' && s.dutchCallerId !== p.id,
                connected: p.connected,
            });
        }
        const active = lit ? (effect ? effect.playerId : cur) : null;
        this.stage.light(active === null ? null : this.seatOf(active));
        this.updateBanner(s);
        this.updateButtons(s);
        this.updateThrowButton(s);
    }
    instruction(s) {
        const effect = s.activeEffect;
        const cur = s.players[s.currentPlayerIndex];
        const myTurn = this.mine(cur.id);
        const who = (id) => s.viewerId === null ? t('{name} : ', { name: s.players[id].name }) : t('À vous : ');
        const canThrow = s.viewerId !== null && s.players[s.viewerId].canThrow;
        if (s.phase === 'peek' && !effect) {
            const peeker = this.peeker(s);
            if (peeker !== null)
                return who(peeker) + t('regardez vos 2 cartes du bas et retenez-les !');
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
                text = who(owner.id) + (s.settings.queenAny ? t('Dame : touchez une carte pour la regarder') : t('Dame : touchez une de vos cartes pour la regarder'));
            else if (effect.type === 'JACK')
                text = this.jackPick ? t('Valet : touchez la 2ᵉ carte à échanger') : who(owner.id) + t('Valet : touchez deux cartes à échanger');
            else
                text = who(owner.id) + t('As : touchez un joueur, il reçoit une carte');
        }
        else if (myTurn && s.phase === 'draw') {
            text = s.isStuck ? t('Plus rien à piocher : passez votre tour') : who(cur.id) + t('piochez, ou prenez la défausse');
        }
        else if (myTurn && s.phase === 'drawn') {
            text = s.drawn?.source === 'pile'
                ? t('Touchez une de vos cartes pour l\'échanger, ou la défausse pour jeter celle-ci')
                : t('Touchez la carte de votre jeu à remplacer');
        }
        else if (myTurn && s.phase === 'played') {
            text = s.dutchCallerId === null ? t('Finissez votre tour… ou annoncez Dutch !') : t('Finissez votre tour');
        }
        else {
            text = t('Tour de {name}', { name: cur.name });
            if (canThrow)
                text += t(' · une carte identique ? Glissez-la sur la défausse');
        }
        if (s.isFinalRound)
            text = t('Dernier tour · {text}', { text });
        return text;
    }
    updateBanner(s) {
        this.hud.banner(this.instruction(s));
    }
    updateButtons(s) {
        const effect = s.activeEffect;
        const cur = s.currentPlayerIndex;
        const running = s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played';
        const myTurn = running && this.mine(cur);
        const list = [];
        const peeker = this.peeker(s);
        if (effect && this.mine(effect.playerId)) {
            list.push({ label: t('Passer l\'effet'), kind: 'ghost', onTap: () => this.dispatch({ type: 'skipEffect', playerId: effect.playerId }) });
        }
        else if (peeker !== null && !effect) {
            list.push({
                label: s.viewerId === null ? t('{name} : regarder', { name: s.players[peeker].name }) : t('Regarder mes cartes'), kind: 'key',
                onTap: () => this.dispatch({ type: 'peek', playerId: peeker }),
            });
        }
        else if (myTurn && !effect && s.phase === 'played') {
            list.push({ label: t('Finir mon tour'), kind: 'key', onTap: () => this.dispatch({ type: 'endTurn', playerId: cur, dutch: false }) });
            if (s.dutchCallerId === null) {
                list.push({ label: this.dutchArmed ? t('Confirmer : Dutch !') : 'Dutch !', kind: 'call', onTap: () => {
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
                        this.dispatch({ type: 'endTurn', playerId: cur, dutch: true });
                    } });
            }
        }
        else if (myTurn && !effect && s.phase === 'draw' && s.isStuck) {
            list.push({ label: t('Passer'), kind: 'key', onTap: () => this.dispatch({ type: 'endTurn', playerId: cur, dutch: false }) });
        }
        if (!(myTurn && s.phase === 'played'))
            this.dutchArmed = false;
        const plan = this.plan;
        this.hud.buttons(list, this.stage.toScreen(plan.buttons.x, .01, plan.buttons.z));
    }
    /** A card chosen to be thrown: a « Jeter » button above it */
    updateThrowButton(s) {
        const id = this.throwPick;
        const card = id ? this.cards.get(id) : undefined;
        const place = card?.place;
        if (!id || !card || place?.zone !== 'hand' || !s.players[place.player].canThrow || !this.mine(place.player) || !card.target) {
            this.throwPick = null;
            this.hud.throwButton('', null);
            return;
        }
        const owner = place.player;
        const plan = this.plan;
        const top = this.stage.toScreen(card.target.x, card.target.y + .02, card.target.z - CARD_H * .5);
        // Above the card, but never over the piles: the discard pile is what the player is looking at
        const piles = this.stage.toScreen(plan.buttons.x, .01, plan.buttons.z);
        const y = owner === this.bottomId() ? Math.max(top.y - 8, piles.y + 20) : top.y - 8;
        this.hud.throwButton(t('Jeter sur la défausse'), { x: top.x, y }, () => this.dispatch({ type: 'throwCard', playerId: owner, cardId: id }));
    }
    updateInfo(s) {
        const text = t('Manche {round} · {target} pts', { round: s.round, target: s.targetScore });
        if (this.info.textContent !== text)
            this.info.textContent = text;
    }
    /** New lines of the game log, shown next to the player concerned */
    readLog(s) {
        const log = s.log;
        let fresh;
        if (!this.lastLog) {
            fresh = [];
        }
        else {
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
        this.lastLog = end ? { round: end.round, message: end.message } : null;
        for (const entry of fresh.slice(-6)) {
            // Tested on the French template: the same whatever the language of this device
            const source = entry.msg?.t ?? entry.message;
            const text = logText(entry);
            if (Table3D.SKIP.test(source) || entry.kind === 'dutch')
                continue;
            if (Table3D.QUIET.test(source)) {
                this.live.textContent = text;
                continue;
            }
            const actor = s.players.find(p => text.startsWith(p.name)) ?? s.players.find(p => text.includes(p.name));
            // This device's own routine moves are not announced: the player just did them
            if (actor && s.viewerId === actor.id && entry.kind === 'info')
                continue;
            this.notice(actor && actor.id !== this.bottomId() ? actor.id : null, text, actor ? actor.color : theme().ui.accent);
            this.live.textContent = text;
        }
    }
    /** A short notice: over the cards of another player, or under the instructions for this device's player */
    notice(playerId, text, color, seconds) {
        this.hud.chip(playerId ?? -1, text, color, playerId === null ? null : this.overHand(playerId), seconds);
    }
    dutchCall(name, me) {
        sfx.dutch();
        buzz(this.prefs, [30, 40, 30]);
        this.hud.call('DUTCH !', me ? t('Vous annoncez la fin : dernier tour pour les autres') : t('{name} annonce la fin : dernier tour pour les autres', { name }));
        this.live.textContent = me ? t('Vous dites Dutch !') : t('{name} dit Dutch !', { name });
        this.stage.knock();
    }
    showScores(instant = false) {
        const s = this.state;
        const result = s?.lastResult;
        if (!s || !result || this.destroyed)
            return;
        let title = t('Fin de la manche {round}', { round: result.round });
        if (result.gameOver) {
            const names = result.winners.map(id => id === s.viewerId ? t('vous') : s.players[id].name);
            title = result.winners.length === 1 && result.winners[0] === s.viewerId ? t('Vous gagnez !') : t('Victoire : {names}', { names: joinNames(names) });
        }
        const rows = result.scores.slice().sort((a, b) => a.total - b.total).map(r => {
            const player = s.players[r.playerId];
            return {
                color: player.color,
                name: `${r.playerId === s.viewerId ? t('{name} (vous)', { name: player.name }) : player.name}${r.playerId === result.dutchCallerId ? ' · Dutch' : ''}`,
                points: `+${r.points}${r.penalty ? ` (+${r.penalty})` : ''}`,
                penalty: !!r.penalty,
                total: r.total,
                won: result.winners.includes(r.playerId),
            };
        });
        const model = {
            title, rows,
            action: this.session.isHost ? {
                label: result.gameOver ? t('Nouvelle partie') : t('Manche suivante'),
                onTap: () => {
                    if (result.gameOver)
                        this.options.onNewGame();
                    else
                        this.dispatch({ type: 'nextRound', playerId: s.viewerId ?? 0 });
                },
            } : null,
            wait: result.gameOver ? t('En attente d\'une nouvelle partie…') : t('En attente de {name} pour la suite…', { name: s.players[0].name }),
            aside: t('Touchez la table pour voir les cartes'),
            reopen: t('Voir les scores'),
        };
        const aside = () => {
            this.lookingAtTable = true;
            this.hud.scoresAside(model.reopen, () => {
                this.lookingAtTable = false;
                this.showScores(true);
            });
        };
        this.hud.scores(model, instant, aside);
        this.live.textContent = `${title}. ${result.scores.map(r => `${s.players[r.playerId].name} ${r.total}`).join(', ')}`;
        if (!instant && result.gameOver && (s.viewerId === null || result.winners.includes(s.viewerId))) {
            sfx.dutch();
            this.hud.confetti(theme().ui.confetti);
        }
    }
    // endregion
    // region Input
    listen() {
        const canvas = this.stage.canvas;
        canvas.addEventListener('pointerdown', e => this.onPointerDown(e));
        canvas.addEventListener('pointermove', e => this.onPointerMove(e));
        canvas.addEventListener('pointerup', e => this.onPointerUp(e));
        canvas.addEventListener('pointercancel', () => this.onPointerCancel());
        canvas.addEventListener('pointerleave', () => this.setHover(null));
        canvas.addEventListener('webglcontextlost', e => {
            e.preventDefault();
            this.drawingLost = true;
        });
        canvas.addEventListener('webglcontextrestored', () => {
            if (document.visibilityState === 'visible')
                this.rebuild();
        });
        document.addEventListener('visibilitychange', this.onVisibility);
    }
    /** What can be touched, the nearest first when picked */
    touchables() {
        const list = [];
        for (const card of this.cards.values())
            list.push(card.mesh);
        if (this.pile)
            list.push(this.pile.mesh);
        list.push(this.discardPad, ...this.stage.tokens);
        return list;
    }
    nope(card) {
        card?.shake();
        buzz(this.prefs, 20);
    }
    onPointerDown(e) {
        unlockAudio();
        const s = this.state;
        if (!s || !this.plan)
            return;
        const hit = this.stage.pick(e.clientX, e.clientY, this.touchables());
        this.pressed = hit;
        const card = hit?.userData.card;
        if (!card?.place) {
            // Touch beside the cards: forget the card chosen to be thrown
            if (this.throwPick) {
                this.throwPick = null;
                this.requestSync();
            }
            return;
        }
        const place = card.place;
        const running = s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played';
        const own = place.zone === 'hand' && this.mine(place.player);
        const canDrag = (own && s.players[place.player].canThrow) || (place.zone === 'held' && running && this.mine(s.currentPlayerIndex));
        this.drag = { card, id: card.view.id, x: e.clientX, y: e.clientY, moved: false, canDrag, lastX: e.clientX };
        this.stage.canvas.setPointerCapture(e.pointerId);
    }
    onPointerMove(e) {
        const drag = this.drag;
        if (!drag) {
            if (e.pointerType === 'mouse')
                this.hoverAt(e.clientX, e.clientY);
            return;
        }
        if (!drag.moved) {
            if (!drag.canDrag || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8)
                return;
            drag.moved = true;
            this.throwPick = null;
            this.hud.throwButton('', null);
            drag.card.setGlow(0);
        }
        const at = this.stage.over(e.clientX, e.clientY, .04);
        if (!at)
            return;
        // Tilt with the speed of the finger
        const speed = Math.max(-.4, Math.min(.4, (e.clientX - drag.lastX) * .02));
        drag.lastX = e.clientX;
        const pose = drag.card.pose;
        drag.card.hold({ x: at.x, y: .04, z: at.z, yaw: pose.yaw + (speed - pose.yaw) * .25, tilt: .12, flip: pose.flip, scale: 1 });
    }
    onPointerUp(e) {
        const drag = this.drag;
        this.drag = null;
        const pressed = this.pressed;
        this.pressed = null;
        if (!drag) {
            // The piles and the tokens: a plain touch
            const hit = this.stage.pick(e.clientX, e.clientY, this.touchables());
            if (!hit || hit !== pressed)
                return;
            if (hit.userData.deck)
                this.tapDeck();
            else if (hit.userData.discard)
                this.tapDiscard();
            else if (hit.userData.seat !== undefined)
                this.tapSeat(hit.userData.seat);
            return;
        }
        if (!drag.moved)
            return this.tapCard(drag.id);
        const s = this.state, plan = this.plan;
        if (!s || !plan)
            return;
        const card = drag.card;
        const before = s.lastMove?.seq;
        const overDiscard = Math.hypot(card.pose.x - plan.discard.x, card.pose.z - plan.discard.z) < CARD_H;
        const place = card.place;
        const cur = s.currentPlayerIndex;
        if (overDiscard && place) {
            if (place.zone === 'held')
                this.dispatch({ type: 'discardDrawn', playerId: cur });
            else if (place.zone === 'hand')
                this.dispatch({ type: 'throwCard', playerId: place.player, cardId: drag.id });
        }
        else if (place?.zone === 'held') {
            const target = [...this.cards.values()].find(o => o.place?.zone === 'hand' && o.place.player === cur
                && Math.hypot(o.pose.x - card.pose.x, o.pose.z - card.pose.z) < CARD_W * .85);
            if (target)
                this.dispatch({ type: 'swapDrawn', playerId: cur, cardId: target.view.id });
        }
        // Nothing happened (or not yet: online, the answer comes back later): back to its place for now
        if (this.state?.lastMove?.seq === before)
            this.sync();
    }
    onPointerCancel() {
        const drag = this.drag;
        this.drag = null;
        this.pressed = null;
        if (drag?.moved)
            this.sync();
    }
    hoverAt(x, y) {
        const hit = this.stage.pick(x, y, this.touchables());
        const card = hit?.userData.card;
        this.setHover(card?.live ? card : null);
        const s = this.state;
        let pointer = !!card?.live;
        if (s && hit && !card) {
            const myTurn = (s.phase === 'draw' || s.phase === 'drawn') && this.mine(s.currentPlayerIndex) && !s.activeEffect;
            if (hit.userData.deck)
                pointer = myTurn && s.phase === 'draw';
            else if (hit.userData.discard)
                pointer = myTurn;
            else if (hit.userData.seat !== undefined)
                pointer = s.activeEffect?.type === 'ACE' && this.mine(s.activeEffect.playerId);
        }
        this.stage.canvas.style.cursor = pointer ? 'pointer' : '';
    }
    setHover(card) {
        if (card === this.hovered)
            return;
        this.hovered?.hover(false);
        this.hovered = card;
        card?.hover(true);
    }
    tapCard(id) {
        const s = this.state;
        const card = this.cards.get(id);
        const place = card?.place;
        if (!s || !card || !place)
            return;
        const effect = s.activeEffect;
        const cur = s.currentPlayerIndex;
        if (effect) {
            if (!this.mine(effect.playerId))
                return this.nope(card);
            if (effect.type === 'QUEEN' && place.zone === 'hand' && (place.player === effect.playerId || s.settings.queenAny)) {
                return this.dispatch({ type: 'queenPeek', playerId: effect.playerId, cardId: id });
            }
            if (effect.type === 'JACK' && place.zone === 'hand') {
                if (!this.jackPick || this.jackPick === id) {
                    this.jackPick = this.jackPick === id ? null : id;
                    sfx.pick();
                    return this.requestSync();
                }
                const first = this.jackPick;
                this.jackPick = null;
                return this.dispatch({ type: 'jackSwap', playerId: effect.playerId, cardIdA: first, cardIdB: id });
            }
            if (effect.type === 'ACE' && place.zone === 'hand')
                return this.dispatch({ type: 'aceGive', playerId: effect.playerId, targetId: place.player });
            return this.nope(card);
        }
        const peeker = this.peeker(s);
        if (peeker !== null && place.zone === 'hand' && place.player === peeker)
            return this.dispatch({ type: 'peek', playerId: peeker });
        const myTurn = (s.phase === 'draw' || s.phase === 'drawn' || s.phase === 'played') && this.mine(cur);
        if (myTurn && s.phase === 'draw' && place.zone === 'discard')
            return this.dispatch({ type: 'takeDiscard', playerId: cur });
        if (myTurn && s.phase === 'drawn') {
            if (place.zone === 'hand' && place.player === cur)
                return this.dispatch({ type: 'swapDrawn', playerId: cur, cardId: id });
            if (place.zone === 'discard' || place.zone === 'held')
                return this.tapDiscard();
        }
        // Own card while throwing is allowed: choose it, a button confirms
        if (place.zone === 'hand' && this.mine(place.player) && s.players[place.player].canThrow) {
            this.throwPick = this.throwPick === id ? null : id;
            sfx.pick();
            return this.requestSync();
        }
        this.nope(card);
    }
    tapDeck() {
        const s = this.state;
        if (!s)
            return;
        const cur = s.currentPlayerIndex;
        if (s.phase === 'draw' && this.mine(cur) && !s.activeEffect)
            this.dispatch({ type: 'drawFromPile', playerId: cur });
        else
            this.pile?.nope();
    }
    tapDiscard() {
        const s = this.state;
        if (!s)
            return;
        const cur = s.currentPlayerIndex;
        if (!this.mine(cur) || s.activeEffect)
            return;
        if (s.phase === 'drawn' && s.drawn?.source === 'pile')
            this.dispatch({ type: 'discardDrawn', playerId: cur });
        else if (s.phase === 'draw')
            this.dispatch({ type: 'takeDiscard', playerId: cur });
    }
    tapSeat(playerId) {
        const effect = this.state?.activeEffect;
        if (effect?.type === 'ACE' && this.mine(effect.playerId))
            this.dispatch({ type: 'aceGive', playerId: effect.playerId, targetId: playerId });
    }
    // endregion
    // region Chat
    /** A message on the table: emotes pop next to the player, text lines in a notice over his cards */
    showChat(message) {
        const s = this.state;
        if (!s || !this.plan)
            return;
        this.chrome.countUnread(message);
        const seat = this.plan.seats.get(message.seat);
        if (!seat || !s.players[message.seat])
            return;
        if (message.text) {
            this.notice(message.seat === this.bottomId() ? null : message.seat, `« ${message.text} »`, message.color, 4);
            this.live.textContent = t('{name} : {text}', { name: message.name, text: message.text });
            return;
        }
        if (!message.emote)
            return;
        sfx.tap();
        const at = this.stage.toScreen(seat.token.x, .05, seat.token.z);
        this.hud.emote(message.emote, message.color, { x: at.x, y: at.y - 24 });
        this.live.textContent = t('{name} : {text}', { name: message.name, text: message.emote });
    }
    // endregion
    // region Card back
    /** New card back: every card and the draw pile wear it */
    changeBack() {
        if (!this.skins || !this.pile)
            return;
        this.skins.changeBack(this.prefs.back);
        this.pile.refresh();
        for (const card of this.cards.values())
            card.refresh();
        this.stage.invalidate();
    }
    // endregion
    // region Checks
    /** Where a card is on the screen (automated checks touch the cards through this) */
    screenOf(cardId) {
        const pose = this.cards.get(cardId)?.target;
        return pose ? this.stage.toScreen(pose.x, pose.y, pose.z) : null;
    }
    /** Where the piles are on the screen */
    get piles() {
        const plan = this.plan;
        return plan ? { deck: this.stage.toScreen(plan.deck.x, .01, plan.deck.z), discard: this.stage.toScreen(plan.discard.x, .005, plan.discard.z) } : null;
    }
}
// endregion
// region Messages and effects
Table3D.SKIP = /^(C'est au tour|Au tour|Dernier tour de|— Ronde|Chaque joueur|Fin de la ronde|Partie terminée)/;
/** Said to screen readers only: the cards show it (everybody looks at his first cards at the same time) */
Table3D.QUIET = /regarde ses 2 dernières cartes/;
