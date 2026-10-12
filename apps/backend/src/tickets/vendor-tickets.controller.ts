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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
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
import {
  CheckInTicketDto,
  TicketCheckInResultDto,
} from './dto/ticket-check-in.dto.js';
import {
  TicketValidationResultDto,
  ValidateTicketDto,
} from './dto/ticket-validation.dto.js';
import { TicketCheckInService } from './ticket-check-in.service.js';
import { TicketValidationService } from './ticket-validation.service.js';

@ApiTags('Vendor Tickets')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('vendor/tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.VENDOR)
export class VendorTicketsController {
  constructor(
    private readonly validation: TicketValidationService,
    private readonly checkIns: TicketCheckInService,
  ) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate an opaque Ticket credential without checking it in',
  })
  @ApiOkResponse({
    type: TicketValidationResultDto,
    description:
      'A completed validation decision. Invalid or unusable Tickets are normal HTTP 200 results.',
    examples: {
      valid: {
        summary: 'Eligible now',
        value: {
          authentic: true,
          valid: true,
          checkInEligible: true,
          reason: 'VALID',
        },
      },
      invalidToken: {
        summary: 'Malformed or tampered credential',
        value: {
          authentic: false,
          valid: false,
          checkInEligible: false,
          reason: 'INVALID_TOKEN',
        },
      },
      alreadyCheckedIn: {
        summary: 'Authentic Ticket that was already redeemed',
        value: {
          authentic: true,
          valid: true,
          checkInEligible: false,
          reason: 'ALREADY_CHECKED_IN',
        },
      },
      voided: {
        summary: 'Authentic but voided Ticket',
        value: {
          authentic: true,
          valid: false,
          checkInEligible: false,
          reason: 'TICKET_VOIDED',
        },
      },
      expired: {
        summary: 'Ticket for an elapsed Slot',
        value: {
          authentic: true,
          valid: false,
          checkInEligible: false,
          reason: 'SLOT_EXPIRED',
        },
      },
      notStarted: {
        summary: 'Authentic Ticket whose Slot is in the future',
        value: {
          authentic: true,
          valid: true,
          checkInEligible: false,
          reason: 'SLOT_NOT_STARTED',
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Request body validation failed.' })
  @ApiUnauthorizedResponse({ description: 'Bearer JWT is missing or expired.' })
  @ApiForbiddenResponse({
    description:
      'VENDOR role, an approved Vendor profile, and Ticket ownership are required.',
  })
  validate(
    @CurrentUserDecorator() user: CurrentUser,
    @Body() dto: ValidateTicketDto,
  ): Promise<TicketValidationResultDto> {
    return this.validation.validateTokenForVendor({
      token: dto.token,
      actorUserId: user.id,
    });
  }

  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Atomically check in an eligible opaque Ticket credential',
    description:
      'Revalidates the authoritative Ticket, Booking, Vendor, and Slot state under a database row lock. The actor and timestamp come from the JWT and database, never the request body.',
  })
  @ApiOkResponse({
    type: TicketCheckInResultDto,
    description: 'The first successful ISSUED to CHECKED_IN transition.',
  })
  @ApiBadRequestResponse({
    description: 'Request validation failed or the credential is invalid.',
  })
  @ApiConflictResponse({
    description:
      'ALREADY_CHECKED_IN, TICKET_VOIDED, SLOT_NOT_STARTED, SLOT_EXPIRED, or another authoritative eligibility conflict.',
  })
  @ApiUnauthorizedResponse({ description: 'Bearer JWT is missing or expired.' })
  @ApiForbiddenResponse({
    description:
      'VENDOR role, an approved Vendor profile, and Ticket ownership are required.',
  })
  checkIn(
    @CurrentUserDecorator() user: CurrentUser,
    @Body() dto: CheckInTicketDto,
  ): Promise<TicketCheckInResultDto> {
    return this.checkIns.checkIn({
      token: dto.token,
      actorUserId: user.id,
    });
  }
}
