import type { Ticket } from '../generated/prisma/client.js';
import type { TicketTokenService } from './ticket-token.service.js';
import QRCode from 'qrcode';
import { TicketQrService } from './ticket-qr.service.js';

vi.mock('qrcode', () => ({
  default: { toBuffer: vi.fn() },
}));

const qrBuffer = Buffer.from('png-bytes');

function setup(token = 'test-opaque-token') {
  const generateToken = vi.fn().mockReturnValue(token);
  const ticketTokens = { generateToken } as unknown as TicketTokenService;
  const toBuffer = vi.mocked(QRCode.toBuffer);
  toBuffer.mockResolvedValue(qrBuffer);
  return {
    service: new TicketQrService(ticketTokens),
    generateToken,
    toBuffer,
  };
}

describe('TicketQrService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('encodes exactly the opaque credential with scanner-friendly options', async () => {
    const ticket = {
      id: 'ticket-a',
      tokenNonce: 'nonce-a',
      tokenVersion: 1,
    } as Pick<Ticket, 'id' | 'tokenNonce' | 'tokenVersion'>;
    const { service, generateToken, toBuffer } = setup();

    await expect(service.generatePng(ticket)).resolves.toBe(qrBuffer);
    expect(generateToken).toHaveBeenCalledWith(ticket);
    expect(toBuffer).toHaveBeenCalledWith('test-opaque-token', {
      type: 'png',
      errorCorrectionLevel: 'Q',
      margin: 2,
      width: 512,
    });
  });

  it('never concatenates Ticket or customer PII into the QR payload', async () => {
    const ticketWithRelations = {
      id: 'ticket-a',
      tokenNonce: 'nonce-a',
      tokenVersion: 1,
      ticketCode: 'GBT-PRIVATE-CODE',
      bookingItem: {
        booking: {
          customer: {
            email: 'customer@example.com',
            phone: '0900000000',
            name: 'Private Customer',
          },
        },
      },
    } as unknown as Pick<Ticket, 'id' | 'tokenNonce' | 'tokenVersion'>;
    const { service, toBuffer } = setup('opaque-only');

    await service.generatePng(ticketWithRelations);
    expect(toBuffer.mock.calls[0]?.[0]).toBe('opaque-only');
  });

  it('uses the same credential on repeated read-only generation', async () => {
    const ticket = {
      id: 'ticket-a',
      tokenNonce: 'stable-nonce',
      tokenVersion: 1,
    } as Pick<Ticket, 'id' | 'tokenNonce' | 'tokenVersion'>;
    const original = structuredClone(ticket);
    const { service, generateToken, toBuffer } = setup('stable-token');

    await service.generatePng(ticket);
    await service.generatePng(ticket);
    expect(generateToken).toHaveBeenCalledTimes(2);
    expect(toBuffer.mock.calls.map(([payload]) => payload)).toEqual([
      'stable-token',
      'stable-token',
    ]);
    expect(ticket).toEqual(original);
  });

  it('passes different Ticket credentials through without transformation', async () => {
    const generateToken = vi
      .fn()
      .mockReturnValueOnce('opaque-ticket-a')
      .mockReturnValueOnce('opaque-ticket-b');
    const toBuffer = vi.mocked(QRCode.toBuffer).mockResolvedValue(qrBuffer);
    const service = new TicketQrService({
      generateToken,
    } as unknown as TicketTokenService);

    await service.generatePng({ id: 'a', tokenNonce: 'a', tokenVersion: 1 });
    await service.generatePng({ id: 'b', tokenNonce: 'b', tokenVersion: 1 });
    expect(toBuffer.mock.calls.map(([payload]) => payload)).toEqual([
      'opaque-ticket-a',
      'opaque-ticket-b',
    ]);
  });

  it('rejects an unexpectedly large credential without invoking the encoder', async () => {
    const { service, toBuffer } = setup('x'.repeat(513));
    await expect(
      service.generatePng({ id: 'a', tokenNonce: 'a', tokenVersion: 1 }),
    ).rejects.toThrow('Ticket credential cannot be rendered as QR');
    expect(toBuffer).not.toHaveBeenCalled();
  });

  it('converts encoder failures into a safe QR generation error', async () => {
    const { service, toBuffer } = setup();
    toBuffer.mockRejectedValueOnce(new Error('low-level encoder failure'));
    await expect(
      service.generatePng({ id: 'a', tokenNonce: 'a', tokenVersion: 1 }),
    ).rejects.toThrow('Could not generate Ticket QR');
  });
});
