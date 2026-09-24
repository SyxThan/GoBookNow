import { ApiProperty } from '@nestjs/swagger';

export class AccessTokenResponseDto {
  @ApiProperty({ description: 'Short-lived JWT access token' })
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({
    description: 'Access-token lifetime in seconds',
    example: 900,
  })
  expiresIn: number;
}

export class AuthUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email', example: 'customer@example.com' })
  email: string;

  @ApiProperty({ type: String, nullable: true, example: 'Nguyen Van A' })
  fullName: string | null;

  @ApiProperty({ type: [String], example: ['CUSTOMER'] })
  roles: string[];
}

export class AuthResponseDto extends AccessTokenResponseDto {
  @ApiProperty({ type: AuthUserResponseDto })
  user: AuthUserResponseDto;
}

export class UserProfileResponseDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  fullName: string;

  @ApiProperty({ type: String, nullable: true, example: '+84901234567' })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uri' })
  avatarUrl: string | null;

  @ApiProperty({ example: 'vi-VN' })
  locale: string;

  @ApiProperty({ example: 'Asia/Ho_Chi_Minh' })
  timezone: string;
}

export class CurrentUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email', example: 'customer@example.com' })
  email: string;

  @ApiProperty({ type: UserProfileResponseDto, nullable: true })
  profile: UserProfileResponseDto | null;

  @ApiProperty({ type: [String], example: ['CUSTOMER'] })
  roles: string[];
}
