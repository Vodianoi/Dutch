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
export function scoped(name: string): string {
    return `${IS_DEV ? 'dutch-dev-' : 'dutch-'}${name}`;
}
