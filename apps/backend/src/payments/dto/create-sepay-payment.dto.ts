import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateSepayPaymentDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Booking to pay. Amount, currency, customer, and payment state are resolved server-side.',
  })
  @IsUUID('4')
  bookingId: string;
}
