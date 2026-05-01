import { getDataSource } from "@/db/data-source";
import type { Classification, Department } from "@/db/entities";
import { createLogger } from "@/lib/logger";

const log = createLogger("svc:taxonomies");

const DEPARTMENTS = "departments";
const CLASSIFICATIONS = "classifications";

export type TaxonomyTerm = { id: string; name: string; slug: string };

function toTerm(row: Department | Classification): TaxonomyTerm {
  return { id: row.id, name: row.name, slug: row.slug };
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function listDepartments(): Promise<TaxonomyTerm[]> {
  const ds = await getDataSource();
  const rows = await ds
    .getRepository<Department>(DEPARTMENTS)
    .find({ order: { name: "ASC" } });
  return rows.map(toTerm);
}

export async function listClassifications(): Promise<TaxonomyTerm[]> {
  const ds = await getDataSource();
  const rows = await ds
    .getRepository<Classification>(CLASSIFICATIONS)
    .find({ order: { name: "ASC" } });
  return rows.map(toTerm);
}

export async function createClassification(name: string): Promise<TaxonomyTerm> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("El nombre de la clasificación no puede estar vacío");
  }
  const slug = slugify(trimmed);
  if (!slug) {
    throw new Error("No se pudo generar un slug válido a partir del nombre");
  }

  log.info("crear clasificación", { name: trimmed, slug });
  const ds = await getDataSource();
  const repo = ds.getRepository<Classification>(CLASSIFICATIONS);

  const existing = await repo.findOne({ where: { slug } });
  if (existing) {
    log.warn("clasificación ya existe", { slug });
    throw new Error(`Ya existe una clasificación con slug "${slug}"`);
  }

  const entity = repo.create({ name: trimmed, slug });
  const saved = await repo.save(entity);
  log.info("clasificación creada", { id: saved.id, slug });
  return toTerm(saved);
}
