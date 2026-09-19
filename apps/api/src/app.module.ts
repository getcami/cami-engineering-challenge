import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestsModule } from './requests/requests.module';
import { databaseUrl, ENTITIES, loggingOptions } from './database/database.config';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: databaseUrl(),
      entities: ENTITIES,
      synchronize: false,
      logging: loggingOptions(),
    }),
    RequestsModule,
  ],
})
export class AppModule {}
