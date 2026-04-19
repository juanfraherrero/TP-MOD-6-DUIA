import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Activity } from "./Activity";

// The `embedding` column is declared as `text` at the TypeORM level because
// TypeORM doesn't know pgvector's `vector` type. The initial migration alters
// the column to `vector(384)` and creates an HNSW index for cosine similarity.
// Values are converted between number[] and pgvector's string format via the
// transformer below.
@Entity("activity_chunks")
export class ActivityChunk {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "activity_id" })
  activityId!: string;

  @ManyToOne(() => Activity, (activity) => activity.chunks, { onDelete: "CASCADE" })
  @JoinColumn({ name: "activity_id" })
  activity!: Relation<Activity>;

  @Column({ type: "int", name: "chunk_index" })
  chunkIndex!: number;

  @Column({ type: "text", name: "chunk_text" })
  chunkText!: string;

  @Column({
    type: "text",
    transformer: {
      to: (v: number[] | null) => (v == null ? null : `[${v.join(",")}]`),
      from: (v: string | null) =>
        v == null ? null : v.slice(1, -1).split(",").map(Number),
    },
  })
  embedding!: number[];

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;
}
