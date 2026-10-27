import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerRequest } from './customer-request.entity';
import { RequestNote } from './request-note.entity';
import { ClassificationEvent } from './classification-event.entity';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { KeywordClassifier } from './keyword-classifier';
import { CLASSIFIER_PROVIDER } from './classifier-provider.interface';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerRequest, RequestNote, ClassificationEvent])],
  controllers: [RequestsController],
  providers: [
    RequestsService,
    {
      provide: CLASSIFIER_PROVIDER,
      useClass: KeywordClassifier,
    },
  ],
})
export class RequestsModule {}
