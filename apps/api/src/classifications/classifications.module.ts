import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Classification } from './classification.entity';
import { ClassificationsRepository } from './classifications.repository';
import { ClassificationsService } from './classifications.service';
import { CLASSIFIER_PROVIDER } from './classifier.provider';
import { KeywordClassifier } from './keyword-classifier';
import { TypeOrmClassificationsRepository } from './typeorm-classifications.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Classification])],
  providers: [
    ClassificationsService,
    // Two seams, one line each: swap the model here...
    { provide: CLASSIFIER_PROVIDER, useClass: KeywordClassifier },
    // ...or the storage engine here.
    { provide: ClassificationsRepository, useClass: TypeOrmClassificationsRepository },
  ],
  exports: [ClassificationsService],
})
export class ClassificationsModule {}
