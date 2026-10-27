import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClassificationHistory1710000000001 implements MigrationInterface {
    name = 'ClassificationHistory1710000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
              CREATE TABLE IF NOT EXISTS classification_events (
                      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                              request_id uuid NOT NULL REFERENCES customer_requests(id) ON DELETE CASCADE,
                                      category varchar(32) NOT NULL,
                                              confidence double precision NOT NULL,
                                                      message_snapshot text NOT NULL,
                                                              created_at timestamptz NOT NULL DEFAULT now()
                                                                    );
                                                                        `);

      await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_classification_events_request_id
                  ON classification_events(request_id);
                      `);

      await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_classification_events_category
                  ON classification_events(category);
                      `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS classification_events;`);
  }
}
