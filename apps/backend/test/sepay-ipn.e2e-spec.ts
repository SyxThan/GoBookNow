import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { SepayIpnAuthGuard } from '../src/payments/sepay-ipn-auth.guard.js';
import { SepayIpnController } from '../src/payments/sepay-ipn.controller.js';
import { SepayIpnService } from '../src/payments/sepay-ipn.service.js';

const IPN_SECRET = 'synthetic-e2e-ipn-secret';

function validPayload() {
  return {
    timestamp: 1_757_058_220,
    notification_type: 'ORDER_PAID',
    order: {
      id: 'provider-order-id',
      order_id: 'provider-order-code',
      order_status: 'CAPTURED',
      order_currency: 'VND',
      order_amount: '250000.00',
      order_invoice_number: 'GBKABCDEF1234567890',
      custom_data: [],
    },
    transaction: {
      id: 'provider-transaction-row-id',
      payment_method: 'BANK_TRANSFER',
      transaction_id: 'SEPAY-TXN-001',
      transaction_type: 'PAYMENT',
      transaction_status: 'APPROVED',
      transaction_amount: '250000',
      transaction_currency: 'VND',
      card_number: null,
    },
    customer: null,
    agreement: null,
  };
}

describe('SePay Payment Gateway IPN authentication (e2e)', () => {
  let app: INestApplication;
  const processIpn = vi.fn().mockResolvedValue({ success: true });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ SEPAY_IPN_SECRET: IPN_SECRET })],
        }),
      ],
      controllers: [SepayIpnController],
      providers: [
        SepayIpnAuthGuard,
        { provide: SepayIpnService, useValue: { process: processIpn } },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(() => vi.clearAllMocks());

  afterAll(async () => app.close());

  const send = (secret?: string, body: object = validPayload()) => {
    const pending = request(app.getHttpServer())
      .post('/api/v1/webhooks/sepay/ipn')
      .send(body);
    return secret === undefined ? pending : pending.set('X-Secret-Key', secret);
  };

  it('rejects a missing X-Secret-Key', () => send().expect(401));

  it('rejects a wrong X-Secret-Key without echoing it', async () => {
    const wrongSecret = 'do-not-echo-this-secret';
    const response = await send(wrongSecret).expect(401);
    expect(JSON.stringify(response.body)).not.toContain(wrongSecret);
    expect(processIpn).not.toHaveBeenCalled();
  });

  it('accepts the correct provider secret without requiring Bearer JWT', async () => {
    const response = await send(IPN_SECRET).expect(200);
    expect(response.body).toEqual({ success: true });
    expect(processIpn).toHaveBeenCalledOnce();
  });

  it('returns 400 for a structurally invalid authenticated payload', async () => {
    await send(IPN_SECRET, {
      ...validPayload(),
      transaction: { transaction_id: 'SEPAY-TXN-001' },
    }).expect(400);
    expect(processIpn).not.toHaveBeenCalled();
  });
});
