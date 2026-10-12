// Numbers for the diagnostics line of the arena: frame rate, the worst frame, snapshot rate and jitter, bytes per second,
// draw time. Fixed size ring buffers (no allocation per frame). Pure, with the clock passed in.

const FRAMES = 256;
const SNAPS = 128;

export interface DiagSummary {
  fps: number;
  /** Longest gap between two frames in the last 2 seconds (ms). */
  worstMs: number;
  /** Average time spent drawing a frame in the last second (ms). */
  drawMs: number;
  /** Snapshots per second (last 2 s). */
  sps: number;
  /** Standard deviation of the time between snapshots (ms, last 2 s). */
  jitterMs: number;
  /** Bytes received per second (last 2 s). */
  bytesPerSec: number;
}

export class ArenaDiag {
  private readonly ft = new Float64Array(FRAMES);
  private readonly fg = new Float64Array(FRAMES);
  private readonly fd = new Float64Array(FRAMES);
  private fi = 0;
  private fn = 0;
  private readonly st = new Float64Array(SNAPS);
  private readonly sb = new Float64Array(SNAPS);
  private si = 0;
  private sn = 0;

  /** A frame ended at `now`, `gapMs` after the previous one, and drawing took `drawMs`. */
  frame(gapMs: number, drawMs: number, now: number): void {
    this.ft[this.fi] = now;
    this.fg[this.fi] = gapMs;
    this.fd[this.fi] = drawMs;
    this.fi = (this.fi + 1) % FRAMES;
    if (this.fn < FRAMES) this.fn++;
  }

  /** A snapshot of `bytes` arrived at `now`. */
  snapshot(now: number, bytes: number): void {
    this.st[this.si] = now;
    this.sb[this.si] = bytes;
    this.si = (this.si + 1) % SNAPS;
    if (this.sn < SNAPS) this.sn++;
  }

  reset(): void {
    this.fn = this.sn = this.fi = this.si = 0;
  }

  summary(now: number): DiagSummary {
    let frames1 = 0, worst = 0, draw = 0, drawN = 0;
    for (let k = 0; k < this.fn; k++) {
      const i = (this.fi - 1 - k + FRAMES) % FRAMES;
      const age = now - this.ft[i];
      if (age > 2000) break;
      if (this.fg[i] > worst) worst = this.fg[i];
      if (age <= 1000) { frames1++; draw += this.fd[i]; drawN++; }
    }
    let snaps = 0, bytes = 0, prev = -1, n = 0, sum = 0, sumSq = 0;
    // Walk oldest to newest inside the 2 second window.
    const inWin: number[] = [];
    for (let k = 0; k < this.sn; k++) {
      const i = (this.si - 1 - k + SNAPS) % SNAPS;
      if (now - this.st[i] > 2000) break;
      snaps++;
      bytes += this.sb[i];
      inWin.push(i);
    }
    for (let k = inWin.length - 1; k >= 0; k--) {
      const t = this.st[inWin[k]];
      if (prev >= 0) { const d = t - prev; n++; sum += d; sumSq += d * d; }
      prev = t;
    }
    const mean = n > 0 ? sum / n : 0;
    const jitter = n > 1 ? Math.sqrt(Math.max(0, sumSq / n - mean * mean)) : 0;
    return {
      fps: frames1,
      worstMs: worst,
      drawMs: drawN > 0 ? draw / drawN : 0,
      sps: snaps / 2,
      jitterMs: jitter,
      bytesPerSec: bytes / 2,
    };
  }
}
