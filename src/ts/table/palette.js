/**
 *  Colours of the game, after Delft faïence: cobalt blue painted on tin-glaze white, one warm accent.
 *  No rendering library here: shared by the card drawings (canvas), the PixiJS table and the 3D prototype.
 *  The same values are the tokens of the menus (src/css/styles.css).
 */
/** Darkest blue: the room around the table, text on white */
export const INK = '#0b1433';
/** Delft cobalt: the table, the buttons, the card backs */
export const DELFT = '#1f47a8';
export const DELFT_DARK = '#17357f';
/** Tin-glaze white: panels, cards, text on blue */
export const FAIENCE = '#f4f7fb';
/** Text of second rank on blue (scores, counts) */
export const FAIENCE_MUTED = '#dce5f6';
/** The one warm colour: the « Dutch » call, whose turn it is, cards that can be played */
export const ORANJE = '#f26a1b';
/** The accent as text on white */
export const ORANJE_DARK = '#c2500e';
/** Light of the accent (glows, rings) */
export const ORANJE_LIGHT = '#ffae57';
/** Mistakes and penalties: on blue, and as text on white */
export const ALERT = '#ff8f85';
export const ALERT_DARK = '#b3261e';
/** Text of second rank on white */
export const INK_MUTED = '#56658c';
/** `#rrggbb` as a number, for PixiJS */
export const hex = (color) => parseInt(color.slice(1), 16);
