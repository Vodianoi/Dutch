/**
 *  Materials of the 3D table, drawn with the 2D canvas: cloth, wood, floor boards, rug, tokens.
 *  Nothing is downloaded: the table works offline like the rest of the game, in the colours of the theme.
 *  Every drawing is the same each time (seeded random numbers).
 */

export type RGB = [number, number, number];

/** Random numbers that are the same each time, from 0 to 1 */
export function seeded(seed: number): () => number {
    let a = seed | 0;
    return () => {
        a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// region Colours
/** `#rrggbb` or "r, g, b" as numbers from 0 to 255 */
export function rgb(color: string): RGB {
    if (color.startsWith('#')) {
        const n = parseInt(color.slice(1), 16);
        return [n >> 16 & 255, n >> 8 & 255, n & 255];
    }
    const parts = color.split(',').map(part => parseInt(part, 10));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Brighter (factor above 1) or darker */
export function shade(color: RGB, factor: number): RGB {
    return [Math.min(255, color[0] * factor), Math.min(255, color[1] * factor), Math.min(255, color[2] * factor)];
}

export function css(color: RGB, alpha = 1): string {
    return `rgba(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])}, ${alpha})`;
}

/** Number for a Three.js colour */
export function hexOf(color: RGB): number {
    return (Math.round(color[0]) << 16) | (Math.round(color[1]) << 8) | Math.round(color[2]);
}
// endregion

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d', {willReadFrequently: true})!];
}

/** Fine grain over a whole canvas: every pixel a little lighter or darker */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, random: () => number) {
    const image = ctx.getImageData(0, 0, w, h);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
        const n = (random() - .5) * amount;
        d[i] += n;
        d[i + 1] += n;
        d[i + 2] += n;
    }
    ctx.putImageData(image, 0, 0);
}

/**
 *  Relief from a grey picture (light is high): the bluish picture the lighting reads slopes from.
 *  The picture tiles: its edges are read from the opposite side.
 */
function reliefOf(source: CanvasRenderingContext2D, size: number, strength: number): HTMLCanvasElement {
    const src = source.getImageData(0, 0, size, size).data;
    const [c, ctx] = canvas(size, size);
    const out = ctx.createImageData(size, size);
    const at = (x: number, y: number) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
            const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
            const length = Math.hypot(dx, dy, 1);
            const i = (y * size + x) * 4;
            out.data[i] = (-dx / length * .5 + .5) * 255;
            out.data[i + 1] = (dy / length * .5 + .5) * 255;
            out.data[i + 2] = (1 / length * .5 + .5) * 255;
            out.data[i + 3] = 255;
        }
    }
    ctx.putImageData(out, 0, 0);
    return c;
}

// region Cloth
/** Baize: a flat colour with the uneven look of brushed wool */
export function clothColor(color: RGB, size = 512): HTMLCanvasElement {
    const random = seeded(11);
    const [c, ctx] = canvas(size, size);
    ctx.fillStyle = css(color);
    ctx.fillRect(0, 0, size, size);
    // Soft lighter and darker clouds, drawn again across the edges so that the picture tiles
    for (let i = 0; i < 26; i++) {
        const x = random() * size, y = random() * size, r = size * (.12 + random() * .22);
        const tone = random() < .5 ? shade(color, 1.16) : shade(color, .84);
        for (const ox of [-size, 0, size]) {
            for (const oy of [-size, 0, size]) {
                const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
                g.addColorStop(0, css(tone, .2));
                g.addColorStop(1, css(tone, 0));
                ctx.fillStyle = g;
                ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
            }
        }
    }
    grain(ctx, size, size, 20, random);
    return c;
}

/** Relief of the cloth: short fibres lying in every direction */
export function clothRelief(size = 256): HTMLCanvasElement {
    const random = seeded(23);
    const [, ctx] = canvas(size, size);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    ctx.lineCap = 'round';
    for (let i = 0; i < 9000; i++) {
        const x = random() * size, y = random() * size;
        const angle = random() * Math.PI, length = 2 + random() * 5;
        const tone = random() < .5 ? 255 : 0;
        ctx.strokeStyle = `rgba(${tone}, ${tone}, ${tone}, ${.05 + random() * .12})`;
        ctx.lineWidth = .6 + random() * .9;
        for (const ox of [-size, 0, size]) {
            for (const oy of [-size, 0, size]) {
                if (x + ox < -8 || x + ox > size + 8 || y + oy < -8 || y + oy > size + 8) continue;
                ctx.beginPath();
                ctx.moveTo(x + ox, y + oy);
                ctx.lineTo(x + ox + Math.cos(angle) * length, y + oy + Math.sin(angle) * length);
                ctx.stroke();
            }
        }
    }
    grain(ctx, size, size, 26, random);
    return reliefOf(ctx, size, 2.2);
}

/** Relief of leather: small soft bumps */
export function leatherRelief(size = 256): HTMLCanvasElement {
    const random = seeded(31);
    const [, ctx] = canvas(size, size);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
        const x = random() * size, y = random() * size, r = 1.5 + random() * 4;
        const tone = random() < .6 ? 255 : 0;
        for (const ox of [-size, 0, size]) {
            for (const oy of [-size, 0, size]) {
                if (x + ox < -8 || x + ox > size + 8 || y + oy < -8 || y + oy > size + 8) continue;
                const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
                g.addColorStop(0, `rgba(${tone}, ${tone}, ${tone}, .22)`);
                g.addColorStop(1, `rgba(${tone}, ${tone}, ${tone}, 0)`);
                ctx.fillStyle = g;
                ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
            }
        }
    }
    return reliefOf(ctx, size, 1.6);
}
// endregion

// region Wood
/** Grain running along the picture: thin streaks, a few darker veins, slow waves */
function woodGrain(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, color: RGB, random: () => number, density = 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    ctx.fillStyle = css(color);
    ctx.fillRect(x0, y0, w, h);
    // Broad bands of the growth rings
    for (let i = 0; i < 5 * density; i++) {
        const y = y0 + random() * h, band = h * (.08 + random() * .2);
        const tone = random() < .5 ? shade(color, 1.22) : shade(color, .74);
        const g = ctx.createLinearGradient(0, y - band, 0, y + band);
        g.addColorStop(0, css(tone, 0));
        g.addColorStop(.5, css(tone, .3));
        g.addColorStop(1, css(tone, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x0, y - band, w, band * 2);
    }
    const lines = Math.round(h * .9 * density);
    for (let i = 0; i < lines; i++) {
        const y = y0 + random() * h;
        const dark = random() < .68;
        const tone = dark ? shade(color, .5 + random() * .25) : shade(color, 1.25 + random() * .25);
        ctx.strokeStyle = css(tone, .05 + random() * (dark ? .2 : .11));
        ctx.lineWidth = .5 + random() * 1.8;
        const wave = 1 + random() * 3.5, period = w * (.35 + random() * .8), phase = random() * 7;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 16) {
            const yy = y + Math.sin(x / period * Math.PI * 2 + phase) * wave;
            if (x === 0) ctx.moveTo(x0 + x, yy);
            else ctx.lineTo(x0 + x, yy);
        }
        ctx.stroke();
    }
    ctx.restore();
}

/** Varnished wood of the rim (its grain runs along the picture, which tiles along its length) */
export function wood(color: RGB, w = 1024, h = 256): HTMLCanvasElement {
    const random = seeded(47);
    const [c, ctx] = canvas(w, h);
    woodGrain(ctx, 0, 0, w, h, color, random);
    // The two ends are made alike so that the grain goes round the table without a visible seam
    const blend = 64;
    const [copy, copyCtx] = canvas(blend, h);
    copyCtx.drawImage(c, 0, 0, blend, h, 0, 0, blend, h);
    for (let x = 0; x < blend; x++) {
        ctx.globalAlpha = 1 - x / blend;
        ctx.drawImage(copy, blend - 1 - x, 0, 1, h, w - 1 - x, 0, 1, h);
    }
    ctx.globalAlpha = 1;
    grain(ctx, w, h, 8, random);
    return c;
}

/** Floor boards: rows of boards of uneven lengths and tones, dark joints */
export function boards(color: RGB, size = 1024): HTMLCanvasElement {
    const random = seeded(59);
    const [c, ctx] = canvas(size, size);
    const rows = 8, rowH = size / rows;
    for (let row = 0; row < rows; row++) {
        let x = -random() * size * .4;
        while (x < size) {
            const length = size * (.32 + random() * .4);
            const tone = shade(mix(color, [120, 80, 45], random() * .14), .8 + random() * .42);
            const from = Math.max(0, x), to = Math.min(size, x + length);
            if (to > from) woodGrain(ctx, from, row * rowH, to - from, rowH, tone, random, .5);
            // End of the board
            ctx.fillStyle = 'rgba(0, 0, 0, .55)';
            ctx.fillRect(x + length - 1.5, row * rowH, 3, rowH);
            x += length;
        }
        // Joint between two rows, with a thin light on its lower edge
        ctx.fillStyle = 'rgba(0, 0, 0, .62)';
        ctx.fillRect(0, row * rowH - 1.5, size, 3);
        ctx.fillStyle = 'rgba(255, 255, 255, .05)';
        ctx.fillRect(0, row * rowH + 1.5, size, 1.5);
    }
    grain(ctx, size, size, 10, random);
    return c;
}
// endregion

/**
 *  The wall at the end of the room, 4 m wide and 3 m high, already lit (it is shown as painted):
 *  wood panels up to the height of a chair, striped paper above, the warm pool of a wall lamp
 */
export function wall(paper: RGB, panel: RGB, w = 1024, h = 768): HTMLCanvasElement {
    const random = seeded(83);
    const [c, ctx] = canvas(w, h);
    const m = h / 3;
    ctx.fillStyle = css(paper);
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += w / 32) {
        ctx.fillStyle = css(shade(paper, 1.18), .5);
        ctx.fillRect(x, 0, w / 96, h);
    }
    // Panels: wood with upright grain, a moulded frame on each
    const top = h - m * .95;
    woodGrain(ctx, 0, top, w, h - top, panel, random, .6);
    const count = 8, pw = w / count;
    for (let i = 0; i < count; i++) {
        const x = i * pw + pw * .12, y = top + m * .14, pwi = pw * .76, ph = m * .58;
        ctx.strokeStyle = 'rgba(0, 0, 0, .55)';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, pwi, ph);
        ctx.strokeStyle = css(shade(panel, 1.7), .5);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 4, y + 4, pwi - 8, ph - 8);
    }
    // Rail above the panels, skirting board at the floor
    ctx.fillStyle = css(shade(panel, 1.3));
    ctx.fillRect(0, top - m * .04, w, m * .05);
    ctx.fillStyle = 'rgba(0, 0, 0, .5)';
    ctx.fillRect(0, top + m * .01, w, 3);
    ctx.fillStyle = css(shade(panel, .7));
    ctx.fillRect(0, h - m * .13, w, m * .13);
    ctx.fillStyle = css(shade(panel, 1.5), .6);
    ctx.fillRect(0, h - m * .13, w, 2);
    // Light: darker towards the ceiling and the floor, a warm pool in the middle
    const dark = ctx.createLinearGradient(0, 0, 0, h);
    dark.addColorStop(0, 'rgba(0, 0, 0, .7)');
    dark.addColorStop(.45, 'rgba(0, 0, 0, .15)');
    dark.addColorStop(1, 'rgba(0, 0, 0, .55)');
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, w, h);
    for (const ox of [0, w]) {
        const pool = ctx.createRadialGradient(ox, h * .42, 0, ox, h * .42, w * .42);
        pool.addColorStop(0, 'rgba(255, 196, 120, .3)');
        pool.addColorStop(1, 'rgba(255, 196, 120, 0)');
        ctx.fillStyle = pool;
        ctx.fillRect(0, 0, w, h);
    }
    grain(ctx, w, h, 8, random);
    return c;
}

// region Rug, tokens, cards
/** A wool rug: a border, two thin lines and a field sown with small lozenges */
export function rug(field: RGB, border: RGB, line: RGB, w = 768, h = 768): HTMLCanvasElement {
    const random = seeded(71);
    const [c, ctx] = canvas(w, h);
    ctx.fillStyle = css(border);
    ctx.fillRect(0, 0, w, h);
    const m = w * .085;
    ctx.fillStyle = css(field);
    ctx.fillRect(m, m, w - 2 * m, h - 2 * m);
    ctx.strokeStyle = css(line, .75);
    ctx.lineWidth = w * .008;
    ctx.strokeRect(m * .45, m * .45, w - m * .9, h - m * .9);
    ctx.strokeRect(m * 1.25, m * 1.25, w - m * 2.5, h - m * 2.5);
    // Field: lozenges a little lighter than the wool
    ctx.save();
    ctx.beginPath();
    ctx.rect(m * 1.4, m * 1.4, w - m * 2.8, h - m * 2.8);
    ctx.clip();
    ctx.strokeStyle = css(shade(field, 1.5), .35);
    ctx.lineWidth = w * .004;
    const step = w / 9;
    for (let i = -10; i < 20; i++) {
        ctx.beginPath();
        ctx.moveTo(i * step, 0);
        ctx.lineTo(i * step + h, h);
        ctx.moveTo(i * step, 0);
        ctx.lineTo(i * step - h, h);
        ctx.stroke();
    }
    ctx.restore();
    grain(ctx, w, h, 34, random);
    return c;
}

/** Top of a player's token: a clay chip in his colour, with his initial */
export function token(color: string, initial: string, font: string): HTMLCanvasElement {
    const size = 192;
    const [c, ctx] = canvas(size, size);
    const base = rgb(color);
    const r = size / 2;
    ctx.translate(r, r);
    ctx.fillStyle = css(base);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    // Light inserts on the edge
    ctx.fillStyle = 'rgba(255, 250, 235, .92)';
    for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate(i * Math.PI / 3);
        ctx.fillRect(-r * .13, -r, r * .26, r * .24);
        ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255, 250, 235, .85)';
    ctx.lineWidth = r * .045;
    ctx.beginPath();
    ctx.arc(0, 0, r * .7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = css(shade(base, .72));
    ctx.beginPath();
    ctx.arc(0, 0, r * .66, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 250, 235, .96)';
    ctx.font = `800 ${Math.round(r * .78)}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, 0, r * .04);
    return c;
}

/** Side of the draw pile: the edges of the cards, one above the other */
export function cardEdges(): HTMLCanvasElement {
    const [c, ctx] = canvas(8, 64);
    for (let y = 0; y < 64; y += 2) {
        ctx.fillStyle = y % 4 === 0 ? '#f3ecdc' : '#cfc7b4';
        ctx.fillRect(0, y, 8, 2);
    }
    return c;
}

/** Relief of the cards: the fine linen pattern pressed into playing cards */
export function linenRelief(size = 128): HTMLCanvasElement {
    const [, ctx] = canvas(size, size);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    const step = size / 32;
    for (let i = 0; i < 32; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(255, 255, 255, .2)' : 'rgba(0, 0, 0, .2)';
        ctx.fillRect(i * step, 0, step, size);
        ctx.fillRect(0, i * step, size, step);
    }
    return reliefOf(ctx, size, .9);
}
// endregion
