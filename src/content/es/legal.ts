import type { Page } from "../types";

export const privacy: Page = {
  title: "Política de privacidad",
  description: "Un borrador de política de privacidad de Goshi: qué manejan el sitio web, la conexión de la billetera y el servidor de juego, qué es público en la cadena de bloques y los derechos que tienes. Borrador para revisión legal.",
  eyebrow: "Legal",
  h1: "Política de privacidad (borrador)",
  lead: "Este es un borrador para revisión legal. Describe en palabras claras lo que maneja Goshi. No es definitivo y todavía no lo ha revisado un abogado.",
  meta: "Borrador. Última actualización: 9 de octubre de 2026",
  blocks: [
    {
      t: "notice",
      tone: "risk",
      title: "Borrador para el abogado",
      paras: ["TODO(owner): este texto debe ser revisado y completado por un abogado antes de hacer público el sitio. Los puntos marcados TODO(owner) son datos o decisiones que faltan."],
    },
    {
      t: "legal",
      tocTitle: "En esta página",
      sections: [
        {
          id: "who",
          h: "1. Quiénes somos y qué cubre esto",
          paras: [
            "Esta política cubre el sitio web goshi.app, la página de juego y el servidor de juego al que se conecta, gestionados por el proyecto Goshi (\"Goshi\", \"nosotros\"). Para preguntas de privacidad escribe a {privacyEmail}.",
            "Preguntas o solicitudes: {privacyEmail}.",
          ],
        },
        {
          id: "short",
          h: "2. En resumen",
          list: [
            "El sitio web no instala cookies y no usa analítica ni rastreadores.",
            "Si conectas una billetera, vemos tu dirección pública y lo que haces en los juegos. Nunca vemos tus claves ni tu frase semilla.",
            "Todo lo que se escribe en una cadena de bloques es público y permanente. No podemos borrarlo.",
            "Los juegos son solo para mayores de 18 años (o la mayoría de edad legal de tu país).",
          ],
        },
        {
          id: "website",
          h: "3. El sitio web",
          paras: [
            "Las páginas cargan solo archivos de goshi.app. Tu elección de tema oscuro o claro, y el nombre de la última billetera que conectaste (por ejemplo \"phantom\", nunca una dirección ni una clave), se guardan en tu navegador y no se envían a ningún sitio. El servidor que aloja el sitio puede guardar registros técnicos estándar, como la hora de una solicitud y una dirección de red abreviada, para mantener el servicio en marcha y seguro. TODO(owner): nombrar el proveedor de alojamiento, el contenido de los registros y el plazo de conservación.",
            "La página de juego hace solicitudes desde tu navegador a un nodo de la red Solana (un proveedor de RPC) y al servidor de juego. El proveedor del nodo puede ver tu dirección de red y la dirección de billetera que consultas. TODO(owner): nombrar al proveedor de RPC y enlazar su política.",
          ],
        },
        {
          id: "wallet",
          h: "4. Tu billetera y la cadena de bloques",
          paras: [
            "Cuando conectas una billetera, la página conoce tu dirección pública. Tú apruebas cada pago en tu billetera. Tomar un puesto de pago, recibir un premio y cambiar tokens son transacciones en la cadena de bloques de Solana, que es pública: cualquiera puede ver las direcciones, los montos y las horas, y no se pueden borrar.",
            "Para iniciar sesión en el servidor de juego tu billetera firma un mensaje corto. No cuesta nada y no mueve fondos. Lo usamos solo para saber qué dirección está conectada.",
          ],
        },
        {
          id: "server",
          h: "5. El servidor de juego",
          list: [
            "Tu dirección de billetera y un nombre corto para mostrar derivado de ella.",
            "Tus entradas de movimiento y los resultados de las partidas en las que participas, incluida la clasificación.",
            "Datos técnicos necesarios para correr el servicio, como horas de conexión y errores.",
          ],
          paras: ["TODO(owner): el plazo de conservación, dónde se aloja el servidor y si los resultados de las partidas se guardan como registro público."],
        },
        {
          id: "use",
          h: "6. Para qué lo usamos",
          list: [
            "Para correr partidas, pagar a los ganadores y liquidar o cancelar salas.",
            "Para mantener el servicio seguro y justo, por ejemplo para detectar abusos, bots o varias cuentas usadas para hacer trampa.",
            "Para responder a tus mensajes y cumplir obligaciones legales.",
          ],
          paras: ["No vendemos datos personales y no los usamos para publicidad."],
        },
        {
          id: "sharing",
          h: "7. Quién más lo ve",
          paras: [
            "Los proveedores que corren el sitio, el servidor de juego y el nodo de la red. El software de billetera que elijas, que tiene su propia política. El Solana Explorer, si sigues un enlace a él. Las autoridades, cuando la ley lo exija. TODO(owner): listar los encargados del tratamiento y los países donde se tratan los datos.",
          ],
        },
        {
          id: "rights",
          h: "8. Tus derechos",
          paras: [
            "Según dónde vivas, puedes tener derecho a acceder, corregir, borrar, limitar o trasladar tus datos y a oponerte a algunos usos. Escribe a {privacyEmail}. Los datos escritos en una cadena de bloques no los podemos borrar. TODO(owner): las bases legales, los derechos regionales (por ejemplo la UE, el Reino Unido y estados de EE. UU.) y la autoridad ante la que reclamar.",
          ],
        },
        {
          id: "children",
          h: "9. Solo adultos",
          paras: ["Goshi no es para niños. Si crees que un menor lo ha usado, escríbenos y actuaremos."],
        },
        {
          id: "security",
          h: "10. Seguridad",
          paras: ["Usamos medidas razonables para proteger el servicio. Ningún sistema es perfectamente seguro. Para avisar de un problema de seguridad, mira la [página de seguridad](@security)."],
        },
        {
          id: "changes",
          h: "11. Cambios",
          paras: ["Actualizaremos esta página cuando algo cambie y cambiaremos su fecha. TODO(owner): cómo se avisa de los cambios."],
        },
      ],
    },
  ],
};

export const terms: Page = {
  title: "Términos de uso",
  description: "Borrador de términos de uso de Goshi: elegibilidad, [[t:el entorno de pruebas]][[m:los fondos reales]], cómo funcionan las salas y los pagos, conductas prohibidas, riesgos y responsabilidades. Borrador para revisión legal.",
  eyebrow: "Legal",
  h1: "Términos de uso (borrador)",
  lead: "Este es un borrador para revisión legal. Describe cómo puedes usar Goshi. No es definitivo y todavía no lo ha revisado un abogado.",
  meta: "Borrador. Última actualización: 9 de octubre de 2026",
  blocks: [
    {
      t: "notice",
      tone: "risk",
      title: "Borrador para el abogado",
      paras: ["TODO(owner): estos términos deben ser revisados y completados por un abogado antes de hacer público el sitio. Nada de aquí es definitivo."],
    },
    {
      t: "legal",
      tocTitle: "En esta página",
      sections: [
        {
          id: "accept",
          h: "1. Usar Goshi",
          paras: ["Al usar el sitio web o los juegos aceptas estos términos. Si no estás de acuerdo, no los uses. El servicio lo opera Goshi Labs."],
        },
        {
          id: "eligibility",
          h: "2. Quién puede usarlo",
          list: [
            "Debes tener al menos 18 años o la mayoría de edad legal de tu país.",
            "Al conectar tu billetera y participar, confirmas bajo tu propia responsabilidad que eres mayor de edad (+18) y que el acceso a juegos en blockchain no viola las leyes o regulaciones aplicables en tu jurisdicción de residencia. Goshi no bloquea países: cumplir las leyes locales es responsabilidad tuya.",
            "Eres responsable de saber si la ley de donde vives permite juegos con entrada y premios.",
          ],
        },
        {
          id: "test",
          h: "3. [[t:El entorno de pruebas]][[m:Fondos reales]]",
          paras: [
            "[[t:Hoy los juegos funcionan en una red de pruebas de Solana con tokens de prueba que no tienen valor. La red de pruebas puede reiniciarse o detenerse en cualquier momento y nada en ella tiene valor monetario. Las funciones pueden cambiar o desaparecer.]][[m:Los juegos funcionan en Solana mainnet con fondos reales. Puedes perder tu entrada. Las comisiones de red, las caídas de la red y los errores de software pueden afectar tus transacciones, y las transacciones no se pueden deshacer. Las funciones pueden cambiar o desaparecer.]]",
          ],
        },
        {
          id: "rooms",
          h: "4. Salas, entradas y premios",
          list: [
            "Una sala tiene una entrada en SOL, hasta 10 puestos de pago y hasta 3 puestos gratis de saboteador. Al tomar un puesto de pago envías la entrada desde tu billetera al contrato. Un puesto de saboteador es gratis y pide un saldo mínimo de $GOSHI, que no se toma de tu billetera.",
            "Al terminar la partida el contrato reparte el pozo: el 88% del pozo a los tres mejores jugadores de PAGO clasificados (60%, 25% y 15%), el 2% repartido por igual entre los saboteadores sentados, y una parte de la casa del 10%, dividida 10% recompra y quema, 15% infraestructura, 25% liquidez y comunidad y 50% al Super Pozo, como se describe en [Cómo funciona](@how). Los saboteadores no compiten y no pueden ganar. Un puesto de pago también puede ser un puesto con pase gratuito: cuando termina una sala de un nivel menor, sus tres mejores jugadores de pago pueden recibir la oferta del último puesto de una sala más alta que ya tiene 9 jugadores de pago. Ese puesto lo cubre la propia entrada de la sala más alta, así que la plataforma renuncia a su parte en esa sala y la sala nunca debe más de lo que tiene. El pase se ofrece solo en ese caso, como máximo una vez por sala, y puedes rechazarlo.",
            "El Super Pozo se acumula en $GOSHI y se paga al primer lugar solo en un evento de jackpot que decide el servidor de juego (1% de probabilidad tras una partida completa de 10 jugadores de pago). El evento no se puede verificar en la cadena.",
            "Si una sala tiene de 2 a 9 jugadores de pago tras 5 minutos, se puede ofrecer una partida VS a los jugadores de pago. En el modo VS no hay saboteadores, la comisión del 10% se toma de cada entrada, quien pierde conserva el 80% de su entrada neta y el ganador se lleva el resto. Todos los jugadores de pago deben aceptar.",
            "Los resultados los decide el servidor de juego. Los pagos en la cadena de bloques son definitivos y no se pueden revertir.",
            "Si una sala no se puede jugar, la plataforma puede cancelarla y el contrato devuelve las entradas.",
            "Los premios no están garantizados. La mayoría de los jugadores de una sala no cobra.",
          ],
        },
        {
          id: "saboteurs",
          h: "5. Saboteadores",
          paras: ["Los saboteadores son puestos gratis para billeteras que tienen el mínimo de $GOSHI. Son obstáculos para los jugadores de pago. Nunca pagan una entrada, no pueden perder fondos en una sala no compiten, no pueden ganar y se reparten el 2% del pozo por igual, pagado en SOL. Tomar un puesto de saboteador no quita ningún token de tu billetera."],
        },
        {
          id: "conduct",
          h: "6. Lo que no debes hacer",
          list: [
            "Hacer trampa, usar jugadores automáticos, explotar errores o participar con varias billeteras para obtener ventaja.",
            "Cooperar con otros jugadores para arreglar un resultado.",
            "Atacar el servicio, el contrato u otros usuarios, o intentar saltarte los límites.",
            "Usar el servicio para actividades ilegales o para lavar dinero.",
            "Hacerte pasar por Goshi o pedir a otros claves o frases semilla.",
          ],
          paras: ["Podemos excluir una billetera del servicio. Las transacciones del contrato ya hechas no se pueden deshacer."],
        },
        {
          id: "wallets",
          h: "7. Billeteras y claves",
          paras: ["Tú guardas tus propias claves. No podemos recuperarlas ni revertir tus transacciones. Eres responsable de tu billetera, de las comisiones de red y de la exactitud de lo que apruebas."],
        },
        {
          id: "token",
          h: "8. El token",
          paras: ["[[t:El token que se usa en la prueba no tiene valor. Nada de este sitio web ofrece, vende ni distribuye un token en mainnet.]][[m:El token es un activo real y puede perder todo su valor. Nada de este sitio web lo vende ni le promete ningún valor.]] Nada de esto es una invitación a invertir. Mira la [página del token](@token) y los [riesgos](@risks)."],
        },
        {
          id: "taxes",
          h: "9. Impuestos",
          paras: ["Eres responsable de cualquier impuesto que te corresponda, incluidos los de los premios."],
        },
        {
          id: "ip",
          h: "10. Código, licencias y el nombre",
          paras: ["El código (programa, servidor y sitio web) es de código abierto bajo la licencia Apache 2.0. El nombre y el logotipo de Goshi no se licencian para usarlos como propios."],
        },
        {
          id: "disclaimer",
          h: "11. Sin garantía y límites de responsabilidad",
          paras: [
            "El servicio se ofrece tal cual[[t:, en pruebas,]] sin garantía. El contrato [[n:no está auditado y ]]puede tener errores. No somos responsables de las pérdidas por el uso del servicio, por fallos de la red o de la billetera, ni por decisiones que tomes, en la medida que la ley lo permita. TODO(owner): los límites exactos para cada jurisdicción.",
          ],
        },
        {
          id: "changes",
          h: "12. Cambios y fin del servicio",
          paras: ["Podemos cambiar estos términos, los juegos y el servicio, o terminarlos. Actualizaremos esta página y su fecha. TODO(owner): el plazo de aviso."],
        },
        {
          id: "law",
          h: "13. Ley aplicable y disputas",
          paras: ["TODO(owner): la ley aplicable, los tribunales o el arbitraje y los derechos del consumidor por región."],
        },
        {
          id: "contact",
          h: "14. Contacto",
          paras: ["Preguntas sobre estos términos: {supportEmail}."],
        },
      ],
    },
  ],
};
