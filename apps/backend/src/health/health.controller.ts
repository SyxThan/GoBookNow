import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthService } from './health.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check API and database health' })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'ok',
        database: 'up',
      },
    },
  })
  @ApiServiceUnavailableResponse({
    schema: {
      example: {
        statusCode: 503,
        message: {
          status: 'error',
          database: 'down',
        },
      },
    },
  })
  check() {
    return this.healthService.check();
  }
}
