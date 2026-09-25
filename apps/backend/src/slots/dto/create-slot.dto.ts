import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MONEY_AMOUNT_PATTERN } from '../../pricing/money.utils.js';

const ABSOLUTE_TIMESTAMP = /(?:Z|[+-]\d{2}:\d{2})$/;
const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSlotDto {
  @ApiProperty({ example: '2026-10-01T02:00:00.000Z' })
  @IsString()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(ABSOLUTE_TIMESTAMP, {
    message: 'startAt must include a UTC or numeric timezone offset',
  })
  startAt: string;

  @ApiProperty({ example: '2026-10-01T03:00:00.000Z' })
  @IsString()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(ABSOLUTE_TIMESTAMP, {
    message: 'endAt must include a UTC or numeric timezone offset',
  })
  endAt: string;

  @ApiProperty({ minimum: 1, maximum: 100_000 })
  @IsInt()
  @Min(1)
  @Max(100_000)
  capacity: number;

  @ApiPropertyOptional({
    example: '250000',
    pattern: '^\\d+$',
    maxLength: 19,
    nullable: true,
    description: 'Slot override; null or omitted inherits the Service price',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(MONEY_AMOUNT_PATTERN)
  @MaxLength(19)
  priceAmount?: string | null;
}
