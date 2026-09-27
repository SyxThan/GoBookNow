import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RoleCode } from '../auth/constants/role.constants.js';
import { CurrentUserDecorator } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { CurrentUser } from '../auth/types/jwt-payload.type.js';
import { SWAGGER_ACCESS_TOKEN_SECURITY } from '../swagger.js';
import { CreateSepayPaymentDto } from './dto/create-sepay-payment.dto.js';
import { SepayPaymentResponseDto } from './dto/sepay-payment-response.dto.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('Payments')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.CUSTOMER)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('sepay')
  @ApiOperation({
    summary: 'Initiate SePay checkout for a Booking hold',
    description:
      'Returns a signed HTML form contract. Create a form with method POST, action paymentUrl, and one hidden input per formFields entry, then submit it. Do not navigate to paymentUrl with GET.',
  })
  @ApiCreatedResponse({
    type: SepayPaymentResponseDto,
    description:
      'A new or reusable pending SePay attempt and its signed POST form.',
  })
  @ApiUnauthorizedResponse({ description: 'Bearer access token is missing.' })
  @ApiForbiddenResponse({
    description: 'Booking belongs to another customer or role is not CUSTOMER.',
  })
  @ApiNotFoundResponse({ description: 'Booking was not found.' })
  @ApiConflictResponse({
    description: 'Booking, hold, Payment, amount, or currency is not payable.',
  })
  initiateSepay(
    @CurrentUserDecorator() user: CurrentUser,
    @Body() dto: CreateSepayPaymentDto,
  ): Promise<SepayPaymentResponseDto> {
    return this.payments.initiateSepay(user.id, dto.bookingId);
  }
}
