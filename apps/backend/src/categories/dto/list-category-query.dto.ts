import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CategoryScope } from '../../generated/prisma/client.js';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const parseBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class ListPublicCategoriesDto {
  @ApiPropertyOptional({ enum: CategoryScope })
  @IsOptional()
  @IsEnum(CategoryScope)
  scope?: CategoryScope;

  @ApiPropertyOptional({ maxLength: 120 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class ListAdminCategoriesDto extends ListPublicCategoriesDto {
  @ApiPropertyOptional({ type: Boolean })
  @Transform(parseBoolean)
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
