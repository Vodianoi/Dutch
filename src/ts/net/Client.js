import { Emitter } from '../Session.js';
import { PROTOCOL_VERSION } from './Protocol.js';
import { TransportError } from './Transport.js';
/**
 *  Online game, player side: the engine runs on the host's device.
 *  This device only receives its own view and sends its actions.
 */
export class Client {
    constructor(connection, timeoutMs) {
        this.isHost = false;
        this.canShowAll = false;
        this.state = null;
        this.lobby = null;
        this.seat = -1;
        this.events = new Emitter();
        this.lastSeen = Date.now();
        this.closed = false;
        // region Private
        this.welcomeListeners = [];
        this.connection = connection;
        connection.onMessage(raw => this.receive(raw));
        connection.onClose(() => this.end('La connexion avec l\'hôte a été perdue.'));
        this.watchdog = setInterval(() => {
            if (Date.now() - this.lastSeen > timeoutMs)
                this.end('L\'hôte ne répond plus.');
        }, 1000);
    }
    /**
     *  Join the room `code`. Resolves once the host gave us a seat.
     * @param token identifies this player if he has to reconnect
     */
    static async join(transport, code, name, token, options = {}) {
        const connection = await transport.join(code);
        const client = new Client(connection, options.timeoutMs ?? 15000);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => fail('L\'hôte ne répond pas.'), options.welcomeTimeoutMs ?? 10000);
            const off = client.on(event => {
                if (event.type === 'closed')
                    fail(event.reason);
            });
            const fail = (reason) => {
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
            client.send({ t: 'hello', v: PROTOCOL_VERSION, name, token });
        });
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
        this.send({ t: 'action', action });
    }
    setShowAll() {
        // The cards of the other players never reach this device
    }
    leave() {
        if (this.closed)
            return;
        this.closed = true;
        clearInterval(this.watchdog);
        this.connection.close();
    }
    onWelcome(listener) {
        this.welcomeListeners.push(listener);
        return () => {
            this.welcomeListeners = this.welcomeListeners.filter(l => l !== listener);
        };
    }
    send(message) {
        this.connection.send(message);
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
