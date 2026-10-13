import type { Copy } from "../types";
import { ui, calc, orb } from "./ui";
import { home } from "./home";
import { games, how, token, security, risks, faq, opensource, contribute, roadmap, support } from "./pages";
import { privacy, terms } from "./legal";
import { play, playPage } from "./play";
import { ideasCopy, ideasPage, verifyCopy, verifyPage, replayCopy, replayPage, matchesCopy, matchesPage, inviteCopy, invitePage, profilePage } from "./ideas";

export const en: Copy = {
  ui,
  play,
  calc,
  orb,
  home,
  pages: { games, ideas: ideasPage, verify: verifyPage, replay: replayPage, matches: matchesPage, invite: invitePage, profile: profilePage, how, play: playPage, token, security, risks, faq, opensource, contribute, roadmap, support, privacy, terms },
  ideas: ideasCopy,
  verify: verifyCopy,
  replay: replayCopy,
  matches: matchesCopy,
  invite: inviteCopy,
  contact: {
    h2: "Write to us",
    support: "Questions and feedback",
    privacy: "Privacy and your data",
    security: "Security reports",
    note: "We read everything. Never send a seed phrase or a private key.",
  },
  github: {
    h2: "The code",
    text: "The contract, the game server and this website are public on GitHub under Apache 2.0, so anyone can read and improve them.",
    notYet: "The GitHub organization is github.com/GoshiApp.",
    button: "Open the GitHub organization",
  },
};
