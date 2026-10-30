// Small synthesized sound effects shared by the games, made with the Web Audio API so no audio files are needed.
export class GameSound {
  muted = false;
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  // Browsers only allow audio after a user gesture, so call this from a click or tap before the first sound.
  unlock() { this.context(); }

  whistle() {
    const ctx = this.ready(); if (!ctx) return;
    const t = ctx.currentTime;
    for (const [offset, length] of [[0, 0.16], [0.22, 0.42]]) {
      const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = 2350;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 32;
      const depth = ctx.createGain(); depth.gain.value = 90;
      lfo.connect(depth); depth.connect(osc.frequency);
      const gain = this.gain(ctx);
      gain.gain.setValueAtTime(0.0001, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.1, t + offset + 0.02);
      gain.gain.setValueAtTime(0.1, t + offset + length - 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + length);
      osc.connect(gain);
      osc.start(t + offset); lfo.start(t + offset);
      osc.stop(t + offset + length + 0.02); lfo.stop(t + offset + length + 0.02);
    }
  }

  step() {
    const ctx = this.ready(); if (!ctx) return;
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.value = 380 + Math.random() * 220; filter.Q.value = 1.2;
    const gain = this.gain(ctx); this.envelope(gain, t, 0.07, 0.005, 0.06);
    this.noiseSource(ctx, t, 0.08).connect(filter).connect(gain);
  }

  touch() {
    const ctx = this.ready(); if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(160, t); osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    const gain = this.gain(ctx); this.envelope(gain, t, 0.35, 0.005, 0.25);
    osc.connect(gain); osc.start(t); osc.stop(t + 0.3);
    const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 900;
    const hit = this.gain(ctx); this.envelope(hit, t, 0.15, 0.003, 0.12);
    this.noiseSource(ctx, t, 0.15).connect(filter).connect(hit);
  }

  cheer() {
    const ctx = this.ready(); if (!ctx) return;
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.value = 1100; filter.Q.value = 0.6;
    const crowd = this.gain(ctx);
    crowd.gain.setValueAtTime(0.0001, t);
    crowd.gain.exponentialRampToValueAtTime(0.1, t + 0.25);
    crowd.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    this.noiseSource(ctx, t, 1.45).connect(filter).connect(crowd);
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => this.tone(ctx, frequency, frequency, t + i * 0.09, 0.14, 0.08, "triangle"));
  }

  // A quick rising rush of air for a thrown ball.
  whoosh() {
    const ctx = this.ready(); if (!ctx) return;
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter(); filter.type = "bandpass"; filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(500, t); filter.frequency.exponentialRampToValueAtTime(1900, t + 0.18);
    const gain = this.gain(ctx); this.envelope(gain, t, 0.12, 0.03, 0.17);
    this.noiseSource(ctx, t, 0.22).connect(filter).connect(gain);
  }

  point() {
    const ctx = this.ready(); if (!ctx) return;
    this.tone(ctx, 880, 1320, ctx.currentTime, 0.12, 0.06, "triangle");
  }

  lose() {
    const ctx = this.ready(); if (!ctx) return;
    this.tone(ctx, 440, 220, ctx.currentTime, 0.4, 0.08, "triangle");
  }

  private context() {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private ready() { return this.muted ? null : this.context(); }

  private gain(ctx: AudioContext) {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    return gain;
  }

  private envelope(gain: GainNode, start: number, peak: number, attack: number, release: number) {
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + release);
  }

  private tone(ctx: AudioContext, from: number, to: number, start: number, length: number, peak: number, type: OscillatorType) {
    const osc = ctx.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(from, start); osc.frequency.exponentialRampToValueAtTime(to, start + length);
    const gain = this.gain(ctx); this.envelope(gain, start, peak, 0.01, length);
    osc.connect(gain); osc.start(start); osc.stop(start + length + 0.05);
  }

  private noiseSource(ctx: AudioContext, start: number, length: number) {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.start(start, 0, length);
    return source;
  }
}

export const gameSound = new GameSound();
