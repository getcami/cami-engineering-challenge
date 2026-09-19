import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestsModule } from './requests/requests.module';
import { ClassificationsModule } from './classifications/classifications.module';
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
    ClassificationsModule,
    RequestsModule,
  ],
  providers: [
    {
      // Registered here (not in main.ts) so the same validation applies to
      // integration tests that build the module without bootstrapping main.ts.
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}
