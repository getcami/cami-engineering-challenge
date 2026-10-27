import { DataSource } from 'typeorm';
import { CustomerRequest } from './requests/customer-request.entity';
import { RequestNote } from './requests/request-note.entity';
import { ClassificationEvent } from './requests/classification-event.entity';
import { InitialSchema1710000000000 } from './migrations/1710000000000-InitialSchema';
import { ClassificationHistory1710000000001 } from './migrations/1710000000001-ClassificationHistory';

export function createDataSource() {
  return new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL ?? 'postgres://cami:cami@localhost:5432/cami',
    entities: [CustomerRequest, RequestNote, ClassificationEvent],
    migrations: [InitialSchema1710000000000, ClassificationHistory1710000000001],
    synchronize: false,
    logging: false,
  });
}
