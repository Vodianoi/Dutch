/**
 *  Which version of the site is running.
 *  The test versions are published on the same site as the real one, each in its own folder:
 *  - `dev` (branch dev): https://vodianoi.github.io/Dutch/dev/
 *  - `new-look` (branch style/new-look, a proposal for a new design): https://vodianoi.github.io/Dutch/new-look/
 *  They share the browser storage and the PeerJS server with the real site,
 *  so everything a test version saves and its room codes are kept apart with its own prefix.
 */
export function testVersion(pathname) {
    return /\/(dev|new-look)\//.exec(pathname)?.[1] ?? null;
}
/** Name of the test version running (null on the real site) */
export const TEST_VERSION = typeof location !== 'undefined' ? testVersion(location.pathname) : null;
export const IS_DEV = TEST_VERSION !== null;
/**
 *  Name for this version: "dutch-setup" on the real site, "dutch-dev-setup" on the test one
 */
export function scoped(name) {
    return `dutch-${TEST_VERSION ? `${TEST_VERSION}-` : ''}${name}`;
}
const host = typeof location !== 'undefined' ? location.hostname : '';
const path = typeof location !== 'undefined' ? location.pathname : '';
/** Development on this computer (local server or file) */
export const IS_LOCAL = host === 'localhost' || host === '127.0.0.1' || host === '';
/**
 *  Testing tools are offered on the test versions (/dev/, /new-look/) and on this computer, not on the real site
 */
export function hasTestTools(hostname, pathname) {
    return testVersion(pathname) !== null || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
}
/** "Sur cet écran" (everybody plays on one device): a testing tool */
export const HOT_SEAT = hasTestTools(host, path);
/** The 3D table (prototype): a testing tool, never on the real site */
export const TABLE_3D = hasTestTools(host, path);
