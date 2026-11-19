import Dutch, {DutchSnapshot, RuleError} from '../Dutch.js';
import {assignColors, cleanSettings, GameSettings, isPlayerColor, settingsProblem} from '../Settings.js';
import {Chat, Emitter, findHandCard, Session, SessionEvent} from '../Session.js';
import {Action, applyAction, buildView, faceUp, GameView, notice} from '../View.js';
import {
    CHAT_HISTORY, ChatMessage, cleanChatText, ClientMessage, cleanName, EMOTES, HostMessage, LobbyState, MAX_PLAYERS, PROTOCOL_VERSION, randomToken,
    RoomInfo,
} from './Protocol.js';
import {Connection, HostTransport, isPublicCode} from './Transport.js';

interface Seat {
    name: string;
    color: string;
    token: string;
    connection: Connection | null;
    lastSeen: number;
}

/**
 *  Everything needed to reopen the room after the host's page went away (reload, tab discarded…):
 *  the players and their tokens (so they get their seat back) and the game itself
 */
export interface HostSnapshot {
    v: 1;
    code: string;
    /** Id of the room (kept when the page reopens it) */
    room?: string;
    seats: { name: string; token: string; color?: string }[];
    settings?: GameSettings;
    game: DutchSnapshot | null;
}

export interface HostOptions {
    heartbeatMs?: number;
    timeoutMs?: number;
    /** Reopen a saved room (same players, same game) */
    restore?: HostSnapshot;
    /** Called after every change, to save the room */
    persist?: (snapshot: HostSnapshot) => void;
    /** Rules shown in the lobby until the host changes them */
    settings?: Partial<GameSettings>;
    /** Colour of the host */
    color?: string;
}

export type StartOptions = Partial<GameSettings>;

/**
 *  Online game, host side.
 *  - The engine runs here; this device is seat 0
 *  - Each player gets only his own view (buildView) and his own private reveals
 *  - Actions received from a connection are always played for the seat of that connection
 *  - The room is saved after every change and can be reopened (players reconnect with their token)
 */
export class Host implements Session {
    public readonly viewerId = 0;
    public readonly isHost = true;
    public readonly canShowAll = false;
    public state: GameView | null = null;

    private readonly transport: HostTransport;
    private readonly seats: Seat[];
    private readonly events = new Emitter<SessionEvent>();
    private readonly heartbeatMs: number;
    private readonly timeoutMs: number;
    private readonly heartbeat: ReturnType<typeof setInterval>;
    private readonly persistTo: ((snapshot: HostSnapshot) => void) | undefined;
    private lastTick = Date.now();
    private settings: GameSettings;
    private game: Dutch | null = null;
    private unsubscribeGame: (() => void) | null = null;
    private closed = false;
    private readonly chatLog: ChatMessage[] = [];
    /** Players the host removed from the waiting room: they can't come back to this room */
    private readonly removed = new Set<string>();
    /** Id of this room: its players send it back when they reconnect */
    private readonly roomId: string;
    private chatId = 0;
    /** Recent messages of each player (flood limit) */
    private readonly chatTimes = new Map<Seat, number[]>();
    public readonly chat: Chat;

    constructor(transport: HostTransport, hostName: string, options: HostOptions = {}) {
        const log = this.chatLog;
        const host = this;
        this.chat = {
            get messages() {
                return log;
            },
            // Public games (strangers): reactions only
            get text() {
                return !host.isPublic;
            },
            send: text => this.post(this.seats[0], {text}),
            emote: emote => this.post(this.seats[0], {emote}),
        };
        this.transport = transport;
        this.heartbeatMs = options.heartbeatMs ?? 4000;
        this.timeoutMs = options.timeoutMs ?? 15000;
        this.persistTo = options.persist;
        const saved = options.restore;
        this.roomId = saved?.room ?? randomToken();
        if (saved) {
            const colors = assignColors(saved.seats.map(s => s.color));
            this.seats = saved.seats.map((s, i) => ({name: s.name, color: colors[i], token: s.token, connection: null, lastSeen: 0}));
            this.settings = cleanSettings(saved.settings ?? options.settings);
            if (saved.game) this.attach(Dutch.restore(saved.game));
        } else {
            const color = assignColors([options.color])[0];
            this.seats = [{name: cleanName(hostName, 'Hôte'), color, token: randomToken(), connection: null, lastSeen: Date.now()}];
            this.settings = cleanSettings(options.settings);
        }
        transport.onConnection(connection => this.accept(connection));
        this.heartbeat = setInterval(() => this.tick(), this.heartbeatMs);
        if (this.game) this.broadcastState();
        else this.persist();
    }

    // region Public
    public get code(): string {
        return this.transport.code;
    }

    public get started(): boolean {
        return this.game !== null;
    }

    /**
     *  Remove a player from the waiting room (a stranger in a public game…): he is told so,
     *  and this room refuses him from then on. Not once the cards are dealt (the game needs every hand).
     */
    public kick(index: number) {
        const seat = this.seats[index];
        if (this.game || index <= 0 || !seat) return;
        this.removed.add(seat.token);
        const connection = seat.connection;
        seat.connection = null;
        if (connection) {
            connection.send({t: 'ended', reason: 'L\'hôte vous a retiré de la partie.'} satisfies HostMessage);
            setTimeout(() => connection.close(), 200);
        }
        this.seats.splice(index, 1);
        this.chatTimes.delete(seat);
        this.broadcastLobby();
    }

    /** Listed with the public games (code PUB01…) */
    public get isPublic(): boolean {
        return isPublicCode(this.code);
    }

    /** What the room tells someone who knocks */
    public get info(): RoomInfo {
        return {
            code: this.code, v: PROTOCOL_VERSION, host: this.seats[0].name, players: this.seats.length, max: MAX_PLAYERS,
            started: !!this.game, settings: this.settings,
        };
    }

    public get lobby(): LobbyState {
        return {
            code: this.code,
            started: this.started,
            settings: this.settings,
            players: this.seats.map((seat, i) => ({name: seat.name, color: seat.color, connected: this.isConnected(i)})),
        };
    }

    public on(listener: (event: SessionEvent) => void) {
        return this.events.on(listener);
    }

    /**
     *  Rules chosen in the lobby: shown to every player before the game starts
     */
    public setSettings(settings: Partial<GameSettings>) {
        if (this.game) return;
        this.settings = cleanSettings({...this.settings, ...settings});
        this.broadcastLobby();
    }

    /**
     *  Deal the cards to everybody in the lobby
     */
    public start(options: StartOptions = {}) {
        if (this.game) throw new RuleError('La partie a déjà commencé.');
        // Players who left the lobby don't get a seat
        for (let i = this.seats.length - 1; i > 0; i--) {
            if (!this.seats[i].connection) this.seats.splice(i, 1);
        }
        if (this.seats.length < 2) throw new RuleError('Il faut au moins 2 joueurs.');
        this.settings = cleanSettings({...this.settings, ...options});
        const problem = settingsProblem(this.seats.length, this.settings);
        if (problem) throw new RuleError(problem);
        const game = new Dutch({
            ...this.settings,
            players: this.seats.map(s => s.name),
            playerColors: this.seats.map(s => s.color),
        });
        this.attach(game);
        this.broadcastLobby();
        game.startRound();
    }

    /**
     *  Back to the lobby with the same players (after a game over)
     */
    public newGame() {
        this.unsubscribeGame?.();
        this.unsubscribeGame = null;
        this.game = null;
        this.state = null;
        for (let i = this.seats.length - 1; i > 0; i--) {
            if (!this.seats[i].connection) this.seats.splice(i, 1);
        }
        this.broadcastLobby();
    }

    public dispatch(action: Action) {
        const notice = this.run({...action, playerId: 0}, true);
        if (notice) this.events.emit({type: 'notice', notice});
    }

    public setShowAll() {
        // Not available online: it would show the cards of the other players
    }

    public snapshot(): HostSnapshot {
        return {
            v: 1,
            code: this.code,
            room: this.roomId,
            seats: this.seats.map(s => ({name: s.name, token: s.token, color: s.color})),
            settings: this.settings,
            game: this.game ? this.game.snapshot() : null,
        };
    }

    /**
     *  The page goes away (closed, reloaded, discarded): the connections drop but the game is not over,
     *  the players keep trying to reconnect until this page (or its reload) reopens the room
     */
    public suspend() {
        if (this.closed) return;
        this.persist();
        for (const seat of this.seats) {
            const connection = seat.connection;
            seat.connection = null;
            connection?.close();
        }
        this.transport.suspend();
    }

    /**
     *  The page is visible again: reopen the room if needed, and give everybody time to answer
     *  (their connections may have been frozen together with this page)
     */
    public resume() {
        if (this.closed) return;
        this.transport.resume();
        this.forgiveSilence();
    }

    /**
     *  End of the game for everybody (the host left on purpose)
     */
    public close() {
        if (this.closed) return;
        this.closed = true;
        clearInterval(this.heartbeat);
        this.unsubscribeGame?.();
        for (const seat of this.seats) {
            this.send(seat, {t: 'ended', reason: 'L\'hôte a quitté la partie.'});
            seat.connection?.close();
        }
        this.transport.close();
    }
    // endregion

    // region Chat
    /**
     *  A chat line or an emote from a seat: checked, kept and sent to everybody
     */
    private post(seat: Seat | undefined, content: { text?: unknown; emote?: unknown }) {
        const index = seat ? this.seats.indexOf(seat) : -1;
        if (!seat || index < 0 || this.closed) return;
        const emote = typeof content.emote === 'string' && EMOTES.includes(content.emote) ? content.emote : null;
        // Public games: no free text between strangers, only reactions
        const text = this.isPublic ? '' : cleanChatText(content.text);
        if (content.emote !== undefined ? !emote : !text) return;
        // At most 8 messages in 10 seconds per player
        const now = Date.now();
        const recent = (this.chatTimes.get(seat) ?? []).filter(t => now - t < 10000);
        if (recent.length >= 8) return;
        recent.push(now);
        this.chatTimes.set(seat, recent);
        const base = {id: ++this.chatId, seat: index, name: seat.name, color: seat.color, at: now};
        const message: ChatMessage = emote ? {...base, emote} : {...base, text};
        this.chatLog.push(message);
        if (this.chatLog.length > CHAT_HISTORY) this.chatLog.shift();
        this.seats.forEach((s, i) => {
            if (i > 0) this.send(s, {t: 'chat', message});
        });
        this.events.emit({type: 'chat', message});
    }
    // endregion

    // region Connections
    private isConnected(seatIndex: number): boolean {
        return seatIndex === 0 || !!this.seats[seatIndex]?.connection;
    }

    private accept(connection: Connection) {
        let seat: Seat | null = null;
        const helloTimer = setTimeout(() => {
            if (!seat) connection.close();
        }, 10000);

        connection.onMessage(raw => {
            const message = raw as ClientMessage;
            if (!message || typeof message !== 'object') return;
            if (!seat) {
                if (message.t === 'info') {
                    clearTimeout(helloTimer);
                    connection.send({t: 'info', room: this.info} satisfies HostMessage);
                    setTimeout(() => connection.close(), 300);
                    return;
                }
                if (message.t !== 'hello') return;
                clearTimeout(helloTimer);
                seat = this.hello(connection, message);
                return;
            }
            if (seat.connection !== connection) return;
            seat.lastSeen = Date.now();
            if (message.t === 'chat') this.post(seat, {text: message.text});
            if (message.t === 'emote') this.post(seat, {emote: message.emote});
            if (message.t === 'action' && message.action && typeof message.action === 'object') {
                const index = this.seats.indexOf(seat);
                const notice = this.run({...message.action, playerId: index}, false);
                if (notice) this.send(seat, {t: 'notice', notice});
            }
        });

        connection.onClose(() => {
            clearTimeout(helloTimer);
            if (seat && seat.connection === connection) this.disconnected(seat);
        });
    }

    private hello(connection: Connection, hello: Extract<ClientMessage, { t: 'hello' }>): Seat | null {
        const refuse = (reason: string) => {
            connection.send({t: 'refused', reason} satisfies HostMessage);
            setTimeout(() => connection.close(), 200);
            return null;
        };
        if (hello.v !== PROTOCOL_VERSION) return refuse('Version du jeu différente : rechargez la page.');
        // Player of another game that had this code before (public code taken again)
        if (typeof hello.room === 'string' && hello.room !== this.roomId) return refuse('Cette partie est terminée.');
        if (typeof hello.token !== 'string' || hello.token.length < 8) return refuse('Connexion invalide.');
        if (this.removed.has(hello.token)) return refuse('L\'hôte vous a retiré de la partie.');

        let seat = this.seats.find((s, i) => i > 0 && s.token === hello.token);
        if (seat) {
            // Same player coming back (page reloaded, phone woke up...)
            const previous = seat.connection;
            seat.connection = connection;
            if (previous && previous !== connection) previous.close();
        } else {
            if (this.game) return refuse('La partie a déjà commencé.');
            if (this.seats.length >= MAX_PLAYERS) return refuse('La partie est complète (10 joueurs).');
            const wanted = isPlayerColor(hello.color) && !this.seats.some(s => s.color === hello.color) ? hello.color : null;
            const color = wanted ?? assignColors([...this.seats.map(s => s.color), null])[this.seats.length];
            seat = {name: this.uniqueName(cleanName(hello.name, `Joueur ${this.seats.length + 1}`)), color, token: hello.token, connection, lastSeen: 0};
            this.seats.push(seat);
        }
        seat.lastSeen = Date.now();
        this.send(seat, {t: 'welcome', seat: this.seats.indexOf(seat), room: this.roomId});
        if (this.chatLog.length) this.send(seat, {t: 'chatLog', messages: this.chatLog});
        if (this.game) this.broadcastState();
        else this.broadcastLobby();
        return seat;
    }

    private uniqueName(name: string): string {
        let candidate = name;
        for (let n = 2; this.seats.some(s => s.name === candidate); n++) candidate = `${name} ${n}`;
        return candidate;
    }

    private disconnected(seat: Seat) {
        seat.connection = null;
        if (!this.game) {
            // Before the game, a player who leaves frees his seat
            this.seats.splice(this.seats.indexOf(seat), 1);
            this.broadcastLobby();
        } else {
            this.broadcastState();
        }
    }

    private forgiveSilence() {
        const now = Date.now();
        this.lastTick = now;
        for (const seat of this.seats) seat.lastSeen = now;
    }

    /**
     *  Heartbeat: detect players who vanished without closing the connection.
     *  If this page itself was asleep (phone locked, browser in the background), the players were
     *  not silent: we were. Give them a fresh delay instead of dropping everybody.
     */
    private tick() {
        const now = Date.now();
        const slept = now - this.lastTick > this.heartbeatMs * 2.5;
        this.lastTick = now;
        if (slept) {
            this.forgiveSilence();
            this.transport.resume();
        }
        for (const seat of this.seats) {
            if (!seat.connection) continue;
            if (now - seat.lastSeen > this.timeoutMs) {
                const connection = seat.connection;
                this.disconnected(seat);
                connection.close();
            } else {
                this.send(seat, {t: 'ping'});
            }
        }
    }
    // endregion

    // region Game
    private attach(game: Dutch) {
        this.game = game;
        this.unsubscribeGame = game.on(event => {
            if (event.type === 'change') {
                this.broadcastState();
                return;
            }
            const card = findHandCard(game, event.cardId);
            if (!card) return;
            const message: HostMessage = {t: 'reveal', card: faceUp(card)};
            this.seats.forEach((seat, i) => {
                if (!event.public && i !== event.playerId) return;
                if (i === 0) this.events.emit({type: 'reveal', card: message.card});
                else this.send(seat, message);
            });
        });
    }

    private run(action: Action, fromHost: boolean) {
        if (!this.game) return notice('error', 'La partie n\'a pas commencé.');
        if (action.type === 'nextRound' && !fromHost) return notice('error', 'Seul l\'hôte lance la ronde suivante.');
        try {
            return applyAction(this.game, action);
        } catch (e) {
            if (e instanceof RuleError) return notice('error', e.msg);
            console.error('Invalid action', action, e);
            return notice('error', 'Action invalide.');
        }
    }

    private send(seat: Seat, message: HostMessage) {
        seat.connection?.send(message);
    }

    private persist() {
        if (!this.persistTo || this.closed) return;
        try {
            this.persistTo(this.snapshot());
        } catch (e) {
            console.warn('Dutch: the game could not be saved', e);
        }
    }

    private broadcastLobby() {
        const lobby = this.lobby;
        this.seats.forEach((seat, i) => this.send(seat, {t: 'lobby', lobby, you: i}));
        this.persist();
        this.events.emit({type: 'lobby'});
    }

    private broadcastState() {
        const game = this.game;
        if (!game) return;
        const connected = (i: number) => this.isConnected(i);
        this.seats.forEach((seat, i) => {
            if (i === 0) this.state = buildView(game, 0, {connected});
            else this.send(seat, {t: 'state', state: buildView(game, i, {connected})});
        });
        this.persist();
        this.events.emit({type: 'state'});
    }
    // endregion
}
