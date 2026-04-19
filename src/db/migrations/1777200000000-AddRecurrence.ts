import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRecurrence1777200000000 implements MigrationInterface {
  name = "AddRecurrence1777200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Patrón de recurrencia como discriminated union en jsonb.
    // null = actividad one-time (ocurre en start_date exactamente).
    await queryRunner.query(
      `ALTER TABLE activities ADD COLUMN recurrence jsonb`,
    );

    // Availability materializada: lista de fechas concretas en que la
    // actividad tiene lugar. Expandida al escribir (ver expandAvailableDates).
    await queryRunner.query(
      `ALTER TABLE activities ADD COLUMN available_dates date[] NOT NULL DEFAULT '{}'`,
    );

    // Índice GIN para queries tipo `targetDate = ANY(available_dates)` y
    // `available_dates && ARRAY[...]` (overlap por rango).
    await queryRunner.query(
      `CREATE INDEX activities_available_dates_idx ON activities USING GIN (available_dates)`,
    );

    // Backfill: todas las actividades actuales son one-time → available_dates
    // queda seteado a [start_date::date]. Preserva back-compat con el seed.
    await queryRunner.query(
      `UPDATE activities SET available_dates = ARRAY[start_date::date]`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS activities_available_dates_idx`,
    );
    await queryRunner.query(
      `ALTER TABLE activities DROP COLUMN IF EXISTS available_dates`,
    );
    await queryRunner.query(
      `ALTER TABLE activities DROP COLUMN IF EXISTS recurrence`,
    );
  }
}
