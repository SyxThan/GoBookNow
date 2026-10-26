import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiConflictResponse,
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
import { CustomerBookingReadService } from './customer-booking-read.service.js';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto.js';
import { BookingResponseDto } from './dto/booking-response.dto.js';
import { CreateBookingHoldDto } from './dto/create-booking-hold.dto.js';
import {
  BookingCancellationResultDto,
  CancellationPreviewResponseDto,
  CancelBookingDto,
} from './dto/booking-cancellation.dto.js';
import { BookingCancellationService } from './cancellation/booking-cancellation.service.js';

@ApiTags('Bookings')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.CUSTOMER)
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly customerBookings: CustomerBookingReadService,
    private readonly cancellations: BookingCancellationService,
  ) {}

  @Get('me')
  @ApiOkResponse({
    description: 'Paginated bookings owned by the authenticated customer.',
  })
  listMine(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: ListBookingsQueryDto,
  ) {
    return this.customerBookings.list(user.id, query);
  }

  @Get(':bookingId')
  @ApiOkResponse({
    description:
      'Read-only customer-owned booking, payment, refund and ticket summary.',
  })
  detail(
    @CurrentUserDecorator() user: CurrentUser,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
  ) {
    return this.customerBookings.detail(user.id, bookingId);
  }

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

  @Post(':bookingId/cancellation/preview')
  @HttpCode(200)
  @ApiOkResponse({
    type: CancellationPreviewResponseDto,
    description:
      'Immutable item-level policy preview. The command recalculates at confirmation time.',
  })
  @ApiConflictResponse({
    description:
      'BOOKING_NOT_CONFIRMED, INCONSISTENT_PAYMENT_STATE, INCONSISTENT_RESERVATION_STATE, TICKET_ALREADY_USED, POLICY_SNAPSHOT_MISSING, or BOOKING_AMOUNT_MISMATCH.',
  })
  previewCancellation(
    @CurrentUserDecorator() user: CurrentUser,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
  ): Promise<CancellationPreviewResponseDto> {
    return this.cancellations.preview(user.id, bookingId);
  }

  @Post(':bookingId/cancel')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Stable cancellation request key, 1..100 characters.',
  })
  @ApiCreatedResponse({
    type: BookingCancellationResultDto,
    description:
      'Booking, Reservations, Tickets, audit record, and optional PENDING Refund committed atomically.',
  })
  @ApiOkResponse({
    type: BookingCancellationResultDto,
    description: 'Idempotent replay of the existing cancellation.',
  })
  @ApiConflictResponse({
    description:
      'PARTIAL_CANCELLATION_REQUIRED, CANCELLATION_NOT_ALLOWED, TICKET_ALREADY_USED, POLICY_SNAPSHOT_MISSING, BOOKING_AMOUNT_MISMATCH, inconsistent aggregate state, or idempotency conflict.',
  })
  async cancel(
    @CurrentUserDecorator() user: CurrentUser,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Headers('idempotency-key')
    idempotencyKeyHeader: string | string[] | undefined,
    @Body() dto: CancelBookingDto = {},
    @Res({ passthrough: true }) response: Response,
  ): Promise<BookingCancellationResultDto> {
    const result = await this.cancellations.cancel({
      actorUserId: user.id,
      bookingId,
      idempotencyKey: this.parseIdempotencyKey(idempotencyKeyHeader),
      reasonNote: dto.reasonNote,
    });
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
