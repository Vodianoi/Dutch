import { CanvasSource, Texture } from 'pixi.js';
/**
 *  Everything drawn for the prototype: card faces and back, shadows, glows, the table.
 *  Drawn once with the 2D canvas and turned into textures: no image file to load.
 */
import { CH, CW } from './size.js';
export { CH, CW };
const RADIUS = 18;
export const SERIF = '"Playfair Display", Georgia, serif';
export const SANS = 'Outfit, system-ui, sans-serif';
export const EMOJI = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
const RED = '#c4202f';
const BLACK = '#1c1c26';
const SYMBOLS = { HEARTS: '♥', DIAMONDS: '♦', CLUBS: '♣', SPADES: '♠' };
const RANKS = {
    ACE: 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
    '8': '8', '9': '9', '10': '10', JACK: 'V', QUEEN: 'D', KING: 'R',
};
const COURT = { JACK: 'VALET', QUEEN: 'DAME', KING: 'ROI' };
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
function paper(ctx) {
    const g = ctx.createLinearGradient(0, 0, CW, CH);
    g.addColorStop(0, '#fffefa');
    g.addColorStop(1, '#efe9db');
    roundRect(ctx, 1, 1, CW - 2, CH - 2, RADIUS);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(40, 30, 20, .22)';
    ctx.stroke();
}
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
function face(card) {
    const [c, ctx] = canvas(CW, CH);
    paper(ctx);
    const color = card.isRed ? RED : BLACK;
    const suit = SYMBOLS[card.suit];
    ctx.fillStyle = color;
    corner(ctx, RANKS[card.value], suit);
    const court = COURT[card.value];
    if (card.value === 'ACE') {
        symbol(ctx, suit, CW / 2, CH / 2, 150);
    }
    else if (court) {
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
        ctx.fillText(RANKS[card.value], CW / 2, CH / 2 + 6);
        ctx.font = `700 15px ${SANS}`;
        ctx.letterSpacing = '3px';
        ctx.fillText(court, CW / 2 + 1.5, y + h - 72);
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
function back(color) {
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
function halo(color, blur, pad, alpha, grow = 0) {
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
function spark() {
    const [c, ctx] = canvas(32, 32);
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(.3, 'rgba(255,220,130,.9)');
    g.addColorStop(1, 'rgba(255,190,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return c;
}
/**
 *  Texture with mipmaps: cards drawn much smaller than their 240px source (opponents' hands) stay smooth
 */
export function smooth(canvas) {
    return new Texture({ source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' }) });
}
export function makeArt(backColor = 'red') {
    const faces = new Map();
    return {
        face(card) {
            const key = `${card.value}-${card.suit}`;
            let texture = faces.get(key);
            if (!texture) {
                texture = smooth(face(card));
                faces.set(key, texture);
            }
            return texture;
        },
        back: smooth(back(backColor)),
        shadow: smooth(halo('rgba(0,0,0,1)', 22, 44, .6)),
        // The solid part of the glow goes past the card edge so that it shows at small sizes
        glow: smooth(halo('#ffd166', 30, 70, 1, 14)),
        spark: Texture.from(spark()),
    };
}
/**
 *  The room and the table: wooden rail, felt with a little grain, the game name printed on the felt
 */
export function drawTable(w, h, shape, resolution) {
    const [c, ctx] = canvas(Math.round(w * resolution), Math.round(h * resolution));
    ctx.scale(resolution, resolution);
    const { cx, cy, rx, ry } = shape;
    const room = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * .8);
    room.addColorStop(0, '#2a1f17');
    room.addColorStop(1, '#0a0705');
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
    wood.addColorStop(0, '#9a6232');
    wood.addColorStop(.5, '#6b3c1c');
    wood.addColorStop(1, '#4a2710');
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
    // Felt
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - rail, ry - rail, 0, 0, Math.PI * 2);
    ctx.clip();
    const felt = ctx.createRadialGradient(cx, cy - ry * .2, 0, cx, cy, Math.max(rx, ry));
    felt.addColorStop(0, '#24885a');
    felt.addColorStop(.6, '#176642');
    felt.addColorStop(1, '#0c3f28');
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, w, h);
    // Grain
    const [noise, n] = canvas(96, 96);
    const pixels = n.createImageData(96, 96);
    for (let i = 0; i < pixels.data.length; i += 4) {
        const v = Math.random() * 255;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
        pixels.data[i + 3] = 13;
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
    // Gold inlay between the rail and the felt
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - rail + 1, ry - rail + 1, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(233, 196, 106, .55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Printed line and name
    ctx.beginPath();
    ctx.ellipse(cx, cy, (rx - rail) * .8, (ry - rail) * .76, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 236, 190, .12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    const size = Math.min(rx, ry) * .2;
    ctx.font = `italic 900 ${size}px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 236, 190, .07)';
    ctx.fillText('Dutch', cx, cy + (ry - rail) * .5);
    return c;
}
