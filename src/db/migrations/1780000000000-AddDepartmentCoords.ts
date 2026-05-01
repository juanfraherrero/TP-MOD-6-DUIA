import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDepartmentCoords1780000000000 implements MigrationInterface {
  name = "AddDepartmentCoords1780000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE departments
        ADD COLUMN lat numeric(9,6) NULL,
        ADD COLUMN lng numeric(9,6) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE departments
        DROP COLUMN IF EXISTS lng,
        DROP COLUMN IF EXISTS lat`,
    );
  }
}
