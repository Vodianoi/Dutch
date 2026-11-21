import { rankLabel, valueName } from '../i18n.js';
import { CH, CW } from './size.js';
import { first, theme } from './themes.js';
export { CH, CW };
const RADIUS = 18;
/** Fonts of the 3D prototype and of its vintage cards (the flat table takes the fonts of the theme) */
export const SERIF = 'Lora, Georgia, serif';
export const SANS = '"Fira Sans", system-ui, sans-serif';
export const EMOJI = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
/** Name written on the court cards, in the language of this device (Valet / Jack…) */
const court = (value) => ['JACK', 'QUEEN', 'KING'].includes(value) ? valueName(value) : undefined;
/** How many pixels per unit the pictures are drawn with (see drawnAt) */
let density = 1;
/**
 *  Draw pictures bigger: the same drawings on canvases `scale` times the size.
 *  For cards looked at closely (a card held up on the 3D table). Faces and backs only: the soft lights
 *  (halo, glowArt) are drawn with shadows, which do not follow the scale.
 */
export function drawnAt(scale, draw) {
    const before = density;
    density = scale;
    try {
        return draw();
    }
    finally {
        density = before;
    }
}
function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.round(w * density);
    c.height = Math.round(h * density);
    const ctx = c.getContext('2d');
    if (density !== 1)
        ctx.scale(density, density);
    return [c, ctx];
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
    const look = theme().cards;
    const g = ctx.createLinearGradient(0, 0, CW, CH);
    g.addColorStop(0, vintage ? '#f7efd9' : look.paper[0]);
    g.addColorStop(1, vintage ? '#e6d9b8' : look.paper[1]);
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
    ctx.strokeStyle = vintage ? 'rgba(90, 60, 25, .35)' : look.edge;
    ctx.stroke();
}
/** Ink of the vintage cards: a little warmer, like printed on old card stock */
const VINTAGE_RED = '#a3192b';
const VINTAGE_BLACK = '#1e1813';
/** What the faces are printed with: the theme of this device, or the old casino cards of the 3D prototype */
function print(vintage) {
    const look = theme().cards;
    return vintage ? {
        red: VINTAGE_RED, black: VINTAGE_BLACK, family: SERIF, weight: 700, cap: .71, scale: 1, sans: SANS,
        courtFill: null, frame: '#c99a2e', corners: false, courtName: 'italic 600 18px', tag: { fill: '#1f7a4d', text: '#ffffff' },
    } : {
        red: look.red, black: look.black, family: look.rank.family, weight: look.rank.weight, cap: look.rank.cap, scale: look.rank.scale, sans: theme().body,
        courtFill: look.court.fill, frame: look.court.frame, corners: look.court.corners, courtName: look.courtName, tag: look.tag,
    };
}
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
function corner(ctx, rank, suit, font) {
    for (const flip of [false, true]) {
        ctx.save();
        if (flip) {
            ctx.translate(CW, CH);
            ctx.rotate(Math.PI);
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = font(rank.length > 1 ? 40 : 48);
        ctx.fillText(rank, 31, 56);
        pip(ctx, suit, 31, 82, 30);
        ctx.restore();
    }
}
export function face(card, vintage = false) {
    const [c, ctx] = canvas(CW, CH);
    paper(ctx, vintage);
    const p = print(vintage);
    // Sizes are given for a font whose capitals are .71 of its size high
    const font = (size) => `${p.weight} ${Math.round(size * .71 / p.cap * p.scale)}px ${p.family}`;
    const color = card.isRed ? p.red : p.black;
    ctx.fillStyle = color;
    corner(ctx, rankLabel(card.value), card.suit, font);
    const courtName = court(card.value);
    if (card.value === 'ACE') {
        pip(ctx, card.suit, CW / 2, CH / 2, 132);
    }
    else if (courtName) {
        // Court card: a framed panel with the initial (no portrait art)
        const x = 58, y = 58, w = CW - 116, h = CH - 116;
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, p.courtFill ? p.courtFill[0] : card.isRed ? '#fbe3dc' : '#e2e5ef');
        g.addColorStop(1, p.courtFill ? p.courtFill[1] : card.isRed ? '#f3cfc4' : '#cfd4e3');
        roundRect(ctx, x, y, w, h, 8);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = p.frame;
        ctx.stroke();
        roundRect(ctx, x + 7, y + 7, w - 14, h - 14, 4);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        if (p.corners) {
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
        ctx.font = font(92);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(rankLabel(card.value), CW / 2, y + 134);
        ctx.font = `${p.courtName} ${p.courtName.startsWith('italic') ? p.family : p.sans}`;
        ctx.fillText(courtName, CW / 2, y + 160);
        if (card.value === 'KING' && card.isRed) {
            // Red king: worth 0 point, worth showing: a tag on the frame of the panel
            roundRect(ctx, CW / 2 - 31, y - 13, 62, 26, 13);
            ctx.fillStyle = p.tag.fill;
            ctx.fill();
            ctx.fillStyle = p.tag.text;
            ctx.font = `700 15px ${p.sans}`;
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
/** The card backs of the theme of this device (the first one is its default) */
export function backs() {
    return theme().backs;
}
/** The tables of the theme of this device (the first one is its default) */
export function tables() {
    return theme().tables;
}
/**
 *  Face for small cards (opponents' hands): only a big rank and a big suit, readable at 20–40px
 */
export function compactFace(card, vintage = false) {
    const [c, ctx] = canvas(CW, CH);
    paper(ctx, vintage);
    const p = print(vintage);
    ctx.fillStyle = card.isRed ? p.red : p.black;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const rank = rankLabel(card.value);
    const size = Math.round((rank.length > 1 ? 126 : 156) * .71 / p.cap * p.scale);
    ctx.font = `${p.weight} ${size}px ${p.family}`;
    // The capitals and figures, centred on a third of the card
    ctx.fillText(rank, CW / 2, CH * .31 + size * p.cap / 2);
    pip(ctx, card.suit, CW / 2, CH * .72, 128);
    if (card.value === 'KING' && card.isRed) {
        roundRect(ctx, CW - 92, 14, 78, 40, 20);
        ctx.fillStyle = p.tag.fill;
        ctx.fill();
        ctx.fillStyle = p.tag.text;
        ctx.font = `800 26px ${p.sans}`;
        ctx.textBaseline = 'middle';
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
/** A star with `points` branches, alternately `outer` and `inner` long, centred on (0, 0) */
function star(ctx, points, outer, inner, turn = 0) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const a = turn + i / (points * 2) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? inner : outer;
        if (i)
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else
            ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
}
/** Lines in both diagonals, `step` apart, over the whole card */
function lattice(ctx, step) {
    ctx.beginPath();
    for (let i = -CH; i < CW + CH; i += step) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i + CH, CH);
        ctx.moveTo(i, CH);
        ctx.lineTo(i + CH, 0);
    }
    ctx.stroke();
}
/**
 *  Back of the cards, in the theme of this device. Every back is the same picture whichever way the card is turned.
 *  - tulip: a glazed tile, sown with dots, a white roundel with two tulips head to tail
 *  - star: a lattice and a spur star in a medallion
 *  - fan: gold rays and a lozenge
 *  - burst: harlequin diamonds and a starburst
 *  - mark: a flat colour and a small sign
 */
export function back(color) {
    const colors = backs()[color] ?? backs()[first(backs())];
    const style = theme().backStyle;
    const [c, ctx] = canvas(CW, CH);
    paper(ctx);
    const m = 12;
    const cx = CW / 2, cy = CH / 2;
    const g = ctx.createLinearGradient(0, 0, CW, CH);
    g.addColorStop(0, colors.light);
    g.addColorStop(1, colors.dark);
    roundRect(ctx, m, m, CW - 2 * m, CH - 2 * m, RADIUS - 6);
    ctx.fillStyle = g;
    ctx.fill();
    const f = m + 9;
    const frame = (inset, width, radius = 7) => {
        roundRect(ctx, inset, inset, CW - 2 * inset, CH - 2 * inset, radius);
        ctx.lineWidth = width;
        ctx.stroke();
    };
    if (style === 'tulip') {
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
        ctx.strokeStyle = 'rgba(255, 255, 255, .92)';
        ctx.fillStyle = 'rgba(255, 255, 255, .92)';
        frame(f, 2.4);
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
        const r = 61;
        for (let i = 0; i < 20; i++) {
            const a = i / 20 * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * (r + 10), cy + Math.sin(a) * (r + 10), 3.4, 0, Math.PI * 2);
            ctx.fill();
        }
        const ground = theme().cards.paper[1];
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = ground;
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
            tulip(ctx, colors.paint, ground);
            ctx.restore();
        }
    }
    else if (style === 'star') {
        // Lattice of an old pack, a double frame, and a spur star in a medallion
        ctx.save();
        ctx.clip();
        ctx.globalAlpha = .26;
        ctx.strokeStyle = colors.paint;
        ctx.lineWidth = 1.8;
        lattice(ctx, 20);
        ctx.restore();
        ctx.strokeStyle = colors.paint;
        frame(f, 2.6, 5);
        frame(f + 6, 1, 3);
        ctx.beginPath();
        ctx.arc(cx, cy, 62, 0, Math.PI * 2);
        ctx.fillStyle = colors.dark;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 54, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = colors.paint;
        star(ctx, 4, 30, 11, Math.PI / 4);
        ctx.fill();
        star(ctx, 4, 47, 12);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fillStyle = colors.dark;
        ctx.fill();
        ctx.restore();
    }
    else if (style === 'fan') {
        // Rays from the middle, a triple frame, a lozenge
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = colors.paint;
        ctx.globalAlpha = .38;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 40; i++) {
            const a = i / 40 * Math.PI * 2;
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * CH, cy + Math.sin(a) * CH);
        }
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = colors.paint;
        frame(f, 2.6, 2);
        frame(f + 5, .9, 1);
        frame(f + 9, .9, 1);
        const lozenge = (rx, ry) => {
            ctx.beginPath();
            ctx.moveTo(cx, cy - ry);
            ctx.lineTo(cx + rx, cy);
            ctx.lineTo(cx, cy + ry);
            ctx.lineTo(cx - rx, cy);
            ctx.closePath();
        };
        lozenge(60, 96);
        ctx.fillStyle = colors.dark;
        ctx.fill();
        ctx.lineWidth = 2.6;
        ctx.stroke();
        lozenge(47, 76);
        ctx.lineWidth = 1;
        ctx.stroke();
        lozenge(20, 32);
        ctx.fillStyle = colors.paint;
        ctx.fill();
        // Stepped fans above and below the middle
        ctx.lineWidth = 1.6;
        for (const side of [-1, 1]) {
            for (const [dy, half] of [[46, 14], [58, 8]]) {
                ctx.beginPath();
                ctx.moveTo(cx - half, cy + side * dy);
                ctx.lineTo(cx + half, cy + side * dy);
                ctx.stroke();
            }
        }
    }
    else if (style === 'burst') {
        // Harlequin diamonds, a round frame, a starburst and four sparkles
        ctx.save();
        ctx.clip();
        ctx.globalAlpha = .2;
        ctx.strokeStyle = colors.paint;
        ctx.lineWidth = 1.6;
        lattice(ctx, 28);
        ctx.restore();
        ctx.strokeStyle = colors.paint;
        frame(f, 3.2, 12);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = colors.paint;
        star(ctx, 8, 30, 9, Math.PI / 8);
        ctx.fill();
        star(ctx, 8, 70, 10);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fillStyle = theme().ui.accent;
        ctx.fill();
        ctx.fillStyle = colors.paint;
        for (const [dx, dy] of [[-62, -112], [62, -112], [62, 112], [-62, 112]]) {
            ctx.save();
            ctx.translate(dx, dy);
            star(ctx, 4, 17, 4);
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }
    else {
        // Flat colour, a thin line, a small sign: a square on its corner and a dot
        ctx.strokeStyle = colors.paint;
        ctx.globalAlpha = .32;
        frame(f + 2, 1.6, 9);
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        roundRect(ctx, -30, -30, 60, 60, 12);
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.fillStyle = colors.paint;
        ctx.fill();
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
/** A round speck of light: bright core, long soft fall-off in the light of the theme */
export function spark() {
    const light = theme().ui.light;
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,250,1)');
    g.addColorStop(.18, `rgba(${light}, .95)`);
    g.addColorStop(.45, `rgba(${light}, .45)`);
    g.addColorStop(.75, `rgba(${light}, .12)`);
    g.addColorStop(1, `rgba(${light}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();
    return c;
}
/** A soft round ring of light (shock wave when a card lands well) */
export function ring() {
    const light = theme().ui.light;
    const [c, ctx] = canvas(256, 256);
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, `rgba(${light}, 0)`);
    g.addColorStop(.62, `rgba(${light}, 0)`);
    g.addColorStop(.8, `rgba(${light}, .85)`);
    g.addColorStop(.88, `rgba(${light}, .35)`);
    g.addColorStop(1, `rgba(${light}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 128, 0, Math.PI * 2);
    ctx.fill();
    return c;
}
/** A round pool of light (under the hand of the player whose turn it is), stretched into an ellipse */
export function spot() {
    const color = theme().ui.light;
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
/** A small star with four thin branches */
function sparkle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
}
/** Floor or wall of the room, behind the table */
function drawRoom(ctx, w, h, cx, cy, colors) {
    const style = theme().table.room;
    const room = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * .8);
    room.addColorStop(0, colors.room[0]);
    room.addColorStop(1, colors.room[1]);
    ctx.fillStyle = room;
    ctx.fillRect(0, 0, w, h);
    const random = seeded(23);
    if (style === 'tiles') {
        // Faint joints, a small diamond where four tiles meet
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
    }
    else if (style === 'planks') {
        // Floor boards: each one a little lighter or darker, a dark joint, a few lines of grain
        const board = Math.max(58, Math.min(110, Math.min(w, h) / 7));
        for (let x = (cx % board) - board; x < w + board; x += board) {
            ctx.fillStyle = random() < .5 ? `rgba(255, 220, 170, ${.015 + random() * .03})` : `rgba(0, 0, 0, ${.05 + random() * .1})`;
            ctx.fillRect(x, 0, board, h);
            for (let k = 0; k < 4; k++) {
                const at = x + random() * board, wave = 1 + random() * 3, period = 160 + random() * 240, phase = random() * 6;
                ctx.beginPath();
                for (let y = 0; y <= h; y += 10) {
                    const side = at + Math.sin(y / period * Math.PI * 2 + phase) * wave;
                    if (y)
                        ctx.lineTo(side, y);
                    else
                        ctx.moveTo(side, y);
                }
                ctx.strokeStyle = `rgba(0, 0, 0, ${.07 + random() * .08})`;
                ctx.lineWidth = .6 + random();
                ctx.stroke();
            }
            ctx.fillStyle = 'rgba(0, 0, 0, .45)';
            ctx.fillRect(x - 1, 0, 2, h);
        }
    }
    else if (style === 'scales') {
        // Rows of arcs, each row half a step aside: the scales of a lacquered screen
        const r = Math.max(24, Math.min(40, Math.min(w, h) / 16));
        ctx.strokeStyle = `rgba(${colors.ink}, .06)`;
        ctx.lineWidth = 1;
        for (let row = 0, y = (cy % r) - r; y < h + r * 2; y += r, row++) {
            for (let x = (cx % (r * 2)) - r * 2 + (row % 2) * r; x < w + r * 2; x += r * 2) {
                ctx.beginPath();
                ctx.arc(x, y, r, Math.PI, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(x, y, r * .6, Math.PI, Math.PI * 2);
                ctx.stroke();
            }
        }
    }
    else if (style === 'stars') {
        // A night sky of small sparkles and dots
        const count = Math.round(w * h / 26000);
        for (let i = 0; i < count; i++) {
            const x = random() * w, y = random() * h;
            ctx.fillStyle = `rgba(${colors.ink}, ${.1 + random() * .22})`;
            if (random() < .35)
                sparkle(ctx, x, y, 4 + random() * 7);
            else {
                ctx.beginPath();
                ctx.arc(x, y, .8 + random() * 1.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    else {
        // A grid of dots
        const step = 22;
        ctx.fillStyle = `rgba(${colors.ink}, .09)`;
        for (let x = (cx % step) - step; x < w + step; x += step) {
            for (let y = (cy % step) - step; y < h + step; y += step) {
                ctx.beginPath();
                ctx.arc(x, y, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}
/**
 *  The room and the table, in the theme of this device: each theme has its room (tiles, floor boards, scales, night sky,
 *  dots), its rim (pearls, wood, gold lines, marquee bulbs, none) and its top (glaze, cloth, rays, diamonds, flat)
 */
export function drawTable(w, h, shape, resolution, table) {
    const colors = tables()[table ?? ''] ?? tables()[first(tables())];
    const style = theme().table;
    const [c, ctx] = canvas(Math.round(w * resolution), Math.round(h * resolution));
    ctx.scale(resolution, resolution);
    const { cx, cy, rx, ry } = shape;
    drawRoom(ctx, w, h, cx, cy, colors);
    const flat = style.rim === 'flat';
    const rail = Math.max(10, Math.min(rx, ry) * .07);
    const oval = (grow) => {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx + grow, ry + grow, 0, 0, Math.PI * 2);
    };
    // Shadow of the table on the floor
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${style.shadow})`;
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
    oval(0);
    const rim = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    rim.addColorStop(0, colors.rail[0]);
    rim.addColorStop(.5, colors.rail[1]);
    rim.addColorStop(1, colors.rail[2]);
    ctx.fillStyle = rim;
    ctx.fill();
    ctx.restore();
    if (style.rim === 'wood') {
        // Wood grain: thin rings along the rail
        ctx.save();
        oval(0);
        ctx.clip();
        for (let i = 0; i < 14; i++) {
            oval(-rail * i / 14);
            ctx.strokeStyle = i % 3 === 0 ? 'rgba(255, 210, 150, .07)' : 'rgba(40, 18, 5, .12)';
            ctx.lineWidth = .6 + (i % 4) * .35;
            ctx.stroke();
        }
        ctx.restore();
    }
    if (!flat) {
        // Shine on the top of the rim
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx - 1.5, ry - 1.5, 0, Math.PI * 1.1, Math.PI * 1.9);
        ctx.strokeStyle = style.rim === 'wood' ? 'rgba(255, 220, 170, .25)' : `rgba(${colors.inlay}, .3)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
    if (style.rim === 'pearls') {
        // Row of pearls painted along the rim
        ctx.fillStyle = `rgba(${colors.inlay}, .4)`;
        const pearl = Math.max(1.2, rail * .09);
        for (const [x, y] of alongEllipse(cx, cy, rx - rail / 2, ry - rail / 2, pearl * 7)) {
            ctx.beginPath();
            ctx.arc(x, y, pearl, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    else if (style.rim === 'gilt') {
        // Gold lines: one on the outer edge, a pair in the middle of the lacquer
        ctx.strokeStyle = `rgba(${colors.inlay}, .75)`;
        ctx.lineWidth = 1.5;
        oval(-1);
        ctx.stroke();
        ctx.strokeStyle = `rgba(${colors.inlay}, .4)`;
        ctx.lineWidth = 1;
        for (const at of [.42, .58]) {
            oval(-rail * at);
            ctx.stroke();
        }
    }
    else if (style.rim === 'bulbs') {
        // Marquee bulbs all around, one in two brighter
        const bulb = Math.max(2, rail * .17);
        alongEllipse(cx, cy, rx - rail / 2, ry - rail / 2, bulb * 5.2).forEach(([x, y], i) => {
            const bright = i % 2 === 0;
            const glow = ctx.createRadialGradient(x, y, 0, x, y, bulb * 2.6);
            glow.addColorStop(0, `rgba(${colors.inlay}, ${bright ? .55 : .25})`);
            glow.addColorStop(1, `rgba(${colors.inlay}, 0)`);
            ctx.fillStyle = glow;
            ctx.fillRect(x - bulb * 3, y - bulb * 3, bulb * 6, bulb * 6);
            ctx.beginPath();
            ctx.arc(x, y, bulb, 0, Math.PI * 2);
            ctx.fillStyle = bright ? '#fffbe8' : `rgba(${colors.inlay}, .75)`;
            ctx.fill();
        });
    }
    // Table top
    ctx.save();
    oval(-rail);
    ctx.clip();
    const top = ctx.createRadialGradient(cx, cy - ry * .2, 0, cx, cy, Math.max(rx, ry));
    top.addColorStop(0, colors.felt[0]);
    top.addColorStop(.6, colors.felt[1]);
    top.addColorStop(1, colors.felt[2]);
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, w, h);
    const random = seeded(11);
    if (colors.wood)
        woodTop(ctx, w, h, cx, cy, rx, ry);
    if (style.top === 'glaze') {
        // Wash of the brush: wide soft patches, a little lighter or darker
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
    }
    else if (style.top === 'rays') {
        // Thin rays from the middle of the table
        ctx.strokeStyle = `rgba(${colors.ink}, .07)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 48; i++) {
            const a = i / 48 * Math.PI * 2;
            ctx.moveTo(cx + Math.cos(a) * rx * .12, cy + Math.sin(a) * ry * .12);
            ctx.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
        }
        ctx.stroke();
    }
    else if (style.top === 'harlequin') {
        // Diamonds woven in the cloth
        const step = Math.max(34, Math.min(rx, ry) * .16);
        ctx.strokeStyle = `rgba(${colors.ink}, .055)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = -h; i < w + h; i += step) {
            ctx.moveTo(cx - w + i, 0);
            ctx.lineTo(cx - w + i + h * .62, h);
            ctx.moveTo(cx - w + i + h * .62, 0);
            ctx.lineTo(cx - w + i, h);
        }
        ctx.stroke();
    }
    if (style.top !== 'flat') {
        // Fine grain: cloth more than glaze
        const [noise, n] = canvas(96, 96);
        const pixels = n.createImageData(96, 96);
        for (let i = 0; i < pixels.data.length; i += 4) {
            const v = random() * 255;
            pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
            pixels.data[i + 3] = style.top === 'glaze' || colors.wood ? 8 : 13;
        }
        n.putImageData(pixels, 0, 0);
        ctx.fillStyle = ctx.createPattern(noise, 'repeat');
        ctx.fillRect(0, 0, w, h);
        // Soft light from above the table
        const light = ctx.createRadialGradient(cx, cy - ry * .35, 0, cx, cy - ry * .35, Math.max(rx, ry) * .9);
        light.addColorStop(0, 'rgba(255, 250, 235, .10)');
        light.addColorStop(1, 'rgba(255, 250, 235, 0)');
        ctx.fillStyle = light;
        ctx.fillRect(0, 0, w, h);
        // Inner shadow under the rim
        oval(-rail + 14);
        ctx.lineWidth = 28;
        ctx.shadowColor = 'rgba(0, 0, 0, .55)';
        ctx.shadowBlur = 24;
        ctx.strokeStyle = 'rgba(0, 0, 0, .55)';
        ctx.stroke();
    }
    ctx.restore();
    // Line between the rim and the top (the edge of a flat table)
    oval(flat ? -.75 : -rail + 1);
    ctx.strokeStyle = `rgba(${colors.inlay}, ${flat ? .16 : .7})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Line and name printed on the top
    ctx.beginPath();
    ctx.ellipse(cx, cy, (rx - rail) * .8, (ry - rail) * .76, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${colors.ink}, ${flat ? .08 : style.top === 'rays' ? .3 : .16})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const size = Math.min(rx, ry) * (style.name.spacing > .2 ? .11 : .2);
    ctx.font = `${style.name.font} ${size}px ${theme().display}`;
    ctx.letterSpacing = `${size * style.name.spacing}px`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${colors.ink}, ${style.name.alpha})`;
    // The space after the last letter would push the name off centre
    ctx.fillText(style.name.text, cx + size * style.name.spacing / 2, cy + (ry - rail) * .5);
    ctx.letterSpacing = '0px';
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
