import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";
import type { Device } from "../types";

@Entity("events")
export class AnalyticsEvent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 100, name: "session_id" })
  sessionId!: string;

  @Column({ type: "varchar", length: 50, name: "event_type" })
  eventType!: string;

  @Column({ type: "varchar", length: 20 })
  device!: Device;

  @Column({ type: "varchar", length: 500, nullable: true })
  path!: string | null;

  @Column({ type: "jsonb", default: {} })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;
}
