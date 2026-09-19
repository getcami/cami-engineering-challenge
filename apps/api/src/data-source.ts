import { DataSource } from 'typeorm';
import { databaseUrl, ENTITIES, MIGRATIONS } from './database/database.config';

export function createDataSource() {
  return new DataSource({
    type: 'postgres',
    url: databaseUrl(),
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: false,
    logging: false,
  });
}
