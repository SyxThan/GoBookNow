import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, PaymentStatus, Prisma, VendorStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import { CommissionCalculator } from '../bookings/commission.calculator.js';
import { isBookingCompleted } from '../bookings/booking-completion.rules.js';
import type { VendorBookingsQueryDto, VendorPeriodQueryDto } from './vendor-operations.dto.js';

const listSelect = {
  id: true, bookingCode: true, status: true, currency: true,
  subtotalAmount: true, voucherDiscountAmount: true, totalAmount: true,
  platformFeeAmount: true, vendorAmount: true, createdAt: true,
  items: { select: { id: true, serviceId: true, serviceTitleSnapshot: true,
    slotStartAtSnapshot: true, slotEndAtSnapshot: true, quantity: true },
    orderBy: { slotStartAtSnapshot: 'asc' } },
} as const satisfies Prisma.BookingSelect;

const detailSelect = {
  ...listSelect, commissionBps: true, commissionSnapshot: true,
  payment: { select: { status: true, amount: true, succeededAt: true,
    refunds: { select: { status: true, amount: true } } } },
  cancellation: { select: { requestedAt: true, reasonCode: true,
    refundAmount: true, cancellationFeeAmount: true } },
  items: { select: { id: true, serviceId: true, slotId: true, serviceTitleSnapshot: true,
    slotStartAtSnapshot: true, slotEndAtSnapshot: true, quantity: true,
    subtotalAmount: true, voucherDiscountAmount: true,
    platformFeeAmount: true, vendorAmount: true,
    tickets: { select: { status: true } } },
    orderBy: { slotStartAtSnapshot: 'asc' } },
} as const satisfies Prisma.BookingSelect;

export function operationalStatus(booking: { status: BookingStatus; items: readonly { slotEndAtSnapshot: Date }[] }, now: Date) {
  if (booking.status === BookingStatus.CANCELLED) return 'CANCELLED';
  if (booking.status !== BookingStatus.CONFIRMED) return booking.status;
  if (booking.items.length === 0) return booking.status;
  return isBookingCompleted(booking, now) ? 'COMPLETED' : 'UPCOMING';
}

export function parsePeriod(query: VendorPeriodQueryDto, now: Date, useDefault = false) {
  const from = query.from ? new Date(query.from) : useDefault ? new Date(now.getTime() - 30 * 86_400_000) : null;
  const to = query.to ? new Date(query.to) : useDefault ? now : null;
  if ([query.from, query.to].some((value) => value && !/(Z|[+-]\d{2}:\d{2})$/i.test(value)) ||
      (from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime())) ||
      (from && to && (from >= to || to.getTime() - from.getTime() > 366 * 86_400_000))) {
    throw new BadRequestException('from/to must be ordered ISO instants with a range of at most 366 days');
  }
  return { from, to };
}

@Injectable()
export class VendorBookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async approvedVendorId(userId: string): Promise<string> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { ownerUserId: userId }, select: { id: true, status: true, deletedAt: true },
    });
    if (!vendor || vendor.status !== VendorStatus.APPROVED || vendor.deletedAt) {
      throw new ForbiddenException('Approved Vendor is required');
    }
    return vendor.id;
  }

  async dbNow(): Promise<Date> {
    const [row] = await this.prisma.$queryRaw<[{ now: Date }]>`SELECT NOW() AS now`;
    return row.now;
  }

  async list(userId: string, query: VendorBookingsQueryDto) {
    const vendorId = await this.approvedVendorId(userId);
    const now = await this.dbNow();
    const { from, to } = parsePeriod(query, now);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const status = query.status ?? 'ALL';
    const where: Prisma.BookingWhereInput = {
      vendorId,
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
      ...(query.serviceId ? { items: { some: { serviceId: query.serviceId } } } : {}),
      ...(query.search ? { OR: [
        { bookingCode: { contains: query.search, mode: 'insensitive' } },
        { items: { some: { serviceTitleSnapshot: { contains: query.search, mode: 'insensitive' } } } },
      ] } : {}),
      ...(status === 'CANCELLED' ? { status: BookingStatus.CANCELLED } : {}),
      ...(status === 'UPCOMING' ? { status: BookingStatus.CONFIRMED, items: { some: { slotEndAtSnapshot: { gt: now }, ...(query.serviceId ? { serviceId: query.serviceId } : {}) } } } : {}),
      ...(status === 'COMPLETED' ? { status: BookingStatus.CONFIRMED, AND: [
        { items: { some: {} } }, { items: { none: { slotEndAtSnapshot: { gt: now } } } },
      ] } : {}),
    };
    // Service filter is kept in AND so operational filters cannot overwrite it.
    if (query.serviceId) where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { items: { some: { serviceId: query.serviceId } } }];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({ where, select: listSelect,
        orderBy: [{ createdAt: query.sort ?? 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit, take: limit }),
    ]);
    return {
      data: rows.map((booking) => ({
        bookingId: booking.id, bookingCode: booking.bookingCode,
        status: booking.status, operationalStatus: operationalStatus(booking, now),
        currency: booking.currency, grossAmount: booking.subtotalAmount.toString(),
        discountAmount: booking.voucherDiscountAmount.toString(),
        totalAmount: booking.totalAmount.toString(),
        platformFeeAmount: booking.platformFeeAmount?.toString() ?? null,
        vendorAmount: booking.vendorAmount?.toString() ?? null,
        createdAt: booking.createdAt.toISOString(),
        itemCount: booking.items.length,
        totalQuantity: booking.items.reduce((sum, item) => sum + item.quantity, 0),
        itemsSummary: booking.items.map((item) => ({ serviceId: item.serviceId,
          serviceTitle: item.serviceTitleSnapshot, startAt: item.slotStartAtSnapshot.toISOString(),
          endAt: item.slotEndAtSnapshot.toISOString(), quantity: item.quantity })),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async detail(userId: string, bookingId: string) {
    const vendorId = await this.approvedVendorId(userId);
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, vendorId }, select: detailSelect });
    if (!booking) throw new NotFoundException('Booking not found');
    const now = await this.dbNow();
    const refunds = booking.payment?.refunds ?? [];
    const succeededRefunds = refunds.filter((refund) => refund.status === 'SUCCEEDED').reduce((sum, refund) => sum + refund.amount, 0n);
    const pendingRefunds = refunds.filter((refund) => refund.status === 'PENDING').reduce((sum, refund) => sum + refund.amount, 0n);
    const paid = booking.payment?.status === PaymentStatus.SUCCEEDED ? booking.payment.amount : null;
    if (paid !== null && succeededRefunds + pendingRefunds > paid) throw new Error('REFUND_FINANCIAL_MISMATCH');
    const retained = paid !== null && booking.commissionBps !== null && booking.commissionSnapshot !== null
      ? CommissionCalculator.retained(paid, succeededRefunds, booking.commissionBps) : null;
    return {
      bookingId: booking.id, bookingCode: booking.bookingCode, status: booking.status,
      operationalStatus: operationalStatus(booking, now), createdAt: booking.createdAt.toISOString(),
      currency: booking.currency, grossAmount: booking.subtotalAmount.toString(),
      discountAmount: booking.voucherDiscountAmount.toString(), netAmount: booking.totalAmount.toString(),
      commissionBps: booking.commissionBps,
      platformFeeAmount: booking.platformFeeAmount?.toString() ?? null,
      vendorAmount: booking.vendorAmount?.toString() ?? null,
      commissionCovered: booking.commissionSnapshot !== null,
      payment: booking.payment ? { status: booking.payment.status,
        amount: booking.payment.amount.toString(), succeededAt: booking.payment.succeededAt?.toISOString() ?? null } : null,
      refunds: { succeededAmount: succeededRefunds.toString(), pendingAmount: pendingRefunds.toString() },
      retained: paid === null ? null : {
        netAmount: (paid - succeededRefunds).toString(),
        projectedNetAfterPending: (paid - succeededRefunds - pendingRefunds).toString(),
        platformFeeAmount: retained?.platformFeeAmount.toString() ?? null,
        vendorAmount: retained?.vendorAmount.toString() ?? null,
      },
      cancellation: booking.cancellation ? { requestedAt: booking.cancellation.requestedAt.toISOString(),
        reasonCode: booking.cancellation.reasonCode,
        refundAmount: booking.cancellation.refundAmount.toString(),
        cancellationFeeAmount: booking.cancellation.cancellationFeeAmount.toString() } : null,
      items: booking.items.map((item) => ({
        id: item.id, serviceId: item.serviceId, slotId: item.slotId,
        serviceTitle: item.serviceTitleSnapshot,
        startAt: item.slotStartAtSnapshot.toISOString(), endAt: item.slotEndAtSnapshot.toISOString(),
        quantity: item.quantity, grossAmount: item.subtotalAmount.toString(),
        discountAmount: item.voucherDiscountAmount.toString(),
        netAmount: (item.subtotalAmount - item.voucherDiscountAmount).toString(),
        platformFeeAmount: item.platformFeeAmount?.toString() ?? null,
        vendorAmount: item.vendorAmount?.toString() ?? null,
        tickets: { issued: item.tickets.filter((ticket) => ticket.status === 'ISSUED').length,
          checkedIn: item.tickets.filter((ticket) => ticket.status === 'CHECKED_IN').length,
          voided: item.tickets.filter((ticket) => ticket.status === 'VOIDED').length },
      })),
    };
  }
}
