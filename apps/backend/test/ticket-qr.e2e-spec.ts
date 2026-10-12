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
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import {
  BookingStatus,
  CategoryScope,
  PricingSource,
  ReservationStatus,
  ServiceKind,
  ServiceStatus,
  SlotStatus,
  TicketStatus,
  UserStatus,
  VendorStatus,
} from '../src/generated/prisma/client.js';
import { TicketService } from '../src/tickets/ticket.service.js';
import { TicketsModule } from '../src/tickets/tickets.module.js';

describe('Customer Ticket QR API (e2e, PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ticketService: TicketService;
  const run = randomUUID().replaceAll('-', '').slice(0, 10);
  let customerAId: string;
  let customerBId: string;
  let ownerId: string;
  let vendorId: string;
  let categoryId: string;
  let serviceId: string;
  let slotId: string;
  let bookingSequence = 0;

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
    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: 'ticket-qr-jwt-test-secret',
              TICKET_TOKEN_SECRET:
                'ticket-qr-e2e-signing-secret-with-at-least-32-bytes',
            }),
          ],
        }),
        PrismaModule,
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
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    prisma = fixture.get(PrismaService);
    ticketService = fixture.get(TicketService);

    customerAId = await createUser('customer-a');
    customerBId = await createUser('customer-b');
    ownerId = await createUser('owner');
    const vendor = await prisma.vendor.create({
      data: {
        ownerUserId: ownerId,
        displayName: `QR Vendor ${run}`,
        slug: `qr-vendor-${run}`,
        status: VendorStatus.APPROVED,
      },
    });
    vendorId = vendor.id;
    const category = await prisma.category.create({
      data: {
        code: `QR_${run.toUpperCase()}`,
        name: `QR Category ${run}`,
        slug: `qr-category-${run}`,
        scope: CategoryScope.EVENT,
      },
    });
    categoryId = category.id;
    const service = await prisma.service.create({
      data: {
        vendorId,
        categoryId,
        kind: ServiceKind.EVENT,
        title: `QR Event ${run}`,
        slug: `qr-event-${run}`,
        priceAmount: 100_000n,
        status: ServiceStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
    serviceId = service.id;
    const slot = await prisma.slot.create({
      data: {
        serviceId,
        startAt: new Date('2099-01-01T02:00:00.000Z'),
        endAt: new Date('2099-01-01T04:00:00.000Z'),
        capacity: 100,
        status: SlotStatus.OPEN,
      },
    });
    slotId = slot.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.ticket.deleteMany({
        where: {
          bookingItem: {
            booking: { customerId: { in: [customerAId, customerBId] } },
          },
        },
      });
      await prisma.booking.deleteMany({
        where: { customerId: { in: [customerAId, customerBId] } },
      });
      await prisma.slot.deleteMany({ where: { id: slotId } });
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
        email: `ticket-qr-${run}-${label}@example.com`,
        status: UserStatus.ACTIVE,
      },
    });
    return user.id;
  }

  async function createConfirmedBooking(quantities: number[]) {
    bookingSequence += 1;
    return prisma.booking.create({
      data: {
        bookingCode: `QR-${run}-${bookingSequence}`,
        customerId: customerAId,
        vendorId,
        status: BookingStatus.CONFIRMED,
        subtotalAmount: BigInt(
          quantities.reduce((sum, quantity) => sum + quantity * 100_000, 0),
        ),
        totalAmount: BigInt(
          quantities.reduce((sum, quantity) => sum + quantity * 100_000, 0),
        ),
        confirmedAt: new Date(),
        items: {
          create: quantities.map((quantity) => ({
            serviceId,
            slotId,
            quantity,
            unitPriceAmount: 100_000n,
            subtotalAmount: BigInt(quantity * 100_000),
            pricingSource: PricingSource.SERVICE,
            serviceTitleSnapshot: `QR Event ${run}`,
            slotStartAtSnapshot: new Date('2099-01-01T02:00:00.000Z'),
            slotEndAtSnapshot: new Date('2099-01-01T04:00:00.000Z'),
            reservation: {
              create: {
                slotId,
                quantity,
                status: ReservationStatus.CONFIRMED,
                confirmedAt: new Date(),
              },
            },
          })),
        },
      },
      include: { items: true },
    });
  }

  const getAs = (path: string, customer: 'a' | 'b' = 'a') =>
    request(app.getHttpServer())
      .get(`/api/v1${path}`)
      .set('Authorization', `Bearer customer-${customer}`);

  it('returns five safe Ticket metadata records grouped by BookingItem quantity', async () => {
    const booking = await createConfirmedBooking([2, 3]);
    await ticketService.issueTicketsForBooking(booking.id);

    const response = await getAs(`/bookings/${booking.id}/tickets`).expect(200);
    expect(response.body.tickets).toHaveLength(5);
    expect(
      response.body.tickets.filter(
        (ticket: { bookingItem: { quantity: number } }) =>
          ticket.bookingItem.quantity === 2,
      ),
    ).toHaveLength(2);
    expect(
      response.body.tickets.filter(
        (ticket: { bookingItem: { quantity: number } }) =>
          ticket.bookingItem.quantity === 3,
      ),
    ).toHaveLength(3);
    expect(JSON.stringify(response.body)).not.toMatch(
      /tokenNonce|tokenVersion|TICKET_TOKEN_SECRET|signature/,
    );
  });

  it('returns a non-empty inline PNG with private no-store caching to the owner', async () => {
    const booking = await createConfirmedBooking([1]);
    const [ticket] = await ticketService.issueTicketsForBooking(booking.id);
    const before = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket!.id },
    });

    const response = await getAs(`/tickets/${ticket!.id}/qr`).expect(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['content-disposition']).toBe(
      `inline; filename="gobook-ticket-${ticket!.ticketCode}.png"`,
    );
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(100);

    const after = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket!.id },
    });
    expect(after).toEqual(before);
  });

  it('returns attachment disposition for download mode', async () => {
    const booking = await createConfirmedBooking([1]);
    const [ticket] = await ticketService.issueTicketsForBooking(booking.id);
    const response = await getAs(
      `/tickets/${ticket!.id}/qr?download=true`,
    ).expect(200);
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="gobook-ticket-${ticket!.ticketCode}.png"`,
    );
  });

  it('denies another Customer without returning an image', async () => {
    const booking = await createConfirmedBooking([1]);
    const [ticket] = await ticketService.issueTicketsForBooking(booking.id);
    const response = await getAs(`/tickets/${ticket!.id}/qr`, 'b').expect(403);
    expect(response.headers['content-type']).not.toContain('image/png');
  });

  it('returns 404 for an unknown Ticket UUID', async () => {
    await getAs(`/tickets/${randomUUID()}/qr`).expect(404);
  });

  it('returns 409 and no PNG for a VOIDED Ticket', async () => {
    const booking = await createConfirmedBooking([1]);
    const [ticket] = await ticketService.issueTicketsForBooking(booking.id);
    await prisma.ticket.update({
      where: { id: ticket!.id },
      data: { status: TicketStatus.VOIDED, voidedAt: new Date() },
    });

    const response = await getAs(`/tickets/${ticket!.id}/qr`).expect(409);
    expect(response.body.code).toBe('TICKET_VOIDED');
    expect(response.headers['content-type']).not.toContain('image/png');
  });
});
