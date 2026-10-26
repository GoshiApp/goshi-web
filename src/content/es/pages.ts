import type { Page } from "../types";

export const games: Page = {
  title: "Juegos",
  description: "Orb Rush, el primer juego de Goshi: una batalla real de cuerpos sólidos y una zona segura que se reduce, y una hoja de ruta honesta de lo que viene.",
  eyebrow: "Juegos",
  h1: "Un juego hoy, más por venir",
  lead: "Goshi es un hogar para juegos de habilidad cortos que se juegan en salas. Orb Rush es el primero: una batalla real para hasta 10 jugadores de pago y 3 saboteadores, que funciona en [[t:una red de pruebas]][[m:Solana mainnet]]. Los demás todavía no existen.",
  blocks: [
    {
      t: "prose",
      id: "orb-rush",
      eyebrow: "Activo[[t: en devnet]]",
      h2: "Orb Rush",
      paras: [
        "Cada jugador es una cabeza con un cuerpo sólido que sigue su camino. Come orbes para crecer y pesar más. Si tu cabeza toca el cuerpo de otro jugador, te eliminan de inmediato, sea grande o pequeño. Cabeza contra cabeza, sobrevive el más pesado y el más ligero queda eliminado. La zona segura se reduce, así que tienes que ir hacia el centro. Una partida dura 5 minutos y ganan los últimos en pie.",
        "La partida se simula solo en el servidor de juego. Tu navegador envía hacia dónde quieres ir y dibuja lo que el servidor le devuelve. Nada de lo que diga el navegador puede cambiar la partida.",
      ],
      component: "orb",
    },
    {
      t: "table",
      id: "rules",
      h2: "Las reglas, exactas",
      intro: "Estas son las reglas que corre hoy el servidor. Pueden cambiar[[t: mientras el juego esté en pruebas]].",
      head: ["Regla", "Valor"],
      rows: [
        ["Arena", "3000 por 3000, con el borde como pared mortal"],
        ["Partida", "5 minutos, 20 ticks por segundo"],
        ["Zona segura", "Un círculo de radio 1450 hasta el minuto 2. Luego se mueve en cinco fases a radios de 1050, 720, 460, 290 y 150. Cada círculo siguiente es aleatorio y queda dentro del anterior, así que el centro de la arena no es seguro al final. Cada fase anuncia el siguiente círculo, se mueve hacia él y se mantiene. Fuera del círculo pierdes (masa por 0,10 más 3) por (1 más 0,3 por (fase menos 1)) de masa por segundo, y mueres por debajo de masa 5"],
        ["Inicio", "Masa 20. Velocidad 135 dividido por (1 más la masa dividida por 600). Giro de 270 grados por segundo, algo menos cuanto más pesas. Nadie puede morir en los primeros 8 segundos"],
        ["Impulso", "1,7 veces más rápido, cuesta el 1,5% de tu masa por segundo, nunca por debajo de masa 12"],
        ["Cuerpo", "Un segmento por cada 3 de masa, de 6 a 150. El radio del cuerpo es 8 más 1,9 por la raíz cuadrada de la masa[[t:; pasada la masa 200 crece más despacio, para que un gigante no tape el mapa]]"],
        ["Tocar", "Una cabeza que toca el cuerpo de otro jugador muere de inmediato, salvo que pese al menos tres veces más: entonces le da un mordisco a ese cuerpo. Cabeza contra cabeza: muere la más ligera, y si pesan igual mueren las dos. Tu propio cuerpo es inofensivo.[[t: En la arena de pago de la red de prueba nadie es inmune: toda cabeza que toca un cuerpo muere.]]"],
        ["Morir", "Toda tu masa se convierte en orbes a lo largo de tu camino (como máximo 80 orbes)"],
        ["Orbes", "Las orbes son puntos: dan su valor como masa y no valen dinero. Se mantienen 600 orbes en el mapa. Cada 30 segundos cae dentro de la zona un racimo de 6 orbes de valor 4. Solo se dibuja una moneda SOL cuando de verdad lleva SOL[[t: (las monedas de una sala pagada por bolsa y de la arena de pago)]]; el resto es una orbe brillante simple"],
        ["Salas de pago", "[[m:Las salas de pago de goshi.app usan las reglas versión 3: sin jefe, sin poderes y sin fusión de monedas. Todo lo del dinero está en la fila Podio.]][[t:Las salas de pago de la red de prueba usan las reglas más nuevas: el jefe, los poderes pagados con la bolsa, la fusión de monedas, y con tres vivos la zona se detiene 10 segundos y los tres últimos conservan su bolsa.]]"],
        ["Práctica gratis", "Usa las reglas más nuevas en todas partes, sin dinero: el jefe (el cuerpo más pesado cuando pesa al menos el doble que el siguiente; cada 30 segundos su cola queda expuesta 4 segundos y se puede morder), el kamikaze (tecla 3), el escudo del jefe (tecla 4) y cobrar (tecla 5: 5 segundos a media velocidad y sales). Las monedas que quedan fuera de la zona se fusionan y saltan adentro, y el mapa tiene menos monedas a medida que la zona se cierra. Con tres vivos la zona se detiene 10 segundos"],
        ["Clasificación", "Primero los jugadores vivos al final por masa y luego los eliminados por el momento de la eliminación (más tarde es mejor). Los empates los gana la dirección de billetera menor"],
        ["Podio", "[[t:No hay premio fijo por puesto: cada jugador de PAGO cobra las monedas de su bolsa (el 97% del pozo se acuña en monedas). Las monedas que nadie tiene al final se reparten por igual entre los tres primeros jugadores de pago]][[m:Los tres primeros jugadores de PAGO de la clasificación (los saboteadores no compiten). Los premios son el 60%, el 25% y el 15% del premio total, que es el 88% del pozo]]"],
      ],
      note: "Las posiciones donde aparecen las orbes son al azar. Todo lo demás depende de lo que hagan los jugadores. Si los juegos cuentan como de habilidad es parte de la revisión legal: mira [Riesgos](@risks).",
    },
    {
      t: "phases",
      id: "roadmap",
      h2: "Lo que viene",
      intro: "Una lista honesta. Nada de aquí está programado y nada está prometido. Las etiquetas dicen exactamente en qué punto está cada cosa.",
      gateLabel: "Antes de abrir",
      items: [
        { name: "Orb Rush royale", status: "devnet", text: "[[t:Se puede jugar en la red de pruebas devnet de Solana con SOL de prueba.]][[m:Se puede jugar en Solana mainnet con SOL real.]]", gate: "[[t:Una auditoría del contrato, una revisión legal y una decisión sobre un token en mainnet.]][[m:Una auditoría externa y una revisión legal al día.]]" },
        { name: "Modo VS", status: "devnet", text: "Si una sala no se llena en 5 minutos, de 2 a 9 jugadores de pago pueden jugar una partida de todos contra todos. Todos los jugadores de pago deben aceptar.", gate: "Probado primero en devnet." },
        { name: "Espectadores y repeticiones", status: "live", text: "Ver una partida de nuevo desde el punto de vista de cada jugador, exportarla en video y verificarla contra el resultado registrado.", gate: "Cada partida queda registrada y se puede comprobar." },
        { name: "Un segundo juego", status: "idea", text: "Otro juego de habilidad corto para salas con jugadores de pago y saboteadores. El tipo de juego está abierto a que lo proponga la comunidad.", gate: "Una propuesta pública y un prototipo." },
      ],
    },
    {
      t: "notice",
      tone: "info",
      title: "Cómo se eligen los juegos",
      paras: [
        "Los juegos deben ser de habilidad y jugables en pocos minutos. Cualquiera podrá proponer uno con el proceso comunitario descrito en la [página de la comunidad](@opensource). Ese proceso está planificado y todavía no está activo.",
      ],
    },
    {
      t: "cta",
      h2: "Prueba Orb Rush[[t: en la red de pruebas]]",
      text: "[[t:Necesitas una billetera de Solana en devnet. Nada de lo que uses allí tiene valor.]][[m:Necesitas una billetera de Solana con algo de SOL para la entrada y para las comisiones de red. Usas fondos reales.]]",
      primary: { label: "Ir a la página de juego", to: "play" },
      secondary: { label: "Cómo funciona una sala", to: "how" },
    },
  ],
};

export const how: Page = {
  title: "Cómo funciona",
  description: "[[t:Salas, entradas en SOL, saboteadores, el pozo pagado por bolsa, el reparto de la comisión del 3%, el Super Pozo, el modo VS, qué pasa en la cadena y en el servidor de juego, y en qué tienes que confiar hoy.]][[m:Salas, entradas en SOL, saboteadores, los premios 60/25/15, el reparto de la comisión del 10%, el Super Pozo, el modo VS, qué pasa en la cadena y en el servidor de juego, y en qué tienes que confiar hoy.]]",
  eyebrow: "Cómo funciona",
  h1: "Salas, premios y quién hace qué",
  lead: "Una explicación corta y completa del dinero y de la confianza. Lee la última sección antes de jugar.",
  blocks: [
    {
      t: "steps",
      id: "room",
      h2: "Entra. Juega. Gana. Sal.",
      intro: "El ciclo en cuatro pasos. Después viene el detalle de la sala.",
      items: [
        { title: "Entra: se abre una sala para ti", text: "La partida rápida pide a la plataforma la sala en espera más llena con tu entrada, o una nueva. Una sala tiene una entrada en SOL, hasta 10 puestos de pago y hasta 3 puestos gratis de saboteador. Solo la plataforma puede abrir salas." },
        { title: "Entra: tomas un puesto", text: "Un puesto de pago envía la entrada desde tu billetera a la cuenta de la sala, que solo el contrato puede mover. Un puesto de saboteador es gratis si tu billetera tiene el mínimo de $GOSHI (no se te quita nada). Cada billetera puede tomar un puesto por sala." },
        { title: "Juega: se llenan los 10 puestos de pago y empieza la partida", text: "Cuando entra el décimo jugador de pago, la sala pasa a activa y el servidor de juego inicia una batalla real de 5 minutos. Si la sala no se llena, se puede ofrecer el modo VS." },
        { title: "Gana o no: el contrato paga a los tres mejores", text: "El servidor envía el podio al contrato, que reparte todo el pozo en una sola transacción y cierra la sala. Solo cobran tres jugadores." },
        { title: "Sal: eso es todo", text: "Cierra la página o desconecta tu billetera. Nada te retiene en la sala después, y en la página de juego puedes poner un límite de gasto a la sesión." },
      ],
    },
    {
      t: "table",
      id: "split",
      h2: "A dónde va el pozo",
      intro: "El pozo es la suma de las entradas de los jugadores de pago. Las mismas partes se aplican a todas las salas. Están escritas en el contrato.",
      head: ["Parte", "Porcentaje", "A dónde va"],
      rows: [
        ["Primer lugar", "[[t:Su bolsa, más un tercio de las monedas que nadie tiene]][[m:60% del premio total (52,8% del pozo)]]", "El mejor jugador de pago clasificado, en SOL"],
        ["Segundo lugar", "[[t:Su bolsa, más un tercio de las monedas que nadie tiene]][[m:25% del premio total (22% del pozo)]]", "El segundo jugador de pago, en SOL"],
        ["Tercer lugar", "[[t:Su bolsa, más un tercio de las monedas que nadie tiene]][[m:15% del premio total, el resto (13,2% del pozo)]]", "El tercer jugador de pago, en SOL"],
        ["Saboteadores", "2% del pozo, a partes iguales", "Los saboteadores sentados, en SOL. No compiten"],
        ["Casa: recompra y quema", "[[t:10% de la parte de la casa (0,3% del pozo)]][[m:10% de la parte de la casa (1% del pozo)]]", "Se cambia por $GOSHI y se destruye"],
        ["Casa: infraestructura", "[[t:15% de la parte de la casa (0,45% del pozo)]][[m:15% de la parte de la casa (1,5% del pozo)]]", "Servidores, monitoreo y soporte, en SOL"],
        ["Casa: liquidez y comunidad", "[[t:25% de la parte de la casa (0,75% del pozo)]][[m:25% de la parte de la casa (2,5% del pozo)]]", "Una billetera de liquidez y comunidad, en SOL. No se promete ninguna cotización ni negociación"],
        ["Casa: Super Pozo", "[[t:50% de la parte de la casa, el resto (1,5% del pozo)]][[m:50% de la parte de la casa, el resto (5% del pozo)]]", "Se cambia por $GOSHI y se suma al Super Pozo acumulado"],
      ],
      note: "[[t:El 97% del pozo se acuña en monedas y la casa se queda con el 3%. Cada jugador de pago cobra las monedas de su bolsa; las que nadie tiene al final se reparten por igual entre los tres primeros jugadores de pago. Cada lamport del 97% termina en manos de un jugador. Una sala empieza solo cuando tiene 10 jugadores de pago y sus 3 saboteadores. Cuando una parte no se divide exacto se redondea hacia abajo y lo que sobra va al resto, así que las partes siempre suman el pozo exacto.]][[m:El 88% del pozo es el premio total, el 2% va a los saboteadores y la casa se queda con el 10%. Así, el primer lugar recibe el 52,8% del pozo, el segundo el 22% y el tercero el 13,2%. Una sala empieza solo cuando tiene 10 jugadores de pago y sus 3 saboteadores. Cuando una parte no se divide exacto se redondea hacia abajo y lo que sobra va al resto, así que las partes siempre suman el pozo exacto.]]",
    },
    {
      t: "split",
      id: "saboteurs",
      h2: "Saboteadores",
      intro: "Tres saboteadores comparten la arena con los 10 jugadores de pago. Son obstáculos. No pagan, no compiten y no pueden ganar.",
      yes: {
        h: "Lo que recibe un saboteador",
        list: [
          "Un puesto gratis, si la billetera tiene el mínimo de $GOSHI. Los tokens se quedan en la billetera",
          "Una parte igual del 2% del pozo, pagada en SOL por el contrato, sea cual sea su clasificación",
          "Ninguna pérdida: no hay entrada que pagar",
        ],
      },
      no: {
        h: "Lo que no recibe",
        list: [
          "Un puesto en el podio: los saboteadores no se clasifican con los jugadores de pago",
          "Un premio del premio total: eso es solo para los tres mejores jugadores de pago",
          "El Super Pozo: un saboteador no puede ser el primer lugar",
          "Un jugador de pago nunca cobra menos por culpa de un saboteador",
        ],
      },
    },
    {
      t: "prose",
      id: "superpot",
      h2: "El Super Pozo",
      paras: [
        "El Super Pozo se acumula en $GOSHI: la mitad de cada parte de la casa. Se paga al primer lugar solo en un evento de jackpot.",
        "Tras una partida completa de 10 jugadores de pago hay un 1% de probabilidad, sacado del secreto al que el servidor se comprometió antes de que entrara nadie y del bloque en que se llenó la sala, así que cualquiera puede recalcularlo con la prueba de la partida. Si se activa, todo el Super Pozo se paga al primer lugar (siempre un jugador de pago: los saboteadores no pueden ganar). El pago lo hace el equipo desde la bóveda.",
        "**Suposición de confianza, dicha claro:** la tirada la hace el servidor de juego. No se puede verificar en la cadena. Tienes que confiar en el servidor para ella.",
      ],
      panel: true,
    },
    {
      t: "prose",
      id: "vs",
      h2: "Modo VS",
      paras: [
        "Si una sala espera 5 minutos sin llegar a 10 jugadores de pago y tiene de 2 a 9, el servidor ofrece una partida VS a los jugadores de pago. Todos los jugadores de pago deben aceptar. En el modo VS no hay saboteadores.",
        "[[t:La comisión del 3% se toma de cada entrada. Todos menos el ganador conservan el 80% de su entrada neta y el ganador se lleva el resto (el 120% de la entrada neta cuando son dos jugadores).]][[m:La comisión del 10% se toma de cada entrada. Todos menos el ganador conservan el 80% de su entrada neta y el ganador se lleva el resto (el 120% de la entrada neta cuando son dos jugadores).]]",
      ],
    },
    { t: "component", name: "calc" },
    {
      t: "table",
      id: "who",
      h2: "Qué pasa en cada lugar",
      head: ["Dónde", "Qué hace"],
      rows: [
        ["El contrato (en la cadena)", "Guarda las entradas en la cuenta de la sala, hace cumplir el reparto, comprueba que las billeteras del podio son jugadoras de la sala y distintas, cierra la sala y, si una sala no se puede jugar, devuelve todas las entradas. Cualquiera puede leerlo y comprobar sus transacciones."],
        ["El servidor de juego", "Abre salas, corre la partida, decide la clasificación, calcula el sorteo del Super Pozo y envía el podio al contrato. Firma con una clave que solo tiene la plataforma. Esa clave abre y liquida salas pero no puede cambiar las billeteras de la casa ni vaciar la bóveda: eso es de una clave guardiana aparte. También hace el cambio de SOL a $GOSHI cuando esa fase está activada."],
        ["Tu navegador", "Muestra las salas, pide a tu billetera que firme tus propias transacciones, envía tu dirección de movimiento y dibuja la partida. Nunca decide nada."],
        ["Tu billetera", "Guarda tus claves. Nosotros nunca las vemos. Tú apruebas cada pago."],
      ],
    },
    {
      t: "notice",
      id: "trust",
      tone: "risk",
      title: "En qué tienes que confiar hoy",
      list: [
        "**El servidor de juego decide quién gana.** El contrato no puede ver la partida. Confía en el podio que le envía la clave de la plataforma. El servidor podría equivocarse o ser gestionado de forma deshonesta.",
        "**El sorteo del Super Pozo se puede comprobar, su pago se hace a mano.** El evento del 1% sale del secreto comprometido y del bloque de la partida, y la prueba de cada partida permite recalcularlo. El pago lo hace el equipo desde la bóveda.",
        "**La clave de la plataforma controla la sala.** Puede abrir salas, enviar el podio y cancelar una sala para devolver las entradas. No puede tomar los fondos de tu billetera, pero elige a quién paga el contrato dentro de una sala.",
        "**El contrato [[t:está en una red de pruebas y ]][[n:no ha sido auditado por una empresa externa.]][[y:fue auditado por una empresa externa. TODO(owner): enlazar el informe.]]**[[n: Una auditoría independiente está planificada y no está hecha.]]",
        "**No hay apelación.** Un pago en la cadena es definitivo.",
        "Describimos estos límites con más detalle en [Seguridad e imparcialidad](@security). Pasar la partida a un diseño que no necesite confiar en el servidor es una meta a largo plazo, no algo que exista.",
      ],
    },
    {
      t: "cta",
      h2: "Compruébalo con tus propios ojos",
      text: "En [[t:la red de pruebas]][[m:Solana mainnet]], cada sala, pago y premio es una transacción pública.",
      primary: { label: "Ir a la página de juego", to: "play" },
      secondary: { label: "Seguridad e imparcialidad", to: "security" },
    },
  ],
};

export const token: Page = {
  title: "El token $GOSHI",
  description: "Para qué se usa el token $GOSHI en los juegos de Goshi, [[t:su estado actual como token de prueba en Solana devnet y ]]los riesgos. Sin promesas, sin precio y sin asesoría de inversión.",
  eyebrow: "Token",
  h1: "$GOSHI[[t:, hoy un token de prueba]]",
  lead: "$GOSHI es el token de los juegos de Goshi: da acceso a puestos gratis de saboteador y recibe el Super Pozo. Las entradas se pagan en SOL. [[t:Hoy solo existe una versión de prueba, en una red de pruebas. No tiene valor.]][[m:Es un activo real en Solana mainnet: lee los riesgos antes de usarlo.]]",
  blocks: [
    {
      t: "notice",
      tone: "risk",
      title: "Lee esto primero",
      list: [
        "[[t:El $GOSHI que existe hoy es un token de prueba en la devnet de Solana. No tiene valor y no se puede cambiar por dinero.]][[m:$GOSHI es un activo real en Solana mainnet. Puede perder todo su valor y puedes perder lo que gastes en entradas (en SOL) y lo que tengas en él.]]",
        "[[t:Hoy no existe un token $GOSHI en la mainnet de Solana. Nada de este sitio web ofrece, vende ni distribuye uno.]][[m:Nada de este sitio web vende $GOSHI ni le promete ningún valor. TODO(owner): añadir aquí cómo se creó el token, su suministro y dónde se puede obtener.]]",
        "No publicamos, ni publicaremos, un precio, un rendimiento, un retorno ni un pronóstico. Nadie debería esperar ninguno.",
        "[[t:Si algún día se crea un token en mainnet, podrías perder todo su valor, puede no estar disponible donde vives y puede tratarse como un activo restringido.]][[m:Podrías perder todo su valor, puede no estar disponible donde vives y puede tratarse como un activo restringido.]]",
        "Esto no es asesoría financiera, de inversión, legal ni fiscal.",
      ],
    },
    {
      t: "cards",
      id: "use",
      h2: "Para qué sirve el token",
      cols: 3,
      items: [
        { icon: "coin", title: "Puestos de saboteador", text: "Una billetera que tiene el mínimo de $GOSHI puede tomar un puesto gratis de saboteador. Los tokens se quedan en la billetera y no se les quita nada." },
        { icon: "spark", title: "El Super Pozo", text: "El Super Pozo se acumula en $GOSHI y se paga al primer lugar solo en un evento de jackpot. Mira [Cómo funciona](@how)." },
        { icon: "scale", title: "Quema y cambios", text: "Una parte de cada parte de la casa se cambia de SOL a $GOSHI. Una parte se quema y el resto va al Super Pozo. Los porcentajes están en [Cómo funciona](@how)." },
      ],
    },
    {
      t: "table",
      id: "status",
      h2: "En qué punto está cada cosa",
      head: ["Cosa", "Estado"],
      rows: [
        ["[[t:Token de prueba en Solana devnet]][[m:Token $GOSHI en Solana mainnet]]", "[[t:Existe. Lo usan el contrato y la página de juego para probar los puestos de saboteador]][[m:Existe. Lo usan el contrato y la página de juego para los puestos de saboteador y el Super Pozo]]"],
        ["[[t:Contrato en devnet]][[m:Contrato en mainnet]]", "Desplegado. [[n:No auditado por una empresa externa]][[y:Auditado. TODO(owner): enlazar el informe]]"],
        ["[[t:Token en Solana mainnet]][[m:Valor del token]]", "[[t:No existe. Sin fecha y sin plan que anunciar]][[m:No garantizado, no prometido y no publicado]]"],
        ["Cualquier venta, cotización o distribución", "[[t:Ninguna. Nada aquí la ofrece]][[m:Nada de este sitio web la ofrece]]"],
      ],
    },
    {
      t: "prose",
      id: "before",
      h2: "[[t:Qué debe cumplirse antes de que pueda existir un token en mainnet]][[m:Lo que todavía se está haciendo]]",
      paras: ["[[t:Todo esto, a la vez:]][[m:Lo que no está terminado se marca como tal.]]"],
      list: [
        "Una auditoría de seguridad independiente del contrato y del servidor[[n: (todavía no hecha)]]",
        "Una opinión legal para cada país donde se ofrecería",
        "Reglas publicadas de edad, elegibilidad y regiones restringidas",
        "Un repositorio público bajo Apache 2.0",
        "Un proceso de soporte y de reporte de seguridad listo",
      ],
      panel: true,
    },
    {
      t: "notice",
      tone: "risk",
      title: "Aviso de riesgo",
      paras: [
        "Los activos digitales pueden perder valor rápido o por completo. Pueden ser difíciles de vender o imposibles de usar, las leyes sobre ellos cambian según el país y con el tiempo, y pueden aplicarse impuestos a los premios.",
        "Leer esta página no te da ningún derecho a un token ni a un premio. Mira también la [página de riesgos](@risks) y los [términos](@terms).",
      ],
    },
    {
      t: "cta",
      h2: "Mira qué hace [[t:un token de prueba]][[m:el token]]",
      text: "Usa la página de juego[[t: en la red de pruebas]] o lee el reparto exacto de cada pago.",
      primary: { label: "Ir a la página de juego", to: "play" },
      secondary: { label: "Cómo funciona", to: "how" },
    },
  ],
};

export const security: Page = {
  title: "Seguridad e imparcialidad",
  description: "Cómo Goshi mantiene las partidas justas y el dinero seguro, y dónde no puede: el servidor con autoridad, el contrato sin auditar, cómo verificar transacciones en el explorador y los límites del antitrampas.",
  eyebrow: "Seguridad",
  h1: "Seguridad e imparcialidad, con sus límites",
  lead: "Preferimos decirte lo que no está protegido a esconderlo. Esta página lista lo que existe, lo que falta y cómo comprobarlo tú mismo.",
  blocks: [
    {
      t: "cards",
      id: "design",
      h2: "Cómo te protege el diseño",
      cols: 2,
      items: [
        { icon: "server", title: "El servidor corre la partida", text: "Tu navegador solo envía la dirección. La velocidad, los cuerpos, comer, la zona y la clasificación se calculan en el servidor, así que un navegador modificado no puede darse masa ni velocidad." },
        { icon: "lock", title: "El contrato guarda el dinero", text: "Las entradas están en una bóveda de la sala. Nadie, ni siquiera la plataforma, puede moverlas salvo por las reglas del contrato." },
        { icon: "scale", title: "Repartos exactos", text: "El reparto usa números enteros y da el resto a la última parte, así que las partes siempre suman el pozo. La misma matemática está en este sitio, con los casos de prueba del contrato." },
        { icon: "shield", title: "Se comprueba a los ganadores", text: "El contrato solo paga a tres billeteras distintas que sean jugadoras de esa sala." },
      ],
    },
    {
      t: "notice",
      id: "limits",
      tone: "risk",
      title: "Lo que hoy no está protegido",
      list: [
        "**El contrato [[n:no ha sido auditado por una empresa externa]][[y:fue auditado por una empresa externa. TODO(owner): enlazar el informe]].**[[t: Funciona en una red de pruebas.]][[n: Una auditoría independiente está planificada antes que cualquier otra cosa.]]",
        "**El servidor es de confianza.** Decide la clasificación y firma el pago. Si se equivoca, lo hackean o es deshonesto, el contrato pagará lo que se le diga.",
        "**La clave de la plataforma es un punto único de fallo.** Quien la tenga puede abrir salas, elegir los ganadores de una sala y cancelar salas. Cómo se guarda la clave es parte de la revisión legal y de seguridad.",
        "**El antitrampas tiene límites.** El servidor limita la frecuencia de las entradas y lo calcula todo él mismo, pero no puede impedir que una persona use varias billeteras, que haya equipos que cooperen ni jugadores automáticos.[[t: En la red de pruebas existen bots de prueba, y están marcados como bots.]]",
        "**La seguridad de tu billetera es tuya.** Nunca te pedimos tu frase semilla ni tu clave privada. Quien lo haga es una estafa.",
      ],
    },
    {
      t: "steps",
      id: "verify",
      h2: "Cómo verificar una transacción",
      intro: "Cada pago y cada premio es una transacción pública. No tienes que fiarte de nuestra palabra.",
      items: [
        { title: "Abre el enlace", text: "La página de juego muestra un enlace al Solana Explorer junto a cada transacción y en el resultado de una partida. [[t:El enlace lleva la red (devnet) en su dirección.]]" },
        { title: "Comprueba el programa", text: "En la página de la transacción, el programa que se ejecutó debe ser el programa de custodia de Goshi. Su dirección está en los ajustes de este sitio y en el repositorio cuando sea público." },
        { title: "Comprueba los montos", text: "Compara las transferencias de tokens con el reparto de [Cómo funciona](@how). Para una sala de tamaño conocido, puedes calcular los montos exactos con la calculadora de esa página." },
        { title: "Comprueba la red", text: "[[t:Si el explorador no está en devnet, estás mirando otra red y no encontrarás una transacción de prueba.]][[m:Asegúrate de que el explorador esté en Solana mainnet. En otra red no encontrarás la transacción.]]" },
      ],
    },
    {
      t: "prose",
      id: "disclosure",
      h2: "Avisar de un problema de seguridad",
      paras: [
        "Por favor no publiques un problema de seguridad. Envía los detalles a {securityEmail} con los pasos para reproducirlo. Los hallazgos reales reciben reconocimiento y, cuando los fondos lo permitan, una recompensa. Por favor no pruebes con billeteras ajenas ni intentes mover fondos que no son tuyos.",
        "TODO(owner): el plazo de respuesta, el alcance y una declaración de puerto seguro se confirmarán con el abogado y se publicarán aquí.",
      ],
    },
    {
      t: "cta",
      h2: "Ayúdanos a encontrar lo que se nos escapó",
      text: "Los lectores que comprueban la matemática y el código son la mejor auditoría que tenemos hasta que se haga una profesional.",
      primary: { label: "Comunidad y código abierto", to: "opensource" },
      secondary: { label: "Los riesgos", to: "risks" },
    },
  ],
};

export const risks: Page = {
  title: "Riesgos",
  description: "Los riesgos financieros, técnicos y legales de jugar a los juegos de Goshi: [[t:entorno de pruebas, ]][[n:contrato sin auditar, ]]servidor de confianza, elegibilidad y regiones pendientes e impuestos.",
  eyebrow: "Riesgos",
  h1: "Riesgos, en palabras claras",
  lead: "Lee esto antes de conectar una billetera. No es asesoría legal ni financiera.",
  blocks: [
    {
      t: "notice",
      tone: "risk",
      title: "La versión corta",
      list: [
        "[[t:Esto es una prueba. Los tokens no tienen valor y la red es una red de pruebas.]][[m:Esto usa fondos reales en Solana mainnet. Los pagos y los premios son definitivos.]]",
        "Si algún día existe una versión con tokens reales, podrías perder todo lo que pongas. Una sala no tiene resultado garantizado: solo cobran los tres primeros.",
        "Nadie debería esperar ganar dinero aquí. No juegues con dinero que no puedas permitirte perder.",
      ],
    },
    {
      t: "cards",
      id: "kinds",
      h2: "Los tipos de riesgo",
      cols: 2,
      items: [
        { icon: "coin", title: "Financiero", text: "Las entradas se pueden perder. Los premios no están garantizados. Un token puede perder todo su valor, ser difícil de vender o imposible de usar." },
        { icon: "flask", title: "[[t:Entorno de pruebas]][[m:Fondos reales]]", text: "[[t:Todo funciona en una red de pruebas de Solana. Puede reiniciarse y los tokens de prueba no tienen valor.]][[m:Las entradas y los pagos usan tokens reales en Solana mainnet y no se pueden deshacer.]]" },
        { icon: "code", title: "Contrato inteligente", text: "El contrato no está auditado. Un error podría bloquear o perder fondos. Los contratos en una cadena de bloques no se pueden deshacer." },
        { icon: "server", title: "Servidor de confianza", text: "Los resultados vienen del servidor de juego, que además firma el pago. Podría equivocarse, sufrir un ataque o ser deshonesto." },
        { icon: "lock", title: "Billetera", text: "Tú guardas tus propias claves. Si las pierdes o las compartes, nadie puede recuperar tus fondos." },
        { icon: "scale", title: "Legal y fiscal", text: "Las reglas sobre juegos con entrada, premios y activos digitales cambian según el país y con el tiempo. Pueden aplicarse impuestos a los premios." },
      ],
    },
    {
      t: "table",
      id: "eligibility",
      h2: "Quién puede participar",
      head: ["Pregunta", "Estado"],
      rows: [
        ["Edad mínima", "Solo mayores de 18 años (o la mayoría de edad legal de tu país)."],
        ["Países y regiones", "Goshi no bloquea países. Al participar confirmas, bajo tu propia responsabilidad, que el acceso a juegos en blockchain no viola las leyes de tu jurisdicción."],
        ["Verificación de identidad", "Ninguna hoy. Si hace falta (KYC y prevención de lavado de dinero) está pendiente de revisión legal."],
        ["Juegos de habilidad", "Los juegos están diseñados para ser de habilidad. Cómo los clasifica cada país está pendiente de revisión legal."],
      ],
      note: "[[t:Hasta que termine la revisión, trata la página de juego solo como una prueba técnica.]][[m:No uses la página de juego si eres menor o estás en una región restringida.]]",
    },
    {
      t: "cta",
      h2: "¿Sigues con curiosidad?",
      text: "Los términos y la política de privacidad son borradores para el abogado. La página de seguridad lista lo que está y lo que no está protegido.",
      primary: { label: "Seguridad e imparcialidad", to: "security" },
      secondary: { label: "Términos", to: "terms" },
    },
  ],
};

export const faq: Page = {
  title: "Preguntas frecuentes",
  description: "Respuestas cortas sobre Goshi en cuatro pasos: Entra, Juega, Gana y Sal. Qué es, si es dinero real, cómo se deciden los ganadores y en qué hay que confiar.",
  eyebrow: "Preguntas",
  h1: "Entra. Juega. Gana. Sal.",
  lead: "Respuestas cortas y honestas en el orden del ciclo. Si falta algo, pregúntanos.",
  blocks: [
    {
      t: "faq",
      h2: "Entra",
      items: [
        { q: "¿Qué es Goshi?", a: ["Un proyecto de código abierto de juegos de habilidad cortos que se juegan en salas en Solana. Eliges una entrada, juegas una partida en tiempo real y los tres mejores jugadores cobran de un contrato inteligente."] },
        { q: "¿Es dinero real?", a: ["[[t:Hoy no. Todo funciona en una red de pruebas de Solana con tokens de prueba que no tienen valor. No existe una versión en mainnet, y cualquier decisión sobre una depende de una auditoría y de una revisión legal.]][[m:Sí. Los juegos en mainnet usan fondos reales y puedes perder tu entrada.]]"] },
        { q: "¿Puedo probarlo gratis?", a: ["Sí. La práctica gratis no necesita billetera ni dinero: una partida de 3 minutos contra bots, sin premios."] },
        { q: "¿Qué necesito para una partida rápida?", a: ["[[t:Una billetera de Solana como Phantom o Solflare, en devnet, algo de SOL gratis de devnet para la entrada y la comisión de red. La página de juego y la [guía de pruebas locales](@contribute) explican cómo.]][[m:Una billetera de Solana como Phantom o Solflare, y algo de SOL para la entrada y la comisión de red. La página de juego explica cómo.]]"] },
        { q: "¿Quién puede jugar?", a: ["Adultos, donde esté permitido. La edad exacta y la lista de regiones restringidas están pendientes de revisión legal. ¿Funciona en el teléfono? Sí, es un sitio web."] },
      ],
    },
    {
      t: "faq",
      h2: "Juega",
      items: [
        { q: "¿Los juegos son de habilidad?", a: ["Están diseñados para serlo. En Orb Rush tus decisiones deciden la clasificación, con un elemento de azar: dónde aparecen las orbes nuevas. Cómo lo clasifica la ley es parte de la revisión legal."] },
        { q: "¿Qué son los saboteadores?", a: ["Hasta 3 puestos gratis por sala para billeteras que tienen el mínimo de $GOSHI. Son obstáculos para los jugadores de pago. Los saboteadores no compiten y no pueden ganar: se reparten el 2% del pozo por igual, pagado en SOL."] },
        { q: "¿Y si la sala no se llena?", a: ["Tras 5 minutos con 2 a 9 jugadores de pago se puede ofrecer una partida VS. Todos los jugadores de pago tienen que aceptar. Si una sala no se puede jugar, el contrato devuelve cada entrada."] },
      ],
    },
    {
      t: "faq",
      h2: "Gana",
      items: [
        { q: "¿Puedo ganar dinero?", a: ["No prometemos ganancias y nadie debería esperarlas. En una sala solo cobran premios tres jugadores y los demás pierden su entrada.[[t: En la red de pruebas nada tiene valor.]]"] },
        { q: "¿Quién decide los ganadores?", a: ["El servidor de juego. El contrato no puede ver la partida, así que paga a los tres ganadores que le envía la clave de la plataforma. Esta es la mayor suposición de confianza de hoy. Mira [Seguridad](@security)."] },
        { q: "¿Qué hace el contrato?", a: ["Guarda las entradas en una bóveda, comprueba que los ganadores son jugadores distintos de la sala, reparte el pozo en una sola transacción y devuelve todo si se cancela una sala."] },
        { q: "¿Qué es el Super Pozo?", a: ["Un pozo en $GOSHI que se acumula con la parte de la casa. Se paga al primer lugar solo en un evento de jackpot: tras una partida completa de 10 jugadores de pago hay un 1% de probabilidad, sacado del secreto al que el servidor se comprometió y del bloque en que se llenó la sala, que cualquiera puede recalcular con la prueba de la partida. El equipo hace el pago a mano."] },
        { q: "¿Puedo comprobar un premio yo mismo?", a: ["Sí. Cada premio es una transacción pública y la página de juego enlaza a ella en el Solana Explorer. [Seguridad](@security) explica qué comprobar."] },
        { q: "¿Está auditado?", a: ["[[n:No. Una auditoría independiente está planificada y no está hecha.]][[y:Sí. TODO(owner): enlazar el informe de la auditoría.]][[t: El contrato funciona en una red de pruebas.]]"] },
      ],
    },
    {
      t: "faq",
      h2: "Sal",
      items: [
        { q: "¿Cómo paro?", a: ["Cierra la página o pulsa Salir en la tarjeta de resultado, que desconecta tu billetera. Nada te retiene en una sala después."] },
        { q: "¿Puedo limitar lo que gasto?", a: ["Sí. La página de juego cuenta lo que gastaste en esta sesión y te deja poner un límite de 0,05, 0,1 o 0,25 SOL. Al llegar a él, las partidas rápidas se detienen hasta que lo cambies."] },
        { q: "¿Alguna vez piden mi frase semilla?", a: ["Nunca. Tu billetera firma cada pago y un mensaje de inicio de sesión. Quien te pida tu frase semilla o tu clave privada es una estafa."] },
        { q: "¿El código es público y puedo proponer un juego?", a: ["El código está pensado para ser público: el enlace del repositorio todavía no está publicado, mira la [página de la comunidad](@opensource). El proceso de propuestas está planificado y todavía no está activo; mientras tanto puedes escribirnos desde la [página de contacto](@support)."] },
      ],
    },
    {
      t: "cta",
      h2: "¿No está respondido aquí?",
      text: "Escríbenos. Lo leemos todo.",
      primary: { label: "Contacto", to: "support" },
      secondary: { label: "Cómo funciona", to: "how" },
    },
  ],
};

export const opensource: Page = {
  title: "Comunidad y código abierto",
  description: "Goshi es comunitario y de código abierto: dónde vivirá el código, cómo contribuir, cómo está planificado que las ideas se conviertan en juegos y el estado honesto del gobierno.",
  eyebrow: "Comunidad",
  h1: "Hecho a la vista de todos, moldeado por quienes juegan",
  lead: "Goshi es un proyecto comunitario y de código abierto. Esta página dice lo que es real hoy y lo que sigue planificado.",
  blocks: [
    { t: "component", name: "github" },
    {
      t: "cards",
      id: "public",
      h2: "Lo que es público",
      cols: 2,
      items: [
        { icon: "code", title: "El contrato", text: "El programa de Solana que guarda las entradas y paga a los ganadores, con sus pruebas.", status: "live", href: "https://github.com/GoshiApp/goshi-escrow" },
        { icon: "server", title: "El servidor de juego", text: "El código que corre las partidas y liquida las salas. Los secretos, como las claves, siguen siendo privados.", status: "live", href: "https://github.com/GoshiApp/goshi-escrow" },
        { icon: "globe", title: "Este sitio web", text: "Incluida la matemática que replica el contrato y los textos de la página en los dos idiomas.", status: "live", href: "https://github.com/GoshiApp/goshi-web" },
        { icon: "book", title: "Las reglas y las propuestas", text: "Cómo funciona cada juego y las propuestas de juegos nuevos: el tablero de ideas de la comunidad está abierto.", status: "live", href: "/es/ideas/" },
      ],
    },
    {
      t: "notice",
      tone: "info",
      title: "Licencia Apache 2.0",
      paras: ["Todo el repositorio (programa, servidor y sitio web) se publica bajo la licencia Apache 2.0. El nombre y el logotipo de Goshi no se licencian para usarlos como propios."],
    },
    {
      t: "notice",
      tone: "info",
      title: "Trabajo de código abierto del que aprendimos",
      paras: ["El aspecto de la arena (cuerpos brillantes, orbes suaves, una barra de nitro, un minimapa) se inspiró en dos juegos de código abierto con licencia MIT, slither-vs-bots y slither-clone-sio. El código de nuestra arena está escrito para este proyecto. Sus nombres, enlaces y textos de licencia están en THIRD_PARTY_NOTICES.md en la raíz del repositorio."],
    },
    {
      t: "phases",
      id: "ideas",
      h2: "Cómo una idea se convierte en juego",
      intro: "Proponer y votar ya funcionan. Los pasos siguientes están planificados y se describen para que puedas juzgarlos.",
      gateLabel: "Estado",
      items: [
        { name: "Una propuesta pública", status: "live", text: "En el [tablero de ideas](@ideas): un nombre, cómo se juega y por qué decide la habilidad, con hasta tres capturas o bocetos. Necesitas $GOSHI en tu billetera para proponer." },
        { name: "Votos", status: "live", text: "Quien tenga $GOSHI vota bien o mal. Las más votadas van primero, con un filtro por estado." },
        { name: "Revisión", status: "planned", text: "Los mantenedores estudian las mejores ideas y marcan su estado: estudiando, planificada, en construcción o activa.", gate: "La decisión de construir sigue siendo de los mantenedores." },
        { name: "Un prototipo en devnet", status: "planned", text: "Una idea elegida se construye y se prueba primero en devnet." },
        { name: "Auditoría y revisión legal", status: "planned", text: "Antes de que intervengan tokens reales: una auditoría de seguridad del contrato y del servidor, y una revisión legal del juego." },
      ],
    },
    {
      t: "notice",
      tone: "care",
      title: "El gobierno está planificado, no activo",
      paras: [
        "Hoy el proyecto lo llevan sus mantenedores, que deciden qué se construye. No hay voto con token, ni tesorería controlada por quienes tienen tokens, ni gobierno descentralizado. Si eso cambia, lo diremos aquí primero.",
      ],
    },
    {
      t: "cards",
      id: "ways",
      h2: "Formas de participar ahora",
      cols: 3,
      items: [
        { icon: "eye", title: "Leer y cuestionar", text: "Comprueba la matemática y las reglas en [Cómo funciona](@how) y dinos qué te parece mal." },
        { icon: "flask", title: "Probar en devnet", text: "Sigue la [guía de contribución](@contribute) y cuéntanos qué se rompe." },
        { icon: "shield", title: "Avisar de problemas de seguridad", text: "Usa el proceso de [Seguridad](@security)." },
      ],
    },
    { t: "component", name: "contact" },
  ],
};

export const contribute: Page = {
  title: "Contribuir",
  description: "Guía para contribuir a Goshi: cómo proponer un juego, las reglas que debe cumplir todo juego, cómo correr el proyecto en local en devnet, reglas de los pull requests y avisos de seguridad.",
  eyebrow: "Contribuir",
  h1: "Guía para contribuyentes",
  lead: "Una guía corta para quien quiera ayudar. El repositorio todavía no es público, así que algunos pasos pasarán a GitHub cuando lo sea.",
  blocks: [
    {
      t: "notice",
      tone: "info",
      title: "Estado",
      paras: ["El repositorio público está bajo licencia Apache 2.0 y todavía no está publicado. Mientras tanto, escríbenos desde la [página de contacto](@support)."],
    },
    {
      t: "split",
      id: "rules",
      h2: "Reglas que debe cumplir todo juego",
      yes: {
        h: "Un juego debe ser",
        list: [
          "De habilidad, con resultados que vengan de lo que hacen los jugadores",
          "Corto, de unos pocos minutos, para salas con jugadores de pago y saboteadores",
          "Decidido por el servidor de una forma que se pueda explicar y probar",
          "Justo con quien llega nuevo, sin ventajas que se puedan comprar dentro de una partida",
          "Legible: las reglas están escritas en palabras claras",
        ],
      },
      no: {
        h: "Un juego no debe",
        list: [
          "Depender del azar para la clasificación ni esconder probabilidades",
          "Dejar que alguien pague por una ventaja que cambie un resultado",
          "Confiar en el navegador para decidir algo importante",
          "Pedir claves privadas, frases semilla ni datos personales",
          "Dirigirse a menores ni promocionarse entre ellos",
        ],
      },
    },
    {
      t: "steps",
      id: "propose",
      h2: "Cómo proponer un juego",
      items: [
        { title: "Descríbelo", text: "En unos pocos párrafos: la idea, cómo funciona una partida, cuánto dura, cómo se calcula la clasificación y por qué es de habilidad." },
        { title: "Nombra los riesgos", text: "Qué se podría explotar, cómo podrían hacer trampa los bots o varias billeteras y qué debe comprobar el servidor." },
        { title: "Di cómo probarlo", text: "En devnet, con cuántos jugadores y qué medirías." },
      ],
    },
    {
      t: "prose",
      id: "local",
      h2: "Córrelo en local en devnet",
      paras: [
        "Necesitas Node.js 22 o más reciente, una billetera de Solana en devnet y SOL gratis de devnet. El sitio web y el servidor de juego son dos proyectos separados.",
        "El sitio web: `npm install`, luego `npm run play:local-config` y `npm run dev:play`. El servidor de juego: `npm install` y `npm run dev` en su carpeta. La guía completa, con los pasos de la billetera, está en el archivo del repositorio `docs/play-local.md`.",
      ],
    },
    {
      t: "prose",
      id: "pr",
      h2: "Pull requests",
      paras: ["Por favor mantén los cambios pequeños y enfocados, y ejecuta las comprobaciones antes de abrir uno."],
      list: [
        "`npm run verify` debe pasar: tipos, pruebas, la compilación y las comprobaciones de calidad",
        "Los dos idiomas, inglés y español, se cambian juntos y mantienen la misma estructura",
        "Sin rayas largas, y sin promesas de ganancias, rendimientos ni precios en ningún texto",
        "Si cambias la matemática del dinero, actualiza los vectores de prueba y explica por qué",
        "La accesibilidad cuenta: uso con teclado, contraste y movimiento reducido",
      ],
    },
    {
      t: "notice",
      tone: "risk",
      title: "Problemas de seguridad",
      paras: ["No avises de un problema de seguridad en un issue público. Sigue [Seguridad](@security)."],
    },
  ],
};

export const roadmap: Page = {
  title: "Hoja de ruta y cambios",
  description: "Lo que Goshi ha hecho y lo que viene, con etiquetas de estado honestas: activo, en diseño, planificado y pendiente de revisión. No se promete ninguna fecha.",
  eyebrow: "Hoja de ruta",
  h1: "Hoja de ruta y registro de cambios",
  lead: "Las fases tienen condiciones, no fechas. Cada punto dice exactamente en qué estado está.",
  blocks: [
    {
      t: "phases",
      id: "phases",
      h2: "Las fases",
      gateLabel: "Condición",
      items: [
        { name: "Contrato y primer juego", status: "live", text: "El contrato de custodia y Orb Rush funcionan en Solana mainnet (SOL real, entradas pequeñas) y en devnet (práctica gratis, sin dinero real).", gate: "Funcionando de punta a punta y con cada partida verificable por cualquiera." },
        { name: "Arenas de dinero en devnet", status: "live", text: "Arenas en vivo con entrada fija (0.003, 0.01 y 0.025 SOL de devnet) en su propio servidor dedicado. Compras un ticket, entras, comes monedas de SOL y cobras tu entrada por uno más tus eliminaciones. Cada entrada y cada pago están en la cadena, y cada muerte y cada cobro tienen su repetición en el VAR.", gate: "Cuentas que cierran al lamport y un pago que nunca se pierde." },
        { name: "Temporada 0 (devnet)", status: "live", text: "Del 26 de octubre al 9 de noviembre de 2026: un ranking público de quién gana más SOL de devnet en las arenas de dinero. La idea es que los 10 primeros ganen tickets para las arenas reales, con reglas que se publicarán.", gate: "Reglas revisadas por el abogado antes de cualquier premio con valor real." },
        { name: "Temporadas mensuales en mainnet", status: "planned", text: "Las arenas de dinero en Solana mainnet, en temporadas mensuales con ranking público y los ganadores anunciados con sus clips del VAR.", gate: "Arenas de dinero en mainnet, la auditoría externa y la revisión legal." },
        { name: "Eventos semanales", status: "idea", text: "Desafíos cortos dentro de cada temporada, como el mayor multiplicador de la semana.", gate: "Una temporada en marcha." },
        { name: "Repositorio público y licencia", status: "live", text: "El contrato, el servidor de juego y el sitio web son públicos bajo Apache 2.0 en github.com/GoshiApp.", gate: "Un repositorio limpio, sin claves." },
        { name: "Auditoría de seguridad", status: "planned", text: "Hay una revisión interna hecha y sus correcciones se están aplicando. Falta una auditoría externa independiente del contrato y del servidor: hasta entonces el contrato NO está auditado externamente.", gate: "Hallazgos corregidos y publicados." },
        { name: "Revisión legal", status: "pending", text: "Edad, regiones, cómo se clasifican los juegos con entrada, avisos sobre el token, términos y privacidad.", gate: "Una opinión escrita para cada país donde se abriría." },
        { name: "Más formas de conectar en el teléfono", status: "idea", text: "Hoy un teléfono se conecta abriendo la página dentro del navegador propio de la billetera. WalletConnect o el Solana Mobile Wallet Adapter podrían permitir que se conecten otras billeteras, si se pueden añadir sin volver pesada la página.", gate: "Una implementación ligera y una revisión de seguridad." },
        { name: "Proceso comunitario", status: "planned", text: "El tablero de ideas está abierto: cualquiera puede proponer un juego y votar. Falta escribir un proceso documentado para elegirlos y construirlos.", gate: "Un proceso que exista, documentado y probado." },
        { name: "Más juegos", status: "idea", text: "Juegos nuevos a partir de propuestas de la comunidad, probados primero en devnet.", gate: "Cumplir las reglas que debe cumplir todo juego." },
        { name: "Mainnet", status: "live", text: "Lanzamiento suave: entradas de $0.5 a $5, fondos reales, sin auditoría externa. Juega solo lo que puedas permitirte perder. Subir los límites depende de la auditoría y de la revisión legal.", gate: "La auditoría y la revisión legal deciden cualquier aumento de límites." },
      ],
    },
    {
      t: "table",
      id: "changelog",
      h2: "Registro de cambios",
      head: ["Fecha", "Cambio"],
      rows: [
        ["2026-10", "El contrato de custodia está desplegado e inicializado en Solana devnet."],
        ["2026-10", "Orb Rush y el servidor de juego con autoridad se probaron en local."],
        ["2026-10", "Este sitio web, con la página de juego que conecta una billetera en devnet."],
        ["2026-10", "Contrato v3 en devnet: 88% de premios para los tres mejores jugadores de pago, una bolsa del 2% para saboteadores, puestos con pase entre niveles, el modo VS y el Super Pozo. La arena es una batalla real de cuerpos sólidos."],
        ["2026-10", "Lanzamiento suave en mainnet (contrato v5): la llave que abre y liquida salas es distinta de la que guarda la bóveda y puede reemplazarla, y cualquiera puede reembolsar una sala de más de 3 horas sin liquidar."],
        ["2026-10", "Historial público de partidas, repeticiones desde el punto de vista de cada jugador, exportación a video y una página para verificar cada partida."],
        ["2026-10", "Arenas de dinero en devnet: tickets, servidor dedicado, cobro justo (entrada por uno más eliminaciones), bots que aprenden, repeticiones del VAR descargables como video y la Temporada 0 con ranking público."],
      ],
      note: "Las fechas son el mes en que se hizo un cambio, no una promesa sobre el futuro.",
    },
    {
      t: "cta",
      h2: "Sigue el avance",
      text: "Cuando el repositorio sea público, esta página enlazará a las versiones.",
      primary: { label: "Comunidad", to: "opensource" },
      secondary: { label: "Seguridad e imparcialidad", to: "security" },
    },
  ],
};

export const support: Page = {
  title: "Contacto",
  description: "Cómo llegar a Goshi: preguntas generales, solicitudes de privacidad y avisos de seguridad.",
  eyebrow: "Contacto",
  h1: "Escríbenos",
  lead: "Lo leemos todo. Por favor nunca envíes una frase semilla, una clave privada ni una contraseña.",
  blocks: [
    { t: "component", name: "contact" },
    {
      t: "notice",
      tone: "info",
      title: "Antes de escribir",
      list: [
        "Preguntas sobre cómo funciona una sala o un premio: lee primero [Cómo funciona](@how).",
        "Un problema con una transacción: incluye el enlace de la transacción del explorador y la red (devnet).",
        "Un problema de seguridad: escribe solo a la dirección de seguridad y por favor no lo publiques.",
      ],
    },
  ],
};
