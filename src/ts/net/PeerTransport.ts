import {Connection, ConnectionBase, HostTransport, randomCode, TransportError, TransportFactory} from './Transport.js';

/**
 *  WebRTC transport through PeerJS (https://peerjs.com).
 *  - The library is loaded from a CDN only when an online game starts
 *  - The free public PeerJS server is only used to introduce the devices to each other,
 *    the game messages then go directly between the browsers
 */

const PEERJS_URL = 'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js';
/** Prefix of the peer ids on the public server, so room codes don't collide with other apps */
const ID_PREFIX = 'vodianoi-dutch-';
const CONNECT_TIMEOUT_MS = 15000;

// region Minimal PeerJS typings
interface PeerError extends Error {
    type: string;
}

interface DataConnection {
    open: boolean;
    send(data: unknown): void;
    close(): void;
    on(event: 'open' | 'close', listener: () => void): void;
    on(event: 'data', listener: (data: unknown) => void): void;
    on(event: 'error', listener: (error: PeerError) => void): void;
}

interface PeerInstance {
    destroyed: boolean;
    disconnected: boolean;
    connect(id: string, options?: { reliable?: boolean; serialization?: string; metadata?: unknown }): DataConnection;
    reconnect(): void;
    destroy(): void;
    on(event: 'open', listener: (id: string) => void): void;
    on(event: 'connection', listener: (connection: DataConnection) => void): void;
    on(event: 'disconnected' | 'close', listener: () => void): void;
    on(event: 'error', listener: (error: PeerError) => void): void;
}

type PeerConstructor = new (id?: string, options?: { debug?: number }) => PeerInstance;
// endregion

let peerLibrary: Promise<PeerConstructor> | null = null;

/**
 *  Load the PeerJS library once
 */
function loadPeerJs(): Promise<PeerConstructor> {
    const find = () => {
        const w = window as unknown as { Peer?: PeerConstructor; peerjs?: { Peer?: PeerConstructor } };
        return w.Peer ?? w.peerjs?.Peer;
    };
    if (!peerLibrary) {
        peerLibrary = new Promise((resolve, reject) => {
            const existing = find();
            if (existing) return resolve(existing);
            const script = document.createElement('script');
            script.src = PEERJS_URL;
            script.async = true;
            script.onload = () => {
                const ctor = find();
                if (ctor) resolve(ctor);
                else reject(new TransportError('Bibliothèque PeerJS invalide.'));
            };
            script.onerror = () => {
                peerLibrary = null;
                reject(new TransportError('Impossible de charger PeerJS : vérifiez votre connexion internet.'));
            };
            document.head.appendChild(script);
        });
    }
    return peerLibrary;
}

function describe(error: PeerError, code: string): TransportError {
    switch (error.type) {
        case 'peer-unavailable': return new TransportError(`Partie ${code} introuvable. Vérifiez le code.`);
        case 'unavailable-id': return new TransportError('Ce code de partie est déjà utilisé.');
        case 'browser-incompatible': return new TransportError('Ce navigateur ne permet pas de jouer en ligne (WebRTC).');
        case 'network':
        case 'server-error':
        case 'socket-error':
        case 'socket-closed': return new TransportError('Connexion au serveur de mise en relation impossible.');
        default: return new TransportError(`Erreur réseau (${error.type}).`);
    }
}

class PeerConnection extends ConnectionBase implements Connection {
    constructor(private readonly connection: DataConnection, private readonly onLocalClose: () => void = () => {}) {
        super();
        connection.on('data', data => this.receive(data));
        connection.on('close', () => this.closedByPeer());
        connection.on('error', () => this.closedByPeer());
    }

    public send(message: unknown) {
        if (!this.closed && this.connection.open) this.connection.send(message);
    }

    public close() {
        if (this.closed) return;
        this.closed = true;
        this.connection.close();
        this.onLocalClose();
    }

    /** The peer object itself failed (network lost) */
    public lost() {
        this.closedByPeer();
    }
}

class PeerHost implements HostTransport {
    private listeners: ((connection: Connection) => void)[] = [];

    constructor(public readonly code: string, private readonly peer: PeerInstance) {
        peer.on('connection', dataConnection => {
            const accept = () => {
                const connection = new PeerConnection(dataConnection);
                this.listeners.forEach(l => l(connection));
            };
            if (dataConnection.open) accept();
            else dataConnection.on('open', accept);
        });
        // Losing the public server doesn't cut the games in progress, but new players
        // can't join anymore: reconnect to it
        peer.on('disconnected', () => {
            if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.disconnected && peer.reconnect(), 1000);
        });
    }

    public onConnection(listener: (connection: Connection) => void) {
        this.listeners.push(listener);
    }

    public close() {
        this.peer.destroy();
    }
}

export class PeerTransport implements TransportFactory {
    public async host(code?: string): Promise<HostTransport> {
        const Peer = await loadPeerJs();
        for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = code ?? randomCode();
            try {
                const peer = await new Promise<PeerInstance>((resolve, reject) => {
                    const peer = new Peer(ID_PREFIX + candidate, {debug: 1});
                    const timer = setTimeout(() => {
                        peer.destroy();
                        reject(new TransportError('Le serveur de mise en relation ne répond pas.'));
                    }, CONNECT_TIMEOUT_MS);
                    peer.on('open', () => {
                        clearTimeout(timer);
                        resolve(peer);
                    });
                    peer.on('error', error => {
                        clearTimeout(timer);
                        peer.destroy();
                        reject(Object.assign(describe(error, candidate), {type: error.type}));
                    });
                });
                return new PeerHost(candidate, peer);
            } catch (e) {
                const taken = (e as { type?: string }).type === 'unavailable-id';
                if (!taken || code) throw e;
            }
        }
        throw new TransportError('Impossible de créer la partie.');
    }

    public async join(code: string): Promise<Connection> {
        const Peer = await loadPeerJs();
        return new Promise((resolve, reject) => {
            const peer = new Peer(undefined, {debug: 1});
            let connection: PeerConnection | null = null;
            const fail = (error: TransportError) => {
                clearTimeout(timer);
                peer.destroy();
                reject(error);
            };
            const timer = setTimeout(() => fail(new TransportError('La connexion à la partie a échoué (délai dépassé).')), CONNECT_TIMEOUT_MS);
            peer.on('error', error => {
                if (connection) connection.lost();
                else fail(describe(error, code));
            });
            peer.on('open', () => {
                const dataConnection = peer.connect(ID_PREFIX + code, {reliable: true, serialization: 'json'});
                dataConnection.on('open', () => {
                    clearTimeout(timer);
                    connection = new PeerConnection(dataConnection, () => peer.destroy());
                    connection.onClose(() => peer.destroy());
                    resolve(connection);
                });
            });
        });
    }
}
