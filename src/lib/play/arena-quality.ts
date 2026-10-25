// Adaptive render quality for the arena. Glow is what makes the neon look and what makes a slow GPU stutter
// (shadowBlur especially), so the arena measures its own frame time and gives up the expensive parts first.
// Pure logic with an injected clock and storage, unit tested.

/** 0 = high, 1 = medium, 2 = low. */
export type Level = 0 | 1 | 2;
export type QualityMode = "auto" | "high" | "medium" | "low";

export const LEVEL_NAMES = ["high", "medium", "low"] as const;
export const QUALITY_KEY = "goshi-quality";

export interface QualitySettings {
  /** Glow with the canvas shadowBlur (nicest, most expensive). */
  shadowGlow: boolean;
  /** Glow made of two wide faint strokes (no shadowBlur). */
  layeredGlow: boolean;
  /** A soft shine along the body. */
  shine: boolean;
  /** Eat rings, death bursts and boost sparks. */
  particles: boolean;
  vignette: boolean;
  /** The canvas never has more device pixels per CSS pixel than this. */
  dprCap: number;
}

export const SETTINGS: Readonly<Record<Level, QualitySettings>> = {
  0: { shadowGlow: true, layeredGlow: false, shine: true, particles: true, vignette: true, dprCap: 1.5 },
  1: { shadowGlow: false, layeredGlow: true, shine: true, particles: true, vignette: true, dprCap: 1.25 },
  2: { shadowGlow: false, layeredGlow: false, shine: true, particles: true, vignette: false, dprCap: 1 },
};

/** Average frame time above this over a window means the device cannot keep up (the ceiling, for 60 Hz screens). */
export const SLOW_FRAME_MS = 20;
/** On faster screens the limit is this many times the screen's own frame time (10 ms on 120 Hz). */
export const SLOW_FRAME_RATIO = 1.2;
export const WINDOW_MS = 1500;
export const RECOVER_AFTER_MS = 6000;
export const MAX_RECOVER_MS = 60_000;
/** A gap longer than this is a hidden tab or a pause, not a slow frame. */
export const PAUSE_MS = 250;

export interface QualityStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const isMode = (v: unknown): v is QualityMode => v === "auto" || v === "high" || v === "medium" || v === "low";
const modeLevel = (m: Exclude<QualityMode, "auto">): Level => (m === "high" ? 0 : m === "medium" ? 1 : 2);

export class QualityManager {
  private _mode: QualityMode = "auto";
  private auto: Level = 0;
  private readonly store: QualityStorage | null;
  private winStart = -1;
  private sum = 0;
  private count = 0;
  private goodMs = 0;
  private recoverWait = RECOVER_AFTER_MS;
  private lastRecoverAt = -1e9;
  /** The screen's frame time: the best window average seen so far. */
  private refreshMs = 1000 / 60;

  constructor(store: QualityStorage | null = null) {
    this.store = store;
    try {
      const saved = store?.getItem(QUALITY_KEY);
      if (isMode(saved)) this._mode = saved;
    } catch { /* storage blocked */ }
  }

  get mode(): QualityMode {
    return this._mode;
  }

  /** The level in use now: the chosen one, or the automatic one. */
  get level(): Level {
    return this._mode === "auto" ? this.auto : modeLevel(this._mode);
  }

  get settings(): QualitySettings {
    return SETTINGS[this.level];
  }

  setMode(m: QualityMode): void {
    this._mode = m;
    try { this.store?.setItem(QUALITY_KEY, m); } catch { /* private mode */ }
    this.resetWindow();
  }

  private resetWindow() {
    this.winStart = -1;
    this.sum = 0;
    this.count = 0;
  }

  /**
   * One frame took `frameMs` (the time between two frames) and ended at `nowMs`. Returns true when the level changed.
   * Drops one level when a 1.5 s window averages more than 20 ms (or 1.2x the screen's frame time when it is faster); goes back up one level after 6 s of good windows
   * (and waits twice as long each time a recovery is followed by a drop within 10 s).
   */
  record(frameMs: number, nowMs: number): boolean {
    if (this._mode !== "auto") return false;
    if (!(frameMs >= 0) || frameMs > PAUSE_MS) { this.resetWindow(); this.goodMs = 0; return false; }
    if (this.winStart < 0) this.winStart = nowMs;
    this.sum += frameMs;
    this.count++;
    const span = nowMs - this.winStart;
    if (span < WINDOW_MS) return false;
    const avg = this.sum / this.count;
    this.resetWindow();
    if (avg < this.refreshMs) this.refreshMs = Math.max(4, avg);
    if (avg > Math.min(SLOW_FRAME_MS, this.refreshMs * SLOW_FRAME_RATIO)) {
      this.goodMs = 0;
      if (this.auto < 2) {
        // Dropping soon after a recovery means the level above is too much for this device: wait longer next time.
        if (nowMs - this.lastRecoverAt < 10_000) this.recoverWait = Math.min(MAX_RECOVER_MS, this.recoverWait * 2);
        this.auto = (this.auto + 1) as Level;
        return true;
      }
      return false;
    }
    this.goodMs += span;
    if (this.auto > 0 && this.goodMs >= this.recoverWait) {
      this.auto = (this.auto - 1) as Level;
      this.goodMs = 0;
      this.lastRecoverAt = nowMs;
      return true;
    }
    return false;
  }
}
