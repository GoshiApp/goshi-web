import type { RouteKey } from "../lib/i18n";
import type { ErrorKind } from "../lib/play/errors";

/** Honest status labels. Never "live" without saying where: the contract is on a test network. */
export type StatusKey = "devnet" | "design" | "idea" | "planned" | "pending" | "demo" | "live";

export interface Item { icon: string; title: string; text: string; status?: StatusKey; href?: string }
export interface Faq { q: string; a: string[] }

export type Block =
  | { t: "prose"; id?: string; eyebrow?: string; h2: string; paras: string[]; list?: string[]; panel?: boolean; component?: "orb" }
  | { t: "cards"; id?: string; h2: string; intro?: string; items: Item[]; cols?: 2 | 3 | 4; compact?: boolean }
  | { t: "steps"; id?: string; h2: string; intro?: string; items: { title: string; text: string }[] }
  | { t: "table"; id?: string; h2: string; intro?: string; caption?: string; head: string[]; rows: string[][]; numeric?: number[]; note?: string }
  | { t: "notice"; id?: string; tone: "risk" | "care" | "info"; title: string; paras?: string[]; list?: string[] }
  | { t: "split"; id?: string; h2: string; intro?: string; yes: { h: string; list: string[] }; no: { h: string; list: string[] } }
  | { t: "faq"; id?: string; h2: string; items: Faq[] }
  | { t: "phases"; id?: string; h2: string; intro?: string; gateLabel: string; items: { name: string; status: StatusKey; text: string; gate?: string }[] }
  | { t: "facts"; id?: string; h2?: string; items: { value: string; label: string }[] }
  | { t: "cta"; h2: string; text: string; primary?: { label: string; to: RouteKey }; secondary?: { label: string; to: RouteKey } }
  | { t: "component"; name: "calc" | "contact" | "github" | "play" | "ideas" | "gamesHub" | "verify" | "matches" | "replay" | "invite" | "profile"; variant?: "page" }
  | { t: "legal"; tocTitle: string; sections: { id: string; h: string; paras?: string[]; list?: string[] }[] };

export interface Page {
  /** <title> without the brand suffix. */
  title: string;
  description: string;
  eyebrow?: string;
  h1: string;
  lead: string;
  /** Shown under the lead on legal pages. */
  meta?: string;
  blocks: Block[];
}

export interface UI {
  htmlLang: string;
  langName: string;
  switchTo: string;
  switchAria: string;
  skip: string;
  primaryNavLabel: string;
  walletChip: {
    connect: string; connectAria: string; connected: string; disconnect: string; disconnectAria: string; menu: string; profile: string; history: string;
    announceConnected: string; announceDisconnected: string; network: Record<"devnet" | "testnet" | "mainnet-beta", string>;
  };
  nav: Record<"practiceSite" | "labSite" | "games" | "ideas" | "verify" | "matches" | "replay" | "invite" | "profile" | "how" | "token" | "security" | "opensource" | "more" | "play" | "roadmap" | "faq" | "risks" | "contribute" | "support", string>;
  menuOpen: string;
  themeToggle: string;
  statuses: Record<StatusKey, string>;
  footer: { tagline: string; play: string; trust: string; community: string; testNotice: string; notFinancial: string; trademarks: string; rights: string; noCookies: string };
  breadcrumbHome: string;
  homeAria: string;
  notFound: { title: string; text: string; home: string; description: string };
  rootTitle: string;
  rootText: string;
  rootDescription: string;
  noindexTitle: string;
  ogAlt: string;
  ticker: { label: string; visits: string; wallets: string; online: string; playing: string; matches: string; volume: string; unitReal: string; unitTest: string; prices: string; source: string; offline: string; maintenance: { soon: string; draining: string; down: string } };
  launch: {
    label: string; endsIn: string; ended: string; days: string; hours: string; minutes: string; seconds: string;
    ca: string; copy: string; copied: string; explorer: string; wallets: string;
    wallet: Record<"infra" | "liquidity" | "burn" | "jackpot", string>;
  };
}

export interface Home {
  title: string;
  description: string;
  meet: { h2: string; lines: [string, string, string]; alt: string };
  hero: {
    eyebrow: string;
    h1: string;
    sub: string;
    primary: string;
    /** The main call to action when the games are on: free practice, no wallet. */
    practice: string;
    quickH: string; quickAbout: string; quickLoading: string; quickNote: string; quickAria: string;
    secondary: string;
    trust: string[];
    illustrationAlt: string;
    example: string;
    f1: { label: string; text: string };
    f2: { label: string; text: string };
    f3: { label: string; text: string };
  };
  blocks: Block[];
}

/** The interactive calculator on How it works. */
export interface CalcCopy {
  h2: string;
  intro: string;
  royale: {
    h3: string; fee: string; feeHelp: string; paid: string; paidHelp: string; saboteurs: string; saboteursHelp: string;
    invalid: string; pass: string; passHelp: string;
  };
  vs: { h3: string; fee: string; players: string; playersHelp: string; invalid: string };
  head: [string, string, string];
  rows: {
    first: string; second: string; third: string; burn: string; infra: string; liquidity: string; jackpot: string;
    prizePool: string; rake: string; pot: string; saboteurEach: string; saboteurPool: string; cash: string;
    winner: string; loser: string;
  };
  kinds: { sol: string; goshi: string; none: string };
  note: string;
  unit: string;
}

/** The Orb Rush illustration. */
export interface OrbCopy {
  alt: string;
  caption: string;
  you: string;
  small: string;
  big: string;
}

/** Words for the on-chain games page. Placeholders in braces are filled by src/scripts/play.ts. */
export interface PlayCopy {
  /** Unit names. sol: the network currency. goshi: the token (tokens on a test network are "test {symbol}"). */
  units: { sol: string; goshiTest: string; goshiLive: string };
  banner: { title: string; devnet: string; testnet: string; mainnet: string };
  soon: { badge: string; h2: string; text: string; list: string[]; note: string };
  /** Shown when the feature is enabled but a setting in src/site.ts is missing. */
  broken: { h2: string; text: string };
  noscript: string;
  notice: { title: string; list: string[] };
  gate: { legend: string; label: string; required: string; network: string; networkRequired: string };
  wallet: {
    h2: string; intro: string; connectWith: string; connecting: string; disconnect: string;
    detected: string; missing: string; install: string; connectedWith: string; balances: string; showDetails: string; hideDetails: string;
    sol: string; goshi: string; announceConnected: string; announceDisconnected: string;
    mobileH2: string; mobileText: string; openIn: string; mobileNoWallet: string;
    netHelp: string; blockedLink: string;
  };
  rooms: {
    h2: string; intro: string; caption: string; refresh: string; loading: string; empty: string; loadError: string; updated: string;
    states: { waiting: { label: string; help: string }; active: { label: string; help: string } };
    modes: { royale: string; vs: string; duel: string };
    roomName: string; fee: string; pot: string; paid: string; saboteurs: string;
    details: string; detailsAria: string;
    joinPaid: string; joinPaidAria: string; joinFree: string; joinFreeAria: string;
    freeNeed: string; freeUnknown: string;
    youArePaid: string; youAreSaboteur: string; full: string; inProgress: string; prizeRoyale: string; prizeVs: string; prizeDuel: string; seatsPeople: string; seatsBots: string; botsNote: string; tier: string; passSeat: string;
  };
  pot: {
    h2: string; intro: string; noRoom: string; room: string; live: string; whenFull: string;
    head: [string, string, string];
    prizeH: string; rakeH: string; rakeIntro: string;
    rows: {
      first: { label: string; share: string };
      second: { label: string; share: string };
      third: { label: string; share: string };
      burn: { label: string; share: string; text: string };
      infra: { label: string; share: string; text: string };
      liquidity: { label: string; share: string; text: string };
      jackpot: { label: string; share: string; text: string };
      saboteurs: { label: string; share: string };
    };
    totals: { prizePool: { label: string; share: string }; rake: { label: string; share: string }; pot: { label: string; share: string } };
    saboteurNote: string; passNote: string; vsNote: string; rounding: string; basis: string; unavailable: string;
  };
  /** The modal shown before every paid or saboteur join. */
  entry: {
    paidTitle: string; freeTitle: string; paidText: string; freeText: string;
    youPay: string; goesTo: string; room: string; youHold: string; youKeep: string;
    saboteurTitle: string; saboteurNotice: string;
    superPotTitle: string; superPotText: string; superPotTrust: string;
    rakeTitle: string; rakeText: string;
    vsTitle: string; vsText: string;
    finalTitle: string; finalText: string; testReminder: string;
    accept: string; confirm: string; cancel: string; mustAccept: string;
    moreRules: string;
    backpackLabel: string; backpackNone: string; backpackOption: string; backpackHelp: string;
  };
  /** The simple flow (test and lab): one welcome screen, three big buttons and a lobby. */
  menu: {
    welcomeH: string; welcomeIntro: string; welcomeAccept: string;
    create: string; createSub: string; join: string; joinSub: string; browse: string; browseSub: string;
    pickFee: string; codeLabel: string; codePh: string; joinBtn: string; badCode: string; notFound: string;
    connectFirst: string; creating: string; joining: string; failed: string; back: string;
    lobbyH: string; codeTitle: string; copyLink: string; copied: string; share: string; players: string; you: string;
    seats: string; start: string; startNeed: string; startHint: string; startAsked: string; fillBots: string; hostWait: string;
  };
  /** The guest onboarding wizard (test only): name + color, then four mode cards, no wallet. */
  guest: {
    eyebrow: string; title: string; subtitle: string; go: string; note: string; skinLabel: string;
    greeting: string; modesTitle: string;
    modes: {
      practice: { title: string; desc: string; tag: string };
      arena: { title: string; desc: string; tag: string };
      duel: { title: string; desc: string; tag: string };
      survival: { title: string; desc: string; tag: string };
    };
    advanced: string; nameLabel: string;
    duelCreate: string; duelJoin: string; duelCode: string; duelCodePlaceholder: string; duelStart: string;
    duelWaiting: string; duelPlayers: string; duelBack: string; duelBadCode: string; busy: string;
  };
  vsOffer: { title: string; text: string; countdown: string; accept: string; decline: string; accepted: string; declined: string; started: string };
  tx: {
    h2: string; idle: string; signing: string; sent: string; confirmed: string; unconfirmed: string; failed: string;
    view: string; connectFirst: string; gateFirst: string;
    failedAt: string; retry: string;
    steps: { gate: string; wallet: string; simulate: string; room: string; seat: string; balance: string; saboteur: string; login: string; network: string; sign: string; server: string };
  };
  errors: Record<ErrorKind, string>;
  /** Messages with the exact amounts. {need} {fee} {network} {have} {min} are filled in with the unit. */
  exact: { insufficientSol: string; notEnoughGoshi: string };
  arena: { badge: string; h2: string; text: string };
  /** The quick match row of the play card and the spend guard. */
  duel: DuelCopy;
  quick: {
    topUp: string;
    h2: string; intro: string; about: string; loading: string; unavailable: string; noteTest: string;
    spent: string; limitLabel: string; limitNone: string; limitReached: string; needWallet: string; searching: string;
    found: string; opened: string; failed: string; signin: string; roomGone: string; entering: string; more: string;
  };
  /** The free practice card at the top of the page: no wallet, no money. */
  practice: {
    eyebrow: string; h2: string; text: string; nameLabel: string; namePlaceholder: string; serverLabel: string; serverAuto: string; regionNames: Record<string, string>; modeLabel: string; modeMatch: string; modeSurvival: string; showStart: string; showBadge: string; liveJoin: string; liveLeave: string; liveLength: string; liveLengthMax: string; liveLengthPaying: string; liveLengthOk: string; liveLengthWallet: string; liveLengthFail: string; liveLengthCredit: string; liveReconnecting: string; liveButton: string; liveWatchOnly: string; liveCounts: string; liveCashPrice: string; liveCashFree: string; arenasError: string; arenasRetry: string; ticketsHave: string; ticketBuy: string; ticketBuying: string; ticketBought: string; ticketBuyFail: string; ticketEnter: string; ticketEnterFree: string; cashSignIn: string; arenasTitle: string; arenaEntry: string; arenaRow: string; cashTickets: string; cashPayClose: string; liveCashedOut: string; livePlaying: string; liveQueued: string; liveDead: string; diffLabel: string; diffEasy: string; diffMedium: string; diffHard: string; diffInsane: string; button: string; note: string;
    connecting: string; unreachable: string; busy: string; lost: string; failed: string;
    leave: string; resultH2: string; ranking: string; close: string;
    saboteur: string; bot: string;
    prizePaid: string; prizeHint: string;
    record: { h: string; what: string; saved: string; hash: string; paid: string; download: string; check: string; ok: string; bad: string; read: string };
    colorLabel: string; colorNames: [string, string, string, string, string, string, string, string];
  };
  /** The live part: the play server, creating rooms, the lobby, the game and the result. */
  live: {
    server: { label: string; connecting: string; authenticating: string; ready: string; reconnecting: string; closed: string; needWallet: string; signinNeeded: string; signinButton: string; mismatch: string; signFailed: string; paused: string };
    faucet: { h2: string; text: string; button: string; asking: string; done: string };
    create: { h2: string; intro: string; fee: string; feeOption: string; button: string; creating: string; created: string; needServer: string; view: string };
    bots: { button: string; aria: string; joining: string };
    room: { open: string; openAria: string; role: string };
    lobby: { idle: string; entering: string; waiting: string; full: string; countdown: string; started: string; vsWaiting: string };
    /** Proof of playback: re-check a match in the browser. */
    proof: {
      h: string; text: string; button: string; running: string; ok: string; bad: string; unknown: string;
      steps: Record<"commit" | "seed" | "block" | "replay" | "mass" | "arena" | "jackpot" | "chain", string>;
      download: string;
    };
    /** The minute of frenzy that opens every match. */
    frenzy: {
      title: string; mass: string; rank: string; top: string; nitro: string; stun: string; gap: string; carried: string;
      startsIn: string; cap: string; spectateFree: string; spectateFollow: string; spectateNext: string; spectateMap: string;
    };
    /** Daily missions. */
    missions: {
      h2: string; intro: string; streak: string; best: string; done: string; allDone: string; none: string;
      text: Record<"games" | "peak" | "kills" | "top3" | "win", string>;
    };
    /** The collection of cosmetic skins. */
    skins: {
      h2: string; intro: string; quick: string; manage: string; useLabel: string; inUse: string; locked: string; connect: string; verifying: string; balance: string; notHolder: string;
      rarity: Record<"common" | "rare" | "epic" | "meme" | "holder" | "founder", string>;
      names: Record<string, string>;
      unlock: Record<"free" | "games" | "best" | "hold" | "streak" | "founder", string>;
      unlocked: string;
    };
    /** The three step guide shown before the first practice. */
    tutorial: {
      open: string; title: string; step: string; next: string; back: string; skip: string; start: string;
      steps: { h: string; touch: string; desk: string }[];
    };
    /** The waiting room view and the loading state of the arena. */
    arenaState: {
      connecting: string; waitingPlayers: string; startsIn: string; starting: string;
      lobbyH: string; paidSeats: string; freeSeats: string; empty: string; waited: string; vsTimer: string; vsDue: string;
      fill: string; practice: string; practiceAgain: string; exitMatch: string; trapLaser: string; trapSlow: string; varButton: string; trapKamikaze: string; trapShield: string; trapCashout: string; trapNotNow: string; trapKeys: string; trapNoBackpack: string; trapTooSoon: string; trapLeft: string; potLive: string; hint: string; share: string; shareCopied: string; returnToMatch: string; peerLeft: string; peerLeftGrace: string; matchLocked: string; peerBack: string; matchOver: string; matchOverRank: string; notNow: string; showAll: string; boostWord: string; boostLeft: string; boostRight: string; boostBigger: string; boostSmaller: string; leadTop: string; leadYou: string; leadBehind: string; inviteTitle: string; connectFirst: string; shareText: string; incomingRoom: string;
    };
    game: {
      canvasLabel: string; rotateTitle: string; rotateText: string; rotateStay: string; fullscreen: string; exitFullscreen: string; controls: string; boost: string; ctrlJoystick: string; ctrlFollow: string; time: string; mass: string; scores: string; you: string;
      alive: string; nitro: string; soundOn: string; soundOff: string; musicOn: string; musicOff: string; memeOn: string; memeOff: string;
      finalZone: string; nextZone: string; zoneCalm: string; zoneWarn: string; zoneShrink: string; zoneHold: string; zoneOutBanner: string; bagLine: string; bossCalm: string; bossWarn: string; bossOpen: string; bossOpenBody: string; bossAttackBody: string; cashingOut: string; final3Freeze: string; bigOrbNeed: string; solSplit: string; cashOutTitle: string; cashOutText: string; cashOutStopped: string; cashOutStoppedText: string; cashOutSending: string; solscan: string; cashOtherWarn: string; cashToWallet: string; cashInfoTitle: string; cashInfoLines: string[]; cashTips: string[]; cashLine: string; cashReady: string; cashGain: string; cashLoss: string; cashedOut: string; cashEntryOk: string; cashEntryBad: string; bossAttack: string; showerIn: string; showerLanded: string; diagButton: string; diagLine: string; reportButton: string; reportCopied: string; reportManual: string;
      quality: string; qualityAuto: string; qualityHigh: string; qualityMedium: string; qualityLow: string; ping: string; pingValue: string; pingWait: string; rank: string; rankValue: string; playersValue: string; outValue: string; zone: string; protectedHint: string; backToZone: string; saboteurLegend: string; paidLegend: string; botLegend: string;
      startAnnounce: string; endAnnounce: string; countdown: string;
      deadTitle: string; deadText: string; spectating: string; rankLabel: string;
      deathYouBody: string; deathYouHead: string; deathYouZone: string; deathYouWall: string; deathOnYourBody: string;
      deathFeedBody: string; deathFeedHead: string; deathFeedZone: string; deathFeedWall: string; deathYouKamikaze: string; deathYouCashout: string; deathFeedKamikaze: string; deathFeedCashout: string;
    };
    result: {
      h2: string; inTop: string; notInTop: string; winners: string; ranking: string; score: string; payout: string; place: [string, string, string];
      sol: string; goshi: string; unclaimed: string; jackpot: string; jackpotYes: string; jackpotNo: string; rake: string; pot: string;
      tx: string; viewTx: string; noTx: string; error: string; close: string; wait: string; saboteur: string;
      yourPlace: string; placeOf: string; yourMass: string; eliminations: string; prizeSent: string; prizeNone: string; viewPrize: string;
      again: string; change: string; practice: string; leave: string;
      share: string; shareText: string; shareTitle: string; copied: string; download: string; downloadName: string;
      passTitle: string; passText: string; passAccept: string; passIn: string; passTaking: string; passGone: string; passDone: string;
      saboteurShare: string; saboteurNoPodium: string;
      bestToday: string; streak: string; streakFirst: string; beatBest: string; newBest: string; rematch: string;
    };
    errors: Record<string, string>;
    errorGeneric: string;
  };
}

export interface DuelCopy {
  h2: string; intro: string; tiersLabel: string; guestsLabel: string; guestPh: string; addGuest: string; create: string; creating: string;
  needWallet: string; needGuest: string; badGuest: string; signing: string; created: string; shareLabel: string; copy: string; copied: string;
  share: string; startNow: string; waiting: string; failed: string; incoming: string; accept: string; gone: string; rules: string; full: string;
  shareText: string; inviteBanner: string; liveH: string; liveNone: string; watch: string; liveLine: string; notInvited: string;
}

export interface IdeasCopy {
  boardH2: string; boardIntro: string;
  formH2: string; formIntro: string;
  titleLabel: string; titlePh: string; textLabel: string; textPh: string;
  imagesLabel: string; imagesHint: string; imagesRemove: string;
  submit: string; sending: string; thanks: string;
  errors: { short: string; image: string; tooMany: string; network: string; full: string };
  sortLabel: string; sortTop: string; sortNew: string; statusLabel: string; statusAll: string;
  status: Record<"open" | "studying" | "planned" | "building" | "live", string>;
  empty: string; loading: string; offline: string; count: string;
  gate: { title: string; text: string; connect: string; install: string; signing: string; ok: string; notHolder: string; rpc: string; sessionLost: string; tokenLink: string };
  up: string; down: string; report: string; reported: string; showImages: string; hideImages: string; noteVotes: string;
  hub: {
    h2: string; intro: string;
    orbTitle: string; orbText: string; orbCta: string;
    nextTitle: string; nextText: string; nextEmpty: string; nextCta: string;
    ideasTitle: string; ideasText: string; ideasCta: string;
  };
}

export interface VerifyCopy {
  label: string; placeholder: string; button: string; searching: string; none: string; error: string; hint: string;
  kinds: Record<"wallet" | "tx" | "room" | "hash", string>;
  match: string; place: string; entry: string; tx: string; noTx: string; arenaFile: string; yourFile: string; check: string; checking: string;
  steps: Record<"commit" | "seed" | "block" | "replay" | "mass" | "arena" | "jackpot" | "chain", string>;
  ok: string; bad: string; unknown: string; sol: string;
  watch: string; mine: string; mineNeedWallet: string; howTitle: string; how: string[]; winTitle: string; win: string[];
  pay: Record<string, string>;
}

export interface ReplayCopy {
  drop: string; pick: string; loading: string; loaded: string; notFound: string; badFile: string; error: string;
  play: string; pause: string; again: string; speed: string; follow: string; auto: string; fullMap: string; time: string;
  players: string; winner: string; died: string; alive: string; how: string[]; paint: Record<"you" | "protectedHint" | "backToZone" | "countdown" | "finalZone" | "nextZone" | "nitro" | "mass", string>;
  verifyLink: string; downloadLink: string; cli: string; cliText: string; roomLabel: string; load: string;
  viewer: Record<string, string>;
}

export interface MatchesCopy {
  /** The VAR of the cash arena (test network): title, intro, one line per clip, the player and the fingerprint check. */
  var: { h2: string; intro: string; empty: string; eliminated: string; cashout: string; watch: string; hashOk: string; hashBad: string; by: string; history: string; all: string; cashouts: string; share: string; shareX: string; solscan: string; playPause: string; video: string; videoRec: string; seek: string; speed: string; causeBody: string; causeZone: string; causeWall: string; causeCashout: string; copied: string; pick: string; shareText: string; emptyMine: string };
  filterAll: string; filterLabel: string; modes: Record<"royale" | "vs" | "duel", string>;
  players: string; winner: string; loadMore: string; loading: string; empty: string; error: string; refresh: string; shown: string; searchLink: string;
  tvStart: string; tvNext: string; tvExit: string; tvCount: string; tvEmpty: string;
  tvMusicOn: string; tvMusicOff: string; liveBadge: string; liveStart: string; liveLines: string[];
}

export interface InviteCopy {
  share: { label: string; native: string; copy: string; copied: string; text: string; x: string; telegram: string; whatsapp: string; yourLink: string };
  connect: string; install: string; signing: string; needWallet: string; linkLabel: string; stats: { referred: string; rooms: string; earned: string };
  how: string[]; unavailable: string;
}

export interface Copy {
  ui: UI;
  play: PlayCopy;
  calc: CalcCopy;
  orb: OrbCopy;
  home: Home;
  pages: Record<Exclude<RouteKey, "home">, Page>;
  ideas: IdeasCopy;
  verify: VerifyCopy;
  replay: ReplayCopy;
  matches: MatchesCopy;
  invite: InviteCopy;
  contact: { h2: string; support: string; privacy: string; security: string; note: string };
  github: { h2: string; text: string; notYet: string; button: string };
}
