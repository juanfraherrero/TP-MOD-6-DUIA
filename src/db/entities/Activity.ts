import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import type { Relation } from "typeorm";
import { ActivityChunk } from "./ActivityChunk";
import type { Recurrence } from "@/lib/validation/recurrence";

@Entity("activities")
export class Activity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "text" })
  description!: string;

  @Column({ type: "varchar", length: 500, nullable: true, name: "image_url" })
  imageUrl!: string | null;

  @Column({ type: "timestamptz", name: "start_date" })
  startDate!: Date;

  @Column({ type: "timestamptz", name: "end_date" })
  endDate!: Date;

  @Column({ type: "text" })
  requirements!: string;

  @Column({ type: "text", name: "physical_prep" })
  physicalPrep!: string;

  @Column({ type: "int", nullable: true, name: "altitude_m" })
  altitudeM!: number | null;

  @Column({ type: "int", nullable: true, name: "elevation_gain_m" })
  elevationGainM!: number | null;

  @Column({ type: "decimal", precision: 12, scale: 2, name: "price_ars" })
  priceArs!: string;

  @Column({ type: "boolean", default: true, name: "is_active" })
  isActive!: boolean;

  // Patrón de recurrencia. null = actividad one-time (back-compat: las filas
  // históricas del seed se quedan en null y ocurren en start_date).
  @Column({ type: "jsonb", nullable: true })
  recurrence!: Recurrence | null;

  // Availability materializada: lista de fechas ISO (postgres date[]) en las
  // que la actividad ocurre. Se expande en el service al crear/editar, a
  // partir de `recurrence` + `startDate` + `endDate`. Se consulta con GIN.
  @Column({
    type: "date",
    array: true,
    name: "available_dates",
    default: () => "'{}'",
  })
  availableDates!: string[];

  // Etiquetas de "público ideal" generadas por LLM en la ingesta. Se concatenan
  // al texto que va al embedder para enriquecer el match semántico (ver
  // src/lib/services/audience-tags.ts y docs/INFORME_TP.md §data augmentation).
  // El admin puede editarlas manualmente desde el form si el LLM se equivocó.
  @Column({
    type: "text",
    array: true,
    name: "audience_tags",
    default: () => "'{}'",
  })
  audienceTags!: string[];

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => ActivityChunk, (chunk) => chunk.activity, { cascade: true })
  chunks!: Relation<ActivityChunk>[];
}
