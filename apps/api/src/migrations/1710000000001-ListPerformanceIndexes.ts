import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supports the single-query list endpoint (see RequestsService.list):
 *
 * - (request_id, created_at DESC) lets "note count" and "latest note" for a
 *   request be answered from the index alone, without sorting that request's notes.
 *   It supersedes idx_request_notes_request_id for these lookups, but that older
 *   index is left in place: dropping it is a separate, optional cleanup and this
 *   migration is kept purely additive so it is safe to deploy before or after the code.
 * - (created_at DESC, id DESC) matches the list ORDER BY (id is the tie-breaker),
 *   which is what makes a future LIMIT/OFFSET or keyset page cheap.
 *
 * NOTE: not CREATE INDEX CONCURRENTLY, because TypeORM runs each migration in a
 * transaction. That is fine at this size; on a large production table this should
 * be shipped as a non-transactional migration.
 */
export class ListPerformanceIndexes1710000000001 implements MigrationInterface {
  name = 'ListPerformanceIndexes1710000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_request_notes_request_id_created_at
      ON request_notes (request_id, created_at DESC, id DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_requests_created_at_id
      ON customer_requests (created_at DESC, id DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_customer_requests_created_at_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_request_notes_request_id_created_at;`);
  }
}
