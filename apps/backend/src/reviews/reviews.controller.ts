import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse,
  ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '../auth/constants/role.constants.js';
import { CurrentUserDecorator } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { CurrentUser } from '../auth/types/jwt-payload.type.js';
import { SWAGGER_ACCESS_TOKEN_SECURITY } from '../swagger.js';
import { CreateReviewDto, ReviewEligibilityDto, ReviewResponseDto, UpdateReviewDto } from './dto/review.dto.js';
import { ReviewQueryDto } from './dto/review-query.dto.js';
import { ReviewsService } from './reviews.service.js';

const uuid = () => new ParseUUIDPipe({ version: '4' });

@ApiTags('Customer Reviews')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('bookings/:bookingId/review')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.CUSTOMER)
export class BookingReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('eligibility')
  @ApiOperation({ summary: 'Customer-owned Booking Review eligibility; all item end snapshots must be past database NOW()' })
  @ApiOkResponse({ type: ReviewEligibilityDto })
  @ApiForbiddenResponse({ description: 'REVIEW_NOT_OWNER or non-CUSTOMER role' })
  eligibility(@CurrentUserDecorator() user: CurrentUser, @Param('bookingId', uuid()) bookingId: string) {
    return this.reviews.eligibility(user.id, bookingId);
  }

  @Post()
  @ApiOperation({ summary: 'Create at most one Review for a completed owned Booking' })
  @ApiCreatedResponse({ type: ReviewResponseDto })
  @ApiConflictResponse({ description: 'REVIEW_BOOKING_NOT_COMPLETED, REVIEW_BOOKING_CANCELLED, REVIEW_ALREADY_EXISTS' })
  @ApiForbiddenResponse({ description: 'REVIEW_NOT_OWNER or non-CUSTOMER role' })
  create(@CurrentUserDecorator() user: CurrentUser, @Param('bookingId', uuid()) bookingId: string,
    @Body() dto: CreateReviewDto) {
    return this.reviews.create(user.id, bookingId, dto);
  }

  @Get()
  @ApiOkResponse({ type: ReviewResponseDto })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND or Booking not found' })
  get(@CurrentUserDecorator() user: CurrentUser, @Param('bookingId', uuid()) bookingId: string) {
    return this.reviews.forBooking(user.id, bookingId);
  }
}

@ApiTags('Customer Reviews')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.CUSTOMER)
export class CustomerReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('me')
  @ApiOkResponse({ description: 'Paginated active Reviews owned by Customer' })
  mine(@CurrentUserDecorator() user: CurrentUser, @Query() query: ReviewQueryDto) {
    return this.reviews.mine(user.id, query);
  }

  @Patch(':reviewId')
  @ApiOkResponse({ type: ReviewResponseDto })
  @ApiForbiddenResponse({ description: 'REVIEW_NOT_OWNER' })
  update(@CurrentUserDecorator() user: CurrentUser, @Param('reviewId', uuid()) reviewId: string,
    @Body() dto: UpdateReviewDto) {
    return this.reviews.update(user.id, reviewId, dto);
  }

  @Delete(':reviewId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Idempotent soft delete; same Booking cannot create another Review row' })
  remove(@CurrentUserDecorator() user: CurrentUser, @Param('reviewId', uuid()) reviewId: string) {
    return this.reviews.remove(user.id, reviewId);
  }
}

@ApiTags('Vendor Reviews')
@Controller('vendors/:vendorId/reviews')
export class PublicVendorReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'Anonymous active verified Booking Reviews and Vendor rating aggregate' })
  @ApiOkResponse({ description: 'One Review per completed Booking, no Customer PII' })
  list(@Param('vendorId', uuid()) vendorId: string, @Query() query: ReviewQueryDto) {
    return this.reviews.forVendor(vendorId, query);
  }
}
