/**
 *  Tiny DOM helper: el('div', {class: 'x', onclick: fn}, child1, 'text', ...)
 *  Text is always inserted as text nodes (player names can't inject HTML).
 */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        if (key.startsWith('on') && typeof value === 'function') {
            node.addEventListener(key.slice(2), value as EventListener);
        } else if (key === 'class') {
            node.className = String(value);
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(node.style, value);
        } else if (value === true) {
            node.setAttribute(key, '');
        } else {
            node.setAttribute(key, String(value));
        }
    }
    for (const child of children) {
        if (child === null || child === undefined || child === false) continue;
        node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
}

export function clear(node: Element) {
    while (node.firstChild) node.removeChild(node.firstChild);
}
