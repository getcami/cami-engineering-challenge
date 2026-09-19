import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive migration: creates a new table only, touches nothing existing, so it
 * is safe to run before the new code is deployed (old code ignores the table).
 * The reverse order is NOT safe: new code deployed before this migration will
 * fail on POST /requests/classify and GET /requests/history. Run migrations first.
 */
export class CreateClassifications1710000000002 implements MigrationInterface {
  name = 'CreateClassifications1710000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS classifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id uuid NULL REFERENCES customer_requests(id) ON DELETE SET NULL,
        message text NOT NULL,
        category varchar(32) NOT NULL,
        confidence double precision NOT NULL,
        raw_category varchar(32) NOT NULL,
        raw_confidence double precision NOT NULL,
        provider varchar(64) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_classifications_category
          CHECK (category IN ('support', 'sales', 'billing', 'unknown')),
        CONSTRAINT chk_classifications_raw_category
          CHECK (raw_category IN ('support', 'sales', 'billing', 'unknown')),
        CONSTRAINT chk_classifications_confidence
          CHECK (confidence >= 0 AND confidence <= 1),
        CONSTRAINT chk_classifications_raw_confidence
          CHECK (raw_confidence >= 0 AND raw_confidence <= 1)
      );
    `);

    // History is read newest-first, optionally narrowed by category or request.
    // (id is the tie-breaker so paging is deterministic.)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_classifications_created_at
      ON classifications (created_at DESC, id DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_classifications_category_created_at
      ON classifications (category, created_at DESC, id DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_classifications_request_id_created_at
      ON classifications (request_id, created_at DESC, id DESC)
      WHERE request_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS classifications;`);
  }
}
