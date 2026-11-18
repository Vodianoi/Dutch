/**
 *  Small synthesised sounds (no audio file): card slide, flip, success, mistake, "Dutch"
 */
let ctx: AudioContext | null = null;
let muted = false;

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

let lastSlide = 0;

export const sfx = {
    slide() {
        const now = performance.now();
        if (now - lastSlide < 45) return;
        lastSlide = now;
        noise(.09, 2200 + Math.random() * 800, .35);
    },
    flip() {
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
