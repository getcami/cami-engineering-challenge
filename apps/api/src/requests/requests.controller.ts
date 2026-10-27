import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RequestsService } from './requests.service';
import { IClassifierProvider, CLASSIFIER_PROVIDER } from './classifier-provider.interface';
import { RequestStatus } from './customer-request.entity';

@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requestsService: RequestsService,
    @Inject(CLASSIFIER_PROVIDER)
    private readonly classifier: IClassifierProvider,
  ) {}

  @Get()
  list() {
    return this.requestsService.list();
  }

  @Get('history')
  history(@Query('category') category?: string) {
    return this.requestsService.listHistory(category);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.requestsService.getById(id);
  }

  @Post()
  create(@Body() body: { message?: string }) {
    if (!body?.message || typeof body.message !== 'string') {
      throw new BadRequestException('message is required');
    }
    return this.requestsService.create(body.message);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status?: RequestStatus }) {
    if (!body?.status) {
      throw new BadRequestException('status is required');
    }
    return this.requestsService.updateStatus(id, body.status);
  }

  /**
   * Task 4: controller is now a thin router.
   * Validation lives here; classification logic and persistence live in the service.
   */
  @Post('classify')
  async classify(@Body() body: { message?: unknown; requestId?: unknown }) {
    const message = body?.message;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new BadRequestException('message must be a non-empty string');
    }
    if (message.length > 2000) {
      throw new BadRequestException('message too long');
    }

    const requestId =
      typeof body.requestId === 'string' ? body.requestId : undefined;

    const trimmed = message.trim();
    let result = await this.classifier.classify(trimmed);

    // Soften confidence for very short messages.
    if (trimmed.split(/\s+/).length < 3 && result.category !== 'unknown') {
      result = {
        category: result.category,
        confidence: Math.max(0.5, result.confidence - 0.15),
      };
    }

    // Prefer "unknown" when confidence is weak.
    if (result.confidence < 0.55) {
      result = { category: 'unknown', confidence: result.confidence };
    }

    return this.requestsService.applyClassification({
      message: trimmed,
      requestId,
      category: result.category,
      confidence: result.confidence,
    });
  }
}
