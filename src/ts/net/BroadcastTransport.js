import { ConnectionBase, randomCode, TransportError } from './Transport.js';
const HOST = 'host';
function channelName(code) {
    return `dutch-room-${code}`;
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
        this.channel.postMessage({ kind: 'close', from: this.self, to: this.peer });
        this.closed = true;
        this.onLocalClose();
    }
    handle(packet) {
        if (packet.kind === 'msg')
            this.receive(JSON.parse(packet.data));
        else if (packet.kind === 'close' || packet.kind === 'host-closed')
            this.closedByPeer();
    }
}
class BroadcastHost {
    constructor(code, channel) {
        this.code = code;
        this.channel = channel;
        this.connections = new Map();
        this.listeners = [];
        channel.onmessage = (e) => this.handle(e.data);
    }
    onConnection(listener) {
        this.listeners.push(listener);
    }
    close() {
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
                throw new TransportError('Ce code de partie est déjà utilisé.');
        }
        throw new TransportError('Impossible de créer la partie.');
    }
    join(code) {
        const channel = new BroadcastChannel(channelName(code));
        const self = randomId();
        const connection = new BroadcastConnection(channel, self, HOST, () => channel.close());
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                channel.close();
                reject(new TransportError(`Partie ${code} introuvable.`));
            }, this.timeoutMs);
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
