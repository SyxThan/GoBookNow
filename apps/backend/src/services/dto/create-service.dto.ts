import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ServiceKind } from '../../generated/prisma/client.js';
import { MONEY_AMOUNT_PATTERN } from '../../pricing/money.utils.js';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateServiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  categoryId: string;

  @ApiProperty({ enum: ServiceKind })
  @IsEnum(ServiceKind)
  kind: ServiceKind;

  @ApiProperty({ minLength: 3, maxLength: 160 })
  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  summary?: string | null;

  @ApiPropertyOptional({ maxLength: 10_000, nullable: true })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @ApiPropertyOptional({ format: 'uri', maxLength: 500, nullable: true })
  @Transform(trimString)
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  thumbnailUrl?: string | null;

  @ApiProperty({ example: '250000', pattern: '^\\d+$', maxLength: 19 })
  @Transform(trimString)
  @IsString()
  @Matches(MONEY_AMOUNT_PATTERN)
  @MaxLength(19)
  priceAmount: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10_080, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_080)
  durationMinutes?: number | null;
}
