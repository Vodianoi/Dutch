/**
 *  Messages between the host (who runs the engine) and the other players.
 *  Everything is plain JSON.
 */
/** 2: hands have empty places (null) */
export const PROTOCOL_VERSION = 2;
/** Emotes: reactions anybody can send in one tap */
export const EMOTES = ['👍', '😂', '😮', '😬', '😡', '🎉', '🤔', '😎', '🙏', '🔥'];
export const MAX_CHAT_LENGTH = 140;
/** Messages kept by the host and sent again to a player who comes back */
export const CHAT_HISTORY = 60;
export function cleanChatText(text) {
    return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LENGTH) : '';
}
export const MAX_PLAYERS = 10;
export const MAX_NAME_LENGTH = 16;
export function cleanName(name, fallback) {
    const text = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH) : '';
    return text || fallback;
}
export function randomToken() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
