import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '../auth/constants/role.constants.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { SWAGGER_ACCESS_TOKEN_SECURITY } from '../swagger.js';
import { AdminTransactionsService } from './admin-transactions.service.js';
import { AdminTransactionFiltersDto, AdminTransactionsQueryDto } from './dto/admin-transactions-query.dto.js';

@ApiTags('Admin Transactions')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
@Controller('admin/transactions')
export class AdminTransactionsController {
  constructor(private readonly transactions: AdminTransactionsService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated read-only Payment investigation list; date filters use Payment.createdAt' })
  @ApiOkResponse({ description: 'Payments with Booking, latest Attempt and Refund state' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  list(@Query() query: AdminTransactionsQueryDto) {
    return this.transactions.list(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Aggregate Payment and Refund statuses for the same filters as the list' })
  @ApiOkResponse({ description: 'Counts and decimal-string VND amounts' })
  summary(@Query() filters: AdminTransactionFiltersDto) {
    return this.transactions.summary(filters);
  }

  @Get(':paymentId')
  @ApiOperation({ summary: 'Payment detail, Attempts, Refunds, and timestamped timeline' })
  @ApiOkResponse({ description: 'Read-only transaction detail' })
  @ApiNotFoundResponse({ description: 'Payment not found' })
  detail(@Param('paymentId', new ParseUUIDPipe({ version: '4' })) paymentId: string) {
    return this.transactions.detail(paymentId);
  }
}
