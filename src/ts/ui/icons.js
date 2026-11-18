/**
 *  Inline SVG icons (stroke style, 24x24 grid, Lucide-like). Decorative: always next to a text.
 */
const PATHS = {
    draw: ['M12 19V5', 'm5 12 7-7 7 7'],
    discard: ['M12 5v14', 'm19 12-7 7-7-7'],
    swap: ['M8 3 4 7l4 4', 'M4 7h16', 'm16 21 4-4-4-4', 'M20 17H4'],
    check: ['M20 6 9 17l-5-5'],
    cross: ['M18 6 6 18', 'm6 6 12 12'],
    eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
    gift: ['M20 12v10H4V12', 'M2 7h20v5H2z', 'M12 22V7', 'M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z', 'M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z'],
    dutch: ['m3 11 18-5v12L3 14v-3z', 'M11.6 16.8a3 3 0 1 1-5.8-1.6'],
    next: ['M5 12h14', 'm12 5 7 7-7 7'],
    skip: ['M5 4l10 8-10 8V4z', 'M19 5v14'],
    info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
    star: ['M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z'],
};
const SVG_NS = 'http://www.w3.org/2000/svg';
export function icon(name, className = 'icon') {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const d of PATHS[name]) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
    }
    return svg;
}
