import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ClassificationHistoryPage,
  ClassificationRecord,
  ClassificationsService,
} from '../classifications/classifications.service';
import { ClassifyRequestDto } from '../classifications/dto/classify-request.dto';
import { HistoryQueryDto } from '../classifications/dto/history-query.dto';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { RequestDetail, RequestListItem, RequestsService } from './requests.service';

/**
 * HTTP layer only: parse/validate input (DTOs + pipes), delegate, return.
 * Business rules live in RequestsService / ClassificationsService /
 * classification-policy; validation failures are 400s from the global
 * ValidationPipe rather than `{ error }` bodies with a 200.
 *
 * Route order matters: the static routes (`history`, `classify`) are declared
 * before `:id` so they are never captured as an id. ParseUUIDPipe on `:id` is a
 * second line of defence: a mis-ordered route would fail loudly with a 400.
 */
@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly classificationsService: ClassificationsService,
  ) {}

  @Get()
  list(): Promise<RequestListItem[]> {
    return this.requestsService.list();
  }

  @Get('history')
  history(@Query() query: HistoryQueryDto): Promise<ClassificationHistoryPage> {
    return this.classificationsService.history(query);
  }

  @Post('classify')
  classify(@Body() dto: ClassifyRequestDto): Promise<ClassificationRecord> {
    return this.classificationsService.classify(dto);
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string): Promise<RequestDetail> {
    return this.requestsService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateRequestDto): Promise<RequestDetail> {
    return this.requestsService.create(dto.message);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ): Promise<RequestDetail> {
    return this.requestsService.updateStatus(id, dto.status);
  }
}
