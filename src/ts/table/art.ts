import {CanvasSource, Texture} from 'pixi.js';
import Card from '../Card.js';
import {back, BackColor, compactFace, face, halo, spark} from './cardArt.js';

export {BACK_COLORS, CH, CW, drawTable, EMOJI, SANS, SERIF} from './cardArt.js';
export type {BackColor, TableShape} from './cardArt.js';

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
}

export function makeArt(backColor: BackColor = 'red'): Art {
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
        // The solid part of the glow goes past the card edge so that it shows at small sizes
        glow: smooth(halo('#ffd166', 30, 70, 1, 14)),
        spark: Texture.from(spark()),
    };
}

