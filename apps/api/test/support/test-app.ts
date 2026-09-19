import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { DataSource, Logger } from 'typeorm';
import { CLASSIFIER_PROVIDER, ClassifierProvider } from '../../src/classifications/classifier.provider';
import { createDataSource } from '../../src/data-source';

/**
 * Integration tests run against a real Postgres (the same engine as production
 * and CI) but each test file gets its own throwaway schema, so they cannot
 * interfere with each other or with seeded dev data in the `public` schema.
 *
 * The schema is built by running the real migrations, so every integration
 * test also proves the migrations apply cleanly from an empty database.
 */
export const HAS_DATABASE = Boolean(process.env.DATABASE_URL);

class QueryCounter implements Logger {
  queries: string[] = [];
  logQuery(query: string) {
    this.queries.push(query);
  }
  logQueryError() {}
  logQuerySlow() {}
  logSchemaBuild() {}
  logMigration() {}
  log() {}
}

export type TestApp = {
  app: INestApplication;
  dataSource: DataSource;
  /** Queries issued since the last call to `resetQueryLog()`. */
  queryLog: () => string[];
  resetQueryLog: () => void;
  close: () => Promise<void>;
};

export async function createTestApp(options: { provider?: ClassifierProvider } = {}): Promise<TestApp> {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('DATABASE_URL is required for integration tests');
  }

  const schema = `test_${randomUUID().replace(/-/g, '')}`;
  const admin = new Client({ connectionString: baseUrl });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);

  // Point every connection (migrations + the Nest app) at the private schema.
  const url = new URL(baseUrl);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();

  const migrator = createDataSource();
  await migrator.initialize();
  await migrator.runMigrations();
  await migrator.destroy();

  // Imported lazily: AppModule reads DATABASE_URL when it is first loaded.
  const { AppModule } = await import('../../src/app.module');
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.provider) {
    builder = builder.overrideProvider(CLASSIFIER_PROVIDER).useValue(options.provider);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  const dataSource = app.get(DataSource);
  const counter = new QueryCounter();
  // Assigned after init so migrations/connection setup are not counted.
  (dataSource as unknown as { logger: Logger }).logger = counter;

  return {
    app,
    dataSource,
    queryLog: () => counter.queries,
    resetQueryLog: () => {
      counter.queries = [];
    },
    close: async () => {
      await app.close();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}
