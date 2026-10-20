import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt() @Min(1) @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @Transform(trim) @IsOptional() @IsString() @MaxLength(2000)
  comment?: string;
}

export class UpdateReviewDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(5)
  rating?: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @Transform(trim) @IsOptional() @IsString() @MaxLength(2000)
  comment?: string;
}

export class ReviewResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() bookingId!: string;
  @ApiProperty() rating!: number;
  @ApiPropertyOptional({ nullable: true }) comment!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class ReviewEligibilityDto {
  @ApiProperty() eligible!: boolean;
  @ApiProperty({ enum: ['ELIGIBLE', 'REVIEW_BOOKING_NOT_COMPLETED', 'REVIEW_BOOKING_CANCELLED', 'REVIEW_ALREADY_EXISTS'] })
  reason!: string;
  @ApiPropertyOptional({ nullable: true }) reviewId!: string | null;
  @ApiProperty() reviewDeleted!: boolean;
}
