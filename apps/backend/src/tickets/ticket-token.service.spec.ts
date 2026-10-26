import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma/prisma.service.js';
import { TicketStatus, type Ticket } from '../generated/prisma/client.js';
import { TicketTokenService } from './ticket-token.service.js';

const SECRET = 'ticket-token-test-secret-with-at-least-32-bytes';

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  const now = new Date('2026-10-12T00:00:00.000Z');
  return {
    id: randomUUID(),
    bookingItemId: randomUUID(),
    sequenceNo: 1,
    ticketCode: 'GBT-0123456789AB',
    tokenNonce: 'abcdefghijklmnopqrstuvwxyzABCDEF',
    tokenVersion: 1,
    status: TicketStatus.ISSUED,
    issuedAt: now,
    checkedInAt: null,
    voidedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function setup(stored: Ticket | null = ticket()) {
  const findUnique = vi.fn().mockResolvedValue(stored);
  const prisma = {
    ticket: { findUnique },
  } as unknown as PrismaService;
  const config = {
    get: vi.fn((name: string) =>
      name === 'TICKET_TOKEN_SECRET' ? SECRET : undefined,
    ),
  } as unknown as ConfigService;
  return {
    service: new TicketTokenService(prisma, config),
    findUnique,
    stored,
  };
}

describe('TicketTokenService', () => {
  it('generates the same deterministic token for the same Ticket', () => {
    const { service, stored } = setup();
    expect(service.generateToken(stored!)).toBe(service.generateToken(stored!));
  });

  it('generates different tokens for different Tickets', () => {
    const { service, stored } = setup();
    const other = ticket({ tokenNonce: '0123456789abcdefghijklmnopqrstuv' });
    expect(service.generateToken(stored!)).not.toBe(
      service.generateToken(other),
    );
  });

  it.each([TicketStatus.ISSUED, TicketStatus.CHECKED_IN, TicketStatus.VOIDED])(
    'verifies and resolves an authentic %s Ticket without mutation',
    async (status) => {
      const stored = ticket({ status });
      const { service, findUnique } = setup(stored);
      const token = service.generateToken(stored);

      await expect(service.verifyAndResolveToken(token)).resolves.toBe(stored);
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: stored.id },
      });
      expect(stored.status).toBe(status);
    },
  );

  it.each(['ticketId', 'nonce', 'signature'] as const)(
    'rejects a token with a tampered %s',
    async (part) => {
      const stored = ticket();
      const { service } = setup(stored);
      const segments = service.generateToken(stored).split('.');
      if (part === 'ticketId') segments[1] = randomUUID();
      if (part === 'nonce') segments[2] = `Z${segments[2]!.slice(1)}`;
      if (part === 'signature') {
        segments[3] = `${segments[3]![0] === 'A' ? 'B' : 'A'}${segments[3]!.slice(1)}`;
      }

      await expect(
        service.verifyAndResolveToken(segments.join('.')),
      ).rejects.toThrow('Invalid ticket token');
    },
  );

  it.each([
    '',
    'v1.only-two',
    'v1.a.b.c.extra',
    'v999.550e8400-e29b-41d4-a716-446655440000.abcdefghijklmnopqrstuv.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'v1.not-a-uuid.abcdefghijklmnopqrstuv.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'v1.550e8400-e29b-41d4-a716-446655440000.abcdefghijklmnopqrstuv.***',
    'x'.repeat(513),
  ])('safely rejects malformed token %#', async (token) => {
    const { service } = setup();
    await expect(service.verifyAndResolveToken(token)).rejects.toThrow(
      'Invalid ticket token',
    );
  });

  it('rejects a correctly signed credential when the stored nonce changed', async () => {
    const original = ticket();
    const { service } = setup(
      ticket({
        id: original.id,
        tokenNonce: 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      }),
    );
    const token = service.generateToken(original);
    await expect(service.verifyAndResolveToken(token)).rejects.toThrow(
      'Invalid ticket token',
    );
  });

  it.each([undefined, '', '   ', 'too-short', 'a'.repeat(31)])(
    'rejects a missing or short signing key at startup (%s)',
    (value) => {
      const prisma = {} as PrismaService;
      const config = {
        get: vi.fn().mockReturnValue(value),
      } as unknown as ConfigService;
      expect(() => new TicketTokenService(prisma, config)).toThrow(
        'TICKET_TOKEN_SECRET must contain at least 32 bytes',
      );
    },
  );

  it('accepts a 32-byte signing key at startup', () => {
    const config = {
      get: vi.fn().mockReturnValue('a'.repeat(32)),
    } as unknown as ConfigService;
    expect(
      () => new TicketTokenService({} as PrismaService, config),
    ).not.toThrow();
  });
});
