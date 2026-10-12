import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import type { TicketTokenService } from './ticket-token.service.js';
import { TicketQrService } from './ticket-qr.service.js';

describe('Ticket QR encoded content', () => {
  it('decodes to exactly the opaque credential and contains no appended PII', async () => {
    const credential = 'opaque-test-ticket-credential';
    const tokenService = {
      generateToken: vi.fn().mockReturnValue(credential),
    } as unknown as TicketTokenService;
    const service = new TicketQrService(tokenService);

    const png = await service.generatePng({
      id: '550e8400-e29b-41d4-a716-446655440000',
      tokenNonce: 'opaque-nonce',
      tokenVersion: 1,
    });
    const image = PNG.sync.read(png);
    const decoded = jsQR(
      new Uint8ClampedArray(image.data),
      image.width,
      image.height,
    );

    expect(decoded?.data).toBe(credential);
    expect(decoded?.data).not.toMatch(
      /customer@example|0900000000|customerName|bookingId|ticketCode/,
    );
  });
});
