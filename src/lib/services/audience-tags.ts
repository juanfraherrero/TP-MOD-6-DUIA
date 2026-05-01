import { z } from "zod";
import { invokeStructured } from "@/agents/shared/llm";
import { createLogger } from "@/lib/logger";
import { dedupeTagsCaseInsensitive } from "./difficulty-tags";

const log = createLogger("svc:audience-tags");

// Datos mínimos de la actividad que vamos a pasar al LLM. Aceptamos `null` y
// `undefined` indistintos en altitud/desnivel para poder recibir tanto el
// shape `Activity` (post-DB) como el shape `ActivityInput` (pre-DB, valida).
type Input = {
  title: string;
  description: string;
  requirements: string;
  physicalPrep: string;
  altitudeM?: number | null;
  elevationGainM?: number | null;
};

// Schema simple — array plano de strings. Gemini-friendly: 1 nivel, sin
// optionals, sin nullables, todo enum-free para no acoplarse a un vocabulario
// rígido (preferimos diversidad natural en español).
const tagsSchema = z.object({
  audienceTags: z
    .array(z.string().min(2).max(60))
    .min(3)
    .max(8)
    .describe(
      "Entre 3 y 8 etiquetas en español describiendo el público ideal de la actividad.",
    ),
  reasoning: z
    .string()
    .default("")
    .describe("1-2 líneas explicando por qué estos públicos."),
});

export type AudienceTagsResult = z.infer<typeof tagsSchema>;

const SYSTEM = `Sos un especialista en turismo aventura argentino. Te paso una actividad y vos generás entre 3 y 8 etiquetas de "público ideal" — frases cortas en español que ayuden a que un futuro buscador semántico encuentre esta actividad cuando alguien describe a su público.

Las etiquetas pueden combinar dimensiones:
- **Nivel de experiencia**: principiantes, intermedios, avanzados, expertos.
- **Demografía**: familias con niños, parejas, grupos de amigos, adultos mayores, embarazadas, viajeros solos.
- **Condiciones físicas**: apto para personas con problemas respiratorios, no recomendado para problemas cardíacos, accesible para movilidad reducida, ideal para deportistas.
- **Estilo**: para desconectar, para sacar fotos, para vivir adrenalina, para grupos corporativos, para luna de miel.
- **Rango de edad**: 8+, adolescentes, adultos jóvenes, sin límite de edad.

Reglas importantes:
- Si la actividad tiene altitud > 2500m o desnivel > 600m → mencionar explícitamente "no recomendado para problemas respiratorios" o "no recomendado para problemas cardíacos" cuando aplique.
- Si la actividad es de baja exigencia (sin desnivel, baja altitud, sin requisitos físicos especiales) → incluir tags de accesibilidad ("apto para todas las edades", "ideal para principiantes").
- NO inventes contraindicaciones que no se desprenden del texto. Si no hay info clara, omitilo.
- Frases cortas, naturales, en español rioplatense (no usar "vosotros" ni "tú").
- NO repitas el mismo concepto con dos frases diferentes.

EJEMPLOS:

Actividad: "Caminata Cerro Llao Llao Bariloche, baja dificultad, 4hs, 180m desnivel, apta desde 8 años."
Output:
{"audienceTags": ["familias con niños desde 8 años", "principiantes en trekking", "adultos mayores con buena movilidad", "ideal para desconectar en familia", "fotógrafos amateurs de paisaje"], "reasoning": "Baja exigencia + apta familias + paisaje icónico."}

Actividad: "Trekking Laguna de los Tres El Chaltén, 22km, 800m desnivel, jornada completa, exigente."
Output:
{"audienceTags": ["trekkers experimentados", "deportistas con buen estado físico", "adultos jóvenes y de mediana edad", "no recomendado para problemas cardíacos o respiratorios", "viajeros solos o en pareja con experiencia"], "reasoning": "Exigencia alta excluye varios públicos pero engancha al perfil aventurero."}

Actividad: "Avistaje de Aves Iguazú, ritmo calmo, senderos planos, todas las edades."
Output:
{"audienceTags": ["adultos mayores", "familias con niños pequeños", "personas con movilidad reducida", "fotógrafos de naturaleza", "observadores de aves principiantes", "viajeros que buscan ritmo tranquilo"], "reasoning": "Sin esfuerzo físico + interés naturalista."}

FORMATO: tenés una tool disponible — invocala como respuesta. No expliques, no des markdown.`;

export async function generateAudienceTags(
  activity: Input,
): Promise<string[]> {
  const end = log.time("generate audience_tags");
  const prompt = `Actividad:
Título: ${activity.title}
Descripción: ${activity.description}
Requisitos: ${activity.requirements}
Preparación física: ${activity.physicalPrep}
${activity.altitudeM != null ? `Altitud máxima: ${activity.altitudeM} metros\n` : ""}${activity.elevationGainM != null ? `Desnivel: ${activity.elevationGainM} metros\n` : ""}
Generá los audienceTags.`;

  try {
    const result = await invokeStructured(
      tagsSchema,
      [
        ["system", SYSTEM],
        ["user", prompt],
      ],
      { name: "generate_audience_tags", temperature: 0.4 },
    );
    end();
    // Dedupe shared (case-insensitive). Reusado por createActivity al mergear
    // con los derivedTags heurísticos para no duplicar entries entre fuentes.
    const dedup = dedupeTagsCaseInsensitive(result.audienceTags);
    log.info("tags generados", {
      title: activity.title.slice(0, 60),
      count: dedup.length,
      tags: dedup,
    });
    return dedup;
  } catch (err) {
    end();
    // Fallback graceful — la actividad se puede crear sin tags. Mejor eso que
    // bloquear la creación entera por un fallo del LLM (rate limit, hang, etc).
    log.warn("falló generación de audience_tags — sigo con []", {
      title: activity.title.slice(0, 60),
      error: String(err).slice(0, 200),
    });
    return [];
  }
}
