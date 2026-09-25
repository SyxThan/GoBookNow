import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
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
  ValidateIf,
} from 'class-validator';
import { ServiceKind } from '../../generated/prisma/client.js';
import { MONEY_AMOUNT_PATTERN } from '../../pricing/money.utils.js';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateServiceDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({ enum: ServiceKind })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ServiceKind)
  kind?: ServiceKind;

  @ApiPropertyOptional({ minLength: 3, maxLength: 160 })
  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

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

  @ApiPropertyOptional({ example: '250000', pattern: '^\\d+$', maxLength: 19 })
  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(MONEY_AMOUNT_PATTERN)
  @MaxLength(19)
  priceAmount?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10_080, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_080)
  durationMinutes?: number | null;
}
