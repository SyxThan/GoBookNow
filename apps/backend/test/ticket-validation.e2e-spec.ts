import { randomBytes, randomUUID } from 'node:crypto';
import {
  type INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../src/auth/auth.service.js';
import { RoleCode } from '../src/auth/constants/role.constants.js';
import type {
  CurrentUser,
  JwtPayload,
} from '../src/auth/types/jwt-payload.type.js';
import { PrismaModule } from '../src/database/prisma/prisma.module.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import {
  BookingStatus,
  CategoryScope,
  PricingSource,
  ServiceKind,
  ServiceStatus,
  SlotStatus,
  TicketStatus,
  UserStatus,
  VendorStatus,
} from '../src/generated/prisma/client.js';
import { TicketTokenService } from '../src/tickets/ticket-token.service.js';
import { TicketValidationReason } from '../src/tickets/ticket-validation.constants.js';
import { TicketsModule } from '../src/tickets/tickets.module.js';

const JWT_SECRET = 'ticket-validation-jwt-secret';
const TICKET_SECRET = 'ticket-validation-signing-secret-with-at-least-32-bytes';
type DbNowRow = { now: Date };

describe('Vendor Ticket validation API (e2e, PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let ticketTokens: TicketTokenService;
  const run = randomUUID().replaceAll('-', '').slice(0, 8);
  const identities = new Map<string, CurrentUser>();
  const userIds: string[] = [];
  const vendorIds: string[] = [];
  const serviceIds: string[] = [];
  const slotIds: string[] = [];
  let customerId: string;
  let vendorAOwnerId: string;
  let vendorBOwnerId: string;
  let draftVendorOwnerId: string;
  let vendorAId: string;
  let vendorBId: string;
  let categoryId: string;
  let eventServiceId: string;
  let serviceServiceId: string;
  let vendorBServiceId: string;
  let activeEventSlotId: string;
  let activeServiceSlotId: string;
  let futureSlotId: string;
  let expiredSlotId: string;
  let cancelledSlotId: string;
  let closedSlotId: string;
  let vendorBSlotId: string;
  let sequence = 0;

  beforeAll(async () => {
    const authService = {
      getCurrentUser: vi.fn(async (userId: string): Promise<CurrentUser> => {
        const identity = identities.get(userId);
        if (!identity) {
          throw new UnauthorizedException(
            'Authenticated user no longer exists',
          );
        }
        return identity;
      }),
    };
    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: JWT_SECRET,
              JWT_ACCESS_EXPIRES_IN: '15m',
              TICKET_TOKEN_SECRET: TICKET_SECRET,
            }),
          ],
        }),
        PrismaModule,
        TicketsModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue(authService)
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
    jwt = fixture.get(JwtService);
    ticketTokens = fixture.get(TicketTokenService);

    customerId = await createUser('customer', [RoleCode.CUSTOMER]);
    vendorAOwnerId = await createUser('vendor-a', [RoleCode.VENDOR]);
    vendorBOwnerId = await createUser('vendor-b', [RoleCode.VENDOR]);
    draftVendorOwnerId = await createUser('vendor-draft', [RoleCode.VENDOR]);

    vendorAId = await createVendor(vendorAOwnerId, 'a', VendorStatus.APPROVED);
    vendorBId = await createVendor(vendorBOwnerId, 'b', VendorStatus.APPROVED);
    await createVendor(draftVendorOwnerId, 'draft', VendorStatus.DRAFT);

    categoryId = (
      await prisma.category.create({
        data: {
          code: `TV_${run.toUpperCase()}`,
          name: `Ticket Validation ${run}`,
          slug: `ticket-validation-${run}`,
          scope: CategoryScope.EVENT,
        },
      })
    ).id;
    eventServiceId = await createService(
      vendorAId,
      ServiceKind.EVENT,
      'Renamed Workshop',
      'event',
    );
    serviceServiceId = await createService(
      vendorAId,
      ServiceKind.SERVICE,
      'Live Service Name',
      'service',
    );
    vendorBServiceId = await createService(
      vendorBId,
      ServiceKind.EVENT,
      'Vendor B Event',
      'vendor-b',
    );

    const [dbTime] = await prisma.$queryRaw<DbNowRow[]>`
      SELECT NOW() AS "now"
    `;
    if (!dbTime) throw new Error('Database time unavailable');
    const minute = 60_000;
    activeEventSlotId = await createSlot(
      eventServiceId,
      new Date(dbTime.now.getTime() - 60 * minute),
      new Date(dbTime.now.getTime() + 60 * minute),
      SlotStatus.OPEN,
    );
    activeServiceSlotId = await createSlot(
      serviceServiceId,
      new Date(dbTime.now.getTime() - 60 * minute),
      new Date(dbTime.now.getTime() + 60 * minute),
      SlotStatus.OPEN,
    );
    futureSlotId = await createSlot(
      eventServiceId,
      new Date(dbTime.now.getTime() + 60 * minute),
      new Date(dbTime.now.getTime() + 120 * minute),
      SlotStatus.OPEN,
    );
    expiredSlotId = await createSlot(
      eventServiceId,
      new Date(dbTime.now.getTime() - 120 * minute),
      new Date(dbTime.now.getTime() - 60 * minute),
      SlotStatus.OPEN,
    );
    cancelledSlotId = await createSlot(
      eventServiceId,
      new Date(dbTime.now.getTime() - 60 * minute),
      new Date(dbTime.now.getTime() + 60 * minute),
      SlotStatus.CANCELLED,
    );
    closedSlotId = await createSlot(
      eventServiceId,
      new Date(dbTime.now.getTime() - 60 * minute),
      new Date(dbTime.now.getTime() + 60 * minute),
      SlotStatus.CLOSED,
    );
    vendorBSlotId = await createSlot(
      vendorBServiceId,
      new Date(dbTime.now.getTime() - 60 * minute),
      new Date(dbTime.now.getTime() + 60 * minute),
      SlotStatus.OPEN,
    );
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.ticket.deleteMany({
        where: { bookingItem: { booking: { customerId } } },
      });
      await prisma.booking.deleteMany({ where: { customerId } });
      await prisma.slot.deleteMany({ where: { id: { in: slotIds } } });
      await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
      await prisma.category.deleteMany({ where: { id: categoryId } });
      await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  async function createUser(label: string, roles: string[]): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `ticket-validation-${run}-${label}@example.test`,
        status: UserStatus.ACTIVE,
      },
    });
    userIds.push(user.id);
    identities.set(user.id, {
      id: user.id,
      email: user.email,
      roles,
      profile: null,
    });
    return user.id;
  }

  async function createVendor(
    ownerUserId: string,
    suffix: string,
    status: VendorStatus,
  ): Promise<string> {
    const vendor = await prisma.vendor.create({
      data: {
        ownerUserId,
        displayName: `Validation Vendor ${suffix} ${run}`,
        slug: `validation-vendor-${suffix}-${run}`,
        status,
      },
    });
    vendorIds.push(vendor.id);
    return vendor.id;
  }

  async function createService(
    vendorId: string,
    kind: ServiceKind,
    title: string,
    suffix: string,
  ): Promise<string> {
    const service = await prisma.service.create({
      data: {
        vendorId,
        categoryId,
        kind,
        title,
        slug: `validation-${suffix}-${run}`,
        priceAmount: 100_000n,
        status: ServiceStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
    serviceIds.push(service.id);
    return service.id;
  }

  async function createSlot(
    serviceId: string,
    startAt: Date,
    endAt: Date,
    status: SlotStatus,
  ): Promise<string> {
    const slot = await prisma.slot.create({
      data: { serviceId, startAt, endAt, capacity: 100, status },
    });
    slotIds.push(slot.id);
    return slot.id;
  }

  async function createTicketFixture(
    input: {
      vendorId?: string;
      serviceId?: string;
      slotId?: string;
      bookingStatus?: BookingStatus;
      ticketStatus?: TicketStatus;
      snapshotTitle?: string;
    } = {},
  ) {
    sequence += 1;
    const selectedVendorId = input.vendorId ?? vendorAId;
    const selectedServiceId = input.serviceId ?? eventServiceId;
    const selectedSlotId = input.slotId ?? activeEventSlotId;
    const slot = await prisma.slot.findUniqueOrThrow({
      where: { id: selectedSlotId },
    });
    const booking = await prisma.booking.create({
      data: {
        bookingCode: `TV-${run}-${sequence}`,
        customerId,
        vendorId: selectedVendorId,
        status: input.bookingStatus ?? BookingStatus.CONFIRMED,
        subtotalAmount: 100_000n,
        totalAmount: 100_000n,
        confirmedAt:
          (input.bookingStatus ?? BookingStatus.CONFIRMED) ===
          BookingStatus.CONFIRMED
            ? new Date()
            : null,
        items: {
          create: {
            serviceId: selectedServiceId,
            slotId: selectedSlotId,
            quantity: 1,
            unitPriceAmount: 100_000n,
            subtotalAmount: 100_000n,
            pricingSource: PricingSource.SERVICE,
            serviceTitleSnapshot: input.snapshotTitle ?? 'Original Workshop',
            slotStartAtSnapshot: slot.startAt,
            slotEndAtSnapshot: slot.endAt,
          },
        },
      },
      include: { items: true },
    });
    const ticket = await prisma.ticket.create({
      data: {
        bookingItemId: booking.items[0]!.id,
        sequenceNo: 1,
        ticketCode: `GBT-TV-${run}-${sequence}`,
        tokenNonce: randomBytes(24).toString('base64url'),
        status: input.ticketStatus ?? TicketStatus.ISSUED,
        checkedInAt:
          input.ticketStatus === TicketStatus.CHECKED_IN ? new Date() : null,
        voidedAt:
          input.ticketStatus === TicketStatus.VOIDED ? new Date() : null,
      },
    });
    return {
      booking,
      ticket,
      token: ticketTokens.generateToken(ticket),
    };
  }

  async function tokenFor(userId: string, roles?: string[]): Promise<string> {
    const identity = identities.get(userId);
    if (!identity) throw new Error('Unknown test identity');
    const payload: JwtPayload = {
      sub: identity.id,
      roles: roles ?? identity.roles,
      type: 'access',
    };
    return jwt.signAsync(payload);
  }

  async function validateAs(
    token: string,
    userId = vendorAOwnerId,
    roles?: string[],
    expectedStatus = 200,
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/vendor/tickets/validate')
      .auth(await tokenFor(userId, roles), { type: 'bearer' })
      .send({ token })
      .expect(expectedStatus);
  }

  async function checkInAs(
    token: string,
    userId = vendorAOwnerId,
    roles?: string[],
    expectedStatus?: number,
  ) {
    const call = request(app.getHttpServer())
      .post('/api/v1/vendor/tickets/check-in')
      .auth(await tokenFor(userId, roles), { type: 'bearer' })
      .send({ token });
    return expectedStatus === undefined ? call : call.expect(expectedStatus);
  }

  it('returns VALID with historical title and safe Event/Slot context', async () => {
    const fixture = await createTicketFixture();
    const response = await validateAs(fixture.token);
    expect(response.body).toMatchObject({
      authentic: true,
      valid: true,
      checkInEligible: true,
      reason: TicketValidationReason.VALID,
      ticket: {
        id: fixture.ticket.id,
        ticketCode: fixture.ticket.ticketCode,
        status: TicketStatus.ISSUED,
      },
      booking: {
        id: fixture.booking.id,
        bookingCode: fixture.booking.bookingCode,
        status: BookingStatus.CONFIRMED,
      },
      service: {
        id: eventServiceId,
        title: 'Original Workshop',
        kind: ServiceKind.EVENT,
      },
      slot: { id: activeEventSlotId, status: SlotStatus.OPEN },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /tokenNonce|tokenVersion|signature|customer|email|phone|payment/,
    );
  });

  it('supports SERVICE context without exposing the renamed catalog title', async () => {
    const fixture = await createTicketFixture({
      serviceId: serviceServiceId,
      slotId: activeServiceSlotId,
      snapshotTitle: 'Booked Service Snapshot',
    });
    const response = await validateAs(fixture.token);
    expect(response.body.service).toEqual({
      id: serviceServiceId,
      title: 'Booked Service Snapshot',
      kind: ServiceKind.SERVICE,
    });
  });

  it.each([
    ['malformed', 'not-a-ticket-token'],
    ['tampered signature', null],
    ['tampered nonce', null],
  ])(
    'returns a safe INVALID_TOKEN result for %s input',
    async (kind, value) => {
      const fixture = await createTicketFixture();
      const segments = fixture.token.split('.');
      let candidate = value;
      if (kind === 'tampered signature') {
        const signature = segments[3]!;
        segments[3] = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
        candidate = segments.join('.');
      }
      if (kind === 'tampered nonce') {
        const nonce = segments[2]!;
        segments[2] = `${nonce.startsWith('A') ? 'B' : 'A'}${nonce.slice(1)}`;
        candidate = segments.join('.');
      }
      const response = await validateAs(candidate!);
      expect(response.body).toEqual({
        authentic: false,
        valid: false,
        checkInEligible: false,
        reason: TicketValidationReason.INVALID_TOKEN,
      });
      expect(JSON.stringify(response.body)).not.toContain(fixture.ticket.id);
    },
  );

  it.each([
    ['expired', SlotStatus.OPEN, TicketValidationReason.SLOT_EXPIRED, false],
    ['future', SlotStatus.OPEN, TicketValidationReason.SLOT_NOT_STARTED, true],
    [
      'cancelled',
      SlotStatus.CANCELLED,
      TicketValidationReason.SLOT_CANCELLED,
      false,
    ],
    ['closed', SlotStatus.CLOSED, TicketValidationReason.VALID, true],
  ])(
    'validates Slot policy for %s as %s',
    async (slotCase, slotStatus, reason, valid) => {
      const slotId = {
        expired: expiredSlotId,
        future: futureSlotId,
        cancelled: cancelledSlotId,
        closed: closedSlotId,
      }[slotCase];
      const fixture = await createTicketFixture({ slotId });
      const response = await validateAs(fixture.token);
      expect(response.body).toMatchObject({
        authentic: true,
        valid,
        checkInEligible: reason === TicketValidationReason.VALID,
        reason,
        slot: { status: slotStatus },
      });
    },
  );

  it.each([
    [TicketStatus.CHECKED_IN, TicketValidationReason.ALREADY_CHECKED_IN, true],
    [TicketStatus.VOIDED, TicketValidationReason.TICKET_VOIDED, false],
  ])(
    'returns the expected decision for %s',
    async (ticketStatus, reason, valid) => {
      const fixture = await createTicketFixture({ ticketStatus });
      const response = await validateAs(fixture.token);
      expect(response.body).toMatchObject({
        authentic: true,
        valid,
        checkInEligible: false,
        reason,
        ticket: { status: ticketStatus },
      });
    },
  );

  it('denies cross-Vendor validation without leaking Ticket metadata', async () => {
    const fixture = await createTicketFixture();
    const response = await validateAs(
      fixture.token,
      vendorBOwnerId,
      undefined,
      403,
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      new RegExp(`${fixture.ticket.id}|${fixture.ticket.ticketCode}`),
    );
  });

  it('requires an approved Vendor, VENDOR role, and authentication', async () => {
    const fixture = await createTicketFixture();
    await validateAs(fixture.token, draftVendorOwnerId, undefined, 403);
    await validateAs(fixture.token, customerId, [RoleCode.CUSTOMER], 403);
    await validateAs(fixture.token, customerId, [RoleCode.ADMIN], 403);
    await request(app.getHttpServer())
      .post('/api/v1/vendor/tickets/validate')
      .send({ token: fixture.token })
      .expect(401);
  });

  it('rejects empty, oversized, and client-supplied identity fields', async () => {
    const accessToken = await tokenFor(vendorAOwnerId);
    for (const body of [
      { token: '' },
      { token: 'x'.repeat(513) },
      { token: 'synthetic', vendorId: vendorAId },
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/vendor/tickets/validate')
        .auth(accessToken, { type: 'bearer' })
        .send(body)
        .expect(400);
    }
  });

  it('is read-only and stable under concurrent validation', async () => {
    const fixture = await createTicketFixture();
    const before = await prisma.ticket.findUniqueOrThrow({
      where: { id: fixture.ticket.id },
    });
    const calls = await Promise.all(
      Array.from({ length: 5 }, () => validateAs(fixture.token)),
    );
    expect(calls.every((response) => response.status === 200)).toBe(true);
    expect(calls.every((response) => response.body.reason === 'VALID')).toBe(
      true,
    );
    const after = await prisma.ticket.findUniqueOrThrow({
      where: { id: fixture.ticket.id },
    });
    expect(after).toEqual(before);
  });

  it('returns INVALID_TOKEN when a once-valid Ticket no longer exists', async () => {
    const fixture = await createTicketFixture();
    await prisma.ticket.delete({ where: { id: fixture.ticket.id } });
    const response = await validateAs(fixture.token);
    expect(response.body).toEqual({
      authentic: false,
      valid: false,
      checkInEligible: false,
      reason: TicketValidationReason.INVALID_TOKEN,
    });
  });

  it('does not reveal Vendor A data through a valid Vendor B Ticket response', async () => {
    const fixture = await createTicketFixture({
      vendorId: vendorBId,
      serviceId: vendorBServiceId,
      slotId: vendorBSlotId,
      snapshotTitle: 'Vendor B Snapshot',
    });
    const response = await validateAs(fixture.token, vendorBOwnerId);
    expect(response.body).toMatchObject({
      reason: TicketValidationReason.VALID,
      service: { title: 'Vendor B Snapshot' },
    });
  });

  it('validates, checks in with the JWT actor, then reports ALREADY_CHECKED_IN', async () => {
    const fixture = await createTicketFixture();
    const bookingBefore = await prisma.booking.findUniqueOrThrow({
      where: { id: fixture.booking.id },
    });
    const slotBefore = await prisma.slot.findUniqueOrThrow({
      where: { id: activeEventSlotId },
    });
    await validateAs(fixture.token);

    const response = await checkInAs(
      fixture.token,
      vendorAOwnerId,
      undefined,
      200,
    );
    expect(response.body).toMatchObject({
      success: true,
      ticket: {
        id: fixture.ticket.id,
        ticketCode: fixture.ticket.ticketCode,
        status: TicketStatus.CHECKED_IN,
      },
      booking: { bookingCode: fixture.booking.bookingCode },
      service: { title: 'Original Workshop', kind: ServiceKind.EVENT },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /checkedInBy|tokenNonce|signature|customer|email|phone|payment/,
    );

    const stored = await prisma.ticket.findUniqueOrThrow({
      where: { id: fixture.ticket.id },
    });
    expect(stored).toMatchObject({
      status: TicketStatus.CHECKED_IN,
      checkedInByUserId: vendorAOwnerId,
    });
    expect(stored.checkedInAt).toBeInstanceOf(Date);
    await expect(
      prisma.booking.findUniqueOrThrow({ where: { id: fixture.booking.id } }),
    ).resolves.toEqual(bookingBefore);
    await expect(
      prisma.slot.findUniqueOrThrow({ where: { id: activeEventSlotId } }),
    ).resolves.toEqual(slotBefore);

    const validation = await validateAs(fixture.token);
    expect(validation.body).toMatchObject({
      authentic: true,
      valid: true,
      checkInEligible: false,
      reason: TicketValidationReason.ALREADY_CHECKED_IN,
      ticket: { checkedInAt: stored.checkedInAt?.toISOString() },
    });
  });

  it('returns a retry-safe conflict without rewriting the original audit fields', async () => {
    const fixture = await createTicketFixture();
    await checkInAs(fixture.token, vendorAOwnerId, undefined, 200);
    const first = await prisma.ticket.findUniqueOrThrow({
      where: { id: fixture.ticket.id },
    });

    const duplicate = await checkInAs(
      fixture.token,
      vendorAOwnerId,
      undefined,
      409,
    );
    expect(duplicate.body).toMatchObject({
      code: TicketValidationReason.ALREADY_CHECKED_IN,
      checkedInAt: first.checkedInAt?.toISOString(),
    });

    const after = await prisma.ticket.findUniqueOrThrow({
      where: { id: fixture.ticket.id },
    });
    expect(after.checkedInAt).toEqual(first.checkedInAt);
    expect(after.checkedInByUserId).toBe(first.checkedInByUserId);
  });

  it('allows exactly one winner under a concurrent double scan', async () => {
    const fixture = await createTicketFixture();
    const responses = await Promise.all([
      checkInAs(fixture.token),
      checkInAs(fixture.token),
    ]);

    expect(responses.map(({ status }) => status).sort((a, b) => a - b)).toEqual(
      [200, 409],
    );
    expect(responses.find(({ status }) => status === 409)?.body).toMatchObject({
      code: TicketValidationReason.ALREADY_CHECKED_IN,
    });

    const stored = await prisma.ticket.findUniqueOrThrow({
      where: { id: fixture.ticket.id },
    });
    expect(stored).toMatchObject({
      status: TicketStatus.CHECKED_IN,
      checkedInByUserId: vendorAOwnerId,
    });
    expect(stored.checkedInAt).toBeInstanceOf(Date);
  });

  it('denies cross-Vendor check-in before mutation', async () => {
    const fixture = await createTicketFixture();
    await checkInAs(fixture.token, vendorBOwnerId, undefined, 403);

    const stored = await prisma.ticket.findUniqueOrThrow({
      where: { id: fixture.ticket.id },
    });
    expect(stored).toMatchObject({
      status: TicketStatus.ISSUED,
      checkedInAt: null,
      checkedInByUserId: null,
    });
  });

  it('rejects invalid, voided, future, expired, and cancelled Ticket contexts', async () => {
    await checkInAs('not-a-ticket-token', vendorAOwnerId, undefined, 400);

    const cases = [
      {
        input: { ticketStatus: TicketStatus.VOIDED },
        reason: TicketValidationReason.TICKET_VOIDED,
      },
      {
        input: { slotId: futureSlotId },
        reason: TicketValidationReason.SLOT_NOT_STARTED,
      },
      {
        input: { slotId: expiredSlotId },
        reason: TicketValidationReason.SLOT_EXPIRED,
      },
      {
        input: { slotId: cancelledSlotId },
        reason: TicketValidationReason.SLOT_CANCELLED,
      },
      {
        input: { bookingStatus: BookingStatus.CANCELLED },
        reason: TicketValidationReason.BOOKING_CANCELLED,
      },
      {
        input: { bookingStatus: BookingStatus.EXPIRED },
        reason: TicketValidationReason.BOOKING_EXPIRED,
      },
    ];

    for (const testCase of cases) {
      const fixture = await createTicketFixture(testCase.input);
      const response = await checkInAs(
        fixture.token,
        vendorAOwnerId,
        undefined,
        409,
      );
      expect(response.body).toMatchObject({ code: testCase.reason });
      const stored = await prisma.ticket.findUniqueOrThrow({
        where: { id: fixture.ticket.id },
      });
      expect(stored.status).toBe(fixture.ticket.status);
      expect(stored.checkedInByUserId).toBeNull();
    }
  });

  it('allows CLOSED Slots during their active time and enforces endpoint guards', async () => {
    const closed = await createTicketFixture({ slotId: closedSlotId });
    await checkInAs(closed.token, vendorAOwnerId, undefined, 200);

    const guarded = await createTicketFixture();
    await checkInAs(guarded.token, draftVendorOwnerId, undefined, 403);
    await checkInAs(guarded.token, customerId, [RoleCode.CUSTOMER], 403);
    await request(app.getHttpServer())
      .post('/api/v1/vendor/tickets/check-in')
      .send({ token: guarded.token })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/vendor/tickets/check-in')
      .auth(await tokenFor(vendorAOwnerId), { type: 'bearer' })
      .send({ token: guarded.token, checkedInByUserId: customerId })
      .expect(400);
    await expect(
      prisma.ticket.findUniqueOrThrow({ where: { id: guarded.ticket.id } }),
    ).resolves.toMatchObject({
      status: TicketStatus.ISSUED,
      checkedInAt: null,
      checkedInByUserId: null,
    });
  });
});
