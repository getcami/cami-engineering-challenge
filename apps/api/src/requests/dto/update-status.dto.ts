import { IsIn } from 'class-validator';
import { REQUEST_STATUSES, RequestStatus } from '../customer-request.entity';

export class UpdateStatusDto {
  @IsIn(REQUEST_STATUSES)
  status!: RequestStatus;
}
