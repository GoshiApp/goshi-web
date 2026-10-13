import type { Home } from "../types";

export const home: Home = {
  title: "Goshi: juegos de habilidad de código abierto en Solana",
  description:
    "Goshi es un hogar comunitario y de código abierto para juegos de habilidad en Solana. Entra a una sala, juega una partida corta en tiempo real y los tres mejores jugadores cobran de un contrato inteligente. [[t:En pruebas en una red de pruebas.]]",
  meet: {
    h2: "Conoce al goshi",
    lines: [
      "Un goshi es una criatura redonda y diminuta con dos ojos enormes y un poco de rubor.",
      "Cada jugador es uno. Le crece la cola cada vez que come.",
      "Come, esquiva las colas de los demás y quédate dentro del círculo seguro.",
    ],
    alt: "Un goshi: una criatura dorada y redonda con dos ojos grandes, mejillas rosas, una sonrisa pequeña y una cola enroscada.",
  },
  hero: {
    eyebrow: "Código abierto · Solana · Juegos de habilidad",
    h1: "Entra. Juega. Gana. Sal.",
    sub: "Partidas cortas de habilidad en Solana. Elige una entrada, juega unos cinco minutos contra otros jugadores y los tres mejores reciben los premios, pagados por un contrato inteligente. Sigue jugando solo si te gustó. [[t:Hoy funciona en una red de pruebas con SOL de prueba que no tiene valor.]][[m:Funciona en Solana mainnet con fondos reales.]]",
    practice: "Jugar gratis ahora",
    quickH: "Partida rápida",
    quickAbout: "unos {sol} {unit}",
    quickLoading: "...",
    quickNote: "[[t:En la red de pruebas es SOL de prueba, sin valor real.]][[m:La entrada se paga en SOL desde tu propia billetera.]]",
    quickAria: "Partida rápida con una entrada de {usd}",
    primary: "Ir a la página de juego",
    secondary: "Ver cómo funciona",
    trust: ["[[t:Red de pruebas hoy]][[m:Fondos reales]]", "Código abierto", "De habilidad"],
    illustrationAlt: "Una ilustración de Orb Rush: un jugador con un cuerpo sólido, otro cuerpo, orbes pequeñas y el círculo de la zona segura sobre un tablero oscuro.",
    example: "Ilustración. El primer juego, Orb Rush, está activo[[t: en la red de pruebas devnet de Solana]].",
    f1: { label: "Sala", text: "Entra la cuota, el pozo lo guarda el contrato" },
    f2: { label: "Partida", text: "5 minutos, la corre el servidor de juego" },
    f3: { label: "Top 3", text: "Cobran en la cadena, del pozo" },
  },
  blocks: [
    {
      t: "steps",
      id: "match",
      h2: "Entra. Juega. Gana. Sal.",
      intro: "Todos los juegos de Goshi siguen el mismo ciclo corto. Sigue jugando solo si te gustó.",
      items: [
        { title: "Entra", text: "Elige una entrada desde unos $1 y toma un puesto en una sala, o prueba antes una partida de práctica gratis. La entrada va a la cuenta de la sala, que solo el contrato puede mover. Una sala tiene 10 puestos de pago y hasta 3 puestos gratuitos de saboteador." },
        { title: "Juega", text: "Cuando la sala se llena empieza una partida de unos cinco minutos. El servidor de juego la ejecuta y tu navegador la dibuja. Tu habilidad decide la clasificación." },
        { title: "Gana", text: "Los tres mejores reciben premios del contrato en una sola transacción, con una pequeña comisión para el proyecto y una quema. Puedes comprobarlo en el explorador de Solana. La mayoría de los jugadores no estará en el podio, y eso es parte del juego." },
        { title: "Sal", text: "Desconéctate y listo. Nada te retiene en una sala y puedes poner un límite de gasto a tu sesión. No hay una racha que pierdas ni ataduras." },
      ],
    },
    { t: "component", name: "gamesHub" },
    {
      t: "notice",
      id: "status",
      tone: "info",
      title: "Cómo está todo hoy",
      list: [
        "[[t:El contrato está desplegado en la red de pruebas devnet de Solana. ]][[m:El contrato está desplegado en Solana mainnet. ]][[n:No ha sido auditado por una empresa externa.]]",
        "[[t:Los tokens que se usan en la prueba no tienen valor. Hoy no existe un token $GOSHI en mainnet.]][[m:Los juegos usan fondos reales. $GOSHI es el token de los juegos: lee la [página del token](@token).]]",
        "Los resultados vienen de un servidor de juego con autoridad que además firma el pago. Eso es una suposición de confianza, y la explicamos completa en [Cómo funciona](@how) y en [Seguridad](@security).",
        "Quién puede participar (edad, países y regiones) sigue en revisión legal.",
      ],
    },
    {
      t: "split",
      id: "open",
      h2: "Por qué código abierto",
      intro: "Las reglas del dinero deben poder leerse y los juegos deben moldearlos quienes los juegan.",
      yes: {
        h: "Lo que te da el código abierto",
        list: [
          "El contrato, el servidor de juego y este sitio web están pensados para ser públicos, de modo que cualquiera pueda leer cómo funcionan el reparto y la partida.",
          "Cualquiera puede comprobar que los números del sitio coinciden con la matemática del contrato.",
          "Cualquiera puede avisar de un problema o proponer un cambio.",
        ],
      },
      no: {
        h: "Lo que no significa",
        list: [
          "No es una promesa de que los juegos sean seguros. El contrato no está auditado y el servidor es de confianza.",
          "No es una promesa de ningún resultado, ingreso ni rendimiento.",
          "El repositorio todavía no es público: mira la [página de la comunidad](@opensource).",
        ],
      },
    },
    {
      t: "cards",
      id: "community",
      h2: "Un proyecto comunitario",
      intro: "Goshi está pensado para que lo guíen quienes lo usan. Esto es lo que está planificado y lo que todavía no está activo.",
      cols: 3,
      items: [
        { icon: "github", title: "Repositorio público", text: "El programa, el servidor de juego y este sitio están en GitHub con licencia Apache 2.0, para que todos los lean y los mejoren.", status: "live", href: "https://github.com/GoshiApp" },
        { icon: "vote", title: "Propuestas y votos", text: "Propón un juego con capturas y vota las ideas de los demás. Las más votadas van primero. Abierto a billeteras que tengan $GOSHI.", status: "live", href: "/es/ideas/" },
        { icon: "shield", title: "Reportes de seguridad", text: "¿Encontraste un problema? Escribe a support@goshi.app. Respondemos, corregimos y damos crédito a los hallazgos reales.", status: "live", href: "/es/seguridad/" },
      ],
    },
    {
      t: "cta",
      h2: "Míralo con tus propios ojos",
      text: "[[t:La página de juego conecta tu billetera en una red de pruebas. No interviene dinero real.]][[m:La página de juego conecta tu billetera. Usa fondos reales: lee primero los riesgos.]]",
      primary: { label: "Ir a la página de juego", to: "play" },
      secondary: { label: "Lee primero los riesgos", to: "risks" },
    },
  ],
};
