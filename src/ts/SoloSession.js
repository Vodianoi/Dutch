import { Bots } from './Bots.js';
import { RuleError } from './Dutch.js';
import { EMOTES } from './net/Protocol.js';
import { Emitter, findHandCard } from './Session.js';
import { applyAction, buildView, faceUp } from './View.js';
/**
 *  "Contre l'ordinateur": this device plays seat 0, computer players play the other seats.
 *  Like an online game, the player only sees his own cards when they are revealed to him.
 */
export class SoloSession {
    /**
     * @param game the engine (new or restored), seat 0 is the player of this device
     * @param persist called after every change with the whole game (to continue it after a reload)
     */
    constructor(game, persist, botOptions = {}) {
        this.game = game;
        this.persist = persist;
        this.viewerId = 0;
        this.isHost = true;
        this.canShowAll = true;
        this.state = null;
        this.events = new Emitter();
        this.showAll = false;
        this.chatLog = [];
        this.chatId = 0;
        this.lastSeq = 0;
        this.lastReaction = 0;
        this.timers = new Set();
        this.bots = new Bots(game, game.players.slice(1).map(p => p.id), botOptions);
        const log = this.chatLog;
        this.chat = {
            get messages() {
                return log;
            },
            text: false,
            send: () => undefined,
            emote: emote => {
                if (!EMOTES.includes(emote))
                    return;
                this.post(this.viewerId, emote);
                // Somebody answers, sometimes
                if (Math.random() < .5)
                    this.react([emote, '👍', '😂', '😎'], 900);
            },
        };
        this.unsubscribe = game.on(event => {
            if (event.type === 'reveal') {
                if (!event.public && event.playerId !== this.viewerId)
                    return;
                const card = findHandCard(game, event.cardId);
                if (card)
                    this.events.emit({ type: 'reveal', card: faceUp(card) });
            }
            else {
                this.refresh();
            }
        });
        this.refresh();
    }
    dispatch(action) {
        try {
            // This device only plays its own seat
            const notice = applyAction(this.game, { ...action, playerId: this.viewerId });
            if (notice)
                this.events.emit({ type: 'notice', notice });
        }
        catch (e) {
            if (!(e instanceof RuleError))
                throw e;
            this.events.emit({ type: 'notice', notice: { text: e.message, kind: 'error' } });
        }
    }
    setShowAll(on) {
        this.showAll = on;
        this.refresh();
    }
    on(listener) {
        return this.events.on(listener);
    }
    /** Leaving the game: the bots stop playing */
    close() {
        this.timers.forEach(t => clearTimeout(t));
        this.timers.clear();
        this.bots.stop();
        this.unsubscribe();
    }
    post(seat, emote) {
        const player = this.game.players[seat];
        const message = { id: ++this.chatId, seat, name: player.name, color: player.color, emote, at: Date.now() };
        this.chatLog.push(message);
        if (this.chatLog.length > 60)
            this.chatLog.shift();
        this.events.emit({ type: 'chat', message });
    }
    /** A random bot sends one of these emotes after a moment (not too often) */
    react(emotes, delay = 700, seat) {
        const now = Date.now();
        if (now - this.lastReaction < 2500)
            return;
        this.lastReaction = now;
        const bots = this.game.players.slice(1).map(p => p.id);
        const who = seat ?? bots[Math.floor(Math.random() * bots.length)];
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            this.post(who, emotes[Math.floor(Math.random() * emotes.length)]);
        }, delay + Math.random() * 600);
        this.timers.add(timer);
    }
    /** The bots react to some moves */
    reactToMove() {
        const move = this.game.lastMove;
        if (!move || move.seq === this.lastSeq)
            return;
        this.lastSeq = move.seq;
        const mine = move.playerId === this.viewerId;
        if (move.type === 'wrongThrow' && mine && Math.random() < .6)
            this.react(['😂', '😬']);
        else if (move.type === 'wrongThrow' && !mine && Math.random() < .5)
            this.react(['😡', '😬'], 500, move.playerId);
        else if (move.type === 'throw' && !mine && Math.random() < .35)
            this.react(['😎', '🔥'], 500, move.playerId);
        else if (move.type === 'throw' && mine && Math.random() < .3)
            this.react(['😮', '👍']);
        else if (move.type === 'dutch' && mine && Math.random() < .7)
            this.react(['😬', '😮', '🤔']);
        else if (move.type === 'jackSwap' && move.playerIds.includes(this.viewerId) && Math.random() < .5)
            this.react(['😎', '😂'], 500, move.playerId);
    }
    refresh() {
        this.reactToMove();
        this.state = buildView(this.game, this.viewerId, { showAll: this.showAll });
        this.persist?.(this.game.snapshot());
        this.events.emit({ type: 'state' });
        this.bots.schedule();
    }
}
