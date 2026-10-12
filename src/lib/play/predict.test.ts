import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOST_SPEED, MAX_EXTRAPOLATE_S, RttMeter, TURN_RATE, advance, ahead, angleDiff, bodyRadius, effectiveSpeed, extendBody,
  extendBodyInto, lookAheadSeconds, observedSpeed, pathLength, reconcile, smoothingFactor, speedOf, trimPath, turnToward, type Pt,
} from "./predict.ts";
import { LIVE_DELAY_MS, SnapBuffer, extrapolatePlayer, type TimedSnap } from "./interp.ts";
import type { PlayerSnap } from "./protocol.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test("speed and radius follow the server formulas", () => {
  near(speedOf(0), 135);
  near(speedOf(300), 67.5);
  near(bodyRadius(20), 10 + 1.1 * Math.sqrt(20));
  assert.ok(bodyRadius(20) > 14.9 && bodyRadius(20) < 15.1, "about 15 at the start");
  near(effectiveSpeed(20, true), speedOf(20) * BOOST_SPEED);
  near(effectiveSpeed(12, true), speedOf(12), 1e-9); // nothing to burn at the minimum mass
  near(effectiveSpeed(20, false), speedOf(20));
});

test("turning is limited to 270 degrees per second and takes the short way", () => {
  near(turnToward(0, Math.PI, 0.1), TURN_RATE * 0.1);
  near(turnToward(0, 0.2, 1), 0.2);
  // From just under PI to just over -PI is a small turn through the back, not a full circle.
  near(angleDiff(3.0, -3.0), 2 * Math.PI - 6.0);
  const h = turnToward(3.0, -3.0, 1);
  near(Math.cos(h), Math.cos(-3.0));
});

test("advance turns first, then moves along the new heading", () => {
  const k = advance({ x: 0, y: 0, h: 0 }, Math.PI / 2, 100, 0.1);
  near(k.h, TURN_RATE * 0.1);
  near(k.x, Math.cos(k.h) * 10);
  near(k.y, Math.sin(k.h) * 10);
  const straight = advance({ x: 5, y: 5, h: 1 }, null, 50, 0.2);
  near(straight.h, 1);
  near(Math.hypot(straight.x - 5, straight.y - 5), 10);
});

test("ahead is capped so a stalled feed does not fling the head across the map", () => {
  const p = ahead([0, 0], 0, 100, 10);
  near(p[0], 100 * MAX_EXTRAPOLATE_S);
  assert.deepEqual(ahead([1, 2], 0, 100, -1), [1, 2]);
});

test("the look ahead is the time since the snapshot plus half the round trip", () => {
  near(lookAheadSeconds(30, 120), 0.09);
  near(lookAheadSeconds(0, 0), 0);
  near(lookAheadSeconds(-5, 0), 0);
});

test("reconcile absorbs a small error smoothly and snaps a large one", () => {
  const small = reconcile({ x: 0, y: 0, h: 0.5 }, [10, 0], 0.05);
  assert.equal(small.snapped, false);
  assert.ok(small.kin.x > 0 && small.kin.x < 10);
  near(small.kin.x, 10 * smoothingFactor(0.05));
  assert.equal(small.kin.h, 0.5, "the heading is the player's own");
  const big = reconcile({ x: 0, y: 0, h: 0.5 }, [0, 61], 0.05);
  assert.equal(big.snapped, true);
  assert.deepEqual([big.kin.x, big.kin.y], [0, 61]);
  const edge = reconcile({ x: 0, y: 0, h: 0 }, [60, 0], 0.05);
  assert.equal(edge.snapped, false, "60 units is still smoothed");
});

test("repeated reconcile converges on the reference", () => {
  let k = { x: 0, y: 0, h: 0 };
  for (let i = 0; i < 60; i++) k = reconcile(k, [30, -20], 1 / 60).kin;
  assert.ok(Math.hypot(k.x - 30, k.y + 20) < 0.5);
});

test("trimPath and pathLength keep the first part of a path", () => {
  const path: Pt[] = [[0, 0], [10, 0], [10, 10]];
  near(pathLength(path), 20);
  assert.deepEqual(trimPath(path, 15), [[0, 0], [10, 0], [10, 5]]);
  assert.deepEqual(trimPath(path, 100), path);
  assert.deepEqual(trimPath(path, 0), [[0, 0]]);
});

test("extendBody moves the head ahead and keeps the length of the snake", () => {
  const head: Pt = [100, 0];
  const body: Pt[] = [[90, 0], [80, 0], [70, 0]];
  const out = extendBody(head, body, [112, 0]);
  near(pathLength([[112, 0], ...out]), pathLength([head, ...body]));
  assert.deepEqual(out[0], head, "the old head becomes the first body point");
  assert.deepEqual(out.at(-1), [82, 0]);
  assert.deepEqual(extendBody(head, body, head), body);
});

test("observed speed follows a boost but ignores impossible jumps", () => {
  const base = speedOf(20);
  near(observedSpeed({ x: 0, y: 0 }, { x: base * 0.05, y: 0 }, 20, 0.05), base);
  near(observedSpeed({ x: 0, y: 0 }, { x: base * 0.05 * 1.7, y: 0 }, 20, 0.05), base * 1.7, 1e-6);
  near(observedSpeed({ x: 0, y: 0 }, { x: 900, y: 0 }, 20, 0.05), base * 1.7 * 1.05);
  near(observedSpeed({ x: 0, y: 0 }, { x: 0, y: 0 }, 20, 0.05), base * 0.9);
  near(observedSpeed({ x: 0, y: 0 }, { x: 5, y: 0 }, 20, 0), base);
});

const P = (w: string, x: number, h: number, body: Pt[] = [[x - 10, 0], [x - 20, 0]], m = 20): PlayerSnap => ({
  w, n: w, role: "paid", bot: false, alive: true, prot: false, h, m, r: bodyRadius(m), head: [x, 0], body,
});
const S = (at: number, tick: number, ...players: PlayerSnap[]): TimedSnap => ({ at, tick, players, zone: { cx: 1500, cy: 1500, r: 1400 } });

test("an other player is extrapolated along its heading, with its observed speed", () => {
  const prev = S(0, 1, P("a", 0, 0));
  const cur = S(50, 2, P("a", speedOf(20) * 0.05, 0));
  const out = extrapolatePlayer(cur.players[0], prev, cur, 0.1);
  near(out.head[0], cur.players[0].head[0] + speedOf(20) * 0.1, 1e-6);
  assert.equal(out.head[1], 0);
  near(pathLength([out.head, ...out.body]), pathLength([cur.players[0].head, ...cur.players[0].body]));
});

test("a dead player or a zero extrapolation is returned as it is", () => {
  const cur = S(0, 1, { ...P("a", 0, 0), alive: false, body: [] });
  assert.equal(extrapolatePlayer(cur.players[0], null, cur, 0.1), cur.players[0]);
  const live = S(0, 1, P("b", 0, 0));
  assert.equal(extrapolatePlayer(live.players[0], null, live, 0), live.players[0]);
});

test("the live view blends only a little and leads by half the round trip", () => {
  const b = new SnapBuffer();
  const v = speedOf(20) * 0.05;
  b.push(S(1000, 10, P("a", 0, 0)));
  b.push(S(1050, 11, P("a", v, 0)));
  b.push(S(1100, 12, P("a", 2 * v, 0)));
  // Between snapshots 11 and 12 (draw time 1075) with a 100 ms round trip (50 ms lead).
  const out = b.sampleLive(1075 + LIVE_DELAY_MS, 100)!;
  near(out.players[0].head[0], 1.5 * v + speedOf(20) * 0.05, 1e-6);
  // With no round trip and no late snapshot it is plain interpolation.
  near(b.sampleLive(1075 + LIVE_DELAY_MS, 0)!.players[0].head[0], 1.5 * v, 1e-6);
});

test("when a snapshot is late the live view keeps moving instead of freezing, up to a limit", () => {
  const b = new SnapBuffer();
  const v = speedOf(20) * 0.05;
  b.push(S(1000, 10, P("a", 0, 0)));
  b.push(S(1050, 11, P("a", v, 0)));
  const x1 = b.sampleLive(1050 + LIVE_DELAY_MS + 100, 0)!.players[0].head[0];
  near(x1, v + speedOf(20) * 0.1, 1e-6);
  const far = b.sampleLive(1050 + LIVE_DELAY_MS + 5000, 0)!.players[0].head[0];
  near(far, v + speedOf(20) * MAX_EXTRAPOLATE_S, 1e-6);
});

test("the round trip meter takes the pong against the ping, smooths and reacts to a spike", () => {
  const m = new RttMeter();
  assert.equal(m.known, false);
  assert.equal(m.received(10), null, "a pong with no ping is ignored");
  m.sent(100);
  assert.equal(m.received(220), 120);
  assert.equal(m.ms, 120);
  m.sent(300);
  m.received(380); // 80
  near(m.ms, 120 * 0.8 + 80 * 0.2);
  m.sent(400);
  m.received(800); // 400: a spike is taken half and half
  near(m.ms, (120 * 0.8 + 80 * 0.2) * 0.5 + 200);
});

test("prediction keeps the drawn head close to where the server is now, with 60 ms each way and 20 Hz snapshots", () => {
  const ONE_WAY = 0.06;
  const TICK = 0.05;
  const FRAME = 1 / 60;
  const mass = 20;
  const speed = speedOf(mass);
  // The player steers: the wanted heading changes every second by +-90 degrees.
  const wantAt = (t: number) => [0, Math.PI / 2, Math.PI, Math.PI / 2, 0, -Math.PI / 2][Math.floor(t) % 6];
  // Server truth with a fine step; inputs reach it ONE_WAY late.
  const truth: { t: number; x: number; y: number; h: number }[] = [];
  {
    let k = { x: 1500, y: 1500, h: 0 };
    for (let t = 0; t <= 10; t += 0.005) {
      k = advance(k, wantAt(Math.max(0, t - ONE_WAY)), speed, 0.005);
      truth.push({ t, ...k });
    }
  }
  const at = (t: number) => truth[Math.min(truth.length - 1, Math.round(t / 0.005))];
  // Snapshots: taken at every tick, arrive ONE_WAY later.
  const snaps = Array.from({ length: 200 }, (_, i) => {
    const t = (i + 1) * TICK;
    const s = at(t);
    return { arrive: t + ONE_WAY, head: [s.x, s.y] as Pt, h: s.h };
  });
  const rtt = ONE_WAY * 2000;
  let local: { x: number; y: number; h: number } | null = null;
  let want = 0;
  let naive = 0, predicted = 0, worst = 0, n = 0;
  for (let t = 1; t < 9; t += FRAME) {
    const latest = [...snaps].reverse().find((s) => s.arrive <= t)!;
    want = wantAt(t); // the drawn snake reacts at once
    const ref = ahead(latest.head, latest.h, speed, lookAheadSeconds((t - latest.arrive) * 1000, rtt));
    local = local ? reconcile(advance(local, want, speed, FRAME), ref, FRAME).kin : { x: ref[0], y: ref[1], h: latest.h };
    const s = at(t);
    naive += Math.hypot(latest.head[0] - s.x, latest.head[1] - s.y);
    const e = Math.hypot(local.x - s.x, local.y - s.y);
    predicted += e;
    worst = Math.max(worst, e);
    n++;
  }
  naive /= n; predicted /= n;
  assert.ok(naive > 8, `the unpredicted head is more than half a body radius behind (${naive.toFixed(1)})`);
  assert.ok(predicted < naive * 0.5, `prediction halves the error (${predicted.toFixed(1)} vs ${naive.toFixed(1)})`);
  assert.ok(worst < 40, `no frame is more than 40 units off (${worst.toFixed(1)})`);
});

const SZ = (at: number, tick: number, zone: { cx: number; cy: number; r: number; target?: { cx: number; cy: number; r: number } }, ...players: PlayerSnap[]): TimedSnap => ({
  at, tick, players, zone,
});

test("the zone moves between snapshots: its center and radius are blended, not the arena center", () => {
  const b = new SnapBuffer();
  b.push(SZ(1000, 10, { cx: 1500, cy: 1500, r: 1000 }, P("a", 0, 0)));
  b.push(SZ(1100, 12, { cx: 1560, cy: 1440, r: 980 }, P("a", 10, 0)));
  // Halfway between the two snapshots (with no live delay and no lead).
  const mid = b.sampleLive(1050, 0, 0)!;
  near(mid.zone.cx, 1530);
  near(mid.zone.cy, 1470);
  near(mid.zone.r, 990);
});

test("a late snapshot keeps the zone drifting along the same line, and stops after one more interval", () => {
  const b = new SnapBuffer();
  b.push(SZ(1000, 10, { cx: 1500, cy: 1500, r: 1000 }, P("a", 0, 0)));
  b.push(SZ(1100, 12, { cx: 1560, cy: 1500, r: 980 }, P("a", 10, 0)));
  const late = b.sampleLive(1150, 0, 0)!;
  near(late.zone.cx, 1590);
  near(late.zone.r, 970);
  const far = b.sampleLive(5000, 0, 0)!;
  near(far.zone.cx, 1620, 1e-6);
  assert.ok(far.zone.r >= 960 - 1e-6 && far.zone.r <= 960 + 1e-6, "no further than one more interval");
});

test("the final circle is carried to the scene", () => {
  const b = new SnapBuffer();
  const target = { cx: 2100, cy: 900, r: 150 };
  b.push(SZ(1000, 10, { cx: 1500, cy: 1500, r: 1450 }, P("a", 0, 0)));
  b.push(SZ(1100, 12, { cx: 1500, cy: 1500, r: 1450, target }, P("a", 10, 0)));
  assert.deepEqual(b.sampleLive(1090, 0, 0)!.zone.target, target);
  assert.equal(new SnapBuffer().sampleLive(0, 0), null);
});

test("the live sampler reuses its objects, so a frame allocates nothing once warm", () => {
  const b = new SnapBuffer();
  const body: Pt[] = Array.from({ length: 30 }, (_, i) => [90 - i * 10, 0]);
  b.push(S(1000, 10, P("a", 100, 0, body)));
  b.push(S(1050, 11, P("a", 106, 0, body)));
  const first = b.sampleLive(1090, 100)!; // between the two snapshots
  const arr = first.players;
  const obj = first.players[0];
  const bodyArr = obj.body;
  const tuple0 = obj.body[0];
  const second = b.sampleLive(1100, 100)!;
  assert.equal(second.players, arr);
  assert.equal(second.players[0], obj);
  assert.equal(second.players[0].body, bodyArr);
  assert.equal(second.players[0].body[0], tuple0);
  const pathLen = (o: PlayerSnap) => pathLength([o.head, ...o.body]);
  near(pathLen(second.players[0]), pathLength([[100, 0], ...body]), 6.0 + 1e-6); // the snake keeps its length
});

test("the in place sampler gives the same picture as the allocating helpers", () => {
  const prev = S(0, 1, P("a", 100, 0.3, [[90, 3], [80, 6], [70, 9], [60, 12]]));
  const cur = S(50, 2, P("a", 106, 0.3, [[96, 3], [86, 6], [76, 9], [66, 12]]));
  const b = new SnapBuffer();
  b.push(prev);
  b.push(cur);
  const live = b.sampleLive(50 + 60 + 60, 80)!.players[0];
  // Late by 60 ms: held on cur and moved ahead by lead (40 ms) plus the 60 ms.
  const ref = extrapolatePlayer(cur.players[0], prev, cur, 0.04 + 0.06);
  assert.ok(Math.hypot(live.head[0] - ref.head[0], live.head[1] - ref.head[1]) < 1e-6);
  assert.equal(live.body.length, ref.body.length);
  for (let i = 0; i < ref.body.length; i++) assert.ok(Math.hypot(live.body[i][0] - ref.body[i][0], live.body[i][1] - ref.body[i][1]) < 1e-6);
});

test("extendBodyInto gives the same body as extendBody and reuses the buffer", () => {
  const body: Pt[] = [[90, 0], [80, 5], [70, 5], [60, 0]];
  const want = extendBody([100, 0], body, [112, 3]);
  const out: Pt[] = [];
  const n = extendBodyInto(out, 100, 0, body, 112, 3);
  assert.equal(n, want.length);
  assert.equal(out.length, want.length);
  for (let i = 0; i < want.length; i++) { near(out[i][0], want[i][0]); near(out[i][1], want[i][1]); }
  const tuple = out[0];
  extendBodyInto(out, 100, 0, body, 114, 3);
  assert.equal(out[0], tuple, "the tuples are reused");
});
