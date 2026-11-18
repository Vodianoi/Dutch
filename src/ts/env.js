/**
 *  Which version of the site is running.
 *  The test version (dev branch) is published under /dev/ on the same site as the real one
 *  (https://vodianoi.github.io/Dutch/dev/): it shares the browser storage and the PeerJS server,
 *  so everything it saves and its room codes are kept apart with another prefix.
 */
export const IS_DEV = typeof location !== 'undefined' && /\/dev\//.test(location.pathname);
/**
 *  Name for this version: "dutch-setup" on the real site, "dutch-dev-setup" on the test one
 */
export function scoped(name) {
    return `${IS_DEV ? 'dutch-dev-' : 'dutch-'}${name}`;
}
const host = typeof location !== 'undefined' ? location.hostname : '';
const path = typeof location !== 'undefined' ? location.pathname : '';
/** Development on this computer (local server or file) */
export const IS_LOCAL = host === 'localhost' || host === '127.0.0.1' || host === '';
/**
 *  Testing tools are offered on the test version (/dev/) and on this computer, not on the real site
 */
export function hasTestTools(hostname, pathname) {
    return /\/dev\//.test(pathname) || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
}
/** "Sur cet écran" (everybody plays on one device): a testing tool */
export const HOT_SEAT = hasTestTools(host, path);
/** The 3D table (prototype): a testing tool, never on the real site */
export const TABLE_3D = hasTestTools(host, path);
