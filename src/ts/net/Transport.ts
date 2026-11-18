/**
 *  Transports carry JSON messages between the host's device and the other players.
 *  - PeerTransport: WebRTC through PeerJS, for real devices
 *  - BroadcastTransport: between tabs of the same browser (development and tests)
 */

export interface Connection {
    send(message: unknown): void;
    onMessage(listener: (message: unknown) => void): void;
    onClose(listener: () => void): void;
    close(): void;
}

export interface HostTransport {
    /** Room code the other players type to join */
    readonly code: string;
    onConnection(listener: (connection: Connection) => void): void;
    /** Page hidden for good (pagehide): free the room code so a reload of this page can take it back */
    suspend(): void;
    /** Page back (or woke up): make sure the room is reachable again, with the same code */
    resume(): void;
    /** End of the room */
    close(): void;
}

export interface TransportFactory {
    /** Open a room; a new code is drawn if none is given */
    host(code?: string): Promise<HostTransport>;
    /** Join the room `code` */
    join(code: string): Promise<Connection>;
}

/**
 *  Error shown to the player (bad code, network issue...)
 */
export class TransportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TransportError';
    }
}

/** No 0/O, 1/I: codes are read aloud and typed on phones */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(length = 5): string {
    let code = '';
    for (let i = 0; i < length; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return code;
}

export function normalizeCode(code: string): string {
    return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 *  Simple listener lists for connection implementations
 */
export class ConnectionBase {
    protected messageListeners: ((message: unknown) => void)[] = [];
    protected closeListeners: (() => void)[] = [];
    protected closed = false;

    public onMessage(listener: (message: unknown) => void) {
        this.messageListeners.push(listener);
    }

    public onClose(listener: () => void) {
        this.closeListeners.push(listener);
    }

    protected receive(message: unknown) {
        if (this.closed) return;
        for (const listener of this.messageListeners) listener(message);
    }

    protected closedByPeer() {
        if (this.closed) return;
        this.closed = true;
        for (const listener of this.closeListeners) listener();
    }
}
