import {Connection, ConnectionBase, HostTransport, randomCode, TransportError, TransportFactory} from './Transport.js';

/**
 *  Transport between tabs of the same browser (BroadcastChannel).
 *  Used to try online games locally (`?transport=local`) and in the tests.
 *  Messages go through JSON like on a real network.
 */

type Packet =
    | { kind: 'ping' }
    | { kind: 'pong' }
    | { kind: 'open'; from: string }
    | { kind: 'opened'; to: string }
    | { kind: 'msg'; from: string; to: string; data: string }
    | { kind: 'close'; from: string; to: string }
    | { kind: 'host-closed' };

const HOST = 'host';

function channelName(code: string) {
    return `dutch-room-${code}`;
}

function randomId() {
    return Math.random().toString(36).slice(2, 10);
}

class BroadcastConnection extends ConnectionBase implements Connection {
    constructor(private readonly channel: BroadcastChannel, private readonly self: string, private readonly peer: string,
                private readonly onLocalClose: () => void = () => {}) {
        super();
    }

    public send(message: unknown) {
        if (this.closed) return;
        this.channel.postMessage({kind: 'msg', from: this.self, to: this.peer, data: JSON.stringify(message)} satisfies Packet);
    }

    public close() {
        if (this.closed) return;
        this.channel.postMessage({kind: 'close', from: this.self, to: this.peer} satisfies Packet);
        this.closed = true;
        this.onLocalClose();
    }

    public handle(packet: Packet) {
        if (packet.kind === 'msg') {
            this.receive(JSON.parse(packet.data));
        } else if ((packet.kind === 'close' || packet.kind === 'host-closed') && !this.closed) {
            this.closedByPeer();
            // Closed by the other side: release our end too (the channel of a player)
            this.onLocalClose();
        }
    }
}

class BroadcastHost implements HostTransport {
    private readonly connections = new Map<string, BroadcastConnection>();
    private listeners: ((connection: Connection) => void)[] = [];
    private suspended = false;

    constructor(public readonly code: string, private channel: BroadcastChannel) {
        channel.onmessage = (e: MessageEvent<Packet>) => this.handle(e.data);
    }

    public onConnection(listener: (connection: Connection) => void) {
        this.listeners.push(listener);
    }

    /** Like a page that goes away: every connection drops */
    public suspend() {
        if (this.suspended) return;
        this.suspended = true;
        this.channel.postMessage({kind: 'host-closed'} satisfies Packet);
        this.channel.close();
        this.connections.clear();
    }

    public resume() {
        if (!this.suspended) return;
        this.suspended = false;
        this.channel = new BroadcastChannel(channelName(this.code));
        this.channel.onmessage = (e: MessageEvent<Packet>) => this.handle(e.data);
    }

    public close() {
        if (this.suspended) return;
        this.suspended = true;
        this.channel.postMessage({kind: 'host-closed'} satisfies Packet);
        this.channel.close();
    }

    private handle(packet: Packet) {
        switch (packet.kind) {
            case 'ping':
                this.channel.postMessage({kind: 'pong'} satisfies Packet);
                break;
            case 'open': {
                const connection = new BroadcastConnection(this.channel, HOST, packet.from, () => this.connections.delete(packet.from));
                this.connections.set(packet.from, connection);
                this.channel.postMessage({kind: 'opened', to: packet.from} satisfies Packet);
                this.listeners.forEach(l => l(connection));
                break;
            }
            case 'msg':
            case 'close':
                if (packet.to !== HOST) return;
                this.connections.get(packet.from)?.handle(packet);
                if (packet.kind === 'close') this.connections.delete(packet.from);
                break;
        }
    }
}

export class BroadcastTransport implements TransportFactory {
    constructor(private readonly timeoutMs = 1500) {
    }

    public async host(code?: string): Promise<HostTransport> {
        for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = code ?? randomCode();
            const channel = new BroadcastChannel(channelName(candidate));
            if (!await this.someoneAnswers(channel)) return new BroadcastHost(candidate, channel);
            channel.close();
            if (code) throw new TransportError('Ce code de partie est déjà utilisé.');
        }
        throw new TransportError('Impossible de créer la partie.');
    }

    public join(code: string): Promise<Connection> {
        const channel = new BroadcastChannel(channelName(code));
        const self = randomId();
        const connection = new BroadcastConnection(channel, self, HOST, () => channel.close());
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                channel.close();
                reject(new TransportError(`Partie ${code} introuvable.`));
            }, this.timeoutMs);
            channel.onmessage = (e: MessageEvent<Packet>) => {
                const packet = e.data;
                if (packet.kind === 'opened' && packet.to === self) {
                    clearTimeout(timer);
                    resolve(connection);
                } else if ((packet.kind === 'msg' || packet.kind === 'close') && packet.to === self) {
                    connection.handle(packet);
                } else if (packet.kind === 'host-closed') {
                    connection.handle(packet);
                }
            };
            channel.postMessage({kind: 'open', from: self} satisfies Packet);
        });
    }

    /**
     *  Is there already a host on this channel?
     */
    private someoneAnswers(channel: BroadcastChannel): Promise<boolean> {
        return new Promise(resolve => {
            const timer = setTimeout(() => {
                channel.onmessage = null;
                resolve(false);
            }, 150);
            channel.onmessage = (e: MessageEvent<Packet>) => {
                if (e.data.kind === 'pong') {
                    clearTimeout(timer);
                    channel.onmessage = null;
                    resolve(true);
                }
            };
            channel.postMessage({kind: 'ping'} satisfies Packet);
        });
    }
}
