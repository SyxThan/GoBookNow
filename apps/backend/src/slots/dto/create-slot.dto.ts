import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsString, Matches, Max, Min } from 'class-validator';

const ABSOLUTE_TIMESTAMP = /(?:Z|[+-]\d{2}:\d{2})$/;

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
}
