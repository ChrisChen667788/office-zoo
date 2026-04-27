/**
 * Synthesized SFX — Web Audio API, no audio assets.
 *
 * ## Why synth, not mp3/wav?
 *  - **Zero payload.** We already ship a ~470kB bundle; loading 6 sound files
 *    (even small 20kB each) adds friction for a feature that's pure polish.
 *  - **Tunable at the source.** If "vote" needs more ceremonial weight, we
 *    shift an oscillator's envelope in-line rather than round-trip a DAW.
 *  - **Reusable primitives.** `tone()` + `noise()` compose into kill, vote,
 *    streak, pick, win, lose — one mental model for all SFX in the app.
 *
 * ## Browser autoplay policy
 * An `AudioContext` created before the first user gesture starts suspended
 * and is silent until `resume()` is called. We:
 *   1. Lazy-create the context on the first `play*()` call (so SSR stays safe)
 *   2. Call `resume()` defensively every `play*()` — harmless if already running
 *   3. Register a one-shot pointer/key listener at module load to warm the
 *      context on the first tap, so the first in-game SFX isn't swallowed.
 *
 * ## Muted state
 * Persisted to localStorage under `office-arena.sfx.muted`. Muting sets the
 * master gain to 0 rather than tearing down the context — cheaper to flip.
 */

const STORAGE_KEY = 'office-arena.sfx.muted';
const MASTER_GAIN = 0.35;

class SfxPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  /** Lazy-create context; safe to call repeatedly. Returns null in SSR. */
  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Public warm-up — called from the one-shot listener at module load. */
  resume() {
    this.ensure();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        m ? 0 : MASTER_GAIN,
        this.ctx.currentTime,
        0.01,
      );
    }
  }

  isMuted() {
    return this.muted;
  }

  // ── Primitives ────────────────────────────────────────────────────────

  /** Single-oscillator tone with attack/release envelope. */
  private tone(
    freq: number,
    start: number,
    dur: number,
    opts: {
      type?: OscillatorType;
      peak?: number;
      attack?: number;
      detune?: number;
      sweepTo?: number;
    } = {},
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const {
      type = 'sine',
      peak = 0.5,
      attack = 0.005,
      detune = 0,
      sweepTo,
    } = opts;
    const g = ctx.createGain();
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(sweepTo, 0.01),
        start + dur,
      );
    }
    if (detune) osc.detune.setValueAtTime(detune, start);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(this.master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  /** Noise burst; optional bandpass/highpass/lowpass filter. */
  private noise(
    start: number,
    dur: number,
    opts: {
      peak?: number;
      attack?: number;
      filter?: number;
      type?: BiquadFilterType;
      q?: number;
    } = {},
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const { peak = 0.3, attack = 0.01, filter, type = 'bandpass', q = 2 } = opts;
    const samples = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, samples, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = filter;
      f.Q.value = q;
      src.connect(f).connect(g).connect(this.master);
    } else {
      src.connect(g).connect(this.master);
    }
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  // ── Public SFX ────────────────────────────────────────────────────────

  /** Kill — industrial "optimized out" slam. */
  playKill() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    // Sub-bass punch
    this.tone(110, t, 0.7, { type: 'sawtooth', peak: 0.55, attack: 0.002 });
    this.tone(55, t, 0.9, { type: 'sine', peak: 0.45, attack: 0.004 });
    // Downward whine (880→80 Hz)
    this.tone(880, t, 0.6, {
      type: 'sawtooth',
      peak: 0.18,
      attack: 0.01,
      sweepTo: 80,
    });
    // Mechanical noise flutter
    this.noise(t, 0.35, { peak: 0.28, filter: 2000, type: 'bandpass', q: 3 });
  }

  /** Vote — gavel + ceremonial chord tail. */
  playVote() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    // Gavel hit: two-layer metallic thud + transient crack
    this.tone(180, t, 0.35, { type: 'triangle', peak: 0.5 });
    this.tone(380, t, 0.25, { type: 'sine', peak: 0.4 });
    this.tone(720, t + 0.005, 0.15, { type: 'sine', peak: 0.22 });
    this.noise(t, 0.12, { peak: 0.3, filter: 3500, type: 'highpass' });
    // Ceremonial tail — a minor perfect fifth
    this.tone(220, t + 0.15, 0.6, { type: 'sine', peak: 0.25 });
    this.tone(330, t + 0.18, 0.55, { type: 'sine', peak: 0.15 });
  }

  /** Win — rising C major arpeggio + shimmer. */
  playWin() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const freqs = [261.63, 329.63, 392.0, 523.25]; // C4 E4 G4 C5
    freqs.forEach((f, i) => {
      this.tone(f, t + i * 0.1, 0.75, { type: 'triangle', peak: 0.32 });
      this.tone(f * 2, t + i * 0.1, 0.55, { type: 'sine', peak: 0.12 });
    });
    this.noise(t + 0.3, 1.0, { peak: 0.06, filter: 6000, type: 'highpass' });
  }

  /** Lose — descending A minor. */
  playLose() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const freqs = [440, 349.23, 293.66, 220]; // A4 F4 D4 A3
    freqs.forEach((f, i) => {
      this.tone(f, t + i * 0.14, 0.65, { type: 'triangle', peak: 0.28 });
    });
  }

  /** Streak — golden ratchet used on 连中 ≥2 hit. */
  playStreak() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    freqs.forEach((f, i) => {
      this.tone(f, t + i * 0.06, 0.35, { type: 'sine', peak: 0.28 });
      this.tone(f * 1.5, t + i * 0.06, 0.18, { type: 'triangle', peak: 0.08 });
    });
    this.noise(t + 0.18, 0.3, { peak: 0.07, filter: 8000, type: 'highpass' });
  }

  /** Badge — fanfare for streak ≥5 gold medal. */
  playBadge() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    // Fanfare: G4 C5 E5 G5 + high sparkle
    const freqs = [392, 523.25, 659.25, 783.99];
    freqs.forEach((f, i) => {
      this.tone(f, t + i * 0.07, 0.55, { type: 'triangle', peak: 0.35 });
      this.tone(f * 2, t + i * 0.07, 0.3, { type: 'sine', peak: 0.1 });
    });
    // Sparkle tail
    this.tone(1568, t + 0.3, 0.35, { type: 'sine', peak: 0.2 });
    this.tone(2093, t + 0.4, 0.25, { type: 'sine', peak: 0.14 });
    this.noise(t + 0.3, 0.5, { peak: 0.05, filter: 10000, type: 'highpass' });
  }

  /** Subtle tick for pick confirmation in PredictionBar. */
  playPick() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(800, t, 0.08, { type: 'sine', peak: 0.2 });
    this.tone(1200, t + 0.01, 0.05, { type: 'sine', peak: 0.12 });
  }
}

export const sfx = new SfxPlayer();

// Hydrate muted preference. Wrapped because Safari private-mode can throw on
// localStorage access.
try {
  if (typeof window !== 'undefined') {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === '1') sfx.setMuted(true);
  }
} catch {
  /* ignore */
}

// Warm the AudioContext on the first user gesture. Browsers block audio until
// an activation — without this, the first kill SFX would land silent.
if (typeof window !== 'undefined') {
  const warm = () => sfx.resume();
  window.addEventListener('pointerdown', warm, { once: true, passive: true });
  window.addEventListener('keydown', warm, { once: true });
}

export function setSfxMuted(m: boolean) {
  sfx.setMuted(m);
  try {
    if (typeof window !== 'undefined')
      window.localStorage.setItem(STORAGE_KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function isSfxMuted(): boolean {
  return sfx.isMuted();
}
