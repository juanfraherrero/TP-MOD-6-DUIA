import "reflect-metadata";
import { DataSource } from "typeorm";
import {
  Activity,
  ActivityChunk,
  Conversation,
  Message,
  AnalyticsEvent,
} from "./entities";
import { Init1776499200000 } from "./migrations/1776499200000-Init";
import { AddRecurrence1777200000000 } from "./migrations/1777200000000-AddRecurrence";
import { AddAudienceTags1777400000000 } from "./migrations/1777400000000-AddAudienceTags";

const globalForDataSource = globalThis as unknown as {
  __dataSource?: DataSource;
};

export const AppDataSource =
  globalForDataSource.__dataSource ??
  new DataSource({
    type: "postgres",
    url: process.env.DATABASE_URL,
    entities: [Activity, ActivityChunk, Conversation, Message, AnalyticsEvent],
    migrations: [
      Init1776499200000,
      AddRecurrence1777200000000,
      AddAudienceTags1777400000000,
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

export default AppDataSource;
