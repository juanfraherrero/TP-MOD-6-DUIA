import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAudienceTags1777400000000 implements MigrationInterface {
  name = "AddAudienceTags1777400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // audience_tags: lista de etiquetas de "público ideal" generadas por LLM
    // en la ingesta. Se concatenan al texto que va al embedder para que el
    // catálogo tenga señal sobre demografía / nivel / condiciones (ver
    // docs/INFORME_TP.md §data augmentation).
    await queryRunner.query(
      `ALTER TABLE activities ADD COLUMN audience_tags text[] NOT NULL DEFAULT '{}'`,
    );

    // Índice GIN — habilita queries del módulo D tipo
    // `audience_tags @> ARRAY['principiantes']` con O(log n).
    await queryRunner.query(
      `CREATE INDEX activities_audience_tags_idx ON activities USING GIN (audience_tags)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS activities_audience_tags_idx`,
    );
    await queryRunner.query(
      `ALTER TABLE activities DROP COLUMN IF EXISTS audience_tags`,
    );
  }
}
