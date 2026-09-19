import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassificationsModule } from '../classifications/classifications.module';
import { CustomerRequest } from './customer-request.entity';
import { RequestsController } from './requests.controller';
import { RequestsRepository } from './requests.repository';
import { RequestsService } from './requests.service';
import { TypeOrmRequestsRepository } from './typeorm-requests.repository';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerRequest]), ClassificationsModule],
  controllers: [RequestsController],
  providers: [
    RequestsService,
    // The persistence seam: swap this binding to change the storage engine.
    { provide: RequestsRepository, useClass: TypeOrmRequestsRepository },
  ],
})
export class RequestsModule {}
