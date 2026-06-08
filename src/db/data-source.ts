import "reflect-metadata";
// En el CLI de TypeORM (`npm run migration:*`, scripts/seed*) no hay carga
// automática del .env como sí tiene Next.js. Cargamos dotenv acá para que
// process.env.DATABASE_URL esté disponible. En Next.js / Vercel ya lo está
// y dotenv hace no-op si no encuentra archivo.
import "dotenv/config";
import { DataSource } from "typeorm";
import {
  Activity,
  ActivityChunk,
  Conversation,
  Message,
  AnalyticsEvent,
  Department,
  Classification,
} from "./entities";
import { Init1776499200000 } from "./migrations/1776499200000-Init";
import { AddRecurrence1777200000000 } from "./migrations/1777200000000-AddRecurrence";
import { AddAudienceTags1777400000000 } from "./migrations/1777400000000-AddAudienceTags";
import { AddTaxonomiesAndGeo1778000000000 } from "./migrations/1778000000000-AddTaxonomiesAndGeo";
import { DropMapsUrl1779000000000 } from "./migrations/1779000000000-DropMapsUrl";
import { AddDepartmentCoords1780000000000 } from "./migrations/1780000000000-AddDepartmentCoords";
import { EmbeddingTo768Dim1781000000000 } from "./migrations/1781000000000-EmbeddingTo768";

const globalForDataSource = globalThis as unknown as {
  __dataSource?: DataSource;
};

// Supabase y la mayoría de Postgres gestionados requieren SSL. Localhost no.
// rejectUnauthorized:false porque el cert de Supabase no siempre verifica
// limpio desde el ambiente serverless de Vercel, y para una conexión que
// igual viaja por TLS no necesitamos validación estricta del chain.
const databaseUrl = process.env.DATABASE_URL ?? "";
const isLocalDb =
  databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");
const sslConfig = isLocalDb ? false : { rejectUnauthorized: false };

export const AppDataSource =
  globalForDataSource.__dataSource ??
  new DataSource({
    type: "postgres",
    url: process.env.DATABASE_URL,
    ssl: sslConfig,
    entities: [
      Activity,
      ActivityChunk,
      Conversation,
      Message,
      AnalyticsEvent,
      Department,
      Classification,
    ],
    migrations: [
      Init1776499200000,
      AddRecurrence1777200000000,
      AddAudienceTags1777400000000,
      AddTaxonomiesAndGeo1778000000000,
      DropMapsUrl1779000000000,
      AddDepartmentCoords1780000000000,
      EmbeddingTo768Dim1781000000000,
    ],
    synchronize: false,
    migrationsRun: true,
    logging: process.env.NODE_ENV === "development",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDataSource.__dataSource = AppDataSource;
}

export async function getDataSource(): Promise<DataSource> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  return AppDataSource;
}
