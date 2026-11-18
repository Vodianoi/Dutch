import { EMOTES, MAX_CHAT_LENGTH, QUICK_LINES } from '../net/Protocol.js';
import { el } from './dom.js';
/**
 *  Chat panel: messages, emotes, ready-made sentences and a text field.
 *  The same element moves from the waiting room to the game (the text being typed is kept).
 */
export class ChatBox {
    constructor(chat, session) {
        this.chat = chat;
        this.session = session;
        this.input = null;
        this.shown = new Set();
        /** Called for each new message (not for the history received when arriving) */
        this.onMessage = null;
        this.list = el('ol', { class: 'chat-list', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': 'Messages' });
        this.empty = el('p', { class: 'chat-empty hint' }, chat.text ? 'Pas encore de message : dites bonjour !' : 'Réagissez avec un emoji : les autres joueurs répondent parfois.');
        const emotes = el('div', { class: 'chat-emotes', role: 'group', 'aria-label': 'Réactions' }, ...EMOTES.map(emote => el('button', { type: 'button', class: 'emote-button', 'aria-label': `Envoyer ${emote}`, onclick: () => chat.emote(emote) }, emote)));
        let form = null;
        let quick = null;
        if (chat.text) {
            const input = el('input', {
                type: 'text', id: 'chat-input', class: 'chat-input', maxlength: String(MAX_CHAT_LENGTH),
                placeholder: 'Votre message…', 'aria-label': 'Message', autocomplete: 'off', enterkeyhint: 'send',
            });
            this.input = input;
            form = el('form', { class: 'chat-form', onsubmit: (e) => {
                    e.preventDefault();
                    const text = input.value.trim();
                    if (!text)
                        return;
                    chat.send(text);
                    input.value = '';
                } }, input, el('button', { type: 'submit', class: 'primary chat-send' }, 'Envoyer'));
            quick = el('div', { class: 'chat-quick', role: 'group', 'aria-label': 'Messages rapides' }, ...QUICK_LINES.map(line => el('button', { type: 'button', class: 'quick-line', onclick: () => chat.send(line) }, line)));
        }
        this.element = el('section', { class: 'chat', 'aria-label': chat.text ? 'Discussion' : 'Réactions' }, el('h3', { class: 'chat-title' }, chat.text ? 'Discussion' : 'Réactions'), this.list, this.empty, emotes, quick, form);
        chat.messages.forEach(m => this.add(m));
        this.unsubscribe = session.on(event => {
            if (event.type !== 'chat')
                return;
            if (event.history) {
                // Messages received when arriving or coming back: the whole list again
                this.list.replaceChildren();
                this.shown.clear();
                chat.messages.forEach(m => this.add(m));
            }
            else {
                this.add(event.message);
                this.onMessage?.(event.message);
            }
            this.scrollToEnd();
        });
    }
    add(message) {
        if (this.shown.has(message.id))
            return;
        this.shown.add(message.id);
        const me = message.seat === this.session.viewerId;
        this.list.appendChild(el('li', { class: `chat-line${me ? ' me' : ''}${message.emote ? ' emote' : ''}` }, el('span', { class: 'chat-name', style: { color: lighten(message.color) } }, me ? 'Vous' : message.name), el('span', { class: 'chat-text' }, message.emote ?? message.text ?? '')));
        this.empty.hidden = true;
    }
    /** After being moved or shown again: latest messages in view */
    scrollToEnd() {
        this.list.scrollTop = this.list.scrollHeight;
    }
    focus() {
        (this.input ?? this.element.querySelector('.emote-button'))?.focus();
    }
    destroy() {
        this.unsubscribe();
        this.element.remove();
    }
}
/** Player colours are dark: a lighter tint stays readable on the dark panel */
function lighten(color) {
    const n = parseInt(color.slice(1), 16);
    const mix = (c) => Math.round(c + (255 - c) * .45);
    return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}
