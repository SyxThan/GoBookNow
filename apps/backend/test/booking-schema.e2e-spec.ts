import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
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
  UserStatus,
  VendorStatus,
} from '../src/generated/prisma/client.js';

describe('Booking schema foundation (e2e, PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const vendorIds: string[] = [];
  const categoryIds: string[] = [];
  const serviceIds: string[] = [];
  const slotIds: string[] = [];
  let customerId: string;
  let otherCustomerId: string;
  let vendorId: string;
  let categoryId: string;
  let serviceId: string;
  let slotId: string;
  let secondSlotId: string;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
    }).compile();
    app = fixture.createNestApplication();
    await app.init();
    prisma = fixture.get(PrismaService);

    customerId = await createUser('customer');
    otherCustomerId = await createUser('other-customer');
    const ownerUserId = await createUser('vendor-owner');
    vendorId = await createVendor(ownerUserId);
    categoryId = await createCategory();
    serviceId = await createService();
    slotId = await createSlot(1);
    secondSlotId = await createSlot(2, 120_000n);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.booking.deleteMany({
        where: { bookingCode: { startsWith: `BKG-${run}-` } },
      });
      await prisma.slot.deleteMany({ where: { id: { in: slotIds } } });
      await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
      await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  async function createUser(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `booking-${run}-${label}@example.com`,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return user.id;
  }

  async function createVendor(ownerUserId: string): Promise<string> {
    const vendor = await prisma.vendor.create({
      data: {
        ownerUserId,
        displayName: `Booking Vendor ${run}`,
        slug: `booking-vendor-${run}`,
        status: VendorStatus.APPROVED,
      },
      select: { id: true },
    });
    vendorIds.push(vendor.id);
    return vendor.id;
  }

  async function createCategory(): Promise<string> {
    const category = await prisma.category.create({
      data: {
        code: `BOOKING_${run.toUpperCase()}`,
        name: `Booking Category ${run}`,
        slug: `booking-category-${run}`,
        scope: CategoryScope.EVENT,
      },
      select: { id: true },
    });
    categoryIds.push(category.id);
    return category.id;
  }

  async function createService(): Promise<string> {
    const service = await prisma.service.create({
      data: {
        vendorId,
        categoryId,
        kind: ServiceKind.EVENT,
        title: `Booking Workshop ${run}`,
        slug: `booking-workshop-${run}`,
        priceAmount: 150_000n,
        status: ServiceStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    serviceIds.push(service.id);
    return service.id;
  }

  async function createSlot(
    day: number,
    priceAmount?: bigint,
  ): Promise<string> {
    const slot = await prisma.slot.create({
      data: {
        serviceId,
        startAt: new Date(Date.UTC(2099, 0, day, 2)),
        endAt: new Date(Date.UTC(2099, 0, day, 4)),
        capacity: 10,
        priceAmount,
        status: SlotStatus.OPEN,
      },
      select: { id: true },
    });
    slotIds.push(slot.id);
    return slot.id;
  }

  async function createBooking(input: {
    suffix: string;
    customer?: string;
    subtotalAmount?: bigint;
    totalAmount?: bigint;
    idempotencyKey?: string | null;
  }) {
    return prisma.booking.create({
      data: {
        bookingCode: `BKG-${run}-${input.suffix}`,
        customerId: input.customer ?? customerId,
        vendorId,
        subtotalAmount: input.subtotalAmount ?? 0n,
        totalAmount: input.totalAmount ?? input.subtotalAmount ?? 0n,
        idempotencyKey: input.idempotencyKey,
        expiresAt: new Date(Date.UTC(2099, 0, 1, 1)),
      },
    });
  }

  async function createBookingItem(input: {
    suffix: string;
    bookingId?: string;
    targetSlotId?: string;
    quantity?: number;
    unitPriceAmount?: bigint;
    subtotalAmount?: bigint;
    pricingSource?: PricingSource;
  }) {
    const booking =
      input.bookingId === undefined
        ? await createBooking({ suffix: input.suffix })
        : { id: input.bookingId };
    return prisma.bookingItem.create({
      data: {
        bookingId: booking.id,
        serviceId,
        slotId: input.targetSlotId ?? slotId,
        quantity: input.quantity ?? 2,
        unitPriceAmount: input.unitPriceAmount ?? 150_000n,
        subtotalAmount: input.subtotalAmount ?? 300_000n,
        currency: 'VND',
        pricingSource: input.pricingSource ?? PricingSource.SERVICE,
        serviceTitleSnapshot: `Booking Workshop ${run}`,
        slotStartAtSnapshot: new Date(Date.UTC(2099, 0, 1, 2)),
        slotEndAtSnapshot: new Date(Date.UTC(2099, 0, 1, 4)),
      },
    });
  }

  it('supports the required Booking aggregate relations', async () => {
    const booking = await prisma.booking.create({
      data: {
        bookingCode: `BKG-${run}-REL`,
        customerId,
        vendorId,
        subtotalAmount: 540_000n,
        totalAmount: 540_000n,
        expiresAt: new Date(Date.UTC(2099, 0, 1, 1)),
        items: {
          create: [
            {
              serviceId,
              slotId,
              quantity: 2,
              unitPriceAmount: 150_000n,
              subtotalAmount: 300_000n,
              currency: 'VND',
              pricingSource: PricingSource.SERVICE,
              serviceTitleSnapshot: `Booking Workshop ${run}`,
              slotStartAtSnapshot: new Date(Date.UTC(2099, 0, 1, 2)),
              slotEndAtSnapshot: new Date(Date.UTC(2099, 0, 1, 4)),
              reservation: {
                create: {
                  slotId,
                  quantity: 2,
                  status: ReservationStatus.HELD,
                  expiresAt: new Date(Date.UTC(2099, 0, 1, 1)),
                },
              },
            },
            {
              serviceId,
              slotId: secondSlotId,
              quantity: 2,
              unitPriceAmount: 120_000n,
              subtotalAmount: 240_000n,
              currency: 'VND',
              pricingSource: PricingSource.SLOT,
              serviceTitleSnapshot: `Booking Workshop ${run}`,
              slotStartAtSnapshot: new Date(Date.UTC(2099, 0, 2, 2)),
              slotEndAtSnapshot: new Date(Date.UTC(2099, 0, 2, 4)),
              reservation: {
                create: {
                  slotId: secondSlotId,
                  quantity: 2,
                  status: ReservationStatus.HELD,
                  expiresAt: new Date(Date.UTC(2099, 0, 1, 1)),
                },
              },
            },
          ],
        },
      },
      include: {
        customer: true,
        vendor: true,
        items: {
          include: {
            service: true,
            slot: true,
            reservation: { include: { slot: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    expect(booking.customer.id).toBe(customerId);
    expect(booking.vendor.id).toBe(vendorId);
    expect(booking.items).toHaveLength(2);
    expect(booking.items[0].service.id).toBe(serviceId);
    expect(booking.items[0].slot.id).toBe(slotId);
    expect(booking.items[0].reservation?.bookingItemId).toBe(
      booking.items[0].id,
    );
    expect(booking.items[1].reservation?.slot.id).toBe(secondSlotId);
  });

  it('enforces quantity and non-negative money CHECK constraints', async () => {
    await expect(
      createBooking({
        suffix: 'NEG-SUB',
        subtotalAmount: -1n,
        totalAmount: 0n,
      }),
    ).rejects.toBeTruthy();
    await expect(
      createBooking({
        suffix: 'NEG-TOT',
        subtotalAmount: 0n,
        totalAmount: -1n,
      }),
    ).rejects.toBeTruthy();

    for (const [suffix, quantity] of [
      ['QTY-ZERO', 0],
      ['QTY-NEG', -1],
    ] as const) {
      await expect(
        createBookingItem({ suffix, quantity }),
      ).rejects.toBeTruthy();
    }
    await expect(
      createBookingItem({ suffix: 'NEG-UNIT', unitPriceAmount: -1n }),
    ).rejects.toBeTruthy();
    await expect(
      createBookingItem({ suffix: 'NEG-ITEM-SUB', subtotalAmount: -1n }),
    ).rejects.toBeTruthy();

    const item = await createBookingItem({ suffix: 'RES-QTY' });
    await expect(
      prisma.reservation.create({
        data: {
          bookingItemId: item.id,
          slotId,
          quantity: 0,
          status: ReservationStatus.HELD,
        },
      }),
    ).rejects.toBeTruthy();
  });

  it('keeps BookingItem price and display snapshots immutable', async () => {
    const item = await createBookingItem({ suffix: 'SNAPSHOT' });
    await prisma.service.update({
      where: { id: serviceId },
      data: {
        title: `Renamed Workshop ${run}`,
        priceAmount: 250_000n,
      },
    });
    await prisma.slot.update({
      where: { id: slotId },
      data: {
        startAt: new Date(Date.UTC(2099, 0, 10, 2)),
        endAt: new Date(Date.UTC(2099, 0, 10, 4)),
        priceAmount: 180_000n,
      },
    });

    const reloaded = await prisma.bookingItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(reloaded.unitPriceAmount).toBe(150_000n);
    expect(reloaded.quantity).toBe(2);
    expect(reloaded.subtotalAmount).toBe(300_000n);
    expect(reloaded.currency).toBe('VND');
    expect(reloaded.pricingSource).toBe(PricingSource.SERVICE);
    expect(reloaded.serviceTitleSnapshot).toBe(`Booking Workshop ${run}`);
    expect(reloaded.slotStartAtSnapshot.toISOString()).toBe(
      '2099-01-01T02:00:00.000Z',
    );
    expect(reloaded.slotEndAtSnapshot.toISOString()).toBe(
      '2099-01-01T04:00:00.000Z',
    );
  });

  it('allows zero-price booking items', async () => {
    const item = await createBookingItem({
      suffix: 'FREE',
      quantity: 3,
      unitPriceAmount: 0n,
      subtotalAmount: 0n,
      pricingSource: PricingSource.SLOT,
    });
    expect(item.unitPriceAmount).toBe(0n);
    expect(item.subtotalAmount).toBe(0n);
  });

  it('uses PostgreSQL BIGINT for booking monetary columns', async () => {
    const columns = await prisma.$queryRaw<
      Array<{ table_name: string; column_name: string; data_type: string }>
    >`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('bookings', 'booking_items')
        AND column_name IN (
          'subtotal_amount',
          'total_amount',
          'unit_price_amount'
        )
      ORDER BY table_name, column_name
    `;
    expect(columns).toEqual([
      {
        table_name: 'booking_items',
        column_name: 'subtotal_amount',
        data_type: 'bigint',
      },
      {
        table_name: 'booking_items',
        column_name: 'unit_price_amount',
        data_type: 'bigint',
      },
      {
        table_name: 'bookings',
        column_name: 'subtotal_amount',
        data_type: 'bigint',
      },
      {
        table_name: 'bookings',
        column_name: 'total_amount',
        data_type: 'bigint',
      },
    ]);
  });

  it('enforces bookingCode and customer idempotency constraints', async () => {
    await createBooking({ suffix: 'UNIQ-CODE-A' });
    await expect(createBooking({ suffix: 'UNIQ-CODE-A' })).rejects.toBeTruthy();

    await createBooking({
      suffix: 'IDEMP-A',
      idempotencyKey: `idem-${run}`,
    });
    await expect(
      createBooking({
        suffix: 'IDEMP-B',
        idempotencyKey: `idem-${run}`,
      }),
    ).rejects.toBeTruthy();
    await expect(
      createBooking({
        suffix: 'IDEMP-C',
        customer: otherCustomerId,
        idempotencyKey: `idem-${run}`,
      }),
    ).resolves.toBeTruthy();
    await expect(createBooking({ suffix: 'NULL-A' })).resolves.toBeTruthy();
    await expect(createBooking({ suffix: 'NULL-B' })).resolves.toBeTruthy();
  });

  it('stores the required Booking and Reservation enum values only', async () => {
    const labels = await prisma.$queryRaw<
      Array<{ typname: string; enumlabel: string }>
    >`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('BookingStatus', 'ReservationStatus')
      ORDER BY t.typname, e.enumsortorder
    `;
    expect(labels).toEqual([
      { typname: 'BookingStatus', enumlabel: BookingStatus.PENDING_PAYMENT },
      { typname: 'BookingStatus', enumlabel: BookingStatus.CONFIRMED },
      { typname: 'BookingStatus', enumlabel: BookingStatus.EXPIRED },
      { typname: 'BookingStatus', enumlabel: BookingStatus.CANCELLED },
      { typname: 'ReservationStatus', enumlabel: ReservationStatus.HELD },
      { typname: 'ReservationStatus', enumlabel: ReservationStatus.CONFIRMED },
      { typname: 'ReservationStatus', enumlabel: ReservationStatus.EXPIRED },
      { typname: 'ReservationStatus', enumlabel: ReservationStatus.RELEASED },
    ]);
  });
});
