// Tiny WebAudio blips for the arena (eat, boost, death). Off until the person turns it on; the choice is remembered.
// Browsers only allow sound after a click, and turning it on is that click. Nothing is downloaded: tones are synthesized.

export type Blip = "eat" | "boost" | "death";

export const SOUND_KEY = "goshi-sound";

export interface SoundStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

interface Tone { freq: number; to: number; ms: number; type: OscillatorType; gain: number }

export const TONES: Readonly<Record<Blip, Tone>> = {
  eat: { freq: 620, to: 920, ms: 70, type: "sine", gain: 0.05 },
  boost: { freq: 240, to: 420, ms: 140, type: "triangle", gain: 0.045 },
  death: { freq: 300, to: 70, ms: 420, type: "sawtooth", gain: 0.07 },
};

/** Minimum time between two blips of the same kind (ms): an orb every frame must not become a buzz. */
export const MIN_GAP_MS: Readonly<Record<Blip, number>> = { eat: 55, boost: 400, death: 600 };

export class ArenaSound {
  private ctx: AudioContext | null = null;
  private on: boolean;
  private readonly last: Record<Blip, number> = { eat: -1e9, boost: -1e9, death: -1e9 };
  private readonly store: SoundStorage | null;
  private readonly make: () => AudioContext | null;
  private readonly now: () => number;

  constructor(opts: { storage?: SoundStorage | null; context?: () => AudioContext | null; now?: () => number } = {}) {
    this.store = opts.storage ?? null;
    this.make = opts.context ?? (() => {
      const C = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
      const Ctor = C.AudioContext ?? C.webkitAudioContext;
      return Ctor ? new Ctor() : null;
    });
    this.now = opts.now ?? (() => performance.now());
    let saved: string | null = null;
    try { saved = this.store?.getItem(SOUND_KEY) ?? null; } catch { /* storage blocked */ }
    // Off unless the person chose "on" on a previous visit.
    this.on = saved === "on";
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Call from a click: turns the sound on or off, remembers it and starts the audio context (allowed by that click). */
  toggle(): boolean {
    this.on = !this.on;
    try { this.store?.setItem(SOUND_KEY, this.on ? "on" : "off"); } catch { /* private mode */ }
    if (this.on) this.unlock();
    return this.on;
  }

  /** Creates or resumes the audio context. Only works inside a user gesture, which is where it is called. */
  unlock(): void {
    try {
      this.ctx ??= this.make();
      if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
    } catch { /* no audio on this device */ }
  }

  play(kind: Blip): boolean {
    if (!this.on || !this.ctx) return false;
    const t = this.now();
    if (t - this.last[kind] < MIN_GAP_MS[kind]) return false;
    this.last[kind] = t;
    const c = this.ctx;
    if (c.state !== "running") return false;
    const tone = TONES[kind];
    try {
      const osc = c.createOscillator();
      const g = c.createGain();
      const t0 = c.currentTime;
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.freq, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.to), t0 + tone.ms / 1000);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(tone.gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.ms / 1000);
      osc.connect(g).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + tone.ms / 1000 + 0.02);
      return true;
    } catch {
      return false;
    }
  }
}
