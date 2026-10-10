let ctx: AudioContext | null = null;
let enabled = true;
export const sfx = {
  setEnabled(v: boolean) { enabled = v; },
  ping() { this.blip(880, 0.08); setTimeout(() => this.blip(1320, 0.1), 90); },
  tick() { this.blip(660, 0.04); },
  blip(freq: number, dur: number) {
    if (!enabled) return;
    try {
      ctx ??= new AudioContext();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.06, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + dur);
    } catch { /* no audio */ }
  },
};
