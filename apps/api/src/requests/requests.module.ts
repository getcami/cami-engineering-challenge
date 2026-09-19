import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassificationsModule } from '../classifications/classifications.module';
import { CustomerRequest } from './customer-request.entity';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerRequest]), ClassificationsModule],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
