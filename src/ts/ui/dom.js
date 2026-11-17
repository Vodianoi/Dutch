export function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false)
            continue;
        if (key.startsWith('on') && typeof value === 'function') {
            node.addEventListener(key.slice(2), value);
        }
        else if (key === 'class') {
            node.className = String(value);
        }
        else if (key === 'style' && typeof value === 'object') {
            Object.assign(node.style, value);
        }
        else if (value === true) {
            node.setAttribute(key, '');
        }
        else {
            node.setAttribute(key, String(value));
        }
    }
    for (const child of children) {
        if (child === null || child === undefined || child === false)
            continue;
        node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
}
export function clear(node) {
    while (node.firstChild)
        node.removeChild(node.firstChild);
}
