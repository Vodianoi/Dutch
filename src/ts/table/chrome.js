import { gsap } from 'gsap';
import { EMOTES } from '../net/Protocol.js';
import { t } from '../i18n.js';
import { describeSettings } from '../Settings.js';
import { ChatBox } from '../ui/ChatBox.js';
import { BACK_COLORS, TABLE_THEMES } from './cardArt.js';
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
        this.emoteButton = null;
        /** Where the reactions button is next to the own token (null: in the top bar) */
        this.emoteSpot = null;
        this.menu = null;
        this.unread = 0;
        const menuButton = document.createElement('button');
        menuButton.type = 'button';
        menuButton.className = 'table-menu-button';
        menuButton.setAttribute('aria-haspopup', 'dialog');
        menuButton.innerHTML = `<span aria-hidden="true">☰</span> ${t('Menu')}`;
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
        this.emoteButton?.remove();
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
        emoteButton.setAttribute('aria-label', t('Réactions'));
        emoteButton.setAttribute('aria-expanded', 'false');
        emoteButton.textContent = '😀';
        emoteButton.addEventListener('click', () => this.toggleEmotes(emoteButton));
        this.emoteButton = emoteButton;
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
    /**
     *  The table found room next to the own token: the reactions button goes there, where the thumb is
     *  (on phones, the top bar is far). Null: back in the top bar.
     *  @param spot centre and radius, in pixels from the top left corner of the table screen
     */
    placeEmotes(spot) {
        const button = this.emoteButton;
        if (!button)
            return;
        this.emoteSpot = spot;
        if (spot) {
            button.classList.add('seat-emote-button');
            Object.assign(button.style, { left: `${spot.x - spot.r}px`, top: `${spot.y - spot.r}px`, width: `${spot.r * 2}px`, height: `${spot.r * 2}px` });
            // Right after the top bar in the reading order
            if (button.parentElement !== this.o.screen) {
                const bar = this.o.bar.closest('.table-bar');
                if (bar?.parentElement === this.o.screen)
                    bar.after(button);
                else
                    this.o.screen.append(button);
            }
        }
        else {
            button.classList.remove('seat-emote-button');
            button.removeAttribute('style');
            if (button.parentElement !== this.o.bar) {
                // Back after the Menu button
                const menu = this.o.bar.firstElementChild;
                if (menu)
                    menu.after(button);
                else
                    this.o.bar.append(button);
            }
        }
        if (this.emotePop)
            this.placePop(this.emotePop);
    }
    /** The reactions open above the button next to the own token, or under the top bar */
    placePop(pop) {
        const spot = this.emoteSpot;
        pop.classList.toggle('from-seat', !!spot);
        if (!spot) {
            pop.removeAttribute('style');
            return;
        }
        const height = this.o.screen.clientHeight;
        // Above the button if there is room, otherwise below it
        if (spot.y - spot.r > height / 2)
            Object.assign(pop.style, { top: 'auto', bottom: `${height - spot.y + spot.r + 8}px` });
        else
            Object.assign(pop.style, { top: `${spot.y + spot.r + 8}px`, bottom: 'auto' });
        pop.style.left = `${Math.max(10, spot.x - spot.r)}px`;
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
        pop.setAttribute('aria-label', t('Réactions'));
        for (const emote of EMOTES) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'emote-button';
            b.textContent = emote;
            b.setAttribute('aria-label', t('Envoyer {emote}', { emote }));
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
        this.placePop(pop);
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
        panel.setAttribute('aria-label', t('Discussion'));
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'secondary chat-close';
        close.textContent = t('Fermer');
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
        this.chatButton.append(t('Chat'));
        if (this.unread) {
            const badge = document.createElement('span');
            badge.className = 'unread';
            badge.textContent = String(this.unread);
            this.chatButton.append(badge);
        }
        this.chatButton.setAttribute('aria-label', this.unread ? t(this.unread > 1 ? 'Discussion, {n} messages non lus' : 'Discussion, {n} message non lu', { n: this.unread }) : t('Discussion'));
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
        const backs = this.o.onBackChange ? `<p class="choice-title" aria-hidden="true">${t('Dos des cartes')}</p><div class="backs" role="radiogroup" aria-label="${t('Dos des cartes')}">${Object.keys(BACK_COLORS).map(key => `<label class="back-choice"><input type="radio" name="back" value="${key}" ${prefs.back === key ? 'checked' : ''}><span class="back-swatch back-${key}" aria-hidden="true"></span>${t(BACK_COLORS[key].name)}</label>`).join('')}</div>` : '';
        const felts = this.o.onFeltChange ? `<p class="choice-title" aria-hidden="true">${t('Tapis')}</p><div class="felts" role="radiogroup" aria-label="${t('Tapis')}">${Object.keys(TABLE_THEMES).map(key => {
            const c = TABLE_THEMES[key];
            const swatch = `background: radial-gradient(ellipse at 50% 40%, ${c.felt[0]}, ${c.felt[1]} 60%, ${c.felt[2]}); border-color: ${c.rail[1]}`;
            return `<label class="felt-choice"><input type="radio" name="felt" value="${key}" ${prefs.felt === key ? 'checked' : ''}><span class="felt-swatch${c.wood ? ' felt-wood' : ''}" style="${swatch}" aria-hidden="true"></span>${t(c.name)}</label>`;
        }).join('')}</div>` : '';
        dialog.innerHTML = `
            <section class="panel menu-panel" role="dialog" aria-modal="true" aria-labelledby="menu-title">
                <h2 id="menu-title">${t('Menu')}</h2>
                <button type="button" class="primary" data-act="close">${t('Reprendre la partie')}</button>
                <details><summary>${t('Règles de la partie')}</summary><ul>${rules}</ul></details>
                <fieldset><legend>${t('Réglages de cet appareil')}</legend>
                    <label class="switch"><input type="checkbox" name="sound" ${prefs.sound ? 'checked' : ''}> ${t('Sons')}</label>
                    <label class="switch"><input type="checkbox" name="vibration" ${prefs.vibration ? 'checked' : ''}> ${t('Vibrations')}</label>
                    <label class="switch"><input type="checkbox" name="fast" ${prefs.speed === 'fast' ? 'checked' : ''}> ${t('Animations rapides')}</label>
                    ${this.o.onTableChange ? `<label class="switch"><input type="checkbox" name="table3d" ${prefs.table === '3d' ? 'checked' : ''}> ${t('Table en 3D (prototype)')}</label>` : ''}
                    ${backs}
                    ${felts}
                    ${this.o.debug && this.o.session.canShowAll ? `<label class="switch"><input type="checkbox" name="showAll"> ${t('Voir toutes les cartes (debug)')}</label>` : ''}
                </fieldset>
                <button type="button" class="secondary danger" data-act="quit">${t('Quitter la partie')}</button>
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
            if (input.name === 'felt') {
                prefs.felt = input.value;
                this.o.onFeltChange?.();
            }
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
