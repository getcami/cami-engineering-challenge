import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const MAX_MESSAGE_LENGTH = 2000;

export class ClassifyRequestDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'message must be a non-empty string' })
  @MaxLength(MAX_MESSAGE_LENGTH)
  message!: string;

  /** If set, the result is also applied to this customer request. */
  @IsOptional()
  @IsUUID()
  requestId?: string;
}
