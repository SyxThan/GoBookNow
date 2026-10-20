import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  OmitType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { VoucherType } from '../../generated/prisma/client.js';
import { CreateBookingHoldItemDto } from '../../bookings/dto/create-booking-hold.dto.js';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';

const normalizeCode = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const MONEY = /^(0|[1-9][0-9]{0,17})$/;

export class CreateVoucherDto {
  @ApiProperty({ example: 'SALE20' })
  @Transform(normalizeCode)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,31}$/)
  code: string;

  @ApiProperty({ enum: VoucherType })
  @IsEnum(VoucherType)
  type: VoucherType;

  @ApiPropertyOptional({ example: '50000', nullable: true })
  @IsOptional()
  @Matches(MONEY)
  fixedAmount?: string | null;

  @ApiPropertyOptional({ example: 2000, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  percentageBps?: number | null;

  @ApiProperty({ example: '300000' })
  @Matches(MONEY)
  minOrderAmount: string;

  @ApiPropertyOptional({ example: '60000', nullable: true })
  @IsOptional()
  @Matches(MONEY)
  maxDiscountAmount?: string | null;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  @Matches(/(?:Z|[+-][0-9]{2}:[0-9]{2})$/)
  validFrom: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  @Matches(/(?:Z|[+-][0-9]{2}:[0-9]{2})$/)
  validUntil: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVoucherDto extends PartialType(
  OmitType(CreateVoucherDto, ['code'] as const),
) {}

export class ValidateVoucherDto {
  @ApiProperty({ example: 'SALE20' })
  @Transform(normalizeCode)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,31}$/)
  code: string;

  @ApiProperty({ type: [CreateBookingHoldItemDto] })
  @ValidateNested({ each: true })
  @Type(() => CreateBookingHoldItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  items: CreateBookingHoldItemDto[];
}
