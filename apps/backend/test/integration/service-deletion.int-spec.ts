import request from 'supertest';
import { RoleCode } from '../../src/auth/constants/role.constants.js';
import { ServicesModule } from '../../src/services/services.module.js';
import { integrationSuite } from './helpers/test-app.js';

describe('Archived service soft deletion', () => {
  const context = integrationSuite([ServicesModule]);

  it('preserves paid bookings, tickets, reservations and slots while removing catalog access', async () => {
    const { app, prisma, fixtures: f } = context();
    const scenario = await f.createScenario();
    const booking = await f.createConfirmedReservationFixture(scenario, [2]);
    const path = `/api/v1/vendor/services/${scenario.service.id}`;
    const ownerToken = f.token({
      id: scenario.vendor.ownerUserId,
      roles: [RoleCode.VENDOR],
    });
    const tickets = await prisma.ticket.findMany({
      where: { bookingItem: { bookingId: booking.id } },
      orderBy: { id: 'asc' },
    });
    expect(tickets).toHaveLength(2);
    await request(app.getHttpServer())
      .post(`${path}/hide`)
      .auth(ownerToken, { type: 'bearer' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${path}/archive`)
      .auth(ownerToken, { type: 'bearer' })
      .expect(201);
    await request(app.getHttpServer())
      .delete(path)
      .auth(ownerToken, { type: 'bearer' })
      .expect(204);

    expect(
      await prisma.service.findUniqueOrThrow({
        where: { id: scenario.service.id },
        select: { status: true, deletedAt: true },
      }),
    ).toEqual({ status: 'ARCHIVED', deletedAt: expect.any(Date) });
    expect(await f.loadBooking(booking.id)).toEqual(booking);
    expect(
      await prisma.ticket.findMany({
        where: { bookingItem: { bookingId: booking.id } },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(tickets);
    expect(
      await prisma.slot.findUniqueOrThrow({
        where: { id: scenario.slots[0]!.id },
      }),
    ).toEqual(scenario.slots[0]);
    await request(app.getHttpServer())
      .get(`/api/v1/bookings/${booking.id}/tickets`)
      .auth(f.token(scenario.customer), { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(path)
      .auth(ownerToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/services/${scenario.service.slug}`)
      .expect(404);
    const list = await request(app.getHttpServer())
      .get('/api/v1/vendor/services')
      .auth(ownerToken, { type: 'bearer' })
      .expect(200);
    expect(list.body.items).toEqual([]);
    await request(app.getHttpServer())
      .delete(path)
      .auth(ownerToken, { type: 'bearer' })
      .expect(404);
  });

  it('still blocks published deletion and other vendors from deleting archived services', async () => {
    const { app, prisma, fixtures: f } = context();
    const scenario = await f.createScenario();
    const path = `/api/v1/vendor/services/${scenario.service.id}`;
    const ownerToken = f.token({
      id: scenario.vendor.ownerUserId,
      roles: [RoleCode.VENDOR],
    });
    await request(app.getHttpServer())
      .delete(path)
      .auth(ownerToken, { type: 'bearer' })
      .expect(409)
      .expect(({ body }) =>
        expect(body.code).toBe('SERVICE_DELETE_REQUIRES_HIDE'),
      );
    await prisma.service.update({
      where: { id: scenario.service.id },
      data: { status: 'ARCHIVED' },
    });
    const otherVendor = await f.createApprovedVendor();
    await request(app.getHttpServer())
      .delete(path)
      .auth(
        f.token({ id: otherVendor.ownerUserId, roles: [RoleCode.VENDOR] }),
        { type: 'bearer' },
      )
      .expect(403);
    expect(
      await prisma.service.findUniqueOrThrow({
        where: { id: scenario.service.id },
        select: { deletedAt: true },
      }),
    ).toEqual({ deletedAt: null });
  });
});
