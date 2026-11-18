import Dutch, {DutchSnapshot, RuleError} from '../Dutch.js';
import {Emitter, findHandCard, Session, SessionEvent} from '../Session.js';
import {Action, applyAction, buildView, faceUp, GameView} from '../View.js';
import {ClientMessage, cleanName, HostMessage, LobbyState, MAX_PLAYERS, PROTOCOL_VERSION, randomToken} from './Protocol.js';
import {Connection, HostTransport} from './Transport.js';

interface Seat {
    name: string;
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
    seats: { name: string; token: string }[];
    game: DutchSnapshot | null;
}

export interface HostOptions {
    heartbeatMs?: number;
    timeoutMs?: number;
    /** Reopen a saved room (same players, same game) */
    restore?: HostSnapshot;
    /** Called after every change, to save the room */
    persist?: (snapshot: HostSnapshot) => void;
}

export interface StartOptions {
    deckCount?: number;
    peekVariant?: boolean;
}

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
    private game: Dutch | null = null;
    private unsubscribeGame: (() => void) | null = null;
    private closed = false;

    constructor(transport: HostTransport, hostName: string, options: HostOptions = {}) {
        this.transport = transport;
        this.heartbeatMs = options.heartbeatMs ?? 4000;
        this.timeoutMs = options.timeoutMs ?? 15000;
        this.persistTo = options.persist;
        const saved = options.restore;
        if (saved) {
            this.seats = saved.seats.map(s => ({name: s.name, token: s.token, connection: null, lastSeen: 0}));
            if (saved.game) this.attach(Dutch.restore(saved.game));
        } else {
            this.seats = [{name: cleanName(hostName, 'Hôte'), token: randomToken(), connection: null, lastSeen: Date.now()}];
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

    public get lobby(): LobbyState {
        return {
            code: this.code,
            started: this.started,
            players: this.seats.map((seat, i) => ({name: seat.name, connected: this.isConnected(i)})),
        };
    }

    public on(listener: (event: SessionEvent) => void) {
        return this.events.on(listener);
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
        const game = new Dutch({
            players: this.seats.map(s => s.name),
            deckCount: options.deckCount,
            peekVariant: options.peekVariant,
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
            seats: this.seats.map(s => ({name: s.name, token: s.token})),
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
                if (message.t !== 'hello') return;
                clearTimeout(helloTimer);
                seat = this.hello(connection, message);
                return;
            }
            if (seat.connection !== connection) return;
            seat.lastSeen = Date.now();
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
        if (typeof hello.token !== 'string' || hello.token.length < 8) return refuse('Connexion invalide.');

        let seat = this.seats.find((s, i) => i > 0 && s.token === hello.token);
        if (seat) {
            // Same player coming back (page reloaded, phone woke up...)
            const previous = seat.connection;
            seat.connection = connection;
            if (previous && previous !== connection) previous.close();
        } else {
            if (this.game) return refuse('La partie a déjà commencé.');
            if (this.seats.length >= MAX_PLAYERS) return refuse('La partie est complète (10 joueurs).');
            seat = {name: this.uniqueName(cleanName(hello.name, `Joueur ${this.seats.length + 1}`)), token: hello.token, connection, lastSeen: 0};
            this.seats.push(seat);
        }
        seat.lastSeen = Date.now();
        this.send(seat, {t: 'welcome', seat: this.seats.indexOf(seat)});
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
        if (!this.game) return {text: 'La partie n\'a pas commencé.', kind: 'error' as const};
        if (action.type === 'nextRound' && !fromHost) return {text: 'Seul l\'hôte lance la ronde suivante.', kind: 'error' as const};
        try {
            return applyAction(this.game, action);
        } catch (e) {
            if (e instanceof RuleError) return {text: e.message, kind: 'error' as const};
            console.error('Invalid action', action, e);
            return {text: 'Action invalide.', kind: 'error' as const};
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
