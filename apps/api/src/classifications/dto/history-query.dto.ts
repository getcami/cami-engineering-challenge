import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CLASSIFICATION_CATEGORIES, ClassificationCategory } from '../classifier.provider';

export const HISTORY_DEFAULT_LIMIT = 50;
export const HISTORY_MAX_LIMIT = 200;
export const HISTORY_MAX_SEARCH_LENGTH = 200;

export class HistoryQueryDto {
  @IsOptional()
  @IsIn(CLASSIFICATION_CATEGORIES)
  category?: ClassificationCategory;

  @IsOptional()
  @IsUUID()
  requestId?: string;

  /** Case-insensitive "message contains". Blank is treated as not provided. */
  @IsOptional()
  @Transform(({ value }) => {
    const trimmed = typeof value === 'string' ? value.trim() : value;
    return trimmed === '' ? undefined : trimmed;
  })
  @IsString()
  @MaxLength(HISTORY_MAX_SEARCH_LENGTH)
  search?: string;

  /** ISO 8601 instant, inclusive. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  /** ISO 8601 instant, exclusive. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

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
