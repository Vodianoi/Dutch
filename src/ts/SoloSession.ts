import {BotOptions, Bots} from './Bots.js';
import Dutch, {DutchSnapshot, RuleError} from './Dutch.js';
import {ChatMessage, EMOTES} from './net/Protocol.js';
import {Chat, Emitter, findHandCard, Session, SessionEvent} from './Session.js';
import {Action, applyAction, buildView, faceUp, GameView, notice} from './View.js';

/**
 *  "Contre l'ordinateur": this device plays seat 0, computer players play the other seats.
 *  Like an online game, the player only sees his own cards when they are revealed to him.
 */
export class SoloSession implements Session {
    public readonly viewerId = 0;
    public readonly isHost = true;
    public readonly canShowAll = true;
    public state: GameView | null = null;

    private readonly events = new Emitter<SessionEvent>();
    private readonly bots: Bots;
    private showAll = false;
    private readonly unsubscribe: () => void;
    private readonly chatLog: ChatMessage[] = [];
    private chatId = 0;
    private lastSeq = 0;
    private lastReaction = 0;
    private readonly timers = new Set<ReturnType<typeof setTimeout>>();
    /** Emotes only: the bots answer with emotes too */
    public readonly chat: Chat;

    /**
     * @param game the engine (new or restored), seat 0 is the player of this device
     * @param persist called after every change with the whole game (to continue it after a reload)
     */
    constructor(public readonly game: Dutch, private readonly persist?: (snapshot: DutchSnapshot) => void, botOptions: BotOptions = {}) {
        this.bots = new Bots(game, game.players.slice(1).map(p => p.id), botOptions);
        const log = this.chatLog;
        this.chat = {
            get messages() {
                return log;
            },
            text: false,
            send: () => undefined,
            emote: emote => {
                if (!EMOTES.includes(emote)) return;
                this.post(this.viewerId, emote);
                // Somebody answers, sometimes
                if (Math.random() < .5) this.react([emote, '👍', '😂', '😎'], 900);
            },
        };
        this.unsubscribe = game.on(event => {
            if (event.type === 'reveal') {
                if (!event.public && event.playerId !== this.viewerId) return;
                const card = findHandCard(game, event.cardId);
                if (card) this.events.emit({type: 'reveal', card: faceUp(card)});
            } else {
                this.refresh();
            }
        });
        this.refresh();
    }

    public dispatch(action: Action) {
        try {
            // This device only plays its own seat
            const notice = applyAction(this.game, {...action, playerId: this.viewerId});
            if (notice) this.events.emit({type: 'notice', notice});
        } catch (e) {
            if (!(e instanceof RuleError)) throw e;
            this.events.emit({type: 'notice', notice: notice('error', e.msg)});
        }
    }

    public setBotSpeed(factor: number) {
        this.bots.setSpeed(factor);
    }

    public setShowAll(on: boolean) {
        this.showAll = on;
        this.refresh();
    }

    public on(listener: (event: SessionEvent) => void) {
        return this.events.on(listener);
    }

    /** Leaving the game: the bots stop playing */
    public close() {
        this.timers.forEach(t => clearTimeout(t));
        this.timers.clear();
        this.bots.stop();
        this.unsubscribe();
    }

    private post(seat: number, emote: string) {
        const player = this.game.players[seat];
        const message: ChatMessage = {id: ++this.chatId, seat, name: player.name, color: player.color, emote, at: Date.now()};
        this.chatLog.push(message);
        if (this.chatLog.length > 60) this.chatLog.shift();
        this.events.emit({type: 'chat', message});
    }

    /** A random bot sends one of these emotes after a moment (not too often) */
    private react(emotes: string[], delay = 700, seat?: number) {
        const now = Date.now();
        if (now - this.lastReaction < 2500) return;
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
    private reactToMove() {
        const move = this.game.lastMove;
        if (!move || move.seq === this.lastSeq) return;
        this.lastSeq = move.seq;
        const mine = move.playerId === this.viewerId;
        if (move.type === 'wrongThrow' && mine && Math.random() < .6) this.react(['😂', '😬']);
        else if (move.type === 'wrongThrow' && !mine && Math.random() < .5) this.react(['😡', '😬'], 500, move.playerId);
        else if (move.type === 'throw' && !mine && Math.random() < .35) this.react(['😎', '🔥'], 500, move.playerId);
        else if (move.type === 'throw' && mine && Math.random() < .3) this.react(['😮', '👍']);
        else if (move.type === 'dutch' && mine && Math.random() < .7) this.react(['😬', '😮', '🤔']);
        else if (move.type === 'jackSwap' && move.playerIds.includes(this.viewerId) && Math.random() < .5) this.react(['😎', '😂'], 500, move.playerId);
    }

    private refresh() {
        this.reactToMove();
        this.state = buildView(this.game, this.viewerId, {showAll: this.showAll});
        this.persist?.(this.game.snapshot());
        this.events.emit({type: 'state'});
        this.bots.schedule();
    }
}
