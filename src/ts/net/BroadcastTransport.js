import { t } from '../i18n.js';
import { scoped } from '../env.js';
import { ConnectionBase, randomCode, TransportError } from './Transport.js';
const HOST = 'host';
function channelName(code) {
    return scoped(`room-${code}`);
}
function randomId() {
    return Math.random().toString(36).slice(2, 10);
}
class BroadcastConnection extends ConnectionBase {
    constructor(channel, self, peer, onLocalClose = () => { }) {
        super();
        this.channel = channel;
        this.self = self;
        this.peer = peer;
        this.onLocalClose = onLocalClose;
    }
    send(message) {
        if (this.closed)
            return;
        this.channel.postMessage({ kind: 'msg', from: this.self, to: this.peer, data: JSON.stringify(message) });
    }
    close() {
        if (this.closed)
            return;
        try {
            this.channel.postMessage({ kind: 'close', from: this.self, to: this.peer });
        }
        catch {
            // The room is already closed: nobody to tell
        }
        this.closed = true;
        this.onLocalClose();
    }
    handle(packet) {
        if (packet.kind === 'msg') {
            this.receive(JSON.parse(packet.data));
        }
        else if ((packet.kind === 'close' || packet.kind === 'host-closed') && !this.closed) {
            this.closedByPeer();
            // Closed by the other side: release our end too (the channel of a player)
            this.onLocalClose();
        }
    }
}
class BroadcastHost {
    constructor(code, channel) {
        this.code = code;
        this.channel = channel;
        this.connections = new Map();
        this.listeners = [];
        this.suspended = false;
        channel.onmessage = (e) => this.handle(e.data);
    }
    onConnection(listener) {
        this.listeners.push(listener);
    }
    /** Like a page that goes away: every connection drops */
    suspend() {
        if (this.suspended)
            return;
        this.suspended = true;
        this.channel.postMessage({ kind: 'host-closed' });
        this.channel.close();
        this.connections.clear();
    }
    resume() {
        if (!this.suspended)
            return;
        this.suspended = false;
        this.channel = new BroadcastChannel(channelName(this.code));
        this.channel.onmessage = (e) => this.handle(e.data);
    }
    close() {
        if (this.suspended)
            return;
        this.suspended = true;
        this.channel.postMessage({ kind: 'host-closed' });
        this.channel.close();
    }
    handle(packet) {
        switch (packet.kind) {
            case 'ping':
                this.channel.postMessage({ kind: 'pong' });
                break;
            case 'open': {
                const connection = new BroadcastConnection(this.channel, HOST, packet.from, () => this.connections.delete(packet.from));
                this.connections.set(packet.from, connection);
                this.channel.postMessage({ kind: 'opened', to: packet.from });
                this.listeners.forEach(l => l(connection));
                break;
            }
            case 'msg':
            case 'close':
                if (packet.to !== HOST)
                    return;
                this.connections.get(packet.from)?.handle(packet);
                if (packet.kind === 'close')
                    this.connections.delete(packet.from);
                break;
        }
    }
}
export class BroadcastTransport {
    constructor(timeoutMs = 1500) {
        this.timeoutMs = timeoutMs;
    }
    async host(code) {
        for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = code ?? randomCode();
            const channel = new BroadcastChannel(channelName(candidate));
            if (!await this.someoneAnswers(channel))
                return new BroadcastHost(candidate, channel);
            channel.close();
            if (code)
                throw new TransportError(t('Ce code de partie est déjà utilisé.'));
        }
        throw new TransportError(t('Impossible de créer la partie.'));
    }
    async hostFirstFree(codes) {
        for (const code of codes) {
            const channel = new BroadcastChannel(channelName(code));
            if (!await this.someoneAnswers(channel))
                return new BroadcastHost(code, channel);
            channel.close();
        }
        throw new TransportError(t('Toutes les places de parties publiques sont prises : réessayez plus tard.'));
    }
    async ask(codes, question, timeoutMs) {
        const answers = new Map();
        await Promise.all(codes.map(code => new Promise(resolve => {
            const timer = setTimeout(() => resolve(), timeoutMs);
            this.join(code, Math.min(timeoutMs, 400)).then(connection => {
                connection.onMessage(answer => {
                    if (answers.has(code))
                        return;
                    answers.set(code, answer);
                    connection.close();
                    clearTimeout(timer);
                    resolve();
                });
                connection.send(question);
            }, () => {
                clearTimeout(timer);
                resolve();
            });
        })));
        return answers;
    }
    join(code, timeoutMs = this.timeoutMs) {
        const channel = new BroadcastChannel(channelName(code));
        const self = randomId();
        const connection = new BroadcastConnection(channel, self, HOST, () => channel.close());
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                channel.close();
                reject(new TransportError(t('Partie {code} introuvable.', { code })));
            }, timeoutMs);
            channel.onmessage = (e) => {
                const packet = e.data;
                if (packet.kind === 'opened' && packet.to === self) {
                    clearTimeout(timer);
                    resolve(connection);
                }
                else if ((packet.kind === 'msg' || packet.kind === 'close') && packet.to === self) {
                    connection.handle(packet);
                }
                else if (packet.kind === 'host-closed') {
                    connection.handle(packet);
                }
            };
            channel.postMessage({ kind: 'open', from: self });
        });
    }
    /**
     *  Is there already a host on this channel?
     */
    someoneAnswers(channel) {
        return new Promise(resolve => {
            const timer = setTimeout(() => {
                channel.onmessage = null;
                resolve(false);
            }, 150);
            channel.onmessage = (e) => {
                if (e.data.kind === 'pong') {
                    clearTimeout(timer);
                    channel.onmessage = null;
                    resolve(true);
                }
            };
            channel.postMessage({ kind: 'ping' });
        });
    }
}
