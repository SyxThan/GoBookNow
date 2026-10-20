import { Injectable } from '@nestjs/common';
import { BookingStatus, PaymentStatus, Prisma, ReservationStatus, SlotStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import { parsePeriod, VendorBookingsService } from './vendor-bookings.service.js';
import type { VendorPeriodQueryDto } from './vendor-operations.dto.js';

type FinancialRow = {
  invalid_payment_count: bigint;
  paid_revenue: bigint;
  succeeded_refunds: bigint;
  pending_refunds: bigint;
  retained_revenue: bigint;
  estimated_platform_fee: bigint;
  estimated_vendor_earnings: bigint;
  commission_covered_booking_count: bigint;
  commission_unknown_booking_count: bigint;
};
type TrendRow = { day: Date; paid_revenue: bigint; payment_count: bigint };

@Injectable()
export class VendorAnalyticsService {
  constructor(private readonly prisma: PrismaService, private readonly bookings: VendorBookingsService) {}

  async overview(userId: string, query: VendorPeriodQueryDto) {
    const vendorId = await this.bookings.approvedVendorId(userId);
    const now = await this.bookings.dbNow();
    const period = parsePeriod(query, now, true);
    const from = period.from!;
    const to = period.to!;
    const bookingWhere: Prisma.BookingWhereInput = { vendorId, createdAt: { gte: from, lt: to } };
    const eligibleSlotWhere: Prisma.SlotWhereInput = {
      service: { vendorId }, deletedAt: null, status: { not: SlotStatus.CANCELLED },
      startAt: { gte: from, lt: to },
    };
    const [total, confirmed, cancelled, paidBookings, paidCancelled,
      capacity, confirmedQuantity, activeHeldQuantity, financialRows, trendRows] = await Promise.all([
      this.prisma.booking.count({ where: bookingWhere }),
      this.prisma.booking.count({ where: { ...bookingWhere, status: BookingStatus.CONFIRMED } }),
      this.prisma.booking.count({ where: { ...bookingWhere, status: BookingStatus.CANCELLED } }),
      this.prisma.booking.count({ where: { ...bookingWhere, payment: { is: { status: PaymentStatus.SUCCEEDED } } } }),
      this.prisma.booking.count({ where: { ...bookingWhere, status: BookingStatus.CANCELLED,
        payment: { is: { status: PaymentStatus.SUCCEEDED } } } }),
      this.prisma.slot.aggregate({ where: eligibleSlotWhere, _sum: { capacity: true } }),
      this.prisma.reservation.aggregate({ where: { status: ReservationStatus.CONFIRMED,
        slot: { is: eligibleSlotWhere } }, _sum: { quantity: true } }),
      this.prisma.reservation.aggregate({ where: { status: ReservationStatus.HELD,
        expiresAt: { gt: now }, slot: { is: eligibleSlotWhere } }, _sum: { quantity: true } }),
      this.prisma.$queryRaw<FinancialRow[]>`
        WITH paid AS (
          SELECT p.id, p.amount, b.total_amount AS booking_net, b.commission_bps, b.commission_snapshot
          FROM payments p JOIN bookings b ON b.id = p.booking_id
          WHERE b.vendor_id = ${vendorId}::uuid AND p.status = 'SUCCEEDED'
            AND p.succeeded_at >= ${from} AND p.succeeded_at < ${to}
        ), per_payment AS (
          SELECT paid.amount, paid.booking_net, paid.commission_bps, paid.commission_snapshot,
            COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.payment_id = paid.id AND r.status = 'SUCCEEDED'), 0)::bigint AS succeeded,
            COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.payment_id = paid.id AND r.status = 'PENDING'), 0)::bigint AS pending
          FROM paid
        )
        SELECT COUNT(*) FILTER (WHERE amount <> booking_net OR succeeded > amount OR succeeded + pending > amount)::bigint AS invalid_payment_count,
          COALESCE(SUM(amount), 0)::bigint AS paid_revenue,
          COALESCE(SUM(succeeded), 0)::bigint AS succeeded_refunds,
          COALESCE(SUM(pending), 0)::bigint AS pending_refunds,
          COALESCE(SUM(amount - succeeded), 0)::bigint AS retained_revenue,
          COALESCE(SUM(CASE WHEN commission_bps IS NOT NULL AND commission_snapshot IS NOT NULL
            THEN floor((amount - succeeded)::numeric * commission_bps / 10000) END), 0)::bigint AS estimated_platform_fee,
          COALESCE(SUM(CASE WHEN commission_bps IS NOT NULL AND commission_snapshot IS NOT NULL
            THEN (amount - succeeded) - floor((amount - succeeded)::numeric * commission_bps / 10000) END), 0)::bigint AS estimated_vendor_earnings,
          COUNT(*) FILTER (WHERE commission_bps IS NOT NULL AND commission_snapshot IS NOT NULL)::bigint AS commission_covered_booking_count,
          COUNT(*) FILTER (WHERE commission_bps IS NULL OR commission_snapshot IS NULL)::bigint AS commission_unknown_booking_count
        FROM per_payment`,
      this.prisma.$queryRaw<TrendRow[]>`
        SELECT date_trunc('day', p.succeeded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
          SUM(p.amount)::bigint AS paid_revenue, COUNT(*)::bigint AS payment_count
        FROM payments p JOIN bookings b ON b.id = p.booking_id
        WHERE b.vendor_id = ${vendorId}::uuid AND p.status = 'SUCCEEDED'
          AND p.succeeded_at >= ${from} AND p.succeeded_at < ${to}
        GROUP BY 1 ORDER BY 1`,
    ]);
    const money = financialRows[0]!;
    if (money.invalid_payment_count > 0n) throw new Error('VENDOR_FINANCIAL_MISMATCH');
    const totalCapacity = capacity._sum.capacity ?? 0;
    const reserved = confirmedQuantity._sum.quantity ?? 0;
    return {
      period: { from: from.toISOString(), to: to.toISOString(),
        bookingBasis: 'Booking.createdAt', financialBasis: 'Payment.succeededAt cohort; refunds as of query time',
        occupancyBasis: 'Slot.startAt' },
      bookings: { total, confirmed, cancelled, paid: paidBookings,
        paidCancelled, cancellationRateBps: paidBookings === 0 ? 0 : Math.floor(paidCancelled * 10_000 / paidBookings) },
      financial: { paidRevenue: money.paid_revenue.toString(),
        succeededRefunds: money.succeeded_refunds.toString(), pendingRefunds: money.pending_refunds.toString(),
        netRetainedRevenue: money.retained_revenue.toString(),
        estimatedPlatformFee: money.estimated_platform_fee.toString(),
        estimatedVendorEarnings: money.estimated_vendor_earnings.toString(),
        commissionCoveredBookingCount: Number(money.commission_covered_booking_count),
        commissionUnknownBookingCount: Number(money.commission_unknown_booking_count) },
      occupancy: { confirmedQuantity: reserved, activeHeldQuantity: activeHeldQuantity._sum.quantity ?? 0,
        totalCapacity, rateBps: totalCapacity === 0 ? 0 : Math.floor(reserved * 10_000 / totalCapacity) },
      revenueTrend: trendRows.map((row) => ({ day: new Date(row.day).toISOString().slice(0, 10),
        paidRevenue: row.paid_revenue.toString(), paymentCount: Number(row.payment_count) })),
    };
  }
}
