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
    | { t: 'ping' };

/** Player -> host */
export type ClientMessage =
    | { t: 'hello'; v: number; name: string; token: string; color?: string }
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
