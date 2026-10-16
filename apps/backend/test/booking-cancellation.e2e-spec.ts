import { randomUUID } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../src/auth/guards/roles.guard.js';
import { BookingsModule } from '../src/bookings/bookings.module.js';
import { BookingCancellationService } from '../src/bookings/cancellation/booking-cancellation.service.js';
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import {
  BookingStatus,
  CategoryScope,
  PaymentStatus,
  Prisma,
  PricingSource,
  RefundKind,
  RefundReason,
  RefundStatus,
  ReservationStatus,
  ServiceKind,
  ServiceStatus,
  SlotStatus,
  TicketStatus,
  UserStatus,
  VendorStatus,
} from '../src/generated/prisma/client.js';
import { TicketCheckInService } from '../src/tickets/ticket-check-in.service.js';
import { TicketService } from '../src/tickets/ticket.service.js';
import { TicketTokenService } from '../src/tickets/ticket-token.service.js';
import { TicketsModule } from '../src/tickets/tickets.module.js';
import { assertIsolatedPaymentTestDatabase } from './payment-test-database.js';

type DbNowRow = { now: Date };

describe('Booking cancellation orchestration (e2e, PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cancellations: BookingCancellationService;
  let tickets: TicketService;
  let checkIn: TicketCheckInService;
  let ticketTokens: TicketTokenService;
  const run = randomUUID().replaceAll('-', '').slice(0, 8);
  let customerAId: string;
  let customerBId: string;
  let ownerId: string;
  let vendorId: string;
  let categoryId: string;
  let serviceId: string;
  let sequence = 0;

  const authGuard: CanActivate = {
    canActivate(context: ExecutionContext): boolean {
      const httpRequest = context.switchToHttp().getRequest<{
        headers: { authorization?: string };
        user?: unknown;
      }>();
      const customerId = httpRequest.headers.authorization?.includes(
        'customer-b',
      )
        ? customerBId
        : customerAId;
      httpRequest.user = {
        id: customerId,
        email: `${customerId}@example.test`,
        roles: ['CUSTOMER'],
        profile: null,
      };
      return true;
    },
  };

  beforeAll(async () => {
    assertIsolatedPaymentTestDatabase();
    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: 'booking-cancellation-jwt-secret',
              TICKET_TOKEN_SECRET:
                'booking-cancellation-ticket-secret-at-least-32-bytes',
            }),
          ],
        }),
        PrismaModule,
        BookingsModule,
        TicketsModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authGuard)
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = fixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = fixture.get(PrismaService);
    cancellations = fixture.get(BookingCancellationService);
    tickets = fixture.get(TicketService);
    checkIn = fixture.get(TicketCheckInService);
    ticketTokens = fixture.get(TicketTokenService);

    customerAId = await createUser('customer-a');
    customerBId = await createUser('customer-b');
    ownerId = await createUser('owner');
    const vendor = await prisma.vendor.create({
      data: {
        ownerUserId: ownerId,
        displayName: `Cancellation Vendor ${run}`,
        slug: `cancellation-vendor-${run}`,
        status: VendorStatus.APPROVED,
      },
    });
    vendorId = vendor.id;
    const category = await prisma.category.create({
      data: {
        code: `CANCEL_${run.toUpperCase()}`,
        name: `Cancellation Category ${run}`,
        slug: `cancellation-category-${run}`,
        scope: CategoryScope.EVENT,
      },
    });
    categoryId = category.id;
    const service = await prisma.service.create({
      data: {
        vendorId,
        categoryId,
        kind: ServiceKind.EVENT,
        title: `Cancellation Event ${run}`,
        slug: `cancellation-event-${run}`,
        priceAmount: 100_000n,
        status: ServiceStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
    serviceId = service.id;
  });

  afterAll(async () => {
    if (prisma) {
      const customerIds = [customerAId, customerBId];
      await prisma.bookingCancellation.deleteMany({
        where: { booking: { customerId: { in: customerIds } } },
      });
      await prisma.refund.deleteMany({
        where: { payment: { booking: { customerId: { in: customerIds } } } },
      });
      await prisma.ticket.deleteMany({
        where: {
          bookingItem: { booking: { customerId: { in: customerIds } } },
        },
      });
      await prisma.payment.deleteMany({
        where: { booking: { customerId: { in: customerIds } } },
      });
      await prisma.booking.deleteMany({
        where: { customerId: { in: customerIds } },
      });
      await prisma.slot.deleteMany({ where: { serviceId } });
      await prisma.service.deleteMany({ where: { id: serviceId } });
      await prisma.category.deleteMany({ where: { id: categoryId } });
      await prisma.vendor.deleteMany({ where: { id: vendorId } });
      await prisma.user.deleteMany({
        where: { id: { in: [customerAId, customerBId, ownerId] } },
      });
    }
    await app?.close();
  });

  async function createUser(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `cancellation-${run}-${label}@example.com`,
        status: UserStatus.ACTIVE,
      },
    });
    return user.id;
  }

  async function databaseNow(): Promise<Date> {
    const [row] = await prisma.$queryRaw<DbNowRow[]>`
      SELECT NOW() AS "now"
    `;
    if (!row) throw new Error('Database time unavailable');
    return row.now;
  }

  async function createBooking(input: {
    items: Array<{ amount: bigint; startsInMinutes: number }>;
    afterStartAllowed?: boolean;
    issueTickets?: boolean;
  }) {
    sequence += 1;
    const now = await databaseNow();
    const total = input.items.reduce((sum, item) => sum + item.amount, 0n);
    const slots = [];
    for (const [index, item] of input.items.entries()) {
      slots.push(
        await prisma.slot.create({
          data: {
            serviceId,
            startAt: new Date(now.getTime() + item.startsInMinutes * 60_000),
            endAt: new Date(
              now.getTime() + (item.startsInMinutes + 180) * 60_000,
            ),
            capacity: 50,
            status: SlotStatus.OPEN,
            priceAmount: item.amount,
          },
        }),
      );
      expect(slots[index]).toBeDefined();
    }
    const booking = await prisma.booking.create({
      data: {
        bookingCode: `CAN-${run}-${sequence}`,
        customerId: customerAId,
        vendorId,
        status: BookingStatus.CONFIRMED,
        subtotalAmount: total,
        totalAmount: total,
        confirmedAt: now,
        cancellationPolicySnapshot: {
          version: 1,
          policyCode: `CANCELLATION_E2E_${run}`,
          tiers: [
            { minMinutesBeforeStart: 1_440, refundBps: 10_000 },
            { minMinutesBeforeStart: 60, refundBps: 5_000 },
            { minMinutesBeforeStart: 0, refundBps: 0 },
          ],
          afterStart: {
            cancellationAllowed: input.afterStartAllowed ?? false,
            refundBps: 0,
          },
        },
        items: {
          create: input.items.map((item, index) => ({
            serviceId,
            slotId: slots[index]!.id,
            quantity: 1,
            unitPriceAmount: item.amount,
            subtotalAmount: item.amount,
            pricingSource: PricingSource.SLOT,
            serviceTitleSnapshot: `Cancellation Event ${run}`,
            slotStartAtSnapshot: slots[index]!.startAt,
            slotEndAtSnapshot: slots[index]!.endAt,
            reservation: {
              create: {
                slotId: slots[index]!.id,
                quantity: 1,
                status: ReservationStatus.CONFIRMED,
                confirmedAt: now,
              },
            },
          })),
        },
        payment: {
          create: {
            status: PaymentStatus.SUCCEEDED,
            amount: total,
            currency: 'VND',
            succeededAt: now,
          },
        },
      },
      include: { items: true, payment: true },
    });
    if (input.issueTickets !== false) {
      await tickets.issueTicketsForBooking(booking.id);
    }
    return booking;
  }

  const postAs = (path: string, customer: 'a' | 'b' = 'a') =>
    request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('Authorization', `Bearer customer-${customer}`);

  it('previews immutable multi-slot item amounts and enforces ownership', async () => {
    const booking = await createBooking({
      items: [
        { amount: 300_000n, startsInMinutes: 2_880 },
        { amount: 200_000n, startsInMinutes: 120 },
        { amount: 200_000n, startsInMinutes: 30 },
      ],
    });

    const response = await postAs(
      `/bookings/${booking.id}/cancellation/preview`,
    ).expect(200);
    expect(response.body).toMatchObject({
      bookingId: booking.id,
      cancellationAllowed: true,
      reason: 'PARTIAL_REFUND',
      originalAmount: '700000',
      refundAmount: '400000',
      cancellationFeeAmount: '300000',
      policyVersion: 1,
    });
    expect(response.body.items).toHaveLength(3);
    await postAs(`/bookings/${booking.id}/cancellation/preview`, 'b').expect(
      403,
    );
  });

  it('atomically cancels, releases, voids, audits, refunds, and replays', async () => {
    const booking = await createBooking({
      items: [{ amount: 300_000n, startsInMinutes: 2_880 }],
    });
    const key = `cancel-${run}-${booking.id}`;
    const first = await postAs(`/bookings/${booking.id}/cancel`)
      .set('Idempotency-Key', key)
      .send({ reasonNote: 'Kế hoạch thay đổi' })
      .expect(201);
    const replay = await postAs(`/bookings/${booking.id}/cancel`)
      .set('Idempotency-Key', key)
      .send({ reasonNote: 'Kế hoạch thay đổi' })
      .expect(200);
    expect(replay.body).toEqual(first.body);
    expect(first.body.refund).toMatchObject({
      status: RefundStatus.PENDING,
      kind: RefundKind.FULL,
      amount: '300000',
    });

    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: {
        cancellation: true,
        items: { include: { reservation: true, tickets: true } },
        payment: { include: { refunds: true } },
      },
    });
    expect(stored.status).toBe(BookingStatus.CANCELLED);
    expect(
      stored.items.every(
        (item) => item.reservation?.status === ReservationStatus.RELEASED,
      ),
    ).toBe(true);
    expect(
      stored.items
        .flatMap((item) => item.tickets)
        .every((ticket) => ticket.status === TicketStatus.VOIDED),
    ).toBe(true);
    expect(stored.cancellation).toMatchObject({
      requestedByUserId: customerAId,
      originalAmount: 300_000n,
      refundAmount: 300_000n,
      cancellationFeeAmount: 0n,
      policyVersion: 1,
    });
    expect(stored.payment?.status).toBe(PaymentStatus.SUCCEEDED);
    expect(stored.payment?.refunds).toHaveLength(1);

    const refreshed = await request(app.getHttpServer())
      .get(`/api/v1/bookings/${booking.id}/tickets`)
      .set('Authorization', 'Bearer customer-a')
      .expect(200);
    expect(refreshed.body.cancellation).toMatchObject({
      cancellationId: first.body.cancellationId,
      refund: { status: RefundStatus.PENDING },
    });
  });

  it('allows zero-refund cancellation without creating a Refund', async () => {
    const booking = await createBooking({
      items: [{ amount: 200_000n, startsInMinutes: 30 }],
    });
    const result = await cancellations.cancel({
      actorUserId: customerAId,
      bookingId: booking.id,
      idempotencyKey: `zero-${booking.id}`,
    });
    expect(result.body.refundAmount).toBe('0');
    expect(result.body.refund).toBeNull();
    expect(
      await prisma.refund.count({ where: { paymentId: booking.payment!.id } }),
    ).toBe(0);
  });

  it('cancels a consistent confirmed Booking even when Tickets were not issued', async () => {
    const booking = await createBooking({
      items: [{ amount: 100_000n, startsInMinutes: 2_880 }],
      issueTickets: false,
    });
    const result = await cancellations.cancel({
      actorUserId: customerAId,
      bookingId: booking.id,
      idempotencyKey: `no-tickets-${booking.id}`,
    });
    expect(result.body.bookingStatus).toBe(BookingStatus.CANCELLED);
    expect(
      await prisma.ticket.count({
        where: { bookingItem: { bookingId: booking.id } },
      }),
    ).toBe(0);
  });

  it('rejects partial-item-only cancellation without mutating the Booking', async () => {
    const booking = await createBooking({
      items: [
        { amount: 100_000n, startsInMinutes: 2_880 },
        { amount: 100_000n, startsInMinutes: -30 },
      ],
    });
    const preview = await cancellations.preview(customerAId, booking.id);
    expect(preview).toMatchObject({
      cancellationAllowed: false,
      reason: 'PARTIAL_CANCELLATION_REQUIRED',
    });
    await expect(
      cancellations.cancel({
        actorUserId: customerAId,
        bookingId: booking.id,
        idempotencyKey: `partial-required-${booking.id}`,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PARTIAL_CANCELLATION_REQUIRED' },
    });
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }))
        .status,
    ).toBe(BookingStatus.CONFIRMED);
  });

  it('rejects a legacy Booking with no policy snapshot', async () => {
    const booking = await createBooking({
      items: [{ amount: 100_000n, startsInMinutes: 2_880 }],
    });
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "bookings"
      SET "cancellation_policy_snapshot" = NULL
      WHERE "id" = ${booking.id}::uuid
    `);
    await expect(
      cancellations.preview(customerAId, booking.id),
    ).rejects.toMatchObject({
      response: { code: 'POLICY_SNAPSHOT_MISSING' },
    });
  });

  it('blocks preview and cancellation after any Ticket was checked in', async () => {
    const booking = await createBooking({
      items: [{ amount: 100_000n, startsInMinutes: 2_880 }],
    });
    const [ticket] = await tickets.getTicketsForBooking(booking.id);
    await prisma.ticket.update({
      where: { id: ticket!.id },
      data: {
        status: TicketStatus.CHECKED_IN,
        checkedInAt: await databaseNow(),
        checkedInByUserId: ownerId,
      },
    });
    await expect(
      cancellations.preview(customerAId, booking.id),
    ).rejects.toMatchObject({
      response: { code: 'TICKET_ALREADY_USED' },
    });
    await expect(
      cancellations.cancel({
        actorUserId: customerAId,
        bookingId: booking.id,
        idempotencyKey: `used-${booking.id}`,
      }),
    ).rejects.toMatchObject({
      response: { code: 'TICKET_ALREADY_USED' },
    });
  });

  it('rolls back every state change when RefundService rejects over-refund', async () => {
    const booking = await createBooking({
      items: [{ amount: 300_000n, startsInMinutes: 2_880 }],
    });
    await prisma.refund.create({
      data: {
        paymentId: booking.payment!.id,
        idempotencyKey: `existing-${booking.id}`,
        status: RefundStatus.PENDING,
        kind: RefundKind.FULL,
        reason: RefundReason.MANUAL_ADJUSTMENT,
        amount: 300_000n,
        currency: 'VND',
      },
    });

    await expect(
      cancellations.cancel({
        actorUserId: customerAId,
        bookingId: booking.id,
        idempotencyKey: `rollback-${booking.id}`,
      }),
    ).rejects.toMatchObject({
      response: { code: 'REFUND_AMOUNT_EXCEEDS_REMAINING' },
    });
    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: {
        cancellation: true,
        items: { include: { reservation: true, tickets: true } },
      },
    });
    expect(stored.status).toBe(BookingStatus.CONFIRMED);
    expect(stored.cancellation).toBeNull();
    expect(
      stored.items.every(
        (item) => item.reservation?.status === ReservationStatus.CONFIRMED,
      ),
    ).toBe(true);
    expect(
      stored.items
        .flatMap((item) => item.tickets)
        .every((ticket) => ticket.status === TicketStatus.ISSUED),
    ).toBe(true);
  });

  it('serializes concurrent cancellation to one audit and one refund', async () => {
    const booking = await createBooking({
      items: [{ amount: 300_000n, startsInMinutes: 2_880 }],
    });
    const results = await Promise.allSettled([
      cancellations.cancel({
        actorUserId: customerAId,
        bookingId: booking.id,
        idempotencyKey: `double-a-${booking.id}`,
      }),
      cancellations.cancel({
        actorUserId: customerAId,
        bookingId: booking.id,
        idempotencyKey: `double-b-${booking.id}`,
      }),
    ]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(
      await prisma.bookingCancellation.count({
        where: { bookingId: booking.id },
      }),
    ).toBe(1);
    expect(
      await prisma.refund.count({ where: { paymentId: booking.payment!.id } }),
    ).toBe(1);
  });

  it('never ends with CANCELLED plus CHECKED_IN during the race', async () => {
    const booking = await createBooking({
      items: [{ amount: 100_000n, startsInMinutes: -30 }],
      afterStartAllowed: true,
    });
    const [ticket] = await tickets.getTicketsForBooking(booking.id);
    const token = ticketTokens.generateToken(ticket!);
    await Promise.allSettled([
      checkIn.checkIn({ token, actorUserId: ownerId }),
      cancellations.cancel({
        actorUserId: customerAId,
        bookingId: booking.id,
        idempotencyKey: `race-${booking.id}`,
      }),
    ]);
    const finalBooking = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    const finalTicket = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket!.id },
    });
    expect(
      finalBooking.status === BookingStatus.CANCELLED &&
        finalTicket.status === TicketStatus.CHECKED_IN,
    ).toBe(false);
    expect([
      [BookingStatus.CONFIRMED, TicketStatus.CHECKED_IN],
      [BookingStatus.CANCELLED, TicketStatus.VOIDED],
    ]).toContainEqual([finalBooking.status, finalTicket.status]);
  });
});
