import {Action, CardView, GameView, Notice} from '../View.js';

/**
 *  Messages between the host (who runs the engine) and the other players.
 *  Everything is plain JSON.
 */

export const PROTOCOL_VERSION = 1;

export interface LobbyPlayer {
    name: string;
    connected: boolean;
}

export interface LobbyState {
    code: string;
    players: LobbyPlayer[];
    started: boolean;
}

/** Host -> player */
export type HostMessage =
    | { t: 'welcome'; seat: number }
    | { t: 'lobby'; lobby: LobbyState; you: number }
    | { t: 'state'; state: GameView }
    | { t: 'reveal'; card: CardView }
    | { t: 'notice'; notice: Notice }
    | { t: 'refused'; reason: string }
    | { t: 'ping' };

/** Player -> host */
export type ClientMessage =
    | { t: 'hello'; v: number; name: string; token: string }
    | { t: 'action'; action: Action }
    | { t: 'pong' };

export const MAX_PLAYERS = 10;
export const MAX_NAME_LENGTH = 16;

export function cleanName(name: unknown, fallback: string): string {
    const text = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH) : '';
    return text || fallback;
}

export function randomToken(): string {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
