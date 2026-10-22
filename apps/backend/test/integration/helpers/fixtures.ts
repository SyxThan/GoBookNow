import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import {
  RoleCode,
  type RoleCode as Role,
} from '../../../src/auth/constants/role.constants.js';
import { BookingsService } from '../../../src/bookings/bookings.service.js';
import { CapacityService } from '../../../src/bookings/capacity.service.js';
import { BookingExpirationService } from '../../../src/bookings/expiration/booking-expiration.service.js';
import type { PrismaService } from '../../../src/database/prisma/prisma.service.js';
import {
  CategoryScope,
  PaymentProvider,
  ServiceKind,
  ServiceStatus,
  UserStatus,
  VendorStatus,
  VoucherType,
  type Slot,
} from '../../../src/generated/prisma/client.js';
import { PaymentsService } from '../../../src/payments/payments.service.js';
import { databaseNow } from './test-database.js';

export type Identity = { id: string; roles: Role[] };
export type Scenario = Awaited<ReturnType<FixtureFactory['createScenario']>>;

export class FixtureFactory {
  constructor(
    readonly app: INestApplication,
    readonly prisma: PrismaService,
  ) {}

  readonly unique = () => randomUUID().replaceAll('-', '');

  async createIdentity(roles: Role[]): Promise<Identity> {
    const user = await this.prisma.user.create({
      data: {
        email: `integration-${this.unique()}@example.invalid`,
        status: UserStatus.ACTIVE,
        userRoles: {
          create: roles.map((role) => ({ role: { connect: { code: role } } })),
        },
      },
    });
    return { id: user.id, roles };
  }
  createCustomer() {
    return this.createIdentity([RoleCode.CUSTOMER]);
  }
  createAdmin() {
    return this.createIdentity([RoleCode.ADMIN]);
  }
  async createApprovedVendor() {
    const owner = await this.createIdentity([RoleCode.VENDOR]);
    return this.prisma.vendor.create({
      data: {
        ownerUserId: owner.id,
        displayName: 'Integration vendor',
        slug: this.unique(),
        status: VendorStatus.APPROVED,
      },
    });
  }
  async createService(vendorId: string, priceAmount = 250_000n) {
    const category = await this.prisma.category.create({
      data: {
        code: this.unique(),
        name: 'Integration category',
        slug: this.unique(),
        scope: CategoryScope.EVENT,
      },
    });
    return this.prisma.service.create({
      data: {
        vendorId,
        categoryId: category.id,
        kind: ServiceKind.EVENT,
        title: 'Integration event',
        slug: this.unique(),
        priceAmount,
        currency: 'VND',
        status: ServiceStatus.PUBLISHED,
        publishedAt: await databaseNow(this.prisma),
      },
    });
  }
  async createSlot(
    serviceId: string,
    options: Partial<
      Pick<Slot, 'startAt' | 'endAt' | 'capacity' | 'priceAmount' | 'status'>
    > = {},
  ) {
    const now = await databaseNow(this.prisma);
    return this.prisma.slot.create({
      data: {
        serviceId,
        startAt: new Date(now.getTime() + 86_400_000),
        endAt: new Date(now.getTime() + 90_000_000),
        capacity: 10,
        ...options,
      },
    });
  }
  async createScenario(
    options: { capacity?: number; price?: bigint; slots?: number } = {},
  ) {
    const customer = await this.createCustomer();
    const vendor = await this.createApprovedVendor();
    const service = await this.createService(vendor.id, options.price);
    const slots: Slot[] = [];
    for (let i = 0; i < (options.slots ?? 1); i++)
      slots.push(
        await this.createSlot(service.id, { capacity: options.capacity ?? 10 }),
      );
    return { customer, vendor, service, slots };
  }
  token(user: Identity) {
    return this.app
      .get(JwtService)
      .sign({ sub: user.id, roles: user.roles, type: 'access' });
  }
  holdRequest(customer: Identity, body: object, key = randomUUID()) {
    return request(this.app.getHttpServer())
      .post('/api/v1/bookings/hold')
      .auth(this.token(customer), { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send(body);
  }
  async createBookingHoldFixture(
    scenario: Scenario,
    quantities = scenario.slots.map(() => 1),
    voucherCode?: string,
  ) {
    const result = await this.app
      .get(BookingsService)
      .hold(scenario.customer.id, randomUUID(), {
        items: scenario.slots.map((slot, index) => ({
          slotId: slot.id,
          quantity: quantities[index]!,
        })),
        ...(voucherCode ? { voucherCode } : {}),
      });
    return this.loadBooking(result.body.id);
  }
  loadBooking(id: string) {
    return this.prisma.booking.findUniqueOrThrow({
      where: { id },
      include: {
        items: { orderBy: { slotId: 'asc' }, include: { reservation: true } },
        payment: { include: { attempts: true } },
        voucherClaim: true,
      },
    });
  }
  async createPaymentFixture(customer: Identity, bookingId: string) {
    return this.app.get(PaymentsService).initiateSepay(customer.id, bookingId);
  }
  async createPaymentAttemptFixture(customer: Identity, bookingId: string) {
    const payment = await this.createPaymentFixture(customer, bookingId);
    return this.prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: payment.attemptId },
    });
  }
  async createConfirmedReservationFixture(
    scenario: Scenario,
    quantities = [1],
  ) {
    const booking = await this.createBookingHoldFixture(scenario, quantities);
    const payment = await this.createPaymentFixture(
      scenario.customer,
      booking.id,
    );
    await this.sendIpn(this.ipn(payment)).expect(200);
    return this.loadBooking(booking.id);
  }
  async backdate(bookingId: string) {
    const past = new Date((await databaseNow(this.prisma)).getTime() - 60_000);
    await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id: bookingId },
        data: { expiresAt: past },
      }),
      this.prisma.reservation.updateMany({
        where: { bookingItem: { bookingId } },
        data: { expiresAt: past },
      }),
      this.prisma.voucherClaim.updateMany({
        where: { bookingId },
        data: { expiresAt: past },
      }),
    ]);
    return past;
  }
  async createVoucher(usageLimit = 1) {
    const now = await databaseNow(this.prisma);
    return this.prisma.voucher.create({
      data: {
        code: `TEST${this.unique().slice(0, 20).toUpperCase()}`,
        type: VoucherType.FIXED,
        fixedAmount: 10_000n,
        usageLimit,
        validFrom: new Date(now.getTime() - 86_400_000),
        validUntil: new Date(now.getTime() + 86_400_000),
      },
    });
  }
  async available(slotId: string) {
    const slot = await this.prisma.slot.findUniqueOrThrow({
      where: { id: slotId },
    });
    const consumed = await this.app
      .get(CapacityService)
      .calculateConsumedCapacity(
        this.prisma,
        [slotId],
        await databaseNow(this.prisma),
      );
    return slot.capacity - (consumed.get(slotId) ?? 0);
  }
  sweep() {
    return this.app.get(BookingExpirationService).sweepExpiredBookings();
  }
  ipn(
    payment: { merchantReference: string; amount: string },
    transactionId = `TX${this.unique()}`,
  ) {
    return {
      timestamp: 1_757_058_220,
      notification_type: 'ORDER_PAID',
      order: {
        id: this.unique(),
        order_id: this.unique(),
        order_status: 'CAPTURED',
        order_currency: 'VND',
        order_amount: `${payment.amount}.00`,
        order_invoice_number: payment.merchantReference,
      },
      transaction: {
        id: this.unique(),
        payment_method: 'BANK_TRANSFER',
        transaction_id: transactionId,
        transaction_type: 'PAYMENT',
        transaction_status: 'APPROVED',
        transaction_amount: payment.amount,
        transaction_currency: 'VND',
      },
      customer: null,
    };
  }
  sendIpn(body: object, secret: string | null = 'integration-only-ipn-secret') {
    const call = request(this.app.getHttpServer())
      .post('/api/v1/webhooks/sepay/ipn')
      .send(body);
    return secret === null ? call : call.set('X-Secret-Key', secret);
  }
  settlementInput(
    bookingId: string,
    payment: { attemptId: string; paymentId: string; amount: string },
    providerTransactionId = `TX${this.unique()}`,
  ) {
    return {
      bookingId,
      attemptId: payment.attemptId,
      paymentId: payment.paymentId,
      provider: PaymentProvider.SEPAY,
      providerTransactionId,
      amount: BigInt(payment.amount),
      currency: 'VND',
    };
  }
}
