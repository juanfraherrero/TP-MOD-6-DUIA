import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTaxonomiesAndGeo1778000000000 implements MigrationInterface {
  name = "AddTaxonomiesAndGeo1778000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE departments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(120) NOT NULL,
        slug varchar(120) NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE classifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(120) NOT NULL,
        slug varchar(120) NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE activity_departments (
        activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        PRIMARY KEY (activity_id, department_id)
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE activity_classifications (
        activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        classification_id uuid NOT NULL REFERENCES classifications(id) ON DELETE CASCADE,
        PRIMARY KEY (activity_id, classification_id)
      )`,
    );

    await queryRunner.query(
      `ALTER TABLE activities
        ADD COLUMN lat numeric(9,6) NULL,
        ADD COLUMN lng numeric(9,6) NULL,
        ADD COLUMN maps_url varchar(500) NULL,
        ADD COLUMN gallery jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN source_slug varchar(255) NULL UNIQUE`,
    );

    await queryRunner.query(
      `CREATE INDEX activities_lat_lng_idx ON activities (lat, lng) WHERE lat IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS activities_lat_lng_idx`);

    await queryRunner.query(
      `ALTER TABLE activities
        DROP COLUMN IF EXISTS source_slug,
        DROP COLUMN IF EXISTS gallery,
        DROP COLUMN IF EXISTS maps_url,
        DROP COLUMN IF EXISTS lng,
        DROP COLUMN IF EXISTS lat`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS activity_classifications`);
    await queryRunner.query(`DROP TABLE IF EXISTS activity_departments`);
    await queryRunner.query(`DROP TABLE IF EXISTS classifications`);
    await queryRunner.query(`DROP TABLE IF EXISTS departments`);
  }
}
