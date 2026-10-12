import type { Home } from "../types";

export const home: Home = {
  title: "Goshi: open source skill games on Solana",
  description:
    "Goshi is a community driven, open source home for skill games on Solana. Join a room, play a short real-time match, and the top three players are paid by a smart contract. [[t:Currently in testing on a test network.]]",
  meet: {
    h2: "Meet the goshi",
    lines: [
      "A goshi is a tiny round creature with two big eyes and a little blush.",
      "Every player is one. It grows a longer tail each time it eats.",
      "Eat, steer clear of other tails and stay inside the safe circle.",
    ],
    alt: "A goshi: a round gold creature with two big eyes, pink cheeks, a small smile and a curled tail.",
  },
  hero: {
    eyebrow: "Open source · Solana · Skill games",
    h1: "Enter. Play. Win. Leave.",
    sub: "Short skill matches on Solana. Pick an entry, play about five minutes against other players, and the top three get the prizes, paid by a smart contract. Keep playing only if you liked it. [[t:Today it runs on a test network with test SOL that has no value.]][[m:It runs on Solana mainnet with real funds.]]",
    practice: "Play free now",
    quickH: "Quick match",
    quickAbout: "about {sol} {unit}",
    quickLoading: "...",
    quickNote: "[[t:On the test network these are test SOL, with no real value.]][[m:The entry is paid in SOL from your own wallet.]]",
    quickAria: "Quick match with an entry of {usd}",
    primary: "Go to the play page",
    secondary: "See how it works",
    trust: ["[[t:Test network today]][[m:Real funds]]", "Open source", "Skill based"],
    illustrationAlt: "An illustration of Orb Rush: a player with a solid body, another body, small orbs and the safe zone circle on a dark board.",
    example: "Illustration. The first game, Orb Rush, is live[[t: on the Solana devnet test network]].",
    f1: { label: "Room", text: "Entry fee in, pot held by the contract" },
    f2: { label: "Match", text: "5 minutes, run by the game server" },
    f3: { label: "Top 3", text: "Paid on-chain from the pot" },
  },
  blocks: [
    {
      t: "steps",
      id: "match",
      h2: "Enter. Play. Win. Leave.",
      intro: "Every game on Goshi follows the same short loop. Keep playing only if you liked it.",
      items: [
        { title: "Enter", text: "Pick an entry from about $1 and take a seat in a room, or try a free practice match first. The entry goes into the room account, which only the contract can move. A room has 10 paid seats, plus up to 3 free saboteur seats." },
        { title: "Play", text: "When the room is full, a match of about five minutes starts. The game server runs it and your browser draws it. Your skill decides the ranking." },
        { title: "Win", text: "The top three are paid prizes by the contract in one transaction, with a small fee for the project and a burn. You can check it on the Solana explorer. Most players will not be on the podium, and that is part of the game." },
        { title: "Leave", text: "Disconnect and go. Nothing keeps you in a room, and you can set a spending limit for your session. There is no streak you lose and no lock-in." },
      ],
    },
    {
      t: "cards",
      id: "games",
      h2: "The games",
      intro: "One game exists today. The rest are ideas that the community can shape.",
      cols: 3,
      items: [
        { icon: "orb", title: "Orb Rush", text: "A 5 minute battle royale of solid bodies. Eat orbs to grow, avoid other bodies and stay inside the shrinking safe zone.", status: "devnet" },
        { icon: "spark", title: "Next games", text: "Short skill games for rooms of paid players and saboteurs. Nothing is promised or scheduled.", status: "design" },
        { icon: "users", title: "Ideas from the community", text: "Anyone will be able to propose a game. The process is planned, and not live yet.", status: "idea" },
      ],
    },
    {
      t: "notice",
      id: "status",
      tone: "info",
      title: "Where things stand today",
      list: [
        "[[t:The contract is deployed on the Solana devnet test network. ]][[m:The contract is deployed on Solana mainnet. ]][[n:It has not been audited by an external firm.]]",
        "[[t:The tokens used in the test have no value. A $GOSHI token on mainnet does not exist today.]][[m:Games use real funds. $GOSHI is the token of the games: read the [token page](@token).]]",
        "Results come from an authoritative game server that also signs the payout. That is a trust assumption, and we explain it in full on [How it works](@how) and [Security](@security).",
        "Who may take part (age, countries and regions) is still under legal review.",
      ],
    },
    {
      t: "split",
      id: "open",
      h2: "Why open source",
      intro: "Money rules should be readable by anyone, and games should be shaped by the people who play them.",
      yes: {
        h: "What open source gives you",
        list: [
          "The contract, the game server and this website are meant to be public, so anyone can read how the split and the match work.",
          "Anyone can check that the numbers on the site match the contract's math.",
          "Anyone can report a problem or propose a change.",
        ],
      },
      no: {
        h: "What it does not mean",
        list: [
          "It is not a promise that the games are safe. The contract is unaudited and the server is trusted.",
          "It is not a promise of any result, income or return.",
          "The repository is not public yet: see the [community page](@opensource).",
        ],
      },
    },
    {
      t: "cards",
      id: "community",
      h2: "A community project",
      intro: "Goshi is meant to be steered by the people who use it. Here is what is planned, and what is not live yet.",
      cols: 3,
      items: [
        { icon: "github", title: "Public repository", text: "The code is meant to live on GitHub for everyone to read and improve.", status: "pending" },
        { icon: "vote", title: "Proposals and votes", text: "Ideas as public proposals, discussed and voted on by the community. This is a planned process.", status: "planned" },
        { icon: "shield", title: "Security reports", text: "A clear way to report problems, with credit for real findings.", status: "planned" },
      ],
    },
    {
      t: "cta",
      h2: "See it for yourself",
      text: "[[t:The play page connects your wallet on a test network. No real money is involved.]][[m:The play page connects your wallet. It uses real funds: read the risks first.]]",
      primary: { label: "Go to the play page", to: "play" },
      secondary: { label: "Read the risks first", to: "risks" },
    },
  ],
};
