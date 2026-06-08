import { MigrationInterface, QueryRunner } from "typeorm";

// Cambio del modelo de embeddings: pasamos de `multilingual-e5-small` (384 dims,
// HuggingFace local) a Gemini `text-embedding-004` (768 dims, API remota).
// El motivo: el bundle de @huggingface/transformers + onnxruntime-node supera
// el límite de 250 MB por función serverless en Vercel, así que dejamos la
// inferencia local y pasamos los embeddings a Gemini API.
//
// Los vectores existentes son incompatibles: distinto modelo + distinta
// dimensión. Esta migration **borra** los chunks de activity_chunks
// y deja la tabla lista para re-ingest. Hay que correr `npm run seed:<región>`
// después de aplicar la migration para repoblar.
export class EmbeddingTo768Dim1781000000000 implements MigrationInterface {
  name = "EmbeddingTo768Dim1781000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS activity_chunks_embedding_idx`);
    await queryRunner.query(`TRUNCATE TABLE activity_chunks`);
    await queryRunner.query(
      `ALTER TABLE activity_chunks ALTER COLUMN embedding TYPE vector(768)`,
    );
    await queryRunner.query(`
      CREATE INDEX activity_chunks_embedding_idx
      ON activity_chunks USING hnsw (embedding vector_cosine_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS activity_chunks_embedding_idx`);
    await queryRunner.query(`TRUNCATE TABLE activity_chunks`);
    await queryRunner.query(
      `ALTER TABLE activity_chunks ALTER COLUMN embedding TYPE vector(384)`,
    );
    await queryRunner.query(`
      CREATE INDEX activity_chunks_embedding_idx
      ON activity_chunks USING hnsw (embedding vector_cosine_ops)
    `);
  }
}
