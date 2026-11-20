import { cleanSettings } from '../Settings.js';
import { cleanName, MAX_PLAYERS, PROTOCOL_VERSION } from './Protocol.js';
import { PUBLIC_CODES } from './Transport.js';
/** How long the list waits for the rooms to answer */
export const SCAN_TIMEOUT_MS = 5000;
/**
 *  Knock on every public room: the ones that are there say who hosts them, how many players
 *  they have and their rules. Open games first, the fullest first (they will start soonest).
 */
export async function findPublicGames(transport, timeoutMs = SCAN_TIMEOUT_MS) {
    const answers = await transport.ask(PUBLIC_CODES, { t: 'info' }, timeoutMs);
    const games = [];
    for (const [code, answer] of answers) {
        const room = answer?.room;
        if (answer?.t !== 'info' || !room || typeof room !== 'object')
            continue;
        const players = Math.max(0, Math.min(MAX_PLAYERS, Math.floor(Number(room.players) || 0)));
        const max = Math.max(1, Math.min(MAX_PLAYERS, Math.floor(Number(room.max) || MAX_PLAYERS)));
        const started = room.started === true;
        const late = room.late === true;
        const v = Number(room.v);
        games.push({
            // The code knocked on, not what the room says
            code, v, players, max, started, late,
            host: cleanName(room.host, '?'),
            settings: cleanSettings(room.settings),
            // A game in progress that takes newcomers: they play from the next round
            open: (!started || late) && players < max && v === PROTOCOL_VERSION,
        });
    }
    return games.sort((a, b) => Number(b.open) - Number(a.open) || b.players - a.players || a.code.localeCompare(b.code));
}
