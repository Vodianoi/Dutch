import {Emitter, Session, SessionEvent} from '../Session.js';
import {Action, GameView} from '../View.js';
import {ClientMessage, HostMessage, LobbyState, PROTOCOL_VERSION} from './Protocol.js';
import {Connection, TransportError, TransportFactory} from './Transport.js';

export interface ClientOptions {
    /** Close the session when the host is silent for this long */
    timeoutMs?: number;
    /** Max time to wait for the host to accept us */
    welcomeTimeoutMs?: number;
}

/**
 *  Online game, player side: the engine runs on the host's device.
 *  This device only receives its own view and sends its actions.
 */
export class Client implements Session {
    public readonly isHost = false;
    public readonly canShowAll = false;
    public state: GameView | null = null;
    public lobby: LobbyState | null = null;
    public seat = -1;

    private readonly connection: Connection;
    private readonly events = new Emitter<SessionEvent>();
    private readonly watchdog: ReturnType<typeof setInterval>;
    private lastSeen = Date.now();
    private closed = false;

    private constructor(connection: Connection, timeoutMs: number) {
        this.connection = connection;
        connection.onMessage(raw => this.receive(raw as HostMessage));
        connection.onClose(() => this.end('La connexion avec l\'hôte a été perdue.'));
        this.watchdog = setInterval(() => {
            if (Date.now() - this.lastSeen > timeoutMs) this.end('L\'hôte ne répond plus.');
        }, 1000);
    }

    /**
     *  Join the room `code`. Resolves once the host gave us a seat.
     * @param token identifies this player if he has to reconnect
     */
    public static async join(transport: TransportFactory, code: string, name: string, token: string, options: ClientOptions = {}): Promise<Client> {
        const connection = await transport.join(code);
        const client = new Client(connection, options.timeoutMs ?? 15000);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => fail('L\'hôte ne répond pas.'), options.welcomeTimeoutMs ?? 10000);
            const off = client.on(event => {
                if (event.type === 'closed') fail(event.reason);
            });
            const fail = (reason: string) => {
                clearTimeout(timer);
                off();
                offWelcome();
                client.leave();
                reject(new TransportError(reason));
            };
            const offWelcome = client.onWelcome(() => {
                clearTimeout(timer);
                off();
                offWelcome();
                resolve(client);
            });
            client.send({t: 'hello', v: PROTOCOL_VERSION, name, token});
        });
    }

    public get viewerId(): number | null {
        return this.state?.viewerId ?? this.seat;
    }

    public on(listener: (event: SessionEvent) => void) {
        return this.events.on(listener);
    }

    public dispatch(action: Action) {
        if (this.closed) {
            this.events.emit({type: 'notice', notice: {text: 'Connexion perdue.', kind: 'error'}});
            return;
        }
        this.send({t: 'action', action});
    }

    public setShowAll() {
        // The cards of the other players never reach this device
    }

    public leave() {
        if (this.closed) return;
        this.closed = true;
        clearInterval(this.watchdog);
        this.connection.close();
    }

    // region Private
    private welcomeListeners: (() => void)[] = [];

    private onWelcome(listener: () => void) {
        this.welcomeListeners.push(listener);
        return () => {
            this.welcomeListeners = this.welcomeListeners.filter(l => l !== listener);
        };
    }

    private send(message: ClientMessage) {
        this.connection.send(message);
    }

    private receive(message: HostMessage) {
        if (this.closed || !message || typeof message !== 'object') return;
        this.lastSeen = Date.now();
        switch (message.t) {
            case 'welcome':
                this.seat = message.seat;
                this.welcomeListeners.slice().forEach(l => l());
                break;
            case 'lobby':
                this.lobby = message.lobby;
                this.seat = message.you;
                if (!message.lobby.started) this.state = null;
                this.events.emit({type: 'lobby'});
                break;
            case 'state':
                this.state = message.state;
                this.events.emit({type: 'state'});
                break;
            case 'reveal':
                this.events.emit({type: 'reveal', card: message.card});
                break;
            case 'notice':
                this.events.emit({type: 'notice', notice: message.notice});
                break;
            case 'refused':
                this.end(message.reason);
                break;
            case 'ping':
                this.send({t: 'pong'});
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
