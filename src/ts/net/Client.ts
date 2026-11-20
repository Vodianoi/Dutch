import {t} from '../i18n.js';
import {cleanSettings} from '../Settings.js';
import {Chat, ConnectionStatus, Emitter, Session, SessionEvent} from '../Session.js';
import {Action, GameView, notice} from '../View.js';
import {CHAT_HISTORY, ChatMessage, ClientMessage, HostMessage, LobbyState, PROTOCOL_VERSION} from './Protocol.js';
import {Connection, isPublicCode, TransportError, TransportFactory} from './Transport.js';

export interface ClientOptions {
    /** The host is considered gone when silent for this long (it pings every 4 s) */
    timeoutMs?: number;
    /** Max time to wait for the host to accept us */
    welcomeTimeoutMs?: number;
    /** Delays between reconnection attempts; the last one repeats */
    retryDelaysMs?: number[];
    /** Stop trying to reconnect after this long */
    giveUpMs?: number;
    /** Colour wished by the player (the host gives another one if it is taken) */
    color?: string;
    /** Room this player was in (page reloaded): another room with the same code refuses him */
    room?: string;
}

/** Final answer of the host: no point in trying again */
class Refused extends TransportError {
}

/**
 *  Online game, player side: the engine runs on the host's device.
 *  This device only receives its own view and sends its actions.
 *
 *  Phones drop connections all the time (screen locked, browser in the background, network change):
 *  when the host can't be reached anymore, the client reconnects on its own with its token and gets
 *  its seat back. It only gives up when the host refuses it, ends the game, or after `giveUpMs`.
 */
export class Client implements Session {
    public readonly isHost = false;
    public readonly canShowAll = false;
    public state: GameView | null = null;
    public lobby: LobbyState | null = null;
    public seat = -1;
    /** Id of the room, given by the host */
    public room: string | null = null;
    public status: ConnectionStatus = 'online';
    private readonly chatLog: ChatMessage[] = [];
    public readonly chat: Chat = (() => {
        const log = this.chatLog;
        const publicGame = () => isPublicCode(this.code);
        return {
            get messages() {
                return log;
            },
            // Public games (strangers): reactions only
            get text() {
                return !publicGame();
            },
            send: (text: string) => this.send({t: 'chat', text}),
            emote: (emote: string) => this.send({t: 'emote', emote}),
        };
    })();

    private readonly transport: TransportFactory;
    private readonly code: string;
    private readonly name: string;
    private readonly token: string;
    private readonly timeoutMs: number;
    private readonly welcomeTimeoutMs: number;
    private readonly retryDelaysMs: number[];
    private readonly giveUpMs: number;
    private readonly color: string | undefined;
    private readonly events = new Emitter<SessionEvent>();
    private readonly watchdog: ReturnType<typeof setInterval>;

    private connection: Connection | null = null;
    private lastSeen = Date.now();
    private closed = false;
    /** Reconnection in progress: when it started, attempts made, next attempt */
    private lostAt = 0;
    private attempts = 0;
    private retryTimer: ReturnType<typeof setTimeout> | undefined;
    private connecting = false;
    /** The page is hidden for good (pagehide): wait for it to come back before reconnecting */
    private suspended = false;
    private welcomeListeners: ((error?: Error) => void)[] = [];

    private constructor(transport: TransportFactory, code: string, name: string, token: string, options: ClientOptions) {
        this.transport = transport;
        this.code = code;
        this.name = name;
        this.token = token;
        this.room = options.room ?? null;
        this.timeoutMs = options.timeoutMs ?? 15000;
        this.welcomeTimeoutMs = options.welcomeTimeoutMs ?? 10000;
        this.retryDelaysMs = options.retryDelaysMs ?? [0, 1000, 2000, 4000, 8000];
        this.giveUpMs = options.giveUpMs ?? 10 * 60 * 1000;
        this.color = options.color;
        this.watchdog = setInterval(() => {
            // Also true when this page was asleep: the connection is probably dead, check right away
            if (this.status === 'online' && Date.now() - this.lastSeen > this.timeoutMs) this.lost();
        }, 1000);
    }

    /**
     *  Join the room `code`. Resolves once the host gave us a seat.
     * @param token identifies this player if he has to reconnect
     */
    public static async join(transport: TransportFactory, code: string, name: string, token: string, options: ClientOptions = {}): Promise<Client> {
        const client = new Client(transport, code, name, token, options);
        try {
            await client.connect();
        } catch (e) {
            client.leave();
            throw e;
        }
        return client;
    }

    public get viewerId(): number | null {
        return this.state?.viewerId ?? this.seat;
    }

    public on(listener: (event: SessionEvent) => void) {
        return this.events.on(listener);
    }

    public dispatch(action: Action) {
        if (this.closed) {
            this.events.emit({type: 'notice', notice: notice('error', 'Connexion perdue.')});
            return;
        }
        if (this.status !== 'online') {
            this.events.emit({type: 'notice', notice: notice('error', 'Reconnexion en cours… réessayez dans un instant.')});
            return;
        }
        this.send({t: 'action', action});
    }

    public setShowAll() {
        // The cards of the other players never reach this device
    }

    /**
     *  The page goes away (pagehide): close the connection so the host knows right away,
     *  and wait for resume() (page restored from the back/forward cache) to reconnect
     */
    public suspend() {
        if (this.closed) return;
        this.suspended = true;
        clearTimeout(this.retryTimer);
        const connection = this.connection;
        this.connection = null;
        connection?.close();
        if (!this.lostAt) this.lostAt = Date.now();
        this.setStatus('reconnecting');
    }

    /**
     *  The page is visible again: reconnect now if the connection was lost or looks dead
     */
    public resume() {
        if (this.closed) return;
        this.suspended = false;
        if (this.status === 'online' && Date.now() - this.lastSeen > Math.min(this.timeoutMs, 6000)) this.lost();
        if (this.status === 'reconnecting' && !this.connecting) {
            this.attempts = 0;
            this.lostAt = Date.now();
            this.retry(0);
        }
    }

    /**
     *  Leave the game for good
     */
    public leave() {
        if (this.closed) return;
        this.closed = true;
        clearInterval(this.watchdog);
        clearTimeout(this.retryTimer);
        const connection = this.connection;
        this.connection = null;
        connection?.close();
    }

    // region Connection
    /**
     *  Open a connection and say hello; resolves on "welcome"
     *  @throws Refused when the host says no, TransportError when it can't be reached
     */
    private async connect(): Promise<void> {
        const connection = await this.transport.join(this.code);
        if (this.closed || this.suspended) {
            connection.close();
            throw new TransportError(t('Connexion annulée.'));
        }
        const previous = this.connection;
        this.connection = connection;
        previous?.close();
        connection.onMessage(raw => {
            if (connection === this.connection) this.receive(raw as HostMessage);
        });
        connection.onClose(() => {
            if (connection !== this.connection) return;
            // Closed while saying hello: let connect() fail and retry; afterwards: connection lost
            if (this.welcomeListeners.length) this.welcomeListeners.slice().forEach(l => l(new TransportError(t('La connexion avec l\'hôte a été perdue.'))));
            else this.lost();
        });

        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => done(new TransportError(t('L\'hôte ne répond pas.'))), this.welcomeTimeoutMs);
            const done = (error?: Error) => {
                clearTimeout(timer);
                this.welcomeListeners = this.welcomeListeners.filter(l => l !== done);
                if (error) reject(error);
                else resolve();
            };
            this.welcomeListeners.push(done);
            this.lastSeen = Date.now();
            this.send({t: 'hello', v: PROTOCOL_VERSION, name: this.name, token: this.token, color: this.color, room: this.room ?? undefined});
        });
        this.attempts = 0;
        this.lostAt = 0;
        this.setStatus('online');
    }

    /**
     *  The host can't be reached: try again in a moment
     */
    private lost() {
        if (this.closed) return;
        const connection = this.connection;
        this.connection = null;
        connection?.close();
        if (this.status !== 'reconnecting') {
            this.lostAt = Date.now();
            this.attempts = 0;
            this.setStatus('reconnecting');
        }
        if (!this.suspended && !this.connecting) this.retry();
    }

    private retry(delay?: number) {
        clearTimeout(this.retryTimer);
        if (this.closed || this.suspended) return;
        if (Date.now() - this.lostAt > this.giveUpMs) {
            this.end(t('Impossible de retrouver la partie : l\'hôte ne revient pas.'));
            return;
        }
        const wait = delay ?? this.retryDelaysMs[Math.min(this.attempts, this.retryDelaysMs.length - 1)];
        this.retryTimer = setTimeout(() => this.attempt(), wait);
    }

    private async attempt() {
        if (this.closed || this.suspended || this.connecting) return;
        this.connecting = true;
        this.attempts++;
        let failure: unknown = null;
        try {
            await this.connect();
        } catch (e) {
            failure = e;
        } finally {
            this.connecting = false;
        }
        if (!failure) return;
        if (failure instanceof Refused) {
            this.end(failure.message);
            return;
        }
        const connection = this.connection;
        this.connection = null;
        connection?.close();
        this.retry();
    }

    private setStatus(status: ConnectionStatus) {
        if (this.status === status) return;
        this.status = status;
        this.events.emit({type: 'connection', status});
    }

    private send(message: ClientMessage) {
        this.connection?.send(message);
    }

    private receive(message: HostMessage) {
        if (this.closed || !message || typeof message !== 'object') return;
        this.lastSeen = Date.now();
        switch (message.t) {
            case 'welcome':
                this.seat = message.seat;
                if (typeof message.room === 'string') this.room = message.room;
                this.welcomeListeners.slice().forEach(l => l());
                break;
            case 'lobby':
                if (!message.lobby || typeof message.lobby !== 'object') break;
                // The host may be a stranger: rules out of range would break this screen
                this.lobby = {...message.lobby, settings: cleanSettings(message.lobby.settings)};
                this.seat = message.you;
                if (!message.lobby.started) this.state = null;
                this.events.emit({type: 'lobby'});
                break;
            case 'state':
                if (!message.state || typeof message.state !== 'object') break;
                this.state = {...message.state, settings: cleanSettings(message.state.settings)};
                this.events.emit({type: 'state'});
                break;
            case 'reveal':
                this.events.emit({type: 'reveal', card: message.card});
                break;
            case 'notice':
                this.events.emit({type: 'notice', notice: message.notice});
                break;
            case 'refused':
                if (this.welcomeListeners.length) this.welcomeListeners.slice().forEach(l => l(new Refused(t(message.reason))));
                else this.end(t(message.reason));
                break;
            case 'ended':
                this.end(t(message.reason));
                break;
            case 'ping':
                this.send({t: 'pong'});
                break;
            case 'chat':
                if (!message.message || this.chatLog.some(m => m.id === message.message.id)) break;
                if (isPublicCode(this.code) && message.message.text) break;
                this.chatLog.push(message.message);
                if (this.chatLog.length > CHAT_HISTORY) this.chatLog.shift();
                this.events.emit({type: 'chat', message: message.message});
                break;
            case 'chatLog':
                if (!Array.isArray(message.messages)) break;
                this.chatLog.splice(0, this.chatLog.length,
                    ...message.messages.slice(-CHAT_HISTORY).filter(m => !(isPublicCode(this.code) && m?.text)));
                if (this.chatLog.length) this.events.emit({type: 'chat', message: this.chatLog[this.chatLog.length - 1], history: true});
                break;
        }
    }

    private end(reason: string) {
        if (this.closed) return;
        this.leave();
        this.events.emit({type: 'closed', reason});
    }
    // endregion
}
