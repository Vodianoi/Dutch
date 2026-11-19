import {ChatMessage, EMOTES, MAX_CHAT_LENGTH} from '../net/Protocol.js';
import {Chat, Session} from '../Session.js';
import {t} from '../i18n.js';
import {el} from './dom.js';

/**
 *  Chat panel: messages, emotes and a text field.
 *  The same element moves from the waiting room to the game (the text being typed is kept).
 */
export class ChatBox {
    public readonly element: HTMLElement;
    private readonly list: HTMLOListElement;
    private readonly empty: HTMLElement;
    private readonly input: HTMLInputElement | null = null;
    private readonly shown = new Set<number>();
    private readonly unsubscribe: () => void;
    /** Called for each new message (not for the history received when arriving) */
    public onMessage: ((message: ChatMessage) => void) | null = null;

    constructor(private readonly chat: Chat, private readonly session: Session) {
        this.list = el('ol', {class: 'chat-list', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': t('Messages')});
        this.empty = el('p', {class: 'chat-empty hint'}, chat.text ? t('Pas encore de message : dites bonjour !') : t('Réagissez avec un emoji : les autres joueurs répondent parfois.'));
        const emotes = el('div', {class: 'chat-emotes', role: 'group', 'aria-label': t('Réactions')},
            ...EMOTES.map(emote => el('button', {type: 'button', class: 'emote-button', 'aria-label': t('Envoyer {emote}', {emote}), onclick: () => chat.emote(emote)}, emote)));
        let form: HTMLElement | null = null;
        if (chat.text) {
            const input = el('input', {
                type: 'text', id: 'chat-input', class: 'chat-input', maxlength: String(MAX_CHAT_LENGTH),
                placeholder: t('Votre message…'), 'aria-label': t('Message'), autocomplete: 'off', enterkeyhint: 'send',
            });
            this.input = input;
            form = el('form', {class: 'chat-form', onsubmit: (e: Event) => {
                e.preventDefault();
                const text = input.value.trim();
                if (!text) return;
                chat.send(text);
                input.value = '';
            }}, input, el('button', {type: 'submit', class: 'primary chat-send'}, t('Envoyer')));
        }
        this.element = el('section', {class: 'chat', 'aria-label': chat.text ? t('Discussion') : t('Réactions')},
            el('h3', {class: 'chat-title'}, chat.text ? t('Discussion') : t('Réactions')),
            this.list, this.empty, emotes, form);
        chat.messages.forEach(m => this.add(m));
        this.unsubscribe = session.on(event => {
            if (event.type !== 'chat') return;
            if (event.history) {
                // Messages received when arriving or coming back: the whole list again
                this.list.replaceChildren();
                this.shown.clear();
                chat.messages.forEach(m => this.add(m));
            } else {
                this.add(event.message);
                this.onMessage?.(event.message);
            }
            this.scrollToEnd();
        });
    }

    private add(message: ChatMessage) {
        if (this.shown.has(message.id)) return;
        this.shown.add(message.id);
        const me = message.seat === this.session.viewerId;
        this.list.appendChild(el('li', {class: `chat-line${me ? ' me' : ''}${message.emote ? ' emote' : ''}`},
            el('span', {class: 'chat-name', style: {color: lighten(message.color)}}, me ? t('Vous') : message.name),
            el('span', {class: 'chat-text'}, message.emote ?? message.text ?? '')));
        this.empty.hidden = true;
    }

    /** After being moved or shown again: latest messages in view */
    public scrollToEnd() {
        this.list.scrollTop = this.list.scrollHeight;
    }

    public focus() {
        (this.input ?? this.element.querySelector<HTMLElement>('.emote-button'))?.focus();
    }

    public destroy() {
        this.unsubscribe();
        this.element.remove();
    }
}

/** Player colours are dark: a lighter tint stays readable on the dark panel */
function lighten(color: string): string {
    const n = parseInt(color.slice(1), 16);
    const mix = (c: number) => Math.round(c + (255 - c) * .45);
    return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}
