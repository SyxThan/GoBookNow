import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SepayIpnDto } from './dto/sepay-ipn.dto.js';
import { SepayIpnAuthGuard } from './sepay-ipn-auth.guard.js';
import {
  SepayIpnService,
  type SepayIpnAcknowledgement,
} from './sepay-ipn.service.js';

@ApiTags('Payments')
@Controller('webhooks/sepay')
export class SepayIpnController {
  constructor(private readonly sepayIpn: SepayIpnService) {}

  @Post('ipn')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SepayIpnAuthGuard)
  @ApiOperation({
    summary: 'Receive server-to-server SePay Payment Gateway IPN',
    description:
      'Public from Bearer JWT authentication. Authenticated exclusively with the configured SePay provider secret in X-Secret-Key; this is not a generic bank-account webhook.',
  })
  @ApiHeader({
    name: 'X-Secret-Key',
    required: true,
    description: 'SePay Payment Gateway IPN secret. Never a customer JWT.',
    schema: { type: 'string', writeOnly: true },
  })
  @ApiOkResponse({
    description: 'Authenticated IPN was processed or safely acknowledged.',
    schema: { example: { success: true } },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid IPN secret.' })
  @ApiBadRequestResponse({ description: 'Structurally invalid IPN payload.' })
  receive(@Body() dto: SepayIpnDto): Promise<SepayIpnAcknowledgement> {
    return this.sepayIpn.process(dto);
  }
}
