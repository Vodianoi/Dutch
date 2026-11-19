import { rankLabel, valueName } from '../i18n.js';
import { CH, CW } from './size.js';
export { CH, CW };
const RADIUS = 18;
export const SERIF = '"Playfair Display", Georgia, serif';
export const SANS = 'Outfit, system-ui, sans-serif';
export const EMOJI = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
const RED = '#c4202f';
const BLACK = '#1c1c26';
const SYMBOLS = { HEARTS: '♥', DIAMONDS: '♦', CLUBS: '♣', SPADES: '♠' };
/** Name written on the court cards, in the language of this device (VALET / JACK…) */
const court = (value) => ['JACK', 'QUEEN', 'KING'].includes(value) ? valueName(value).toUpperCase() : undefined;
function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d')];
}
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}
/** Classic positions of the pips: column (0 left, 1 middle, 2 right), row from 0 (top) to 1 (bottom) */
const PIPS = {
    '2': [[1, 0], [1, 1]],
    '3': [[1, 0], [1, .5], [1, 1]],
    '4': [[0, 0], [2, 0], [0, 1], [2, 1]],
    '5': [[0, 0], [2, 0], [1, .5], [0, 1], [2, 1]],
    '6': [[0, 0], [2, 0], [0, .5], [2, .5], [0, 1], [2, 1]],
    '7': [[0, 0], [2, 0], [1, .25], [0, .5], [2, .5], [0, 1], [2, 1]],
    '8': [[0, 0], [2, 0], [1, .25], [0, .5], [2, .5], [1, .75], [0, 1], [2, 1]],
    '9': [[0, 0], [2, 0], [0, 1 / 3], [2, 1 / 3], [1, .5], [0, 2 / 3], [2, 2 / 3], [0, 1], [2, 1]],
    '10': [[0, 0], [2, 0], [1, 1 / 6], [0, 1 / 3], [2, 1 / 3], [0, 2 / 3], [2, 2 / 3], [1, 5 / 6], [0, 1], [2, 1]],
};
function paper(ctx, vintage = false) {
    const g = ctx.createLinearGradient(0, 0, CW, CH);
    g.addColorStop(0, vintage ? '#f7efd9' : '#fffefa');
    g.addColorStop(1, vintage ? '#e6d9b8' : '#efe9db');
    roundRect(ctx, 1, 1, CW - 2, CH - 2, RADIUS);
    ctx.fillStyle = g;
    ctx.fill();
    if (vintage) {
        // Old card stock: a fine grain and slightly darker edges
        ctx.save();
        ctx.clip();
        for (let i = 0; i < 900; i++) {
            ctx.fillStyle = `rgba(110, 80, 40, ${Math.random() * .05})`;
            ctx.fillRect(Math.random() * CW, Math.random() * CH, 1.5, 1.5);
        }
        const edge = ctx.createRadialGradient(CW / 2, CH / 2, CH * .35, CW / 2, CH / 2, CH * .75);
        edge.addColorStop(0, 'rgba(120, 85, 40, 0)');
        edge.addColorStop(1, 'rgba(120, 85, 40, .16)');
        ctx.fillStyle = edge;
        ctx.fillRect(0, 0, CW, CH);
        ctx.restore();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = vintage ? 'rgba(90, 60, 25, .35)' : 'rgba(40, 30, 20, .22)';
    ctx.stroke();
}
/** Ink of the vintage cards: a little warmer, like printed on old card stock */
const VINTAGE_RED = '#a3192b';
const VINTAGE_BLACK = '#1e1813';
function symbol(ctx, text, x, y, size, flip = false) {
    ctx.save();
    ctx.translate(x, y);
    if (flip)
        ctx.rotate(Math.PI);
    ctx.font = `${size}px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
}
function corner(ctx, rank, suit) {
    for (const flip of [false, true]) {
        ctx.save();
        if (flip) {
            ctx.translate(CW, CH);
            ctx.rotate(Math.PI);
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `900 ${rank.length > 1 ? 38 : 46}px ${SERIF}`;
        ctx.fillText(rank, 30, 56);
        ctx.font = `34px ${SERIF}`;
        ctx.fillText(suit, 30, 92);
        ctx.restore();
    }
}
export function face(card, vintage = false) {
    const [c, ctx] = canvas(CW, CH);
    paper(ctx, vintage);
    const color = card.isRed ? (vintage ? VINTAGE_RED : RED) : (vintage ? VINTAGE_BLACK : BLACK);
    const suit = SYMBOLS[card.suit];
    ctx.fillStyle = color;
    corner(ctx, rankLabel(card.value), suit);
    const courtName = court(card.value);
    if (card.value === 'ACE') {
        symbol(ctx, suit, CW / 2, CH / 2, 150);
    }
    else if (courtName) {
        // Court card: a framed panel with the initial (no portrait art)
        const x = 58, y = 58, w = CW - 116, h = CH - 116;
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, card.isRed ? '#fbe3dc' : '#e2e5ef');
        g.addColorStop(1, card.isRed ? '#f3cfc4' : '#cfd4e3');
        roundRect(ctx, x, y, w, h, 10);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#c99a2e';
        ctx.stroke();
        roundRect(ctx, x + 7, y + 7, w - 14, h - 14, 6);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = color;
        symbol(ctx, suit, CW / 2, y + 36, 34);
        symbol(ctx, suit, CW / 2, y + h - 36, 34, true);
        ctx.font = `900 112px ${SERIF}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rankLabel(card.value), CW / 2, CH / 2 + 6);
        ctx.font = `700 15px ${SANS}`;
        ctx.letterSpacing = '3px';
        ctx.fillText(courtName, CW / 2 + 1.5, y + h - 72);
        ctx.letterSpacing = '0px';
        if (card.value === 'KING' && card.isRed) {
            // Red king: worth 0 point, worth showing
            roundRect(ctx, CW / 2 - 30, y + 62, 60, 24, 12);
            ctx.fillStyle = '#1f7a4d';
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `700 15px ${SANS}`;
            ctx.fillText('0 PT', CW / 2, y + 75);
        }
    }
    else {
        const left = 72, right = CW - 72, top = 74, bottom = CH - 74;
        for (const [col, row] of PIPS[card.value]) {
            const x = left + (right - left) * col / 2;
            const y = top + (bottom - top) * row;
            symbol(ctx, suit, x, y, 54, row > .5);
        }
    }
    return c;
}
export const BACK_COLORS = {
    red: { name: 'Bordeaux', light: '#8e1f30', dark: '#5a0f1d', seal: '#6d1424' },
    blue: { name: 'Marine', light: '#24427a', dark: '#101f40', seal: '#172d57' },
    black: { name: 'Ébène', light: '#34343a', dark: '#121214', seal: '#1d1d21' },
};
/**
 *  Face for small cards (opponents' hands): only a big rank and a big suit, readable at 20–40px
 */
export function compactFace(card, vintage = false) {
    const [c, ctx] = canvas(CW, CH);
    paper(ctx, vintage);
    ctx.fillStyle = card.isRed ? (vintage ? VINTAGE_RED : RED) : (vintage ? VINTAGE_BLACK : BLACK);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const rank = rankLabel(card.value);
    ctx.font = `900 ${rank.length > 1 ? 120 : 150}px ${SERIF}`;
    ctx.fillText(rank, CW / 2, CH * .34);
    ctx.font = `150px ${SERIF}`;
    ctx.fillText(SYMBOLS[card.suit], CW / 2, CH * .74);
    if (card.value === 'KING' && card.isRed) {
        roundRect(ctx, CW - 92, 14, 78, 40, 20);
        ctx.fillStyle = '#1f7a4d';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `800 26px ${SANS}`;
        ctx.fillText('0', CW - 53, 35);
    }
    return c;
}
/**
 *  Back of the old casino cards: burgundy, gold filigree lattice, double gold frame, medallion
 */
export function vintageBack() {
    const [c, ctx] = canvas(CW, CH);
    paper(ctx, true);
    const m = 11;
    roundRect(ctx, m, m, CW - 2 * m, CH - 2 * m, RADIUS - 6);
    const g = ctx.createRadialGradient(CW / 2, CH / 2, 10, CW / 2, CH / 2, CH * .6);
    g.addColorStop(0, '#7d1a27');
    g.addColorStop(1, '#4a0d16');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Filigree: small gold diamonds with dots, in a lattice
    ctx.strokeStyle = 'rgba(226, 186, 104, .45)';
    ctx.fillStyle = 'rgba(226, 186, 104, .5)';
    ctx.lineWidth = 1.4;
    for (let y = m + 6; y < CH; y += 26) {
        for (let x = m + 6 + ((y / 26) % 2) * 13; x < CW; x += 26) {
            ctx.beginPath();
            ctx.moveTo(x, y - 9);
            ctx.lineTo(x + 7, y);
            ctx.lineTo(x, y + 9);
            ctx.lineTo(x - 7, y);
            ctx.closePath();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, 1.6, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
    // Double gold frame with corner ornaments
    ctx.strokeStyle = '#d8b25e';
    for (const [inset, width] of [[m + 7, 3], [m + 13, 1.2]]) {
        roundRect(ctx, inset, inset, CW - 2 * inset, CH - 2 * inset, 8);
        ctx.lineWidth = width;
        ctx.stroke();
    }
    ctx.fillStyle = '#d8b25e';
    for (const [x, y] of [[m + 7, m + 7], [CW - m - 7, m + 7], [m + 7, CH - m - 7], [CW - m - 7, CH - m - 7]]) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
    }
    // Medallion
    ctx.beginPath();
    ctx.ellipse(CW / 2, CH / 2, 54, 70, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#3f0a12';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#e2bf6d';
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(CW / 2, CH / 2, 46, 62, 0, 0, Math.PI * 2);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#efcf85';
    ctx.font = `italic 900 76px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('D', CW / 2, CH / 2 + 4);
    ctx.font = `22px ${SERIF}`;
    ctx.fillText('♠ ♥', CW / 2, CH / 2 - 44);
    ctx.fillText('♦ ♣', CW / 2, CH / 2 + 50);
    return c;
}
export function back(color) {
    const colors = BACK_COLORS[color];
    const [c, ctx] = canvas(CW, CH);
    paper(ctx);
    const m = 12;
    const g = ctx.createLinearGradient(0, 0, CW, CH);
    g.addColorStop(0, colors.light);
    g.addColorStop(1, colors.dark);
    roundRect(ctx, m, m, CW - 2 * m, CH - 2 * m, RADIUS - 6);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Diamond lattice
    ctx.strokeStyle = 'rgba(240, 200, 110, .28)';
    ctx.lineWidth = 2;
    for (let i = -CH; i < CW + CH; i += 22) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + CH, CH);
        ctx.moveTo(i, CH);
        ctx.lineTo(i + CH, 0);
        ctx.stroke();
    }
    ctx.restore();
    roundRect(ctx, m + 8, m + 8, CW - 2 * m - 16, CH - 2 * m - 16, 8);
    ctx.strokeStyle = 'rgba(240, 200, 110, .8)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Monogram
    ctx.beginPath();
    ctx.ellipse(CW / 2, CH / 2, 50, 64, 0, 0, Math.PI * 2);
    ctx.fillStyle = colors.seal;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#e9c46a';
    ctx.stroke();
    ctx.fillStyle = '#f2d48a';
    ctx.font = `italic 900 72px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('D', CW / 2, CH / 2 + 4);
    return c;
}
/** Soft shape around a card: a shadow (black) or a glow (colour) */
export function halo(color, blur, pad, alpha, grow = 0) {
    const [c, ctx] = canvas(CW + 2 * pad, CH + 2 * pad);
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.globalAlpha = alpha;
    // Shape drawn outside of the canvas, only its shadow lands inside
    ctx.shadowOffsetX = 10000;
    roundRect(ctx, pad - grow - 10000, pad - grow, CW + 2 * grow, CH + 2 * grow, RADIUS + grow);
    ctx.fillStyle = '#000';
    ctx.fill();
    return c;
}
/**
 *  Light around a card that can be played: a wide soft aura and a thin bright rim that hugs the card,
 *  both with corners rounder than the card's so that the light looks round, not boxy
 */
export function glowArt(color, pad = 70) {
    const [c, ctx] = canvas(CW + 2 * pad, CH + 2 * pad);
    const pass = (blur, grow, alpha) => {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.globalAlpha = alpha;
        // Shape drawn outside of the canvas, only its shadow lands inside
        ctx.shadowOffsetX = 10000;
        roundRect(ctx, pad - grow - 10000, pad - grow, CW + 2 * grow, CH + 2 * grow, RADIUS + grow + 10);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.restore();
    };
    pass(46, 2, .75);
    pass(22, 3, .8);
    // Goes past the card edge, so that the light still shows on small cards
    pass(10, 7, .9);
    return c;
}
/** A round speck of light: bright core, long soft fall-off */
export function spark() {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,250,1)');
    g.addColorStop(.18, 'rgba(255,240,190,.95)');
    g.addColorStop(.45, 'rgba(255,214,120,.45)');
    g.addColorStop(.75, 'rgba(255,190,70,.12)');
    g.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();
    return c;
}
/** A soft round ring of light (shock wave when a card lands well) */
export function ring() {
    const [c, ctx] = canvas(256, 256);
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,224,150,0)');
    g.addColorStop(.62, 'rgba(255,224,150,0)');
    g.addColorStop(.8, 'rgba(255,236,190,.85)');
    g.addColorStop(.88, 'rgba(255,214,120,.35)');
    g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 128, 0, Math.PI * 2);
    ctx.fill();
    return c;
}
/** A round pool of light (under the hand of the player whose turn it is), stretched into an ellipse */
export function spot(color = '255, 209, 102') {
    const [c, ctx] = canvas(256, 256);
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, `rgba(${color}, .9)`);
    g.addColorStop(.45, `rgba(${color}, .45)`);
    g.addColorStop(.8, `rgba(${color}, .1)`);
    g.addColorStop(1, `rgba(${color}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return c;
}
/** Looks of the flat table: felt, rail and room go together */
export const TABLE_THEMES = {
    green: {
        name: 'Tapis vert', room: ['#2a1f17', '#0a0705'], rail: ['#9a6232', '#6b3c1c', '#4a2710'],
        felt: ['#24885a', '#176642', '#0c3f28'], inlay: 'rgba(233, 196, 106, .55)', ink: '255, 236, 190',
    },
    blue: {
        name: 'Bleu nuit', room: ['#161c2a', '#05070c'], rail: ['#5d3b26', '#3b2316', '#24140b'],
        felt: ['#2a5c98', '#1b416f', '#0d2342'], inlay: 'rgba(200, 214, 240, .5)', ink: '220, 232, 255',
    },
    red: {
        name: 'Bordeaux', room: ['#271612', '#090404'], rail: ['#b98a55', '#8a5f35', '#5e3d1f'],
        felt: ['#93283b', '#6c1a2a', '#3e0c17'], inlay: 'rgba(240, 205, 140, .6)', ink: '255, 226, 200',
    },
    slate: {
        name: 'Ardoise', room: ['#1d1d20', '#060607'], rail: ['#3a3a40', '#222226', '#121214'],
        felt: ['#4a5560', '#323b44', '#1a2026'], inlay: 'rgba(233, 196, 106, .75)', ink: '235, 225, 200',
    },
    wood: {
        name: 'Bois', room: ['#22262b', '#08090a'], rail: ['#4a2c17', '#33200f', '#1f1208'],
        felt: ['#c08a52', '#9c6a3a', '#6e4623'], inlay: 'rgba(40, 20, 6, .5)', ink: '60, 30, 10', wood: true,
    },
};
/** The same pattern every time the table is drawn again (resize, rotation) */
function seeded(seed) {
    return () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
    };
}
/**
 *  The room and the table: wooden rail, felt with a little grain (or a bare wooden top), the game name printed on it
 */
export function drawTable(w, h, shape, resolution, theme = 'green') {
    const colors = TABLE_THEMES[theme] ?? TABLE_THEMES.green;
    const [c, ctx] = canvas(Math.round(w * resolution), Math.round(h * resolution));
    ctx.scale(resolution, resolution);
    const { cx, cy, rx, ry } = shape;
    const room = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * .8);
    room.addColorStop(0, colors.room[0]);
    room.addColorStop(1, colors.room[1]);
    ctx.fillStyle = room;
    ctx.fillRect(0, 0, w, h);
    const rail = Math.max(10, Math.min(rx, ry) * .07);
    // Shadow of the table on the floor
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.7)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    const wood = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    wood.addColorStop(0, colors.rail[0]);
    wood.addColorStop(.5, colors.rail[1]);
    wood.addColorStop(1, colors.rail[2]);
    ctx.fillStyle = wood;
    ctx.fill();
    ctx.restore();
    // Wood grain: thin rings along the rail
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 14; i++) {
        const t = i / 14;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx - rail * t, ry - rail * t, 0, 0, Math.PI * 2);
        ctx.strokeStyle = i % 3 === 0 ? 'rgba(255, 210, 150, .07)' : 'rgba(40, 18, 5, .12)';
        ctx.lineWidth = .6 + (i % 4) * .35;
        ctx.stroke();
    }
    ctx.restore();
    // Highlight on the rail
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - 2, ry - 2, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.strokeStyle = 'rgba(255, 220, 170, .25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Felt, or the wooden top
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - rail, ry - rail, 0, 0, Math.PI * 2);
    ctx.clip();
    const felt = ctx.createRadialGradient(cx, cy - ry * .2, 0, cx, cy, Math.max(rx, ry));
    felt.addColorStop(0, colors.felt[0]);
    felt.addColorStop(.6, colors.felt[1]);
    felt.addColorStop(1, colors.felt[2]);
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, w, h);
    if (colors.wood)
        woodTop(ctx, w, h, cx, cy, rx, ry);
    // Grain
    const [noise, n] = canvas(96, 96);
    const pixels = n.createImageData(96, 96);
    const random = seeded(7);
    for (let i = 0; i < pixels.data.length; i += 4) {
        const v = random() * 255;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
        pixels.data[i + 3] = colors.wood ? 8 : 13;
    }
    n.putImageData(pixels, 0, 0);
    ctx.fillStyle = ctx.createPattern(noise, 'repeat');
    ctx.fillRect(0, 0, w, h);
    // Soft light from above the table
    const light = ctx.createRadialGradient(cx, cy - ry * .35, 0, cx, cy - ry * .35, Math.max(rx, ry) * .9);
    light.addColorStop(0, 'rgba(255, 245, 210, .10)');
    light.addColorStop(1, 'rgba(255, 245, 210, 0)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, w, h);
    // Inner shadow under the rail
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - rail + 14, ry - rail + 14, 0, 0, Math.PI * 2);
    ctx.lineWidth = 28;
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 24;
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.stroke();
    ctx.restore();
    // Inlay between the rail and the felt
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - rail + 1, ry - rail + 1, 0, 0, Math.PI * 2);
    ctx.strokeStyle = colors.inlay;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Printed line and name
    ctx.beginPath();
    ctx.ellipse(cx, cy, (rx - rail) * .8, (ry - rail) * .76, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${colors.ink}, .12)`;
    ctx.lineWidth = 2;
    ctx.stroke();
    const size = Math.min(rx, ry) * .2;
    ctx.font = `italic 900 ${size}px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${colors.ink}, ${colors.wood ? .12 : .07})`;
    ctx.fillText('Dutch', cx, cy + (ry - rail) * .5);
    return c;
}
/** Planks of a wooden table top: long boards with a soft grain, the same each time */
function woodTop(ctx, w, h, cx, cy, rx, ry) {
    const random = seeded(42);
    const board = Math.max(46, Math.min(rx, ry) * .32);
    const vertical = ry > rx;
    const across = vertical ? w : h;
    for (let i = -1; i * board < across + board; i++) {
        const at = i * board;
        // Each board slightly lighter or darker
        ctx.fillStyle = random() < .5 ? `rgba(255, 230, 190, ${.03 + random() * .05})` : `rgba(40, 18, 4, ${.04 + random() * .07})`;
        if (vertical)
            ctx.fillRect(at, 0, board, h);
        else
            ctx.fillRect(0, at, w, board);
        // Grain: wavy lines along the board
        for (let k = 0; k < 7; k++) {
            const offset = at + random() * board;
            const wave = 2 + random() * 5, period = 120 + random() * 220, phase = random() * 6;
            ctx.beginPath();
            for (let along = 0; along <= (vertical ? h : w); along += 8) {
                const side = offset + Math.sin(along / period * Math.PI * 2 + phase) * wave;
                if (along === 0)
                    ctx.moveTo(vertical ? side : along, vertical ? along : side);
                else
                    ctx.lineTo(vertical ? side : along, vertical ? along : side);
            }
            ctx.strokeStyle = `rgba(60, 28, 8, ${.08 + random() * .1})`;
            ctx.lineWidth = .6 + random() * 1.2;
            ctx.stroke();
        }
        // Gap between two boards
        ctx.fillStyle = 'rgba(30, 12, 2, .35)';
        if (vertical)
            ctx.fillRect(at - .75, 0, 1.5, h);
        else
            ctx.fillRect(0, at - .75, w, 1.5);
    }
    // Varnish: a soft sheen across the top
    const sheen = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
    sheen.addColorStop(0, 'rgba(255, 240, 210, .10)');
    sheen.addColorStop(.5, 'rgba(255, 240, 210, 0)');
    sheen.addColorStop(1, 'rgba(0, 0, 0, .12)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
}
