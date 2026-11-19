/**
 *  Sounds of the game: recorded card sounds (sounds/*.mp3, a few variants each), and small synthesised
 *  sounds for the rest (success, mistake, "Dutch", buttons). The card files are fetched as soon as the page
 *  opens; the synthesised card sounds only play if a file can't be read.
 */
let ctx: AudioContext | null = null;
let muted = false;

/** Variants of each card sound: sounds/card-<name>-<n>.mp3 */
export const CARD_SOUNDS = {slide: 4, flip: 2, tap: 2} as const;
type CardSound = keyof typeof CARD_SOUNDS;
const buffers = new Map<CardSound, AudioBuffer[]>();
/** Card sounds that could not be read: the synthesised ones play instead */
const missing = new Set<CardSound>();

/** The files, fetched when the page opens (no sound is needed for that) */
const files = typeof fetch === 'undefined' ? null : new Map((Object.entries(CARD_SOUNDS) as [CardSound, number][]).map(([name, count]) =>
    [name, Promise.all(Array.from({length: count}, (_, i) =>
        fetch(new URL(`../../../sounds/card-${name}-${i + 1}.mp3`, import.meta.url))
            .then(r => r.ok ? r.arrayBuffer() : null)
            .catch(() => null)))] as const));
let decoding = false;

/** Decoded once sound is allowed (after the first touch) */
function decodeCardSounds() {
    if (decoding || !ctx || !files) return;
    decoding = true;
    const audio = ctx;
    for (const [name, list] of files) {
        void list
            .then(data => Promise.all(data.map(d => d ? audio.decodeAudioData(d).catch(() => null) : null)))
            .then(decoded => {
                const ok = decoded.filter((b): b is AudioBuffer => !!b);
                if (ok.length) buffers.set(name, ok);
                else missing.add(name);
            });
    }
}

/**
 *  A recorded card sound, a little higher or lower each time.
 *  False only if its files can't be read (then the synthesised sound plays); while they load: silence.
 */
function play(name: CardSound, volume: number): boolean {
    if (missing.has(name) || !files) return false;
    const list = buffers.get(name);
    if (!ctx || !list?.length || muted) return true;
    const source = ctx.createBufferSource();
    source.buffer = list[Math.floor(Math.random() * list.length)];
    source.playbackRate.value = .94 + Math.random() * .12;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(ctx.destination);
    source.start();
    return true;
}

export function setMuted(on: boolean) {
    muted = on;
}

export function isMuted() {
    return muted;
}

/** Browsers only allow sound after a first touch or click */
export function unlockAudio() {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    decodeCardSounds();
}

function noise(duration: number, frequency: number, volume: number) {
    if (!ctx || muted) return;
    const length = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = .8;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
}

function tone(frequency: number, start: number, duration: number, volume: number, type: OscillatorType = 'sine') {
    if (!ctx || muted) return;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + .02);
}

/** Soft click of the buttons: a short sine whose pitch falls a little, with a light overtone */
function click() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(1150, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + .06);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(.09, t + .003);
    gain.gain.exponentialRampToValueAtTime(.0001, t + .06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + .07);
    tone(1720, 0, .03, .02);
}

let lastSlide = 0;

export const sfx = {
    slide() {
        const now = performance.now();
        if (now - lastSlide < 45) return;
        lastSlide = now;
        if (!play('slide', .55)) noise(.09, 2200 + Math.random() * 800, .35);
    },
    flip() {
        if (!play('flip', .5)) noise(.05, 4200, .25);
    },
    /** A card touched (chosen, not moved): a short recorded tap */
    pick() {
        if (!play('tap', .45)) noise(.03, 6000, .15);
    },
    /** A button or a reaction: a soft « tock », nothing like a card */
    tap() {
        click();
    },
    good() {
        tone(660, 0, .18, .12);
        tone(990, .08, .25, .1);
    },
    bad() {
        tone(220, 0, .25, .12, 'triangle');
        tone(165, .1, .3, .1, 'triangle');
    },
    dutch() {
        [523, 659, 784, 1046].forEach((f, i) => tone(f, i * .07, .5, .08, 'triangle'));
    },
};
