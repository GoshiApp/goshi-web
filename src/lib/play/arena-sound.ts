// The sound of the arena, synthesized with WebAudio: nothing is downloaded and nothing is sampled, so there is nothing to license.
// Effects (eat streak, boost, kills, death, win, zone alarm, bonus coins), meme style stingers that are our own synthesis, and a
// small synthwave loop that gets busier when few players are left. It starts on its own with the first Play click (browsers only
// allow audio after a click) unless the person chose otherwise; the choice is remembered. Music and meme stingers have their own switch.

export type Blip = "eat" | "boost" | "death" | "kill" | "win" | "start" | "zone" | "bonus";

export const SOUND_KEY = "goshi-sound";
export const MUSIC_KEY = "goshi-music";
export const MEME_KEY = "goshi-meme";

export interface SoundStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** Minimum time between two blips of the same kind (ms): an orb every frame must not become a buzz. */
export const MIN_GAP_MS: Readonly<Record<Blip, number>> = { eat: 55, boost: 400, death: 600, kill: 250, win: 2000, start: 1500, zone: 4000, bonus: 120 };

/** Notes of the eat streak: a major pentatonic scale, in semitones above C5. Going up feels like winning. */
export const EAT_SCALE: readonly number[] = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const EAT_STREAK_MS = 1100;

const hz = (semi: number, base = 523.25) => base * Math.pow(2, semi / 12);

/** The melody of the loop: MIDI notes, eight per bar, four bars (Am, F, C, G); 0 is a rest. */
const HOOK: readonly number[] = [
  81, 79, 76, 79, 81, 81, 79, 76,
  77, 76, 72, 76, 77, 77, 76, 72,
  76, 74, 72, 74, 76, 79, 76, 74,
  74, 76, 79, 76, 74, 71, 74, 79,
];

export class ArenaSound {
  private ctx: AudioContext | null = null;
  private fx: AudioNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private on: boolean;
  private musicOn: boolean;
  private memeOn: boolean;
  private streak = 0;
  private streakAt = -1e9;
  private readonly last: Record<Blip, number> = { eat: -1e9, boost: -1e9, death: -1e9, kill: -1e9, win: -1e9, start: -1e9, zone: -1e9, bonus: -1e9 };
  private readonly store: SoundStorage | null;
  private readonly make: () => AudioContext | null;
  private readonly now: () => number;
  // Music scheduler.
  private musicRun = false;
  private musicTimer: ReturnType<typeof setTimeout> | null = null;
  private nextStepAt = 0;
  private step = 0;
  private level = 0;

  private readonly enhanced: boolean;

  constructor(opts: { storage?: SoundStorage | null; context?: () => AudioContext | null; now?: () => number; enhanced?: boolean } = {}) {
    this.enhanced = opts.enhanced ?? true;
    this.store = opts.storage ?? null;
    this.make = opts.context ?? (() => {
      const C = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
      const Ctor = C.AudioContext ?? C.webkitAudioContext;
      return Ctor ? new Ctor() : null;
    });
    this.now = opts.now ?? (() => performance.now());
    const get = (k: string): string | null => { try { return this.store?.getItem(k) ?? null; } catch { return null; } };
    // Off unless the person chose "on" on a previous visit (autoEnable turns it on at the first Play click if they never chose).
    this.on = get(SOUND_KEY) === "on";
    this.musicOn = get(MUSIC_KEY) !== "off";
    this.memeOn = get(MEME_KEY) !== "off";
  }

  get enabled(): boolean { return this.on; }
  get music(): boolean { return this.musicOn; }
  get memes(): boolean { return this.memeOn; }

  private save(k: string, v: string) { try { this.store?.setItem(k, v); } catch { /* private mode */ } }

  /** Call from a click: turns the sound on or off, remembers it and starts the audio context (allowed by that click). */
  toggle(): boolean {
    this.on = !this.on;
    this.save(SOUND_KEY, this.on ? "on" : "off");
    if (this.on) this.unlock(); else this.stopMusic();
    return this.on;
  }

  toggleMusic(): boolean {
    this.musicOn = !this.musicOn;
    this.save(MUSIC_KEY, this.musicOn ? "on" : "off");
    if (this.musicOn) this.startMusic(); else this.stopMusic();
    return this.musicOn;
  }

  toggleMemes(): boolean {
    this.memeOn = !this.memeOn;
    this.save(MEME_KEY, this.memeOn ? "on" : "off");
    return this.memeOn;
  }

  /** Called from the Play click: sound starts on its own unless the person has already chosen (on or off). */
  autoEnable(): void {
    if (!this.enhanced) return;
    let saved: string | null = null;
    try { saved = this.store?.getItem(SOUND_KEY) ?? null; } catch { /* blocked */ }
    if (saved === null) this.on = true;
    if (this.on) this.unlock();
  }

  /** Creates or resumes the audio context. Only works inside a user gesture, which is where it is called. */
  unlock(): void {
    try {
      if (!this.ctx) {
        this.ctx = this.make();
        const c = this.ctx;
        if (c && typeof c.createGain === "function") {
          const master = c.createGain();
          master.gain.value = 0.9;
          let out: AudioNode = master;
          if (typeof c.createDynamicsCompressor === "function") {
            const comp = c.createDynamicsCompressor();
            master.connect(comp);
            out = comp;
          }
          out.connect(c.destination);
          this.fx = master;
          this.musicBus = c.createGain();
          this.musicBus.gain.value = 0.32;
          this.musicBus.connect(master);
        } else if (c) {
          this.fx = c.destination;
        }
      }
      if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
    } catch { /* no audio on this device */ }
  }

  // ------------------------------------------------------------------ building blocks

  private tone(o: { f0: number; f1?: number; ms: number; type?: OscillatorType; gain: number; at?: number; lp?: number; vib?: number; bus?: AudioNode | null }): void {
    const c = this.ctx; const bus = o.bus ?? this.fx;
    if (!c || !bus) return;
    const t0 = o.at ?? c.currentTime;
    const dur = o.ms / 1000;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + Math.min(0.012, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = osc;
    if (o.lp && typeof c.createBiquadFilter === "function") {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.lp;
      node.connect(f);
      node = f;
    }
    node.connect(g).connect(bus);
    if (o.vib) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 6;
      lg.gain.value = o.vib;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  private noise(o: { ms: number; gain: number; f0: number; f1: number; at?: number; q?: number; bus?: AudioNode | null; kind?: BiquadFilterType }): void {
    const c = this.ctx; const bus = o.bus ?? this.fx;
    if (!c || !bus || typeof c.createBuffer !== "function" || typeof c.createBufferSource !== "function" || typeof c.createBiquadFilter !== "function") return;
    if (!this.noiseBuf) {
      const len = Math.floor(c.sampleRate);
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = o.at ?? c.currentTime;
    const dur = o.ms / 1000;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.kind ?? "bandpass";
    f.Q.value = o.q ?? 1.2;
    f.frequency.setValueAtTime(o.f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  // ------------------------------------------------------------------ effects

  play(kind: Blip): boolean {
    if (!this.on || !this.ctx) return false;
    const t = this.now();
    if (t - this.last[kind] < MIN_GAP_MS[kind]) return false;
    this.last[kind] = t;
    const c = this.ctx;
    if (c.state !== "running") return false;
    if (!this.enhanced) return this.classic(kind);
    try {
      const at = c.currentTime;
      switch (kind) {
        case "eat": {
          // A streak climbs the scale; a pause lets it fall back to the bottom.
          this.streak = t - this.streakAt > EAT_STREAK_MS ? 0 : this.streak + 1;
          this.streakAt = t;
          const note = EAT_SCALE[Math.min(this.streak, EAT_SCALE.length - 1)];
          this.tone({ f0: hz(note), f1: hz(note) * 1.02, ms: 90, type: "triangle", gain: 0.09 });
          this.tone({ f0: hz(note + 12), ms: 60, type: "sine", gain: 0.03 });
          // Streak milestones: a short arcade rise.
          if (this.streak === 5 || this.streak === 10) {
            [0, 4, 7, 12].forEach((s, i) => this.tone({ f0: hz(s + 12), ms: 90, type: "square", gain: 0.05, at: at + 0.04 + i * 0.06, lp: 3000 }));
          }
          break;
        }
        case "bonus":
          // A rich coin: a coin chime plus a boing.
          this.tone({ f0: hz(19, 659), ms: 70, type: "square", gain: 0.05, lp: 4000 });
          this.tone({ f0: hz(24, 659), ms: 160, type: "square", gain: 0.05, at: at + 0.07, lp: 4000 });
          this.tone({ f0: 220, f1: 880, ms: 220, type: "sine", gain: 0.07, vib: 40 });
          break;
        case "boost":
          this.noise({ ms: 260, gain: 0.12, f0: 300, f1: 3200, q: 2 });
          this.tone({ f0: 180, f1: 520, ms: 230, type: "triangle", gain: 0.06 });
          break;
        case "kill":
          if (this.memeOn) {
            // Vine boom: a sub drop with a thump and a bell.
            this.tone({ f0: 120, f1: 36, ms: 650, type: "sine", gain: 0.5 });
            this.noise({ ms: 120, gain: 0.25, f0: 900, f1: 80, kind: "lowpass", q: 0.7 });
            this.tone({ f0: 1320, ms: 380, type: "sine", gain: 0.05, at: at + 0.05 });
          } else {
            this.tone({ f0: 180, f1: 60, ms: 220, type: "sine", gain: 0.3 });
            this.tone({ f0: 990, ms: 160, type: "sine", gain: 0.05, at: at + 0.04 });
          }
          break;
        case "death":
          if (this.memeOn) {
            // Sad trombone: four falling notes, the last one slides and wobbles.
            const notes: [number, number][] = [[233, 330], [220, 330], [208, 330], [196, 900]];
            let tt = at;
            notes.forEach(([f, ms], i) => {
              this.tone({ f0: f, f1: i === 3 ? f * 0.82 : undefined, ms, type: "sawtooth", gain: 0.1, at: tt, lp: 900, vib: i === 3 ? 6 : 0 });
              tt += (ms / 1000) * 0.98;
            });
          } else {
            this.tone({ f0: 300, f1: 70, ms: 420, type: "sawtooth", gain: 0.07 });
          }
          break;
        case "win":
          if (this.memeOn) {
            // Airhorn: stacked, slightly detuned saws that fall at the end, three hits.
            [0, 0.22, 0.44].forEach((d, i) => {
              const f = i === 2 ? 620 : 466;
              const len = i === 2 ? 700 : 190;
              this.tone({ f0: f, f1: i === 2 ? f * 0.93 : undefined, ms: len, type: "sawtooth", gain: 0.1, at: at + d, lp: 3200, vib: 8 });
              this.tone({ f0: f * 1.5 * 1.004, ms: len, type: "square", gain: 0.05, at: at + d, lp: 2600 });
            });
          } else {
            [0, 4, 7, 12].forEach((s, i) => this.tone({ f0: hz(s), ms: 260, type: "triangle", gain: 0.08, at: at + i * 0.1 }));
          }
          break;
        case "start":
          [0, 7, 12].forEach((s, i) => this.tone({ f0: hz(s - 12), ms: 120, type: "square", gain: 0.05, at: at + i * 0.09, lp: 3000 }));
          break;
        case "zone":
          // A soft two tone alarm, twice.
          [0, 0.45].forEach((d) => {
            this.tone({ f0: 440, ms: 200, type: "sine", gain: 0.07, at: at + d });
            this.tone({ f0: 330, ms: 220, type: "sine", gain: 0.07, at: at + d + 0.2 });
          });
          break;
      }
      return true;
    } catch {
      return false;
    }
  }

  /** The original three blips (eat, boost, death) of the first version: what the real game keeps until the new sound is approved. */
  private classic(kind: Blip): boolean {
    const t: Partial<Record<Blip, { f0: number; f1: number; ms: number; type: OscillatorType; gain: number }>> = {
      eat: { f0: 620, f1: 920, ms: 70, type: "sine", gain: 0.05 },
      boost: { f0: 240, f1: 420, ms: 140, type: "triangle", gain: 0.045 },
      death: { f0: 300, f1: 70, ms: 420, type: "sawtooth", gain: 0.07 },
    };
    const tone = t[kind];
    if (!tone) return false;
    try { this.tone(tone); return true; } catch { return false; }
  }

  // ------------------------------------------------------------------ music

  /** Starts the loop (from the first running frame of a match). */
  startMusic(): void {
    if (!this.enhanced || !this.on || !this.musicOn || this.musicRun) return;
    this.unlock();
    const c = this.ctx;
    if (!c || c.state !== "running" || !this.musicBus) return;
    this.musicRun = true;
    this.step = 0;
    this.nextStepAt = c.currentTime + 0.08;
    const pump = () => {
      if (!this.musicRun || !this.ctx) return;
      const cc = this.ctx;
      while (this.nextStepAt < cc.currentTime + 0.25) {
        this.scheduleStep(this.step, this.nextStepAt);
        this.nextStepAt += 60 / 124 / 4; // sixteenth notes at 124 bpm
        this.step = (this.step + 1) % 64;
      }
      this.musicTimer = setTimeout(pump, 60);
    };
    pump();
  }

  stopMusic(): void {
    this.musicRun = false;
    if (this.musicTimer) clearTimeout(this.musicTimer);
    this.musicTimer = null;
  }

  /** 0 calm, 1 busier, 2 final: the loop adds layers as the arena empties. */
  setIntensity(level: number): void {
    this.level = Math.max(0, Math.min(2, Math.round(level)));
  }

  private scheduleStep(i: number, at: number): void {
    const bus = this.musicBus;
    if (!bus) return;
    // Am - F - C - G, one bar (16 steps) each.
    const roots = [45, 41, 36, 43]; // MIDI: A2, F2, C2, G2
    const chords: number[][] = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
    const bar = Math.floor(i / 16) % 4;
    const s = i % 16;
    const root = roots[bar];
    const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    // Bass: a pulse on the beat and the off-beat.
    if (s % 4 === 2 || s === 0) this.tone({ f0: midi(root), ms: 160, type: "sawtooth", gain: 0.5, at, lp: 420, bus });
    // Arpeggio: eighth notes up the chord, an octave higher when the arena is nearly empty.
    if (s % 2 === 0) {
      const ch = chords[bar];
      const n = root + 24 + ch[(s / 2) % ch.length] + (this.level >= 2 && s % 8 === 6 ? 12 : 0);
      this.tone({ f0: midi(n), ms: 140, type: "square", gain: 0.1, at, lp: this.level >= 1 ? 3200 : 1700, bus });
    }
    // The hook: an eight note melody that repeats every four bars (A minor pentatonic over the same chords), the part that sticks.
    if (s % 2 === 0) {
      const note = HOOK[bar * 8 + s / 2];
      if (note > 0) {
        this.tone({ f0: midi(note), ms: 190, type: "square", gain: 0.14, at, lp: 2600, bus });
        this.tone({ f0: midi(note + 12), ms: 120, type: "triangle", gain: this.level >= 2 ? 0.1 : 0.05, at, bus });
      }
    }
    // Kick on every beat and hats from level 1, a snare feel from level 2.
    if (this.level >= 1 && s % 4 === 0) this.tone({ f0: 150, f1: 45, ms: 140, type: "sine", gain: 0.55, at, bus });
    if (this.level >= 1 && s % 2 === 1) this.noise({ ms: 40, gain: 0.07, f0: 7000, f1: 9000, at, bus, kind: "highpass", q: 0.7 });
    if (this.level >= 2 && (s === 4 || s === 12)) this.noise({ ms: 110, gain: 0.16, f0: 2500, f1: 1200, at, bus, q: 0.8 });
  }
}
