import Card from '../Card.js';
import { t } from '../i18n.js';
import { back, face, SANS, SERIF } from '../table/cardArt.js';
import { loadPrefs } from '../table/prefs.js';
/** The two cards looked at: a red king (worth 0 point) and a small card */
const SHOWN = [['KING', 'HEARTS'], ['3', 'SPADES']];
/** Each card lies a little askew, like on a real table (degrees) */
const TILT = [-2.5, 1.5, 1, -1.5];
/**
 *  Header of the menus: what the game is, in one sentence, and a hand of Dutch drawn with the cards of the game.
 *  Four cards face down in a square; the two at the bottom turn over once, like the look at the start of a round.
 */
export function renderHero() {
    const tagline = document.getElementById('tagline');
    if (tagline)
        tagline.textContent = t('Retenez vos cartes, débarrassez-vous des grosses, et dites Dutch avant les autres.');
    const hand = document.getElementById('hero-hand');
    if (!hand)
        return;
    const draw = () => {
        hand.textContent = '';
        const color = loadPrefs().back;
        TILT.forEach((tilt, i) => {
            const card = document.createElement('div');
            card.className = 'hero-card';
            card.style.rotate = `${tilt}deg`;
            const shown = SHOWN[i - 2];
            if (shown) {
                // Back and face, back to back: the card turns over
                const turning = document.createElement('div');
                turning.className = 'hero-turn';
                turning.style.animationDelay = `${500 + (i - 2) * 180}ms`;
                const front = face(new Card(`hero-${i}`, shown[0], shown[1]));
                front.className = 'hero-face';
                turning.append(back(color), front);
                card.append(turning);
            }
            else {
                card.append(back(color));
            }
            hand.append(card);
        });
    };
    // The letters of the cards wait for their font (not for ever: a slow network gets the fallback font)
    const fonts = Promise.all([
        document.fonts.load(`700 40px ${SERIF}`),
        document.fonts.load(`italic 600 40px ${SERIF}`),
        document.fonts.load(`700 16px ${SANS}`),
    ]);
    Promise.race([fonts, new Promise(resolve => setTimeout(resolve, 1500))]).then(draw, draw);
}
