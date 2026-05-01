import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity("departments")
export class Department {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "varchar", length: 120, unique: true })
  slug!: string;

  // Coordenadas de la cabecera departamental. Se cargan en el seed
  // (`scripts/seed-la-rioja.ts`) con datos oficiales (Wikipedia / IGN AR).
  // pg-node devuelve `numeric` como string — el consumer (places service,
  // retrieve) normaliza a number cuando hace falta para cálculos.
  @Column({ type: "numeric", precision: 9, scale: 6, nullable: true })
  lat!: number | null;

  @Column({ type: "numeric", precision: 9, scale: 6, nullable: true })
  lng!: number | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;
}
