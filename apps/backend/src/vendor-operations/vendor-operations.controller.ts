import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '../auth/constants/role.constants.js';
import { CurrentUserDecorator } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { CurrentUser } from '../auth/types/jwt-payload.type.js';
import { SWAGGER_ACCESS_TOKEN_SECURITY } from '../swagger.js';
import { VendorAnalyticsService } from './vendor-analytics.service.js';
import { VendorBookingsService } from './vendor-bookings.service.js';
import { VendorBookingsQueryDto, VendorPeriodQueryDto } from './vendor-operations.dto.js';

@ApiTags('Vendor Bookings')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('vendor/bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.VENDOR)
export class VendorBookingsController {
  constructor(private readonly bookings: VendorBookingsService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated Vendor-owned Booking list; date filter uses Booking.createdAt' })
  @ApiOkResponse({ description: 'Safe Booking summaries and pagination' })
  @ApiForbiddenResponse({ description: 'Approved Vendor profile required' })
  list(@CurrentUserDecorator() user: CurrentUser, @Query() query: VendorBookingsQueryDto) {
    return this.bookings.list(user.id, query);
  }

  @Get(':bookingId')
  @ApiOperation({ summary: 'Vendor-owned Booking detail with Ticket counts and financial snapshots' })
  @ApiOkResponse({ description: 'No customer PII or Ticket credentials' })
  detail(@CurrentUserDecorator() user: CurrentUser,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string) {
    return this.bookings.detail(user.id, bookingId);
  }
}

@ApiTags('Vendor Dashboard')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('vendor/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.VENDOR)
export class VendorDashboardController {
  constructor(private readonly analytics: VendorAnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Booking, payment-cohort financial, and Slot occupancy KPIs' })
  @ApiOkResponse({ description: 'Money is decimal strings; rates are basis points' })
  overview(@CurrentUserDecorator() user: CurrentUser, @Query() query: VendorPeriodQueryDto) {
    return this.analytics.overview(user.id, query);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Payment-cohort revenue, refunds, commission estimates, and trend' })
  revenue(@CurrentUserDecorator() user: CurrentUser, @Query() query: VendorPeriodQueryDto) {
    return this.analytics.overview(user.id, query).then(({ period, financial, revenueTrend }) => ({ period, financial, revenueTrend }));
  }

  @Get('occupancy')
  @ApiOperation({ summary: 'Slot capacity and confirmed Reservation occupancy' })
  occupancy(@CurrentUserDecorator() user: CurrentUser, @Query() query: VendorPeriodQueryDto) {
    return this.analytics.overview(user.id, query).then(({ period, occupancy }) => ({ period, occupancy }));
  }
}
