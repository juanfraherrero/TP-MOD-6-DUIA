import { In } from "typeorm";
import { getDataSource } from "@/db/data-source";
import type {
  Activity,
  Classification,
  Department,
} from "@/db/entities";
import { createLogger } from "@/lib/logger";
import { ingestActivity } from "@/rag";
import type { ActivityInput } from "@/lib/validation/activity";
import { expandAvailableDates } from "@/lib/recurrence/expand";
import { generateAudienceTags } from "./audience-tags";
import {
  dedupeTagsCaseInsensitive,
  deriveDifficultyTags,
} from "./difficulty-tags";

const log = createLogger("svc:activity");

// Heurística: ¿hace falta re-generar audience_tags por LLM? Solo cuando
// cambian los campos de texto que definen la naturaleza de la actividad. Si
// solo se cambia precio o fecha, conservamos los tags existentes para evitar
// un LLM call innecesario y mantener consistencia.
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

// Comparación de IDs de relaciones M:N. Igual sin importar orden.
function sameIds(
  current: { id: string }[] | undefined,
  next: string[],
): boolean {
  const a = (current ?? []).map((x) => x.id).sort();
  const b = [...next].sort();
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
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
    isActive: input.isActive ?? true,
    recurrence,
    availableDates,
    audienceTags,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    gallery: input.gallery ?? [],
  };
}

async function resolveDepartments(ids: string[] | undefined): Promise<Department[]> {
  if (!ids || ids.length === 0) return [];
  const ds = await getDataSource();
  return ds
    .getRepository<Department>("departments")
    .findBy({ id: In(ids) });
}

async function resolveClassifications(
  ids: string[] | undefined,
): Promise<Classification[]> {
  if (!ids || ids.length === 0) return [];
  const ds = await getDataSource();
  return ds
    .getRepository<Classification>("classifications")
    .findBy({ id: In(ids) });
}

export type ListActivitiesOptions = {
  page?: number;
  pageSize?: number;
};

export type PaginatedActivities = {
  items: Activity[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function listActivities(
  opts: ListActivitiesOptions = {},
): Promise<PaginatedActivities> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  // Cap defensivo: aceptamos pageSize del caller pero limitamos a 100 para
  // que un consumidor mal portado no haga `?size=100000` y pague el costo.
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(opts.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const ds = await getDataSource();
  const [items, total] = await ds
    .getRepository<Activity>(ENTITY)
    .findAndCount({
      order: { createdAt: "DESC" },
      relations: ["departments", "classifications"],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { items, total, page, pageSize, totalPages };
}

export async function getActivity(id: string): Promise<Activity | null> {
  const ds = await getDataSource();
  return ds.getRepository<Activity>(ENTITY).findOne({
    where: { id },
    relations: ["departments", "classifications"],
  });
}

export async function createActivity(input: ActivityInput): Promise<Activity> {
  log.info("crear", { title: input.title });
  const ds = await getDataSource();
  const repo = ds.getRepository<Activity>(ENTITY);

  // Política de tags: el LLM aporta señal demográfica/cualitativa, los
  // derivedTags aportan dimensión cuantitativa derivada de altitud/desnivel.
  // Mergeamos ambos (LLM primero, dedupe case-insensitive). Si el admin
  // overrideó audienceTags en el input, igualmente se le suman los derivados
  // — son sub-señales agnósticas al tipo de actividad y nunca contradicen.
  const llmTags =
    input.audienceTags ?? (await generateAudienceTags(input));
  const derivedTags = deriveDifficultyTags({
    altitudeM: input.altitudeM,
    elevationGainM: input.elevationGainM,
  });
  const audienceTags = dedupeTagsCaseInsensitive([...llmTags, ...derivedTags]);

  const [departments, classifications] = await Promise.all([
    resolveDepartments(input.departmentIds),
    resolveClassifications(input.classificationIds),
  ]);

  const data = normalize(input, audienceTags);
  log.info("availability expandida", {
    kind: data.recurrence?.kind ?? "once",
    dates: data.availableDates.length,
    audienceTags: data.audienceTags.length,
    departments: departments.length,
    classifications: classifications.length,
  });
  const entity = repo.create(data);
  entity.departments = departments;
  entity.classifications = classifications;
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
  const existing = await repo.findOne({
    where: { id },
    relations: ["departments", "classifications"],
  });
  if (!existing) {
    log.warn("no encontrada", { id });
    return null;
  }

  // Política de tags LLM: 1) si vienen explícitos en input, se respetan;
  // 2) si NO vienen y los campos de texto O las taxonomías cambiaron,
  // regeneramos (las clasificaciones/departamentos también dan señal al LLM);
  // 3) si NO vienen y nada cambió, conservamos los existentes — peeling los
  // derivedTags viejos para evitar arrastrar tags si los números cambiaron
  // sin que cambiara el resto del texto.
  const taxonomiesChanged =
    !sameIds(existing.departments, input.departmentIds ?? []) ||
    !sameIds(existing.classifications, input.classificationIds ?? []);

  let llmTags: string[];
  if (input.audienceTags !== undefined) {
    llmTags = input.audienceTags;
    log.info("tags overrideados manualmente", { id, count: llmTags.length });
  } else if (textFieldsChanged(existing, input) || taxonomiesChanged) {
    llmTags = await generateAudienceTags(input);
    if (taxonomiesChanged) {
      log.info("regenerando tags por cambio de taxonomías", { id });
    }
  } else {
    llmTags = existing.audienceTags;
    log.debug("tags LLM conservados (nada de texto/taxonomías cambió)", { id });
  }

  // Los derivedTags se RECALCULAN siempre — son función pura de altitud y
  // desnivel actuales del input. Si esos números no cambiaron, el resultado
  // es idéntico al previo (idempotente). Mergeamos con dedupe.
  const derivedTags = deriveDifficultyTags({
    altitudeM: input.altitudeM,
    elevationGainM: input.elevationGainM,
  });
  const audienceTags = dedupeTagsCaseInsensitive([...llmTags, ...derivedTags]);

  const [departments, classifications] = await Promise.all([
    resolveDepartments(input.departmentIds),
    resolveClassifications(input.classificationIds),
  ]);

  const data = normalize(input, audienceTags);
  log.info("availability expandida", {
    id,
    kind: data.recurrence?.kind ?? "once",
    dates: data.availableDates.length,
    audienceTags: data.audienceTags.length,
    departments: departments.length,
    classifications: classifications.length,
  });
  Object.assign(existing, data);
  existing.departments = departments;
  existing.classifications = classifications;
  await repo.save(existing);
  const updated = await repo.findOneOrFail({
    where: { id },
    relations: ["departments", "classifications"],
  });
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
