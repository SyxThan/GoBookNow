import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { VendorType } from '../../generated/prisma/client.js';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const uppercaseString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class UpdateVendorDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 150 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  displayName?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ format: 'uri', maxLength: 500 })
  @Transform(trimString)
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional({ maxLength: 200 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string | null;

  @ApiPropertyOptional({ enum: VendorType })
  @IsOptional()
  @IsEnum(VendorType)
  vendorType?: VendorType | null;

  @ApiPropertyOptional({ maxLength: 50 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxCode?: string | null;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessRegistrationNumber?: string | null;

  @ApiPropertyOptional({ maxLength: 150 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  legalRepresentativeName?: string | null;

  @ApiPropertyOptional({ format: 'email', maxLength: 320 })
  @Transform(trimString)
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  contactEmail?: string | null;

  @ApiPropertyOptional({ maxLength: 30 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string | null;

  @ApiPropertyOptional({ maxLength: 255 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine?: string | null;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ward?: string | null;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string | null;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string | null;

  @ApiPropertyOptional({ minLength: 2, maxLength: 2 })
  @Transform(uppercaseString)
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;
}
