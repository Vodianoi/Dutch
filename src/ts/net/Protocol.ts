import {GameSettings} from '../Settings.js';
import {Action, CardView, GameView, Notice} from '../View.js';

/**
 *  Messages between the host (who runs the engine) and the other players.
 *  Everything is plain JSON.
 */

/** 2: hands have empty places (null) */
export const PROTOCOL_VERSION = 2;

export interface LobbyPlayer {
    name: string;
    color: string;
    connected: boolean;
    /** Arrived during the game: plays from the next round */
    waiting?: boolean;
}

export interface LobbyState {
    code: string;
    players: LobbyPlayer[];
    started: boolean;
    /** Rules chosen by the host */
    settings: GameSettings;
}

/**
 *  What a room tells someone who knocks without joining (list of public games).
 *  Added without a new protocol version: older hosts don't answer, they are left out of the list.
 */
export interface RoomInfo {
    code: string;
    /** Version of the game of the host: a different one can't be joined */
    v: number;
    host: string;
    players: number;
    max: number;
    started: boolean;
    settings: GameSettings;
    /** A game in progress takes newcomers: they play from the next round */
    late?: boolean;
}

/**
 *  Chat line or emote of a player, as everybody receives it.
 *  Added without a new protocol version: older pages ignore these messages.
 */
export interface ChatMessage {
    /** Increases for every message of the room */
    id: number;
    seat: number;
    name: string;
    color: string;
    text?: string;
    emote?: string;
    at: number;
}

/** Emotes: reactions anybody can send in one tap */
export const EMOTES = ['👍', '😂', '😮', '😬', '😡', '🎉', '🤔', '😎', '🙏', '🔥'];
export const MAX_CHAT_LENGTH = 140;
/** Messages kept by the host and sent again to a player who comes back */
export const CHAT_HISTORY = 60;

export function cleanChatText(text: unknown): string {
    return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LENGTH) : '';
}

/** Host -> player */
export type HostMessage =
    /** `room`: id of this room, sent back by the player when he reconnects */
    | { t: 'welcome'; seat: number; room?: string }
    | { t: 'lobby'; lobby: LobbyState; you: number }
    | { t: 'state'; state: GameView }
    | { t: 'reveal'; card: CardView }
    | { t: 'notice'; notice: Notice }
    | { t: 'refused'; reason: string }
    /** The host ended the game on purpose: don't try to reconnect */
    | { t: 'ended'; reason: string }
    | { t: 'ping' }
    | { t: 'chat'; message: ChatMessage }
    /** Messages so far, sent to a player who arrives or comes back */
    | { t: 'chatLog'; messages: ChatMessage[] }
    /** Answer to someone who knocks (list of public games) */
    | { t: 'info'; room: RoomInfo };

/** Player -> host */
export type ClientMessage =
    /**
     *  `room`: the room the player was in. A public code can be taken by another game while its host is
     *  away: that other room refuses him instead of seating him as a stranger
     */
    | { t: 'hello'; v: number; name: string; token: string; color?: string; room?: string }
    /** Knock without joining: the host answers with its RoomInfo and hangs up */
    | { t: 'info' }
    | { t: 'action'; action: Action }
    | { t: 'pong' }
    | { t: 'chat'; text: string }
    | { t: 'emote'; emote: string };

export const MAX_PLAYERS = 10;
export const MAX_NAME_LENGTH = 16;

export function cleanName(name: unknown, fallback: string): string {
    const text = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH) : '';
    return text || fallback;
}

/**
 *  Secret that gives a player his seat back: 128 random bits from the browser's secure generator
 *  (Math.random can be guessed)
 */
export function randomToken(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
