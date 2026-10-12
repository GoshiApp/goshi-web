import type { Copy } from "../types";
import { ui, calc, orb } from "./ui";
import { home } from "./home";
import { games, how, token, security, risks, faq, opensource, contribute, roadmap, support } from "./pages";
import { privacy, terms } from "./legal";
import { play, playPage } from "./play";

export const es: Copy = {
  ui,
  play,
  calc,
  orb,
  home,
  pages: { games, how, play: playPage, token, security, risks, faq, opensource, contribute, roadmap, support, privacy, terms },
  contact: {
    h2: "Escríbenos",
    support: "Preguntas y comentarios",
    privacy: "Privacidad y tus datos",
    security: "Avisos de seguridad",
    note: "Lo leemos todo. Nunca envíes una frase semilla ni una clave privada.",
  },
  github: {
    h2: "El código",
    text: "El contrato, el servidor de juego y este sitio web están pensados para ser públicos en GitHub, de modo que cualquiera pueda leerlos y mejorarlos.",
    notYet: "La organización de GitHub todavía no es pública. TODO(owner): añadir el enlace en src/site.ts. Se anunciará aquí cuando lo sea.",
    button: "Abrir la organización de GitHub",
  },
};
