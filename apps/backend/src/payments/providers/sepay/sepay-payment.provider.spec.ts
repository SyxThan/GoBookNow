import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { SepayPaymentProvider } from './sepay-payment.provider.js';

const sdk = vi.hoisted(() => ({
  construct: vi.fn(),
  initCheckoutUrl: vi.fn(),
  initOneTimePaymentFields: vi.fn(),
}));

vi.mock('sepay-pg-node', () => ({
  SePayPgClient: class MockSePayPgClient {
    checkout = {
      initCheckoutUrl: sdk.initCheckoutUrl,
      initOneTimePaymentFields: sdk.initOneTimePaymentFields,
    };

    constructor(clientConfig: unknown) {
      sdk.construct(clientConfig);
    }
  },
}));

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

const checkoutInput = {
  merchantReference: 'GBKABCDEF1234567890',
  amount: 300_000n,
  currency: 'VND',
  description: 'GoBook payment GBK-20260927-ABC12345',
  customerId: '22222222-2222-4222-8222-222222222222',
};

describe('SepayPaymentProvider', () => {
  beforeEach(() => {
    sdk.construct.mockReset();
    sdk.initCheckoutUrl
      .mockReset()
      .mockReturnValue('https://pay-sandbox.sepay.vn/v1/checkout/init');
    sdk.initOneTimePaymentFields.mockReset().mockReturnValue({
      merchant: 'merchant-test',
      operation: 'PURCHASE',
      payment_method: 'BANK_TRANSFER',
      order_invoice_number: checkoutInput.merchantReference,
      order_amount: 300_000,
      currency: 'VND',
      signature: 'signed-value',
    });
  });

  it('uses the official SDK for a sandbox PURCHASE bank transfer form', async () => {
    const provider = new SepayPaymentProvider(
      config({
        SEPAY_ENV: 'sandbox',
        SEPAY_MERCHANT_ID: 'merchant-test',
        SEPAY_SECRET_KEY: 'test-secret',
        SEPAY_SUCCESS_URL: 'https://example.test/payment/success',
      }),
    );

    const result = await provider.createCheckout(checkoutInput);

    expect(sdk.construct).toHaveBeenCalledWith({
      env: 'sandbox',
      merchant_id: 'merchant-test',
      secret_key: 'test-secret',
    });
    expect(sdk.initOneTimePaymentFields).toHaveBeenCalledWith({
      operation: 'PURCHASE',
      payment_method: 'BANK_TRANSFER',
      order_invoice_number: checkoutInput.merchantReference,
      order_amount: 300_000,
      currency: 'VND',
      order_description: checkoutInput.description,
      customer_id: checkoutInput.customerId,
      success_url: 'https://example.test/payment/success',
    });
    expect(result).toEqual({
      paymentUrl: 'https://pay-sandbox.sepay.vn/v1/checkout/init',
      method: 'POST',
      formFields: {
        merchant: 'merchant-test',
        operation: 'PURCHASE',
        payment_method: 'BANK_TRANSFER',
        order_invoice_number: checkoutInput.merchantReference,
        order_amount: '300000',
        currency: 'VND',
        signature: 'signed-value',
      },
    });
  });

  it('defaults to sandbox and allows omitted callback URLs', async () => {
    const provider = new SepayPaymentProvider(
      config({
        SEPAY_MERCHANT_ID: 'merchant-test',
        SEPAY_SECRET_KEY: 'test-secret',
      }),
    );
    const result = await provider.createCheckout(checkoutInput);
    expect(result.paymentUrl).toBe(
      'https://pay-sandbox.sepay.vn/v1/checkout/init',
    );
  });

  it('supports the production environment when explicitly configured', async () => {
    sdk.initCheckoutUrl.mockReturnValue(
      'https://pay.sepay.vn/v1/checkout/init',
    );
    const provider = new SepayPaymentProvider(
      config({
        SEPAY_ENV: 'production',
        SEPAY_MERCHANT_ID: 'merchant-production',
        SEPAY_SECRET_KEY: 'production-secret-placeholder',
      }),
    );

    const result = await provider.createCheckout(checkoutInput);

    expect(sdk.construct).toHaveBeenCalledWith({
      env: 'production',
      merchant_id: 'merchant-production',
      secret_key: 'production-secret-placeholder',
    });
    expect(result.paymentUrl).toBe('https://pay.sepay.vn/v1/checkout/init');
  });

  it.each([
    { SEPAY_MERCHANT_ID: '', SEPAY_SECRET_KEY: 'secret' },
    { SEPAY_MERCHANT_ID: 'merchant', SEPAY_SECRET_KEY: '' },
    {
      SEPAY_ENV: 'invalid',
      SEPAY_MERCHANT_ID: 'merchant',
      SEPAY_SECRET_KEY: 'secret',
    },
  ])('sanitizes invalid provider configuration', async (values) => {
    const provider = new SepayPaymentProvider(config(values));
    await expect(
      provider.createCheckout(checkoutInput),
    ).rejects.toMatchObject<ServiceUnavailableException>({
      status: 503,
      response: {
        code: 'SEPAY_UNAVAILABLE',
        message: 'Payment provider is temporarily unavailable.',
      },
    });
  });

  it('rejects a bigint that cannot be converted to a safe SDK number', async () => {
    const provider = new SepayPaymentProvider(
      config({
        SEPAY_MERCHANT_ID: 'merchant-test',
        SEPAY_SECRET_KEY: 'test-secret',
      }),
    );

    await expect(
      provider.createCheckout({
        ...checkoutInput,
        amount: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('sanitizes SDK failures without exposing provider details', async () => {
    sdk.initOneTimePaymentFields.mockImplementation(() => {
      throw new Error('internal signing detail TEST_SECRET');
    });
    const provider = new SepayPaymentProvider(
      config({
        SEPAY_MERCHANT_ID: 'merchant-test',
        SEPAY_SECRET_KEY: 'TEST_SECRET',
      }),
    );

    const error = await provider
      .createCheckout(checkoutInput)
      .catch((cause) => cause as ServiceUnavailableException);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    if (!(error instanceof ServiceUnavailableException)) {
      throw new Error('Expected a sanitized provider exception');
    }
    expect(error).toMatchObject({
      status: 503,
      response: {
        code: 'SEPAY_UNAVAILABLE',
        message: 'Payment provider is temporarily unavailable.',
      },
    });
    expect(JSON.stringify(error.getResponse())).not.toContain('TEST_SECRET');
    expect(JSON.stringify(error.getResponse())).not.toContain(
      'internal signing detail',
    );
  });
});
