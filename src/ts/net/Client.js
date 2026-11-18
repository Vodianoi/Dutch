import { Emitter } from '../Session.js';
import { PROTOCOL_VERSION } from './Protocol.js';
import { TransportError } from './Transport.js';
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
export class Client {
    constructor(transport, code, name, token, options) {
        this.isHost = false;
        this.canShowAll = false;
        this.state = null;
        this.lobby = null;
        this.seat = -1;
        this.status = 'online';
        this.events = new Emitter();
        this.connection = null;
        this.lastSeen = Date.now();
        this.closed = false;
        /** Reconnection in progress: when it started, attempts made, next attempt */
        this.lostAt = 0;
        this.attempts = 0;
        this.connecting = false;
        /** The page is hidden for good (pagehide): wait for it to come back before reconnecting */
        this.suspended = false;
        this.welcomeListeners = [];
        this.transport = transport;
        this.code = code;
        this.name = name;
        this.token = token;
        this.timeoutMs = options.timeoutMs ?? 15000;
        this.welcomeTimeoutMs = options.welcomeTimeoutMs ?? 10000;
        this.retryDelaysMs = options.retryDelaysMs ?? [0, 1000, 2000, 4000, 8000];
        this.giveUpMs = options.giveUpMs ?? 10 * 60 * 1000;
        this.color = options.color;
        this.watchdog = setInterval(() => {
            // Also true when this page was asleep: the connection is probably dead, check right away
            if (this.status === 'online' && Date.now() - this.lastSeen > this.timeoutMs)
                this.lost();
        }, 1000);
    }
    /**
     *  Join the room `code`. Resolves once the host gave us a seat.
     * @param token identifies this player if he has to reconnect
     */
    static async join(transport, code, name, token, options = {}) {
        const client = new Client(transport, code, name, token, options);
        try {
            await client.connect();
        }
        catch (e) {
            client.leave();
            throw e;
        }
        return client;
    }
    get viewerId() {
        return this.state?.viewerId ?? this.seat;
    }
    on(listener) {
        return this.events.on(listener);
    }
    dispatch(action) {
        if (this.closed) {
            this.events.emit({ type: 'notice', notice: { text: 'Connexion perdue.', kind: 'error' } });
            return;
        }
        if (this.status !== 'online') {
            this.events.emit({ type: 'notice', notice: { text: 'Reconnexion en cours… réessayez dans un instant.', kind: 'error' } });
            return;
        }
        this.send({ t: 'action', action });
    }
    setShowAll() {
        // The cards of the other players never reach this device
    }
    /**
     *  The page goes away (pagehide): close the connection so the host knows right away,
     *  and wait for resume() (page restored from the back/forward cache) to reconnect
     */
    suspend() {
        if (this.closed)
            return;
        this.suspended = true;
        clearTimeout(this.retryTimer);
        const connection = this.connection;
        this.connection = null;
        connection?.close();
        if (!this.lostAt)
            this.lostAt = Date.now();
        this.setStatus('reconnecting');
    }
    /**
     *  The page is visible again: reconnect now if the connection was lost or looks dead
     */
    resume() {
        if (this.closed)
            return;
        this.suspended = false;
        if (this.status === 'online' && Date.now() - this.lastSeen > Math.min(this.timeoutMs, 6000))
            this.lost();
        if (this.status === 'reconnecting' && !this.connecting) {
            this.attempts = 0;
            this.lostAt = Date.now();
            this.retry(0);
        }
    }
    /**
     *  Leave the game for good
     */
    leave() {
        if (this.closed)
            return;
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
    async connect() {
        const connection = await this.transport.join(this.code);
        if (this.closed || this.suspended) {
            connection.close();
            throw new TransportError('Connexion annulée.');
        }
        const previous = this.connection;
        this.connection = connection;
        previous?.close();
        connection.onMessage(raw => {
            if (connection === this.connection)
                this.receive(raw);
        });
        connection.onClose(() => {
            if (connection !== this.connection)
                return;
            // Closed while saying hello: let connect() fail and retry; afterwards: connection lost
            if (this.welcomeListeners.length)
                this.welcomeListeners.slice().forEach(l => l(new TransportError('La connexion avec l\'hôte a été perdue.')));
            else
                this.lost();
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => done(new TransportError('L\'hôte ne répond pas.')), this.welcomeTimeoutMs);
            const done = (error) => {
                clearTimeout(timer);
                this.welcomeListeners = this.welcomeListeners.filter(l => l !== done);
                if (error)
                    reject(error);
                else
                    resolve();
            };
            this.welcomeListeners.push(done);
            this.lastSeen = Date.now();
            this.send({ t: 'hello', v: PROTOCOL_VERSION, name: this.name, token: this.token, color: this.color });
        });
        this.attempts = 0;
        this.lostAt = 0;
        this.setStatus('online');
    }
    /**
     *  The host can't be reached: try again in a moment
     */
    lost() {
        if (this.closed)
            return;
        const connection = this.connection;
        this.connection = null;
        connection?.close();
        if (this.status !== 'reconnecting') {
            this.lostAt = Date.now();
            this.attempts = 0;
            this.setStatus('reconnecting');
        }
        if (!this.suspended && !this.connecting)
            this.retry();
    }
    retry(delay) {
        clearTimeout(this.retryTimer);
        if (this.closed || this.suspended)
            return;
        if (Date.now() - this.lostAt > this.giveUpMs) {
            this.end('Impossible de retrouver la partie : l\'hôte ne revient pas.');
            return;
        }
        const wait = delay ?? this.retryDelaysMs[Math.min(this.attempts, this.retryDelaysMs.length - 1)];
        this.retryTimer = setTimeout(() => this.attempt(), wait);
    }
    async attempt() {
        if (this.closed || this.suspended || this.connecting)
            return;
        this.connecting = true;
        this.attempts++;
        let failure = null;
        try {
            await this.connect();
        }
        catch (e) {
            failure = e;
        }
        finally {
            this.connecting = false;
        }
        if (!failure)
            return;
        if (failure instanceof Refused) {
            this.end(failure.message);
            return;
        }
        const connection = this.connection;
        this.connection = null;
        connection?.close();
        this.retry();
    }
    setStatus(status) {
        if (this.status === status)
            return;
        this.status = status;
        this.events.emit({ type: 'connection', status });
    }
    send(message) {
        this.connection?.send(message);
    }
    receive(message) {
        if (this.closed || !message || typeof message !== 'object')
            return;
        this.lastSeen = Date.now();
        switch (message.t) {
            case 'welcome':
                this.seat = message.seat;
                this.welcomeListeners.slice().forEach(l => l());
                break;
            case 'lobby':
                this.lobby = message.lobby;
                this.seat = message.you;
                if (!message.lobby.started)
                    this.state = null;
                this.events.emit({ type: 'lobby' });
                break;
            case 'state':
                this.state = message.state;
                this.events.emit({ type: 'state' });
                break;
            case 'reveal':
                this.events.emit({ type: 'reveal', card: message.card });
                break;
            case 'notice':
                this.events.emit({ type: 'notice', notice: message.notice });
                break;
            case 'refused':
                if (this.welcomeListeners.length)
                    this.welcomeListeners.slice().forEach(l => l(new Refused(message.reason)));
                else
                    this.end(message.reason);
                break;
            case 'ended':
                this.end(message.reason);
                break;
            case 'ping':
                this.send({ t: 'pong' });
                break;
        }
    }
    end(reason) {
        if (this.closed)
            return;
        this.leave();
        this.events.emit({ type: 'closed', reason });
    }
}
