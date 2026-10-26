import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BookingStatus,
  PaymentStatus,
  Prisma,
  RefundStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type { ListBookingsQueryDto } from './dto/list-bookings-query.dto.js';

const customerBookingSelect = {
  id: true,
  bookingCode: true,
  status: true,
  createdAt: true,
  expiresAt: true,
  confirmedAt: true,
  subtotalAmount: true,
  voucherDiscountAmount: true,
  totalAmount: true,
  currency: true,
  items: {
    orderBy: { id: 'asc' },
    select: {
      id: true,
      serviceId: true,
      serviceTitleSnapshot: true,
      slotStartAtSnapshot: true,
      slotEndAtSnapshot: true,
      quantity: true,
      unitPriceAmount: true,
      subtotalAmount: true,
      voucherDiscountAmount: true,
      tickets: { select: { status: true } },
    },
  },
  payment: {
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      attempts: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { status: true, merchantReference: true, expiresAt: true },
      },
      refunds: {
        orderBy: { requestedAt: 'desc' },
        select: {
          id: true,
          status: true,
          kind: true,
          reason: true,
          amount: true,
          currency: true,
          requestedAt: true,
        },
      },
    },
  },
} as const satisfies Prisma.BookingSelect;

type CustomerBooking = Prisma.BookingGetPayload<{
  select: typeof customerBookingSelect;
}>;
export type CustomerBookingView = ReturnType<
  CustomerBookingReadService['present']
>;

@Injectable()
export class CustomerBookingReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(customerId: string, query: ListBookingsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const from = query.from
      ? new Date(query.from.length === 10 ? `${query.from}T00:00:00+07:00` : query.from)
      : undefined;
    const to = query.to
      ? new Date(query.to.length === 10 ? `${query.to}T23:59:59.999+07:00` : query.to)
      : undefined;
    const search = query.search?.trim();
    const where: Prisma.BookingWhereInput = {
      customerId,
      ...(query.status ? { status: query.status } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { bookingCode: { contains: search, mode: 'insensitive' } },
              {
                items: {
                  some: {
                    serviceTitleSnapshot: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [total, bookings] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        select: customerBookingSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const serverTime = new Date();
    return {
      items: bookings.map((booking) => this.present(booking, serverTime)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      serverTime: serverTime.toISOString(),
    };
  }

  async detail(customerId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, customerId },
      select: customerBookingSelect,
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return this.present(booking, new Date());
  }

  present(booking: CustomerBooking, now: Date) {
    const payment = booking.payment;
    const refunds = payment?.refunds ?? [];
    const holdValid =
      booking.status === BookingStatus.PENDING_PAYMENT &&
      !!booking.expiresAt &&
      booking.expiresAt > now;
    const displayStatus = refunds.some(
      (refund) => refund.status === RefundStatus.PENDING,
    )
      ? 'REFUND_PENDING'
      : refunds.some((refund) => refund.status === RefundStatus.SUCCEEDED)
        ? 'REFUND_COMPLETED'
        : booking.status === BookingStatus.CANCELLED
          ? 'CANCELLED'
          : booking.status === BookingStatus.EXPIRED ||
              (booking.status === BookingStatus.PENDING_PAYMENT && !holdValid)
            ? 'EXPIRED'
            : booking.status === BookingStatus.CONFIRMED
              ? 'CONFIRMED'
              : payment?.status === PaymentStatus.SUCCEEDED
                ? 'WAITING_CONFIRMATION'
                : payment
                  ? 'WAITING_CONFIRMATION'
                  : 'WAITING_PAYMENT';
    return {
      id: booking.id,
      bookingCode: booking.bookingCode,
      bookingStatus: booking.status,
      displayStatus,
      createdAt: booking.createdAt.toISOString(),
      expiresAt: booking.expiresAt?.toISOString() ?? null,
      confirmedAt: booking.confirmedAt?.toISOString() ?? null,
      serverTime: now.toISOString(),
      subtotalAmount: booking.subtotalAmount.toString(),
      voucherDiscountAmount: booking.voucherDiscountAmount.toString(),
      totalAmount: booking.totalAmount.toString(),
      currency: booking.currency,
      canInitiatePayment: holdValid && booking.totalAmount > 0n && !payment,
      ticketCount: booking.items.reduce(
        (sum, item) =>
          sum +
          item.tickets.filter((ticket) => ticket.status !== 'VOIDED').length,
        0,
      ),
      items: booking.items.map((item) => ({
        id: item.id,
        serviceId: item.serviceId,
        serviceTitle: item.serviceTitleSnapshot,
        slotStartAt: item.slotStartAtSnapshot.toISOString(),
        slotEndAt: item.slotEndAtSnapshot.toISOString(),
        quantity: item.quantity,
        unitPriceAmount: item.unitPriceAmount.toString(),
        subtotalAmount: item.subtotalAmount.toString(),
        voucherDiscountAmount: item.voucherDiscountAmount.toString(),
      })),
      paymentSummary: payment
        ? {
            paymentId: payment.id,
            status: payment.status,
            amount: payment.amount.toString(),
            currency: payment.currency,
            attemptStatus: payment.attempts[0]?.status ?? null,
            merchantReference: payment.attempts[0]?.merchantReference ?? null,
          }
        : null,
      refunds: refunds.map((refund) => ({
        id: refund.id,
        status: refund.status,
        kind: refund.kind,
        reason: refund.reason,
        amount: refund.amount.toString(),
        currency: refund.currency,
        requestedAt: refund.requestedAt.toISOString(),
      })),
    };
  }
}
