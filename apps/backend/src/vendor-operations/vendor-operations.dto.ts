import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class VendorPeriodQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive ISO-8601 instant (UTC or explicit offset)' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ description: 'Exclusive ISO-8601 instant (UTC or explicit offset)' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class VendorBookingsQueryDto extends VendorPeriodQueryDto {
  @ApiPropertyOptional({ enum: ['ALL', 'UPCOMING', 'COMPLETED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['ALL', 'UPCOMING', 'COMPLETED', 'CANCELLED'])
  status?: 'ALL' | 'UPCOMING' | 'COMPLETED' | 'CANCELLED';

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  serviceId?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sort?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
