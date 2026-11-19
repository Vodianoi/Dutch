import {t} from '../i18n.js';
import {IS_DEV} from '../env.js';
import {Connection, ConnectionBase, HostTransport, randomCode, TransportError, TransportFactory} from './Transport.js';

/**
 *  WebRTC transport through PeerJS (https://peerjs.com).
 *  - The library is loaded from a CDN only when an online game starts
 *  - The free public PeerJS server is only used to introduce the devices to each other,
 *    the game messages then go directly between the browsers
 */

const PEERJS_URL = 'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js';
/** Hash of that exact file: a changed copy on the CDN is refused by the browser */
const PEERJS_INTEGRITY = 'sha384-x0YgkOr/3UOZP2CRDxGW9e0Q+2Qjyr3uJrm4xU32Y7ZCNAo7Cc7bjhrZMi/dwczu';
/** Prefix of the peer ids on the public server, so room codes don't collide with other apps */
const ID_PREFIX = IS_DEV ? 'vodianoi-dutch-dev-' : 'vodianoi-dutch-';
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
            script.integrity = PEERJS_INTEGRITY;
            script.crossOrigin = 'anonymous';
            script.async = true;
            script.onload = () => {
                const ctor = find();
                if (ctor) resolve(ctor);
                else reject(new TransportError(t('Bibliothèque PeerJS invalide.')));
            };
            script.onerror = () => {
                peerLibrary = null;
                reject(new TransportError(t('Impossible de charger PeerJS : vérifiez votre connexion internet.')));
            };
            document.head.appendChild(script);
        });
    }
    return peerLibrary;
}

function describe(error: PeerError, code: string): TransportError {
    switch (error.type) {
        case 'peer-unavailable': return new TransportError(t('Partie {code} introuvable. Vérifiez le code.', {code}));
        case 'unavailable-id': return new TransportError(t('Ce code de partie est déjà utilisé.'));
        case 'browser-incompatible': return new TransportError(t('Ce navigateur ne permet pas de jouer en ligne (WebRTC).'));
        case 'network':
        case 'server-error':
        case 'socket-error':
        case 'socket-closed': return new TransportError(t('Connexion au serveur de mise en relation impossible.'));
        default: return new TransportError(t('Erreur réseau ({type}).', {type: error.type}));
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

}

/**
 *  Register `id` on the public server.
 *  Errors only reject while opening: once open, the caller decides what to do with them
 *  (a phone going to sleep gives "network" errors that must not end the game).
 */
function openPeer(Peer: PeerConstructor, id: string, code: string): Promise<PeerInstance> {
    return new Promise((resolve, reject) => {
        const peer = new Peer(id, {debug: 1});
        let open = false;
        const timer = setTimeout(() => {
            peer.destroy();
            reject(new TransportError(t('Le serveur de mise en relation ne répond pas.')));
        }, CONNECT_TIMEOUT_MS);
        peer.on('open', () => {
            open = true;
            clearTimeout(timer);
            resolve(peer);
        });
        peer.on('error', error => {
            if (open) return;
            clearTimeout(timer);
            peer.destroy();
            reject(Object.assign(describe(error, code), {type: error.type}));
        });
    });
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** After a reload, the server can keep the old registration of the room code for a few seconds */
const RECLAIM_ATTEMPTS = 12;
const RECLAIM_DELAY_MS = 2500;
/** How often the host checks that it is still registered on the public server */
const WATCH_MS = 5000;

/**
 *  Open `code`, waiting while the server still holds it for our previous page
 */
async function reclaim(Peer: PeerConstructor, code: string): Promise<PeerInstance> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await openPeer(Peer, ID_PREFIX + code, code);
        } catch (e) {
            const taken = (e as { type?: string }).type === 'unavailable-id';
            const network = ['network', 'server-error', 'socket-error', 'socket-closed'].includes((e as { type?: string }).type ?? '');
            if ((!taken && !network) || attempt >= RECLAIM_ATTEMPTS - 1) throw e;
            await wait(RECLAIM_DELAY_MS);
        }
    }
}

/**
 *  Room on the public server. It survives the network hiccups of a phone:
 *  - disconnected from the server (sleep, network change): reconnect, the games in progress go on
 *  - peer destroyed (fatal error, page suspended): open the same code again
 */
class PeerHost implements HostTransport {
    private listeners: ((connection: Connection) => void)[] = [];
    private peer: PeerInstance;
    private closed = false;
    private suspended = false;
    private reviving = false;
    private readonly watch: ReturnType<typeof setInterval>;

    constructor(public readonly code: string, peer: PeerInstance, private readonly Peer: PeerConstructor) {
        this.peer = peer;
        this.attach(peer);
        this.watch = setInterval(() => this.check(), WATCH_MS);
    }

    public onConnection(listener: (connection: Connection) => void) {
        this.listeners.push(listener);
    }

    public suspend() {
        if (this.closed) return;
        this.suspended = true;
        this.peer.destroy();
    }

    public resume() {
        if (this.closed) return;
        this.suspended = false;
        this.check();
    }

    public close() {
        this.closed = true;
        clearInterval(this.watch);
        this.peer.destroy();
    }

    private attach(peer: PeerInstance) {
        peer.on('connection', dataConnection => {
            if (peer !== this.peer) return;
            const accept = () => {
                const connection = new PeerConnection(dataConnection);
                this.listeners.forEach(l => l(connection));
            };
            if (dataConnection.open) accept();
            else dataConnection.on('open', accept);
        });
        // Losing the public server doesn't cut the games in progress, but new players
        // (and players coming back) can't reach us: reconnect to it
        peer.on('disconnected', () => setTimeout(() => this.check(), 1000));
        peer.on('close', () => setTimeout(() => this.check(), 1000));
        // Errors after opening are not fatal by themselves: check() repairs what needs to be
        peer.on('error', () => setTimeout(() => this.check(), 1000));
    }

    private check() {
        if (this.closed || this.suspended || this.reviving) return;
        if (this.peer.destroyed) {
            this.revive();
        } else if (this.peer.disconnected) {
            try {
                this.peer.reconnect();
            } catch {
                this.peer.destroy();
                this.revive();
            }
        }
    }

    private async revive() {
        this.reviving = true;
        try {
            const peer = await reclaim(this.Peer, this.code);
            if (this.closed || this.suspended) {
                peer.destroy();
                return;
            }
            this.peer = peer;
            this.attach(peer);
        } catch (e) {
            console.warn('Dutch: the room could not be opened again, retrying', e);
        } finally {
            this.reviving = false;
        }
    }
}

export class PeerTransport implements TransportFactory {
    public async host(code?: string): Promise<HostTransport> {
        const Peer = await loadPeerJs();
        // Given code: the room is being reopened (page reloaded), wait for the server to free it
        if (code) return new PeerHost(code, await reclaim(Peer, code), Peer);
        for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = randomCode();
            try {
                return new PeerHost(candidate, await openPeer(Peer, ID_PREFIX + candidate, candidate), Peer);
            } catch (e) {
                if ((e as { type?: string }).type !== 'unavailable-id') throw e;
            }
        }
        throw new TransportError(t('Impossible de créer la partie.'));
    }

    public async hostFirstFree(codes: string[]): Promise<HostTransport> {
        const Peer = await loadPeerJs();
        for (const code of codes) {
            try {
                return new PeerHost(code, await openPeer(Peer, ID_PREFIX + code, code), Peer);
            } catch (e) {
                if ((e as { type?: string }).type !== 'unavailable-id') throw e;
            }
        }
        throw new TransportError(t('Toutes les places de parties publiques sont prises : réessayez plus tard.'));
    }

    /**
     *  One peer knocks on every room: the server answers « peer-unavailable » at once for an empty room,
     *  a room that is there gets the question and answers
     */
    public async ask(codes: string[], question: unknown, timeoutMs: number): Promise<Map<string, unknown>> {
        const Peer = await loadPeerJs();
        const answers = new Map<string, unknown>();
        return new Promise(resolve => {
            const peer = new Peer(undefined, {debug: 0});
            const pending = new Set(codes);
            const connections: DataConnection[] = [];
            const finish = () => {
                clearTimeout(timer);
                connections.forEach(c => c.close());
                peer.destroy();
                resolve(answers);
            };
            const done = (code: string) => {
                pending.delete(code);
                if (!pending.size) finish();
            };
            const timer = setTimeout(finish, timeoutMs);
            peer.on('error', error => {
                if (error.type === 'peer-unavailable') {
                    // « Could not connect to peer vodianoi-dutch-PUB03 »
                    const code = codes.find(c => error.message.endsWith(ID_PREFIX + c));
                    if (code) done(code);
                } else if (!['network', 'disconnected'].includes(error.type)) {
                    finish();
                }
            });
            peer.on('open', () => {
                for (const code of codes) {
                    const connection = peer.connect(ID_PREFIX + code, {reliable: true, serialization: 'json'});
                    connections.push(connection);
                    connection.on('open', () => connection.send(question));
                    connection.on('data', data => {
                        if (!pending.has(code)) return;
                        answers.set(code, data);
                        connection.close();
                        done(code);
                    });
                    connection.on('error', () => done(code));
                }
            });
        });
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
            const timer = setTimeout(() => fail(new TransportError(t('La connexion à la partie a échoué (délai dépassé).'))), CONNECT_TIMEOUT_MS);
            peer.on('error', error => {
                // Once connected, the game goes directly between the devices: a problem with the
                // public server doesn't matter. A dead connection is seen by the heartbeat.
                if (!connection) fail(describe(error, code));
            });
            peer.on('open', () => {
                const dataConnection = peer.connect(ID_PREFIX + code, {reliable: true, serialization: 'json'});
                dataConnection.on('open', () => {
                    if (connection) return;
                    clearTimeout(timer);
                    connection = new PeerConnection(dataConnection, () => peer.destroy());
                    connection.onClose(() => peer.destroy());
                    resolve(connection);
                });
            });
        });
    }
}
