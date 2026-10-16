// The texts of the lab site (lab.goshi.app). Only the lab build uses them.
import type { Lang } from "../lib/i18n";

export interface LabCopy {
  brand: string; band: string; title: string; description: string; h1: string; lead: string;
  statusLabel: Record<"testing" | "soon" | "stable", string>;
  experiments: { key: string; name: string; status: "testing" | "soon" | "stable"; text: string; try: string; href?: string }[];
  feedback: string; feedbackLink: string; links: { main: string; test: string; matches: string; play: string };
  playH1: string; playLead: string;
  elsewhereTitle: string; elsewhereText: string; elsewhereLink: string;
}

export const lab: Record<Lang, LabCopy> = {
  en: {
    brand: "Goshi Lab",
    band: "Lab: experiments that may break. Test funds only, never real money.",
    title: "Goshi Lab",
    description: "Where new Goshi game modes are tried before they reach the test site.",
    h1: "The lab",
    lead: "New game modes are tried here first, with test funds and a server of their own. What works moves to the test site, and from there to the real game.",
    statusLabel: { testing: "Testing", soon: "Coming next", stable: "Moved to test" },
    experiments: [
      { key: "survival", name: "Survival", status: "testing", text: "One continuous arena: no countdown, no final, and the zone never closes. You grow as long as you can, bots keep coming back, and the camera opens up as you get bigger.", try: "How to try it: on the Play page, pick Mode: Survival and press Play. Choose the bots level too: on Super hard they try to surround you, and a ring you close around them tightens as you spiral in. Tell us if the map size and the pace feel right." },
      { key: "sound", name: "Sound and music", status: "stable", text: "Eat streaks that climb a scale, boom on kills, a loop with a melody that gets busier as players drop.", try: "Already on the test site.", href: "test" },
      { key: "bots", name: "Bot levels", status: "stable", text: "Easy, medium, hard and super hard bots in practice matches.", try: "Already on the test site.", href: "test" },
      { key: "tv", name: "TV mode", status: "stable", text: "Every past match played one after another, with speed, pause and jumps.", try: "Open the match history and press Watch all in a row.", href: "matches" },
    ],
    feedback: "Tell us what you think: every comment shapes what gets built.",
    feedbackLink: "Open the ideas board",
    links: { main: "Goshi (real game)", test: "Test site", matches: "Matches", play: "Play" },
    playH1: "Try an experiment",
    playLead: "Pick a mode and play against bots, free and without a wallet. This server is only for experiments and may restart at any time.",
    elsewhereTitle: "This page lives on the main site",
    elsewhereText: "The lab only has experiments. The rest of Goshi is on goshi.app.",
    elsewhereLink: "Go to goshi.app",
  },
  es: {
    brand: "Goshi Lab",
    band: "Laboratorio: experimentos que pueden fallar. Solo fondos de prueba, nunca dinero real.",
    title: "Goshi Lab",
    description: "Donde se prueban los nuevos modos de juego de Goshi antes de llegar al sitio de pruebas.",
    h1: "El laboratorio",
    lead: "Los nuevos modos se prueban aquí primero, con fondos de prueba y un servidor propio. Lo que funciona pasa al sitio de pruebas, y de ahí al juego real.",
    statusLabel: { testing: "En pruebas", soon: "Próximamente", stable: "Ya en test" },
    experiments: [
      { key: "survival", name: "Supervivencia", status: "testing", text: "Una arena continua: sin cuenta atrás ni final, y la zona nunca se cierra. Creces todo lo que puedas, los bots vuelven a aparecer y la cámara se abre a medida que creces.", try: "Cómo probarlo: en la página de Jugar, elige Modo: Supervivencia y pulsa Jugar. Elige también el nivel de los bots: en Súper difícil intentan rodearte, y el anillo que cierres a su alrededor se aprieta si giras hacia dentro. Cuéntanos si el tamaño del mapa y el ritmo te parecen bien." },
      { key: "sound", name: "Sonido y música", status: "stable", text: "Rachas al comer que suben una escala, golpe grave al eliminar, y un loop con melodía que se intensifica al quedar pocos.", try: "Ya está en el sitio de pruebas.", href: "test" },
      { key: "bots", name: "Niveles de bots", status: "stable", text: "Bots fáciles, medios, difíciles y súper difíciles en las partidas de práctica.", try: "Ya está en el sitio de pruebas.", href: "test" },
      { key: "tv", name: "Modo TV", status: "stable", text: "Todas las partidas ya jugadas una tras otra, con velocidad, pausa y saltos.", try: "Abre el historial y pulsa Ver todas seguidas.", href: "matches" },
    ],
    feedback: "Cuéntanos qué te parece: cada comentario decide qué se construye.",
    feedbackLink: "Abrir el tablero de ideas",
    links: { main: "Goshi (juego real)", test: "Sitio de pruebas", matches: "Partidas", play: "Jugar" },
    playH1: "Prueba un experimento",
    playLead: "Elige un modo y juega contra bots, gratis y sin billetera. Este servidor es solo para experimentos y puede reiniciarse en cualquier momento.",
    elsewhereTitle: "Esta página está en el sitio principal",
    elsewhereText: "El laboratorio solo tiene experimentos. El resto de Goshi está en goshi.app.",
    elsewhereLink: "Ir a goshi.app",
  },
};
