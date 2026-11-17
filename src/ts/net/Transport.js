/**
 *  Transports carry JSON messages between the host's device and the other players.
 *  - PeerTransport: WebRTC through PeerJS, for real devices
 *  - BroadcastTransport: between tabs of the same browser (development and tests)
 */
/**
 *  Error shown to the player (bad code, network issue...)
 */
export class TransportError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TransportError';
    }
}
/** No 0/O, 1/I: codes are read aloud and typed on phones */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(length = 5) {
    let code = '';
    for (let i = 0; i < length; i++)
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return code;
}
export function normalizeCode(code) {
    return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
/**
 *  Simple listener lists for connection implementations
 */
export class ConnectionBase {
    constructor() {
        this.messageListeners = [];
        this.closeListeners = [];
        this.closed = false;
    }
    onMessage(listener) {
        this.messageListeners.push(listener);
    }
    onClose(listener) {
        this.closeListeners.push(listener);
    }
    receive(message) {
        if (this.closed)
            return;
        for (const listener of this.messageListeners)
            listener(message);
    }
    closedByPeer() {
        if (this.closed)
            return;
        this.closed = true;
        for (const listener of this.closeListeners)
            listener();
    }
}
