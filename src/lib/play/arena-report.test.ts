import { test } from "node:test";
import assert from "node:assert/strict";
import { ReportRecorder, buildReport, computeMetrics, likelyCauses, percentile, type Env, type Samples } from "./arena-report.ts";

const env: Env = {
  at: "2026-10-10T12:00:00Z", page: "/en/play/", userAgent: "TestAgent/1.0", dpr: 2, canvasCss: [800, 600], canvasPx: [1200, 900],
  cores: 8, memoryGB: 8, gpu: "Test GPU", reducedMotion: false, heapMB: 42.5, qualityMode: "auto", qualityLevel: "high", zone: "phase 2 hold", visibility: "visible",
};

const steady = (over: Partial<Samples> = {}): Samples => ({
  frameGaps: Array.from({ length: 600 }, () => 16.7),
  draws: Array.from({ length: 600 }, () => 2),
  levels: Array.from({ length: 600 }, () => 0),
  snapGaps: Array.from({ length: 200 }, () => 50),
  snapBytes: 90 * 1024 * 10,
  snapSpanMs: 10_000,
  pings: [80, 85, 90],
  longTasks: { count: 0, maxMs: 0, totalMs: 0, supported: true },
  visibilityChanges: 0,
  coveredMs: 10_000,
  ...over,
});

test("percentiles interpolate, ignore order and handle empty input", () => {
  assert.equal(percentile([], 95), 0);
  assert.equal(percentile([5], 99), 5);
  assert.equal(percentile([10, 0, 20, 30, 40], 50), 20);
  assert.equal(percentile([0, 10], 50), 5);
  assert.equal(percentile([1, 2, 3, 4], 100), 4);
  assert.equal(percentile([1, 2, 3, 4], 0), 1);
});

test("a smooth window: 60 fps, steady snapshots, no cause seen", () => {
  const m = computeMetrics(steady());
  assert.ok(Math.abs(m.fpsAvg - 59.88) < 0.1);
  assert.equal(m.over33, 0);
  assert.equal(m.over50, 0);
  assert.equal(m.sps, 20);
  assert.equal(m.gapP50, 50);
  assert.equal(m.jitter, 0);
  assert.equal(m.kbps, 90);
  assert.deepEqual([m.pingMin, m.pingAvg, m.pingMax], [80, 85, 90]);
  assert.deepEqual(m.causes, ["none"]);
});

test("slow drawing is render bound", () => {
  const draws = Array.from({ length: 600 }, (_, i) => (i % 10 === 0 ? 20 : 12));
  const m = computeMetrics(steady({ draws, frameGaps: Array.from({ length: 600 }, () => 40) }));
  assert.ok(m.drawP95 > 8);
  assert.ok(m.over33 === 600);
  assert.deepEqual(m.causes, ["render"]);
});

test("long frames with steady snapshots count as render bound even when draw time looks small", () => {
  const gaps = Array.from({ length: 600 }, (_, i) => (i % 10 === 0 ? 60 : 16.7));
  const m = computeMetrics(steady({ frameGaps: gaps }));
  assert.equal(m.over50, 60);
  assert.ok(m.causes.includes("render"));
});

test("snapshots with big gaps are network bound, and not render bound just because of them", () => {
  const gaps = Array.from({ length: 200 }, (_, i) => (i % 8 === 0 ? 400 : 30));
  const m = computeMetrics(steady({ snapGaps: gaps, frameGaps: Array.from({ length: 600 }, () => 40) }));
  assert.ok(m.gapP95 > 120);
  assert.ok(m.causes.includes("network"));
  assert.ok(!m.causes.includes("render") || m.drawP95 > 8, "frame length alone is not blamed on rendering when the feed is bursty");
});

test("long tasks make it main thread bound", () => {
  const m = computeMetrics(steady({ longTasks: { count: 4, maxMs: 180, totalMs: 400, supported: true } }));
  assert.deepEqual(m.causes, ["main-thread"]);
});

test("too few frames is not enough data", () => {
  const m = computeMetrics(steady({ frameGaps: [16, 16, 16], draws: [1, 1, 1], levels: [0, 0, 0] }));
  assert.deepEqual(m.causes, ["no-data"]);
  assert.deepEqual(likelyCauses({ gapP95: 0, drawP95: 0, over33: 0, p50: 0 }, 0, 0, false), ["no-data"]);
});

test("time at each quality level comes from the frames", () => {
  const levels = [...Array.from({ length: 300 }, () => 0), ...Array.from({ length: 300 }, () => 2)];
  const m = computeMetrics(steady({ levels }));
  assert.ok(Math.abs(m.levelMs[0] - 300 * 16.7) < 1e-6);
  assert.equal(m.levelMs[1], 0);
  assert.ok(Math.abs(m.levelMs[2] - 300 * 16.7) < 1e-6);
});

test("the text names every number the owner asked for", () => {
  const { text } = buildReport(steady({ longTasks: { count: 2, maxMs: 90, totalMs: 150, supported: true }, visibilityChanges: 3 }), env);
  for (const must of [
    "fps avg", "p50", "p95", "p99", "max", "frames over 33 ms", "over 50 ms", "long tasks: 2 (max 90 ms", "snapshots 20/s", "gap ms p50 50",
    "jitter", "KB/s", "ping ms min 80 avg 85 max 90", "quality auto now high", "time at high", "dpr 2", "canvas css 800x600 backing 1200x900",
    "cores 8", "memory 8 GB", "heap 42.5 MB", "gpu: Test GPU", "reduced motion: no", "visibility changes: 3", "page now: visible", "ua: TestAgent/1.0", "likely cause: MAIN THREAD",
  ]) assert.ok(text.includes(must), `missing "${must}" in:\n${text}`);
});

test("unknown values are written as ?, and an unsupported longtask observer says so", () => {
  const { text } = buildReport(steady({ longTasks: { count: 0, maxMs: 0, totalMs: 0, supported: false } }), { ...env, cores: null, memoryGB: null, heapMB: null });
  assert.ok(text.includes("cores ? | memory ? GB | heap ?"));
  assert.ok(text.includes("not supported by this browser"));
});

test("the recorder keeps only the last 30 seconds and survives wrapping", () => {
  const r = new ReportRecorder();
  r.longTaskSupported = true;
  // 40 s of frames at 60 fps, snapshots at 20 Hz, a ping every 2 s.
  for (let t = 0; t < 40_000; t += 16.7) r.frame(t, 16.7, 2, t < 8_000 ? 0 : 1);
  for (let t = 0; t < 40_000; t += 50) r.snapshot(t, 1000);
  for (let t = 0; t < 40_000; t += 2000) r.ping(t, 80 + (t % 3));
  r.longTask(5000, 120); // too old for the window
  r.longTask(39_000, 80);
  r.visibilityChange(1000);
  r.visibilityChange(38_000);
  const s = r.collect(40_000);
  assert.ok(Math.abs(s.frameGaps.length - 30_000 / 16.7) < 3);
  assert.ok(Math.abs(s.snapGaps.length - 599) <= 2);
  assert.ok(s.levels.every((l) => l === 1), "the old level 0 frames are outside the window");
  assert.equal(s.longTasks.count, 1);
  assert.equal(s.longTasks.maxMs, 80);
  assert.equal(s.visibilityChanges, 1);
  assert.equal(s.pings.length, 15);
  assert.ok(s.coveredMs > 29_900 && s.coveredMs <= 30_000);
  // After a long idle the report still has the last window, which is how it is available after you die.
  const later = r.collect(40_500);
  assert.ok(later.frameGaps.length > 1700);
  r.reset();
  assert.equal(r.collect(40_000).frameGaps.length, 0);
});

test("the recorder wraps its ring buffers without losing the order", () => {
  const r = new ReportRecorder();
  for (let i = 0; i < 6000; i++) r.frame(i * 5, 5 + (i % 7), 1, 0);
  const s = r.collect(6000 * 5);
  assert.ok(s.frameGaps.length > 0 && s.frameGaps.length <= 4096);
  const first = (6000 - s.frameGaps.length) ;
  assert.equal(s.frameGaps[0], 5 + (first % 7));
  assert.equal(s.frameGaps[s.frameGaps.length - 1], 5 + (5999 % 7));
});

test("a hidden page is flagged so slow frames are not blamed on the game", () => {
  const { text } = buildReport(steady(), { ...env, visibility: "hidden" });
  assert.ok(text.includes("page now: hidden (a hidden tab is throttled"));
});
