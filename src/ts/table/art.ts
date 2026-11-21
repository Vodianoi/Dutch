import {CanvasSource, Texture} from 'pixi.js';
import Card from '../Card.js';
import {back, BackColor, compactFace, face, glowArt, halo, ring, spark, spot} from './cardArt.js';
import {ORANJE_LIGHT} from './palette.js';

export {BACK_COLORS, CH, CW, drawTable, EMOJI, SANS, SERIF, TABLE_THEMES} from './cardArt.js';
export type {BackColor, TableShape, TableTheme} from './cardArt.js';

/**
 *  Texture with mipmaps: cards drawn much smaller than their 240px source (opponents' hands) stay smooth
 */
export function smooth(canvas: HTMLCanvasElement): Texture {
    return new Texture({source: new CanvasSource({resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear'})});
}

export interface Art {
    face(card: Card): Texture;
    /** Face for cards shown small */
    compact(card: Card): Texture;
    back: Texture;
    shadow: Texture;
    glow: Texture;
    spark: Texture;
    /** Soft round ring of light */
    ring: Texture;
    /** Round pool of light */
    spot: Texture;
}

export function makeArt(backColor: BackColor = 'delft'): Art {
    const faces = new Map<string, Texture>();
    const compacts = new Map<string, Texture>();
    return {
        compact(card: Card) {
            const key = `${card.value}-${card.suit}`;
            let texture = compacts.get(key);
            if (!texture) {
                texture = smooth(compactFace(card));
                compacts.set(key, texture);
            }
            return texture;
        },
        face(card: Card) {
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
        glow: smooth(glowArt(ORANJE_LIGHT)),
        spark: smooth(spark()),
        ring: smooth(ring()),
        spot: smooth(spot()),
    };
}

