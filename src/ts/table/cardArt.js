import { rankLabel, valueName } from '../i18n.js';
import { DELFT, DELFT_DARK, FAIENCE } from './palette.js';
import { CH, CW } from './size.js';
export { CH, CW };
const RADIUS = 18;
export const SERIF = 'Lora, Georgia, serif';
export const SANS = '"Fira Sans", system-ui, sans-serif';
export const EMOJI = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
const RED = '#c4202f';
/** The black suits are printed in the darkest blue: it reads as black next to the red */
const BLACK = '#111830';
/** Name written on the court cards, in the language of this device (Valet / Jack…) */
const court = (value) => ['JACK', 'QUEEN', 'KING'].includes(value) ? valueName(value) : undefined;
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
    g.addColorStop(0, vintage ? '#f7efd9' : '#ffffff');
    g.addColorStop(1, vintage ? '#e6d9b8' : '#edf1f7');
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
    ctx.strokeStyle = vintage ? 'rgba(90, 60, 25, .35)' : 'rgba(17, 24, 48, .26)';
    ctx.stroke();
}
/** Ink of the vintage cards: a little warmer, like printed on old card stock */
const VINTAGE_RED = '#a3192b';
const VINTAGE_BLACK = '#1e1813';
/**
 *  A suit drawn as a shape (not a font glyph: those change from one phone to another), centred on (x, y)
 *  @param size height of the shape
 */
function pip(ctx, suit, x, y, size, flip = false) {
    ctx.save();
    ctx.translate(x, y);
    if (flip)
        ctx.rotate(Math.PI);
    ctx.scale(size, size);
    ctx.beginPath();
    if (suit === 'HEARTS') {
        ctx.moveTo(0, .47);
        ctx.bezierCurveTo(-.12, .3, -.52, .08, -.52, -.2);
        ctx.bezierCurveTo(-.52, -.4, -.37, -.48, -.25, -.48);
        ctx.bezierCurveTo(-.12, -.48, -.03, -.4, 0, -.28);
        ctx.bezierCurveTo(.03, -.4, .12, -.48, .25, -.48);
        ctx.bezierCurveTo(.37, -.48, .52, -.4, .52, -.2);
        ctx.bezierCurveTo(.52, .08, .12, .3, 0, .47);
    }
    else if (suit === 'DIAMONDS') {
        ctx.moveTo(0, -.5);
        ctx.quadraticCurveTo(.17, -.2, .41, 0);
        ctx.quadraticCurveTo(.17, .2, 0, .5);
        ctx.quadraticCurveTo(-.17, .2, -.41, 0);
        ctx.quadraticCurveTo(-.17, -.2, 0, -.5);
    }
    else if (suit === 'SPADES') {
        ctx.moveTo(0, -.5);
        ctx.bezierCurveTo(.1, -.32, .5, -.1, .5, .13);
        ctx.bezierCurveTo(.5, .31, .37, .39, .25, .39);
        ctx.bezierCurveTo(.15, .39, .07, .34, .035, .25);
        ctx.quadraticCurveTo(.05, .42, .17, .5);
        ctx.lineTo(-.17, .5);
        ctx.quadraticCurveTo(-.05, .42, -.035, .25);
        ctx.bezierCurveTo(-.07, .34, -.15, .39, -.25, .39);
        ctx.bezierCurveTo(-.37, .39, -.5, .31, -.5, .13);
        ctx.bezierCurveTo(-.5, -.1, -.1, -.32, 0, -.5);
    }
    else {
        // Clubs: three leaves and a foot
        for (const [cx, cy] of [[0, -.27], [-.26, .07], [.26, .07]]) {
            ctx.moveTo(cx + .225, cy);
            ctx.arc(cx, cy, .225, 0, Math.PI * 2);
        }
        ctx.moveTo(.09, 0);
        ctx.arc(0, 0, .09, 0, Math.PI * 2);
        ctx.moveTo(-.035, .05);
        ctx.quadraticCurveTo(-.05, .42, -.17, .5);
        ctx.lineTo(.17, .5);
        ctx.quadraticCurveTo(.05, .42, .035, .05);
        ctx.closePath();
    }
    ctx.fill();
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
        ctx.font = `700 ${rank.length > 1 ? 40 : 48}px ${SERIF}`;
        ctx.fillText(rank, 31, 56);
        pip(ctx, suit, 31, 82, 30);
        ctx.restore();
    }
}
export function face(card, vintage = false) {
    const [c, ctx] = canvas(CW, CH);
    paper(ctx, vintage);
    const color = card.isRed ? (vintage ? VINTAGE_RED : RED) : (vintage ? VINTAGE_BLACK : BLACK);
    ctx.fillStyle = color;
    corner(ctx, rankLabel(card.value), card.suit);
    const courtName = court(card.value);
    if (card.value === 'ACE') {
        pip(ctx, card.suit, CW / 2, CH / 2, 132);
    }
    else if (courtName) {
        // Court card: a painted tile with the initial (no portrait art)
        const x = 58, y = 58, w = CW - 116, h = CH - 116;
        const frame = vintage ? '#c99a2e' : DELFT;
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        if (vintage) {
            g.addColorStop(0, card.isRed ? '#fbe3dc' : '#e2e5ef');
            g.addColorStop(1, card.isRed ? '#f3cfc4' : '#cfd4e3');
        }
        else {
            g.addColorStop(0, '#f1f5fc');
            g.addColorStop(1, '#dde7f6');
        }
        roundRect(ctx, x, y, w, h, 8);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = frame;
        ctx.stroke();
        roundRect(ctx, x + 7, y + 7, w - 14, h - 14, 4);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        if (!vintage) {
            // Corners of a Delft tile: two small arcs in each corner of the frame
            ctx.lineWidth = 1.6;
            for (const [px, py, from] of [[x + 7, y + 7, 0], [x + w - 7, y + 7, .5], [x + w - 7, y + h - 7, 1], [x + 7, y + h - 7, 1.5]]) {
                for (const r of [11, 18]) {
                    ctx.beginPath();
                    ctx.arc(px, py, r, from * Math.PI, (from + .5) * Math.PI);
                    ctx.stroke();
                }
            }
        }
        ctx.fillStyle = color;
        pip(ctx, card.suit, CW / 2, y + 34, 28);
        pip(ctx, card.suit, CW / 2, y + h - 34, 28, true);
        ctx.font = `700 92px ${SERIF}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(rankLabel(card.value), CW / 2, y + 134);
        ctx.font = `italic 600 18px ${SERIF}`;
        ctx.fillText(courtName, CW / 2, y + 160);
        if (card.value === 'KING' && card.isRed) {
            // Red king: worth 0 point, worth showing: a tag on the frame of the tile
            roundRect(ctx, CW / 2 - 31, y - 13, 62, 26, 13);
            ctx.fillStyle = vintage ? '#1f7a4d' : DELFT;
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `700 15px ${SANS}`;
            ctx.textBaseline = 'middle';
            ctx.fillText('0 pt', CW / 2, y + 1);
        }
    }
    else {
        const left = 80, right = CW - 80, top = 70, bottom = CH - 70;
        for (const [col, row] of PIPS[card.value]) {
            const x = left + (right - left) * col / 2;
            const y = top + (bottom - top) * row;
            pip(ctx, card.suit, x, y, 38, row > .5);
        }
    }
    return c;
}
/** Glazes of the card backs: `light` and `dark` for the ground, `paint` for the drawing in the roundel */
export const BACK_COLORS = {
    delft: { name: 'Bleu de Delft', light: '#2a58c8', dark: DELFT_DARK, paint: DELFT },
    manganese: { name: 'Manganèse', light: '#7a4a9e', dark: '#4a2867', paint: '#5a3277' },
    oranje: { name: 'Orange', light: '#f47a2c', dark: '#cf4f0c', paint: '#d9560f' },
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
    ctx.font = `700 ${rank.length > 1 ? 126 : 156}px ${SERIF}`;
    ctx.fillText(rank, CW / 2, CH * .31);
    pip(ctx, card.suit, CW / 2, CH * .72, 128);
    if (card.value === 'KING' && card.isRed) {
        roundRect(ctx, CW - 92, 14, 78, 40, 20);
        ctx.fillStyle = vintage ? '#1f7a4d' : DELFT;
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
/** A tulip seen from the side, its foot on (0, 0), its head upwards: 50 high */
function tulip(ctx, color, ground) {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.lineTo(0, -17);
    ctx.stroke();
    // Leaves
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.quadraticCurveTo(side * 15, -5, side * 18, -21);
        ctx.quadraticCurveTo(side * 6, -15, 0, -9);
        ctx.fill();
    }
    // Head: three petals
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.bezierCurveTo(-17, -16, -20, -32, -15, -46);
    ctx.quadraticCurveTo(-10, -41, -7, -37);
    ctx.quadraticCurveTo(-4, -45, 0, -50);
    ctx.quadraticCurveTo(4, -45, 7, -37);
    ctx.quadraticCurveTo(10, -41, 15, -46);
    ctx.bezierCurveTo(20, -32, 17, -16, 0, -16);
    ctx.fill();
    ctx.strokeStyle = ground;
    ctx.lineWidth = 1.7;
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 7, -37);
        ctx.quadraticCurveTo(side * 9, -26, 0, -18);
        ctx.stroke();
    }
}
/**
 *  Back of the cards: a glazed tile. Coloured ground sown with dots, white frame with tile corners,
 *  and a white roundel with two tulips head to tail (the same picture whichever way the card is turned)
 */
export function back(color) {
    const colors = BACK_COLORS[color] ?? BACK_COLORS.delft;
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
    // Sown with small dots, in staggered rows
    ctx.fillStyle = 'rgba(255, 255, 255, .2)';
    for (let row = 0, y = m + 9; y < CH - m; y += 13, row++) {
        for (let x = m + 9 + (row % 2) * 7.5; x < CW - m; x += 15) {
            ctx.beginPath();
            ctx.arc(x, y, 1.7, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
    // White frame, and the corners of a tile: two arcs and a dot in each corner
    const f = m + 9;
    ctx.strokeStyle = 'rgba(255, 255, 255, .92)';
    ctx.fillStyle = 'rgba(255, 255, 255, .92)';
    roundRect(ctx, f, f, CW - 2 * f, CH - 2 * f, 7);
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.lineWidth = 2;
    for (const [px, py, from] of [[f, f, 0], [CW - f, f, .5], [CW - f, CH - f, 1], [f, CH - f, 1.5]]) {
        for (const r of [20, 31]) {
            ctx.beginPath();
            ctx.arc(px, py, r, from * Math.PI, (from + .5) * Math.PI);
            ctx.stroke();
        }
        const a = (from + .25) * Math.PI;
        ctx.beginPath();
        ctx.arc(px + Math.cos(a) * 42, py + Math.sin(a) * 42, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    // Roundel with a row of pearls around it
    const cx = CW / 2, cy = CH / 2, r = 61;
    for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * (r + 10), cy + Math.sin(a) * (r + 10), 3.4, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = FAIENCE;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = colors.paint;
    ctx.stroke();
    for (const turn of [0, Math.PI]) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(turn);
        tulip(ctx, colors.paint, FAIENCE);
        ctx.restore();
    }
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
    g.addColorStop(.18, 'rgba(255,236,208,.95)');
    g.addColorStop(.45, 'rgba(255,190,120,.45)');
    g.addColorStop(.75, 'rgba(255,160,80,.12)');
    g.addColorStop(1, 'rgba(255,150,70,0)');
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
    g.addColorStop(0, 'rgba(255,214,170,0)');
    g.addColorStop(.62, 'rgba(255,214,170,0)');
    g.addColorStop(.8, 'rgba(255,240,222,.85)');
    g.addColorStop(.88, 'rgba(255,190,120,.35)');
    g.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 128, 0, Math.PI * 2);
    ctx.fill();
    return c;
}
/** A round pool of light (under the hand of the player whose turn it is), stretched into an ellipse */
export function spot(color = '255, 196, 140') {
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
/** Looks of the flat table, named after glazes: top, rim and room go together */
export const TABLE_THEMES = {
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
};
/** The same pattern every time the table is drawn again (resize, rotation) */
function seeded(seed) {
    return () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
    };
}
/** Points on an ellipse, the same distance apart along its line */
function alongEllipse(cx, cy, rx, ry, spacing) {
    const steps = 720;
    const lengths = [0];
    let px = cx + rx, py = cy;
    for (let i = 1; i <= steps; i++) {
        const a = i / steps * Math.PI * 2;
        const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
        lengths.push(lengths[i - 1] + Math.hypot(x - px, y - py));
        px = x;
        py = y;
    }
    const total = lengths[steps];
    const count = Math.max(8, Math.round(total / spacing));
    const points = [];
    let i = 0;
    for (let k = 0; k < count; k++) {
        const target = k / count * total;
        while (lengths[i + 1] < target)
            i++;
        const a = (i + (target - lengths[i]) / (lengths[i + 1] - lengths[i] || 1)) / steps * Math.PI * 2;
        points.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return points;
}
/**
 *  The room and the table: a tiled room, a dark glazed rim with a row of pearls, a top glazed in colour
 *  with the uneven wash of a brush, a line and the game name painted on it
 */
export function drawTable(w, h, shape, resolution, theme = 'delft') {
    const colors = TABLE_THEMES[theme] ?? TABLE_THEMES.delft;
    const [c, ctx] = canvas(Math.round(w * resolution), Math.round(h * resolution));
    ctx.scale(resolution, resolution);
    const { cx, cy, rx, ry } = shape;
    const room = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * .8);
    room.addColorStop(0, colors.room[0]);
    room.addColorStop(1, colors.room[1]);
    ctx.fillStyle = room;
    ctx.fillRect(0, 0, w, h);
    // Tiles of the room: faint joints, a small diamond where four tiles meet
    const tile = Math.max(54, Math.min(96, Math.min(w, h) / 8));
    const ox = (cx % tile) - tile, oy = (cy % tile) - tile;
    ctx.strokeStyle = `rgba(${colors.ink}, .045)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox; x < w + tile; x += tile) {
        ctx.moveTo(Math.round(x) + .5, 0);
        ctx.lineTo(Math.round(x) + .5, h);
    }
    for (let y = oy; y < h + tile; y += tile) {
        ctx.moveTo(0, Math.round(y) + .5);
        ctx.lineTo(w, Math.round(y) + .5);
    }
    ctx.stroke();
    ctx.fillStyle = `rgba(${colors.ink}, .07)`;
    for (let x = ox; x < w + tile; x += tile) {
        for (let y = oy; y < h + tile; y += tile) {
            ctx.beginPath();
            ctx.moveTo(x, y - 4);
            ctx.lineTo(x + 4, y);
            ctx.lineTo(x, y + 4);
            ctx.lineTo(x - 4, y);
            ctx.fill();
        }
    }
    const rail = Math.max(10, Math.min(rx, ry) * .07);
    // Shadow of the table on the floor
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.7)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    const rim = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    rim.addColorStop(0, colors.rail[0]);
    rim.addColorStop(.5, colors.rail[1]);
    rim.addColorStop(1, colors.rail[2]);
    ctx.fillStyle = rim;
    ctx.fill();
    ctx.restore();
    // Shine of the glaze on the rim
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - 1.5, ry - 1.5, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.strokeStyle = `rgba(${colors.inlay}, .3)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Row of pearls painted along the rim
    ctx.fillStyle = `rgba(${colors.inlay}, .4)`;
    const pearl = Math.max(1.2, rail * .09);
    for (const [x, y] of alongEllipse(cx, cy, rx - rail / 2, ry - rail / 2, pearl * 7)) {
        ctx.beginPath();
        ctx.arc(x, y, pearl, 0, Math.PI * 2);
        ctx.fill();
    }
    // Table top
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - rail, ry - rail, 0, 0, Math.PI * 2);
    ctx.clip();
    const top = ctx.createRadialGradient(cx, cy - ry * .2, 0, cx, cy, Math.max(rx, ry));
    top.addColorStop(0, colors.felt[0]);
    top.addColorStop(.6, colors.felt[1]);
    top.addColorStop(1, colors.felt[2]);
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, w, h);
    // Wash of the brush: wide soft patches, a little lighter or darker
    const random = seeded(11);
    for (let i = 0; i < 26; i++) {
        const x = cx + (random() * 2 - 1) * rx, y = cy + (random() * 2 - 1) * ry;
        const r = Math.min(rx, ry) * (.25 + random() * .45);
        const wash = ctx.createRadialGradient(x, y, 0, x, y, r);
        const tone = random() < .5 ? '255, 255, 255' : '6, 12, 40';
        wash.addColorStop(0, `rgba(${tone}, ${.035 + random() * .035})`);
        wash.addColorStop(1, `rgba(${tone}, 0)`);
        ctx.fillStyle = wash;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Fine grain
    const [noise, n] = canvas(96, 96);
    const pixels = n.createImageData(96, 96);
    for (let i = 0; i < pixels.data.length; i += 4) {
        const v = random() * 255;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
        pixels.data[i + 3] = 8;
    }
    n.putImageData(pixels, 0, 0);
    ctx.fillStyle = ctx.createPattern(noise, 'repeat');
    ctx.fillRect(0, 0, w, h);
    // Soft light from above the table
    const light = ctx.createRadialGradient(cx, cy - ry * .35, 0, cx, cy - ry * .35, Math.max(rx, ry) * .9);
    light.addColorStop(0, 'rgba(255, 255, 255, .10)');
    light.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, w, h);
    // Inner shadow under the rim
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - rail + 14, ry - rail + 14, 0, 0, Math.PI * 2);
    ctx.lineWidth = 28;
    ctx.shadowColor = 'rgba(3, 6, 20, .55)';
    ctx.shadowBlur = 24;
    ctx.strokeStyle = 'rgba(3, 6, 20, .55)';
    ctx.stroke();
    ctx.restore();
    // White line between the rim and the top
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - rail + 1, ry - rail + 1, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${colors.inlay}, .7)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Painted line and name
    ctx.beginPath();
    ctx.ellipse(cx, cy, (rx - rail) * .8, (ry - rail) * .76, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${colors.ink}, .16)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const size = Math.min(rx, ry) * .2;
    ctx.font = `italic 700 ${size}px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${colors.ink}, .09)`;
    ctx.fillText('Dutch', cx, cy + (ry - rail) * .5);
    return c;
}
