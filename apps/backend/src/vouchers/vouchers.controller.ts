import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '../auth/constants/role.constants.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { SWAGGER_ACCESS_TOKEN_SECURITY } from '../swagger.js';
import { BookingsService } from '../bookings/bookings.service.js';
import {
  CreateVoucherDto,
  UpdateVoucherDto,
  ValidateVoucherDto,
} from './dto/voucher.dto.js';
import { VouchersService } from './vouchers.service.js';

@ApiTags('Admin Vouchers')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('admin/vouchers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class AdminVouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  @Post()
  create(@Body() dto: CreateVoucherDto) {
    return this.vouchers.create(dto);
  }

  @Get()
  list() {
    return this.vouchers.list();
  }

  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.vouchers.detail(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateVoucherDto,
  ) {
    return this.vouchers.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  deactivate(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.vouchers.deactivate(id);
  }
}

@ApiTags('Vouchers')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('vouchers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.CUSTOMER)
export class CustomerVouchersController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('validate')
  @HttpCode(200)
  validate(@Body() dto: ValidateVoucherDto) {
    return this.bookings.quoteVoucher(dto);
  }
}
