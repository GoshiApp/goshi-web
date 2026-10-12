import type { Copy } from "../types";
import { ui, calc, orb } from "./ui";
import { home } from "./home";
import { games, how, token, security, risks, faq, opensource, contribute, roadmap, support } from "./pages";
import { privacy, terms } from "./legal";
import { play, playPage } from "./play";

export const en: Copy = {
  ui,
  play,
  calc,
  orb,
  home,
  pages: { games, how, play: playPage, token, security, risks, faq, opensource, contribute, roadmap, support, privacy, terms },
  contact: {
    h2: "Write to us",
    support: "Questions and feedback",
    privacy: "Privacy and your data",
    security: "Security reports",
    note: "We read everything. Never send a seed phrase or a private key.",
  },
  github: {
    h2: "The code",
    text: "The contract, the game server and this website are meant to be public on GitHub, so anyone can read and improve them.",
    notYet: "The GitHub organization is not public yet. TODO(owner): add the link in src/site.ts. It will be announced here when it is.",
    button: "Open the GitHub organization",
  },
};
