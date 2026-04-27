import { getDataSource } from "@/db/data-source";
import type { Activity } from "@/db/entities";
import { createLogger } from "@/lib/logger";
import { ingestActivity } from "@/rag";
import type { ActivityInput } from "@/lib/validation/activity";
import { expandAvailableDates } from "@/lib/recurrence/expand";
import { generateAudienceTags } from "./audience-tags";

const log = createLogger("svc:activity");

// Heurística: ¿hace falta re-generar audience_tags? Solo cuando cambian los
// campos de texto que definen la naturaleza de la actividad. Si solo se cambia
// precio o fecha, conservamos los tags existentes para evitar un LLM call
// innecesario y mantener consistencia.
function textFieldsChanged(prev: Activity, next: ActivityInput): boolean {
  return (
    prev.title !== next.title ||
    prev.description !== next.description ||
    prev.requirements !== next.requirements ||
    prev.physicalPrep !== next.physicalPrep ||
    prev.altitudeM !== (next.altitudeM ?? null) ||
    prev.elevationGainM !== (next.elevationGainM ?? null)
  );
}

// Repository lookup uses the entity NAME string ("Activity") instead of the
// class ref to avoid "No metadata for Activity" errors in Next dev mode:
// each route compilation creates a fresh Activity class, but the cached
// DataSource still holds the original class. Name-based lookup is stable.
// Lookup por TABLE NAME, no class name. En producción Next minifica y los
// nombres de clase se manglean (Activity → j). El table name es un string
// literal del @Entity("activities") — inmune a minificación.
const ENTITY = "activities";

function normalize(input: ActivityInput, audienceTags: string[]) {
  const recurrence = input.recurrence ?? null;
  // Materializamos availability al escribir. Las queries del retrieve luego
  // son O(log n) con GIN — el agente no necesita entender el patrón.
  const availableDates = expandAvailableDates(
    recurrence,
    input.startDate,
    input.endDate,
  );
  return {
    title: input.title,
    description: input.description,
    imageUrl: input.imageUrl ?? null,
    startDate: input.startDate,
    endDate: input.endDate,
    requirements: input.requirements,
    physicalPrep: input.physicalPrep,
    altitudeM: input.altitudeM ?? null,
    elevationGainM: input.elevationGainM ?? null,
    priceArs: String(input.priceArs),
    isActive: input.isActive,
    recurrence,
    availableDates,
    audienceTags,
  };
}

export async function listActivities(): Promise<Activity[]> {
  const ds = await getDataSource();
  return ds
    .getRepository<Activity>(ENTITY)
    .find({ order: { createdAt: "DESC" } });
}

export async function getActivity(id: string): Promise<Activity | null> {
  const ds = await getDataSource();
  return ds.getRepository<Activity>(ENTITY).findOne({ where: { id } });
}

export async function createActivity(input: ActivityInput): Promise<Activity> {
  log.info("crear", { title: input.title });
  const ds = await getDataSource();
  const repo = ds.getRepository<Activity>(ENTITY);

  const audienceTags = input.audienceTags ?? (await generateAudienceTags(input));

  const data = normalize(input, audienceTags);
  log.info("availability expandida", {
    kind: data.recurrence?.kind ?? "once",
    dates: data.availableDates.length,
    audienceTags: data.audienceTags.length,
  });
  const entity = repo.create(data);
  const saved = await repo.save(entity);
  log.info("creada — disparando ingesta RAG", { id: saved.id });
  await ingestActivity(saved.id, saved);
  return saved;
}

export async function updateActivity(
  id: string,
  input: ActivityInput,
): Promise<Activity | null> {
  log.info("actualizar", { id });
  const ds = await getDataSource();
  const repo = ds.getRepository<Activity>(ENTITY);
  const existing = await repo.findOne({ where: { id } });
  if (!existing) {
    log.warn("no encontrada", { id });
    return null;
  }

  // Política de tags: 1) si vienen explícitos en input, se respetan;
  // 2) si NO vienen y los campos de texto cambiaron, regeneramos;
  // 3) si NO vienen y nada de texto cambió, conservamos los existentes.
  let audienceTags: string[];
  if (input.audienceTags !== undefined) {
    audienceTags = input.audienceTags;
    log.info("tags overrideados manualmente", { id, count: audienceTags.length });
  } else if (textFieldsChanged(existing, input)) {
    audienceTags = await generateAudienceTags(input);
  } else {
    audienceTags = existing.audienceTags;
    log.debug("tags conservados (nada de texto cambió)", { id });
  }

  const data = normalize(input, audienceTags);
  log.info("availability expandida", {
    id,
    kind: data.recurrence?.kind ?? "once",
    dates: data.availableDates.length,
    audienceTags: data.audienceTags.length,
  });
  await repo.update(id, data);
  const updated = await repo.findOneOrFail({ where: { id } });
  log.info("actualizada — re-ingesta RAG", { id });
  await ingestActivity(id, updated);
  return updated;
}

export async function deleteActivity(id: string): Promise<boolean> {
  log.info("eliminar", { id });
  const ds = await getDataSource();
  const result = await ds.getRepository<Activity>(ENTITY).delete(id);
  const ok = result.affected === 1;
  log[ok ? "info" : "warn"](ok ? "eliminada" : "no encontrada", { id });
  return ok;
}
