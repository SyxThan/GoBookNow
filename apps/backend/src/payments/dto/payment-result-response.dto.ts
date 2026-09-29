import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus, PaymentStatus } from '../../generated/prisma/client.js';

export class PaymentResultBookingDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: BookingStatus })
  status: BookingStatus;
}

export class PaymentResultResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: PaymentStatus })
  status: PaymentStatus;

  @ApiProperty({ example: '250000', description: 'Integer money string.' })
  amount: string;

  @ApiProperty({ example: 'VND' })
  currency: string;

  @ApiProperty({ type: PaymentResultBookingDto })
  booking: PaymentResultBookingDto;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Booking hold expiry used by the payment result UI.',
  })
  expiresAt: string | null;
}
