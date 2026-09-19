import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_MESSAGE_LENGTH } from '../../classifications/dto/classify-request.dto';

export class CreateRequestDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'message must be a non-empty string' })
  @MaxLength(MAX_MESSAGE_LENGTH)
  message!: string;
}
