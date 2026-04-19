/**
 * Seed de actividades para la demo del TP.
 *
 * Uso: `npm run seed`
 *
 * Inserta ~15 actividades variadas (trekkings, cabalgatas, rafting, kayak,
 * escalada, avistaje, fotografía, MTB, rapel, raquetas) en destinos
 * argentinos emblemáticos. Es idempotente: si una actividad con el mismo
 * título ya existe, la skipea.
 *
 * Mezcla three modos de fechas para que la demo cubra todos los caminos
 * del retrieve híbrido:
 *  - **one-time** (`recurrence: null`): la actividad ocurre en `startDate`.
 *  - **weekly** (`recurrence.kind: "weekly"`): días de la semana fijos en
 *    el rango [startDate, endDate]. La materialización a `available_dates`
 *    se cap-ea al horizonte de 180 días desde hoy (ver expand.ts).
 *  - **dates** (`recurrence.kind: "dates"`): fechas explícitas filtradas
 *    contra el rango.
 *
 * `startDate`/`endDate` definen el rango de validez del patrón; las horas
 * dentro de esos timestamps NO se usan para el horario diario en modos
 * recurring (eso lo dan `startTime`/`endTime` de la recurrencia). Para
 * one-time sí: `startDate`/`endDate` son el horario real del evento.
 *
 * Cada alta pasa por `createActivity()` del service, que dispara la ingesta
 * RAG (chunks + embeddings en pgvector) automáticamente.
 */

import "reflect-metadata";
// Cargamos .env y .env.local antes de importar cualquier módulo que lea env.
// Next.js hace esto automáticamente; ts-node no.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getDataSource } from "@/db/data-source";
import type { Activity } from "@/db/entities";
import { createActivity } from "@/lib/services/activity";
import { createLogger } from "@/lib/logger";
import type { ActivityInput } from "@/lib/validation/activity";

const log = createLogger("scripts:seed");

const ENTITY = "Activity";

const SEED_ACTIVITIES: ActivityInput[] = [
  // ── 1 — one-time, futuro próximo ────────────────────────────────────
  {
    title: "Trekking al Cerro Llao Llao — Bariloche",
    description:
      "Caminata circular de dificultad baja rodeando el icónico Cerro Llao Llao, con vistas al lago Nahuel Huapi y a los bosques de arrayanes. Ideal para un primer contacto con el trekking patagónico en familia o con amigos.",
    imageUrl: null,
    startDate: new Date("2026-05-10T09:00:00-03:00"),
    endDate: new Date("2026-05-10T14:00:00-03:00"),
    requirements:
      "Calzado cerrado con suela de trekking, campera rompeviento, agua (1L) y snack. No se requiere experiencia previa.",
    physicalPrep:
      "Apto para todas las edades desde 8 años. Caminata de 4 horas en terreno con desniveles suaves; nivel de actividad física básico.",
    altitudeM: 1050,
    elevationGainM: 180,
    priceArs: 25000,
    isActive: true,
    recurrence: null,
  },
  // ── 2 — weekly Sat+Sun (temporada larga) ────────────────────────────
  {
    title: "Trekking Laguna de los Tres — El Chaltén",
    description:
      "Travesía de día completo al mirador más emblemático del Fitz Roy. Recorremos bosques de lenga, valles glaciares y la exigente subida final por morena hasta la laguna esmeralda al pie del macizo. Salidas regulares todos los fines de semana.",
    imageUrl: null,
    startDate: new Date("2026-04-25T00:00:00-03:00"),
    endDate: new Date("2027-04-30T23:59:00-03:00"),
    requirements:
      "Botas de trekking rígidas, mochila 30L, viandas, 2L de agua, abrigo térmico y guantes (cumbre expuesta al viento). Bastones recomendados.",
    physicalPrep:
      "Nivel exigente. Requiere buen estado físico, experiencia previa en trekking de montaña y tolerancia al esfuerzo sostenido: 22 km y 800m de desnivel positivo acumulado.",
    altitudeM: 1170,
    elevationGainM: 800,
    priceArs: 95000,
    isActive: true,
    recurrence: {
      kind: "weekly",
      days: ["sat", "sun"],
      startTime: "06:30",
      endTime: "19:00",
    },
  },
  // ── 3 — one-time multi-día (overnight) ──────────────────────────────
  {
    title: "Trekking Quebrada del Toro — Salta",
    description:
      "Travesía de dos jornadas por la Quebrada del Toro, combinando senderismo en altura con pernocte en hostería de montaña. Paisajes de la Puna, cardones centenarios y pueblos coyas.",
    imageUrl: null,
    startDate: new Date("2026-07-18T07:00:00-03:00"),
    endDate: new Date("2026-07-19T18:00:00-03:00"),
    requirements:
      "Botas de trekking, ropa de abrigo (noches bajo cero), gorro, lentes de sol, protector solar factor 50+, bolsa de dormir. Se sugiere aclimatación previa en Salta capital.",
    physicalPrep:
      "Nivel medio-alto. Se requiere buen estado físico y experiencia previa en altura: se superan los 3500m con caminatas de 6 a 7 horas diarias.",
    altitudeM: 3800,
    elevationGainM: 650,
    priceArs: 150000,
    isActive: true,
    recurrence: null,
  },
  // ── 4 — weekly Sat (temporada extendida) ────────────────────────────
  {
    title: "Cabalgata al Refugio Frey — Bariloche",
    description:
      "Cabalgata de medio día por senderos cordilleranos rumbo al histórico Refugio Frey. Paisajes de lengas, arroyos de deshielo y vistas al Catedral. Caballos criollos mansos guiados por baqueanos patagónicos. Salidas todos los sábados.",
    imageUrl: null,
    startDate: new Date("2026-04-25T00:00:00-03:00"),
    endDate: new Date("2027-04-30T23:59:00-03:00"),
    requirements:
      "Pantalón largo cómodo (no jean), calzado cerrado, campera rompeviento y protección solar. Peso máximo del jinete: 100 kg.",
    physicalPrep:
      "Nivel básico. No se necesita experiencia previa con caballos; el baqueano acompaña a principiantes. Recomendado desde 12 años.",
    altitudeM: 1040,
    elevationGainM: 200,
    priceArs: 55000,
    isActive: true,
    recurrence: {
      kind: "weekly",
      days: ["sat"],
      startTime: "09:00",
      endTime: "14:30",
    },
  },
  // ── 5 — weekly Sun ──────────────────────────────────────────────────
  {
    title: "Cabalgata Gaucha en Sierra de la Ventana",
    description:
      "Jornada a caballo por los cerros bonaerenses con almuerzo criollo al fogón. Recorremos arroyos y pastizales serranos acompañados por gauchos locales que comparten tradiciones y anécdotas del pago. Todos los domingos.",
    imageUrl: null,
    startDate: new Date("2026-04-25T00:00:00-03:00"),
    endDate: new Date("2027-04-30T23:59:00-03:00"),
    requirements:
      "Bombacha de campo o pantalón largo, alpargatas o botas, sombrero. Incluye almuerzo con asado, empanadas y vino. Apto para no vegetarianos (opción veggie bajo aviso).",
    physicalPrep:
      "Nivel básico-medio. Pensado para jinetes principiantes; 3 horas efectivas arriba del caballo distribuidas en dos tramos.",
    altitudeM: 650,
    elevationGainM: 120,
    priceArs: 42000,
    isActive: true,
    recurrence: {
      kind: "weekly",
      days: ["sun"],
      startTime: "10:00",
      endTime: "17:00",
    },
  },
  // ── 6 — weekly Sat+Sun (rafting season) ─────────────────────────────
  {
    title: "Rafting en el Río Mendoza — Cacheuta",
    description:
      "Descenso en balsa por los rápidos clase III-IV del Río Mendoza, con instructores certificados IRF. Dos horas de adrenalina entre los Andes, con briefing de seguridad y equipo completo incluido. Salidas de fin de semana toda la temporada.",
    imageUrl: null,
    startDate: new Date("2026-04-25T00:00:00-03:00"),
    endDate: new Date("2027-04-30T23:59:00-03:00"),
    requirements:
      "Saber nadar es excluyente. Traje de neoprene, casco y chaleco salvavidas provistos por la empresa. Traer malla, muda de ropa seca, toalla y calzado acuático.",
    physicalPrep:
      "Nivel medio. Edad mínima 14 años con autorización del tutor. Se exige no tener lesiones lumbares ni cardiovasculares. Requiere brazos firmes para remar durante todo el descenso.",
    altitudeM: 1250,
    elevationGainM: null,
    priceArs: 68000,
    isActive: true,
    recurrence: {
      kind: "weekly",
      days: ["sat", "sun"],
      startTime: "10:00",
      endTime: "14:00",
    },
  },
  // ── 7 — weekly Fri+Sat (atardecer) ──────────────────────────────────
  {
    title: "Kayak en el Mar de Mar del Plata",
    description:
      "Salida de kayak de mar bordeando los acantilados de Cabo Corrientes al atardecer. Experiencia guiada con doble kayak estable, ideal para observar lobos marinos y disfrutar la puesta del sol sobre el Atlántico. Salidas viernes y sábados.",
    imageUrl: null,
    startDate: new Date("2026-04-25T00:00:00-03:00"),
    endDate: new Date("2027-04-30T23:59:00-03:00"),
    requirements:
      "Saber nadar. Se provee kayak, remo, chaleco salvavidas y pollera impermeable. Traer malla, muda seca, protector solar y repelente.",
    physicalPrep:
      "Nivel básico. Apto para personas sin experiencia; los guías asisten con la técnica de remo. No recomendado para personas con vértigo o problemas cervicales.",
    altitudeM: null,
    elevationGainM: null,
    priceArs: 38000,
    isActive: true,
    recurrence: {
      kind: "weekly",
      days: ["fri", "sat"],
      startTime: "17:30",
      endTime: "20:00",
    },
  },
  // ── 8 — one-time ────────────────────────────────────────────────────
  {
    title: "Escalada en Piedras Blancas — Córdoba",
    description:
      "Jornada de escalada deportiva en las paredes de cuarcita de Los Gigantes, con rutas equipadas desde grado 5.8 a 6b+. Abordamos técnica, seguros y progresión en roca con instructor EPGAMT.",
    imageUrl: null,
    startDate: new Date("2026-09-05T08:00:00-03:00"),
    endDate: new Date("2026-09-05T17:00:00-03:00"),
    requirements:
      "Arnés, casco, pies de gato y cuerda provistos. Traer ropa deportiva, guantes de carga finos, agua y vianda. Seguro de accidentes incluido.",
    physicalPrep:
      "Nivel medio-alto. Se exige tener experiencia previa en escalada indoor o boulder y conocimiento básico de nudos. Edad mínima 16 años.",
    altitudeM: 2150,
    elevationGainM: 100,
    priceArs: 85000,
    isActive: true,
    recurrence: null,
  },
  // ── 9 — weekly Sat+Sun (year-round) ─────────────────────────────────
  {
    title: "Avistaje de Aves en Iguazú",
    description:
      "Recorrido guiado por los senderos silenciosos de la selva misionera para avistar tucanes, surucúas, yacutingas y más de 80 especies tropicales. Ritmo calmo, binoculares y guía de campo incluidos. Salidas todos los fines de semana al amanecer.",
    imageUrl: null,
    startDate: new Date("2026-04-25T00:00:00-03:00"),
    endDate: new Date("2027-12-31T23:59:00-03:00"),
    requirements:
      "Ropa cómoda en tonos neutros, repelente de insectos, gorro y protector solar. Binoculares provistos (también se pueden traer los propios).",
    physicalPrep:
      "Apto para todas las edades. Caminata muy suave por senderos planos de 4 km totales, con pausas frecuentes para observación. Recomendado para adultos mayores y familias.",
    altitudeM: 180,
    elevationGainM: null,
    priceArs: 32000,
    isActive: true,
    recurrence: {
      kind: "weekly",
      days: ["sat", "sun"],
      startTime: "06:00",
      endTime: "11:00",
    },
  },
  // ── 10 — recurrence "dates" (fechas específicas) ────────────────────
  {
    title: "Taller de Fotografía de Paisaje — Valle de la Luna",
    description:
      "Experiencia de un día en Ischigualasto con fotógrafo profesional, para capturar las formaciones geológicas en la hora dorada y el atardecer. Incluye teoría de composición y revelado digital básico. Fechas seleccionadas según calendario de luna.",
    imageUrl: null,
    startDate: new Date("2026-05-01T00:00:00-03:00"),
    endDate: new Date("2027-06-30T23:59:00-03:00"),
    requirements:
      "Cámara réflex, mirrorless o celular con control manual. Trípode recomendado (hay préstamos sujetos a disponibilidad). Abrigo para el atardecer en el desierto.",
    physicalPrep:
      "Apto para todas las edades. Caminatas cortas y planas entre locaciones; la mayor parte del tiempo es estática frente al trípode.",
    altitudeM: 1350,
    elevationGainM: null,
    priceArs: 48000,
    isActive: true,
    recurrence: {
      kind: "dates",
      dates: [
        "2026-05-23",
        "2026-06-20",
        "2026-07-25",
        "2026-08-22",
        "2026-09-19",
        "2026-10-17",
        "2026-11-14",
        "2026-12-12",
        "2027-01-09",
        "2027-02-13",
      ],
      startTime: "14:00",
      endTime: "21:00",
    },
  },
  // ── 11 — Kayak Delta (one-time) ─────────────────────────────────────
  {
    title: "Kayak por los Arroyos del Delta — Tigre",
    description:
      "Paseo tranquilo por los canales escondidos del Tigre. Ideal para desconectar del ruido y descubrir las casitas isleñas desde el agua. Avanzamos a ritmo calmo, paramos a sacar fotos y cerramos con mates y bizcochitos en una isla privada. No hace falta experiencia: la idea es disfrutar del paisaje y del sonido del agua.",
    imageUrl: null,
    startDate: new Date("2026-05-15T10:00:00-03:00"),
    endDate: new Date("2026-05-15T14:00:00-03:00"),
    requirements:
      "Una muda de ropa extra (por si te mojás al subir al kayak), protector solar y gorra. No traer objetos de valor que puedan caer al río.",
    physicalPrep:
      "Muy básica. Si tenés fuerza para revolver la polenta, podés remar. Está pensado para venir a relajarse, no para una competencia.",
    altitudeM: 10,
    elevationGainM: 0,
    priceArs: 15000,
    isActive: true,
    recurrence: null,
  },
  // ── 12 — Cabalgata Potrerillos (one-time) ───────────────────────────
  {
    title: "Cabalgata Cordillerana en Potrerillos — Mendoza",
    description:
      "Salida a caballo por los cerros mendocinos. Los animales son extremadamente mansos, así que es ideal incluso para quienes nunca montaron. Subimos hasta un mirador natural con vista al dique y a las montañas nevadas de fondo. Gran plan en familia.",
    imageUrl: null,
    startDate: new Date("2026-06-20T09:00:00-03:00"),
    endDate: new Date("2026-06-20T13:00:00-03:00"),
    requirements:
      "Pantalón largo obligatorio (nada de short, te raspás con la montura), calzado cerrado y anteojos de sol por el reflejo de la montaña.",
    physicalPrep:
      "Nivel asado-de-domingo: no requiere esfuerzo muscular, solo aguantar el trote del caballo. Si no solés montar, al día siguiente podés tener algo de dolor muscular leve.",
    altitudeM: 1800,
    elevationGainM: 300,
    priceArs: 32000,
    isActive: true,
    recurrence: null,
  },
  // ── 13 — MTB Valle de la Luna (one-time) ────────────────────────────
  {
    title: "Mountain Bike en el Valle de la Luna — Ischigualasto",
    description:
      "Recorrido en bicicleta por el parque Ischigualasto. El paisaje parece de otro planeta: vamos por los senderos permitidos viendo las formaciones más raras como El Hongo o La Cancha de Bochas. Hace calor sanjuanino, así que hay que ir con energía.",
    imageUrl: null,
    startDate: new Date("2026-10-10T08:00:00-03:00"),
    endDate: new Date("2026-10-10T12:00:00-03:00"),
    requirements:
      "Mucha agua (mínimo 2L), ropa deportiva liviana y ganas de pedalear bajo el sol. Casco y bicicleta provistos por la empresa.",
    physicalPrep:
      "Saber andar en bicicleta y tener algo de aire: el calor agota rápido si no estás acostumbrado.",
    altitudeM: 1200,
    elevationGainM: 100,
    priceArs: 21000,
    isActive: true,
    recurrence: null,
  },
  // ── 14 — Rapel Los Gigantes (one-time) ──────────────────────────────
  {
    title: "Rapel y Escalada en Los Gigantes — Córdoba",
    description:
      "Adrenalina en las sierras de Córdoba: trepamos paredes de granito con sogas y arneses. Pensado para principiantes, pero estar colgado en altura te hace sentir un superhéroe.",
    imageUrl: null,
    startDate: new Date("2026-11-05T09:00:00-03:00"),
    endDate: new Date("2026-11-05T18:00:00-03:00"),
    requirements:
      "Zapatillas con buen agarre (nada de lona lisa), ropa que se pueda ensuciar o raspar contra la piedra, y valentía para el primer paso al vacío.",
    physicalPrep:
      "Intermedia. Necesitás algo de fuerza en brazos y piernas. Si te cuesta subir a una silla, la parte de la escalada te va a complicar.",
    altitudeM: 2100,
    elevationGainM: 400,
    priceArs: 38000,
    isActive: true,
    recurrence: null,
  },
  // ── 15 — Caminata Raquetas (one-time, lejano) ───────────────────────
  {
    title: "Caminata con Raquetas — Ushuaia (Edición Invierno)",
    description:
      "Caminamos sobre la nieve virgen en los valles cercanos a Ushuaia. Las raquetas funcionan como zapatos gigantes que evitan que te hundas en la nieve profunda. Es muy divertido: parece que vas caminando sobre nubes blancas.",
    imageUrl: null,
    startDate: new Date("2027-07-15T11:00:00-03:00"),
    endDate: new Date("2027-07-15T15:00:00-03:00"),
    requirements:
      "Ropa de nieve impermeable, guantes, gorro y botas térmicas. Si vas con zapatillas comunes se te van a congelar los dedos antes de arrancar.",
    physicalPrep:
      "Nivel medio. Caminar con raquetas cansa un poco más que caminar normal porque pesan, pero cualquier persona sana lo hace sin drama.",
    altitudeM: 450,
    elevationGainM: 150,
    priceArs: 45000,
    isActive: true,
    recurrence: null,
  },
];

async function titleExists(title: string): Promise<boolean> {
  const ds = await getDataSource();
  const existing = await ds
    .getRepository<Activity>(ENTITY)
    .findOne({ where: { title } });
  return existing !== null;
}

async function main() {
  log.info("iniciando seed", { total: SEED_ACTIVITIES.length });
  const endTotal = log.time("seed completo");

  // Fuerza la inicialización del DataSource antes del primer insert (migrations, etc).
  await getDataSource();

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < SEED_ACTIVITIES.length; i++) {
    const input = SEED_ACTIVITIES[i];
    const progress = `${i + 1}/${SEED_ACTIVITIES.length}`;
    log.info(`creando actividad ${progress}`, { title: input.title });

    try {
      if (await titleExists(input.title)) {
        log.warn(`skip ${progress} — ya existe`, { title: input.title });
        skipped++;
        continue;
      }

      const saved = await createActivity(input);
      log.info(`actividad ${progress} creada + ingesta RAG`, {
        id: saved.id,
        title: saved.title,
      });
      created++;
    } catch (err) {
      log.error(`fallo actividad ${progress}`, {
        title: input.title,
        error: String(err),
      });
      failed++;
    }
  }

  endTotal();
  log.info("seed finalizado", {
    created,
    skipped,
    failed,
    total: SEED_ACTIVITIES.length,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error("fatal en seed", { error: String(err) });
    process.exit(1);
  });
