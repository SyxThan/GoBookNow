import { Injectable } from '@nestjs/common';
import { Prisma, ReservationStatus } from '../generated/prisma/client.js';

type CapacityTransactionClient = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'reservation'
>;

@Injectable()
export class CapacityService {
  async lockSlots(
    transaction: CapacityTransactionClient,
    sortedSlotIds: readonly string[],
  ): Promise<void> {
    if (sortedSlotIds.length === 0) return;

    await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "slots"
      WHERE "id" IN (${Prisma.join(sortedSlotIds)})
      ORDER BY "id" ASC
      FOR UPDATE
    `);
  }

  async lockServices(
    transaction: CapacityTransactionClient,
    sortedServiceIds: readonly string[],
  ): Promise<void> {
    if (sortedServiceIds.length === 0) return;

    await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "services"
      WHERE "id" IN (${Prisma.join(sortedServiceIds)})
      ORDER BY "id" ASC
      FOR UPDATE
    `);
  }

  async calculateConsumedCapacity(
    transaction: CapacityTransactionClient,
    slotIds: readonly string[],
    now: Date,
  ): Promise<Map<string, number>> {
    if (slotIds.length === 0) return new Map();

    const consumed = await transaction.reservation.groupBy({
      by: ['slotId'],
      where: {
        slotId: { in: [...slotIds] },
        OR: [
          { status: ReservationStatus.CONFIRMED },
          {
            status: ReservationStatus.HELD,
            expiresAt: { gt: now },
          },
        ],
      },
      _sum: { quantity: true },
    });

    return new Map(consumed.map((row) => [row.slotId, row._sum.quantity ?? 0]));
  }
}
