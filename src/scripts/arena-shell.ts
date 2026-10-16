// The arena panel of the play page, shared by the two ways to play:
//  - free practice: no wallet, no money, an anonymous socket to the game server (started from the card at the top),
//  - an on-chain room: the socket of the connected wallet (driven by play-live.ts).
// It owns the canvas arena (src/lib/play/orb-rush.ts), the loading state (never a blank canvas), the waiting room view
// and the practice result. Only one match is shown at a time: starting a new one replaces the previous.
import { measureRegions, pickRegion, pickedRegion } from "../lib/play/region.ts";
import { youWord, CEO_WALLET } from "../lib/play/staff.ts";
const walletNow = (): string | null => (manager.current.status === "connected" ? manager.current.address : null);
import { SKINS, recordGame, selectedSkin } from "../lib/play/skins.ts";
import { bestStreak, record as recordMission } from "../lib/play/missions.ts";
import { registerArena } from "../lib/play/arena-adapter.ts";
import { manager } from "../lib/play/wallet-session.ts";
import { fill, node } from "../lib/play/dom.ts";
import { ArenaSound } from "../lib/play/arena-sound.ts";
import { QualityManager, type QualityMode } from "../lib/play/arena-quality.ts";
import { COLOR_KEY, parseColorChoice } from "../lib/play/goshi-face.ts";
import { buildSummary, dailyAndShare } from "./result-card.ts";
import type { PlayCopy } from "../content/types.ts";
import type { ArenaLink, OrbRushArena } from "../lib/play/orb-rush.ts";
import type { FrenzyEnd, FrenzySnap, ServerMsg } from "../lib/play/protocol.ts";
import type { FrenzyView } from "../lib/play/frenzy-view.ts";
import type { ServerClient } from "../lib/play/server-client.ts";

type Start = Extract<ServerMsg, { t: "start" }>;
type Snap = Extract<ServerMsg, { t: "snap" }>;
type End = Extract<ServerMsg, { t: "end" }>;

export type Source = "practice" | "room";

const NAME_KEY = "goshi-practice-name";
/** A room that waits this long with 2 to 9 paid players gets a VS offer (server/PROTOCOL.md). */
export const VS_AFTER_MS = 5 * 60 * 1000;
// A server that was asleep (on demand) takes a few seconds to wake up: the wait is long enough for that.
const CONNECT_TIMEOUT_MS = 30_000;

interface ShellData {
  settings: { serverUrl: string; regions?: { id: string; url: string }[]; regionSlot?: number };
  cluster: string;
  t: { live: PlayCopy["live"]; practice: PlayCopy["practice"] };
}

/** Everything the waiting room view needs. The page fills it from the `lobby` message and its own state. */
export interface LobbyView {
  roomId: string;
  paid: string[];
  free: string[];
  waitedMs: number;
  mode: "royale" | "vs" | "duel";
  you: string | null;
  /** Show "Fill with test bots" (a test network, and the server allows it). */
  canFill: boolean;
  network: string;
  onFill(): void;
  /** Short text for a wallet. */
  short(w: string): string;
}

export interface ArenaShell {
  readonly source: Source | null;
  /** Wires the free practice card (button, name, auto start). Safe to call once per page. */
  bindCard(): void;
  startPractice(): void;
  stopPractice(): void;
  // On-chain room, called by play-live.ts with the wallet's socket.
  roomEntering(roomId: string, link: ServerClient): void;
  roomLobby(view: LobbyView | null): void;
  roomStart(m: Start, link: ServerClient): void;
  roomSnap(m: Snap): void;
  roomFrenzySnap(m: FrenzySnap): void;
  roomFrenzyEnd(m: FrenzyEnd): void;
  roomEnd(m: End, render: () => void): void;
  /** Hides the match and the result. */
  clear(): void;
  /** Your numbers of the match that is on screen (or just ended). */
  stats(): { mass: number; peak: number; kills: number; you: string } | null;
}

let shell: ArenaShell | null = null;

export function getShell(): ArenaShell | null {
  if (shell) return shell;
  const dataEl = document.getElementById("play-data");
  if (!dataEl || !document.getElementById("realtime-arena")) return null;
  shell = createShell(JSON.parse(dataEl.textContent ?? "{}") as ShellData);
  return shell;
}

function createShell(d: ShellData): ArenaShell {
  const live = d.t.live;
  const pc = d.t.practice;
  const as = live.arenaState;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
  const setText = (el: HTMLElement | null, text: string) => { if (el) el.textContent = text; };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const card = $("realtime-arena");
  const lobbyEl = $("play-lobby");
  const gameHost = $("realtime-arena-host");
  const announceEl = $("play-announce");
  const resultEl = $("play-result");
  const resultBody = $("play-result-body");
  const loadEl = q<HTMLElement>("[data-loading]")!;
  const loadTitle = q<HTMLElement>("[data-loading-title]")!;
  const loadCount = q<HTMLElement>("[data-loading-count]")!;
  const lobbyView = $("play-lobby-view");

  let source: Source | null = null;
  let arena: OrbRushArena | null = null;
  let arenaLoading: Promise<OrbRushArena> | null = null;
  let frenzy: FrenzyView | null = null;
  let frenzyQueue: ((v: FrenzyView) => void)[] = [];
  let link: ArenaLink | null = null;
  let queued: (() => void)[] = [];
  let startsAt = 0;
  let loadTimer: ReturnType<typeof setInterval> | null = null;
  let gotSnap = false;
  let roomView: LobbyView | null = null;
  let lobbyTimer: ReturnType<typeof setInterval> | null = null;
  let lobbyShownAt = 0;
  // practice
  let pClient: ServerClient | null = null;
  let pRoom = "";
  let pEnded = false;
  let pStarted = false;
  let pTimeout: ReturnType<typeof setTimeout> | null = null;
  let cardBound = false;

  // Sound is off until the person turns it on (that click is also what lets the browser play audio).
  let store: Storage | null = null;
  try { store = window.localStorage; } catch { /* blocked */ }
  const sound = new ArenaSound({ storage: store, enhanced: document.getElementById("realtime-arena")?.dataset.experimental === "1" });
  const soundBtn = q<HTMLButtonElement>("[data-sound-toggle]");
  const paintSound = () => {
    if (!soundBtn) return;
    soundBtn.setAttribute("aria-pressed", String(sound.enabled));
    soundBtn.textContent = sound.enabled ? live.game.soundOn : live.game.soundOff;
  };
  const musicBtn = q<HTMLButtonElement>("[data-music-toggle]");
  const memeBtn = q<HTMLButtonElement>("[data-meme-toggle]");
  const paintAudio = () => {
    paintSound();
    if (musicBtn) { musicBtn.setAttribute("aria-pressed", String(sound.music)); musicBtn.textContent = sound.music ? live.game.musicOn : live.game.musicOff; }
    if (memeBtn) { memeBtn.setAttribute("aria-pressed", String(sound.memes)); memeBtn.textContent = sound.memes ? live.game.memeOn : live.game.memeOff; }
  };
  soundBtn?.addEventListener("click", () => { sound.toggle(); paintAudio(); });
  musicBtn?.addEventListener("click", () => { sound.toggleMusic(); paintAudio(); });
  memeBtn?.addEventListener("click", () => { sound.toggleMemes(); paintAudio(); });
  // The Play click is what lets the browser play audio: sound starts by itself there unless the person already chose.
  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("#play-now-btn, [data-lv-practice], [data-dead-again], #play-again")) { sound.autoEnable(); paintAudio(); }
  }, true);
  paintAudio();
  // The goshi color of the local player: 8 free colors, remembered here, never sent to the server.
  const readColor = (): number | null => {
    try { return parseColorChoice(localStorage.getItem(COLOR_KEY)); } catch { return null; }
  };
  let colorIndex = readColor();
  const swatches = document.querySelectorAll<HTMLInputElement>("[data-goshi-color]");
  swatches.forEach((el) => {
    el.checked = colorIndex !== null && Number(el.value) === colorIndex;
    el.addEventListener("change", () => {
      colorIndex = Number(el.value);
      try { localStorage.setItem(COLOR_KEY, String(colorIndex)); } catch { /* private mode */ }
      arena?.setOwnColor(colorIndex);
    });
  });
  window.addEventListener("goshi-skin-change", () => arena?.setOwnSkin(selectedSkin()));
  // Overlays that must cover the whole screen live directly under <body>: inside a card with a blur filter a fixed element is
  // positioned against the card on iPhone, and the rotate message or the tutorial would show as a box inside the page.
  document.querySelectorAll<HTMLElement>("[data-rotate], [data-tuto]").forEach((el) => document.body.append(el));
  // Full screen: the canvas with its overlays takes the whole screen. The Fullscreen API where the browser has it (desktop, Android),
  // and a fixed, full viewport layout where it does not (iPhone Safari). Escape or the button leave it.
  {
    const area = q<HTMLElement>(".game-canvas");
    const toggles = Array.from(document.querySelectorAll<HTMLElement>("[data-fs-toggle]"));
    if (area && toggles.length > 0) {
      const on = () => document.fullscreenElement === area || area.classList.contains("is-pseudo-fs");
      const paint = () => {
        const v = on();
        area.classList.toggle("is-fs", v);
        for (const b of toggles) {
          b.setAttribute("aria-pressed", String(v));
          if (b.classList.contains("btn")) b.textContent = (v ? b.dataset.labelOff : b.dataset.labelOn) ?? "";
          else b.setAttribute("aria-label", (v ? b.dataset.labelOff : b.dataset.labelOn) ?? "");
        }
        window.dispatchEvent(new Event("resize"));
      };
      const leave = async () => {
        area.classList.remove("is-pseudo-fs");
        document.documentElement.classList.remove("has-pseudo-fs");
        if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* already out */ } }
        try { (screen.orientation as unknown as { unlock?: () => void })?.unlock?.(); } catch { /* optional */ }
        paint();
        reveal();
      };
      // Leaving full screen (also with Escape) must leave the small board in view, still showing the match: the page comes back
      // at the scroll position it had before, which can be far from the board.
      const reveal = () => {
        if (gameHost.hidden) return;
        const go = () => gameHost.scrollIntoView({ behavior: "auto", block: "center" });
        go();
        setTimeout(go, 120);
      };
      const enter = async () => {
        let ok = false;
        if (typeof area.requestFullscreen === "function") {
          try { await area.requestFullscreen({ navigationUI: "hide" }); ok = true; } catch { ok = false; }
        }
        if (!ok) {
          area.classList.add("is-pseudo-fs");
          document.documentElement.classList.add("has-pseudo-fs");
        }
        // On a phone the game is played sideways: ask for it where the browser allows (it refuses outside full screen).
        try { await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.("landscape"); } catch { /* optional */ }
        paint();
        q<HTMLElement>("#play-canvas")?.focus({ preventScroll: true });
      };
      const toggle = () => void (on() ? leave() : enter());
      // A match ended: the result is outside the board, so full screen is left (also from the practice end).
      // The result is shown over the board, in full screen, with a soft fade: the screen is never taken away from the person.
      // It goes back to its place in the page when it is closed, and full screen is left then if the board is gone.
      let resultHome: { parent: Node; next: Node | null } | null = null;
      const undock = () => {
        if (!resultHome) return;
        resultHome.parent.insertBefore(resultEl, resultHome.next);
        resultHome = null;
        area.classList.remove("has-result");
        if (!on()) return;
        if (gameHost.hidden) void leave();
      };
      new MutationObserver(() => { if (resultEl.hidden) undock(); }).observe(resultEl, { attributes: true, attributeFilter: ["hidden"] });
      window.addEventListener("goshi-leave-fs", () => {
        if (!on()) return;
        if (!resultHome && resultEl.parentNode) {
          resultHome = { parent: resultEl.parentNode, next: resultEl.nextSibling };
          area.append(resultEl);
          area.classList.add("has-result");
        }
      });
      for (const b of toggles) b.addEventListener("click", toggle);
      // Leave a practice match at any time, also in full screen: one button on the board itself.
      // AFK, for the team wallet only and with no button for anybody: the key "ñ" gives the body to the elite bot and takes it back.
      let afkOn = false;
      document.addEventListener("keydown", (e) => {
        if ((e.key !== "ñ" && e.key !== "Ñ") || e.ctrlKey || e.metaKey || e.altKey) return;
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (!ceoSession || !showMode) return;
        afkOn = !afkOn;
        (pClient as unknown as { afk?: (on: boolean) => boolean } | null)?.afk?.(afkOn);
      });
      const leaveBtn = q<HTMLButtonElement>("[data-practice-leave]");
      if (leaveBtn) {
        leaveBtn.textContent = $("play-now-leave").textContent ?? "";
        leaveBtn.addEventListener("click", () => { stopPractice(); void leave(); });
      }

      // On a phone the game is played sideways, like the other .io games: in portrait a match asks to rotate, in landscape the board
      // takes the whole screen by itself (no gesture is needed for this layout).
      const coarse = window.matchMedia("(pointer: coarse)");
      const gate = q<HTMLElement>("[data-rotate]");
      let stayPortrait = false;
      let autoFs = false;
      q<HTMLElement>("[data-rotate-stay]")?.addEventListener("click", () => { stayPortrait = true; syncMobile(); });
      // Inside a wallet's own browser (Phantom, Solflare) the app is usually locked to portrait: asking to rotate there would trap
      // the player, so the board takes the screen in portrait instead.
      const inWalletBrowser = (): boolean => {
        const w = window as unknown as { phantom?: { solana?: { isPhantom?: boolean } }; solflare?: { isSolflare?: boolean } };
        return !!(w.phantom?.solana?.isPhantom || w.solflare?.isSolflare) && /iPhone|iPad|Android/i.test(navigator.userAgent);
      };
      function syncMobile() {
        const playing = !gameHost.hidden && resultEl.hidden;
        const portrait = window.innerHeight > window.innerWidth;
        const small = Math.min(window.innerWidth, window.innerHeight) < 820;
        const phone = coarse.matches && small;
        const wantsGate = phone && playing && portrait && !stayPortrait && !inWalletBrowser() && !document.fullscreenElement;
        if (gate) gate.hidden = !wantsGate;
        // The board fills the screen on a phone during a match, sideways or (when allowed or forced) upright.
        const wantsFs = phone && playing && !wantsGate && !document.fullscreenElement;
        const isFs = area!.classList.contains("is-pseudo-fs");
        if (wantsFs && !isFs) {
          autoFs = true;
          area!.classList.add("is-pseudo-fs");
          document.documentElement.classList.add("has-pseudo-fs");
          paint();
        } else if (autoFs && isFs && !wantsFs && !document.fullscreenElement) {
          autoFs = false;
          area!.classList.remove("is-pseudo-fs");
          document.documentElement.classList.remove("has-pseudo-fs");
          paint();
        }
        if (!playing) stayPortrait = false;
      }
      setInterval(syncMobile, 500);

      // A match must not be lost by a stray key or a stray swipe. While one is on screen:
      //  - Space, Enter and the page keys never activate the focused button (the full screen toggle, a link) nor scroll the page;
      //  - the page does not scroll or bounce under the board;
      //  - if the board is out of view for any reason, one tap brings the player back to it.
      const matchOn = (): boolean => !gameHost.hidden && Boolean(resultEl.hidden);
      const typingIn = (t: EventTarget | null) => {
        const el = t as HTMLElement | null;
        return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      };
      const guarded = new Set([" ", "Spacebar", "Enter", "PageDown", "PageUp", "Home", "End"]);
      const guard = (e: KeyboardEvent) => {
        if (!matchOn() || typingIn(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
        if (!guarded.has(e.key)) return;
        // Only the focused control would react: the game itself listens on window and still sees the key.
        e.preventDefault();
      };
      document.addEventListener("keydown", guard, true);
      document.addEventListener("keyup", guard, true);
      // A click made by the keyboard (detail 0) on the full screen button during a match is a stray key: ignore it.
      for (const b of toggles) b.addEventListener("click", (e) => { if (e.detail === 0 && matchOn() && e.isTrusted) { e.stopImmediatePropagation(); b.blur(); } }, true);

      const back = document.createElement("button");
      back.type = "button";
      back.className = "btn btn-gold match-return";
      back.textContent = as.returnToMatch;
      back.hidden = true;
      back.addEventListener("click", () => { gameHost.scrollIntoView({ behavior: "smooth", block: "center" }); });
      document.body.append(back);
      // Closing the tab or swiping back does not end a match (the body stays in the arena and the same link brings the player back),
      // but a stray gesture should not do it silently: ask first, and keep the swipe-back inside the page.
      window.addEventListener("beforeunload", (e) => {
        if (matchOn() && source === "room") { e.preventDefault(); e.returnValue = as.matchLocked; }
      });
      let trapped = false;
      window.addEventListener("popstate", () => { if (matchOn() && source === "room") history.pushState({ goshiMatch: 1 }, ""); });
      let wasOn = false;
      setInterval(() => {
        const on_ = matchOn();
        if (leaveBtn) leaveBtn.hidden = !(on_ && source === "practice" && !pEnded);
        if (afkOn && (!on_ || arena?.isDead)) afkOn = false;
        document.documentElement.classList.toggle("match-lock", on_);
        area.classList.toggle("is-frenzy", !!frenzy);
        if (on_ && !wasOn) { const a = document.activeElement as HTMLElement | null; if (a && a !== document.body && a.tagName !== "INPUT") a.blur(); }
        wasOn = on_;
        if (on_ && source === "room" && !trapped) { history.pushState({ goshiMatch: 1 }, ""); trapped = true; }
        if (!on_) trapped = false;
        if (!on_ || area.classList.contains("is-fs")) { back.hidden = true; return; }
        const r = gameHost.getBoundingClientRect();
        back.hidden = r.bottom > 80 && r.top < window.innerHeight - 80;
      }, 400);
      window.addEventListener("orientationchange", syncMobile);
      window.addEventListener("resize", syncMobile);
      document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) { area.classList.remove("is-pseudo-fs"); paint(); reveal(); } else paint(); });
      document.addEventListener("keydown", (e) => {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (e.key === "Escape" && area.classList.contains("is-pseudo-fs")) void leave();
        else if ((e.key === "f" || e.key === "F") && !gameHost.hidden && !e.ctrlKey && !e.metaKey && !e.altKey) toggle();
      });
    }
  }
  // Render quality: automatic by default, with a manual choice that is remembered.
  const quality = new QualityManager(store);
  const qualitySel = q<HTMLSelectElement>("[data-quality]");
  if (qualitySel) {
    qualitySel.value = quality.mode;
    qualitySel.addEventListener("change", () => quality.setMode(qualitySel.value as QualityMode));
  }

  const announce = (text: string) => { setText(announceEl, ""); setTimeout(() => setText(announceEl, text), 30); };

  // The arena talks to whatever socket is current through this object, so one arena serves both ways to play.
  const delegate: ArenaLink = {
    sendInput: (dx, dy, boost) => link?.sendInput(dx, dy, boost) ?? false,
    ping: () => link?.ping() ?? false,
    get rttMs() { return link?.rttMs ?? 0; },
    get rttKnown() { return link?.rttKnown ?? false; },
    get bytesIn() { return (link as { bytesIn?: number } | null)?.bytesIn ?? 0; },
    get rttLastMs() { return (link as { rttLastMs?: number } | null)?.rttLastMs ?? 0; },
  };

  // ------------------------------------------------------------------ the arena

  function ensureArena(): Promise<OrbRushArena> {
    arenaLoading ??= (async () => {
      const { OrbRushArena } = await import("../lib/play/orb-rush.ts");
      const g = live.game;
      const a = new OrbRushArena({
        client: delegate,
        strings: {
          you: g.you, startAnnounce: g.startAnnounce, endAnnounce: g.endAnnounce,
          zoneLines: { calm: g.zoneCalm, warn: g.zoneWarn, shrink: g.zoneShrink, hold: g.zoneHold, final: g.finalZone },
          finalZone: g.finalZone, nextZone: g.nextZone, zoneOutBanner: g.zoneOutBanner, showerIn: g.showerIn, showerLanded: g.showerLanded,
          countdown: g.countdown, deadTitle: g.deadTitle, deadText: g.deadText,
          death: {
            youBody: g.deathYouBody, youHead: g.deathYouHead, youZone: g.deathYouZone, youWall: g.deathYouWall, onYourBody: g.deathOnYourBody,
            feedBody: g.deathFeedBody, feedHead: g.deathFeedHead, feedZone: g.deathFeedZone, feedWall: g.deathFeedWall,
          },
          nitro: g.nitro, mass: g.mass, reportCopied: g.reportCopied, reportManual: g.reportManual,
          pingValue: g.pingValue, rankValue: g.rankValue, playersValue: g.playersValue, pingWait: g.pingWait, outValue: g.outValue,
          zone: g.zone, protectedHint: g.protectedHint, backToZone: g.backToZone,
        },
        announce,
        format: (n) => String(Math.round(n)),
        sound,
        ownColor: () => colorIndex,
        ownSkin: () => selectedSkin(),
        quality,
        diagLine: g.diagLine,
      });
      gameHost.hidden = false;
      await a.mount(gameHost, {
        room: { roomId: 0n, entryFee: 0n, state: "active", mode: "royale", paid: [], free: [], passes: 0, guests: [] },
        me: null, players: [], reducedMotion: reduced, lang: document.documentElement.lang === "es" ? "es" : "en",
      });
      registerArena(a);
      arena = a;
      const todo = queued;
      queued = [];
      for (const fn of todo) fn();
      return a;
    })();
    return arenaLoading;
  }

  /** Runs `fn` on the arena as soon as it is mounted (snapshots can arrive while the module loads). */
  function withArena(fn: (a: OrbRushArena) => void) {
    if (arena) fn(arena);
    else { queued.push(() => arena && fn(arena)); void ensureArena(); }
  }

  /** The minute of frenzy has its own canvas on top of the arena's: it is built when `start` carries a `frenzy`. */
  async function startFrenzy(m: Start) {
    if (!m.frenzy) return;
    frenzy?.dispose();
    frenzy = null;
    const info = m.frenzy;
    const { FrenzyView } = await import("../lib/play/frenzy-view.ts");
    const f = new FrenzyView({
      sendInput: (dx, dy, boost) => delegate.sendInput(dx, dy, boost),
      reduced,
      strings: {
        title: live.frenzy.title, mass: live.frenzy.mass, rank: live.frenzy.rank, top: live.frenzy.top, nitro: live.frenzy.nitro,
        stun: live.frenzy.stun, gap: live.frenzy.gap, carried: live.frenzy.carried, you: live.game.you, hint: "", hit: "",
        startsIn: live.frenzy.startsIn, cap: live.frenzy.cap,
      },
    });
    const board = q<HTMLElement>("#realtime-arena-host .game-canvas");
    if (!board) return;
    f.mount(board);
    f.start(info, m.you);
    frenzy = f;
    const todo = frenzyQueue;
    frenzyQueue = [];
    for (const fn of todo) fn(f);
    setLoading(null);
  }

  function withFrenzy(fn: (v: FrenzyView) => void) {
    if (frenzy) fn(frenzy);
    else frenzyQueue.push(fn);
  }

  function endFrenzy() {
    frenzy?.dispose();
    frenzy = null;
    frenzyQueue = [];
  }

  function disposeArena() {
    sound.stopMusic();
    endFrenzy();
    arena?.dispose();
    arena = null;
    arenaLoading = null;
    queued = [];
  }

  // ------------------------------------------------------------------ loading state (never a blank canvas)

  function setLoading(title: string | null, until?: number) {
    if (loadTimer) clearInterval(loadTimer);
    loadTimer = null;
    loadEl.hidden = title === null;
    if (title === null) return;
    setText(loadTitle, title);
    setText(loadCount, "");
    if (until && until > 0) {
      startsAt = until;
      const tick = () => {
        // The server clock may differ from this one: only a short, sensible countdown is shown.
        const s = Math.ceil((startsAt - Date.now()) / 1000);
        const ok = s > 0 && s <= 10;
        setText(loadTitle, ok ? fill(as.startsIn, { s }) : as.starting);
        setText(loadCount, ok ? String(s) : "");
      };
      tick();
      loadTimer = setInterval(tick, 250);
    }
  }

  function showMatchArea(title: string) {
    lobbyView.hidden = true;
    resultEl.hidden = true;
    gameHost.hidden = false;
    card.classList.add("is-playing");
    gotSnap = false;
    setLoading(title);
    gameHost.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  function onStart(src: Source, m: Start) {
    source = src;
    pStarted = src === "practice" ? true : pStarted;
    lobbyView.hidden = true;
    resultEl.hidden = true;
    gameHost.hidden = false;
    card.classList.add("is-playing");
    gotSnap = false;
    setLoading(as.starting, m.startsAt);
    setText(lobbyEl, src === "practice" ? pc.h2 : fill(live.lobby.started, { id: m.roomId }));
    withArena((a) => a.handleStart(m));
    if (m.frenzy) void startFrenzy(m);
    // The match must be on screen the moment it starts: nobody should play it from outside the viewport.
    gameHost.scrollIntoView({ behavior: "auto", block: "start" });
    const again = q<HTMLButtonElement>("[data-dead-again]");
    if (again) again.hidden = src !== "practice";
    $("play-canvas").focus({ preventScroll: true });
  }

  function onSnap(m: Snap) {
    if (!gotSnap) {
      gotSnap = true;
      endFrenzy();
      setLoading(null);
      const r = gameHost.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight + 40) gameHost.scrollIntoView({ behavior: "auto", block: "start" });
    }
    withArena((a) => a.handleSnap(m));
  }

  // ------------------------------------------------------------------ practice

  const DIFF_KEY = "goshi-difficulty";
  function currentDifficulty(): "easy" | "medium" | "hard" | "insane" {
    const sel = document.getElementById("play-now-diff") as HTMLSelectElement | null;
    if (!sel) return "hard";
    const v = sel.value;
    return v === "easy" || v === "medium" || v === "insane" ? v : "hard";
  }
  (() => {
    const sel = document.getElementById("play-now-diff") as HTMLSelectElement | null;
    if (!sel) return;
    try { const saved = localStorage.getItem(DIFF_KEY); if (saved) sel.value = saved; } catch { /* optional */ }
    sel.addEventListener("change", () => { try { localStorage.setItem(DIFF_KEY, sel.value); } catch { /* optional */ } });
  })();
  function cardEls() {
    return {
      btn: $<HTMLButtonElement>("play-now-btn"),
      name: $<HTMLInputElement>("play-now-name"),
      msg: $("play-now-msg"),
      leave: $<HTMLButtonElement>("play-now-leave"),
    };
  }

  function rememberName(name: string) {
    try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode */ }
  }
  /** The remembered name. First visit: a short generated one is saved, so the field is never empty and never asked again. */
  function savedName(): string {
    try {
      const stored = localStorage.getItem(NAME_KEY);
      if (stored) return stored;
      const made = `Player${Math.floor(1000 + Math.random() * 9000)}`;
      localStorage.setItem(NAME_KEY, made);
      return made;
    } catch {
      return "";
    }
  }

  function practiceFail(text: string) {
    const { btn, msg, leave } = cardEls();
    btn.disabled = false;
    leave.hidden = true;
    setText(msg, text);
    setLoading(null);
    announce(text);
    console.info("[goshi] practice failed:", text);
    teardownPractice(false);
    // Nothing is running: show the message where the match would be, so it is not missed.
    if (!gotSnap) {
      gameHost.hidden = true;
      setText(lobbyEl, text);
    }
  }

  function teardownPractice(sendLeave: boolean) {
    if (pTimeout) clearTimeout(pTimeout);
    pTimeout = null;
    const c = pClient;
    pClient = null;
    if (c) {
      if (sendLeave && pRoom) c.leave(pRoom);
      c.close();
    }
  }

  // The three step guide: shown once, before the first practice. "How to play" opens it again.
  const TUTO_KEY = "goshi-tutorial-seen";
  const tutoSeen = (): boolean => { try { return localStorage.getItem(TUTO_KEY) === "1"; } catch { return false; } };
  function showTutorial(): Promise<boolean> {
    const root = document.querySelector<HTMLElement>("[data-tuto]");
    if (!root) return Promise.resolve(true);
    const slides = Array.from(root.querySelectorAll<HTMLElement>("[data-tuto-slide]"));
    const stepEl = root.querySelector<HTMLElement>("[data-tuto-step]")!;
    const back = root.querySelector<HTMLButtonElement>("[data-tuto-back]")!;
    const next = root.querySelector<HTMLButtonElement>("[data-tuto-next]")!;
    const skip = root.querySelector<HTMLButtonElement>("[data-tuto-skip]")!;
    const labelNext = next.textContent ?? "";
    const labelStart = (root.dataset.start ?? labelNext);
    let i = 0;
    const paint = () => {
      slides.forEach((el, k) => { el.hidden = k !== i; });
      stepEl.textContent = (root.dataset.step ?? "{n}/{total}").replace("{n}", String(i + 1)).replace("{total}", String(slides.length));
      back.hidden = i === 0;
      next.textContent = i === slides.length - 1 ? labelStart : labelNext;
    };
    return new Promise((resolve) => {
      const done = (play: boolean) => {
        try { localStorage.setItem(TUTO_KEY, "1"); } catch { /* optional */ }
        root.hidden = true;
        back.onclick = next.onclick = skip.onclick = null;
        document.removeEventListener("keydown", onKey);
        resolve(play);
      };
      const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") done(false); };
      document.addEventListener("keydown", onKey);
      back.onclick = () => { i = Math.max(0, i - 1); paint(); };
      next.onclick = () => { if (i < slides.length - 1) { i++; paint(); } else done(true); };
      skip.onclick = () => done(true);
      i = 0;
      paint();
      root.hidden = false;
      next.focus();
    });
  }

  const connectedAddress = (): string | null => {
    const w = manager.current;
    return w.status === "connected" ? w.address : null;
  };

  // The server picker: the page already talks to the chosen region (play.ts); changing it reloads the page on the new one.
  const regions = d.settings.regions ?? [];
  if (regions.length > 1) {
    const sel = document.getElementById("play-now-server") as HTMLSelectElement | null;
    if (sel) sel.value = pickedRegion();
    sel?.addEventListener("change", () => { pickRegion(sel.value); location.reload(); });
    void measureRegions(regions).then((ms) => {
      if (!sel) return;
      for (const o of Array.from(sel.options)) {
        if (o.value === "auto") continue;
        const v = ms.get(o.value);
        const here = regions[d.settings.regionSlot ?? 0]?.id === o.value ? " ✓" : "";
        o.textContent = `${o.dataset.name ?? o.value}${v !== undefined ? ` · ${v} ms` : ""}${here}`;
      }
    });
  }
  const practiceServer = (): string => d.settings.serverUrl;
  let practiceUrl = d.settings.serverUrl;

  // The live arena: always running with 20 places, bots with fixed addresses and room for people (with a queue).
  let showMode = false;
  /** This connection signed in with the team wallet: the only one allowed to use AFK. */
  let ceoSession = false;
  let livePanel: HTMLElement | null = null;
  /** Set by the entry button of the page: take a place as soon as the arena is on screen. */
  let autoJoinLive = false;
  /** A normal practice match was asked for: the live arena panel goes away and the next match is a private one. */
  function leaveLiveMode() {
    if (!showMode) return;
    showMode = false;
    livePanel?.remove();
    livePanel = null;
    document.querySelectorAll(".tv-badge, .tv-line").forEach((n) => n.remove());
  }
  /** Opens the live arena (a place is taken at once when autoJoin is true). Called from a click: it is what lets the sound play. */
  function enterLiveArena(autoJoin: boolean) {
    if (showMode && livePanel) { if (autoJoin) liveJoin(); return; }
    autoJoinLive = autoJoin;
    autoJoinLive = autoJoin;
    showMode = true;
    sound.autoEnable();
    sound.setIntensity(1);
    void startPractice();
    livePanel = document.createElement("div");
    livePanel.className = "live-panel";
    const lt = document.createElement("span"); lt.setAttribute("data-live-text", ""); lt.textContent = pc.connecting;
    const lj = document.createElement("button"); lj.type = "button"; lj.className = "btn btn-gold btn-sm"; lj.setAttribute("data-live-join", ""); lj.textContent = pc.liveJoin;
    const ll = document.createElement("button"); ll.type = "button"; ll.className = "btn btn-glass btn-sm"; ll.setAttribute("data-live-leave", ""); ll.textContent = pc.liveLeave; ll.hidden = true;
    lj.addEventListener("click", () => liveJoin());
    ll.addEventListener("click", () => { (pClient as unknown as { liveLeave?: () => boolean } | null)?.liveLeave?.(); });
    livePanel.append(lt, lj, ll);
    document.body.append(livePanel);
    const badge = document.createElement("div");
    badge.className = "tv-badge"; badge.textContent = pc.showBadge;
    const line = document.createElement("div");
    line.className = "tv-line";
    const lines = pc.showLines;
    let li = 0;
    line.textContent = lines[0] ?? "";
    setInterval(() => { li = (li + 1) % lines.length; line.textContent = lines[li]; }, 9000);
    document.body.append(badge, line);
    setTimeout(() => document.querySelector<HTMLElement>("[data-fs-toggle]")?.click(), 1500);
  }

  function liveJoin() {
    const c = pClient as unknown as { liveJoin?: (n?: string, w?: string, s?: string) => boolean } | null;
    const nameEl = document.getElementById("play-now-name") as HTMLInputElement | null;
    const clean = (nameEl?.value ?? "").trim().replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 14).trim();
    c?.liveJoin?.(clean || undefined, connectedAddress() ?? undefined, selectedSkin() ?? undefined);
  }
  function onLive(m: { state: "watching" | "queued" | "playing" | "dead"; places: number; humans: number; waiting: number; watching: number; you?: string; pos?: number }) {
    if (m.state === "playing" && m.you) arena?.setYou(m.you);
    if (autoJoinLive && m.state === "watching") { autoJoinLive = false; liveJoin(); }
    if (!livePanel) return;
    const text = livePanel.querySelector<HTMLElement>("[data-live-text]")!;
    const join = livePanel.querySelector<HTMLButtonElement>("[data-live-join]")!;
    const leave = livePanel.querySelector<HTMLButtonElement>("[data-live-leave]")!;
    const counts = fill(pc.liveCounts, { humans: m.humans, places: m.places, waiting: m.waiting, watching: m.watching });
    if (m.state === "playing") { text.textContent = `${pc.livePlaying} · ${counts}`; join.hidden = true; leave.hidden = false; }
    else if (m.state === "queued") { text.textContent = `${fill(pc.liveQueued, { n: m.pos ?? 1 })} · ${counts}`; join.hidden = true; leave.hidden = false; }
    else if (m.state === "dead") { text.textContent = `${pc.liveDead} · ${counts}`; join.hidden = false; leave.hidden = true; }
    else { text.textContent = counts; join.hidden = false; leave.hidden = true; }
  }
  async function startPractice() {
    if (!showMode && !tutoSeen() && !(await showTutorial())) return;
    const { btn, name, msg, leave } = cardEls();
    const clean = name.value.trim().replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 14).trim();
    rememberName(clean);
    // Replace whatever was on screen: another practice, or the last result.
    teardownPractice(true);
    disposeArena();
    source = "practice";
    pEnded = false;
    pStarted = false;
    pRoom = "";
    btn.disabled = true;
    leave.hidden = false;
    setText(msg, pc.connecting);
    showMatchArea(pc.connecting);
    setText(lobbyEl, pc.connecting);
    announce(pc.connecting);
    void ensureArena();
    let ServerClientCtor: typeof ServerClient;
    try {
      ({ ServerClient: ServerClientCtor } = await import("../lib/play/server-client.ts"));
    } catch {
      practiceFail(pc.unreachable);
      return;
    }
    // The team's own wallet signs in (once, with a click) so that the server can know it is that wallet: the eating power of the
    // live arena is given only to a verified connection. Everybody else is an anonymous viewer.
    const mine = connectedAddress();
    let c: ServerClient;
    if (showMode && mine === CEO_WALLET) {
      let store: Storage | null = null;
      try { store = window.localStorage; } catch { /* blocked */ }
      const { SessionStore } = await import("../lib/play/session.ts");
      practiceUrl = practiceServer();
      c = new ServerClientCtor(practiceUrl, { address: mine, signMessage: (text) => manager.signMessage(text) }, { sessions: new SessionStore(store) });
      c.on("signinNeeded", () => { if (pClient === c) c.signIn(); });
      c.on("authed", (m) => { if (pClient === c) ceoSession = (m as { wallet?: string }).wallet === CEO_WALLET; });
    } else {
      practiceUrl = practiceServer();
      c = new ServerClientCtor(practiceUrl, { address: "", signMessage: async () => new Uint8Array() }, { anonymous: true });
    }
    pClient = c;
    link = c;
    pTimeout = setTimeout(() => { if (pClient === c && !pStarted) { if (showMode) { setTimeout(() => { if (showMode && pClient === c) void startPractice(); }, 2500); } else practiceFail(pc.unreachable); } }, CONNECT_TIMEOUT_MS);
    c.on("status", ({ status }) => {
      if (pClient !== c) return;
      if (status === "ready") {
        if (showMode) c.liveWatch();
        else c.practice(clean, connectedAddress() ?? undefined, currentDifficulty(), (document.getElementById("play-now-mode") as HTMLSelectElement | null)?.value === "survival" ? "survival" : undefined);
      }
      else if (status === "closed" && !pEnded) {
        // The live arena never gives up: when the connection drops (a server update, a bad network) it connects again by itself.
        if (showMode) {
          if (livePanel) {
            const t = livePanel.querySelector<HTMLElement>("[data-live-text]");
            if (t) t.textContent = pc.liveReconnecting;
          }
          setTimeout(() => { if (showMode && pClient === c) void startPractice(); }, 2500);
          return;
        }
        practiceFail(pStarted ? pc.lost : pc.unreachable);
      }
    });
    c.on("entered", (m) => { pRoom = m.roomId; });
    c.on("live", (m) => { if (pClient === c) onLive(m); });
    c.on("skins", (m) => { if (pClient === c) arena?.setPlayerSkins(m.map); });
    c.on("start", (m) => {
      if (pClient !== c) return;
      pRoom = m.roomId;
      if (pTimeout) clearTimeout(pTimeout);
      pTimeout = null;
      setText(msg, "");
      onStart("practice", m);
    });
    c.on("snap", (m) => { if (pClient === c && source === "practice") onSnap(m); });
    c.on("fsnap", (m) => { if (pClient === c && source === "practice") withFrenzy((v) => v.snap(m)); });
    c.on("fend", (m) => { if (pClient === c && source === "practice") withFrenzy((v) => v.end(m)); });
    c.on("end", (m) => { if (pClient === c) practiceEnd(m); });
    c.on("error", (m) => {
      if (pClient !== c) return;
      practiceFail(m.code === "busy" ? pc.busy : fill(pc.failed, { message: m.message || m.code }));
    });
    c.connect();
  }

  function practiceEnd(m: End) {
    window.dispatchEvent(new Event("goshi-leave-fs"));
    endFrenzy();
    pEnded = true;
    const { btn, msg, leave } = cardEls();
    btn.disabled = false;
    leave.hidden = true;
    setText(msg, "");
    const a = arena;
    a?.handleEnd(m);
    const stats = a?.stats;
    const you = stats?.you ?? "";
    const nameOf = (w: string) => a?.nameOf(w) ?? w.slice(0, 4);
    const total = m.ranking.length;
    const mine = m.ranking.find((r) => r.w === you);
    if (mine) {
      const fresh = recordGame(mine.score);
      const prevBest = bestStreak();
      const mm = recordMission({ peak: mine.score, kills: a?.stats?.kills ?? 0, rank: mine.rank, total: m.ranking.length });
      fresh.push(...SKINS.filter((k) => k.unlock.kind === "streak" && k.unlock.n > prevBest && k.unlock.n <= mm.today.best));
      window.dispatchEvent(new CustomEvent("goshi-stats-change"));
      if (fresh.length > 0) {
        const el = document.querySelector<HTMLElement>("[data-skin-note]");
        const names = fresh.map((k) => live.skins.names[k.id] ?? k.id).join(", ");
        if (el) el.textContent = live.skins.unlocked.replace("{name}", names);
      }
    }
    const kids: Node[] = [];
    const rt = live.result;
    if (mine) {
      kids.push(buildSummary({
        t: rt, rank: mine.rank, of: total, mass: stats?.mass || mine.score, kills: stats?.kills ?? 0, prize: null,
        extra: dailyAndShare({
          t: rt, rank: mine.rank, of: total, mass: stats?.peak || mine.score, url: location.origin,
          massLabel: rt.yourMass, placeLabel: fill(rt.placeOf, { rank: mine.rank, n: total }),
        }),
        actions: {},
      }));
    }
    if (m.prize) {
      kids.push(node("p", { class: "result-best new", text: fill(pc.prizePaid, { n: (Number(m.prize.lamports) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 }) }) }));
    } else if (connectedAddress() === null) {
      kids.push(node("p", { class: "demo-note", text: pc.prizeHint }));
    }
    if (m.record) {
      const rec = m.record;
      const rr = pc.record;
      // The record lives on the server that ran the practice match.
      const http = practiceUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
      const url = `${http}/replay/${encodeURIComponent(m.roomId)}/arena`;
      const status = node("p", { class: "demo-note", attrs: { role: "status", "aria-live": "polite" } });
      const check = node("button", { class: "btn btn-glass btn-sm", text: rr.check, attrs: { type: "button" } });
      check.addEventListener("click", async () => {
        try {
          const buf = await (await fetch(url)).arrayBuffer();
          const dig = await crypto.subtle.digest("SHA-256", buf);
          const hex = Array.from(new Uint8Array(dig), (x) => x.toString(16).padStart(2, "0")).join("");
          setText(status, hex === rec.hash ? rr.ok : rr.bad);
        } catch {
          setText(status, rr.bad);
        }
      });
      const dl = node("a", { class: "btn btn-glass btn-sm", text: rr.download, attrs: { href: url, rel: "noopener noreferrer", download: `goshi-${m.roomId}-arena.bin` } });
      kids.push(node("h4", { text: rr.h }));
      if (mine) {
        kids.push(node("p", { text: fill(rr.what, { rank: mine.rank, total, mass: Math.round(stats?.mass || mine.score), peak: Math.round(stats?.peak || mine.score), kills: stats?.kills ?? 0 }) }));
      }
      kids.push(node("p", { text: fill(rr.saved, { n: rec.entries, kb: Math.max(1, Math.round(rec.bytes / 1024)) }) }));
      kids.push(node("p", { class: "mono-line", text: `${rr.hash}: ${rec.hash}` }));
      kids.push(node("p", { class: "demo-note", text: rr.paid }));
      kids.push(node("p", { class: "demo-note", text: rr.read }));
      kids.push(node("div", { class: "btn-row" }, [dl, check]));
      kids.push(status);
    }
    kids.push(node("h4", { text: pc.ranking }));
    kids.push(node("ol", { class: "result-list" }, m.ranking.map((r) => {
      const label = r.role === "saboteur" ? ` (${pc.saboteur})` : "";
      return node("li", {
        class: r.w === you ? "me" : "",
        text: `${r.w === you ? `${nameOf(r.w)} (${youWord(walletNow(), live.game.you)})` : nameOf(r.w)}${label}: ${Math.round(r.score * 10) / 10}`,
      });
    })));
    const again = node("button", { class: "btn btn-gold btn-lg", text: live.result.rematch, attrs: { type: "button", id: "play-again" } });
    again.addEventListener("click", () => void startPractice());
    const close = node("button", { class: "btn btn-glass", text: pc.close, attrs: { type: "button" } });
    close.addEventListener("click", () => clear());
    kids.push(node("div", { class: "btn-row" }, [again, close]));
    setText($("play-result-h"), pc.resultH2);
    resultBody.replaceChildren(...kids);
    const closeOld = $("play-result-close");
    closeOld.hidden = true;
    resultEl.hidden = false;
    // The page is never moved at the end of a match: the person may be recording the screen.
    resultEl.focus({ preventScroll: true });
    teardownPractice(false);
  }

  function stopPractice() {
    const { btn, msg, leave } = cardEls();
    teardownPractice(true);
    pEnded = true;
    btn.disabled = false;
    leave.hidden = true;
    setText(msg, "");
    clear();
  }

  // ------------------------------------------------------------------ waiting room view

  function renderLobby() {
    const v = roomView;
    // While a match is on screen (practice or room) the arena replaces the waiting room view.
    if (!v || !gameHost.hidden) { lobbyView.hidden = true; return; }
    lobbyView.hidden = false;
    const fmt = (ms: number) => {
      const s = Math.max(0, Math.floor(ms / 1000));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };
    const waited = v.waitedMs + (Date.now() - lobbyShownAt);
    setText(q("[data-lv-title]"), fill(as.lobbyH, { id: v.roomId }));
    setText(q("[data-lv-paid-h]"), fill(as.paidSeats, { n: v.paid.length }));
    setText(q("[data-lv-free-h]"), fill(as.freeSeats, { n: v.free.length }));
    const seat = (w: string | undefined) => {
      if (!w) return node("li", { class: "seat empty", text: as.empty });
      const me = w === v.you;
      return node("li", { class: me ? "seat me" : "seat", text: me ? `${v.short(w)} (${youWord(w, live.game.you)})` : v.short(w) });
    };
    q("[data-lv-paid]")?.replaceChildren(...Array.from({ length: 10 }, (_, i) => seat(v.paid[i])));
    q("[data-lv-free]")?.replaceChildren(...Array.from({ length: 3 }, (_, i) => seat(v.free[i])));
    setText(q("[data-lv-wait]"), `${fill(as.waitingPlayers, { paid: v.paid.length })}. ${fill(as.waited, { time: fmt(waited) })}`);
    const left = VS_AFTER_MS - waited;
    setText(q("[data-lv-vs]"), v.mode === "vs" ? live.lobby.vsWaiting.replace("{id}", v.roomId).replace("{paid}", String(v.paid.length)) : left > 0 ? fill(as.vsTimer, { time: fmt(left) }) : as.vsDue);
    const fillBtn = q<HTMLButtonElement>("[data-lv-fill]");
    if (fillBtn) {
      fillBtn.hidden = !v.canFill;
      setText(fillBtn, fill(as.fill, { network: v.network }));
      fillBtn.onclick = () => v.onFill();
    }
    const sh = q<HTMLButtonElement>("[data-lv-share]");
    if (sh) {
      setText(sh, as.share);
      sh.onclick = async () => {
        const url = new URL(location.href);
        url.search = "";
        url.hash = "";
        url.searchParams.set("room", v.roomId);
        try {
          if (typeof navigator.share === "function" && matchMedia("(pointer: coarse)").matches) {
            await navigator.share({ title: "Goshi", text: `${as.shareText}\nPhantom: https://phantom.app/ul/browse/${encodeURIComponent(url.toString())}?ref=${encodeURIComponent(location.origin)}`, url: url.toString() });
          } else {
            await navigator.clipboard.writeText(url.toString());
            setText(sh, as.shareCopied);
            setTimeout(() => setText(sh, as.share), 3000);
          }
        } catch { /* closed share sheet or no clipboard: nothing to do */ }
      };
    }
    const pr = q<HTMLButtonElement>("[data-lv-practice]");
    if (pr) {
      setText(pr, as.practice);
      pr.onclick = () => void startPractice();
    }
  }

  // ------------------------------------------------------------------ clear / room API

  function clear() {
    if (loadTimer) clearInterval(loadTimer);
    loadTimer = null;
    setLoading(null);
    resultEl.hidden = true;
    $("play-result-close").hidden = false;
    setText($("play-result-h"), live.result.h2);
    gameHost.hidden = true;
    card.classList.remove("is-playing");
    disposeArena();
    source = roomView ? "room" : null;
    setText(lobbyEl, live.lobby.idle);
    renderLobby();
  }

  const api: ArenaShell = {
    get source() { return source; },

    bindCard() {
      if (cardBound) return;
      cardBound = true;
      const { btn, name, leave } = cardEls();
      name.value = savedName();
      btn.addEventListener("click", () => { leaveLiveMode(); void startPractice(); });
      // The live arena, straight in: one button on the page, no link to know.
      document.getElementById("play-live-btn")?.addEventListener("click", () => {
        document.querySelector(".tv-gate")?.remove();
        enterLiveArena(true);
      });
      leave.addEventListener("click", () => stopPractice());
      name.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); void startPractice(); } });
      q("[data-dead-again]")?.addEventListener("click", () => { if (showMode) liveJoin(); else void startPractice(); });
      // The home page sends people here with ?play=1: start at once, no second click.
      const params = new URLSearchParams(location.search);
      if (params.get("show") === "1") {
        // One click opens it (the browser only plays sound after a click) and the show runs by itself.
        const gate = document.createElement("div");
        gate.className = "tv-gate";
        const play = document.createElement("button");
        play.type = "button"; play.className = "btn btn-gold btn-lg"; play.textContent = pc.liveJoin;
        play.addEventListener("click", () => { gate.remove(); enterLiveArena(true); });
        const go = document.createElement("button");
        go.type = "button"; go.className = "btn btn-glass btn-lg"; go.textContent = pc.liveWatchOnly;
        go.addEventListener("click", () => { gate.remove(); enterLiveArena(false); });
        gate.className = "tv-gate tv-gate-two";
        gate.append(play);
        gate.append(go);
        document.body.append(gate);
      }
      if (params.get("play") === "1") {
        params.delete("play");
        const rest = params.toString();
        history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
        void startPractice();
      }
    },
    startPractice() { void startPractice(); },
    stopPractice,

    roomEntering(roomId, c) {
      if (source === "practice") return; // a practice match on screen is not interrupted by looking at a room
      link = c;
      source = "room";
      setText(lobbyEl, fill(live.lobby.entering, { id: roomId }));
      gameHost.hidden = true;
      lobbyView.hidden = false;
      lobbyShownAt = Date.now();
      card.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
    },
    roomLobby(view) {
      roomView = view;
      lobbyShownAt = Date.now();
      if (lobbyTimer) clearInterval(lobbyTimer);
      lobbyTimer = null;
      if (view) lobbyTimer = setInterval(() => renderLobby(), 1000);
      renderLobby();
    },
    roomStart(m, c) {
      // The match of the room replaces a practice that was running.
      if (source === "practice") { teardownPractice(true); pEnded = true; const { btn, leave } = cardEls(); btn.disabled = false; leave.hidden = true; disposeArena(); }
      link = c;
      onStart("room", m);
    },
    roomFrenzySnap(m) { withFrenzy((v) => v.snap(m)); },
    roomFrenzyEnd(m) { withFrenzy((v) => v.end(m)); },
    roomSnap(m) {
      if (source !== "room") return;
      onSnap(m);
    },
    roomEnd(m, render) {
      endFrenzy();
      if (source === "room") withArena((a) => a.handleEnd(m));
      // The practice result card hides the close button and renames the card: give the room result its own back.
      $("play-result-close").hidden = false;
      setText($("play-result-h"), live.result.h2);
      render();
    },
    clear,
    stats() { return arena?.stats ?? null; },
  };
  return api;
}
