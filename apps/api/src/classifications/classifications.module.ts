import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Classification } from './classification.entity';
import { ClassificationsService } from './classifications.service';
import { CLASSIFIER_PROVIDER } from './classifier.provider';
import { KeywordClassifier } from './keyword-classifier';
import { CustomerRequest } from '../requests/customer-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Classification, CustomerRequest])],
  providers: [
    ClassificationsService,
    // The seam for a future LLM: swap this binding, nothing else changes.
    { provide: CLASSIFIER_PROVIDER, useClass: KeywordClassifier },
  ],
  exports: [ClassificationsService],
})
export class ClassificationsModule {}
