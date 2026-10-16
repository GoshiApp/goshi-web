import type { Page } from "../types";

export const games: Page = {
  title: "Games",
  description: "Orb Rush, the first Goshi game: a battle royale of solid bodies and a shrinking safe zone, and an honest roadmap of what comes next.",
  eyebrow: "Games",
  h1: "One game today, more to come",
  lead: "Goshi is a home for short skill games played in rooms. Orb Rush is the first one: a battle royale for up to 10 paid players and 3 saboteurs, running on [[t:a test network]][[m:Solana mainnet]]. The others are not built yet.",
  blocks: [
    {
      t: "prose",
      id: "orb-rush",
      eyebrow: "Live[[t: on devnet]]",
      h2: "Orb Rush",
      paras: [
        "Each player is a head with a solid body that follows its path. Eat orbs to grow longer and heavier. If your head touches another player's body, you are eliminated at once, however big or small they are. Head against head, the heavier one survives and the lighter one is eliminated. The safe zone shrinks, so you have to keep moving toward the middle. A match lasts 5 minutes and the last players standing win.",
        "The match is simulated only on the game server. Your browser sends where you want to go, and draws what the server sends back. Nothing the browser says can change the match.",
      ],
      component: "orb",
    },
    {
      t: "table",
      id: "rules",
      h2: "The rules, exactly",
      intro: "These are the rules the server runs today. They can change[[t: while the game is in testing]].",
      head: ["Rule", "Value"],
      rows: [
        ["Arena", "3000 by 3000, with the edge as a deadly wall"],
        ["Match", "5 minutes, 20 ticks per second"],
        ["Safe zone", "A circle of radius 1450 until minute 2. Then it moves in five phases to radii 1050, 720, 460, 290 and 150. Every next circle is random and lies inside the previous one, so the middle of the arena is not safe at the end. Each phase announces the next circle, moves to it, and holds. Outside the circle you lose (mass times 0.10 plus 3) times (1 plus 0.3 times (phase minus 1)) mass per second, and you die under mass 5"],
        ["Start", "Mass 20. Speed 135 divided by (1 plus mass divided by 600). Turn rate 270 degrees per second, a little less the heavier you are. Nobody can die in the first 8 seconds"],
        ["Boost", "1.7 times faster, costs 1.5% of your mass per second, never below mass 12"],
        ["Body", "One segment for every 3 mass, from 6 to 150. Body radius is 10 plus 1.1 times the square root of the mass"],
        ["Touching", "A head that touches the body of any other player dies at once. Head against head: the lighter one dies, and equal masses both die. Your own body is harmless"],
        ["Dying", "All of your mass turns into orbs along your path (at most 80 orbs)"],
        ["Orbs", "Orbs give their value as mass. 600 orbs are kept on the map. Every 30 seconds a cluster of 6 coins worth 4 lands inside the zone"],
        ["Ranking", "Players alive at the end by mass, then eliminated players by time of elimination (later is better). Ties go to the lower wallet address"],
        ["Podium", "The top three PAID players of the ranking (saboteurs do not compete). The prizes are 60%, 25% and 15% of the prize pool, which is 88% of the pot"],
      ],
      note: "The positions where orbs appear are random. Everything else depends on what players do. Whether the games count as skill based is part of the legal review: see [Risks](@risks).",
    },
    {
      t: "phases",
      id: "roadmap",
      h2: "What comes next",
      intro: "An honest list. Nothing here is scheduled and nothing is promised. Labels say exactly where each item stands.",
      gateLabel: "Before it opens",
      items: [
        { name: "Orb Rush royale", status: "devnet", text: "[[t:Playable on the Solana devnet test network with test SOL.]][[m:Playable on Solana mainnet with real SOL.]]", gate: "[[t:A contract audit, a legal review and a decision on a mainnet token.]][[m:An external audit and an up to date legal review.]]" },
        { name: "VS mode", status: "devnet", text: "If a room does not fill in 5 minutes, 2 to 9 paid players can play a one against all match. Every paid player has to accept.", gate: "Tested on devnet first." },
        { name: "Spectating and replays", status: "live", text: "Watch a match back from every player's point of view, export it as video and verify it against the recorded result.", gate: "Every match is recorded and checkable." },
        { name: "A second game", status: "idea", text: "A different short skill game for rooms of paid players and saboteurs. The kind of game is open for the community to propose.", gate: "A public proposal and a prototype." },
      ],
    },
    {
      t: "notice",
      tone: "info",
      title: "How games are chosen",
      paras: [
        "Games must be skill based and playable in a few minutes. Anyone will be able to propose one through the community process described on the [community page](@opensource). That process is planned, and not live yet.",
      ],
    },
    {
      t: "cta",
      h2: "Try Orb Rush[[t: on the test network]]",
      text: "[[t:You need a Solana wallet set to devnet. Nothing you use there has any value.]][[m:You need a Solana wallet with some SOL for the entry fee and for network fees. You are using real funds.]]",
      primary: { label: "Go to the play page", to: "play" },
      secondary: { label: "How a room works", to: "how" },
    },
  ],
};

export const how: Page = {
  title: "How it works",
  description: "Rooms, entry fees in SOL, saboteurs, the 60/25/15 prizes, the 10% rake split, the super pot, VS mode, what happens on-chain and on the game server, and what you have to trust today.",
  eyebrow: "How it works",
  h1: "Rooms, prizes and who does what",
  lead: "A short, complete explanation of the money and of the trust. Read the last section before you play.",
  blocks: [
    {
      t: "steps",
      id: "room",
      h2: "Enter. Play. Win. Leave.",
      intro: "The loop in four steps. The details of the room follow.",
      items: [
        { title: "Enter: a room is opened for you", text: "Quick match asks the platform for the fullest waiting room with your entry, or a new one. A room has an entry fee in SOL, up to 10 paid seats and up to 3 free saboteur seats. Only the platform can open rooms." },
        { title: "Enter: you take a seat", text: "A paid seat sends the entry fee from your wallet into the room account, which only the contract can move. A saboteur seat is free if your wallet holds the minimum $GOSHI (nothing is taken from it). Each wallet can take one seat per room." },
        { title: "Play: the 10 paid seats fill and the match starts", text: "When the tenth paid player is in, the room becomes active and the game server starts a 5 minute battle royale. If the room does not fill, VS mode can be offered." },
        { title: "Win or not: the contract pays the top three", text: "The server sends the podium to the contract, which splits the whole pot in one transaction and closes the room. Only three players are paid." },
        { title: "Leave: that is it", text: "Close the page or disconnect your wallet. Nothing keeps you in the room afterwards, and you can set a session spending limit on the play page." },
      ],
    },
    {
      t: "table",
      id: "split",
      h2: "Where the pot goes",
      intro: "The pot is the entry fees of the paid players. The same shares apply to every room. They are written in the contract.",
      head: ["Part", "Share", "Where it goes"],
      rows: [
        ["First place", "60% of the prize pool (52.8% of the pot)", "The best ranked paid player, in SOL"],
        ["Second place", "25% of the prize pool (22% of the pot)", "The second paid player, in SOL"],
        ["Third place", "15% of the prize pool, the remainder (13.2% of the pot)", "The third paid player, in SOL"],
        ["Saboteurs", "2% of the pot, shared equally", "The seated saboteurs, in SOL. They do not compete"],
        ["House: buy-back and burn", "10% of the house share (1% of the pot)", "Swapped to $GOSHI and destroyed"],
        ["House: infrastructure", "15% of the house share (1.5% of the pot)", "Servers, monitoring and support, in SOL"],
        ["House: liquidity and community", "25% of the house share (2.5% of the pot)", "A liquidity and community wallet, in SOL. No listing or trading is promised"],
        ["House: super pot", "50% of the house share, the remainder (5% of the pot)", "Swapped to $GOSHI and added to the accumulated super pot"],
      ],
      note: "88% of the pot is the prize pool, 2% goes to the saboteurs and the house keeps 10%. So the first place gets 52.8% of the pot, the second 22% and the third 13.2%. A room starts only when it has 10 paid players and its 3 saboteurs. When a share does not divide evenly it rounds down and the leftover goes to the remainder, so the parts always add up to the exact pot.",
    },
    {
      t: "split",
      id: "saboteurs",
      h2: "Saboteurs",
      intro: "Three saboteurs share the arena with the 10 paid players. They are obstacles. They do not pay, they do not compete and they cannot win.",
      yes: {
        h: "What a saboteur gets",
        list: [
          "A free seat, if the wallet holds the minimum $GOSHI. The tokens stay in the wallet",
          "An equal share of 2% of the pot, paid in SOL by the contract, whatever its ranking",
          "No loss: there is no entry fee",
        ],
      },
      no: {
        h: "What it does not get",
        list: [
          "A place on the podium: saboteurs are not ranked with the paid players",
          "A prize from the prize pool: that is only for the top three paid players",
          "The super pot: a saboteur cannot be the first place",
          "A paid player is never paid less because of a saboteur",
        ],
      },
    },
    {
      t: "prose",
      id: "superpot",
      h2: "The super pot",
      paras: [
        "The super pot accumulates in $GOSHI: half of every house share. It is paid to a first place only on a jackpot event.",
        "After a full match of 10 paid players there is a 1% chance, drawn from the secret the server committed to before anybody joined and the block where the room filled, so anybody can recompute it from the proof of the match. If it triggers, the whole super pot is paid to the first place (always a paid player: saboteurs cannot win). The payment is made by the team from the vault.",
        "**Trust assumption, stated plainly:** the roll is made by the game server. It cannot be verified on-chain. You have to trust the server for it.",
      ],
      panel: true,
    },
    {
      t: "prose",
      id: "vs",
      h2: "VS mode",
      paras: [
        "If a room waits 5 minutes without 10 paid players and has 2 to 9, the server offers a VS match to the paid players in it. Every paid player has to accept. There are no saboteurs in VS mode.",
        "The 10% rake is taken from every entry. Everyone but the winner keeps 80% of their net entry, and the winner takes the rest (120% of the net entry when there are two players).",
      ],
    },
    { t: "component", name: "calc" },
    {
      t: "table",
      id: "who",
      h2: "What happens where",
      head: ["Where", "What it does"],
      rows: [
        ["The contract (on-chain)", "Holds the entry fees in the room account, enforces the split, checks that the podium wallets are players of the room and are different, closes the room and, if a room cannot be played, refunds every entry fee. Anyone can read it and check its transactions."],
        ["The game server", "Opens rooms, runs the match, decides the ranking, computes the super pot draw and sends the podium to the contract. It signs with a key that only the platform holds. That key opens and settles rooms but cannot change the house wallets or empty the vault: those belong to a separate guardian key. It also runs the swap of SOL to $GOSHI when that phase is enabled."],
        ["Your browser", "Shows rooms, asks your wallet to sign your own transactions, sends your steering and draws the match. It never decides anything."],
        ["Your wallet", "Holds your keys. We never see them. You approve every payment yourself."],
      ],
    },
    {
      t: "notice",
      id: "trust",
      tone: "risk",
      title: "What you have to trust today",
      list: [
        "**The game server decides who wins.** The contract cannot see the match. It trusts the podium that the platform's key sends it. The server could be wrong or be run dishonestly.",
        "**The super pot draw can be checked, its payment is made by hand.** The 1% event comes from the committed secret and the block of the match, and the proof of every match lets anybody recompute it. The team makes the payment from the vault.",
        "**The platform key controls the room.** It can open rooms, send the podium and cancel a room to refund the entry fees. It cannot take your wallet's funds, but it chooses who the contract pays inside a room.",
        "**The contract [[t:is on a test network and ]][[n:has not been audited by an external firm.]][[y:was audited by an external firm. TODO(owner): link the report.]]**[[n: An independent audit is planned and not done.]]",
        "**There is no appeal.** A payout on-chain is final.",
        "We describe these limits in more detail on [Security and fairness](@security). Moving the match to a design that does not need to trust the server is a long term goal, not something that exists.",
      ],
    },
    {
      t: "cta",
      h2: "Check it with your own eyes",
      text: "On [[t:the test network]][[m:Solana mainnet]], every room, payment and payout is a public transaction.",
      primary: { label: "Go to the play page", to: "play" },
      secondary: { label: "Security and fairness", to: "security" },
    },
  ],
};

export const token: Page = {
  title: "The $GOSHI token",
  description: "What the $GOSHI token is used for in Goshi games, [[t:its current status as a test token on Solana devnet, ]]and the risks. No promises, no price and no investment advice.",
  eyebrow: "Token",
  h1: "$GOSHI[[t:, today a test token]]",
  lead: "$GOSHI is the token of Goshi games: it unlocks free saboteur seats and receives the super pot. Entry fees are paid in SOL. [[t:Today there is only a test version, on a test network. It has no value.]][[m:It is a real asset on Solana mainnet: read the risks before you use it.]]",
  blocks: [
    {
      t: "notice",
      tone: "risk",
      title: "Read this first",
      list: [
        "[[t:The $GOSHI that exists today is a test token on the Solana devnet. It has no value and cannot be exchanged for money.]][[m:$GOSHI is a real asset on Solana mainnet. It can lose all of its value, and you can lose what you spend on entry fees (in SOL) and anything you hold in it.]]",
        "[[t:A $GOSHI token on Solana mainnet does not exist today. Nothing on this website offers, sells or distributes one.]][[m:Nothing on this website sells $GOSHI or promises it any value. TODO(owner): add here how the token was created, its supply and where it can be obtained.]]",
        "We do not publish, and will not publish, a price, a yield, a return or a forecast. Nobody should expect any.",
        "[[t:If a mainnet token is ever created, you could lose all of its value. It may be unavailable where you live, and it may be treated as a restricted asset.]][[m:You could lose all of its value. It may be unavailable where you live, and it may be treated as a restricted asset.]]",
        "This is not financial, investment, legal or tax advice.",
      ],
    },
    {
      t: "cards",
      id: "use",
      h2: "What the token is for",
      cols: 3,
      items: [
        { icon: "coin", title: "Saboteur seats", text: "A wallet that holds the minimum $GOSHI can take a free saboteur seat. The tokens stay in the wallet and nothing is taken from them." },
        { icon: "spark", title: "The super pot", text: "The super pot accumulates in $GOSHI and is paid to a first place only on a jackpot event. See [How it works](@how)." },
        { icon: "scale", title: "Burn and swaps", text: "Part of every house share is swapped from SOL to $GOSHI. Part of it is burned and the rest goes to the super pot. The shares are on [How it works](@how)." },
      ],
    },
    {
      t: "table",
      id: "status",
      h2: "Where each thing stands",
      head: ["Thing", "Status"],
      rows: [
        ["[[t:Test token on Solana devnet]][[m:$GOSHI token on Solana mainnet]]", "[[t:Exists. Used by the contract and the play page for testing saboteur seats]][[m:Exists. Used by the contract and the play page for saboteur seats and the super pot]]"],
        ["[[t:Contract on devnet]][[m:Contract on mainnet]]", "Deployed. [[n:Not audited by an external firm]][[y:Audited. TODO(owner): link the report]]"],
        ["[[t:Token on Solana mainnet]][[m:Value of the token]]", "[[t:Does not exist. No date and no plan to announce one]][[m:Not guaranteed, not promised and not published]]"],
        ["Any sale, listing or distribution", "[[t:None. Nothing here offers one]][[m:Nothing on this website offers one]]"],
      ],
    },
    {
      t: "prose",
      id: "before",
      h2: "[[t:What must be true before a mainnet token could exist]][[m:What is still being worked on]]",
      paras: ["[[t:All of these, together:]][[m:Items that are not finished are marked as such.]]"],
      list: [
        "An independent security audit of the contract and the server[[n: (not done yet)]]",
        "A legal opinion for each country where it would be offered",
        "Published rules for age, eligibility and restricted regions",
        "A public repository under Apache 2.0",
        "A support and security reporting process ready",
      ],
      panel: true,
    },
    {
      t: "notice",
      tone: "risk",
      title: "Risk notice",
      paras: [
        "Digital assets can lose value quickly or completely. They may be hard to sell or impossible to use, laws about them differ by country and change, and taxes may apply to prizes.",
        "Reading this page gives you no right to any token or prize. See also the [risks page](@risks) and the [terms](@terms).",
      ],
    },
    {
      t: "cta",
      h2: "See what [[t:a test token]][[m:the token]] does",
      text: "Use the play page[[t: on the test network]], or read the exact split of every payment.",
      primary: { label: "Go to the play page", to: "play" },
      secondary: { label: "How it works", to: "how" },
    },
  ],
};

export const security: Page = {
  title: "Security and fairness",
  description: "How Goshi keeps matches fair and money safe, and where it cannot: the authoritative server, the unaudited contract, how to verify transactions on the explorer and the limits of anti-cheat.",
  eyebrow: "Security",
  h1: "Security and fairness, with the limits",
  lead: "We would rather tell you what is not protected than hide it. This page lists what is in place, what is missing and how to check things yourself.",
  blocks: [
    {
      t: "cards",
      id: "design",
      h2: "How the design protects you",
      cols: 2,
      items: [
        { icon: "server", title: "The server runs the match", text: "Your browser only sends steering. Speed, bodies, eating, the zone and the ranking are computed on the server, so a modified browser cannot grant itself mass or speed." },
        { icon: "lock", title: "The contract holds the money", text: "Entry fees sit in a vault owned by the room. Nobody, including the platform, can move them except through the rules of the contract." },
        { icon: "scale", title: "Exact splits", text: "The split uses whole numbers and gives the remainder to the last share, so the parts always add up to the pot. The same math is in this website, with the contract's test cases." },
        { icon: "shield", title: "Winners are checked", text: "The contract only pays three different wallets that are players of that room." },
      ],
    },
    {
      t: "notice",
      id: "limits",
      tone: "risk",
      title: "What is not protected today",
      list: [
        "**The contract [[n:has not been audited by an external firm]][[y:was audited by an external firm. TODO(owner): link the report]].**[[t: It runs on a test network.]][[n: An independent audit is planned before anything else.]]",
        "**The server is trusted.** It decides the ranking and signs the payout. If it is wrong, hacked or dishonest, the contract will pay what it is told.",
        "**The platform key is a single point of failure.** Whoever holds it can open rooms, choose the winners of a room and cancel rooms. How the key is stored is part of the legal and security review.",
        "**Anti-cheat has limits.** The server limits input rates and computes everything itself, but it cannot stop one person from using several wallets, teams that cooperate, or automated players. [[t:Test bots exist on the test network, and they are flagged as bots.]]",
        "**Wallet safety is yours.** We never ask for your seed phrase or private key. Anyone who does is a scam.",
      ],
    },
    {
      t: "steps",
      id: "verify",
      h2: "How to verify a transaction",
      intro: "Every payment and payout is a public transaction. You do not have to take our word for it.",
      items: [
        { title: "Open the link", text: "The play page shows a link to the Solana Explorer next to each transaction, and in the result of a match. [[t:The link carries the network (devnet) in its address.]]" },
        { title: "Check the program", text: "On the transaction page, the program that ran should be the Goshi escrow program. Its address is in the settings of this site and in the repository when it is public." },
        { title: "Check the amounts", text: "Compare the token transfers with the split on [How it works](@how). For a room of known size, you can compute the exact amounts with the calculator there." },
        { title: "Check the network", text: "[[t:If the explorer is not set to devnet, you are looking at a different network and will not find a test transaction.]][[m:Make sure the explorer is on Solana mainnet. On another network you will not find the transaction.]]" },
      ],
    },
    {
      t: "prose",
      id: "disclosure",
      h2: "Reporting a security problem",
      paras: [
        "Please do not post a security problem in public. Send the details to {securityEmail} with steps to reproduce. Real findings get credit and, when funds allow, a reward. Please do not test with other people's wallets or try to move funds that are not yours.",
        "TODO(owner): the response time, the scope and a safe harbor statement are to be confirmed with the lawyer and published here.",
      ],
    },
    {
      t: "cta",
      h2: "Help us find what we missed",
      text: "Readers who check the math and the code are the best audit we have until a professional one is done.",
      primary: { label: "Community and open source", to: "opensource" },
      secondary: { label: "The risks", to: "risks" },
    },
  ],
};

export const risks: Page = {
  title: "Risks",
  description: "The financial, technical and legal risks of playing Goshi games: [[t:test environment, ]][[n:unaudited contract, ]]trusted server, eligibility and region limits pending, and taxes.",
  eyebrow: "Risks",
  h1: "Risks, in plain words",
  lead: "Read this before you connect a wallet. It is not legal or financial advice.",
  blocks: [
    {
      t: "notice",
      tone: "risk",
      title: "The short version",
      list: [
        "[[t:This is a test. The tokens have no value, and the network is a test network.]][[m:This uses real funds on Solana mainnet. Payments and payouts are final.]]",
        "[[t:If a version with real tokens ever exists, you could lose everything you put in. ]][[m:You could lose everything you put in. ]]A room has no guaranteed result: only the top three are paid.",
        "Nobody should expect to earn money here. Do not play with money you cannot afford to lose.",
      ],
    },
    {
      t: "cards",
      id: "kinds",
      h2: "The kinds of risk",
      cols: 2,
      items: [
        { icon: "coin", title: "Financial", text: "Entry fees can be lost. Prizes are not guaranteed. A token can lose all its value, be hard to sell or impossible to use." },
        { icon: "flask", title: "[[t:Test environment]][[m:Real funds]]", text: "[[t:Everything runs on a Solana test network. It can be reset, and the test tokens have no value.]][[m:Entry fees and payments use real tokens on Solana mainnet and cannot be undone.]]" },
        { icon: "code", title: "Smart contract", text: "[[n:The contract is unaudited.]][[y:The contract was audited, which does not remove every risk.]] A bug could lock or lose funds. Contracts on a blockchain cannot be undone." },
        { icon: "server", title: "Trusted server", text: "Results come from the game server, which also signs the payout. It could be wrong, be attacked or be dishonest." },
        { icon: "lock", title: "Wallet", text: "You hold your own keys. If you lose them or share them, nobody can recover your funds." },
        { icon: "scale", title: "Legal and tax", text: "Rules about games with entry fees, prizes and digital assets differ by country and change. Taxes may apply to prizes." },
      ],
    },
    {
      t: "table",
      id: "eligibility",
      h2: "Who may take part",
      head: ["Question", "Status"],
      rows: [
        ["Minimum age", "Adults only: 18 or the age of majority where you live."],
        ["Countries and regions", "Goshi does not block countries. By taking part you confirm, on your own responsibility, that accessing blockchain games does not break the laws of your jurisdiction."],
        ["Identity checks", "None today. Whether they are needed (KYC and anti-money-laundering) is pending legal review."],
        ["Games of skill", "The games are designed to be skill based. How each country classifies them is pending legal review."],
      ],
      note: "[[t:Until the review is finished, treat the play page as a technical test only.]][[m:Do not use the play page if you are a minor or you are in a restricted region.]]",
    },
    {
      t: "cta",
      h2: "Still curious?",
      text: "The terms and the privacy policy are drafts for the lawyer. The security page lists what is and is not protected.",
      primary: { label: "Security and fairness", to: "security" },
      secondary: { label: "Terms", to: "terms" },
    },
  ],
};

export const faq: Page = {
  title: "Frequently asked questions",
  description: "Short answers about Goshi in four steps: Enter, Play, Win and Leave. What it is, whether it is real money, how winners are decided, what you have to trust.",
  eyebrow: "FAQ",
  h1: "Enter. Play. Win. Leave.",
  lead: "Short, honest answers in the order of the loop. If something is missing, ask us.",
  blocks: [
    {
      t: "faq",
      h2: "Enter",
      items: [
        { q: "What is Goshi?", a: ["An open source project for short skill games played in rooms on Solana. You pick an entry, play a real-time match, and the top three players are paid by a smart contract."] },
        { q: "Is it real money?", a: ["[[t:Not today. Everything runs on a Solana test network with test tokens that have no value. A mainnet version does not exist, and any decision about one depends on an audit and a legal review.]][[m:Yes. Games on mainnet use real funds, and you can lose your entry.]]"] },
        { q: "Can I try it for free?", a: ["Yes. Free practice needs no wallet and no money: a 3 minute match against bots, with no prizes."] },
        { q: "What do I need for a quick match?", a: ["[[t:A Solana wallet such as Phantom or Solflare, set to devnet, some free devnet SOL for the entry and the network fee. The play page and the [local test guide](@contribute) explain how.]][[m:A Solana wallet such as Phantom or Solflare, and some SOL for the entry and the network fee. The play page explains how.]]"] },
        { q: "Who can play?", a: ["Adults, where it is allowed. The exact age and the list of restricted regions are pending legal review. Does it work on a phone? Yes, it is a website."] },
      ],
    },
    {
      t: "faq",
      h2: "Play",
      items: [
        { q: "Are the games skill based?", a: ["They are designed to be. In Orb Rush your decisions decide the ranking, with one element of chance: where new orbs appear. How the law classifies this is part of the legal review."] },
        { q: "What are saboteurs?", a: ["Up to 3 free seats per room for wallets that hold the minimum $GOSHI. They are obstacles for the paid players. Saboteurs do not compete and cannot win: they share 2% of the pot equally, paid in SOL."] },
        { q: "What if the room does not fill?", a: ["After 5 minutes with 2 to 9 paid players, a VS match can be offered. Every paid player has to accept. If a room cannot be played, every entry is refunded by the contract."] },
      ],
    },
    {
      t: "faq",
      h2: "Win",
      items: [
        { q: "Can I earn money?", a: ["We do not promise earnings, and nobody should expect any. In a room, only three players are paid prizes and the others lose their entry.[[t: On the test network nothing has value.]]"] },
        { q: "Who decides the winners?", a: ["The game server. The contract cannot see the match, so it pays the three winners that the platform's key sends. This is the biggest trust assumption today. See [Security](@security)."] },
        { q: "What does the contract do?", a: ["It holds entries in a vault, checks that the winners are different players of the room, splits the pot in one transaction and refunds everyone if a room is cancelled."] },
        { q: "What is the super pot?", a: ["A pot in $GOSHI that accumulates from the house share. It is paid to a first place only on a jackpot event: after a full match of 10 paid players there is a 1% chance, drawn from the secret the server committed to and the block where the room filled, which anybody can recompute from the proof of the match. The team makes the payment by hand."] },
        { q: "Can I check a payout myself?", a: ["Yes. Every payout is a public transaction, and the play page links to it on the Solana Explorer. [Security](@security) explains what to check."] },
        { q: "Has it been audited?", a: ["[[n:No. An independent audit is planned and not done.]][[y:Yes. TODO(owner): link the audit report.]][[t: The contract runs on a test network.]]"] },
      ],
    },
    {
      t: "faq",
      h2: "Leave",
      items: [
        { q: "How do I stop?", a: ["Close the page or press Leave on the result card, which disconnects your wallet. Nothing keeps you in a room afterwards."] },
        { q: "Can I limit what I spend?", a: ["Yes. The play page counts what you spent in this session and lets you set a limit of 0.05, 0.1 or 0.25 SOL. When it is reached, quick matches stop until you change it."] },
        { q: "Do you ever ask for my seed phrase?", a: ["Never. Your wallet signs each payment and a login message. Anyone who asks for your seed phrase or private key is a scam."] },
        { q: "Is the code public, and can I propose a game?", a: ["The code is meant to be public: the repository link is not published yet, see the [community page](@opensource). The proposal process is planned and not live yet; until then you can write to us from the [contact page](@support)."] },
      ],
    },
    {
      t: "cta",
      h2: "Not answered here?",
      text: "Write to us. We read everything.",
      primary: { label: "Contact", to: "support" },
      secondary: { label: "How it works", to: "how" },
    },
  ],
};

export const opensource: Page = {
  title: "Community and open source",
  description: "Goshi is community driven and open source: where the code will live, how to contribute, how ideas are planned to become games, and honest governance status.",
  eyebrow: "Community",
  h1: "Built in the open, shaped by the people who play",
  lead: "Goshi is an open source, community driven project. This page says what is real today and what is still planned.",
  blocks: [
    { t: "component", name: "github" },
    {
      t: "cards",
      id: "public",
      h2: "What is public",
      cols: 2,
      items: [
        { icon: "code", title: "The contract", text: "The Solana program that holds entry fees and pays the winners, with its tests.", status: "live", href: "https://github.com/GoshiApp/goshi-escrow" },
        { icon: "server", title: "The game server", text: "The code that runs matches and settles rooms. Secrets such as keys stay private.", status: "live", href: "https://github.com/GoshiApp/goshi-escrow" },
        { icon: "globe", title: "This website", text: "Including the math that mirrors the contract and the page copy in both languages.", status: "live", href: "https://github.com/GoshiApp/goshi-web" },
        { icon: "book", title: "The rules and proposals", text: "How each game works, and the proposals for new ones: the community ideas board is open.", status: "live", href: "/en/ideas/" },
      ],
    },
    {
      t: "notice",
      tone: "info",
      title: "Apache 2.0 license",
      paras: ["The whole repository (program, server and website) is published under the Apache 2.0 license. The Goshi name and logo are not licensed for use as your own."],
    },
    {
      t: "notice",
      tone: "info",
      title: "Open source work we learned from",
      paras: ["The look of the arena (glowing bodies, soft pellets, a nitro bar, a mini map) was inspired by two MIT licensed open source games, slither-vs-bots and slither-clone-sio. Our arena code is written for this project. Their names, links and license texts are in THIRD_PARTY_NOTICES.md at the root of the repository."],
    },
    {
      t: "phases",
      id: "ideas",
      h2: "How an idea becomes a game",
      intro: "Proposing and voting are live. The later steps are planned and are described so that you can judge them.",
      gateLabel: "Status",
      items: [
        { name: "A public proposal", status: "live", text: "On the [ideas board](@ideas): a name, how it plays and why skill decides it, with up to three screenshots or sketches. You need $GOSHI in your wallet to propose." },
        { name: "Votes", status: "live", text: "Everyone with $GOSHI votes good or bad. The most voted ideas go first, with a filter by status." },
        { name: "Review", status: "planned", text: "The maintainers study the top ideas and mark their status: studying, planned, building or live.", gate: "The decision to build is still the maintainers'." },
        { name: "A prototype on devnet", status: "planned", text: "A chosen idea is built and tested on devnet first." },
        { name: "Audit and legal check", status: "planned", text: "Before real tokens are involved: a security audit of the contract and server, and a legal check of the game." },
      ],
    },
    {
      t: "notice",
      tone: "care",
      title: "Governance is planned, not live",
      paras: [
        "Today the project is run by its maintainers, who decide what is built. There is no token vote, no treasury controlled by holders and no decentralized governance. If that changes, we will say so here first.",
      ],
    },
    {
      t: "cards",
      id: "ways",
      h2: "Ways to get involved now",
      cols: 3,
      items: [
        { icon: "eye", title: "Read and question", text: "Check the math and the rules on [How it works](@how) and tell us what looks wrong." },
        { icon: "flask", title: "Test on devnet", text: "Follow the [contribution guide](@contribute) and report what breaks." },
        { icon: "shield", title: "Report security issues", text: "Use the process on [Security](@security)." },
      ],
    },
    { t: "component", name: "contact" },
  ],
};

export const contribute: Page = {
  title: "Contributing",
  description: "Guidelines for contributing to Goshi: how to propose a game, the rules every game must follow, how to run the project locally on devnet, pull request rules and security disclosure.",
  eyebrow: "Contribute",
  h1: "Contributor guidelines",
  lead: "A short guide for people who want to help. The repository is not public yet, so some steps will move to GitHub when it is.",
  blocks: [
    {
      t: "notice",
      tone: "info",
      title: "Status",
      paras: ["The public repository is under the Apache 2.0 license and is not published yet. Until then, write to us from the [contact page](@support)."],
    },
    {
      t: "split",
      id: "rules",
      h2: "Rules every game must follow",
      yes: {
        h: "A game must be",
        list: [
          "Skill based, with results that come from what players do",
          "Short, a few minutes, for rooms of paid players and saboteurs",
          "Decided by the server in a way that can be explained and tested",
          "Fair to new players, with no advantage that can be bought inside a match",
          "Readable: the rules are written down in plain words",
        ],
      },
      no: {
        h: "A game must not",
        list: [
          "Depend on chance for the ranking, or hide odds",
          "Let anyone pay for an advantage that changes a result",
          "Rely on the browser to decide anything that matters",
          "Ask for private keys, seed phrases or personal data",
          "Target or be marketed to minors",
        ],
      },
    },
    {
      t: "steps",
      id: "propose",
      h2: "How to propose a game",
      items: [
        { title: "Describe it", text: "In a few paragraphs: the idea, how a match works, how long it lasts, how the ranking is computed and why it is skill based." },
        { title: "Name the risks", text: "What could be exploited, how bots or several wallets could cheat, and what the server must check." },
        { title: "Say how to test it", text: "On devnet, with how many players and what you would measure." },
      ],
    },
    {
      t: "prose",
      id: "local",
      h2: "Run it locally on devnet",
      paras: [
        "You need Node.js 22 or newer, a Solana wallet set to devnet and free devnet SOL. The website and the game server are two separate projects.",
        "The website: `npm install`, then `npm run play:local-config` and `npm run dev:play`. The game server: `npm install` and `npm run dev` in its folder. The full walkthrough, with the wallet steps, is in the repository file `docs/play-local.md`.",
      ],
    },
    {
      t: "prose",
      id: "pr",
      h2: "Pull requests",
      paras: ["Please keep changes small and focused, and run the checks before you open one."],
      list: [
        "`npm run verify` must pass: types, tests, the build and the quality gates",
        "Both languages, English and Spanish, must be changed together and keep the same structure",
        "No em dashes, and no promises of earnings, returns or prices anywhere in the copy",
        "If you change the money math, update the test vectors and explain why",
        "Accessibility counts: keyboard use, contrast and reduced motion",
      ],
    },
    {
      t: "notice",
      tone: "risk",
      title: "Security problems",
      paras: ["Do not report a security problem in a public issue. Follow [Security](@security)."],
    },
  ],
};

export const roadmap: Page = {
  title: "Roadmap and changelog",
  description: "What Goshi has done and what comes next, with honest status labels: live, in design, planned and pending review. No dates are promised.",
  eyebrow: "Roadmap",
  h1: "Roadmap and changelog",
  lead: "Phases have gates, not dates. Each item says exactly where it stands.",
  blocks: [
    {
      t: "phases",
      id: "phases",
      h2: "The phases",
      gateLabel: "Gate",
      items: [
        { name: "Contract and first game", status: "live", text: "The escrow contract and Orb Rush run on Solana mainnet (real SOL, small entries) and on devnet (free practice, no real money).", gate: "Working end to end, and every match checkable by anyone." },
        { name: "Public repository and license", status: "live", text: "The contract, the game server and the website are public under Apache 2.0 at github.com/GoshiApp.", gate: "A clean repository, with no keys." },
        { name: "Security audit", status: "planned", text: "An internal review is done and its fixes are being applied. An independent external audit of the contract and the server is still pending: until then the contract is NOT externally audited.", gate: "Findings fixed and published." },
        { name: "Legal review", status: "pending", text: "Age, regions, how games with entry fees are classified, token disclosures, terms and privacy.", gate: "A written opinion for each country where it would open." },
        { name: "More ways to connect on phones", status: "idea", text: "Today a phone connects by opening the page inside the wallet's own browser. WalletConnect or the Solana Mobile Wallet Adapter could let other wallets connect, if they can be added without making the page heavy.", gate: "A light implementation and a security review." },
        { name: "Community process", status: "planned", text: "The ideas board is open: anyone can propose a game and vote. A documented process to choose and build them is still to be written.", gate: "A process that exists, documented and tested." },
        { name: "More games", status: "idea", text: "New games from community proposals, tested on devnet first.", gate: "Passing the rules every game must follow." },
        { name: "Mainnet", status: "live", text: "Soft launch: entries from $0.5 to $5, real funds, not externally audited. Play only what you can afford to lose. Higher limits depend on the audit and the legal review.", gate: "Audit and legal review decide any increase of the limits." },
      ],
    },
    {
      t: "table",
      id: "changelog",
      h2: "Changelog",
      head: ["Date", "Change"],
      rows: [
        ["2026-10", "The escrow contract is deployed and initialized on Solana devnet."],
        ["2026-10", "Orb Rush and the authoritative game server run in local testing."],
        ["2026-10", "This website, with the play page that connects a wallet on devnet."],
        ["2026-10", "Contract v3 on devnet: 88% prizes for the top three paid players, a 2% saboteur pool, pass seats between tiers, VS mode and the super pot. The arena is a battle royale of solid bodies."],
        ["2026-10", "Mainnet soft launch (contract v5): the key that opens and settles rooms is separate from the key that holds the vault and can replace it, and anyone can refund a room that is 3 hours old and unsettled."],
        ["2026-10", "Public match history, replays from every player's point of view, video export and a verification page for every match."],
      ],
      note: "Dates are the month a change was made, not a promise about the future.",
    },
    {
      t: "cta",
      h2: "Follow along",
      text: "When the repository is public, this page will link to the releases.",
      primary: { label: "Community", to: "opensource" },
      secondary: { label: "Security and fairness", to: "security" },
    },
  ],
};

export const support: Page = {
  title: "Contact",
  description: "How to reach Goshi: general questions, privacy requests and security reports.",
  eyebrow: "Contact",
  h1: "Write to us",
  lead: "We read everything. Please never send a seed phrase, a private key or a password.",
  blocks: [
    { t: "component", name: "contact" },
    {
      t: "notice",
      tone: "info",
      title: "Before you write",
      list: [
        "Questions about how a room or a payout works: read [How it works](@how) first.",
        "A transaction problem: include the transaction link from the explorer, and the network (devnet).",
        "A security problem: write only to the security address, and please do not post it in public.",
      ],
    },
  ],
};
