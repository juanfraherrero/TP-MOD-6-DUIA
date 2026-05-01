import { MigrationInterface, QueryRunner } from "typeorm";

export class DropMapsUrl1779000000000 implements MigrationInterface {
  name = "DropMapsUrl1779000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE activities DROP COLUMN IF EXISTS maps_url`,
    );
  }

  // Schema-reversible solo: la columna vuelve, los datos no.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE activities ADD COLUMN maps_url varchar(500) NULL`,
    );
  }
}
