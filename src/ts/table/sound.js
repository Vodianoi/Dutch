/**
 *  Sounds of the game: recorded card sounds (sounds/*.mp3, a few variants each), and small synthesised
 *  sounds for the rest (success, mistake, "Dutch", buttons). Until the card sounds are loaded, synthesised
 *  ones play instead.
 */
let ctx = null;
let muted = false;
/** Variants of each card sound: sounds/card-<name>-<n>.mp3 */
export const CARD_SOUNDS = { slide: 4, flip: 2 };
const buffers = new Map();
let loading = false;
/** The card sounds are fetched once, after the first touch (sound is allowed from then on) */
function loadCardSounds() {
    if (loading || !ctx)
        return;
    loading = true;
    const audio = ctx;
    for (const [name, count] of Object.entries(CARD_SOUNDS)) {
        void Promise.all(Array.from({ length: count }, (_, i) => fetch(new URL(`../../../sounds/card-${name}-${i + 1}.mp3`, import.meta.url))
            .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText)))
            .then(data => audio.decodeAudioData(data))
            .catch(() => null)))
            .then(list => {
            const ok = list.filter((b) => !!b);
            if (ok.length)
                buffers.set(name, ok);
        });
    }
}
/** A recorded card sound, a little higher or lower each time; false if it isn't loaded */
function play(name, volume) {
    const list = buffers.get(name);
    if (!ctx || !list?.length)
        return false;
    if (muted)
        return true;
    const source = ctx.createBufferSource();
    source.buffer = list[Math.floor(Math.random() * list.length)];
    source.playbackRate.value = .94 + Math.random() * .12;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(ctx.destination);
    source.start();
    return true;
}
export function setMuted(on) {
    muted = on;
}
export function isMuted() {
    return muted;
}
/** Browsers only allow sound after a first touch or click */
export function unlockAudio() {
    if (!ctx)
        ctx = new AudioContext();
    if (ctx.state === 'suspended')
        void ctx.resume();
    loadCardSounds();
}
function noise(duration, frequency, volume) {
    if (!ctx || muted)
        return;
    const length = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++)
        data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
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
function tone(frequency, start, duration, volume, type = 'sine') {
    if (!ctx || muted)
        return;
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
let lastSlide = 0;
export const sfx = {
    slide() {
        const now = performance.now();
        if (now - lastSlide < 45)
            return;
        lastSlide = now;
        if (!play('slide', .55))
            noise(.09, 2200 + Math.random() * 800, .35);
    },
    flip() {
        if (!play('flip', .5))
            noise(.05, 4200, .25);
    },
    tap() {
        noise(.03, 6000, .15);
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
