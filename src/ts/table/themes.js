/**
 *  Looks of the game. A theme dresses everything at once: the menus (its CSS tokens are in
 *  src/css/styles.css, under `[data-theme="…"]`, with the same colours as here), the cards, the table
 *  and what is drawn on it. Each device chooses its own (see prefs.ts).
 *  No rendering library here: shared by the card drawings (canvas), the PixiJS table and the menus.
 */
export const THEMES = {
    // Delft tiles: cobalt blue painted on tin-glaze white, one warm accent
    delft: {
        name: 'Delft',
        chrome: '#0b1433',
        display: 'Lora, Georgia, serif',
        body: '"Fira Sans", system-ui, sans-serif',
        ui: {
            background: '#070c1f', text: '#f4f7fb', muted: '#dce5f6', textShadow: '#0b1433',
            accent: '#ffae57', glow: '#ffae57', light: '255, 196, 140', cardShadow: .6,
            badge: { fill: '#f26a1b', text: '#0b1433' },
            banner: { fill: '#0b1433', alpha: .62, stroke: '#f4f7fb', strokeAlpha: .24, text: '#f4f7fb' },
            chip: { fill: '#0b1433', text: '#ffffff' }, alert: '#ff8f85',
            slot: { fill: '#0b1433', fillAlpha: .2, stroke: '#f4f7fb', strokeAlpha: .24 },
            keys: {
                primary: { face: '#f4f7fb', edge: '#aebbd8', text: '#17357f' },
                solid: { face: '#1f47a8', edge: '#122a66', text: '#f4f7fb' },
                danger: { face: '#f26a1b', edge: '#a8420a', text: '#0b1433' },
            },
            ghost: { fill: '#0b1433', alpha: .4, stroke: '#f4f7fb', text: '#f4f7fb' },
            keyRadius: 12, keyDepth: 3,
            panel: { fill: '#f4f7fb', frame: '#1f47a8', title: '#1f47a8', text: '#0b1433', muted: '#56658c', win: '#c2500e', penalty: '#b3261e', radius: 12 },
            dim: { color: '#050a1c', alpha: .55, text: '#f4f7fb' },
            call: { fill: '#f26a1b', stroke: '#f4f7fb', shadow: '#0b1433', style: 'italic', weight: '700' },
            confetti: ['#f26a1b', '#f4f7fb', '#8fb0ff', '#ffae57', '#1f47a8', '#f4f7fb'],
        },
        cards: {
            paper: ['#ffffff', '#edf1f7'], edge: 'rgba(17, 24, 48, .26)', red: '#c4202f', black: '#111830',
            rank: { family: 'Lora, Georgia, serif', weight: 700, cap: .71, scale: 1 },
            court: { fill: ['#f1f5fc', '#dde7f6'], frame: '#1f47a8', corners: true },
            courtName: 'italic 600 18px',
            tag: { fill: '#1f47a8', text: '#ffffff' },
        },
        backStyle: 'tulip',
        backs: {
            delft: { name: 'Bleu de Delft', light: '#2a58c8', dark: '#17357f', paint: '#1f47a8' },
            manganese: { name: 'Manganèse', light: '#7a4a9e', dark: '#4a2867', paint: '#5a3277' },
            oranje: { name: 'Orange', light: '#f47a2c', dark: '#cf4f0c', paint: '#d9560f' },
        },
        table: { room: 'tiles', rim: 'pearls', top: 'glaze', shadow: .7, name: { font: 'italic 700', text: 'Dutch', spacing: 0, alpha: .09 } },
        tables: {
            delft: {
                name: 'Bleu de Delft', room: ['#17244f', '#070c1f'], rail: ['#1c2c63', '#121c45', '#0a1130'],
                felt: ['#2f5ecf', '#2149b0', '#16307c'], inlay: '255, 255, 255', ink: '255, 255, 255',
            },
            ink: {
                name: 'Encre', room: ['#1b1f2e', '#07080d'], rail: ['#272c42', '#181b2b', '#0d0f19'],
                felt: ['#34467a', '#222f58', '#131a36'], inlay: '226, 234, 250', ink: '226, 234, 250',
            },
            celadon: {
                name: 'Céladon', room: ['#152a2b', '#060d0e'], rail: ['#1c3f3d', '#122b2a', '#0a1918'],
                felt: ['#4a9a86', '#317767', '#1b4f45'], inlay: '240, 250, 244', ink: '240, 250, 244',
            },
            manganese: {
                name: 'Manganèse', room: ['#251a35', '#0b0712'], rail: ['#3b2653', '#271838', '#150c20'],
                felt: ['#7c4ca0', '#5b3379', '#381d4e'], inlay: '248, 240, 255', ink: '248, 240, 255',
            },
        },
    },
    // A frontier saloon: walnut, green baize, parchment, barn red and brass; wood type
    saloon: {
        name: 'Saloon 1880',
        chrome: '#1c120b',
        display: 'Bitter, Georgia, serif',
        body: 'Bitter, Georgia, serif',
        ui: {
            background: '#120b06', text: '#f6ead0', muted: '#e0cfa8', textShadow: '#140c06',
            accent: '#f0bf5c', glow: '#f0bf5c', light: '255, 214, 130', cardShadow: .65,
            badge: { fill: '#f0bf5c', text: '#2b1a0e' },
            banner: { fill: '#1a100a', alpha: .66, stroke: '#f6ead0', strokeAlpha: .26, text: '#f6ead0' },
            chip: { fill: '#1a100a', text: '#f6ead0' }, alert: '#ff8f7a',
            slot: { fill: '#120b06', fillAlpha: .22, stroke: '#f6ead0', strokeAlpha: .24 },
            keys: {
                primary: { face: '#f0e2c4', edge: '#a88d59', text: '#3d2614' },
                solid: { face: '#8c2620', edge: '#55120e', text: '#f6ead0' },
                danger: { face: '#e2ab3c', edge: '#9a6d14', text: '#2b1a0e' },
            },
            ghost: { fill: '#120b06', alpha: .45, stroke: '#f6ead0', text: '#f6ead0' },
            keyRadius: 5, keyDepth: 3,
            panel: { fill: '#f0e2c4', frame: '#4a2f1a', title: '#4a2f1a', text: '#2b1a0e', muted: '#6b5238', win: '#8a5a0c', penalty: '#9c1f18', radius: 4 },
            dim: { color: '#0c0703', alpha: .58, text: '#f6ead0' },
            call: { fill: '#f0bf5c', stroke: '#3d1a12', shadow: '#000000', style: 'normal', weight: '900' },
            confetti: ['#f0bf5c', '#a82a22', '#f0e2c4', '#285a41', '#d99a2b', '#f6ead0'],
        },
        cards: {
            paper: ['#fbf3df', '#eadcb8'], edge: 'rgba(74, 47, 26, .4)', red: '#a3241d', black: '#231a12',
            rank: { family: 'Bitter, Georgia, serif', weight: 800, cap: .71, scale: .96 },
            court: { fill: ['#f5e7c4', '#e4cf9c'], frame: '#4a2f1a', corners: false },
            courtName: '700 15px',
            tag: { fill: '#8c2620', text: '#fff3dc' },
        },
        backStyle: 'star',
        backs: {
            barn: { name: 'Rouge grange', light: '#9c2a23', dark: '#5e1512', paint: '#f3e2bd' },
            navy: { name: 'Bleu marine', light: '#2c4875', dark: '#152542', paint: '#f3e2bd' },
            bottle: { name: 'Vert bouteille', light: '#2c6348', dark: '#143424', paint: '#f3e2bd' },
        },
        table: { room: 'planks', rim: 'wood', top: 'felt', shadow: .75, name: { font: '900', text: 'DUTCH', spacing: .08, alpha: .08 } },
        tables: {
            baize: {
                name: 'Tapis vert', room: ['#2e2015', '#0f0905'], rail: ['#8f5a2e', '#613a1b', '#3e230e'],
                felt: ['#34765a', '#23583f', '#12382a'], inlay: '236, 196, 110', ink: '250, 236, 200',
            },
            leather: {
                name: 'Cuir', room: ['#2b1b14', '#0d0705'], rail: ['#7b4d28', '#553218', '#351d0c'],
                felt: ['#8a3a2c', '#6a281e', '#431610'], inlay: '236, 196, 110', ink: '255, 228, 200',
            },
            walnut: {
                name: 'Noyer', room: ['#262019', '#0b0806'], rail: ['#4a2c17', '#33200f', '#1f1208'],
                felt: ['#8d5c36', '#704528', '#4d2e18'], inlay: '30, 14, 4', ink: '255, 232, 196', wood: true,
            },
        },
    },
    // A gaming room of the twenties: black lacquer, gold lines, jade
    deco: {
        name: 'Art déco 1925',
        chrome: '#0c0c0e',
        display: 'Montserrat, "Century Gothic", sans-serif',
        body: 'Montserrat, "Century Gothic", sans-serif',
        ui: {
            background: '#070708', text: '#f3e9cf', muted: '#d2c6a4', textShadow: '#000000',
            accent: '#e9cc7e', glow: '#e9cc7e', light: '240, 214, 140', cardShadow: .7,
            badge: { fill: '#3cc0a0', text: '#06140f' },
            banner: { fill: '#0c0c0e', alpha: .72, stroke: '#d4b15f', strokeAlpha: .55, text: '#f3e9cf' },
            chip: { fill: '#0c0c0e', text: '#f3e9cf' }, alert: '#ff8f85',
            slot: { fill: '#000000', fillAlpha: .22, stroke: '#e9cc7e', strokeAlpha: .3 },
            keys: {
                primary: { face: '#f3e9cf', edge: '#a39468', text: '#141416' },
                solid: { face: '#d4b15f', edge: '#8a6d2c', text: '#141416' },
                danger: { face: '#35b597', edge: '#17695a', text: '#06140f' },
            },
            ghost: { fill: '#0c0c0e', alpha: .5, stroke: '#d4b15f', text: '#f3e9cf' },
            keyRadius: 2, keyDepth: 3,
            panel: { fill: '#15161a', frame: '#d4b15f', title: '#e9cc7e', text: '#f3e9cf', muted: '#b9ad8c', win: '#5fd9bb', penalty: '#ff8f85', radius: 2 },
            dim: { color: '#000000', alpha: .6, text: '#f3e9cf' },
            call: { fill: '#e9cc7e', stroke: '#0c0c0e', shadow: '#000000', style: 'normal', weight: '800' },
            confetti: ['#e9cc7e', '#35b597', '#f3e9cf', '#d4b15f', '#8a6d2c', '#5fd9bb'],
        },
        cards: {
            paper: ['#fdfaf0', '#f0e9d6'], edge: 'rgba(20, 20, 22, .35)', red: '#b01e2e', black: '#141416',
            rank: { family: 'Montserrat, "Century Gothic", sans-serif', weight: 700, cap: .7, scale: .9 },
            court: { fill: ['#f7f0da', '#e8dcbd'], frame: '#b8933f', corners: false },
            courtName: '600 13px',
            tag: { fill: '#141416', text: '#e9cc7e' },
        },
        backStyle: 'fan',
        backs: {
            onyx: { name: 'Onyx', light: '#2a2b32', dark: '#0d0d10', paint: '#d4b15f' },
            emerald: { name: 'Émeraude', light: '#1f7a63', dark: '#0b3a2e', paint: '#e2c26e' },
            burgundy: { name: 'Bordeaux', light: '#7d2030', dark: '#3d0c15', paint: '#e2c26e' },
        },
        table: { room: 'scales', rim: 'gilt', top: 'rays', shadow: .8, name: { font: '300', text: 'DUTCH', spacing: .5, alpha: .2 } },
        tables: {
            emerald: {
                name: 'Émeraude', room: ['#17181c', '#050506'], rail: ['#26272d', '#141418', '#09090b'],
                felt: ['#23846b', '#165c4a', '#0a342a'], inlay: '212, 177, 95', ink: '233, 204, 126',
            },
            burgundy: {
                name: 'Bordeaux', room: ['#1a1517', '#060405'], rail: ['#26272d', '#141418', '#09090b'],
                felt: ['#8a2435', '#621624', '#380a13'], inlay: '212, 177, 95', ink: '233, 204, 126',
            },
            midnight: {
                name: 'Minuit', room: ['#14161d', '#040507'], rail: ['#26272d', '#141418', '#09090b'],
                felt: ['#2b3f78', '#1c2b56', '#0e1732'], inlay: '212, 177, 95', ink: '233, 204, 126',
            },
            onyx: {
                name: 'Onyx', room: ['#1b1b1f', '#050506'], rail: ['#2c2d34', '#18181c', '#0a0a0c'],
                felt: ['#3a3b44', '#26272e', '#131318'], inlay: '212, 177, 95', ink: '233, 204, 126',
            },
        },
    },
    // The Strip at night, around 1960: marquee bulbs, starbursts, turquoise, red and cream
    vegas: {
        name: 'Las Vegas 1960',
        chrome: '#141230',
        display: 'Anton, Impact, "Arial Narrow", sans-serif',
        body: '"DM Sans", system-ui, sans-serif',
        ui: {
            background: '#0c0b20', text: '#fff4dc', muted: '#e3dcf2', textShadow: '#0c0b20',
            accent: '#ffc93c', glow: '#ffc93c', light: '255, 214, 110', cardShadow: .6,
            badge: { fill: '#ffc93c', text: '#1d1a2e' },
            banner: { fill: '#141230', alpha: .7, stroke: '#ffc93c', strokeAlpha: .5, text: '#fff4dc' },
            chip: { fill: '#141230', text: '#fff4dc' }, alert: '#ff9a8f',
            slot: { fill: '#0c0b20', fillAlpha: .22, stroke: '#fff4dc', strokeAlpha: .28 },
            keys: {
                primary: { face: '#fff4dc', edge: '#c4b287', text: '#1d1a2e' },
                solid: { face: '#e5383b', edge: '#a01c1f', text: '#fff4dc' },
                danger: { face: '#ffc93c', edge: '#b98a10', text: '#1d1a2e' },
            },
            ghost: { fill: '#141230', alpha: .5, stroke: '#fff4dc', text: '#fff4dc' },
            keyRadius: 22, keyDepth: 3,
            panel: { fill: '#fff4dc', frame: '#149c97', title: '#c9262a', text: '#1d1a2e', muted: '#5f5a78', win: '#0b7a77', penalty: '#c9262a', radius: 18 },
            dim: { color: '#0a0920', alpha: .6, text: '#fff4dc' },
            call: { fill: '#ffc93c', stroke: '#c9262a', shadow: '#0c0b20', style: 'normal', weight: '400' },
            confetti: ['#ffc93c', '#e5383b', '#19b5b0', '#fff4dc', '#ff8fa3', '#ffc93c'],
        },
        cards: {
            paper: ['#fffdf5', '#f6edd6'], edge: 'rgba(29, 26, 46, .3)', red: '#d92b2f', black: '#1d1a2e',
            rank: { family: 'Anton, Impact, "Arial Narrow", sans-serif', weight: 400, cap: .86, scale: 1.15 },
            court: { fill: ['#e2f6f4', '#c5ebe8'], frame: '#149c97', corners: false },
            courtName: '700 14px',
            tag: { fill: '#149c97', text: '#ffffff' },
        },
        backStyle: 'burst',
        backs: {
            red: { name: 'Rouge', light: '#ea4245', dark: '#b01f22', paint: '#fff4dc' },
            turquoise: { name: 'Turquoise', light: '#1fbdb8', dark: '#0d7f7b', paint: '#fff4dc' },
            midnight: { name: 'Minuit', light: '#322c62', dark: '#141230', paint: '#fff4dc' },
        },
        table: { room: 'stars', rim: 'bulbs', top: 'harlequin', shadow: .75, name: { font: '400', text: 'DUTCH', spacing: .06, alpha: .1 } },
        tables: {
            turquoise: {
                name: 'Turquoise', room: ['#221f4d', '#0b0a1f'], rail: ['#2a2658', '#191638', '#0e0c22'],
                felt: ['#22aaa5', '#15827e', '#0b5452'], inlay: '255, 214, 110', ink: '255, 244, 220',
            },
            red: {
                name: 'Rouge', room: ['#251a3c', '#0c0818'], rail: ['#2a2658', '#191638', '#0e0c22'],
                felt: ['#cf3d41', '#a12529', '#661215'], inlay: '255, 214, 110', ink: '255, 244, 220',
            },
            baize: {
                name: 'Tapis vert', room: ['#1c2440', '#090b1a'], rail: ['#2a2658', '#191638', '#0e0c22'],
                felt: ['#2f9461', '#1f7049', '#11462d'], inlay: '255, 214, 110', ink: '255, 244, 220',
            },
            midnight: {
                name: 'Minuit', room: ['#1d1a40', '#08071a'], rail: ['#332e6a', '#1f1b45', '#110f28'],
                felt: ['#3d3780', '#29245a', '#161335'], inlay: '255, 214, 110', ink: '255, 244, 220',
            },
        },
    },
    // A web application of today: light, flat, grey, one accent
    modern: {
        name: 'Moderne',
        chrome: '#f5f6f8',
        display: 'Inter, system-ui, sans-serif',
        body: 'Inter, system-ui, sans-serif',
        ui: {
            background: '#f5f6f8', text: '#111318', muted: '#5b6474', textShadow: null,
            accent: '#3355ff', glow: '#3355ff', light: '51, 85, 255', cardShadow: .22,
            badge: { fill: '#3355ff', text: '#ffffff' },
            banner: { fill: '#ffffff', alpha: .94, stroke: '#111318', strokeAlpha: .14, text: '#111318' },
            chip: { fill: '#111318', text: '#ffffff' }, alert: '#ff6b5e',
            slot: { fill: '#111318', fillAlpha: .04, stroke: '#111318', strokeAlpha: .2 },
            keys: {
                primary: { face: '#111318', edge: '#111318', text: '#ffffff' },
                solid: { face: '#111318', edge: '#111318', text: '#ffffff' },
                danger: { face: '#3355ff', edge: '#3355ff', text: '#ffffff' },
            },
            ghost: { fill: '#ffffff', alpha: .8, stroke: '#111318', text: '#111318' },
            keyRadius: 11, keyDepth: 0,
            panel: { fill: '#ffffff', frame: null, title: '#111318', text: '#111318', muted: '#5b6474', win: '#2240d9', penalty: '#d92d20', radius: 16 },
            dim: { color: '#111318', alpha: .4, text: '#ffffff' },
            call: { fill: '#3355ff', stroke: '#ffffff', shadow: '#111318', style: 'normal', weight: '800' },
            confetti: ['#3355ff', '#111318', '#ff5a4d', '#12b76a', '#ffb020', '#8aa0ff'],
        },
        cards: {
            paper: ['#ffffff', '#fbfcfd'], edge: 'rgba(17, 19, 24, .22)', red: '#e5484d', black: '#111318',
            rank: { family: 'Inter, system-ui, sans-serif', weight: 800, cap: .73, scale: .93 },
            court: { fill: ['#f5f6f9', '#eceff4'], frame: '#c9cfd9', corners: false },
            courtName: '600 14px',
            tag: { fill: '#3355ff', text: '#ffffff' },
        },
        backStyle: 'mark',
        backs: {
            ink: { name: 'Encre', light: '#1b1e26', dark: '#111318', paint: '#ffffff' },
            blue: { name: 'Bleu', light: '#3d5eff', dark: '#2a48e0', paint: '#ffffff' },
            coral: { name: 'Corail', light: '#ff6a5e', dark: '#ee4a3e', paint: '#ffffff' },
        },
        table: { room: 'dots', rim: 'flat', top: 'flat', shadow: .1, name: { font: '800', text: 'Dutch', spacing: -.04, alpha: .05 } },
        tables: {
            mist: {
                name: 'Brume', room: ['#f5f6f8', '#f5f6f8'], rail: ['#e6e9ee', '#e6e9ee', '#e6e9ee'],
                felt: ['#e9ecf1', '#e6e9ee', '#e1e5eb'], inlay: '17, 19, 24', ink: '17, 19, 24',
            },
            mint: {
                name: 'Menthe', room: ['#f4f7f5', '#f4f7f5'], rail: ['#d8eee3', '#d8eee3', '#d8eee3'],
                felt: ['#ddf2e8', '#d8eee3', '#cfe8db'], inlay: '14, 60, 40', ink: '14, 60, 40',
            },
            sky: {
                name: 'Ciel', room: ['#f4f6fa', '#f4f6fa'], rail: ['#dbe5fd', '#dbe5fd', '#dbe5fd'],
                felt: ['#e1eaff', '#dbe5fd', '#d2ddf8'], inlay: '20, 40, 120', ink: '20, 40, 120',
            },
            sand: {
                name: 'Sable', room: ['#f8f6f2', '#f8f6f2'], rail: ['#efe6d5', '#efe6d5', '#efe6d5'],
                felt: ['#f3ecdf', '#efe6d5', '#e8ddc8'], inlay: '70, 50, 20', ink: '70, 50, 20',
            },
        },
    },
};
export const THEME_IDS = Object.keys(THEMES);
export const DEFAULT_THEME = 'delft';
let current = DEFAULT_THEME;
export function themeId() {
    return current;
}
/** The theme of this device */
export function theme() {
    return THEMES[current];
}
/**
 *  Dress the game in a theme: the menus follow at once (`data-theme` on the page);
 *  the cards and the table are drawn with it the next time they are drawn
 */
export function applyTheme(id) {
    current = id in THEMES ? id : DEFAULT_THEME;
    if (typeof document === 'undefined')
        return;
    document.documentElement.dataset.theme = current;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[current].chrome);
}
/** `#rrggbb` as a number, for PixiJS */
export const hex = (color) => parseInt(color.slice(1), 16);
/** First choice of a list of looks (card backs, tables) */
export const first = (choices) => Object.keys(choices)[0];
