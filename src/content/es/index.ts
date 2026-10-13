import type { Copy } from "../types";
import { ui, calc, orb } from "./ui";
import { home } from "./home";
import { games, how, token, security, risks, faq, opensource, contribute, roadmap, support } from "./pages";
import { privacy, terms } from "./legal";
import { play, playPage } from "./play";
import { ideasCopy, ideasPage, verifyCopy, verifyPage, replayCopy, replayPage, matchesCopy, matchesPage, inviteCopy, invitePage, profilePage } from "./ideas";

export const es: Copy = {
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
    h2: "Escríbenos",
    support: "Preguntas y comentarios",
    privacy: "Privacidad y tus datos",
    security: "Avisos de seguridad",
    note: "Lo leemos todo. Nunca envíes una frase semilla ni una clave privada.",
  },
  github: {
    h2: "El código",
    text: "El contrato, el servidor de juego y este sitio son públicos en GitHub con licencia Apache 2.0, para que cualquiera los lea y los mejore.",
    notYet: "La organización de GitHub es github.com/GoshiApp.",
    button: "Abrir la organización de GitHub",
  },
};
