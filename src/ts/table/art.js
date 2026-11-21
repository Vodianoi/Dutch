import { CanvasSource, Texture } from 'pixi.js';
import { back, compactFace, face, glowArt, halo, ring, spark, spot } from './cardArt.js';
import { theme } from './themes.js';
export { CH, CW, drawTable, EMOJI } from './cardArt.js';
/**
 *  Texture with mipmaps: cards drawn much smaller than their 240px source (opponents' hands) stay smooth
 */
export function smooth(canvas) {
    return new Texture({ source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' }) });
}
/** Card pictures in the theme of this device */
export function makeArt(backColor) {
    const ui = theme().ui;
    const faces = new Map();
    const compacts = new Map();
    return {
        compact(card) {
            const key = `${card.value}-${card.suit}`;
            let texture = compacts.get(key);
            if (!texture) {
                texture = smooth(compactFace(card));
                compacts.set(key, texture);
            }
            return texture;
        },
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
        shadow: smooth(halo('rgba(0,0,0,1)', 22, 44, ui.cardShadow)),
        glow: smooth(glowArt(ui.glow)),
        spark: smooth(spark()),
        ring: smooth(ring()),
        spot: smooth(spot()),
    };
}
