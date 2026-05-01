import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from "typeorm";
import type { Relation } from "typeorm";
import { ActivityChunk } from "./ActivityChunk";
import { Department } from "./Department";
import { Classification } from "./Classification";
import type { Recurrence } from "@/lib/validation/recurrence";

export type GalleryImage = {
  full: string | null;
  thumb: string | null;
  caption: string | null;
};

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

  @Column({ type: "numeric", precision: 9, scale: 6, nullable: true })
  lat!: number | null;

  @Column({ type: "numeric", precision: 9, scale: 6, nullable: true })
  lng!: number | null;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  gallery!: GalleryImage[];

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    unique: true,
    name: "source_slug",
  })
  sourceSlug!: string | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => ActivityChunk, (chunk) => chunk.activity, { cascade: true })
  chunks!: Relation<ActivityChunk>[];

  @ManyToMany(() => Department, { cascade: false })
  @JoinTable({
    name: "activity_departments",
    joinColumn: { name: "activity_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "department_id", referencedColumnName: "id" },
  })
  departments!: Relation<Department>[];

  @ManyToMany(() => Classification, { cascade: false })
  @JoinTable({
    name: "activity_classifications",
    joinColumn: { name: "activity_id", referencedColumnName: "id" },
    inverseJoinColumn: {
      name: "classification_id",
      referencedColumnName: "id",
    },
  })
  classifications!: Relation<Classification>[];
}
