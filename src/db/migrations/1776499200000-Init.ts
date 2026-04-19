import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1776499200000 implements MigrationInterface {
  name = "Init1776499200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await queryRunner.query(`
      CREATE TABLE activities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title varchar(200) NOT NULL,
        description text NOT NULL,
        image_url varchar(500),
        start_date timestamptz NOT NULL,
        end_date timestamptz NOT NULL,
        requirements text NOT NULL,
        physical_prep text NOT NULL,
        altitude_m int,
        elevation_gain_m int,
        price_ars decimal(12, 2) NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE activity_chunks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        chunk_index int NOT NULL,
        chunk_text text NOT NULL,
        embedding vector(384) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX activity_chunks_embedding_idx
      ON activity_chunks USING hnsw (embedding vector_cosine_ops)
    `);

    await queryRunner.query(`
      CREATE INDEX activity_chunks_activity_id_idx
      ON activity_chunks (activity_id)
    `);

    await queryRunner.query(`
      CREATE TABLE conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id varchar(100) NOT NULL,
        role varchar(20) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX conversations_session_id_idx
      ON conversations (session_id)
    `);

    await queryRunner.query(`
      CREATE TABLE messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role varchar(20) NOT NULL,
        content text NOT NULL,
        tool_calls jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX messages_conversation_id_idx
      ON messages (conversation_id)
    `);

    await queryRunner.query(`
      CREATE TABLE events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id varchar(100) NOT NULL,
        event_type varchar(50) NOT NULL,
        device varchar(20) NOT NULL,
        path varchar(500),
        payload jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX events_created_at_idx ON events (created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX events_session_id_idx ON events (session_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX events_event_type_idx ON events (event_type)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS events`);
    await queryRunner.query(`DROP TABLE IF EXISTS messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS conversations`);
    await queryRunner.query(`DROP TABLE IF EXISTS activity_chunks`);
    await queryRunner.query(`DROP TABLE IF EXISTS activities`);
  }
}
