import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateBookingItemDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Slot selected by the customer. Service, Vendor, currency, and price are resolved server-side.',
  })
  @IsUUID('4')
  slotId: string;

  @ApiProperty({ minimum: 1, maximum: 100_000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity: number;
}

export class CreateBookingDto {
  @ApiProperty({
    type: [CreateBookingItemDto],
    minItems: 1,
    description:
      'Authoritative create request. Do not accept customerId, vendorId, serviceId, price, totals, currency, or status from clients.',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateBookingItemDto)
  @ArrayMinSize(1)
  items: CreateBookingItemDto[];
}
