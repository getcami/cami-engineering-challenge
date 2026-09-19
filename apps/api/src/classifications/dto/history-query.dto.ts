import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { CLASSIFICATION_CATEGORIES, ClassificationCategory } from '../classifier.provider';

export const HISTORY_DEFAULT_LIMIT = 50;
export const HISTORY_MAX_LIMIT = 200;

export class HistoryQueryDto {
  @IsOptional()
  @IsIn(CLASSIFICATION_CATEGORIES)
  category?: ClassificationCategory;

  @IsOptional()
  @IsUUID()
  requestId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(HISTORY_MAX_LIMIT)
  limit: number = HISTORY_DEFAULT_LIMIT;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
