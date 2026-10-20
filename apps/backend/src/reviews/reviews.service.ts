import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import { isBookingCompleted } from '../bookings/booking-completion.rules.js';
import type { CreateReviewDto, UpdateReviewDto } from './dto/review.dto.js';
import type { ReviewQueryDto } from './dto/review-query.dto.js';

const reviewSelect = { id: true, bookingId: true, rating: true, comment: true,
  createdAt: true, updatedAt: true } as const satisfies Prisma.ReviewSelect;
type ReviewRecord = Prisma.ReviewGetPayload<{ select: typeof reviewSelect }>;

function serialize(review: ReviewRecord) {
  return { ...review, createdAt: review.createdAt.toISOString(), updatedAt: review.updatedAt.toISOString() };
}

function domainError(code: string, message: string) {
  return new ConflictException({ code, message });
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  private async dbNow(client: PrismaService | Prisma.TransactionClient): Promise<Date> {
    const [row] = await client.$queryRaw<[{ now: Date }]>`SELECT NOW() AS now`;
    return row.now;
  }

  private async ownedBooking(client: PrismaService | Prisma.TransactionClient, bookingId: string, customerId: string) {
    const booking = await client.booking.findUnique({ where: { id: bookingId }, select: {
      customerId: true, status: true, items: { select: { slotEndAtSnapshot: true } },
      review: { select: { id: true, deletedAt: true } },
    } });
    if (!booking) throw new NotFoundException({ code: 'REVIEW_BOOKING_NOT_FOUND', message: 'Booking not found' });
    if (booking.customerId !== customerId) throw new ForbiddenException({ code: 'REVIEW_NOT_OWNER', message: 'Booking is not owned by Customer' });
    return booking;
  }

  private eligibilityReason(booking: { status: BookingStatus; items: { slotEndAtSnapshot: Date }[];
    review: { id: string; deletedAt: Date | null } | null }, now: Date) {
    if (booking.status === BookingStatus.CANCELLED) return 'REVIEW_BOOKING_CANCELLED';
    if (!isBookingCompleted(booking, now)) return 'REVIEW_BOOKING_NOT_COMPLETED';
    if (booking.review) return 'REVIEW_ALREADY_EXISTS';
    return 'ELIGIBLE';
  }

  async eligibility(customerId: string, bookingId: string) {
    const booking = await this.ownedBooking(this.prisma, bookingId, customerId);
    const now = await this.dbNow(this.prisma);
    const reason = this.eligibilityReason(booking, now);
    return { eligible: reason === 'ELIGIBLE', reason,
      reviewId: booking.review?.deletedAt ? null : booking.review?.id ?? null,
      reviewDeleted: Boolean(booking.review?.deletedAt) };
  }

  async create(customerId: string, bookingId: string, dto: CreateReviewDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Booking-first lock serializes eligibility against Booking cancellation
        // and serializes competing POSTs. UNIQUE(booking_id) remains the final guard.
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
        const booking = await this.ownedBooking(tx, bookingId, customerId);
        const reason = this.eligibilityReason(booking, await this.dbNow(tx));
        if (reason !== 'ELIGIBLE') throw domainError(reason, 'Booking cannot be reviewed');
        const review = await tx.review.create({ data: { bookingId, rating: dto.rating,
          comment: dto.comment?.trim() || null }, select: reviewSelect });
        return serialize(review);
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw domainError('REVIEW_ALREADY_EXISTS', 'Booking already has a Review');
      }
      throw error;
    }
  }

  async forBooking(customerId: string, bookingId: string) {
    await this.ownedBooking(this.prisma, bookingId, customerId);
    const review = await this.prisma.review.findFirst({ where: { bookingId, deletedAt: null }, select: reviewSelect });
    if (!review) throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Review not found' });
    return serialize(review);
  }

  async mine(customerId: string, query: ReviewQueryDto) {
    const page = query.page ?? 1; const limit = query.limit ?? 20;
    const where: Prisma.ReviewWhereInput = { deletedAt: null, booking: { customerId } };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({ where, select: { ...reviewSelect,
        booking: { select: { bookingCode: true, vendor: { select: { displayName: true } } } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    ]);
    return { data: rows.map(({ booking, ...review }) => ({ ...serialize(review),
      bookingCode: booking.bookingCode, vendorName: booking.vendor.displayName })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  private async ownedReview(reviewId: string, customerId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId },
      select: { id: true, deletedAt: true, booking: { select: { customerId: true } } } });
    if (!review) throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Review not found' });
    if (review.booking.customerId !== customerId) throw new ForbiddenException({ code: 'REVIEW_NOT_OWNER', message: 'Review is not owned by Customer' });
    return review;
  }

  async update(customerId: string, reviewId: string, dto: UpdateReviewDto) {
    if (dto.rating === undefined && dto.comment === undefined) throw new BadRequestException('At least one Review field is required');
    const existing = await this.ownedReview(reviewId, customerId);
    if (existing.deletedAt) throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Review not found' });
    const updated = await this.prisma.review.updateMany({ where: { id: reviewId, deletedAt: null },
      data: { ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
        ...(dto.comment !== undefined ? { comment: dto.comment?.trim() || null } : {}) } });
    if (updated.count !== 1) throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Review not found' });
    return serialize(await this.prisma.review.findUniqueOrThrow({ where: { id: reviewId }, select: reviewSelect }));
  }

  async remove(customerId: string, reviewId: string): Promise<void> {
    const review = await this.ownedReview(reviewId, customerId);
    if (review.deletedAt) return;
    await this.prisma.review.updateMany({ where: { id: reviewId, deletedAt: null },
      data: { deletedAt: await this.dbNow(this.prisma) } });
  }

  async forVendor(vendorId: string, query: ReviewQueryDto) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id: vendorId, deletedAt: null }, select: { id: true } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const now = await this.dbNow(this.prisma);
    const page = query.page ?? 1; const limit = query.limit ?? 20;
    const where: Prisma.ReviewWhereInput = { deletedAt: null, booking: {
      vendorId, status: BookingStatus.CONFIRMED,
      items: { some: {}, none: { slotEndAtSnapshot: { gt: now } } },
    } };
    const [aggregate, distribution, rows] = await Promise.all([
      this.prisma.review.aggregate({ where, _count: { _all: true }, _avg: { rating: true } }),
      this.prisma.review.groupBy({ by: ['rating'], where, _count: { _all: true } }),
      this.prisma.review.findMany({ where, select: reviewSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    ]);
    const total = aggregate._count._all;
    return { reviewCount: total, averageRating: aggregate._avg.rating === null ? null :
      Number(aggregate._avg.rating.toFixed(2)),
      ratingDistribution: Object.fromEntries([1, 2, 3, 4, 5].map((rating) =>
        [rating, distribution.find((entry) => entry.rating === rating)?._count._all ?? 0])),
      data: rows.map((review) => ({ rating: review.rating, comment: review.comment,
        createdAt: review.createdAt.toISOString(), author: 'Khách đã đặt dịch vụ' })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}
