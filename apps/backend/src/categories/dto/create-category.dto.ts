import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CategoryScope } from '../../generated/prisma/client.js';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const uppercaseString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateCategoryDto {
  @ApiProperty({ example: 'SPA_BEAUTY', maxLength: 50 })
  @Transform(uppercaseString)
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/)
  code: string;

  @ApiProperty({ example: 'Spa & Beauty', minLength: 2, maxLength: 120 })
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ enum: CategoryScope })
  @IsEnum(CategoryScope)
  scope: CategoryScope;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string | null;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
