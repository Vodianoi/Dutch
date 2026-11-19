import {cleanSettings} from '../Settings.js';
import {cleanName, MAX_PLAYERS, PROTOCOL_VERSION, RoomInfo} from './Protocol.js';
import {PUBLIC_CODES, TransportFactory} from './Transport.js';

/** A public game as the list shows it */
export interface PublicGame extends RoomInfo {
    /** Can be joined now: waiting room, not full, same version of the game */
    open: boolean;
}

/** How long the list waits for the rooms to answer */
export const SCAN_TIMEOUT_MS = 5000;

/**
 *  Knock on every public room: the ones that are there say who hosts them, how many players
 *  they have and their rules. Open games first, the fullest first (they will start soonest).
 */
export async function findPublicGames(transport: TransportFactory, timeoutMs = SCAN_TIMEOUT_MS): Promise<PublicGame[]> {
    const answers = await transport.ask(PUBLIC_CODES, {t: 'info'}, timeoutMs);
    const games: PublicGame[] = [];
    for (const [code, answer] of answers) {
        const room = (answer as { t?: string; room?: Partial<RoomInfo> } | null)?.room;
        if ((answer as { t?: string } | null)?.t !== 'info' || !room || typeof room !== 'object') continue;
        const players = Math.max(0, Math.min(MAX_PLAYERS, Math.floor(Number(room.players) || 0)));
        const max = Math.max(1, Math.min(MAX_PLAYERS, Math.floor(Number(room.max) || MAX_PLAYERS)));
        const started = room.started === true;
        const v = Number(room.v);
        games.push({
            // The code knocked on, not what the room says
            code, v, players, max, started,
            host: cleanName(room.host, '?'),
            settings: cleanSettings(room.settings),
            open: !started && players < max && v === PROTOCOL_VERSION,
        });
    }
    return games.sort((a, b) => Number(b.open) - Number(a.open) || b.players - a.players || a.code.localeCompare(b.code));
}
