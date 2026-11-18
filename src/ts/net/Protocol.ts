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
}

export interface LobbyState {
    code: string;
    players: LobbyPlayer[];
    started: boolean;
    /** Rules chosen by the host */
    settings: GameSettings;
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
/** Ready-made sentences, for a quick answer during the game */
export const QUICK_LINES = ['Bien joué !', 'Aïe…', 'Allez, vite !', 'Bonne chance !', 'Dutch bientôt…', 'GG !'];
export const MAX_CHAT_LENGTH = 140;
/** Messages kept by the host and sent again to a player who comes back */
export const CHAT_HISTORY = 60;

export function cleanChatText(text: unknown): string {
    return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LENGTH) : '';
}

/** Host -> player */
export type HostMessage =
    | { t: 'welcome'; seat: number }
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
    | { t: 'chatLog'; messages: ChatMessage[] };

/** Player -> host */
export type ClientMessage =
    | { t: 'hello'; v: number; name: string; token: string; color?: string }
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

export function randomToken(): string {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
