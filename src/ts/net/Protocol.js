/**
 *  Messages between the host (who runs the engine) and the other players.
 *  Everything is plain JSON.
 */
export const PROTOCOL_VERSION = 1;
export const MAX_PLAYERS = 10;
export const MAX_NAME_LENGTH = 16;
export function cleanName(name, fallback) {
    const text = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH) : '';
    return text || fallback;
}
export function randomToken() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
