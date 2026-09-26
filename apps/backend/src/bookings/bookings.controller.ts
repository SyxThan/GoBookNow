import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { RoleCode } from '../auth/constants/role.constants.js';
import { CurrentUserDecorator } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { CurrentUser } from '../auth/types/jwt-payload.type.js';
import { SWAGGER_ACCESS_TOKEN_SECURITY } from '../swagger.js';
import { BookingsService } from './bookings.service.js';
import { BookingResponseDto } from './dto/booking-response.dto.js';
import { CreateBookingHoldDto } from './dto/create-booking-hold.dto.js';

@ApiTags('Bookings')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.CUSTOMER)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('hold')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique client request key, 1..100 characters.',
  })
  @ApiCreatedResponse({
    type: BookingResponseDto,
    description: 'New Booking hold created.',
  })
  @ApiOkResponse({
    type: BookingResponseDto,
    description: 'Idempotent replay of an existing Booking hold.',
  })
  async hold(
    @CurrentUserDecorator() user: CurrentUser,
    @Headers('idempotency-key')
    idempotencyKeyHeader: string | string[] | undefined,
    @Body() dto: CreateBookingHoldDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BookingResponseDto> {
    const result = await this.bookings.hold(
      user.id,
      this.parseIdempotencyKey(idempotencyKeyHeader),
      dto,
    );
    response.status(result.statusCode);
    return result.body;
  }

  private parseIdempotencyKey(value: string | string[] | undefined): string {
    if (Array.isArray(value)) {
      if (value.length !== 1) {
        throw new BadRequestException('Idempotency-Key must be provided once');
      }
      return this.parseIdempotencyKey(value[0]);
    }

    const key = value?.trim();
    if (!key) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    if (key.length > 100) {
      throw new BadRequestException(
        'Idempotency-Key must be at most 100 characters',
      );
    }
    return key;
  }
}
