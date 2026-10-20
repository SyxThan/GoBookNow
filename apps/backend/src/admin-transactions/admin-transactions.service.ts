import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma, RefundStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type { AdminTransactionFiltersDto, AdminTransactionsQueryDto } from './dto/admin-transactions-query.dto.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const money = (amount: bigint | null | undefined) => (amount ?? 0n).toString();
const timestamp = (date: Date | null | undefined) => date?.toISOString() ?? null;

@Injectable()
export class AdminTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  private where(filters: AdminTransactionFiltersDto): Prisma.PaymentWhereInput {
    const from = filters.from ? new Date(filters.from) : new Date(Date.now() - 30 * 86400_000);
    const to = filters.to ? new Date(filters.to) : new Date();
    if (from >= to || to.getTime() - from.getTime() > 366 * 86400_000) {
      throw new BadRequestException({ code: 'INVALID_TRANSACTION_DATE_RANGE', message: 'Date range must be positive and no longer than 366 days' });
    }
    const where: Prisma.PaymentWhereInput = { createdAt: { gte: from, lt: to } };
    if (filters.paymentStatus) where.status = filters.paymentStatus;
    const booking: Prisma.BookingWhereInput = {};
    if (filters.bookingId) booking.id = filters.bookingId;
    if (filters.bookingCode) booking.bookingCode = { contains: filters.bookingCode, mode: 'insensitive' };
    if (filters.userId) booking.customerId = filters.userId;
    if (filters.userEmail) booking.customer = { email: { contains: filters.userEmail, mode: 'insensitive' } };
    if (Object.keys(booking).length) where.booking = { is: booking };
    const attempt: Prisma.PaymentAttemptWhereInput = {};
    if (filters.attemptStatus) attempt.status = filters.attemptStatus;
    if (filters.provider) attempt.provider = filters.provider;
    if (Object.keys(attempt).length) where.attempts = { some: attempt };
    if (filters.search) {
      const search = filters.search;
      where.AND = [{ OR: [
        ...(uuidPattern.test(search) ? [
          { id: search }, { attempts: { some: { id: search } } },
        ] : []),
        { attempts: { some: { merchantReference: { contains: search, mode: 'insensitive' } } } },
        { attempts: { some: { providerTransactionId: { contains: search, mode: 'insensitive' } } } },
      ] }];
    }
    return where;
  }

  private refundState(paymentAmount: bigint, refunds: { status: RefundStatus; amount: bigint }[]) {
    const succeeded = refunds.filter((refund) => refund.status === RefundStatus.SUCCEEDED)
      .reduce((sum, refund) => sum + refund.amount, 0n);
    const pending = refunds.filter((refund) => refund.status === RefundStatus.PENDING)
      .reduce((sum, refund) => sum + refund.amount, 0n);
    return { state: succeeded === 0n ? 'NONE' : succeeded >= paymentAmount ? 'FULL' : 'PARTIAL',
      succeededAmount: money(succeeded), pendingAmount: money(pending) };
  }

  async list(query: AdminTransactionsQueryDto) {
    const where = this.where(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const direction = query.sort === 'oldest' ? 'asc' : 'desc';
    const [total, payments] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({ where, skip: (page - 1) * limit, take: limit,
        orderBy: [{ createdAt: direction }, { id: direction }],
        select: { id: true, bookingId: true, status: true, amount: true, currency: true,
          createdAt: true, succeededAt: true,
          booking: { select: { bookingCode: true, status: true, customerId: true,
            customer: { select: { email: true } }, vendor: { select: { id: true, displayName: true } } } },
          attempts: { take: 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { id: true, provider: true, status: true, merchantReference: true, createdAt: true } },
          _count: { select: { attempts: true } },
          refunds: { select: { status: true, amount: true } },
        } }),
    ]);
    return { data: payments.map((payment) => ({ id: payment.id, bookingId: payment.bookingId,
      bookingCode: payment.booking.bookingCode, bookingStatus: payment.booking.status,
      customerId: payment.booking.customerId, customerEmail: payment.booking.customer.email,
      vendor: payment.booking.vendor, status: payment.status, amount: money(payment.amount),
      currency: payment.currency, createdAt: timestamp(payment.createdAt), succeededAt: timestamp(payment.succeededAt),
      latestAttempt: payment.attempts[0] ? { ...payment.attempts[0], createdAt: timestamp(payment.attempts[0].createdAt) } : null,
      attemptCount: payment._count.attempts, refund: this.refundState(payment.amount, payment.refunds),
    })), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async summary(filters: AdminTransactionFiltersDto) {
    const where = this.where(filters);
    const [groups, refunds] = await Promise.all([
      this.prisma.payment.groupBy({ by: ['status'], where, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.refund.groupBy({ by: ['status'], where: { payment: { is: where } },
        _count: { _all: true }, _sum: { amount: true } }),
    ]);
    const byStatus = Object.fromEntries(Object.values(PaymentStatus).map((status) => [status,
      { count: 0, amount: '0' }]));
    for (const group of groups) byStatus[group.status] = { count: group._count._all, amount: money(group._sum.amount) };
    const refundByStatus = Object.fromEntries(Object.values(RefundStatus).map((status) => [status,
      { count: 0, amount: '0' }]));
    for (const group of refunds) refundByStatus[group.status] = { count: group._count._all, amount: money(group._sum.amount) };
    return { total: groups.reduce((sum, group) => sum + group._count._all, 0), byStatus, refunds: refundByStatus };
  }

  async detail(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId },
      select: { id: true, bookingId: true, status: true, amount: true, currency: true,
        createdAt: true, updatedAt: true, succeededAt: true, expiredAt: true, cancelledAt: true,
        booking: { select: { bookingCode: true, status: true, customerId: true,
          customer: { select: { email: true } }, vendor: { select: { id: true, displayName: true } } } },
        attempts: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: {
          id: true, provider: true, status: true, amount: true, currency: true,
          merchantReference: true, providerTransactionId: true, failureCode: true,
          createdAt: true, succeededAt: true, failedAt: true, cancelledAt: true, expiresAt: true,
        } },
        refunds: { orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }], select: {
          id: true, status: true, kind: true, reason: true, reasonNote: true,
          amount: true, currency: true, requestedAt: true, succeededAt: true, cancelledAt: true,
        } },
      } });
    if (!payment) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
    const events: { at: string; type: string; reference: string }[] = [
      { at: payment.createdAt.toISOString(), type: 'PAYMENT_CREATED', reference: payment.id },
    ];
    const addEvent = (date: Date | null, type: string, reference: string) => {
      if (date) events.push({ at: date.toISOString(), type, reference });
    };
    addEvent(payment.succeededAt, 'PAYMENT_SUCCEEDED', payment.id);
    addEvent(payment.expiredAt, 'PAYMENT_EXPIRED', payment.id);
    addEvent(payment.cancelledAt, 'PAYMENT_CANCELLED', payment.id);
    for (const attempt of payment.attempts) {
      addEvent(attempt.createdAt, 'ATTEMPT_CREATED', attempt.id);
      addEvent(attempt.succeededAt, 'ATTEMPT_SUCCEEDED', attempt.id);
      addEvent(attempt.failedAt, 'ATTEMPT_FAILED', attempt.id);
      addEvent(attempt.cancelledAt, 'ATTEMPT_CANCELLED', attempt.id);
    }
    for (const refund of payment.refunds) {
      addEvent(refund.requestedAt, 'REFUND_REQUESTED', refund.id);
      addEvent(refund.succeededAt, 'REFUND_SUCCEEDED', refund.id);
      addEvent(refund.cancelledAt, 'REFUND_CANCELLED', refund.id);
    }
    events.sort((a, b) => a.at.localeCompare(b.at) || a.type.localeCompare(b.type) || a.reference.localeCompare(b.reference));
    return { id: payment.id, bookingId: payment.bookingId, booking: payment.booking,
      status: payment.status, amount: money(payment.amount), currency: payment.currency,
      createdAt: timestamp(payment.createdAt), updatedAt: timestamp(payment.updatedAt),
      succeededAt: timestamp(payment.succeededAt), expiredAt: timestamp(payment.expiredAt),
      cancelledAt: timestamp(payment.cancelledAt), refund: this.refundState(payment.amount, payment.refunds),
      attempts: payment.attempts.map((attempt) => ({ ...attempt, amount: money(attempt.amount),
        createdAt: timestamp(attempt.createdAt), succeededAt: timestamp(attempt.succeededAt),
        failedAt: timestamp(attempt.failedAt), cancelledAt: timestamp(attempt.cancelledAt),
        expiresAt: timestamp(attempt.expiresAt) })),
      refunds: payment.refunds.map((refund) => ({ ...refund, amount: money(refund.amount),
        requestedAt: timestamp(refund.requestedAt), succeededAt: timestamp(refund.succeededAt),
        cancelledAt: timestamp(refund.cancelledAt) })), timeline: events };
  }
}
