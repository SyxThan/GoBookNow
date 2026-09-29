import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  ReservationStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type { SepayPaymentResponseDto } from './dto/sepay-payment-response.dto.js';
import type { PaymentResultResponseDto } from './dto/payment-result-response.dto.js';
import {
  PAYMENT_CHECKOUT_PROVIDER,
  type PaymentCheckoutProvider,
} from './providers/payment-checkout-provider.js';

const CREATION_RETRY_LIMIT = 5;

type DbNowRow = { now: Date };
type LockedBookingRow = { id: string };

const payableBookingSelect = {
  id: true,
  bookingCode: true,
  customerId: true,
  status: true,
  totalAmount: true,
  currency: true,
  expiresAt: true,
  items: {
    select: {
      reservation: { select: { status: true, expiresAt: true } },
    },
  },
  payment: {
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
    },
  },
} as const satisfies Prisma.BookingSelect;

type PayableBooking = Prisma.BookingGetPayload<{
  select: typeof payableBookingSelect;
}>;

type PaymentTransactionClient = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'booking' | 'payment' | 'paymentAttempt'
>;

type InitiationContext = Readonly<{
  paymentId: string;
  attemptId: string;
  provider: PaymentProvider;
  status: PaymentAttemptStatus;
  amount: bigint;
  currency: string;
  merchantReference: string;
  expiresAt: Date;
  bookingCode: string;
  customerId: string;
}>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_CHECKOUT_PROVIDER)
    private readonly checkoutProvider: PaymentCheckoutProvider,
  ) {}

  async initiateSepay(
    customerId: string,
    bookingId: string,
  ): Promise<SepayPaymentResponseDto> {
    const context = await this.createOrReuseAttempt(customerId, bookingId);
    const checkout = await this.checkoutProvider.createCheckout({
      paymentId: context.paymentId,
      merchantReference: context.merchantReference,
      amount: context.amount,
      currency: context.currency,
      description: `GoBook payment ${context.bookingCode}`,
      customerId: context.customerId,
    });

    return {
      paymentId: context.paymentId,
      attemptId: context.attemptId,
      provider: context.provider,
      status: context.status,
      amount: context.amount.toString(),
      currency: context.currency,
      merchantReference: context.merchantReference,
      paymentUrl: checkout.paymentUrl,
      method: checkout.method,
      formFields: checkout.formFields,
      expiresAt: context.expiresAt.toISOString(),
    };
  }

  async getPaymentResult(
    customerId: string,
    paymentId: string,
  ): Promise<PaymentResultResponseDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        booking: {
          select: {
            id: true,
            customerId: true,
            status: true,
            expiresAt: true,
          },
        },
      },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.booking.customerId !== customerId) {
      throw new ForbiddenException('Payment belongs to another customer');
    }

    return {
      id: payment.id,
      status: payment.status,
      amount: payment.amount.toString(),
      currency: payment.currency,
      booking: {
        id: payment.booking.id,
        status: payment.booking.status,
      },
      expiresAt: payment.booking.expiresAt?.toISOString() ?? null,
    };
  }

  private async createOrReuseAttempt(
    customerId: string,
    bookingId: string,
  ): Promise<InitiationContext> {
    for (let retry = 0; retry < CREATION_RETRY_LIMIT; retry += 1) {
      try {
        return await this.prisma.$transaction((transaction) =>
          this.createOrReuseAttemptInTransaction(
            transaction,
            customerId,
            bookingId,
          ),
        );
      } catch (error: unknown) {
        if (!this.isUniqueConstraintError(error)) throw error;
      }
    }

    throw new ConflictException({
      code: 'PAYMENT_INITIATION_CONFLICT',
      message: 'Could not initialize payment. Please try again.',
    });
  }

  private async createOrReuseAttemptInTransaction(
    transaction: PaymentTransactionClient,
    customerId: string,
    bookingId: string,
  ): Promise<InitiationContext> {
    const locked = await transaction.$queryRaw<LockedBookingRow[]>(Prisma.sql`
      SELECT "id"
      FROM "bookings"
      WHERE "id" = ${bookingId}::uuid
      FOR UPDATE
    `);
    if (!locked[0]) throw new NotFoundException('Booking not found');

    const now = await this.getDatabaseNow(transaction);
    const booking = await transaction.booking.findUnique({
      where: { id: bookingId },
      select: payableBookingSelect,
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.customerId !== customerId) {
      throw new ForbiddenException('Booking belongs to another customer');
    }

    const bookingExpiresAt = this.assertPayableBooking(booking, now);

    const payment =
      booking.payment ??
      (await transaction.payment.create({
        data: {
          bookingId: booking.id,
          status: PaymentStatus.PENDING,
          amount: booking.totalAmount,
          currency: booking.currency,
        },
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
        },
      }));

    this.assertPayablePayment(payment, booking);

    const existingAttempt = await transaction.paymentAttempt.findFirst({
      where: {
        paymentId: payment.id,
        provider: PaymentProvider.SEPAY,
        status: PaymentAttemptStatus.PENDING,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        provider: true,
        status: true,
        amount: true,
        currency: true,
        merchantReference: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const attempt =
      existingAttempt ??
      (await transaction.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          provider: PaymentProvider.SEPAY,
          status: PaymentAttemptStatus.PENDING,
          amount: payment.amount,
          currency: payment.currency,
          merchantReference: this.generateMerchantReference(),
          expiresAt: bookingExpiresAt,
        },
        select: {
          id: true,
          provider: true,
          status: true,
          amount: true,
          currency: true,
          merchantReference: true,
          expiresAt: true,
        },
      }));

    if (
      !attempt.expiresAt ||
      attempt.expiresAt > bookingExpiresAt ||
      attempt.amount !== payment.amount ||
      attempt.currency !== payment.currency
    ) {
      throw new ConflictException({
        code: 'PAYMENT_ATTEMPT_NOT_PAYABLE',
        message: 'Payment attempt snapshot is not payable.',
      });
    }

    return {
      paymentId: payment.id,
      attemptId: attempt.id,
      provider: attempt.provider,
      status: attempt.status,
      amount: attempt.amount,
      currency: attempt.currency,
      merchantReference: attempt.merchantReference,
      expiresAt: attempt.expiresAt,
      bookingCode: booking.bookingCode,
      customerId: booking.customerId,
    };
  }

  private assertPayableBooking(booking: PayableBooking, now: Date): Date {
    if (booking.status !== BookingStatus.PENDING_PAYMENT) {
      throw new ConflictException({
        code: 'BOOKING_NOT_PAYABLE',
        message: `Booking in ${booking.status} status cannot be paid.`,
      });
    }
    if (!booking.expiresAt || booking.expiresAt <= now) {
      throw new ConflictException({
        code: 'BOOKING_EXPIRED',
        message: 'Booking hold has expired.',
      });
    }
    if (booking.totalAmount === 0n) {
      throw new ConflictException({
        code: 'FREE_BOOKING_PAYMENT_NOT_REQUIRED',
        message: 'Free bookings do not require SePay payment.',
      });
    }
    if (booking.totalAmount < 0n) {
      throw new ConflictException({
        code: 'BOOKING_NOT_PAYABLE',
        message: 'Booking amount is not payable.',
      });
    }
    if (booking.currency !== 'VND') {
      throw new ConflictException({
        code: 'UNSUPPORTED_PAYMENT_CURRENCY',
        message: 'SePay initiation supports VND bookings only.',
      });
    }
    if (
      booking.items.length === 0 ||
      booking.items.some(
        ({ reservation }) =>
          !reservation ||
          reservation.status !== ReservationStatus.HELD ||
          !reservation.expiresAt ||
          reservation.expiresAt <= now,
      )
    ) {
      throw new ConflictException({
        code: 'BOOKING_HOLD_NOT_PAYABLE',
        message: 'Booking reservation hold is no longer payable.',
      });
    }
    return booking.expiresAt;
  }

  private assertPayablePayment(
    payment: {
      status: PaymentStatus;
      amount: bigint;
      currency: string;
    },
    booking: Pick<PayableBooking, 'totalAmount' | 'currency'>,
  ): void {
    if (payment.status !== PaymentStatus.PENDING) {
      throw new ConflictException({
        code: 'PAYMENT_NOT_PAYABLE',
        message: `Payment in ${payment.status} status cannot be initiated.`,
      });
    }
    if (
      payment.amount <= 0n ||
      payment.currency !== 'VND' ||
      payment.amount !== booking.totalAmount ||
      payment.currency !== booking.currency
    ) {
      throw new ConflictException({
        code: 'PAYMENT_NOT_PAYABLE',
        message: 'Payment snapshot is not eligible for SePay.',
      });
    }
  }

  private async getDatabaseNow(
    transaction: Pick<Prisma.TransactionClient, '$queryRaw'>,
  ): Promise<Date> {
    const [row] = await transaction.$queryRaw<DbNowRow[]>`
      SELECT NOW() AS "now"
    `;
    if (!row) throw new Error('Failed to read database time');
    return row.now;
  }

  private generateMerchantReference(): string {
    return `GBK${randomBytes(8).toString('hex').toUpperCase()}`;
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
