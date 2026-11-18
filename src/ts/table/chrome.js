import { gsap } from 'gsap';
import { EMOTES } from '../net/Protocol.js';
import { describeSettings } from '../Settings.js';
import { ChatBox } from '../ui/ChatBox.js';
import { BACK_COLORS } from './cardArt.js';
import { savePrefs } from './prefs.js';
import { setMuted, unlockAudio } from './sound.js';
export class TableChrome {
    constructor(o) {
        this.o = o;
        this.chatBox = null;
        this.ownChat = false;
        this.chatDrawer = null;
        this.chatButton = null;
        this.emotePop = null;
        this.menu = null;
        this.unread = 0;
        const menuButton = document.createElement('button');
        menuButton.type = 'button';
        menuButton.className = 'table-menu-button';
        menuButton.setAttribute('aria-haspopup', 'dialog');
        menuButton.innerHTML = '<span aria-hidden="true">☰</span> Menu';
        menuButton.addEventListener('click', () => this.openMenu());
        o.bar.append(menuButton);
        if (o.session.chat)
            this.buildChat();
        this.applyPrefs();
    }
    get prefs() {
        return this.o.prefs;
    }
    destroy() {
        this.menu?.remove();
        this.chatDrawer?.remove();
        this.emotePop?.remove();
        if (this.ownChat)
            this.chatBox?.destroy();
        else if (this.chatBox) {
            // Shared with the waiting room: shown again there
            this.chatBox.element.remove();
            this.chatBox.element.hidden = false;
        }
    }
    applyPrefs() {
        setMuted(!this.o.prefs.sound);
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        gsap.globalTimeline.timeScale(reduced ? 2.5 : this.o.prefs.speed === 'fast' ? 1.6 : 1);
    }
    /** A chat line arrived: counted as unread while the chat is closed */
    countUnread(message) {
        if (message.text && message.seat !== this.o.session.viewerId && !this.chatDrawer) {
            this.unread++;
            this.updateUnread();
        }
    }
    // region Chat
    buildChat() {
        const chat = this.o.session.chat;
        this.chatBox = this.o.chatBox ?? new ChatBox(chat, this.o.session);
        this.ownChat = !this.o.chatBox;
        const emoteButton = document.createElement('button');
        emoteButton.type = 'button';
        emoteButton.className = 'table-menu-button table-emote-button';
        emoteButton.setAttribute('aria-label', 'Réactions');
        emoteButton.setAttribute('aria-expanded', 'false');
        emoteButton.textContent = '😀';
        emoteButton.addEventListener('click', () => this.toggleEmotes(emoteButton));
        this.o.bar.append(emoteButton);
        if (chat.text) {
            const chatButton = document.createElement('button');
            chatButton.type = 'button';
            chatButton.className = 'table-menu-button';
            chatButton.setAttribute('aria-haspopup', 'dialog');
            chatButton.addEventListener('click', () => this.openChat());
            this.chatButton = chatButton;
            this.updateUnread();
            this.o.bar.append(chatButton);
        }
    }
    toggleEmotes(opener) {
        if (this.emotePop) {
            this.emotePop.remove();
            this.emotePop = null;
            opener.setAttribute('aria-expanded', 'false');
            return;
        }
        const pop = document.createElement('div');
        pop.className = 'emote-pop';
        pop.setAttribute('role', 'group');
        pop.setAttribute('aria-label', 'Réactions');
        for (const emote of EMOTES) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'emote-button';
            b.textContent = emote;
            b.setAttribute('aria-label', `Envoyer ${emote}`);
            b.addEventListener('click', () => {
                unlockAudio();
                this.o.session.chat?.emote(emote);
                this.toggleEmotes(opener);
                opener.focus();
            });
            pop.append(b);
        }
        pop.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                this.toggleEmotes(opener);
                opener.focus();
            }
        });
        this.o.screen.append(pop);
        this.emotePop = pop;
        opener.setAttribute('aria-expanded', 'true');
        pop.querySelector('button')?.focus();
    }
    openChat() {
        if (this.chatDrawer || !this.chatBox)
            return;
        const box = this.chatBox;
        const opener = document.activeElement;
        const drawer = document.createElement('div');
        drawer.className = 'overlay chat-overlay';
        const panel = document.createElement('section');
        panel.className = 'panel chat-drawer';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', 'Discussion');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'secondary chat-close';
        close.textContent = 'Fermer';
        const shut = () => {
            drawer.remove();
            this.chatDrawer = null;
            this.o.screen.append(box.element);
            box.element.hidden = true;
            opener?.focus();
        };
        close.addEventListener('click', shut);
        drawer.addEventListener('click', e => e.target === drawer && shut());
        drawer.addEventListener('keydown', e => e.key === 'Escape' && shut());
        box.element.hidden = false;
        panel.append(box.element, close);
        drawer.append(panel);
        document.body.append(drawer);
        this.chatDrawer = drawer;
        this.unread = 0;
        this.updateUnread();
        box.scrollToEnd();
        box.focus();
    }
    updateUnread() {
        if (!this.chatButton)
            return;
        this.chatButton.textContent = '';
        this.chatButton.append('Chat');
        if (this.unread) {
            const badge = document.createElement('span');
            badge.className = 'unread';
            badge.textContent = String(this.unread);
            this.chatButton.append(badge);
        }
        this.chatButton.setAttribute('aria-label', this.unread ? `Discussion, ${this.unread} message${this.unread > 1 ? 's' : ''} non lu${this.unread > 1 ? 's' : ''}` : 'Discussion');
    }
    // endregion
    // region Menu
    openMenu() {
        if (this.menu)
            return;
        const s = this.o.session.state;
        const prefs = this.o.prefs;
        const opener = document.activeElement;
        const dialog = document.createElement('div');
        dialog.className = 'overlay table-menu';
        const close = () => {
            dialog.remove();
            this.menu = null;
            opener?.focus();
        };
        const rules = s ? describeSettings(s.settings).map(line => `<li>${escape(line)}</li>`).join('') : '';
        const backs = this.o.onBackChange ? `<div class="backs" role="radiogroup" aria-label="Dos des cartes">${Object.keys(BACK_COLORS).map(key => `<label class="back-choice"><input type="radio" name="back" value="${key}" ${prefs.back === key ? 'checked' : ''}><span class="back-swatch back-${key}" aria-hidden="true"></span>${BACK_COLORS[key].name}</label>`).join('')}</div>` : '';
        dialog.innerHTML = `
            <section class="panel menu-panel" role="dialog" aria-modal="true" aria-labelledby="menu-title">
                <h2 id="menu-title">Menu</h2>
                <button type="button" class="primary" data-act="close">Reprendre la partie</button>
                <details><summary>Règles de la partie</summary><ul>${rules}</ul></details>
                <fieldset><legend>Réglages de cet appareil</legend>
                    <label class="switch"><input type="checkbox" name="sound" ${prefs.sound ? 'checked' : ''}> Sons</label>
                    <label class="switch"><input type="checkbox" name="vibration" ${prefs.vibration ? 'checked' : ''}> Vibrations</label>
                    <label class="switch"><input type="checkbox" name="fast" ${prefs.speed === 'fast' ? 'checked' : ''}> Animations rapides</label>
                    ${this.o.onTableChange ? `<label class="switch"><input type="checkbox" name="table3d" ${prefs.table === '3d' ? 'checked' : ''}> Table en 3D (prototype)</label>` : ''}
                    ${backs}
                    ${this.o.debug && this.o.session.canShowAll ? '<label class="switch"><input type="checkbox" name="showAll"> Voir toutes les cartes (debug)</label>' : ''}
                </fieldset>
                <button type="button" class="secondary danger" data-act="quit">Quitter la partie</button>
            </section>`;
        dialog.addEventListener('click', e => {
            const target = e.target;
            if (target === dialog || target.dataset.act === 'close')
                close();
            if (target.dataset.act === 'quit') {
                if (!this.o.quitWarning || confirm(this.o.quitWarning)) {
                    close();
                    this.o.onQuit();
                }
            }
        });
        dialog.addEventListener('keydown', e => {
            if (e.key === 'Escape')
                close();
        });
        dialog.addEventListener('change', e => {
            const input = e.target;
            if (input.name === 'sound')
                prefs.sound = input.checked;
            if (input.name === 'vibration')
                prefs.vibration = input.checked;
            if (input.name === 'fast')
                prefs.speed = input.checked ? 'fast' : 'normal';
            if (input.name === 'showAll')
                this.o.session.setShowAll(input.checked);
            if (input.name === 'back') {
                prefs.back = input.value;
                this.o.onBackChange?.();
            }
            savePrefs(prefs);
            this.applyPrefs();
            if (input.name === 'table3d') {
                prefs.table = input.checked ? '3d' : '2d';
                savePrefs(prefs);
                close();
                this.o.onTableChange?.(prefs.table);
            }
        });
        document.body.appendChild(dialog);
        this.menu = dialog;
        dialog.querySelector('[data-act="close"]')?.focus();
    }
}
export function escape(text) {
    return text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
