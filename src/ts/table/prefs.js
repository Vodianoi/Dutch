import { scoped } from '../env.js';
import { DEFAULT_THEME, first, THEMES } from './themes.js';
/** Multiplies the waiting times of the bots */
export const BOT_PACES = {
    slow: { name: 'Lente', factor: 1.5 },
    normal: { name: 'Normale', factor: 1 },
    fast: { name: 'Rapide', factor: .65 },
};
const KEY = scoped('prefs');
const DEFAULTS = {
    sound: true, vibration: true, speed: 'normal', theme: DEFAULT_THEME,
    back: first(THEMES[DEFAULT_THEME].backs), felt: first(THEMES[DEFAULT_THEME].tables), table: '2d', bots: 'normal',
};
export function loadPrefs() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {};
        const theme = saved.theme in THEMES ? saved.theme : DEFAULTS.theme;
        // A back or a table of another theme (or of an older version): the first ones of this theme
        const { backs, tables } = THEMES[theme];
        return {
            sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULTS.sound,
            vibration: typeof saved.vibration === 'boolean' ? saved.vibration : DEFAULTS.vibration,
            speed: saved.speed === 'fast' ? 'fast' : 'normal',
            theme,
            back: saved.back in backs ? saved.back : first(backs),
            felt: saved.felt in tables ? saved.felt : first(tables),
            table: saved.table === '3d' ? '3d' : '2d',
            bots: saved.bots in BOT_PACES ? saved.bots : DEFAULTS.bots,
        };
    }
    catch {
        return { ...DEFAULTS };
    }
}
export function savePrefs(prefs) {
    try {
        localStorage.setItem(KEY, JSON.stringify(prefs));
    }
    catch {
        // Storage refused: the preferences last until the page is closed
    }
}
/** Short vibration on phones that support it, if the player wants it */
export function buzz(prefs, pattern) {
    if (prefs.vibration)
        navigator.vibrate?.(pattern);
}
