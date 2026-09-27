import { ApiProperty } from '@nestjs/swagger';
import {
  PaymentAttemptStatus,
  PaymentProvider,
} from '../../generated/prisma/client.js';

export class SepayPaymentResponseDto {
  @ApiProperty({ format: 'uuid' })
  paymentId: string;

  @ApiProperty({ format: 'uuid' })
  attemptId: string;

  @ApiProperty({ enum: PaymentProvider, example: PaymentProvider.SEPAY })
  provider: PaymentProvider;

  @ApiProperty({
    enum: PaymentAttemptStatus,
    example: PaymentAttemptStatus.PENDING,
  })
  status: PaymentAttemptStatus;

  @ApiProperty({ example: '300000', description: 'Integer money string.' })
  amount: string;

  @ApiProperty({ example: 'VND' })
  currency: string;

  @ApiProperty({ example: 'GBK8F2K91AB12CD34EF' })
  merchantReference: string;

  @ApiProperty({
    example: 'https://pay-sandbox.sepay.vn/v1/checkout/init',
    description:
      'HTML form action. This URL must receive formFields via POST; it is not a GET redirect URL.',
  })
  paymentUrl: string;

  @ApiProperty({ enum: ['POST'], example: 'POST' })
  method: 'POST';

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Signed SePay checkout fields. Submit every entry as a hidden HTML form input.',
  })
  formFields: Record<string, string>;

  @ApiProperty({ example: '2026-09-27T09:10:00.000Z' })
  expiresAt: string;
}
