import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { RoleCode } from '../auth/constants/role.constants.js';
import { CurrentUserDecorator } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { CurrentUser } from '../auth/types/jwt-payload.type.js';
import { SWAGGER_ACCESS_TOKEN_SECURITY } from '../swagger.js';
import { CustomerTicketListResponseDto } from './dto/customer-ticket-response.dto.js';
import { TicketQrService } from './ticket-qr.service.js';
import { TicketService } from './ticket.service.js';

@ApiTags('Tickets')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.CUSTOMER)
export class TicketsController {
  constructor(
    private readonly tickets: TicketService,
    private readonly ticketQr: TicketQrService,
  ) {}

  @Get('bookings/:bookingId/tickets')
  @ApiOperation({ summary: 'List safe Ticket metadata for a Customer Booking' })
  @ApiOkResponse({ type: CustomerTicketListResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or expired.',
  })
  @ApiForbiddenResponse({ description: 'Booking belongs to another Customer.' })
  @ApiNotFoundResponse({ description: 'Booking was not found.' })
  listForBooking(
    @CurrentUserDecorator() user: CurrentUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<CustomerTicketListResponseDto> {
    return this.tickets.getCustomerTicketsForBooking(user.id, bookingId);
  }

  @Get('tickets/:ticketId/qr')
  @ApiOperation({
    summary: 'Render the authenticated Customer Ticket credential as PNG QR',
  })
  @ApiProduces('image/png')
  @ApiOkResponse({
    description: 'PNG containing only the opaque Ticket credential.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or expired.',
  })
  @ApiForbiddenResponse({ description: 'Ticket belongs to another Customer.' })
  @ApiNotFoundResponse({ description: 'Ticket was not found.' })
  @ApiConflictResponse({
    description: 'Ticket is voided or its Booking is not confirmed.',
  })
  async qr(
    @CurrentUserDecorator() user: CurrentUser,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Query('download', new DefaultValuePipe(false), ParseBoolPipe)
    download: boolean,
    @Res() response: Response,
  ): Promise<void> {
    const ticket = await this.tickets.getCustomerTicketForQr(user.id, ticketId);
    const png = await this.ticketQr.generatePng(ticket);
    const filename = `gobook-ticket-${this.safeCode(ticket.ticketCode)}.png`;

    response
      .set({
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Content-Length': String(png.length),
        'Content-Type': 'image/png',
        Pragma: 'no-cache',
      })
      .send(png);
  }

  private safeCode(ticketCode: string): string {
    return ticketCode
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 40);
  }
}
