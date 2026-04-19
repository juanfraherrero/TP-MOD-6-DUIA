---
name: typeorm-patterns
description: Use when adding, modifying, or debugging TypeORM code in this TP DUIA project — entities with decorators, repository lookups, relations between entities, migrations, or queries that touch pgvector. Enforces the four non-negotiable patterns: (1) string-based getRepository lookups (not class refs), (2) Relation<T> wrappers for entities with circular imports, (3) explicit entity+migration registration in DataSource, (4) raw SQL for pgvector operations. Applies whenever editing files under src/db/ or any file that imports from src/db/entities or src/db/data-source.
---

# TypeORM patterns — TP DUIA

Este proyecto tiene patrones específicos que **deben** seguirse. Violarlos causa errores runtime difíciles de debuggear.

## 1. Lookup de repositorios por TABLE NAME (string)

```ts
// ✅ Correcto — table name literal del @Entity("activities"), inmune a
// minificación de producción Y a multi-bundle de Next dev.
const repo = ds.getRepository<Activity>("activities");

// ⚠️ Funciona en dev pero rompe en PROD build — el class name se mangla a
// "j", "a", etc. con Next minify. Evitar.
const repo = ds.getRepository<Activity>("Activity");

// ❌ Mal — tira EntityMetadataNotFoundError tanto en dev (multi-bundle crea
// fresh class refs) como en prod (minificación cambia la class).
const repo = ds.getRepository(Activity);
```

**Por qué el table name funciona siempre**: el table name es un string literal pasado al decorator `@Entity("nombre_tabla")`. TypeORM lo registra en su metadata map como clave estable. Los class names pueden mangletearse en build de producción (`Activity` → `j`); los table names no se tocan porque son strings literales dentro del código decorado.

**Caso real observado**: en dev con el class name (`"Activity"`) funciona. Después del `npm run build` falla con `EntityMetadataNotFoundError: No metadata for "Activity" was found` porque Next minificó la clase y el nombre registrado es `j`. Solución: usar siempre el table name.

**Mapping del proyecto actual**:

| Entidad | Table name (usar esto) |
|---|---|
| `Activity` | `"activities"` |
| `ActivityChunk` | `"activity_chunks"` |
| `Conversation` | `"conversations"` |
| `Message` | `"messages"` |
| `AnalyticsEvent` | `"events"` |

## 2. Relaciones circulares usan `Relation<T>`

```ts
import type { Relation } from "typeorm";

@Entity("activities")
export class Activity {
  @OneToMany(() => ActivityChunk, (c) => c.activity)
  chunks!: Relation<ActivityChunk>[];   // Relation<T>, NO ActivityChunk[]
}

@Entity("activity_chunks")
export class ActivityChunk {
  @ManyToOne(() => Activity, (a) => a.chunks)
  activity!: Relation<Activity>;        // mismo patrón
}
```

Sin `Relation<T>`, con `emitDecoratorMetadata: true` TypeScript emite `__metadata("design:type", Activity)` al tope del módulo. Los imports circulares provocan **TDZ**: `Cannot access 'Activity' before initialization`.

## 3. DataSource — listas explícitas, no globs

```ts
// src/db/data-source.ts
import { Activity, ActivityChunk, ... } from "./entities";
import { Init1776499200000 } from "./migrations/1776499200000-Init";

export const AppDataSource = new DataSource({
  entities: [Activity, ActivityChunk, Conversation, Message, AnalyticsEvent],
  migrations: [Init1776499200000],
  synchronize: false,         // ← SIEMPRE false
  migrationsRun: true,         // ← aplica migraciones pendientes al boot
  ...
});
```

Los glob patterns (`"src/db/entities/*.ts"`) **rompen** porque Next bundlea el server.

## 4. pgvector — raw SQL siempre

TypeORM no conoce `<=>` (cosine distance), `<->` (L2), ni el cast `::vector`. Usar `ds.query()`:

```ts
// Insert
await ds.query(
  `INSERT INTO activity_chunks (activity_id, chunk_index, chunk_text, embedding)
   VALUES ($1, $2, $3, $4::vector)`,
  [activityId, i, chunk, toVectorLiteral(vec)],
);

// Search
await ds.query(
  `SELECT id FROM activity_chunks
   ORDER BY embedding <=> $1::vector
   LIMIT $2`,
  [toVectorLiteral(queryVec), topK],
);
```

Ver `src/rag/retrieve.ts` para ejemplo completo con filters + dedupe por activity.

## 5. `synchronize: true` está prohibido

**Razón**: pgvector tiene el tipo `vector(N)` que TypeORM no conoce. Con synchronize, la columna embedding se recreaba como `text` en cada restart, destruyendo el índice HNSW.

Schema changes = **nueva migración**:

```ts
// src/db/migrations/<unixMs>-DescribeChange.ts
export class DescribeChange<unixMs> implements MigrationInterface {
  public async up(qr: QueryRunner) {
    await qr.query(`ALTER TABLE ...`);
  }
  public async down(qr: QueryRunner) {
    await qr.query(`...`);
  }
}
```

Después agregarla al array `migrations` de `DataSource`. `migrationsRun: true` la aplica en el próximo boot.

## 6. DataSource se cachea en `globalThis`

No crear nuevos DataSources en otros archivos. Siempre:

```ts
import { getDataSource } from "@/db/data-source";
const ds = await getDataSource();
```

El singleton sobrevive HMR de Next.
